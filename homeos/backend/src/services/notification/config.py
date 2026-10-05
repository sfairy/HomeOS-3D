"""通知模块配置读取（对齐 ``appConfig.get('notification'|'energy'|'water'|'iaq'|'other')``）。

Nest 的 ``AppConfigService.get(section)`` 返回「默认值 + 已存配置」的合并结果；
本模块复刻 notification / energy / water / iaq / other / security / frontend 分区，
并提供 ``updateSettings`` 需要的分区字段合并能力。
"""

from __future__ import annotations

from typing import Any

from ...core.app_config import load_raw_config, merge_raw_config_section
from ..alerts.channels import resolve_notification_fetch_limit
from ..security.config import (
    DEFAULT_FRONTEND_CONFIG,
    DEFAULT_SECURITY_CONFIG,
    load_frontend_config,
)

#: 通知分区完整默认值（逐条对齐 backend/src/shared/app-config/defaults.ts）。
DEFAULT_NOTIFICATION_CONFIG: dict[str, Any] = {
    "dndStart": 22,
    "dndEnd": 8,
    "maxNotifications": 500,
    "globalNotifyEnabled": True,
    "importantNotifyEnabled": True,
    "offlineNotifyEnabled": True,
    "lowBatteryNotifyEnabled": True,
    "offlineCooldownMin": 30,
    "lowBatteryCooldownMin": 120,
}

DEFAULT_ENERGY_CONFIG: dict[str, Any] = {
    "meterEntityId": "",
    "circuitEntityIds": [],
    "learningPeriodDays": 7,
    "learningStartedAt": "",
    "anomalyCooldownMin": 60,
    "budgetAlertCooldownMin": 720,
}

DEFAULT_WATER_CONFIG: dict[str, Any] = {
    "anomalyCooldownMin": 30,
    "mainValveEntityId": "",
}

DEFAULT_IAQ_CONFIG: dict[str, Any] = {
    "moldAlertCooldownMin": 10,
}

DEFAULT_OTHER_CONFIG: dict[str, Any] = {
    "speakCooldownMin": 10,
    "tipCooldownHours": 2,
}


def _section(raw: dict[str, Any], name: str) -> dict[str, Any]:
    value = raw.get(name)
    return value if isinstance(value, dict) else {}


def load_notification_config(session) -> dict[str, Any]:
    """读取通知分区（默认值 + 已存覆盖）。"""
    raw = load_raw_config(session)
    return {**DEFAULT_NOTIFICATION_CONFIG, **_section(raw, "notification")}


def load_energy_config(session) -> dict[str, Any]:
    raw = load_raw_config(session)
    return {**DEFAULT_ENERGY_CONFIG, **_section(raw, "energy")}


def load_water_config(session) -> dict[str, Any]:
    raw = load_raw_config(session)
    return {**DEFAULT_WATER_CONFIG, **_section(raw, "water")}


def load_iaq_config(session) -> dict[str, Any]:
    raw = load_raw_config(session)
    return {**DEFAULT_IAQ_CONFIG, **_section(raw, "iaq")}


def load_other_config(session) -> dict[str, Any]:
    raw = load_raw_config(session)
    return {**DEFAULT_OTHER_CONFIG, **_section(raw, "other")}


def load_env_sensor_map(session) -> dict[str, Any]:
    """读取 ``envSensorMap``（房间环境传感器映射），非对象时返回空表。"""
    raw = load_raw_config(session)
    value = raw.get("envSensorMap")
    return value if isinstance(value, dict) else {}


def load_security_section(session) -> dict[str, Any]:
    raw = load_raw_config(session)
    return {**DEFAULT_SECURITY_CONFIG, **_section(raw, "security")}


def merge_notification_settings(session_factory, partial: dict[str, Any]) -> None:
    """把全屋级通知设置增量写回 SystemConfig 的 ``notification`` 分区。"""
    if not partial:
        return
    merge_raw_config_section(session_factory, "notification", partial)


__all__ = [
    "DEFAULT_NOTIFICATION_CONFIG",
    "DEFAULT_ENERGY_CONFIG",
    "DEFAULT_WATER_CONFIG",
    "DEFAULT_IAQ_CONFIG",
    "DEFAULT_OTHER_CONFIG",
    "DEFAULT_FRONTEND_CONFIG",
    "load_notification_config",
    "load_energy_config",
    "load_water_config",
    "load_iaq_config",
    "load_other_config",
    "load_env_sensor_map",
    "load_security_section",
    "load_frontend_config",
    "resolve_notification_fetch_limit",
    "merge_notification_settings",
]
