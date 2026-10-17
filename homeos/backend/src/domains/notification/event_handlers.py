"""领域事件 → 通知的处理器集合（对齐 ``modules/notification/event-handlers.helper.ts``）。

每个 handler 负责：冷却去重 → 级别映射 → 文案格式化 → 渠道选择 → 触发通知。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from ..alerts.messages import format_security_alarm_message
from ..earthquake.state import format_eew_notify_message
from ..earthquake.types import eew_catalog_cooldown_key
from ..ha.config.ha_filters import HaStateChangeRouter

logger = logging.getLogger("homeos.notification.events")


class NotificationEventHandlersHelper:
    def __init__(
        self,
        *,
        state_router: HaStateChangeRouter,
        notify: Callable[..., Awaitable[Any]],
        is_in_cooldown: Callable[[str], bool],
        set_cooldown: Callable[[str, float], None],
        check_device_offline: Callable[[str, str], Awaitable[Any]],
        check_low_battery: Callable[[str, str, float], Awaitable[Any]],
        evaluate_rules: Callable[..., Awaitable[Any]],
        resolve_room_label: Callable[[str | None], str],
        get_security_cfg: Callable[[], dict[str, Any]],
        get_energy_cfg: Callable[[], dict[str, Any]],
        get_water_cfg: Callable[[], dict[str, Any]],
        get_iaq_cfg: Callable[[], dict[str, Any]],
        get_other_cfg: Callable[[], dict[str, Any]],
        ha_states_trustworthy: Callable[[], bool] | None = None,
    ) -> None:
        self._state_router = state_router
        self._notify = notify
        self._is_in_cooldown = is_in_cooldown
        self._set_cooldown = set_cooldown
        self._check_device_offline = check_device_offline
        self._check_low_battery = check_low_battery
        self._evaluate_rules = evaluate_rules
        self._resolve_room_label = resolve_room_label
        self._get_security_cfg = get_security_cfg
        self._get_energy_cfg = get_energy_cfg
        self._get_water_cfg = get_water_cfg
        self._get_iaq_cfg = get_iaq_cfg
        self._get_other_cfg = get_other_cfg
        #: HA 连接状态是否可信。未注入时按旧行为（始终可信）。
        self._ha_states_trustworthy = ha_states_trustworthy or (lambda: True)

    # 安防
    def _resolve_security_alert_channels(self) -> list[str] | None:
        raw = self._get_security_cfg().get("alertChannels")
        if not isinstance(raw, list) or not raw:
            return None
        forced: list[str] = []
        for channel in raw:
            if channel in ("in_app", "email", "webpush") and channel not in forced:
                forced.append(channel)
        if not forced:
            return None
        if "in_app" in forced:
            forced.append("socket")
        return forced

    async def handle_security_alarm(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        desc = format_security_alarm_message(event)
        cooldown_key = f"security_alarm:{event.get('entityId') or event.get('type') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        forced = self._resolve_security_alert_channels()
        if forced is not None:
            channels = forced
        elif event.get("type") in ("smoke", "gas_leak", "water_leak"):
            channels = ["in_app", "socket"]
        else:
            channels = None
        level_raw = str(event.get("level") or "").lower()
        if level_raw in ("high", "danger"):
            alert_level = "danger"
        elif level_raw in ("medium", "warn", "warning"):
            alert_level = "warn"
        elif level_raw in ("low", "info"):
            alert_level = "info"
        else:
            alert_level = "danger"
        opts: dict[str, Any] = {"bypassDnd": True}
        if channels is not None:
            opts["channels"] = channels
        sent = await self._notify(alert_level, desc, "security", event.get("entityId"), opts)
        if not sent:
            return
        self._set_cooldown(cooldown_key, 1 if alert_level == "danger" else 2)

    async def handle_emergency(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        cooldown_key = "security_emergency_notify"
        if self._is_in_cooldown(cooldown_key):
            return
        forced = self._resolve_security_alert_channels()
        opts: dict[str, Any] = {"bypassDnd": True}
        if forced is not None:
            opts["channels"] = forced
        sent = await self._notify(
            "danger",
            f"🆘 紧急求助已触发：{event.get('action') or 'SOS'}",
            "emergency",
            None,
            opts,
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 1)

    # 能耗 / 用水
    async def handle_energy_anomaly(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        cooldown_key = f"energy_anomaly:{event.get('entityId') or event.get('type') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        name = event.get("friendlyName") or event.get("entityId") or "设备"
        detail = f"{name} 功耗异常"
        if event.get("type") == "high_standby":
            average = _format_number(event.get("average"), 0)
            detail = f"{name} 待机功耗 {event.get('current', '?')}W 持续偏高（均值 {average}W）"
        elif event.get("type") == "spike":
            detail = (
                f"{name} 功率突增至 {event.get('current', '?')}W"
                f"（约为均值 {event.get('ratio', '?')} 倍）"
            )
        elif event.get("type") == "sustained_high":
            detail = f"{name} 持续高负荷 {event.get('current', '?')}W 超过 2 小时"
        level = "danger" if event.get("type") == "sustained_high" else "warn"
        sent = await self._notify(level, f"⚡ {detail}", "energy-anomaly", event.get("entityId"))
        if not sent:
            return
        self._set_cooldown(
            cooldown_key, float(self._get_energy_cfg().get("anomalyCooldownMin") or 60)
        )

    async def handle_budget_exceeded(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        cooldown_key = "energy_budget"
        if self._is_in_cooldown(cooldown_key):
            return
        sent = await self._notify(
            "warn",
            f"能源预算告警：{event.get('message') or '本月用能预计超支'}",
            "energy-budget",
        )
        if not sent:
            return
        self._set_cooldown(
            cooldown_key, float(self._get_energy_cfg().get("budgetAlertCooldownMin") or 720)
        )

    async def handle_water_anomaly(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        cooldown_key = f"water:{event.get('entityId') or event.get('type') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        name = event.get("friendlyName") or event.get("entityId") or "水表"
        if event.get("type") == "continuous_flow":
            detail = f"{name} 持续水流 {event.get('flowRate', '?')} L/min，疑似漏水"
        else:
            detail = f"{name} 今日用水 {_format_number(event.get('totalUsage'), 2)} m³，超出阈值"
        sent = await self._notify("danger", detail, "water-monitor", event.get("entityId"))
        if not sent:
            return
        self._set_cooldown(
            cooldown_key, float(self._get_water_cfg().get("anomalyCooldownMin") or 30)
        )

    # 环境
    async def handle_mold_risk(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        cooldown_key = f"mold:{event.get('roomId') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        level = event.get("level")
        level = level if level is not None else 2
        alert_level = "danger" if level >= 3 else "warn"
        room_label = self._resolve_room_label(event.get("roomId"))
        sent = await self._notify(
            alert_level,
            f"🦠 [{room_label}] {event.get('message') or '霉菌风险偏高'}",
            "environment-health",
            event.get("roomId"),
        )
        if not sent:
            return
        self._set_cooldown(
            cooldown_key, float(self._get_iaq_cfg().get("moldAlertCooldownMin") or 10)
        )

    async def handle_iaq_threshold(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        cooldown_key = f"iaq:{event.get('roomId') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        room_label = self._resolve_room_label(event.get("roomId"))
        score = f" IAQ {event.get('iaq')}" if event.get("iaq") is not None else ""
        sent = await self._notify(
            "warn",
            f"🌬️ [{room_label}]{score} "
            f"{event.get('message') or '空气质量指数超阈值，建议通风或开启净化设备'}",
            "environment-health",
            event.get("roomId"),
        )
        if not sent:
            return
        self._set_cooldown(
            cooldown_key, float(self._get_iaq_cfg().get("moldAlertCooldownMin") or 10)
        )

    # 自动化
    async def handle_homeos_automation_notify(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        text = event.get("message") or event.get("title") or "自动化通知"
        await self._notify("info", text, "automation")

    async def handle_automation_failed(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        rule_id = event.get("ruleId") or "unknown"
        # HA（中枢）不可达时**每条**自动化都会失败，而根因只有一个 —— 中枢失联本身已经单独
        # 告过警了。按 ruleId 各自冷却会让一次中枢抖动变成「N 条自动化失败」的风暴，且每条
        # 每 30 分钟重来一轮。这里直接静默：这类失败在中枢恢复后会重现，不会永久丢失信息，
        # 而此刻重复 N 遍只会把真正要看的告警淹掉。
        if not self._ha_states_trustworthy():
            logger.info("HA 连接不可信,跳过自动化失败通知: %s", rule_id)
            return
        cooldown_key = f"automation-failed:{rule_id}"
        if self._is_in_cooldown(cooldown_key):
            return
        name = event.get("name") or rule_id
        summary = event.get("error") or "动作执行失败"
        sent = await self._notify(
            "warn", f"⚠️ 自动化执行失败：[{name}] {summary}", "automation"
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 30)

    async def handle_automation_dropped(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        rule_id = event.get("ruleId") or "unknown"
        cooldown_key = f"automation-dropped:{rule_id}"
        if self._is_in_cooldown(cooldown_key):
            return
        name = event.get("name") or rule_id
        reason = event.get("reason")
        if reason == "concurrency-limit":
            detail = f"并发执行数已达上限({event.get('limit') or '未知'})，本次触发被丢弃"
        elif reason == "mutex-busy":
            detail = f"互斥组 [{event.get('group') or '未知'}] 正被其他自动化占用，本次触发被丢弃"
        else:
            detail = "本次触发被丢弃"
        sent = await self._notify(
            "warn", f"⚠️ 自动化触发被丢弃：[{name}] {detail}", "automation"
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 30)

    # 地震
    async def handle_earthquake_eew_alert(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        cooldown_key = f"earthquake_eew:{event.get('eventId')}"
        if self._is_in_cooldown(cooldown_key):
            return
        sent = await self._notify(
            "danger",
            format_eew_notify_message(event),
            "earthquake-eew",
            event.get("eventId"),
            {"channels": ["in_app", "socket", "webpush"], "title": "地震预警"},
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 10)

    async def handle_earthquake_eew_confirmation(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        cooldown_key = eew_catalog_cooldown_key(str(event.get("eventId") or ""))
        if self._is_in_cooldown(cooldown_key):
            return
        sent = await self._notify(
            "warn",
            format_eew_notify_message(event),
            "earthquake-catalog",
            event.get("eventId"),
            {"channels": ["in_app", "socket", "webpush"], "title": "地震速报(官方已确认)"},
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 10)

    # 顾问 / 墙面板
    async def handle_advisor_tip(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        cooldown_key = f"tip:{event.get('title')}:{event.get('category') or ''}"
        if self._is_in_cooldown(cooldown_key):
            return
        sent = await self._notify(
            "info",
            f"{event.get('title')}: {event.get('message')}",
            f"advisor-{event.get('category') or 'tip'}",
        )
        if not sent:
            return
        try:
            tip_hours = float(self._get_other_cfg().get("tipCooldownHours") or 2)
        except (TypeError, ValueError):
            tip_hours = 2.0
        self._set_cooldown(cooldown_key, max(1, _js_round(tip_hours * 60)))

    async def handle_client_power_low(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        client_id = str(event.get("clientId") or "unknown")
        cooldown_key = f"client_power_low:{client_id}"
        if self._is_in_cooldown(cooldown_key):
            return
        level = f"{_js_round(event['level'])}%" if event.get("level") is not None else "未知"
        sent = await self._notify(
            "warn",
            f"墙面板 {client_id} 电量低（{level}）",
            "client-power",
            client_id,
            {"channels": ["in_app", "socket"]},
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 30)

    async def handle_client_power_charged(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        client_id = str(event.get("clientId") or "unknown")
        cooldown_key = f"client_power_charged:{client_id}"
        if self._is_in_cooldown(cooldown_key):
            return
        level = f"{_js_round(event['level'])}%" if event.get("level") is not None else "未知"
        sent = await self._notify(
            "info",
            f"墙面板 {client_id} 电量已充满（{level}）",
            "client-power",
            client_id,
            {"channels": ["in_app", "socket"]},
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 30)

    # HA 状态变更（冷路径）
    def handle_state_changed(self, event: dict[str, Any] | None) -> None:
        if not self._state_router.should_process("notification_health", event):
            return
        event = event or {}
        new_state = event.get("new_state")
        if not isinstance(new_state, dict):
            return
        entity_id = str(event.get("entity_id") or "")
        attributes = new_state.get("attributes") or {}
        name = attributes.get("friendly_name") or entity_id
        state = new_state.get("state")
        battery_level = attributes.get("battery_level")
        if state == "unavailable":
            _fire_and_forget(self._check_device_offline(entity_id, name))
        if battery_level is not None and battery_level < 20:
            _fire_and_forget(self._check_low_battery(entity_id, name, battery_level))

    def handle_alert_rule_state_changed(self, event: dict[str, Any] | None) -> None:
        if not self._state_router.should_process("alert_rules", event):
            return
        event = event or {}
        new_state = event.get("new_state")
        if not isinstance(new_state, dict):
            return
        entity_id = str(event.get("entity_id") or "")
        state = new_state.get("state")
        attributes = new_state.get("attributes")
        _fire_and_forget(self._evaluate_rules(entity_id, state, attributes or {}))


def _format_number(value: Any, digits: int) -> Any:
    """复刻 JS ``value?.toFixed?.(digits) ?? value``：仅数字类型才格式化。"""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return value
    return f"{float(value):.{digits}f}"


def _js_round(value: Any) -> int:
    """复刻 JS ``Math.round``（半数向上）。"""
    import math

    number = float(value)
    return math.floor(number + 0.5)


def _fire_and_forget(awaitable: Awaitable[Any]) -> None:
    """对齐 Nest ``setImmediate(() => void promise)``：不阻塞状态变更路由。"""
    async def _run() -> None:
        try:
            await awaitable
        except Exception as exc:
            logger.warning("通知异步任务失败: %s", exc)

    try:
        asyncio.get_running_loop().create_task(_run())
    except RuntimeError:
        return


__all__ = ["NotificationEventHandlersHelper"]
