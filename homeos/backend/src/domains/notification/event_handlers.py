"""领域事件 → 通知的处理器集合（对齐 ``modules/notification/event-handlers.helper.ts``）。

每个 handler 负责：冷却去重 → 级别映射 → 文案格式化 → 渠道选择 → 触发通知。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any, ClassVar

from ..alerts.messages import format_security_alarm_message
from ..earthquake.state import format_eew_notify_message
from ..earthquake.types import eew_catalog_cooldown_key
from ..ha.config.ha_filters import HaStateChangeRouter
from ...platform.core.runtime.background import spawn_background


def _numeric_attribute(raw: Any) -> float | None:
    """把实体属性里的数值归一成 ``float``；非数值返回 ``None``。

    部分集成（模板传感器、第三方设备）把 ``battery_level`` 报成字符串 ``"15"``。
    直接在字符串上比 ``< 20`` 会抛 ``TypeError``，整条通知处理链被跳过 ——
    低电量告警永远不触发，而且每次状态变化都要再抛一次。
    """
    if isinstance(raw, bool) or raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, str):
        try:
            return float(raw.strip())
        except ValueError:
            logger.debug("属性值不是数值，按非数值处理: %r", raw)
            return None
    return None


logger = logging.getLogger("homeos.notification.events")

#: ``unknown`` 是这些域的正常态（没有动作可执行 / 尚未触发过），
#: 把它们当「离线」会产生永久性误报。
_UNKNOWN_IS_NORMAL_DOMAINS = frozenset(
    {
        "button",
        "input_button",
        "script",
        "scene",
        "automation",
        "event",
        "todo",
        "counter",
        "select",
        "input_select",
        "tts",
        "stt",
    }
)


def _unknown_reports_offline(entity_id: str) -> bool:
    """``state → unknown`` 是否应当按「设备已离线」处理。"""
    domain = entity_id.partition(".")[0]
    return domain not in _UNKNOWN_IS_NORMAL_DOMAINS


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
    #: 安防告警可强制指定的渠道：与 ``alerts.channels.LAN_NOTIFICATION_CHANNELS`` 的
    #: 外部投递子集一致（``socket`` 由 ``in_app`` 派生，``tts`` 是本地播报不在此列）。
    #: 曾漏掉 ``wecom``：通知投递层与告警规则都支持企业微信，安防告警却永远走不到它，
    #: 只能站内 + 邮件 / WebPush —— 用户配了企微也收不到入侵与烟感告警。
    SECURITY_ALERT_CHANNELS = ("in_app", "email", "webpush", "wecom")

    def _resolve_security_alert_channels(self) -> list[str] | None:
        raw = self._get_security_cfg().get("alertChannels")
        if not isinstance(raw, list) or not raw:
            return None
        forced: list[str] = []
        for channel in raw:
            if channel in self.SECURITY_ALERT_CHANNELS and channel not in forced:
                forced.append(channel)
        if not forced:
            return None
        if "in_app" in forced:
            forced.append("socket")
        return forced

    #: 危险事件类型 → 语音播报开关的键。
    #:
    #: 这条映射不能省：安防告警的 ``source`` 恒为 ``security``（前端筛选/统计按它聚合），
    #: 而语音矩阵把「烟雾 / 燃气 / 漏水」拆成三个独立开关。不显式带 ``voiceKey``，
    #: 那三个开关永远命不中 —— 又回到「设置页有开关、运行时无效」的老问题。
    _HAZARD_VOICE_KEYS: ClassVar[dict[str, str]] = {
        "smoke": "safetySmoke",
        "gas_leak": "safetyGas",
        "water_leak": "safetyWater",
    }

    async def handle_security_alarm(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        drill = bool(event.get("drillMode"))
        desc = format_security_alarm_message(event)
        cooldown_key = f"security_alarm:{event.get('entityId') or event.get('type') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        forced = None if drill else self._resolve_security_alert_channels()
        if drill:
            # 演习只在应用内留一条可见记录：绝不能按真实火警外呼、也不绕过免打扰。
            channels = ["in_app", "socket"]
        elif forced is not None:
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
        opts = self._alarm_notify_opts(event, channels, drill)
        sent = await self._notify(alert_level, desc, "security", event.get("entityId"), opts)
        if not sent:
            return
        self._set_cooldown(cooldown_key, 1 if alert_level == "danger" else 2)

    def _alarm_notify_opts(self, event: dict[str, Any], channels: list[str] | None, drill: bool) -> dict[str, Any]:
        """安防告警的投递选项（渠道 + 语音播报键）。

        抽出来只为不让 ``handle_security_alarm`` 的分支继续增长：这里每加一类危险
        就要多一层 if，而那段代码本来已经同时处理等级映射、渠道与冷却。
        """
        opts: dict[str, Any] = {"bypassDnd": not drill}
        if channels is not None:
            opts["channels"] = channels
        voice_key = self._HAZARD_VOICE_KEYS.get(str(event.get("type") or ""))
        if voice_key and not drill:
            # 演习不播报：与「不按真实火警外呼」同一条原则。
            opts["voiceKey"] = voice_key
        return opts

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
        kind = event.get("type")
        if kind == "daily_high":
            # 后台监测器算出来的就是这几个数（today / average / ratio），不展示等于白算。
            detail = (
                f"今日用电 {_format_number(event.get('current'), 1)} kWh，"
                f"约为近期日均 {_format_number(event.get('average'), 1)} kWh 的 {event.get('ratio', '?')} 倍"
            )
        elif kind == "high_standby":
            average = _format_number(event.get("average"), 0)
            detail = f"{name} 待机功耗 {event.get('current', '?')}W 持续偏高（均值 {average}W）"
        elif kind == "spike":
            detail = f"{name} 功率突增至 {event.get('current', '?')}W（约为均值 {event.get('ratio', '?')} 倍）"
        elif kind == "sustained_high":
            detail = f"{name} 持续高负荷 {event.get('current', '?')}W 超过 2 小时"
        level = "danger" if kind == "sustained_high" else "warn"
        sent = await self._notify(level, f"⚡ {detail}", "energy-anomaly", event.get("entityId"))
        if not sent:
            return
        self._set_cooldown(cooldown_key, float(self._get_energy_cfg().get("anomalyCooldownMin") or 60))

    async def handle_balance_low(self, event: dict[str, Any] | None) -> None:
        """预付费余额不足：欠费会直接断电，属于「断供级」风险，按 danger 处理。"""
        event = event or {}
        cooldown_key = f"energy_balance:{event.get('entityId') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        detail = event.get("detail") or "预付费余额不足，请及时充值"
        sent = await self._notify("danger", f"💳 {detail}", "energy-balance", event.get("entityId"))
        if not sent:
            return
        self._set_cooldown(cooldown_key, float(self._get_energy_cfg().get("budgetAlertCooldownMin") or 720))

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
        self._set_cooldown(cooldown_key, float(self._get_energy_cfg().get("budgetAlertCooldownMin") or 720))

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
        self._set_cooldown(cooldown_key, float(self._get_water_cfg().get("anomalyCooldownMin") or 30))

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
        self._set_cooldown(cooldown_key, float(self._get_iaq_cfg().get("moldAlertCooldownMin") or 10))

    async def handle_iaq_threshold(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        cooldown_key = f"iaq:{event.get('roomId') or 'global'}"
        if self._is_in_cooldown(cooldown_key):
            return
        room_label = self._resolve_room_label(event.get("roomId"))
        score = f" IAQ {event.get('iaq')}" if event.get("iaq") is not None else ""
        sent = await self._notify(
            "warn",
            f"🌬️ [{room_label}]{score} {event.get('message') or '空气质量指数超阈值，建议通风或开启净化设备'}",
            "environment-health",
            event.get("roomId"),
        )
        if not sent:
            return
        self._set_cooldown(cooldown_key, float(self._get_iaq_cfg().get("moldAlertCooldownMin") or 10))

    # 自动化
    async def handle_homeos_automation_notify(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        text = event.get("message") or event.get("title") or "自动化通知"
        await self._notify("info", text, "automation")

    async def handle_automation_dropped(self, event: dict[str, Any] | None) -> None:
        event = event or {}
        # 两种生产者：HA 自动化（``ruleId``）与**离线命令队列**（``entityId`` + ``domain``）。
        # 后者以前是静默丢弃：用户在面板按下「关灯」，HA 离线 → 命令入队 → 超时被 pop，
        # 界面显示成功、灯却一直亮着。这里必须点名是哪台设备、哪条命令、为什么丢。
        entity_id = event.get("entityId")
        rule_id = event.get("ruleId") or entity_id or "unknown"
        cooldown_key = f"automation-dropped:{rule_id}"
        if self._is_in_cooldown(cooldown_key):
            return
        name = event.get("name") or event.get("friendlyName") or entity_id or rule_id
        reason = event.get("reason")
        if reason == "concurrency-limit":
            detail = f"并发执行数已达上限({event.get('limit') or '未知'})，本次触发被丢弃"
        elif reason == "mutex-busy":
            detail = f"互斥组 [{event.get('group') or '未知'}] 正被其他自动化占用，本次触发被丢弃"
        elif reason == "expired":
            service = event.get("service") or "命令"
            detail = f"{name} 的离线命令（{service}）等待超时，已丢弃 —— 设备上没有执行"
        elif reason == "overflow":
            service = event.get("service") or "命令"
            detail = f"{name} 的离线命令（{service}）因队列已满被丢弃 —— 设备上没有执行"
        elif reason == "rejected":
            service = event.get("service") or "命令"
            detail = f"{name} 的离线命令（{service}）被中枢拒绝，已丢弃"
        else:
            detail = "本次触发被丢弃"
        sent = await self._notify("warn", f"⚠️ 命令未执行：[{name}] {detail}", "automation")
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
        # 0 = 不限制（配置校验允许 0–72）。旧写法 `float(... or 2)` 把 0 当成「未配置」
        # 又改回 2 小时，等于「关掉冷却」这个选项在界面上存在、实际不生效。
        raw_hours = self._get_other_cfg().get("tipCooldownHours")
        try:
            tip_hours = 2.0 if raw_hours is None else float(raw_hours)
        except (TypeError, ValueError):  # fmt: skip
            tip_hours = 2.0
        if tip_hours > 0:
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
        battery_level = _numeric_attribute(attributes.get("battery_level"))
        if state == "unavailable":
            _fire_and_forget(self._check_device_offline(entity_id, name))
        elif state == "unknown" and _unknown_reports_offline(entity_id):
            # 有些设备掉线时不再上报，HA 把 state 从「on」改成「unknown」而非
            # 「unavailable」：只认 unavailable 会让它们永远不告警。
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
        asyncio.get_running_loop()
    except RuntimeError:
        return
    # 用 spawn_background 持有强引用：裸 create_task 的返回值无人保存，任务可能在
    # 执行途中被 GC（RUF006），导致离线/低电量/规则评估被静默丢弃。
    spawn_background(_run())


__all__ = ["NotificationEventHandlersHelper"]
