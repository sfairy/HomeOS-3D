"""安防配置读取（对齐 ``appConfig.get('security')`` 与 ``get('frontend')`` / ``get('notification')``）。

Nest 的 ``AppConfigService.get(section)`` 会返回「默认值 + 已存配置」的合并结果；
本模块用同样的语义复刻 ``security`` / ``frontend`` / ``notification`` 三个分区，
并附带 ``parseOptionalInt``（对齐 ``common/crud/pagination.util``）。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...core.app_config import load_raw_config

#: 安防分区默认值（逐条对齐 backend/src/shared/app-config/defaults.ts）。
DEFAULT_SECURITY_CONFIG: dict[str, Any] = {
    "sensorAlertCooldownSec": 60,
    "awayConfirmMin": 5,
    "requireConfiguredPersons": True,
    "presencePersons": [],
    "mmWaveFusePresence": True,
    "autoArmOnEveryoneLeft": False,
    "autoUpgradeToAwayOnEveryoneLeft": False,
    "calendarArmOnAway": False,
    "autoDisarmOnFirstHome": False,
    "linkAwaySimOnArmAway": False,
    "linkHomeModeOnSecurityChange": True,
    "frigatePersonAlarmModes": "armed_away,armed_night",
    "emergencyCooldownSec": 60,
    "frigateMaxEvents": 50,
    "frigateDedupMs": 30_000,
    "awaySimBrightnessMin": 40,
    "awaySimBrightnessRange": 50,
    "awaySimIntervalMinMax": {"min": 8, "max": 25},
    "configCacheTtlMs": 60_000,
    "alertChannels": ["in_app"],
    "alertBypassDnd": True,
    "armExitGraceSeconds": 30,
}

DEFAULT_FRONTEND_CONFIG: dict[str, Any] = {
    "maxRemoteNotifications": 100,
}

DEFAULT_NOTIFICATION_CONFIG: dict[str, Any] = {
    "maxNotifications": 500,
}

DEFAULT_SECURITY_EMERGENCY: dict[str, Any] = {
    "mode": "full_home",
    "appendBuiltin": False,
    "appendMode": "full_home",
    "lightBrightnessPct": 100,
    "lightPool": [],
    "autoArmAway": False,
    "actions": [],
    "useBuiltinFallback": True,
}


def _section(raw: dict[str, Any], name: str) -> dict[str, Any]:
    value = raw.get(name)
    return value if isinstance(value, dict) else {}


def load_security_config(session: Session) -> dict[str, Any]:
    """读取安防分区（默认值 + 已存覆盖）。"""
    raw = load_raw_config(session)
    return {**DEFAULT_SECURITY_CONFIG, **_section(raw, "security")}


def load_frontend_config(session: Session) -> dict[str, Any]:
    raw = load_raw_config(session)
    return {**DEFAULT_FRONTEND_CONFIG, **_section(raw, "frontend")}


def load_notification_config(session: Session) -> dict[str, Any]:
    raw = load_raw_config(session)
    return {**DEFAULT_NOTIFICATION_CONFIG, **_section(raw, "notification")}


def load_home_timezone(session: Session) -> str | None:
    raw = load_raw_config(session)
    tz = raw.get("homeTimezone")
    return tz.strip() if isinstance(tz, str) and tz.strip() else None


def resolve_notification_fetch_limit(
    limit: Any,
    frontend: dict[str, Any],
    notification: dict[str, Any],
) -> int:
    """对齐 ``resolveNotificationFetchLimit``：clamp 到 [1, maxNotifications]。"""
    default_fetch = (
        int(frontend.get("maxRemoteNotifications"))
        if _positive_int(frontend.get("maxRemoteNotifications"))
        else 100
    )
    storage_cap = (
        int(notification.get("maxNotifications"))
        if _positive_int(notification.get("maxNotifications"))
        else 500
    )
    parsed = int(limit) if _positive_int(limit) else default_fetch
    return min(max(parsed, 1), storage_cap)


def parse_optional_int(raw: Any, default: int | None = None) -> int | None:
    """对齐 ``parseOptionalInt``：缺失/非法返回 default，否则取整。"""
    if raw is None or raw == "":
        return default
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return default


def _positive_int(value: Any) -> bool:
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False
