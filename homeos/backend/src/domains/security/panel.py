"""安防面板服务（对齐 ``SecurityPanelService``）。

维护布防模式与区域传感器配置，对接 HA 状态变更做入侵告警与危险传感器联动，
并提供紧急求助的设备联动执行。单副本部署下即为 Leader，直接执行实际布防。
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

from sqlalchemy import select, update

from .bus import LocalEventBus
from .config import load_security_config, resolve_notification_fetch_limit
from .cooldown import NotificationCooldownService
from .panel_helpers import (
    SecurityAlarmHelper,
    SecurityEmergencyRunnerHelper,
    SecurityLinkageHelper,
    SecurityPanelStateHelper,
)
from .zones import (
    SECURITY_ARMING_MODES,
    normalize_zone_type,
    security_mode_label,
    should_zone_alarm_in_mode,
)
from ...platform.core.errors import api_error, bad_request
from ...platform.core.models import SecurityEvent

logger = logging.getLogger("homeos.security.panel")

#: 区域传感器只接受这几类实体域；``foo.bar`` / ``foo..bar`` / 带空白的 ID 一律拒绝。
_SENSOR_ENTITY_RE = re.compile(
    r"^(binary_sensor|sensor|lock|alarm_control_panel)\.[a-z0-9_]+\Z"
)


class SecurityConfigProvider:
    """安防配置 TTL 缓存：避免每个传感器事件都查库。"""

    def __init__(self, session_factory, ttl_seconds: float = 5.0) -> None:
        self._session_factory = session_factory
        self._ttl = ttl_seconds
        self._cached: dict[str, Any] | None = None
        self._at = 0.0

    def get(self) -> dict[str, Any]:
        now = time.monotonic()
        if self._cached is None or now - self._at > self._ttl:
            try:
                with self._session_factory() as session:
                    self._cached = load_security_config(session)
            except Exception as exc:
                # 配置读失败会沿用上次缓存（或空配置）继续工作；留痕以便发现配置表损坏。
                logger.warning("加载安防配置失败，沿用上次缓存: %s", exc)
                self._cached = self._cached or {}
            self._at = now
        return self._cached

    def refresh(self) -> None:
        self._at = 0.0


class SecurityPanelService:
    def __init__(
        self,
        session_factory,
        ha_connector,
        bus: LocalEventBus,
        cooldown: NotificationCooldownService,
        config_provider: SecurityConfigProvider,
    ) -> None:
        self._session_factory = session_factory
        self._ha = ha_connector
        self._bus = bus
        self._cooldown = cooldown
        self._config = config_provider

        self._mode = "disarmed"
        self._zones: list[dict[str, Any]] = []
        self._armed_at: int | None = None
        #: 手动布防/撤防后的人为锁定窗口（毫秒时间戳）：presence / 日历等自动联动
        #: 在窗口内不得覆盖用户刚刚做出的决定。
        self._manual_lock_until = 0
        self._emergency_running = False
        self._last_emergency_at = 0
        self._transition_lock = asyncio.Lock()
        #: 进程启动后是否已把持久化的布防模式对应联动重放过一次。
        self._linkage_replay_done = False

        self.state_helper = SecurityPanelStateHelper(
            session_factory,
            {
                "getMode": lambda: self._mode,
                "setMode": self._set_mode_value,
                "getZones": lambda: self._zones,
                "setZones": self._set_zones_value,
                "getArmedAt": lambda: self._armed_at,
                "setArmedAt": self._set_armed_at_value,
            },
        )
        self.linkage_helper = SecurityLinkageHelper(session_factory, ha_connector, bus)
        self.emergency_runner = SecurityEmergencyRunnerHelper(
            session_factory=session_factory,
            bus=bus,
            ha_connector=ha_connector,
            linkage=self.linkage_helper,
            arm=self.arm,
        )
        self.alarm_helper = SecurityAlarmHelper(
            session_factory=session_factory,
            bus=bus,
            ha_connector=ha_connector,
            state_helper=self.state_helper,
            config_reader=self._config.get,
            get_current_mode=self.get_mode,
            get_zones=self.get_zones,
            get_armed_at=self.get_armed_at,
            is_zone_alarm_in_cooldown=lambda zone_id: self._cooldown.is_in_cooldown(
                "security", f"zone-alarm:{zone_id}"
            ),
            set_zone_alarm_cooldown=lambda zone_id, minutes: self._cooldown.set_cooldown(
                "security", f"zone-alarm:{zone_id}", minutes
            ),
        )

    # 状态访问
    def _set_mode_value(self, mode: str) -> None:
        self._mode = mode

    def _set_zones_value(self, zones: list[dict[str, Any]]) -> None:
        self._zones = zones

    def _set_armed_at_value(self, value: int | None) -> None:
        self._armed_at = value

    async def start(self) -> None:
        await self.state_helper.load_persisted_state()
        # 重启后布防动作可能只执行了一半：等 HA 连上后按当前模式重放一次（幂等）。
        # 先注册监听，避免 HA 在启动早期就连上而错过事件。
        self._bus.on("ha.connected", self._handle_ha_connected)
        try:
            status = await self._ha.get_status()
        except Exception as exc:
            logger.warning("读取 HA 连接状态失败，布防联动留待 ha.connected 重放: %s", exc)
            return
        if isinstance(status, dict) and status.get("connected"):
            await self._replay_armed_linkage()

    async def _handle_ha_connected(self, _payload: Any = None) -> None:
        await self._replay_armed_linkage()

    async def _replay_armed_linkage(self) -> None:
        """按持久化模式重放布防联动；失败保留待重放标记并在下次 HA 连接时再试。"""
        if self._linkage_replay_done:
            return
        if self._mode == "disarmed":
            self._linkage_replay_done = True
            return
        try:
            result = await self.linkage_helper.execute_security_mode_actions(self._mode)
        except Exception as exc:
            logger.warning("重启后重放布防联动失败: %s", exc)
            self.state_helper.schedule_security_event(
                "arm_replay_failed", f"重启后重放布防联动异常: {exc}", mode=self._mode
            )
            return
        if result.get("failed"):
            self.state_helper.schedule_security_event(
                "arm_replay_failed",
                f"重启后重放布防联动失败: {result.get('failed')} 条",
                mode=self._mode,
            )
            return
        if result.get("executed"):
            logger.warning(
                "重启后已重放布防联动：%s，%s 条", security_mode_label(self._mode), result["executed"]
            )
        self._linkage_replay_done = True

    def get_mode(self) -> str:
        return self._mode

    def get_zones(self) -> list[dict[str, Any]]:
        return self._zones

    def get_armed_at(self) -> int | None:
        return self._armed_at

    def get_manual_lock_until(self) -> int:
        return self._manual_lock_until

    def is_auto_action_locked(self) -> bool:
        """自动联动（presence/日历）当前是否应让人工操作优先。"""
        return self._manual_lock_until > int(time.time() * 1000)

    def _apply_manual_lock(self, opts: dict[str, Any]) -> None:
        if (opts.get("source") or "manual") != "manual":
            return
        try:
            lock_sec = float(self._config.get().get("manualArmLockSec") or 0)
        except (TypeError, ValueError):
            lock_sec = 0.0
        self._manual_lock_until = (
            int(time.time() * 1000) + int(lock_sec * 1000) if lock_sec > 0 else 0
        )

    # 区域配置
    async def configure_zones(
        self, zones: list[dict[str, Any]] | None, *, confirm_clear: bool = False
    ) -> None:
        """覆盖式配置区域。

        - 空数组必须显式 ``confirmClear``：一次误传 ``[]`` 不能把全屋防区静默删光。
        - 配置与布防共用 ``_transition_lock``：否则布防提交阶段会把新列表写成未布防。
        - 新模式区按当前模式初始化 ``armed``，避免「已布防 + 新区域永不告警」。
        """
        async with self._transition_lock:
            self._configure_zones_locked(zones, confirm_clear=confirm_clear)

    def _configure_zones_locked(
        self, zones: list[dict[str, Any]] | None, *, confirm_clear: bool
    ) -> None:
        if not isinstance(zones, list) or not zones:
            if not confirm_clear:
                bad_request(api_error("SECURITY_ZONES_CLEAR_REQUIRES_CONFIRM"))
            self._zones = []
            self.state_helper.persist_panel_state()
            self._bus.emit_soon(
                "security.zonesConfigured", {"count": 0, "zones": [], "timestamp": _iso_now()}
            )
            self._bus.emit_soon(
                "security.modeChanged",
                {
                    "mode": self._mode,
                    "zones": [],
                    "zonesDetail": [],
                    "armedAt": self._armed_at,
                    "timestamp": _iso_now(),
                    "source": "zones",
                    "degraded": False,
                    "failedItems": [],
                },
            )
            logger.info("已清空安防区域配置")
            return

        seen: set[str] = set()
        normalized: list[dict[str, Any]] = []
        for zone in zones:
            zone_id = str(zone.get("id") or "").strip() if isinstance(zone, dict) else ""
            name = str(zone.get("name") or "").strip() if isinstance(zone, dict) else ""
            if not zone_id or not name:
                bad_request(api_error("SECURITY_ZONE_ID_NAME_REQUIRED"))
            if zone_id in seen:
                bad_request(api_error("SECURITY_ZONE_ID_DUPLICATE", zone_id))
            seen.add(zone_id)
            sensors: list[str] = []
            for sensor in zone.get("sensors") or []:
                sensor_id = str(sensor or "").strip()
                if not _SENSOR_ENTITY_RE.match(sensor_id):
                    bad_request(api_error("SECURITY_SENSOR_ENTITY_INVALID", str(sensor)))
                if sensor_id and sensor_id not in sensors:
                    sensors.append(sensor_id)
            normalized.append(
                {
                    "id": zone_id,
                    "name": name,
                    "sensors": sensors,
                    "zoneType": normalize_zone_type(zone.get("zoneType")),
                    "roomId": (str(zone.get("roomId")).strip() if zone.get("roomId") else None),
                }
            )

        previous_armed = {str(z.get("id")): bool(z.get("armed")) for z in self._zones}
        mode_armed = self._mode != "disarmed"
        self._zones = [
            {
                **zone,
                # 新模式区继承当前布防状态，但内部区在居家/夜间模式下不参与告警。
                "armed": bool(
                    mode_armed
                    and (
                        previous_armed.get(zone["id"])
                        if zone["id"] in previous_armed
                        else should_zone_alarm_in_mode(self._mode, zone["zoneType"])
                    )
                ),
            }
            for zone in normalized
        ]
        self.state_helper.persist_panel_state()
        armed_zone_ids = [str(z.get("id")) for z in self._zones if z.get("armed")]
        self._bus.emit_soon(
            "security.zonesConfigured",
            {
                "count": len(self._zones),
                "zones": [dict(z) for z in self._zones],
                "timestamp": _iso_now(),
            },
        )
        # 区域变化会改变「哪些传感器参与告警」，必须同步一次模式快照：
        # 否则前端只能等下一次轮询，期间显示的区域布防状态与后端不一致。
        self._bus.emit_soon(
            "security.modeChanged",
            {
                "mode": self._mode,
                "zones": armed_zone_ids,
                "zonesDetail": [dict(z) for z in self._zones],
                "armedAt": self._armed_at,
                "timestamp": _iso_now(),
                "source": "zones",
                "degraded": False,
                "failedItems": [],
            },
        )
        logger.info("已配置 %s 个安防区域", len(self._zones))

    # 布防 / 撤防
    async def set_mode(self, mode: str, source: str = "home-mode") -> dict[str, Any]:
        """家庭模式联动入口：等价 ``security.panel.setMode`` 事件。"""
        self._assert_arming_mode(mode)
        if mode == "disarmed":
            return await self.disarm({"source": source})
        return await self.arm(mode, None, {"source": source})

    @staticmethod
    def _assert_arming_mode(mode: Any) -> str:
        normalized = str(mode or "").strip()
        if normalized not in SECURITY_ARMING_MODES:
            bad_request(api_error("SECURITY_MODE_INVALID", normalized or ""))
        return normalized

    async def arm(
        self,
        mode: str,
        zone_ids: list[str] | None = None,
        opts: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized_mode = self._assert_arming_mode(mode)
        if normalized_mode == "disarmed":
            return await self.disarm(opts)
        # 事件必须留到锁外再发：``security.modeChanged`` 的订阅者会激活家庭模式
        # （HA 调用 + 重试 + 快照恢复），占着转换锁会让撤防/求助排队数十秒。
        events: list[tuple[str, dict[str, Any]]] = []
        async with self._transition_lock:
            result = await self._arm_inner(normalized_mode, zone_ids, opts or {}, events)
        await self._emit_deferred(events)
        if result.get("success") and not result.get("skipped"):
            self._linkage_replay_done = True
        return result

    async def _emit_deferred(self, events: list[tuple[str, dict[str, Any]]]) -> None:
        for name, payload in events:
            await self._bus.emit(name, payload)

    async def _arm_inner(
        self,
        mode: str,
        zone_ids: list[str] | None,
        opts: dict[str, Any],
        events: list[tuple[str, dict[str, Any]]],
    ) -> dict[str, Any]:
        if not self._zones:
            # 0 区域布防 = 只点亮一盏「已布防」的灯，全屋没有任何传感器参与告警。
            bad_request(api_error("SECURITY_ZONE_REQUIRED"))

        requested_ids = [str(item).strip() for item in (zone_ids or []) if str(item or "").strip()]
        target_zones = (
            [z for z in self._zones if str(z.get("id")) in requested_ids]
            if requested_ids
            else list(self._zones)
        )
        if requested_ids and not target_zones:
            bad_request(api_error("SECURITY_ZONE_NOT_FOUND"))

        target_ids = {str(z.get("id")) for z in target_zones}
        armed_ids = {str(z.get("id")) for z in self._zones if z.get("armed")}
        same_mode = self._mode == mode
        # 同模式但防区集合变了必须重算：否则「取消勾选 B 区再布防」会被静默跳过，
        # 后端仍把 B 区当已布防，前端却按请求把 B 显示成未布防。
        zone_selection_changed = target_ids != armed_ids
        if (
            same_mode
            and opts.get("skipActionsIfSameMode", True)
            and not opts.get("force")
            and not zone_selection_changed
        ):
            return {
                "success": True,
                "mode": mode,
                "zoneCount": sum(1 for z in self._zones if z.get("armed")),
                "actions": {"executed": 0, "failed": 0, "failedItems": []},
                "skipped": True,
            }

        if opts.get("skipActions"):
            action_result: dict[str, Any] = {
                "executed": 0,
                "failed": 0,
                "failedItems": [],
                "appliedItems": [],
                "irreversibleItems": [],
            }
        else:
            # 紧急求助自动布防只跳过声光域：门锁/水阀这类安全动作用户仍然期望执行。
            skip_domains = _normalize_domains(opts.get("skipActionDomains"))
            if skip_domains:
                action_result = await self.linkage_helper.execute_security_mode_actions(
                    mode, skip_domains=skip_domains
                )
            else:
                action_result = await self.linkage_helper.execute_security_mode_actions(mode)

        degraded = action_result["failed"] > 0
        if degraded:
            # 布防失败必须补偿已执行的联动：否则「关水阀成功、锁门失败」会把房子留在
            # 半布防状态 —— 面板显示撤防，水阀却是关的，谁也不知道该怎么收拾。
            compensation = await self.linkage_helper.compensate_applied_actions(
                action_result.get("appliedItems") or [], f"安防布防补偿 {mode}"
            )
            logger.warning(
                "安防布防失败(联动未完成): %s,失败 %s 条,已补偿 %s 条,保持模式=%s",
                mode,
                action_result["failed"],
                compensation["restored"],
                self._mode,
            )
            self.state_helper.schedule_security_event(
                "arm_failed",
                f"布防失败: {mode}（已补偿 {compensation['restored']} 条）",
                mode=self._mode,
                source=opts.get("source") or "manual",
                actor=opts.get("actor"),
            )
            if compensation["failed"]:
                # 补偿也失败：二次告警，绝不吞掉。
                self.state_helper.schedule_security_event(
                    "arm_compensation_failed",
                    f"布防失败后补偿未完成: {mode}",
                    mode=self._mode,
                    source=opts.get("source") or "manual",
                    actor=opts.get("actor"),
                )
            return {
                "success": False,
                "degraded": True,
                "mode": self._mode,
                "requestedMode": mode,
                "zoneCount": sum(1 for z in self._zones if z.get("armed")),
                "actions": action_result,
                "appliedCount": action_result["executed"],
                "failedItems": action_result["failedItems"],
                "compensated": compensation["restored"],
                "compensationFailures": compensation["failedItems"],
                "irreversibleItems": action_result.get("irreversibleItems") or [],
            }

        for zone in self._zones:
            zone["armed"] = False
        for zone in target_zones:
            zone["armed"] = True

        self._mode = mode
        self._armed_at = int(time.time() * 1000)
        self._apply_manual_lock(opts)
        armed_zone_ids = [str(z.get("id")) for z in self._zones if z.get("armed")]

        events.append(
            (
                "security.modeChanged",
                {
                    "mode": mode,
                    "zones": armed_zone_ids,
                    "zonesDetail": [dict(z) for z in self._zones],
                    "armedAt": self._armed_at,
                    "timestamp": _iso_now(),
                    "source": opts.get("source") or "manual",
                    "degraded": False,
                    "failedItems": [],
                },
            )
        )
        logger.info("安防已布防：%s（%s 个区域）", security_mode_label(mode), len(target_zones))
        persisted = self.state_helper.persist_panel_state()
        self.state_helper.schedule_security_event(
            "arm",
            f"布防: {security_mode_label(mode)}",
            mode=mode,
            zones=armed_zone_ids,
            source=opts.get("source") or "manual",
            actor=opts.get("actor"),
        )
        return {
            "success": True,
            "degraded": False,
            # 模式已提交但没落库：重启会回退到上一次成功落库的模式，前端据此给出提醒。
            "persisted": persisted,
            "mode": mode,
            "zoneCount": len(target_zones),
            "actions": action_result,
            "appliedCount": action_result["executed"],
            "failedItems": action_result["failedItems"],
            "irreversibleItems": action_result.get("irreversibleItems") or [],
        }

    async def disarm(self, opts: dict[str, Any] | None = None) -> dict[str, Any]:
        opts = opts or {}
        events: list[tuple[str, dict[str, Any]]] = []
        async with self._transition_lock:
            result = await self._disarm_inner(opts, events)
        await self._emit_deferred(events)
        return result

    async def _disarm_inner(
        self, opts: dict[str, Any], events: list[tuple[str, dict[str, Any]]]
    ) -> dict[str, Any]:
        if self._mode == "disarmed" and opts.get("skipActionsIfSameMode", True) and not opts.get(
            "force"
        ):
            return {
                "success": True,
                "mode": "disarmed",
                "actions": {"executed": 0, "failed": 0, "failedItems": []},
                "skipped": True,
            }

        if opts.get("skipActions"):
            action_result = {"executed": 0, "failed": 0, "failedItems": [], "appliedItems": []}
        else:
            action_result = await self.linkage_helper.execute_security_mode_actions("disarmed")

        degraded = action_result["failed"] > 0
        for zone in self._zones:
            zone["armed"] = False
        self._mode = "disarmed"
        self._armed_at = None
        self._apply_manual_lock(opts)

        events.append(
            (
                "security.modeChanged",
                {
                    "mode": "disarmed",
                    "zones": [],
                    "zonesDetail": [dict(z) for z in self._zones],
                    "armedAt": None,
                    "timestamp": _iso_now(),
                    "source": opts.get("source") or "manual",
                    "degraded": degraded,
                    "failedItems": action_result["failedItems"],
                },
            )
        )
        logger.info("安防已撤防%s", " [联动降级]" if degraded else "")
        persisted = self.state_helper.persist_panel_state()
        self.state_helper.schedule_security_event(
            "disarm",
            "撤防",
            mode="disarmed",
            source=opts.get("source") or "manual",
            actor=opts.get("actor"),
        )
        # 面板状态已经撤防（fail-open：求助/告警不能被联动卡住），但联动失败必须如实报
        # success=false + degraded=true —— 之前无条件返回成功，等于把「水阀没关」瞒掉。
        return {
            "success": not degraded,
            "degraded": degraded,
            "persisted": persisted,
            "mode": "disarmed",
            "actions": action_result,
            "appliedCount": action_result["executed"],
            "failedItems": action_result["failedItems"],
        }

    # 传感器事件
    async def handle_state_change(self, change: dict[str, Any]) -> None:
        await self.alarm_helper.handle_sensor_trigger(change)
        await self.alarm_helper.handle_safety_sensor(change)

    # 紧急求助
    async def trigger_emergency(
        self,
        action: str = "panic",
        *,
        source: str = "manual",
        actor: str | None = None,
    ) -> dict[str, Any]:
        now = time.time() * 1000
        cooldown_ms = int(self._config.get().get("emergencyCooldownSec") or 0) * 1000
        if self._emergency_running or (cooldown_ms > 0 and now - self._last_emergency_at < cooldown_ms):
            return {
                "success": False,
                "action": action,
                "queued": False,
                "reason": "in_progress" if self._emergency_running else "cooldown",
            }
        self._last_emergency_at = now

        await self._bus.emit("security.emergency", {"action": action, "timestamp": _iso_now()})
        self.state_helper.schedule_security_event(
            "emergency", f"紧急求助: {action}", source=source, actor=actor
        )
        logger.warning("🆘 紧急求助触发: %s", action)

        asyncio.get_running_loop().create_task(self._run_emergency())

        return {"success": True, "action": action, "queued": True}

    async def _run_emergency(self) -> None:
        if self._emergency_running:
            return
        self._emergency_running = True
        try:
            await self.emergency_runner.run_emergency_actions()
        except Exception as exc:
            logger.warning("紧急求助联动失败: %s", exc)
        finally:
            self._emergency_running = False

    # 事件历史
    async def get_events(self, event_type: str | None = None, limit: Any = None) -> list[dict[str, Any]]:
        # 同步 SQLAlchemy 查询放进 worker 线程：面板每 2-5s 轮询一次，直接在事件循环里
        # 查库会把实时推送/设备控制的调度一起顶住。
        return await asyncio.to_thread(self._get_events_blocking, event_type, limit)

    def _get_events_blocking(
        self, event_type: str | None, limit: Any
    ) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            from .config import load_frontend_config, load_notification_config

            fetch_limit = resolve_notification_fetch_limit(
                limit,
                load_frontend_config(session),
                load_notification_config(session),
            )
            statement = select(SecurityEvent).order_by(SecurityEvent.created_at.desc()).limit(
                fetch_limit
            )
            if event_type:
                statement = statement.where(SecurityEvent.type == event_type)
            rows = session.execute(statement).scalars().all()
        return [_event_to_dict(row) for row in rows]

    async def ack_events(self, event_ids: list[str], actor: str | None = None) -> int:
        """把告警事件标记为已确认；只更新未确认行，返回受影响条数。"""
        if not event_ids:
            return 0
        return await asyncio.to_thread(self._ack_events_blocking, event_ids, actor)

    def _ack_events_blocking(self, event_ids: list[str], actor: str | None) -> int:
        from ...platform.core.models import utc_now

        normalized = sorted({str(event_id).strip() for event_id in event_ids if str(event_id).strip()})
        if not normalized:
            return 0
        with self._session_factory() as session:
            result = session.execute(
                update(SecurityEvent)
                .where(
                    SecurityEvent.id.in_(normalized),
                    SecurityEvent.ack_at.is_(None),
                )
                .values(ack_at=utc_now(), actor=actor)
            )
            session.commit()
            return int(result.rowcount or 0)


def _normalize_domains(raw: Any) -> set[str]:
    if not raw:
        return set()
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, (list, tuple, set)):
        return set()
    return {str(item).strip().lower() for item in raw if str(item or "").strip()}


def _event_to_dict(row: SecurityEvent) -> dict[str, Any]:
    import json

    try:
        zones = json.loads(row.zones) if row.zones else []
    except (TypeError, ValueError):
        zones = []
    created = row.created_at
    ack_at = getattr(row, "ack_at", None)
    return {
        "id": row.id,
        "type": row.type,
        "mode": row.mode,
        "entityId": row.entity_id,
        "detail": row.detail,
        "zones": zones,
        "source": getattr(row, "source", None),
        "actor": getattr(row, "actor", None),
        "ackAt": (
            ack_at.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ack_at.microsecond // 1000:03d}Z"
            if ack_at is not None
            else None
        ),
        "createdAt": (
            created.strftime("%Y-%m-%dT%H:%M:%S.") + f"{created.microsecond // 1000:03d}Z"
            if created is not None
            else None
        ),
    }


def _iso_now() -> str:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
