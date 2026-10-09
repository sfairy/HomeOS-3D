"""地震预警核心服务（对齐 ``earthquake/service.ts``）。

维护 WolfX WebSocket 接入、运行时配置缓存、跨源去重、阈值评估与预警分发：

 - 通过 :class:`WolfxWsClient` 接收实时 EEW 报文，指数退避自动重连；
 - 通过 :class:`EewPollService` 主动拉取 SC EEW / CENC 台网 / USGS（兜底）；
 - 配置来源：优先项目 layout（``earthquakeConfig``），回退 HA ``/api/config`` 坐标；
 - 去重：内存 + Redis 双写，跨源指纹（时空相近）抑制重复预警；
 - 状态持久化：最新预警、历史、dismissed、去重状态写入 Redis；历史同时写 SQLite；
 - 多实例：仅 EEW Leader 实例维护 WolfX 连接与主动轮询，避免重复预警。
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

from .eew_diagnostics import EewDiagnosticsBuffer
from .eew_eval import evaluate_eew_for_alert
from .feeds import is_valid_home_coordinate, is_wolfx_cancelled, parse_wolfx_message
from .geo import (
    compute_s_wave_countdown,
    haversine_distance_km,
    is_eew_simulation_event_id,
    normalize_eew_countdown_lead,
)
from .state import (
    append_alert_history_prisma,
    clear_dedupe_state_redis,
    clear_latest_alert_redis,
    delete_simulation_history_prisma,
    delete_simulation_history_redis,
    is_event_dismissed_redis,
    is_simulation_alert_record,
    is_wolfx_cluster_active,
    load_alert_history_prisma,
    load_alert_history_redis,
    load_dedupe_state_redis,
    load_latest_alert_redis,
    mark_event_dismissed_redis,
    parse_earthquake_layout,
    save_dedupe_state_redis,
    save_latest_alert_redis,
    touch_wolfx_leader_active,
)
from .threshold import evaluate_local_quake_thresholds
from .types import (
    EEW_EVENTS,
    EarthquakeAlertPayload,
    EarthquakeRuntimeConfig,
    EewDedupeState,
    EewEventFingerprint,
    EewRawMessage,
)
from .wolfx_ws import WolfxWsClient
from ..ha_config import load_active_ha_endpoints
from ..security.layout import load_active_project_layout

logger = logging.getLogger("homeos.earthquake")

#: 本地去重状态清除延迟，与 Redis 侧 TTL（DEDUPE_TTL_SEC=120s）对齐
DEDUPE_CLEAR_DELAY_MS = 120_000
LATEST_ALERT_TTL_MS = 5 * 60 * 1000
CONFIG_CACHE_MS = 5_000
#: SYSTEM_CONFIG_UPDATED / layout.config.updated 事件名
SYSTEM_CONFIG_UPDATED_EVENT = "SYSTEM_CONFIG_UPDATED"
LAYOUT_CONFIG_UPDATED_EVENT = "layout.config.updated"


def _now_ms() -> float:
    return time.time() * 1000


class EarthquakeService:
    """地震预警核心服务：EEW 接入 / 去重 / 阈值评估 / 分发。"""

    def __init__(
        self,
        *,
        event_bus: Any,
        redis: Any,
        session_factory: Any,
        leader: Any,
        jobs: Any = None,
        get_ha_rest_config: Any = None,
        cipher: Any = None,
    ) -> None:
        self._bus = event_bus
        self._redis = redis
        self._session_factory = session_factory
        self._leader = leader
        self._jobs = jobs
        #: 可选的 HA 端点解析回调（走主/备故障转移选择器，返回 ``{haUrl, token}``）
        self._get_ha_rest_config = get_ha_rest_config
        #: 凭证解密器：兜底路径要直接读连接记录，必须能解开密文令牌。
        self._cipher = cipher
        self._destroyed = False

        self._active_event_id = ""
        self._last_event_time = 0.0
        self._last_magnitude = 0.0
        self._dedupe_clear_handle: asyncio.TimerHandle | None = None

        self._latest_alert_payload: EarthquakeAlertPayload | None = None
        self._latest_alert_time = 0.0
        self._dismissed_event_ids: set[str] = set()

        self._runtime = EarthquakeRuntimeConfig()
        self._config_loaded_at = 0.0
        self._eew_config_status_key = ""
        self._process_chain: asyncio.Task[None] | None = None
        self._diagnostics = EewDiagnosticsBuffer()
        self._recent_fingerprints: list[EewEventFingerprint] = []
        self._wolfx_disconnected_since = _now_ms()

        self._wolfx = WolfxWsClient(
            on_message=self.handle_message,
            touch_leader_active=self._touch_leader_active,
            can_connect=self._can_connect,
        )

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        if self._bus is not None:
            self._bus.on(SYSTEM_CONFIG_UPDATED_EVENT, self._on_system_config_updated)
            self._bus.on(LAYOUT_CONFIG_UPDATED_EVENT, self._on_layout_config_updated)
        if self._leader is not None:
            self._leader.set_callbacks(
                on_leader=self.sync_wolfx_connection,
                on_follower=lambda: self._spawn(self._wolfx.disconnect()),
            )
        # 启动预算内完成运行时配置加载；layout 无坐标时的 HA 探测若超时，
        # 转后台补充，避免局域网不可达时把启动关键路径拖满 HTTP 超时。
        try:
            await asyncio.wait_for(self.ensure_runtime_config(force=True), timeout=2.5)
        except TimeoutError:
            logger.info("HA 坐标探测超出启动预算，转为后台补充")
            self._spawn(self.ensure_runtime_config(force=True))
        if (
            self._runtime.enabled
            and self._leader is not None
            and self._leader.is_eew_leader()
            and not self._wolfx.is_connected()
        ):
            self.sync_wolfx_connection()

    async def stop(self) -> None:
        self._destroyed = True
        if self._dedupe_clear_handle is not None:
            self._dedupe_clear_handle.cancel()
            self._dedupe_clear_handle = None
        self._wolfx.mark_destroyed()
        await self._wolfx.disconnect()

    def _can_connect(self) -> bool:
        return (
            not self._destroyed
            and self._leader is not None
            and self._leader.is_eew_leader()
            and self._runtime.enabled
        )

    def _on_system_config_updated(self, _payload: Any = None) -> None:
        self._config_loaded_at = 0.0
        self._spawn(self.ensure_runtime_config(force=True))

    def _on_layout_config_updated(self, _payload: Any = None) -> None:
        self._config_loaded_at = 0.0
        self._spawn(self.ensure_runtime_config(force=True))

    @staticmethod
    def _spawn(coro: Any) -> None:
        try:
            asyncio.get_running_loop().create_task(coro)
        except RuntimeError:
            pass

    def _touch_leader_active(self) -> Any:
        self._diagnostics.touch_wolfx_activity(True)
        self._wolfx_disconnected_since = 0
        return touch_wolfx_leader_active(self._redis)

    # ------------------------------------------------------------------ #
    # 运行时配置
    # ------------------------------------------------------------------ #
    async def ensure_runtime_config(self, force: bool = False) -> EarthquakeRuntimeConfig:
        now = _now_ms()
        prev_enabled = self._runtime.enabled
        if not force and now - self._config_loaded_at < CONFIG_CACHE_MS:
            return self._runtime

        try:
            _, layout = await asyncio.to_thread(load_active_project_layout, self._session_factory)
            nxt = parse_earthquake_layout(layout)
            if nxt.home_lat is None or nxt.home_lon is None:
                ha_coords = await self.fetch_ha_coordinates()
                if ha_coords:
                    nxt = EarthquakeRuntimeConfig(
                        enabled=nxt.enabled,
                        home_lat=ha_coords["lat"],
                        home_lon=ha_coords["lon"],
                        max_distance=nxt.max_distance,
                        min_magnitude=nxt.min_magnitude,
                        min_local_intensity=nxt.min_local_intensity,
                        countdown_lead_sec=nxt.countdown_lead_sec,
                    )

            self._runtime = nxt
            self._config_loaded_at = now

            if nxt.home_lat is not None and nxt.home_lon is not None:
                status_key = f"{nxt.home_lat},{nxt.home_lon},{1 if nxt.enabled else 0}"
            else:
                status_key = f"unset:{1 if nxt.enabled else 0}"
            if status_key != self._eew_config_status_key:
                self._eew_config_status_key = status_key
                if nxt.home_lat is not None and nxt.home_lon is not None:
                    logger.info(
                        "📍 EEW 家庭坐标: (%s, %s) %s",
                        nxt.home_lat,
                        nxt.home_lon,
                        "已启用" if nxt.enabled else "未启用",
                    )
                else:
                    logger.warning("⚠️ 未配置 EEW 家庭坐标")
        except Exception as exc:
            logger.error("加载 EEW 配置失败: %s", exc)

        if prev_enabled != self._runtime.enabled:
            self.sync_wolfx_connection()

        return self._runtime

    def get_runtime_config(self) -> EarthquakeRuntimeConfig:
        return EarthquakeRuntimeConfig(
            enabled=self._runtime.enabled,
            home_lat=self._runtime.home_lat,
            home_lon=self._runtime.home_lon,
            max_distance=self._runtime.max_distance,
            min_magnitude=self._runtime.min_magnitude,
            min_local_intensity=self._runtime.min_local_intensity,
            countdown_lead_sec=self._runtime.countdown_lead_sec,
        )

    def get_home_coordinates(self) -> dict[str, float | None]:
        return {"lat": self._runtime.home_lat, "lon": self._runtime.home_lon}

    def sync_wolfx_connection(self) -> None:
        if self._destroyed:
            return
        if not self._runtime.enabled:
            self._spawn(self._wolfx.disconnect())
            if not self._wolfx_disconnected_since:
                self._wolfx_disconnected_since = _now_ms()
            return
        if self._leader is not None and self._leader.is_eew_leader():
            was_connected = self._wolfx.is_connected()
            self._spawn(self._wolfx.connect())
            if not was_connected and not self._wolfx.is_connected() and not self._wolfx_disconnected_since:
                self._wolfx_disconnected_since = _now_ms()

    # ------------------------------------------------------------------ #
    # HA 坐标
    # ------------------------------------------------------------------ #
    async def resolve_ha_credentials(self) -> dict[str, str]:
        # 优先走故障转移选择器：HA 已在局域网失败后切外网时，EEW 坐标抓取也要打到当前 active 地址
        if self._get_ha_rest_config is not None:
            try:
                resolved = self._get_ha_rest_config()
                if asyncio.iscoroutine(resolved):
                    resolved = await resolved
                ha_url = str((resolved or {}).get("haUrl") or "").strip()
                token = str((resolved or {}).get("token") or "").strip()
                if ha_url and token:
                    return {"haUrl": ha_url.rstrip("/"), "token": token}
            except Exception as exc:
                logger.error("读取 HA 配置失败: %s", exc)
        # 兜底与其余旁路消费者共用同一解析：单源 ha_connections 表（无记录时环境变量引导）。
        try:
            endpoints = await asyncio.to_thread(self._load_ha_endpoints)
        except Exception as exc:
            logger.error("读取 HA 连接记录失败: %s", exc)
            endpoints = None
        if endpoints is None:
            return {"haUrl": "", "token": ""}
        return {
            "haUrl": endpoints.ha_url_primary.rstrip("/"),
            "token": endpoints.token,
        }

    def _load_ha_endpoints(self):
        """在自有 session 里解析 HA 端点（跟随连接器当前活跃地址）。"""
        with self._session_factory() as database:
            return load_active_ha_endpoints(database, cipher=self._cipher)

    async def fetch_ha_coordinates(self) -> dict[str, float] | None:
        credentials = await self.resolve_ha_credentials()
        ha_url = credentials.get("haUrl")
        token = credentials.get("token")
        if not ha_url or not token:
            return None
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{ha_url}/api/config",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                )
                response.raise_for_status()
                data = response.json()
            if isinstance(data, dict) and data.get("latitude") is not None and data.get("longitude") is not None:
                return {"lat": float(data["latitude"]), "lon": float(data["longitude"])}
        except Exception as exc:
            logger.error("获取 HA 坐标失败: %s", exc)
        return None

    async def get_ha_coordinates_only(self) -> dict[str, float | None]:
        await self.ensure_runtime_config()
        coords = self.get_home_coordinates()
        if is_valid_home_coordinate(coords["lat"], coords["lon"]):
            return {"latitude": coords["lat"], "longitude": coords["lon"]}
        ha_coords = await self.fetch_ha_coordinates()
        if ha_coords and is_valid_home_coordinate(ha_coords["lat"], ha_coords["lon"]):
            return {"latitude": ha_coords["lat"], "longitude": ha_coords["lon"]}
        return {"latitude": None, "longitude": None}

    # ------------------------------------------------------------------ #
    # Wolfx 报文入口
    # ------------------------------------------------------------------ #
    async def handle_message(self, msg: dict[str, Any]) -> None:
        type_ = str(msg.get("type") or "").lower()
        if type_ == "heartbeat":
            try:
                await self._wolfx.send_ping()
            except Exception as exc:
                logger.warning("Wolfx 心跳 ping 失败: %s", exc)
            return
        if type_ == "pong":
            return

        event_id = str(msg.get("eventId") or msg.get("event_id") or msg.get("EventID") or "").strip()
        if event_id and is_wolfx_cancelled(msg):
            logger.info("[取消报] 忽略并关闭 eventId=%s", event_id)
            await self.acknowledge_alert(event_id)
            return

        eew = parse_wolfx_message(msg)
        if eew is None:
            return

        logger.info(
            "🌊 收到 EEW: eventId=%s M%s (%s,%s) 震中=%s",
            eew.event_id,
            eew.magnitude,
            eew.latitude,
            eew.longitude,
            eew.epicenter,
        )
        self._diagnostics.touch_wolfx_activity(True)
        self._wolfx_disconnected_since = 0
        self.enqueue_process_eew(eew)

    def ingest_eew(self, eew: EewRawMessage) -> None:
        """HTTP 轮询入口：将拉取到的报文送入同一处理链（与 Wolfx WS 共用）。"""
        self.enqueue_process_eew(eew)

    def record_source_poll(self, source_id: str, result: dict[str, Any]) -> None:
        self._diagnostics.record_poll(source_id, result)

    def enqueue_process_eew(
        self, eew: EewRawMessage, opts: dict[str, Any] | None = None
    ) -> None:
        prev = self._process_chain

        async def _run() -> None:
            if prev is not None:
                try:
                    await prev
                except Exception:
                    pass
            try:
                await self.process_eew(eew, opts)
            except Exception as exc:
                logger.warning("处理 EEW 失败: %s", exc)

        try:
            self._process_chain = asyncio.get_running_loop().create_task(_run())
        except RuntimeError:
            self._process_chain = None

    async def process_eew(
        self, eew: EewRawMessage, opts: dict[str, Any] | None = None
    ) -> None:
        opts = opts or {}
        cfg = await self.ensure_runtime_config()
        if not cfg.enabled and not opts.get("skipEnabledCheck"):
            return

        source_label = eew.source or eew.type or "unknown"

        if eew.event_id in self._dismissed_event_ids:
            logger.info("[已关闭] 忽略 eventId=%s", eew.event_id)
            self._diagnostics.record_filter(
                {"source": source_label, "reason": "事件已关闭", "eventId": eew.event_id}
            )
            return
        if await is_event_dismissed_redis(self._redis, eew.event_id):
            self._dismissed_event_ids.add(eew.event_id)
            logger.info("[已关闭/Redis] 忽略 eventId=%s", eew.event_id)
            self._diagnostics.record_filter(
                {"source": source_label, "reason": "事件已关闭(Redis)", "eventId": eew.event_id}
            )
            return

        dedupe = await self._load_dedupe_state()
        eval_result = evaluate_eew_for_alert(eew, cfg, dedupe)
        kind = eval_result.get("kind")

        if kind == "skip":
            message = str(eval_result.get("message") or "")
            self._diagnostics.record_filter(
                {"source": source_label, "reason": message, "eventId": eew.event_id}
            )
            if message.startswith("⚠️"):
                logger.warning("%s", message)
            else:
                logger.info("%s", message)
            return

        if kind == "suppress_duplicate":
            await self._update_dedupe_state(eval_result["nextDedupe"])
            message = str(eval_result.get("message") or "")
            self._diagnostics.record_filter(
                {"source": source_label, "reason": message, "eventId": eew.event_id}
            )
            logger.info("%s", message)
            return

        for line in str(eval_result.get("message") or "").split("\n"):
            if line:
                logger.info("%s", line)

        await self._update_dedupe_state(eval_result["nextDedupe"])

        alert_payload: EarthquakeAlertPayload = eval_result["alert"]
        is_confirmation = alert_payload.alertKind == "confirmation"
        logger.info(
            "%s: %s M%s | %skm | %ss | 来源=%s",
            "📢 确认通报" if is_confirmation else "🚨 地震预警",
            eew.epicenter,
            eew.magnitude,
            alert_payload.distance,
            alert_payload.countdown,
            alert_payload.source or "?",
        )

        self._latest_alert_payload = alert_payload
        self._latest_alert_time = _now_ms()
        try:
            await save_latest_alert_redis(self._redis, alert_payload)
        except Exception as exc:
            logger.warning("[EEW] Redis 写入失败,降级为内存缓存: %s", exc)
        try:
            await asyncio.to_thread(
                append_alert_history_prisma, self._session_factory, alert_payload
            )
        except Exception as exc:
            logger.warning("EEW 历史写入数据库失败: %s", exc)

        if is_confirmation:
            # 确认通报：仅通知，不全屏推送
            await self._emit(EEW_EVENTS["CONFIRMATION"], alert_payload)
        else:
            await self._emit(EEW_EVENTS["ALERT"], alert_payload)

    async def _emit(self, event: str, payload: EarthquakeAlertPayload) -> None:
        if self._bus is None:
            return
        try:
            await self._bus.emit(event, payload.to_dict())
        except Exception as exc:
            logger.warning("EEW 领域事件广播失败 [%s]: %s", event, exc)

    # ------------------------------------------------------------------ #
    # 去重状态
    # ------------------------------------------------------------------ #
    async def _load_dedupe_state(self) -> EewDedupeState:
        if self._redis is not None and self._redis.is_ready():
            try:
                remote = await load_dedupe_state_redis(self._redis)
                if remote is not None:
                    self._active_event_id = remote.activeEventId
                    self._last_magnitude = remote.lastMagnitude
                    self._last_event_time = _now_ms()
                    if remote.recent:
                        self._recent_fingerprints = remote.recent
                    return EewDedupeState(
                        activeEventId=remote.activeEventId,
                        lastMagnitude=remote.lastMagnitude,
                        recent=remote.recent or self._recent_fingerprints,
                    )
            except Exception as exc:
                logger.warning("EEW 去重状态 Redis 读取失败,降级内存: %s", exc)
        return EewDedupeState(
            activeEventId=self._active_event_id,
            lastMagnitude=self._last_magnitude,
            recent=self._recent_fingerprints,
        )

    async def _update_dedupe_state(self, state: EewDedupeState) -> None:
        self._active_event_id = state.activeEventId
        self._last_magnitude = state.lastMagnitude
        self._last_event_time = _now_ms()
        if state.recent:
            self._recent_fingerprints = state.recent
        self._reset_dedupe_clear_timer()
        if self._redis is None or not self._redis.is_ready():
            return
        try:
            await save_dedupe_state_redis(
                self._redis,
                EewDedupeState(
                    activeEventId=state.activeEventId,
                    lastMagnitude=state.lastMagnitude,
                    recent=state.recent or self._recent_fingerprints,
                ),
            )
        except Exception as exc:
            logger.warning("EEW 去重状态 Redis 写入失败,降级内存: %s", exc)

    def _reset_dedupe_clear_timer(self) -> None:
        if self._dedupe_clear_handle is not None:
            self._dedupe_clear_handle.cancel()
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._dedupe_clear_handle = loop.call_later(
            DEDUPE_CLEAR_DELAY_MS / 1000, self._clear_dedupe_state
        )

    def _clear_dedupe_state(self) -> None:
        logger.info("[去重] 已清除 activeEventId=%s", self._active_event_id)
        self._dedupe_clear_handle = None
        self._active_event_id = ""
        self._last_event_time = 0.0
        self._last_magnitude = 0.0

    # ------------------------------------------------------------------ #
    # 模拟演练
    # ------------------------------------------------------------------ #
    async def try_fire_simulated_alert(self) -> dict[str, Any]:
        await self.ensure_runtime_config(force=True)
        home_lat = self._runtime.home_lat
        home_lon = self._runtime.home_lon
        if not is_valid_home_coordinate(home_lat, home_lon):
            return {"ok": False, "message": "未配置有效的家庭坐标，无法触发模拟演练"}

        now = _now_ms()
        assert home_lat is not None and home_lon is not None
        lat = home_lat + 0.15
        lon = home_lon + 0.15
        distance = haversine_distance_km(home_lat, home_lon, lat, lon)
        travel_time_sec = distance / 3.4
        lead_sec = normalize_eew_countdown_lead(self._runtime.countdown_lead_sec)
        initial_countdown_sec = lead_sec
        origin_time = now - (travel_time_sec - initial_countdown_sec) * 1000

        await self.process_eew(
            EewRawMessage(
                type="eew",
                source="test",
                event_id=f"test_{int(now)}",
                report_id=1,
                origin_time=origin_time,
                latitude=lat,
                longitude=lon,
                magnitude=6.0,
                depth=10,
                epicenter="本地周边地震模拟测试",
                max_intensity="7",
            ),
            {"skipEnabledCheck": True},
        )
        return {"ok": True}

    # ------------------------------------------------------------------ #
    # 最新预警 / 关闭 / 历史
    # ------------------------------------------------------------------ #
    def get_latest_alert(self) -> dict[str, Any] | None:
        if self._latest_alert_payload is None:
            return None
        return self._latest_alert_payload.to_dict()

    async def resolve_latest_alert(self) -> dict[str, Any]:
        redis_stored = await load_latest_alert_redis(self._redis)
        if redis_stored:
            payload = redis_stored.get("payload") or {}
            event_id = payload.get("eventId")
            if await is_event_dismissed_redis(self._redis, event_id) or (
                event_id in self._dismissed_event_ids
            ):
                return {"isActive": False, "payload": None}
            age = _now_ms() - float(redis_stored.get("savedAt") or 0)
            is_active = age < LATEST_ALERT_TTL_MS
            return {"isActive": is_active, "payload": payload if is_active else None}

        if self._latest_alert_payload is None:
            return {"isActive": False, "payload": None}
        event_id = self._latest_alert_payload.eventId
        if event_id and (
            event_id in self._dismissed_event_ids
            or await is_event_dismissed_redis(self._redis, event_id)
        ):
            return {"isActive": False, "payload": None}
        age = _now_ms() - self._latest_alert_time
        is_active = age < LATEST_ALERT_TTL_MS
        return {
            "isActive": is_active,
            "payload": self._latest_alert_payload.to_dict() if is_active else None,
        }

    async def acknowledge_alert(self, event_id: str) -> dict[str, Any]:
        normalized = str(event_id or "").strip()
        if not normalized:
            return {"success": False, "message": "缺少 eventId"}
        self._dismissed_event_ids.add(normalized)
        await mark_event_dismissed_redis(self._redis, normalized)
        await clear_latest_alert_redis(self._redis, normalized)
        if self._latest_alert_payload is not None and self._latest_alert_payload.eventId == normalized:
            self._latest_alert_payload = None
            self._latest_alert_time = 0.0
        if self._active_event_id == normalized:
            self._active_event_id = ""
            self._last_event_time = 0.0
            self._last_magnitude = 0.0
        await clear_dedupe_state_redis(self._redis, normalized)
        return {"success": True}

    async def record_catalog_local_alert(self, item: dict[str, Any]) -> bool:
        """将通过本地阈值的 CENC 目录事件写入「本地预警」历史（确认通报，不全屏）。"""
        cfg = await self.ensure_runtime_config()
        if not cfg.enabled or cfg.home_lat is None or cfg.home_lon is None:
            return False

        event_id = str(item.get("id") or "").strip()
        if not event_id:
            return False

        gate = evaluate_local_quake_thresholds(
            {
                "magnitude": item.get("magnitude"),
                "latitude": item.get("latitude"),
                "longitude": item.get("longitude"),
                "distanceKm": item.get("distanceKm"),
                "depthKm": item.get("depth"),
            },
            {
                "minMagnitude": cfg.min_magnitude,
                "maxDistanceKm": cfg.max_distance,
                "minLocalIntensity": cfg.min_local_intensity,
                "homeLat": cfg.home_lat,
                "homeLon": cfg.home_lon,
            },
        )
        if not gate["pass"]:
            self._diagnostics.record_filter(
                {"source": "cenc", "reason": f"目录震情未达阈值：{gate['reason']}", "eventId": event_id}
            )
            return False

        try:
            existing = await asyncio.to_thread(self._find_catalog_history, event_id)
            if existing:
                return False
        except Exception as exc:
            logger.warning("目录震情去重查询失败,继续写入: %s", exc)

        distance = round(gate["distanceKm"] * 10) / 10
        countdown = round(
            compute_s_wave_countdown(distance, float(item.get("originTime") or 0), _now_ms()) * 10
        ) / 10
        intensity = item.get("intensity")
        payload = EarthquakeAlertPayload(
            eventId=event_id,
            latitude=float(item.get("latitude") or 0),
            longitude=float(item.get("longitude") or 0),
            originTime=float(item.get("originTime") or 0),
            magnitude=float(item.get("magnitude") or 0),
            depth=float(item.get("depth") or 0),
            epicenter=str(item.get("place") or "未知震中"),
            distance=distance,
            countdown=countdown,
            localIntensity=gate["localIntensity"],
            maxIntensity=str(intensity) if intensity is not None else None,
            alertKind="confirmation",
            source="cenc",
        )

        try:
            await asyncio.to_thread(
                append_alert_history_prisma, self._session_factory, payload
            )
        except Exception as exc:
            logger.warning("目录震情写入本地预警失败: %s", exc)
            return False

        # 推送确认通报：前端以平静公报弹层展示（不全屏）
        await self._emit(EEW_EVENTS["CONFIRMATION"], payload)

        # 不写入 EEW 跨源去重指纹，避免目录先到时抑制后续真正的早期预警
        logger.info(
            "📢 目录震情记入本地预警: %s M%s | %skm | 烈度 %s",
            payload.epicenter,
            payload.magnitude,
            distance,
            payload.localIntensity,
        )
        return True

    def _find_catalog_history(self, event_id: str) -> bool:
        from sqlalchemy import select as _select

        from ...core.models import EarthquakeAlertHistory

        with self._session_factory() as session:
            row = session.execute(
                _select(EarthquakeAlertHistory.id).where(
                    EarthquakeAlertHistory.event_id == event_id
                )
            ).scalar_one_or_none()
            return row is not None

    async def get_alert_history(self, limit: int = 30) -> dict[str, Any]:
        try:
            pg_items = await asyncio.to_thread(
                load_alert_history_prisma, self._session_factory, limit
            )
            if pg_items:
                return {"items": pg_items, "total": len(pg_items), "source": "postgres"}
        except Exception as exc:
            logger.warning("EEW 历史读取数据库失败,回退 Redis: %s", exc)
        rows = await load_alert_history_redis(self._redis, limit)
        items = [
            {**(row.get("payload") or {}), "savedAt": row.get("savedAt")}
            for row in rows
            if isinstance(row.get("payload"), dict)
        ]
        return {"items": items, "total": len(items), "source": "redis"}

    async def delete_simulation_history(self, event_id: str | None = None) -> dict[str, int]:
        target_id = str(event_id or "").strip()
        if target_id and not is_eew_simulation_event_id(target_id):
            return {"deleted": 0}

        pg_deleted = 0
        redis_deleted = 0
        try:
            pg_deleted = await asyncio.to_thread(
                delete_simulation_history_prisma,
                self._session_factory,
                target_id or None,
            )
        except Exception as exc:
            logger.warning("删除演练历史(DB)失败: %s", exc)
        try:
            redis_deleted = await delete_simulation_history_redis(self._redis, target_id or None)
        except Exception as exc:
            logger.warning("删除演练历史(Redis)失败: %s", exc)
        deleted = max(pg_deleted, redis_deleted)

        clear_ids: list[str] = []
        if target_id:
            clear_ids = [target_id]
        else:
            if self._latest_alert_payload is not None and is_simulation_alert_record(
                self._latest_alert_payload.to_dict()
            ):
                clear_ids.append(self._latest_alert_payload.eventId)
            if self._active_event_id and is_eew_simulation_event_id(self._active_event_id):
                clear_ids.append(self._active_event_id)

        for cid in dict.fromkeys([cid for cid in clear_ids if cid]):
            await clear_latest_alert_redis(self._redis, cid)
            await clear_dedupe_state_redis(self._redis, cid)
            self._dismissed_event_ids.discard(cid)
            if self._latest_alert_payload is not None and self._latest_alert_payload.eventId == cid:
                self._latest_alert_payload = None
                self._latest_alert_time = 0.0
            if self._active_event_id == cid:
                self._active_event_id = ""
                self._last_event_time = 0.0
                self._last_magnitude = 0.0

        if (
            not target_id
            and self._latest_alert_payload is not None
            and is_simulation_alert_record(self._latest_alert_payload.to_dict())
        ):
            self._latest_alert_payload = None
            self._latest_alert_time = 0.0

        return {"deleted": deleted}

    # ------------------------------------------------------------------ #
    # 状态 / 诊断
    # ------------------------------------------------------------------ #
    def should_use_usgs_backup(self, down_for_ms: int) -> bool:
        if self._wolfx.is_connected():
            self._wolfx_disconnected_since = 0
            return False
        if not self._wolfx_disconnected_since:
            self._wolfx_disconnected_since = _now_ms()
        return _now_ms() - self._wolfx_disconnected_since >= down_for_ms

    def get_diagnostics_snapshot(self) -> dict[str, Any]:
        wolfx_connected = self._wolfx.is_connected()
        if not wolfx_connected and not self._wolfx_disconnected_since:
            self._wolfx_disconnected_since = _now_ms()
        if wolfx_connected:
            self._wolfx_disconnected_since = 0
        self._diagnostics.sync_wolfx_from_connection(self._wolfx.get_connection_status())
        is_leader = bool(self._leader is not None and self._leader.is_eew_leader())
        return self._diagnostics.snapshot(
            {
                "wolfxConnected": wolfx_connected,
                "scActive": self._runtime.enabled and is_leader,
                "cencActive": self._runtime.enabled and is_leader,
                "usgsActive": self._runtime.enabled
                and is_leader
                and self.should_use_usgs_backup(60_000),
            }
        )

    def get_active_event_id(self) -> str:
        return self._active_event_id

    def is_connected(self) -> bool:
        return self._wolfx.is_connected()

    def get_connection_status(self) -> dict[str, Any]:
        return self._wolfx.get_connection_status()

    def get_leader_status(self) -> dict[str, Any]:
        if self._leader is None:
            return {"isLeader": False, "mode": "standalone"}
        return self._leader.get_status()

    async def get_cluster_connection_status(self) -> dict[str, Any]:
        local = self.get_connection_status()
        leader = self.get_leader_status()
        cluster_active = (
            bool(local.get("connected"))
            if leader.get("isLeader")
            else await is_wolfx_cluster_active(self._redis)
        )
        return {
            **local,
            "isLeader": bool(leader.get("isLeader")),
            "mode": leader.get("mode"),
            "clusterConnected": cluster_active,
        }


__all__ = ["EarthquakeService"]
