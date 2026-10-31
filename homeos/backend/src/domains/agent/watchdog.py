"""主动看门狗：房间长期无人 + 设备空转 → 提醒 / 按家规自动关停。

对齐 Nest ``AgentWatchdogService``：

- 默认关闭（``proactive.watchdogEnabled``），由 ``AgentProactiveConfig`` 热更新；
- 房间占用优先用毫米波（``PresenceService.is_room_occupied``），没有毫米波时退化为
  该房间的运动 / 存在传感器：任一为 ``on`` 视为有人，否则用传感器最近一次上报时间
  推算「已无人多久」；
- 设备开启时长优先取 ``AgentTimelineService`` 的「最近一次变为开启」，回退
  ``DeviceUsageStat.last_on``；
- 提醒走 ``NotificationService``（复用免打扰与冷却），自动关停必须同时满足：
  全局 ``autoCloseEnabled`` + 命中的家规 ``autoClose`` + 设备属于低危域；
- 单次巡检最多关停 ``maxAutoCloseDevices`` 台，同一房间重复命中受冷却限制。
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from .config_service import AgentConfigService, AgentProactiveConfig
from .policy import AUTO_CLOSE_DOMAINS
from .proactive import in_quiet_hours
from ...platform.core.db_exec import run_db
from ...platform.core.json_field import object_field
from ...platform.core.models import DeviceUsageStat

logger = logging.getLogger("homeos.agent.watchdog")

#: 通知来源
WATCHDOG_SOURCE = "agent-watchdog"
#: 默认巡检周期（秒）：15 分钟
DEFAULT_INTERVAL_SECONDS = 900
#: 关闭状态下的轮询间隔（秒）：允许设置页开启后无需重启
DISABLED_POLL_SECONDS = 300
#: 视为「有人」的运动传感器状态
OCCUPIED_STATES = frozenset({"on", "detected", "occupied", "present", "open"})
#: 视为「开启」的设备状态
ON_STATES = frozenset({"on", "open", "playing", "heat", "cool", "auto", "heat_cool", "dry", "fan_only"})
#: 运动 / 存在类 device_class
MOTION_DEVICE_CLASSES = frozenset({"motion", "occupancy", "presence", "mmwave", "moving"})


def _interval_seconds() -> int:
    raw = os.environ.get("AGENT_WATCHDOG_INTERVAL_SECONDS", "").strip()
    if raw:
        try:
            value = int(float(raw))
        except ValueError:
            logger.info("AGENT_WATCHDOG_INTERVAL_SECONDS 不是数字，使用默认间隔: %s", raw)
            return DEFAULT_INTERVAL_SECONDS
        if 60 <= value <= 86_400:
            return value
    return DEFAULT_INTERVAL_SECONDS


def _parse_iso(raw: Any) -> datetime | None:
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        logger.debug("看门狗时间格式非法: %s", text)
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment


class AgentWatchdogService:
    """无人空转巡检（只读检测 + 受限自动关停）。"""

    def __init__(
        self,
        tools: Any,
        agent_config: AgentConfigService,
        areas: Any = None,
        state_store: Any = None,
        timeline: Any = None,
        policy: Any = None,
        presence: Any = None,
        notification: Any = None,
        session_factory: Any = None,
        jobs: Any = None,
    ) -> None:
        self._tools = tools
        self._agent_config = agent_config
        self._areas = areas
        self._state_store = state_store
        self._timeline = timeline
        self._policy = policy
        self._presence = presence
        self._notification = notification
        self._session_factory = session_factory
        self._jobs = jobs
        self._task: asyncio.Task[None] | None = None
        self._stop_event: asyncio.Event | None = None
        #: 最近一次提醒时间（monotonic）
        self._last_sent_at: float | None = None

    # 装配
    def bind_tools(self, tools: Any) -> None:
        self._tools = tools

    def bind_notification(self, notification: Any) -> None:
        self._notification = notification

    def bind_presence(self, presence: Any) -> None:
        self._presence = presence

    # 生命周期
    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._loop(), name="agent-watchdog")

    async def stop(self) -> None:
        if self._stop_event is not None:
            self._stop_event.set()
        task = self._task
        self._task = None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError, Exception:
                logger.debug("看门狗循环已退出", exc_info=True)

    async def _loop(self) -> None:
        while True:
            stop_event = self._stop_event
            if stop_event is None:
                return
            interval = DISABLED_POLL_SECONDS
            try:
                cfg = await self._agent_config.get_proactive_config()
                interval = _interval_seconds() if cfg.watchdog_enabled else DISABLED_POLL_SECONDS
                await self._run_tracked(cfg)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("看门狗巡检失败", exc_info=True)
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=max(60, interval))
            except TimeoutError:
                # 正常节拍：等满一个巡检周期
                logger.debug("看门狗进入下一个巡检周期")
                continue
            return

    async def _run_tracked(self, cfg: AgentProactiveConfig) -> None:
        if self._jobs is None:
            if cfg.watchdog_enabled:
                await self.run_once()
            return
        try:
            await self._jobs.run(
                "agent-watchdog",
                {
                    "description": "智能管家看门狗（无人空转 / 家规自动关停）",
                    "intervalMs": 60_000,
                },
                self._run_guarded,
            )
        except Exception:
            logger.warning("看门狗作业执行失败", exc_info=True)

    async def _run_guarded(self) -> dict[str, Any]:
        cfg = await self._agent_config.get_proactive_config()
        if not cfg.watchdog_enabled:
            return {"ok": True, "skipped": "disabled"}
        return await self.run_once()

    # 单次巡检
    async def run_once(
        self,
        actor: Any = None,
        auto_close: bool | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        """执行一次巡检。

        :param actor: 手动触发时的执行身份；为空时自动关停一律不做。
        :param auto_close: 是否允许自动关停；``None`` 表示跟随全局配置。
        """
        cfg = await self._agent_config.get_proactive_config()
        if not cfg.watchdog_enabled:
            return {"ok": True, "skipped": "disabled", "areas": [], "signals": [], "actions": []}
        moment = now or datetime.now(UTC)
        areas = await self._collect_areas()
        unoccupied = await self._unoccupied_areas(areas, cfg, moment)
        if not unoccupied:
            return {"ok": True, "areas": [], "signals": [], "actions": []}

        signals: list[str] = []
        actions: list[dict[str, Any]] = []
        allow_close = cfg.auto_close_enabled if auto_close is None else bool(auto_close)
        allow_close = allow_close and actor is not None
        for area in unoccupied:
            signal, closed = await self._patrol_area(area, cfg, moment, allow_close, actor, len(actions))
            if signal:
                signals.append(signal)
            actions.extend(closed)

        message = ""
        sent = False
        if signals:
            message = self._compose_message(signals, cfg)
            sent = await self._notify(message, cfg)
        return {
            "ok": True,
            "sent": sent,
            "message": message,
            "signals": signals,
            "actions": actions,
            "areas": [
                {"id": area.get("id"), "name": area.get("name"), "idleMinutes": area.get("idleMinutes")}
                for area in unoccupied
            ],
        }

    async def _patrol_area(
        self,
        area: dict[str, Any],
        cfg: AgentProactiveConfig,
        moment: datetime,
        allow_close: bool,
        actor: Any,
        already_closed: int,
    ) -> tuple[str, list[dict[str, Any]]]:
        """巡检单个房间：返回（提醒文案, 自动关停结果）。"""
        area_id = str(area.get("id") or "")
        area_name = str(area.get("name") or area_id)
        raw_idle = area.get("idleMinutes")
        idle_minutes = int(raw_idle) if raw_idle is not None else None
        candidates = await self._idle_devices(area, cfg, idle_minutes, moment)
        if not candidates:
            return "", []
        names = "、".join(item["name"] for item in candidates[:4])
        if idle_minutes is None:
            signal = f"{area_name}没有占用传感器，{names} 等 {len(candidates)} 台设备已长时间开启"
        else:
            signal = f"{area_name}已无人 {idle_minutes} 分钟，{names} 等 {len(candidates)} 台设备仍在开启"
        if not allow_close:
            return signal, []
        return signal, await self._close_area_devices(area_id, candidates, cfg, idle_minutes, actor, already_closed)

    async def _close_area_devices(
        self,
        area_id: str,
        candidates: list[dict[str, Any]],
        cfg: AgentProactiveConfig,
        idle_minutes: int | None,
        actor: Any,
        already_closed: int,
    ) -> list[dict[str, Any]]:
        """按家规关停命中的低危设备（单次总量受 ``max_auto_close_devices`` 约束）。"""
        policy_idle = idle_minutes if idle_minutes is not None else cfg.idle_switch_minutes
        matched: list[dict[str, Any]] = []
        if self._policy is not None:
            matched = await self._policy.match_watchdog_policy(
                area_id,
                [item["domain"] for item in candidates],
                policy_idle,
            )
        rule_ids = [str(rule.get("id")) for rule in matched if rule.get("autoClose")]
        if not rule_ids:
            return []
        actions: list[dict[str, Any]] = []
        for item in candidates:
            if already_closed + len(actions) >= cfg.max_auto_close_devices:
                break
            if item["domain"] not in AUTO_CLOSE_DOMAINS:
                continue
            outcome = await self._close_device(item, actor)
            actions.append(
                {
                    "entityId": item["entity_id"],
                    "name": item["name"],
                    "areaId": area_id,
                    "ok": bool(outcome.get("success")) if outcome else False,
                    "message": str((outcome or {}).get("message") or ""),
                    "ruleIds": rule_ids,
                }
            )
        if self._policy is not None:
            await self._policy.touch_triggered(rule_ids)
        return actions

    # 房间与占用
    async def _collect_areas(self) -> list[dict[str, Any]]:
        if self._areas is None:
            return []
        try:
            summaries = await self._areas.find_all()
        except Exception as exc:
            logger.debug("读取房间列表失败: %s", exc)
            return []
        areas: list[dict[str, Any]] = []
        for summary in summaries:
            entity_ids = [getattr(entity, "entity_id", "") for entity in summary.entities]
            areas.append(
                {
                    "id": summary.id,
                    "name": summary.name,
                    "entities": [item for item in entity_ids if item],
                }
            )
        return areas

    def _room_occupied_by_presence(self, area_name: str) -> bool | None:
        """毫米波判定；不可用 / 未配置时返回 ``None`` 表示交给传感器推断。"""
        presence = self._presence
        if presence is None or not area_name:
            return None
        try:
            return bool(presence.is_room_occupied(area_name))
        except Exception as exc:
            logger.debug("毫米波在场判定失败，回退传感器推断: %s (%s)", area_name, exc)
            return None

    async def _unoccupied_areas(
        self,
        areas: list[dict[str, Any]],
        cfg: AgentProactiveConfig,
        moment: datetime,
    ) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for area in areas:
            area_name = str(area.get("name") or "")
            occupied = self._room_occupied_by_presence(area_name)
            if occupied is True:
                continue
            if occupied is False:
                result.append({**area, "idleMinutes": cfg.motion_idle_minutes, "source": "presence"})
                continue
            idle_minutes = self._idle_minutes_from_sensors(area, moment)
            if idle_minutes is None:
                # 房间没有占用信息：不能判定「无人」，但仍按参考实现的兜底口径
                # 检查长时间开启的开关类设备（阈值见 ``idle_switch_minutes``）。
                result.append({**area, "idleMinutes": None, "source": "unknown"})
                continue
            if idle_minutes < cfg.motion_idle_minutes:
                continue
            result.append({**area, "idleMinutes": idle_minutes, "source": "sensor"})
        return result

    def _idle_minutes_from_sensors(self, area: dict[str, Any], moment: datetime) -> int | None:
        """用运动 / 存在传感器推算已无人多久；没有这类传感器返回 ``None``。"""
        if self._state_store is None:
            return None
        latest: datetime | None = None
        found = False
        for entity_id in area.get("entities") or []:
            if not str(entity_id).startswith("binary_sensor."):
                continue
            entity = self._state_store.get(str(entity_id))
            if not entity:
                continue
            attrs = object_field(entity, "attributes")
            device_class = str(attrs.get("device_class") or "").lower()
            if device_class not in MOTION_DEVICE_CLASSES:
                continue
            found = True
            state = str(entity.get("state") or "").lower()
            if state in OCCUPIED_STATES:
                return 0
            changed = _parse_iso(entity.get("last_updated") or entity.get("last_changed") or entity.get("lastChanged"))
            if changed is not None and (latest is None or changed > latest):
                latest = changed
        if not found:
            return None
        if latest is None:
            return None
        delta = (moment - latest).total_seconds() / 60
        return max(0, int(delta))

    # 空转设备
    async def _idle_devices(
        self,
        area: dict[str, Any],
        cfg: AgentProactiveConfig,
        idle_minutes: int | None,
        moment: datetime,
    ) -> list[dict[str, Any]]:
        if self._state_store is None:
            return []
        # 有占用判定：设备开启超过 idleDeviceMinutes 即空转；
        # 没有占用判定（无毫米波也无运动传感器）：只有长时间常开的设备才算，
        # 阈值放宽到 idleSwitchMinutes，避免把「其实有人」的房间误关。
        threshold = cfg.idle_device_minutes if idle_minutes is not None else cfg.idle_switch_minutes
        candidates: list[dict[str, Any]] = []
        entity_ids: list[str] = []
        for entity_id in area.get("entities") or []:
            domain = str(entity_id).split(".", 1)[0]
            if domain not in AUTO_CLOSE_DOMAINS:
                continue
            entity = self._state_store.get(str(entity_id))
            if not entity:
                continue
            if str(entity.get("state") or "").lower() not in ON_STATES:
                continue
            entity_ids.append(str(entity_id))
            attrs = object_field(entity, "attributes")
            candidates.append(
                {
                    "entity_id": str(entity_id),
                    "domain": domain,
                    "name": str(attrs.get("friendly_name") or entity_id),
                }
            )
        if not candidates:
            return []
        on_since = await self._on_since(entity_ids)
        idle: list[dict[str, Any]] = []
        for item in candidates:
            since = on_since.get(item["entity_id"])
            if since is None:
                continue
            minutes = (moment - since).total_seconds() / 60
            if minutes < threshold:
                continue
            idle.append({**item, "onMinutes": int(minutes)})
        return idle

    async def _on_since(self, entity_ids: list[str]) -> dict[str, datetime]:
        """设备开启时间：时序表优先，回退用电统计的 ``lastOn``。"""
        result: dict[str, datetime] = {}
        if self._timeline is not None:
            try:
                raw = await self._timeline.last_on_since(entity_ids)
            except Exception as exc:
                logger.debug("读取时序开启时间失败，回退用电统计: %s", exc)
                raw = {}
            for entity_id, moment in (raw or {}).items():
                aware = moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)
                result[entity_id] = aware
        missing = [item for item in entity_ids if item not in result]
        if missing and self._session_factory is not None:
            try:
                rows = await run_db(self._load_usage_rows, missing)
            except Exception as exc:
                logger.debug("读取用电统计开启时间失败: %s", exc)
                rows = {}
            for entity_id, moment in rows.items():
                aware = moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)
                result.setdefault(entity_id, aware)
        return result

    def _load_usage_rows(self, entity_ids: list[str]) -> dict[str, datetime]:
        if self._session_factory is None:
            return {}
        with self._session_factory() as session:
            rows = list(
                session.execute(
                    select(DeviceUsageStat).where(
                        DeviceUsageStat.entity_id.in_(entity_ids),
                        DeviceUsageStat.last_on.is_not(None),
                    )
                ).scalars()
            )
        return {row.entity_id: row.last_on for row in rows if row.last_on is not None}

    async def _close_device(self, item: dict[str, Any], actor: Any) -> dict[str, Any]:
        if self._tools is None:
            return {"success": False, "message": "工具服务未就绪"}
        try:
            result = await self._tools.execute(
                "control_device",
                {
                    "domain": item["domain"],
                    "service": "turn_off",
                    "entity_id": item["entity_id"],
                },
                actor,
            )
        except Exception as exc:
            logger.warning("自动关停失败: %s (%s)", item["entity_id"], exc)
            return {"success": False, "message": str(exc)}
        return result if isinstance(result, dict) else {"success": False}

    # 通知
    def _compose_message(self, signals: list[str], cfg: AgentProactiveConfig) -> str:
        del cfg
        return "【管家提醒】" + "；".join(signals[:3]) + "。"

    async def _notify(self, message: str, cfg: AgentProactiveConfig) -> bool:
        # 与主动管家同一份免打扰时段口径（支持 22 → 7 跨夜）：时段内只留信号不推送
        if in_quiet_hours(cfg, datetime.now()):
            logger.debug("看门狗提醒处于免打扰时段，已跳过推送")
            return False
        if self._last_sent_at is not None:
            if time.monotonic() - self._last_sent_at < cfg.cooldown_seconds:
                return False
        if self._notification is None:
            logger.info("看门狗提醒(无通知服务): %s", message)
            return False
        try:
            if self._notification.is_dnd_active():
                return False
        except Exception:
            logger.debug("读取免打扰状态失败,继续提醒", exc_info=True)
        try:
            result = await self._notification.notify("info", message, WATCHDOG_SOURCE)
        except Exception:
            logger.warning("看门狗提醒发送失败", exc_info=True)
            return False
        if result:
            self._last_sent_at = time.monotonic()
        return bool(result)


__all__ = ["DEFAULT_INTERVAL_SECONDS", "WATCHDOG_SOURCE", "AgentWatchdogService"]
