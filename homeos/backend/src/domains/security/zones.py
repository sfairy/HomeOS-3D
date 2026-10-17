"""安防区域工具（对齐 ``@homeos/shared`` security-map.ts）。"""

from __future__ import annotations

import re
from typing import Any

SECURITY_ARMING_MODES = ("armed_home", "armed_away", "armed_night", "disarmed")

#: 安防模式的中文名（日志与提示里用；``armed_home`` 这种枚举值对用户没有意义）。
SECURITY_MODE_LABELS: dict[str, str] = {
    "armed_home": "在家布防",
    "armed_away": "离家布防",
    "armed_night": "夜间布防",
    "disarmed": "撤防",
}


def security_mode_label(mode: Any) -> str:
    """安防模式 → 中文名；未知值原样返回（不吞信息）。"""
    text = str(mode or "").strip()
    return SECURITY_MODE_LABELS.get(text, text or "未知")

#: 安防模式 → 匹配家庭模式名称的正则。
SECURITY_TO_HOME_MODE_NAME_PATTERN: dict[str, str] = {
    "armed_away": r"离家|away|外出|度假",
    "armed_home": r"回家|在家|居家|home",
    "armed_night": r"睡眠|夜间|night|晚安",
    "disarmed": r"撤防|disarm",
}

#: 预编译形态：名称回退匹配在每次模式切换时都会跑，避免在函数里反复编译同一批模式。
_SECURITY_TO_HOME_MODE_NAME_REGEX: dict[str, re.Pattern[str]] = {
    mode: re.compile(pattern, re.IGNORECASE)
    for mode, pattern in SECURITY_TO_HOME_MODE_NAME_PATTERN.items()
}


def normalize_zone_type(raw: Any) -> str:
    if raw in ("perimeter", "interior", "all"):
        return str(raw)
    return "all"


def should_zone_alarm_in_mode(mode: str, zone_type: str | None) -> bool:
    normalized_zone_type = zone_type or "all"
    if mode == "disarmed":
        return False
    if mode == "armed_away":
        return True
    if mode in ("armed_home", "armed_night"):
        return normalized_zone_type != "interior"
    return True


def resolve_home_mode_link_for_security_change(
    *,
    mode: str,
    linked_id: str | None,
    modes: list[dict[str, Any]],
    allow_name_fallback: bool = True,
) -> dict[str, Any]:
    """对齐 ``resolveHomeModeLinkForSecurityChange``：activate / deactivate / none。"""
    linked = (linked_id or "").strip()
    if linked:
        target = next((home_mode for home_mode in modes if home_mode.get("id") == linked), None)
        if target is not None:
            return {"action": "activate", "modeId": target["id"]}
        if mode == "disarmed" and allow_name_fallback:
            return {"action": "deactivate"}
        return {"action": "none"}

    if not allow_name_fallback:
        return {"action": "none"}

    if mode == "disarmed":
        return {"action": "deactivate"}

    if not SECURITY_TO_HOME_MODE_NAME_PATTERN.get(mode):
        return {"action": "none"}
    compiled = _SECURITY_TO_HOME_MODE_NAME_REGEX[mode]
    target = next(
        (home_mode for home_mode in modes if compiled.search(str(home_mode.get("name") or ""))), None
    )
    if target is None:
        return {"action": "none"}
    return {"action": "activate", "modeId": target["id"]}
