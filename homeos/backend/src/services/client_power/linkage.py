"""客户端电量联动辅助函数（对齐 ``client-power/linkage.helper.ts``）。

基于客户端上报电量，按滞回阈值（lowPercent / highPercent）计算单开关充电联动动作，
支持峰谷错峰（touEnabled）：高峰时段暂缓充电，仅当跌破应急阈值时强制充电。
"""

from __future__ import annotations

import math
from typing import Any

from .types import DEFAULT_CLIENT_POWER_SELF_CHARGE, ClientSystemState, SwitchLinkageAction


def clamp_percent(value: Any) -> float | None:
    """归一化电量到 0–100 的两位小数百分比。"""
    if value is None or isinstance(value, bool):
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(num) or math.isinf(num):
        return None
    return max(0.0, min(100.0, round(num * 100) / 100))


def _resolve_peak_critical_percent(low_percent: float, raw: Any) -> float:
    """峰段应急阈值：缺省 ``lowPercent-5``，钳到 ``[0, lowPercent)``。"""
    unclamped = clamp_percent(raw)
    if unclamped is None:
        unclamped = low_percent - 5
    exclusive_high = max(0.0, low_percent - 0.01)
    return max(0.0, min(unclamped, exclusive_high))


def _is_peak_emergency(tou_enabled: bool, is_peak: bool, critical_percent: float) -> bool:
    return tou_enabled and is_peak and critical_percent > 0


def _num(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _fmt(value: float) -> str:
    """对齐 JS 数字转字符串：整数不带小数位。"""
    return str(int(value)) if float(value).is_integer() else str(value)


def evaluate_self_charge_actions(
    client_cfg: dict[str, Any],
    state: ClientSystemState,
    *,
    is_peak: bool = False,
    time_of_use_active: bool = True,
) -> list[SwitchLinkageAction]:
    """单开关滞回充电：低于低阈值开、达到高阈值关，中间区间保持。"""
    actions: list[SwitchLinkageAction] = []
    self_charge = client_cfg.get("selfCharge") if isinstance(client_cfg, dict) else None
    self_charge = self_charge if isinstance(self_charge, dict) else {}
    label = client_cfg.get("label")
    client_id = client_cfg.get("id")

    if not client_cfg.get("enabled") or not self_charge.get("enabled"):
        return actions

    entity_id = str(client_cfg.get("chargerSwitchEntityId") or "").strip()
    if not entity_id:
        return actions

    level = clamp_percent(state.level)
    if level is None:
        return actions

    low_percent = _num(self_charge.get("lowPercent"), DEFAULT_CLIENT_POWER_SELF_CHARGE["lowPercent"])
    high_percent = _num(
        self_charge.get("highPercent"), DEFAULT_CLIENT_POWER_SELF_CHARGE["highPercent"]
    )
    tou_enabled = self_charge.get("touEnabled") is True and time_of_use_active is not False
    critical_percent = _resolve_peak_critical_percent(low_percent, self_charge.get("criticalPercent"))
    peak_emergency = _is_peak_emergency(tou_enabled, is_peak, critical_percent)

    if level < low_percent:
        # 峰谷错峰：峰段仅当跌破应急阈值时强制充电；处于 [critical, lowPercent) 时保持现状（死区），
        # 避免在应急阈值处反复通断（充过临界点即关、掉回又开，形成震荡）。
        if peak_emergency and level >= critical_percent:
            return actions
        reason = (
            f"客户端 {label} 电量 {_fmt(level)}% 低于应急阈值 {_fmt(critical_percent)}%，峰段强制充电"
            if peak_emergency
            else f"客户端 {label} 电量 {_fmt(level)}% 低于 {_fmt(low_percent)}%，打开开关 {entity_id}"
        )
        actions.append(
            SwitchLinkageAction(
                entity_id=entity_id,
                domain="switch",
                service="turn_on",
                reason=reason,
                cooldown_key=f"selfCharge:on:{client_id}",
            )
        )
    elif level >= high_percent:
        actions.append(
            SwitchLinkageAction(
                entity_id=entity_id,
                domain="switch",
                service="turn_off",
                reason=f"客户端 {label} 电量 {_fmt(level)}% 已达 {_fmt(high_percent)}%，关闭开关 {entity_id}",
                cooldown_key=f"selfCharge:off:{client_id}",
            )
        )
    elif tou_enabled and is_peak:
        # 滞回带：谷段已打开充电器后进入峰段时仍应关充，避免用峰电充到 high。
        actions.append(
            SwitchLinkageAction(
                entity_id=entity_id,
                domain="switch",
                service="turn_off",
                reason=(
                    f"客户端 {label} 处于峰电时段，电量 {_fmt(level)}% 暂缓充电"
                    f"（谷段再充，应急阈值 {_fmt(critical_percent)}%）"
                ),
                cooldown_key=f"selfCharge:peak:{client_id}",
            )
        )
    elif tou_enabled and not is_peak:
        # 谷/平段：峰段暂缓后恢复充电，直到 high（「高峰暂缓，谷段再充」）。
        actions.append(
            SwitchLinkageAction(
                entity_id=entity_id,
                domain="switch",
                service="turn_on",
                reason=(
                    f"客户端 {label} 处于谷/平段，电量 {_fmt(level)}% 恢复充电"
                    f"（目标 {_fmt(high_percent)}%）"
                ),
                cooldown_key=f"selfCharge:on:{client_id}",
            )
        )

    return actions


__all__ = ["clamp_percent", "evaluate_self_charge_actions"]
