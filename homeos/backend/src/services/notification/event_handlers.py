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
from ..ha_filters import HaStateChangeRouter

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

    # ------------------------------------------------------------------ #
    # 安防
    # ------------------------------------------------------------------ #
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

    async def handle_security_alarm(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        desc = format_security_alarm_message(data)
        cooldown_key = f"security_alarm:{data.get('entityId') or data.get('type') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        forced = self._resolve_security_alert_channels()
        if forced is not None:
            channels = forced
        elif data.get("type") in ("smoke", "gas_leak", "water_leak"):
            channels = ["in_app", "socket"]
        else:
            channels = None
        level_raw = str(data.get("level") or "").lower()
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
        sent = await self._notify(alert_level, desc, "security", data.get("entityId"), opts)
        if not sent:
            return
        self._set_cooldown(cooldown_key, 1 if alert_level == "danger" else 2)

    async def handle_emergency(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        cooldown_key = "security_emergency_notify"
        if self._is_in_cooldown(cooldown_key):
            return
        forced = self._resolve_security_alert_channels()
        opts: dict[str, Any] = {"bypassDnd": True}
        if forced is not None:
            opts["channels"] = forced
        sent = await self._notify(
            "danger",
            f"🆘 紧急求助已触发：{data.get('action') or 'SOS'}",
            "emergency",
            None,
            opts,
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 1)

    # ------------------------------------------------------------------ #
    # 能耗 / 用水
    # ------------------------------------------------------------------ #
    async def handle_energy_anomaly(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        cooldown_key = f"energy_anomaly:{data.get('entityId') or data.get('type') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        name = data.get("friendlyName") or data.get("entityId") or "设备"
        detail = f"{name} 功耗异常"
        if data.get("type") == "high_standby":
            average = _format_number(data.get("average"), 0)
            detail = f"{name} 待机功耗 {data.get('current', '?')}W 持续偏高（均值 {average}W）"
        elif data.get("type") == "spike":
            detail = (
                f"{name} 功率突增至 {data.get('current', '?')}W"
                f"（约为均值 {data.get('ratio', '?')} 倍）"
            )
        elif data.get("type") == "sustained_high":
            detail = f"{name} 持续高负荷 {data.get('current', '?')}W 超过 2 小时"
        level = "danger" if data.get("type") == "sustained_high" else "warn"
        sent = await self._notify(level, f"⚡ {detail}", "energy-anomaly", data.get("entityId"))
        if not sent:
            return
        self._set_cooldown(
            cooldown_key, float(self._get_energy_cfg().get("anomalyCooldownMin") or 60)
        )

    async def handle_budget_exceeded(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        cooldown_key = "energy_budget"
        if self._is_in_cooldown(cooldown_key):
            return
        sent = await self._notify(
            "warn",
            f"能源预算告警：{data.get('message') or '本月用能预计超支'}",
            "energy-budget",
        )
        if not sent:
            return
        self._set_cooldown(
            cooldown_key, float(self._get_energy_cfg().get("budgetAlertCooldownMin") or 720)
        )

    async def handle_water_anomaly(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        cooldown_key = f"water:{data.get('entityId') or data.get('type') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        name = data.get("friendlyName") or data.get("entityId") or "水表"
        if data.get("type") == "continuous_flow":
            detail = f"{name} 持续水流 {data.get('flowRate', '?')} L/min，疑似漏水"
        else:
            detail = f"{name} 今日用水 {_format_number(data.get('totalUsage'), 2)} m³，超出阈值"
        sent = await self._notify("danger", detail, "water-monitor", data.get("entityId"))
        if not sent:
            return
        self._set_cooldown(
            cooldown_key, float(self._get_water_cfg().get("anomalyCooldownMin") or 30)
        )

    # ------------------------------------------------------------------ #
    # 环境
    # ------------------------------------------------------------------ #
    async def handle_mold_risk(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        cooldown_key = f"mold:{data.get('roomId') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        level = data.get("level")
        level = level if level is not None else 2
        alert_level = "danger" if level >= 3 else "warn"
        room_label = self._resolve_room_label(data.get("roomId"))
        sent = await self._notify(
            alert_level,
            f"🦠 [{room_label}] {data.get('message') or '霉菌风险偏高'}",
            "environment-health",
            data.get("roomId"),
        )
        if not sent:
            return
        self._set_cooldown(
            cooldown_key, float(self._get_iaq_cfg().get("moldAlertCooldownMin") or 10)
        )

    async def handle_iaq_threshold(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        cooldown_key = f"iaq:{data.get('roomId') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        room_label = self._resolve_room_label(data.get("roomId"))
        score = f" IAQ {data.get('iaq')}" if data.get("iaq") is not None else ""
        sent = await self._notify(
            "warn",
            f"🌬️ [{room_label}]{score} "
            f"{data.get('message') or '空气质量指数超阈值，建议通风或开启净化设备'}",
            "environment-health",
            data.get("roomId"),
        )
        if not sent:
            return
        self._set_cooldown(
            cooldown_key, float(self._get_iaq_cfg().get("moldAlertCooldownMin") or 10)
        )

    # ------------------------------------------------------------------ #
    # 自动化
    # ------------------------------------------------------------------ #
    async def handle_homeos_automation_notify(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        text = data.get("message") or data.get("title") or "自动化通知"
        await self._notify("info", text, "automation")

    async def handle_automation_failed(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        rule_id = data.get("ruleId") or "unknown"
        cooldown_key = f"automation-failed:{rule_id}"
        if self._is_in_cooldown(cooldown_key):
            return
        name = data.get("name") or rule_id
        summary = data.get("error") or "动作执行失败"
        sent = await self._notify(
            "warn", f"⚠️ 自动化执行失败：[{name}] {summary}", "automation"
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 30)

    async def handle_automation_dropped(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        rule_id = data.get("ruleId") or "unknown"
        cooldown_key = f"automation-dropped:{rule_id}"
        if self._is_in_cooldown(cooldown_key):
            return
        name = data.get("name") or rule_id
        reason = data.get("reason")
        if reason == "concurrency-limit":
            detail = f"并发执行数已达上限({data.get('limit') or '未知'})，本次触发被丢弃"
        elif reason == "mutex-busy":
            detail = f"互斥组 [{data.get('group') or '未知'}] 正被其他自动化占用，本次触发被丢弃"
        else:
            detail = "本次触发被丢弃"
        sent = await self._notify(
            "warn", f"⚠️ 自动化触发被丢弃：[{name}] {detail}", "automation"
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 30)

    # ------------------------------------------------------------------ #
    # 地震
    # ------------------------------------------------------------------ #
    async def handle_earthquake_eew_alert(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        cooldown_key = f"earthquake_eew:{data.get('eventId')}"
        if self._is_in_cooldown(cooldown_key):
            return
        sent = await self._notify(
            "danger",
            format_eew_notify_message(data),
            "earthquake-eew",
            data.get("eventId"),
            {"channels": ["in_app", "socket", "webpush"], "title": "地震预警"},
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 10)

    async def handle_earthquake_eew_confirmation(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        cooldown_key = eew_catalog_cooldown_key(str(data.get("eventId") or ""))
        if self._is_in_cooldown(cooldown_key):
            return
        sent = await self._notify(
            "warn",
            format_eew_notify_message(data),
            "earthquake-catalog",
            data.get("eventId"),
            {"channels": ["in_app", "socket", "webpush"], "title": "地震速报(官方已确认)"},
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, 10)

    # ------------------------------------------------------------------ #
    # 顾问 / 墙面板
    # ------------------------------------------------------------------ #
    async def handle_advisor_tip(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        cooldown_key = f"tip:{data.get('title')}:{data.get('category') or ''}"
        if self._is_in_cooldown(cooldown_key):
            return
        sent = await self._notify(
            "info",
            f"{data.get('title')}: {data.get('message')}",
            f"advisor-{data.get('category') or 'tip'}",
        )
        if not sent:
            return
        try:
            tip_hours = float(self._get_other_cfg().get("tipCooldownHours") or 2)
        except (TypeError, ValueError):
            tip_hours = 2.0
        self._set_cooldown(cooldown_key, max(1, _js_round(tip_hours * 60)))

    async def handle_client_power_low(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        client_id = str(data.get("clientId") or "unknown")
        cooldown_key = f"client_power_low:{client_id}"
        if self._is_in_cooldown(cooldown_key):
            return
        level = f"{_js_round(data['level'])}%" if data.get("level") is not None else "未知"
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

    async def handle_client_power_charged(self, data: dict[str, Any] | None) -> None:
        data = data or {}
        client_id = str(data.get("clientId") or "unknown")
        cooldown_key = f"client_power_charged:{client_id}"
        if self._is_in_cooldown(cooldown_key):
            return
        level = f"{_js_round(data['level'])}%" if data.get("level") is not None else "未知"
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

    # ------------------------------------------------------------------ #
    # HA 状态变更（冷路径）
    # ------------------------------------------------------------------ #
    def handle_state_changed(self, event: dict[str, Any] | None) -> None:
        if not self._state_router.should_process("notification_health", event):
            return
        data = event or {}
        new_state = data.get("new_state")
        if not isinstance(new_state, dict):
            return
        entity_id = str(data.get("entity_id") or "")
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
        data = event or {}
        new_state = data.get("new_state")
        if not isinstance(new_state, dict):
            return
        entity_id = str(data.get("entity_id") or "")
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
        except Exception as exc:  # noqa: BLE001
            logger.warning("通知异步任务失败: %s", exc)

    try:
        asyncio.get_running_loop().create_task(_run())
    except RuntimeError:
        return


__all__ = ["NotificationEventHandlersHelper"]
