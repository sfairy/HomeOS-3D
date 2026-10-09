"""智能顾问设备用量统计与遗忘检测（对齐 ``smart-advisor-usage.helper`` + ``advisor-usage.service``）。

职责：
- 订阅 HA 冷批状态变更，跟踪设备开关次数与运行时长并持久化到 ``DeviceUsageStat``；
- 基于房间设备映射检测「灯关了但空调/媒体还开着」的遗忘场景（06:00–23:00）；
- 暴露使用报告 / 单设备统计 / 使用汇总 / 遗忘设备 / 清除统计等查询入口；
- 宿主服务负责定时（15 分钟）检测与多副本分布式锁串行化。
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select

from .voice_alerts import (
    apply_alert_template,
    match_custom_entity_alert,
    match_entity_tts_alert,
    resolve_voice_alert_rules,
)
from ..app_config.room_meta import (
    align_env_sensor_map_to_ha_areas,
    is_room_hidden_in_map,
    list_visible_env_sensor_map_room_ids,
)
from ..rooms import DEFAULT_ROOM_CATALOG, entity_matches_env_room
from ..security.config import load_home_timezone
from ...core.background import spawn_background
from ...core.entity_domain import get_entity_domain
from ...core.models import DeviceUsageStat
from ...core.zoned_time import zoned_date_parts

logger = logging.getLogger("homeos.awareness.advisor_usage")

#: 遗忘检测分布式锁键（与 HEAD SmartAdvisorService 保持一致）
FORGOTTEN_LOCK_KEY = "smart-advisor-check-forgotten"

#: 参与用量统计 / 遗忘检测的实体域
_USAGE_DOMAINS = ("light", "climate", "media_player")

#: 视为「开启」的状态集合
_ON_STATES = frozenset({"on", "home", "playing"})
#: 视为「关闭」的状态集合
_OFF_STATES = frozenset({"off", "idle", "standby", "paused"})


def local_date_key(moment: datetime | None = None, timezone_name: str | None = None) -> str:
    """家庭时区下的日期键 ``YYYY-MM-DD``（对齐 ``localDateKey`` 语义）。

    使用统计按「家里的自然日」分桶：容器时区通常是 UTC，直接用本机日期会让
    08:00（东八区）前后的统计落到错误的一天，7 天窗口也会整体偏移。
    """
    value = moment or datetime.now(UTC)
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    tz = _resolve_tz(timezone_name)
    local = value.astimezone(tz) if tz is not None else value.astimezone()
    return f"{local.year:04d}-{local.month:02d}-{local.day:02d}"


def _resolve_tz(timezone_name: str | None):
    from zoneinfo import ZoneInfo

    name = str(timezone_name or "").strip()
    if not name:
        return None
    try:
        return ZoneInfo(name)
    except Exception:
        return None


def _iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


class SmartAdvisorUsageHelper:
    """设备使用统计与遗忘检测 helper。"""

    def __init__(self, deps: dict[str, Any]) -> None:
        self._deps = deps
        #: 设备使用统计（entity_id → {onCount, lastOn, totalRuntime}）
        self.device_usage: dict[str, dict[str, Any]] = {}
        #: 房间 → 设备 ID 列表（用于「忘了关...」检测）
        self.room_device_map: dict[str, list[str]] = {}
        #: 家庭时区缓存（状态变更热路径，避免每条事件都读一次配置）
        self._tz_cache_at = 0.0
        self._tz_cache_value: str | None = None

    # ------------------------------------------------------------------ #
    # 家庭时区
    # ------------------------------------------------------------------ #
    def _timezone(self) -> str | None:
        """家庭时区（``ops.homeTimezone``），带 60s 缓存。"""
        now = time.monotonic()
        if self._tz_cache_at and now - self._tz_cache_at < 60.0:
            return self._tz_cache_value
        try:
            session_factory = self._deps["session_factory"]
            with session_factory() as session:
                self._tz_cache_value = load_home_timezone(session)
        except Exception:
            self._tz_cache_value = None
        self._tz_cache_at = now
        return self._tz_cache_value

    def _local_day(self, days_ago: int = 0) -> str:
        return local_date_key(datetime.now(UTC) - timedelta(days=days_ago), self._timezone())

    def _local_hour(self) -> int:
        return int(zoned_date_parts(datetime.now(UTC), self._timezone())["hour"])

    # ------------------------------------------------------------------ #
    # 房间设备映射
    # ------------------------------------------------------------------ #
    def register_room_devices(self, room: str, entity_ids: list[str]) -> None:
        self.room_device_map[room] = list(entity_ids)

    def _ha_areas(self) -> Any:
        getter = self._deps.get("ha_areas")
        if not callable(getter):
            return []
        try:
            return getter() or []
        except Exception:
            return []

    async def build_room_device_map_from_config(self) -> bool:
        """按 envSensorMap 拉取 light / climate / media_player 并按房间注册。

        房间口径与设置页一致：只保留 HA area_id 主键，忽略默认目录残留 slug。

        注意：``fetch_all_states`` 在 HA 不可达 / 状态未就绪时会**静默返回空列表**
        （见 ``ha_rest.fetch_all_states`` 的 ``except httpx.HTTPError: return []``），
        因此空结果必须与「配置了房间但没匹配到设备」区分开，且**不能**借此清空既有映射。

        :returns: 是否建成了非空的房间设备映射。
        """
        app_config = self._deps["app_config"]
        sensor_map = align_env_sensor_map_to_ha_areas(
            app_config.get("envSensorMap") or {}, self._ha_areas()
        )
        rooms = list_visible_env_sensor_map_room_ids(sensor_map)
        if not rooms:
            return False

        try:
            ha_connector = self._deps["ha_connector"]
            lights, climates, media = await asyncio.gather(
                ha_connector.fetch_entities_by_domain("light"),
                ha_connector.fetch_entities_by_domain("climate"),
                ha_connector.fetch_entities_by_domain("media_player"),
            )
            entities = [*lights, *climates, *media]
            if not entities:
                # 启动 / 重载 / 关闭窗口内 HA 尚未连上属正常现象，用 INFO 避免误报；
                # 仅当 HA 已连接却仍取不到实体时才是真正异常，需要 WARN 暴露。
                connected = bool(getattr(ha_connector, "is_connected", lambda: False)())
                if connected:
                    logger.warning(
                        "房间设备映射未建立:HA已连接但未取到任何 light/climate/media_player 实体,"
                        "保留现有映射并等待HA连接事件或定时任务重建"
                    )
                else:
                    logger.info("房间设备映射暂缓:HA未连接,待HA连接后重建(保留现有映射)")
                return False

            built: dict[str, list[str]] = {}
            for room in rooms:
                if is_room_hidden_in_map(sensor_map, room):
                    continue
                ids = [
                    str(e.get("entity_id"))
                    for e in entities
                    if self._entity_belongs_to_room(e, room, sensor_map)
                ]
                if ids:
                    built[room] = ids

            # 整体替换：避免「先清空、再中途失败」把可用映射打坏
            self.room_device_map = built
            if built:
                logger.info("房间设备映射已建立: %s 个房间", len(built))
                return True
            logger.warning(
                "房间设备映射为空:%s 个房间均未匹配到任何设备"
                "(检查 HA 区域归属与实体命名是否含房间标识),遗忘设备检测将不生效",
                len(rooms),
            )
            return False
        except Exception as exc:
            logger.warning("建立房间设备映射失败: %s", exc)
            return False

    @staticmethod
    def _entity_belongs_to_room(
        entity: dict[str, Any], room: str, sensor_map: dict[str, Any]
    ) -> bool:
        """HA area_id 精确归属优先，再回退名称/关键词模糊匹配。"""
        attrs = entity.get("attributes") or {}
        entity_area = str(attrs.get("area_id") or "").strip()
        entry = sensor_map.get(room) or {}
        bound_area = str(entry.get("haAreaId") or entry.get("ha_area_id") or room).strip()
        if entity_area and bound_area and entity_area == bound_area:
            return True
        if entity_area and entity_area == room:
            return True
        return entity_matches_env_room(
            str(entity.get("entity_id") or ""),
            str(attrs.get("friendly_name") or ""),
            str(entity_area or attrs.get("area_name") or ""),
            room,
            sensor_map,
        )

    async def build_entity_state_map(self) -> dict[str, dict[str, Any]]:
        """构建 light / climate / media_player 实体状态映射（HA 优先，回退 StateStore）。"""
        out: dict[str, dict[str, Any]] = {}
        ha_connector = self._deps["ha_connector"]
        for domain in _USAGE_DOMAINS:
            for entity in await ha_connector.fetch_entities_by_domain(domain):
                out[str(entity.get("entity_id"))] = {
                    "state": entity.get("state"),
                    "attributes": entity.get("attributes"),
                }
        if not out:
            state_store = self._deps.get("state_store")
            if state_store is not None:
                for entity in state_store.get_all():
                    domain = get_entity_domain(str(entity.get("entity_id") or ""))
                    if domain not in _USAGE_DOMAINS:
                        continue
                    out[str(entity.get("entity_id"))] = {
                        "state": entity.get("state"),
                        "attributes": entity.get("attributes"),
                    }
        return out

    # ------------------------------------------------------------------ #
    # 遗忘检测
    # ------------------------------------------------------------------ #
    def detect_forgotten_devices(
        self, entities: dict[str, dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """检测遗忘设备：房间灯全关但空调/媒体仍运行（仅 06:00–23:00）。"""
        forgotten: list[dict[str, Any]] = []
        # 遗忘提醒只在家庭当地 06:00–23:00 生效：容器 UTC 下直接取本机小时会
        # 让提醒在家人睡觉时弹出、白天却静默。
        hour = self._local_hour()
        if hour < 6 or hour > 23:
            return forgotten

        room_label = self._deps["room_label"]
        for room, device_ids in self.room_device_map.items():
            room_lights = [i for i in device_ids if i.startswith("light.")]
            room_climate = [i for i in device_ids if i.startswith("climate.")]
            room_media = [i for i in device_ids if i.startswith("media_player.")]

            lights_off = bool(room_lights) and all(
                (entities.get(i) or {}).get("state") == "off" for i in room_lights
            )
            if not lights_off:
                continue
            for climate_id in room_climate:
                entity = entities.get(climate_id)
                if entity and entity.get("state") in ("heat", "cool", "heat_cool"):
                    name = self._friendly_name(entity, climate_id)
                    forgotten.append(
                        {
                            "entityId": climate_id,
                            "friendlyName": name,
                            "reason": f"{room_label(room)}的灯已关，但空调还开着",
                        }
                    )
            for media_id in room_media:
                entity = entities.get(media_id)
                if entity and entity.get("state") in ("playing", "on"):
                    name = self._friendly_name(entity, media_id)
                    forgotten.append(
                        {
                            "entityId": media_id,
                            "friendlyName": name,
                            "reason": f"{room_label(room)}的灯已关，但媒体设备还在播放",
                        }
                    )
        return forgotten

    @staticmethod
    def _friendly_name(entity: dict[str, Any], fallback: str) -> str:
        attrs = entity.get("attributes") or {}
        return str(attrs.get("friendly_name") or fallback)

    async def get_forgotten_devices(self) -> list[dict[str, Any]]:
        entities = await self.build_entity_state_map()
        return self.detect_forgotten_devices(entities)

    async def check_forgotten_on_leave(self) -> None:
        try:
            forgotten = await self.get_forgotten_devices()
            push_tip = self._deps["push_tip"]
            for item in forgotten:
                push_tip(f"可能忘了关：{item['friendlyName']}", item["reason"], "comfort")
        except Exception as exc:
            logger.warning("离家遗忘设备检测失败: %s", exc)

    async def check_forgotten_cron(self) -> None:
        try:
            forgotten = await self.get_forgotten_devices()
            push_tip = self._deps["push_tip"]
            for item in forgotten:
                push_tip(f"可能忘了关：{item['friendlyName']}", item["reason"], "comfort")
        except Exception as exc:
            logger.warning("遗忘设备检测失败: %s", exc)

    # ------------------------------------------------------------------ #
    # 状态跟踪
    # ------------------------------------------------------------------ #
    def track_usage(self, event: dict[str, Any]) -> None:
        """冷批状态变更入口（同步）：校验消费者过滤后异步处理。"""
        state_router = self._deps["state_router"]
        if not state_router.should_process("smart_advisor_usage", event):
            return
        snapshot = {
            "entity_id": event.get("entity_id"),
            "new_state": event.get("new_state") or None,
            "old_state": event.get("old_state") or None,
        }
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return
        spawn_background(self._handle_usage_and_alerts(snapshot))

    async def _handle_usage_and_alerts(self, event: dict[str, Any]) -> None:
        await self.handle_state_change(event)
        self.handle_custom_entity_alerts(event)

    def handle_custom_entity_alerts(self, event: dict[str, Any]) -> None:
        """实体级 / 自定义 TTS 规则命中后入队播报（默认配置下为空规则集）。"""
        voice_config = self._deps["voice_config"]()
        if not resolve_voice_alert_rules(voice_config).get("enabled"):
            return
        entity_id = event.get("entity_id")
        new_state_obj = event.get("new_state") or {}
        new_state = new_state_obj.get("state") if isinstance(new_state_obj, dict) else None
        if not entity_id or not new_state:
            return
        old_state_obj = event.get("old_state") or {}
        old_state = old_state_obj.get("state") if isinstance(old_state_obj, dict) else None
        attrs = new_state_obj.get("attributes") or {}
        friendly_name = str(attrs.get("friendly_name") or entity_id)

        variables = {
            "entity_id": entity_id,
            "name": friendly_name,
            "friendly_name": friendly_name,
            "state": new_state,
            "old_state": old_state or "",
        }
        queue_speak = self._deps["queue_speak"]
        for rule in self._deps["entity_tts_alerts"]():
            if not match_entity_tts_alert(str(entity_id), str(new_state), old_state, rule):
                continue
            message = apply_alert_template(rule.get("messageTemplate"), variables)
            if message:
                queue_speak(message, f"entity_tts:{rule.get('id')}:{entity_id}")
        for rule in self._deps["custom_alerts"]():
            if not match_custom_entity_alert(str(entity_id), str(new_state), old_state, rule):
                continue
            message = apply_alert_template(rule.get("messageTemplate"), variables)
            if message:
                queue_speak(message, f"custom_entity:{rule.get('id')}:{entity_id}")

    async def handle_state_change(self, event: dict[str, Any]) -> None:
        """根据状态变更累计开关次数与运行时长并持久化。"""
        entity_id = event.get("entity_id")
        new_state_obj = event.get("new_state") or {}
        new_state = new_state_obj.get("state") if isinstance(new_state_obj, dict) else None
        if not entity_id or not new_state:
            return

        entry = self.device_usage.get(str(entity_id))
        if entry is None:
            entry = {"onCount": 0, "lastOn": 0, "totalRuntime": 0}
            self.device_usage[str(entity_id)] = entry

        day = self._local_day()
        now = datetime.now(UTC)
        now_ms = now.timestamp() * 1000

        if new_state in _ON_STATES:
            entry["onCount"] += 1
            entry["lastOn"] = now_ms
            await self.persist_usage_stat(
                str(entity_id), day, {"onCount": 1, "lastOn": now}
            )
        elif new_state in _OFF_STATES and entry["lastOn"] > 0:
            runtime_ms = now_ms - entry["lastOn"]
            entry["totalRuntime"] += runtime_ms
            entry["lastOn"] = 0
            await self.persist_usage_stat(
                str(entity_id), day, {"totalRuntimeMs": int(runtime_ms), "lastOn": None}
            )

    async def persist_usage_stat(
        self, entity_id: str, day: str, patch: dict[str, Any]
    ) -> None:
        """增量 upsert ``DeviceUsageStat``（on_count/total_runtime_ms 累加，last_on 覆盖）。"""
        session_factory = self._deps["session_factory"]

        def _write() -> None:
            try:
                with session_factory() as session:
                    row = session.execute(
                        select(DeviceUsageStat).where(
                            DeviceUsageStat.entity_id == entity_id,
                            DeviceUsageStat.day == day,
                        )
                    ).scalar_one_or_none()
                    if row is None:
                        session.add(
                            DeviceUsageStat(
                                entity_id=entity_id,
                                day=day,
                                on_count=int(patch.get("onCount") or 0),
                                total_runtime_ms=int(patch.get("totalRuntimeMs") or 0),
                                last_on=patch.get("lastOn"),
                            )
                        )
                    else:
                        if patch.get("onCount") is not None:
                            row.on_count += int(patch["onCount"])
                        if patch.get("totalRuntimeMs") is not None:
                            row.total_runtime_ms += int(patch["totalRuntimeMs"])
                        if "lastOn" in patch:
                            row.last_on = patch["lastOn"]
                        session.add(row)
                    session.commit()
            except Exception as exc:
                logger.debug("DeviceUsageStat 写入失败 [%s]: %s", entity_id, exc)

        await asyncio.get_running_loop().run_in_executor(None, _write)

    # ------------------------------------------------------------------ #
    # 查询
    # ------------------------------------------------------------------ #
    async def get_usage_report(self) -> dict[str, Any]:
        summary = await self.get_usage_summary(7)
        return {
            "topDevices": summary["topDevices"][:10],
            "totalDevices": summary["totalDevices"],
            "days": summary["days"],
        }

    async def get_entity_usage(self, entity_id: str, days: int = 7) -> dict[str, Any]:
        safe_days = min(max(int(days), 1), 90)
        since = self._local_day(safe_days)
        session_factory = self._deps["session_factory"]
        with session_factory() as session:
            rows = (
                session.execute(
                    select(DeviceUsageStat)
                    .where(
                        DeviceUsageStat.entity_id == entity_id,
                        DeviceUsageStat.day >= since,
                    )
                    .order_by(DeviceUsageStat.day.asc())
                    .limit(200)
                )
                .scalars()
                .all()
            )
        daily = [
            {
                "day": row.day,
                "onCount": int(row.on_count or 0),
                "totalRuntimeMs": int(row.total_runtime_ms or 0),
                "lastOn": _iso_utc(row.last_on),
            }
            for row in rows
        ]
        on_count = sum(item["onCount"] for item in daily)
        total_runtime_ms = sum(item["totalRuntimeMs"] for item in daily)
        avg_daily = round(on_count / len(daily)) if daily else 0
        return {
            "daily": daily,
            "summary": {
                "onCount": on_count,
                "totalRuntimeMs": total_runtime_ms,
                "avgDaily": avg_daily,
            },
        }

    async def get_usage_summary(self, days: int = 7) -> dict[str, Any]:
        safe_days = min(max(int(days), 1), 90)
        since = self._local_day(safe_days)
        session_factory = self._deps["session_factory"]

        with session_factory() as session:
            entity_rows = session.execute(
                select(
                    DeviceUsageStat.entity_id,
                    func.sum(DeviceUsageStat.on_count),
                    func.sum(DeviceUsageStat.total_runtime_ms),
                )
                .where(DeviceUsageStat.day >= since)
                .group_by(DeviceUsageStat.entity_id)
            ).all()
            daily_rows = session.execute(
                select(
                    DeviceUsageStat.day,
                    func.sum(DeviceUsageStat.on_count),
                    func.sum(DeviceUsageStat.total_runtime_ms),
                )
                .where(DeviceUsageStat.day >= since)
                .group_by(DeviceUsageStat.day)
                .order_by(DeviceUsageStat.day.asc())
            ).all()

        top_devices = sorted(
            (
                {
                    "entityId": str(row[0]),
                    "onCount": int(row[1] or 0),
                    "totalRuntimeMs": int(row[2] or 0),
                }
                for row in entity_rows
            ),
            key=lambda item: (item["onCount"], item["totalRuntimeMs"]),
            reverse=True,
        )

        domain_map: dict[str, dict[str, int]] = {}
        for row in top_devices:
            domain = get_entity_domain(row["entityId"]) or "unknown"
            prev = domain_map.setdefault(domain, {"onCount": 0, "totalRuntimeMs": 0, "deviceCount": 0})
            prev["onCount"] += row["onCount"]
            prev["totalRuntimeMs"] += row["totalRuntimeMs"]
            prev["deviceCount"] += 1

        daily_totals = [
            {
                "day": str(row[0]),
                "onCount": int(row[1] or 0),
                "totalRuntimeMs": int(row[2] or 0),
            }
            for row in daily_rows
        ]

        anomaly_hints = await self.build_anomaly_hints(top_devices, safe_days)

        top_ids = [d["entityId"] for d in top_devices[:6]]
        top_daily_map: dict[str, list[dict[str, Any]]] = {}
        if top_ids:
            with session_factory() as session:
                top_daily_rows = session.execute(
                    select(
                        DeviceUsageStat.entity_id,
                        DeviceUsageStat.day,
                        DeviceUsageStat.on_count,
                    )
                    .where(
                        DeviceUsageStat.entity_id.in_(top_ids),
                        DeviceUsageStat.day >= since,
                    )
                    .order_by(DeviceUsageStat.entity_id.asc(), DeviceUsageStat.day.asc())
                    .limit(600)
                ).all()
            for row in top_daily_rows:
                top_daily_map.setdefault(str(row[0]), []).append(
                    {"day": str(row[1]), "onCount": int(row[2] or 0)}
                )
        top_device_daily = [
            {"entityId": entity_id, "daily": top_daily_map.get(entity_id) or []}
            for entity_id in top_ids
        ]

        return {
            "topDevices": top_devices,
            "totalDevices": len(entity_rows),
            "days": safe_days,
            "dailyTotals": daily_totals,
            "domainBreakdown": [
                {"domain": domain, **values}
                for domain, values in sorted(
                    domain_map.items(), key=lambda item: item[1]["onCount"], reverse=True
                )
            ],
            "anomalyHints": anomaly_hints,
            "topDeviceDaily": top_device_daily,
        }

    async def build_anomaly_hints(
        self, top_devices: list[dict[str, Any]], days: int
    ) -> list[dict[str, Any]]:
        hints: list[dict[str, Any]] = []
        avg_on_count = (
            sum(d["onCount"] for d in top_devices) / len(top_devices) if top_devices else 0
        )
        for entry in top_devices[:20]:
            if avg_on_count > 0 and entry["onCount"] >= avg_on_count * 2.5 and entry["onCount"] >= 10:
                hints.append(
                    {
                        "entityId": entry["entityId"],
                        "type": "spike",
                        "message": f"近 {days} 天切换 {entry['onCount']} 次，明显高于平均水平",
                    }
                )
        for entry in top_devices:
            if entry["onCount"] == 0 and entry["totalRuntimeMs"] == 0:
                hints.append(
                    {
                        "entityId": entry["entityId"],
                        "type": "unused",
                        "message": f"近 {days} 天无使用记录",
                    }
                )
        try:
            forgotten = await self.get_forgotten_devices()
            for item in forgotten[:5]:
                hints.append(
                    {
                        "entityId": item["entityId"],
                        "type": "forgotten",
                        "message": item.get("reason") or "可能遗忘开启",
                    }
                )
        except Exception:
            pass
        return hints[:15]

    async def clear_usage_stats(self) -> dict[str, int]:
        session_factory = self._deps["session_factory"]

        def _clear() -> int:
            with session_factory() as session:
                result = session.execute(delete(DeviceUsageStat))
                session.commit()
                return int(result.rowcount or 0)

        count = await asyncio.get_running_loop().run_in_executor(None, _clear)
        self.device_usage.clear()
        logger.info("设备使用统计已清除: %s 条记录", count)
        return {"deleted": count}


class AdvisorUsageService:
    """设备使用统计宿主：包装 :class:`SmartAdvisorUsageHelper`，负责订阅 / 定时 / 事件出口。"""

    def __init__(
        self,
        *,
        app_config: Any,
        ha_connector: Any,
        state_store: Any,
        state_router: Any,
        entity_area: Any,
        session_factory: Any,
        event_bus: Any = None,
        jobs: Any = None,
        lock: Any = None,
        push_tip: Callable[[str, str, str], None] | None = None,
    ) -> None:
        self._app_config = app_config
        self._entity_area = entity_area
        self._event_bus = event_bus
        self._jobs = jobs
        self._lock = lock
        self._stop = False
        self._task: asyncio.Task[Any] | None = None
        self._boot_task: asyncio.Task[Any] | None = None

        self.usage = SmartAdvisorUsageHelper(
            {
                "app_config": app_config,
                "ha_connector": ha_connector,
                "state_store": state_store,
                "state_router": state_router,
                "session_factory": session_factory,
                "ha_areas": self._cached_ha_areas,
                "push_tip": push_tip or self._push_tip,
                "room_label": self._room_label,
                "voice_config": lambda: self._app_config.get("voice"),
                # 最小宿主：不恢复实体 / 自定义 TTS 告警（配置归一化随顾问栈移除）
                "entity_tts_alerts": list,
                "custom_alerts": list,
                "queue_speak": self._queue_speak,
            }
        )

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        # HA 全量状态拉取可能长时间阻塞（局域网不可达时受 HTTP 超时约束），
        # 不能占用启动关键路径：放到后台任务，失败仅告警。
        self._boot_task = asyncio.create_task(self._build_room_map_on_boot())
        self._stop = False
        self._task = asyncio.create_task(self._cron_loop())

    #: 启动期构建房间设备映射的重试退避（秒）：HA 常晚于后端就绪，逐次退避重试
    _BOOT_MAP_RETRY_DELAYS: tuple[int, ...] = (0, 5, 15, 30, 60)

    async def _build_room_map_on_boot(self) -> None:
        """启动后构建房间设备映射：HA 未就绪时短退避重试。

        HA 通常晚于后端就绪（LAN 不可达时还要先回退外网），单次尝试极易得到空映射；
        这里退避重试若干次，并由 ``ha.connected`` 事件与定时任务进一步兜底。
        """
        for attempt, delay in enumerate(self._BOOT_MAP_RETRY_DELAYS):
            if delay:
                try:
                    await asyncio.sleep(delay)
                except asyncio.CancelledError:
                    return
            try:
                if await self.usage.build_room_device_map_from_config():
                    return
            except asyncio.CancelledError:
                return
            except Exception as exc:
                logger.warning("房间设备映射构建失败(第 %s 次): %s", attempt + 1, exc)
        logger.warning("房间设备映射构建未成功,等待HA连接事件或定时任务重建")

    async def stop(self) -> None:
        self._stop = True
        for attr in ("_task", "_boot_task"):
            task = getattr(self, attr, None)
            if task is not None:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
                setattr(self, attr, None)

    async def on_app_config_updated(self, sections: Any) -> None:
        if not isinstance(sections, list) or "envSensorMap" not in sections:
            return
        await self.usage.build_room_device_map_from_config()

    async def on_ha_connected(self, _payload: Any = None) -> None:
        """HA 连接成功后重建房间设备映射。

        启动期 ``_build_room_map_on_boot`` 常早于 HA 就绪（LAN 不可达时会退回外网重连），
        此时会得到空映射；HA 连上后必须重建，否则「忘了关」检测会一直失效。
        """
        await self.usage.build_room_device_map_from_config()

    async def _cron_loop(self) -> None:
        """每 15 分钟检测遗忘设备（对齐 ``@Cron('*/15 * * * *')``）。"""
        interval = 15 * 60
        while not self._stop:
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                return
            if self._stop:
                return
            try:
                # 空映射自愈：启动期 HA 未就绪会留下空映射。
                # 目录幽灵键自愈：默认 slug 与 HA area 主键混在同一张表时重建。
                mapped_rooms = list(self.usage.room_device_map)
                catalog_ids = {room.id for room in DEFAULT_ROOM_CATALOG}
                mixed_catalog = any(room_id in catalog_ids for room_id in mapped_rooms) and any(
                    room_id not in catalog_ids for room_id in mapped_rooms
                )
                if not mapped_rooms or mixed_catalog:
                    await self.usage.build_room_device_map_from_config()
                await self.check_forgotten_cron()
            except Exception as exc:
                logger.warning("遗忘设备检测失败: %s", exc)

    async def check_forgotten_cron(self) -> None:
        """遗忘设备检测（多副本下经分布式锁串行化）。"""
        if self._lock is None:
            await self.usage.check_forgotten_cron()
            return
        try:
            await self._lock.run_exclusive(
                FORGOTTEN_LOCK_KEY, self.usage.check_forgotten_cron, 10 * 60_000
            )
        except Exception as exc:
            logger.debug("遗忘设备检测跳过（锁冲突 / 失败）: %s", exc)

    # ------------------------------------------------------------------ #
    # 事件出口
    # ------------------------------------------------------------------ #
    def _push_tip(self, title: str, message: str, category: str) -> None:
        logger.info("💡 建议: [%s] %s - %s", category, title, message)
        if self._event_bus is not None:
            self._event_bus.emit_soon(
                "advisor.tip", {"title": title, "message": message, "category": category}
            )

    def _queue_speak(self, message: str, dedup_key: str, opts: dict[str, Any] | None = None) -> None:
        logger.info("TTS 播报: %s", message)
        if self._event_bus is not None:
            self._event_bus.emit_soon("tts.speak", {"message": message})

    def _cached_ha_areas(self) -> list[Any]:
        if self._entity_area is None:
            return []
        try:
            return self._entity_area.get_cached_ha_areas() or []
        except Exception:
            return []

    def _room_label(self, room: str) -> str:
        from ..rooms import resolve_room_label_from_ha_areas

        return resolve_room_label_from_ha_areas(
            room, self._app_config.get("envSensorMap"), self._cached_ha_areas()
        )

    # ------------------------------------------------------------------ #
    # 转发
    # ------------------------------------------------------------------ #
    def track_usage(self, event: dict[str, Any]) -> None:
        self.usage.track_usage(event)

    def register_room_devices(self, room: str, entity_ids: list[str]) -> None:
        self.usage.register_room_devices(room, entity_ids)

    def detect_forgotten_devices(self, entities: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        return self.usage.detect_forgotten_devices(entities)

    async def get_usage_report(self) -> dict[str, Any]:
        return await self.usage.get_usage_report()

    async def get_entity_usage(self, entity_id: str, days: int = 7) -> dict[str, Any]:
        return await self.usage.get_entity_usage(entity_id, days)

    async def get_usage_summary(self, days: int = 7) -> dict[str, Any]:
        return await self.usage.get_usage_summary(days)

    async def clear_usage_stats(self) -> dict[str, int]:
        return await self.usage.clear_usage_stats()

    async def get_forgotten_devices(self) -> list[dict[str, Any]]:
        return await self.usage.get_forgotten_devices()


__all__ = [
    "FORGOTTEN_LOCK_KEY",
    "AdvisorUsageService",
    "SmartAdvisorUsageHelper",
    "local_date_key",
]
