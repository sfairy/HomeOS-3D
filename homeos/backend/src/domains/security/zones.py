"""安防区域工具（对齐 ``@homeos/shared`` security-map.ts）。"""

from __future__ import annotations

from typing import Any

SECURITY_ARMING_MODES = ("armed_home", "armed_away", "armed_night", "disarmed")

#: 安防模式 → 匹配家庭模式名称的正则。
SECURITY_TO_HOME_MODE_NAME_PATTERN: dict[str, str] = {
    "armed_away": r"离家|away|外出|度假",
    "armed_home": r"回家|在家|居家|home",
    "armed_night": r"睡眠|夜间|night|晚安",
    "disarmed": r"撤防|disarm",
}


def normalize_zone_type(raw: Any) -> str:
    if raw in ("perimeter", "interior", "all"):
        return str(raw)
    return "all"


def should_zone_alarm_in_mode(mode: str, zone_type: str | None) -> bool:
    zt = zone_type or "all"
    if mode == "disarmed":
        return False
    if mode == "armed_away":
        return True
    if mode in ("armed_home", "armed_night"):
        return zt != "interior"
    return True


def resolve_home_mode_link_for_security_change(
    *,
    mode: str,
    linked_id: str | None,
    modes: list[dict[str, Any]],
    allow_name_fallback: bool = True,
) -> dict[str, Any]:
    """对齐 ``resolveHomeModeLinkForSecurityChange``：activate / deactivate / none。"""
    import re

    linked = (linked_id or "").strip()
    if linked:
        target = next((m for m in modes if m.get("id") == linked), None)
        if target is not None:
            return {"action": "activate", "modeId": target["id"]}
        if mode == "disarmed" and allow_name_fallback:
            return {"action": "deactivate"}
        return {"action": "none"}

    if not allow_name_fallback:
        return {"action": "none"}

    if mode == "disarmed":
        return {"action": "deactivate"}

    pattern = SECURITY_TO_HOME_MODE_NAME_PATTERN.get(mode)
    if not pattern:
        return {"action": "none"}
    compiled = re.compile(pattern, re.IGNORECASE)
    target = next((m for m in modes if compiled.search(str(m.get("name") or ""))), None)
    if target is None:
        return {"action": "none"}
    return {"action": "activate", "modeId": target["id"]}
