"""通知模块配置读取（对齐 ``appConfig.get('notification'|'energy'|'water'|'iaq'|'other')``）。

Nest 的 ``AppConfigService.get(section)`` 返回「默认值 + 已存配置」的合并结果；
本模块复刻 notification / energy / water / iaq / other / security / frontend 分区，
并提供 ``updateSettings`` 需要的分区字段合并能力。
"""

from __future__ import annotations

import copy
from typing import Any

from ..alerts.channels import resolve_notification_fetch_limit
from ..app_config.defaults import DEFAULT_APP_CONFIG
from ..security.config import (
    DEFAULT_FRONTEND_CONFIG,
    DEFAULT_SECURITY_CONFIG,
    load_frontend_config,
    load_home_timezone,
)
from ...platform.core.runtime.app_config import load_raw_config, merge_raw_config_section

#: 各分区默认值同样单点在 ``domains.app_config.defaults``；本模块只保留「本域真正读取的
#: 那一份深拷贝」。过去这里是五个整段字面量，与 defaults.py 各自维护 —— 两边一旦不同步，
#: 「导出给前端的默认值」和「后端 tick 时用的默认值」就会是两套数字。
DEFAULT_NOTIFICATION_CONFIG: dict[str, Any] = copy.deepcopy(DEFAULT_APP_CONFIG["notification"])

DEFAULT_ENERGY_CONFIG: dict[str, Any] = copy.deepcopy(DEFAULT_APP_CONFIG["energy"])

DEFAULT_WATER_CONFIG: dict[str, Any] = copy.deepcopy(DEFAULT_APP_CONFIG["water"])

DEFAULT_IAQ_CONFIG: dict[str, Any] = copy.deepcopy(DEFAULT_APP_CONFIG["iaq"])

#: ``other`` 分区里只有这两项属于「通知 / 播报」面；其余（事件日志、备份、时区）不在这里镜像。
DEFAULT_OTHER_CONFIG: dict[str, Any] = {
    "speakCooldownMin": DEFAULT_APP_CONFIG["other"]["speakCooldownMin"],
    "tipCooldownHours": DEFAULT_APP_CONFIG["other"]["tipCooldownHours"],
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
    "DEFAULT_ENERGY_CONFIG",
    "DEFAULT_FRONTEND_CONFIG",
    "DEFAULT_IAQ_CONFIG",
    "DEFAULT_NOTIFICATION_CONFIG",
    "DEFAULT_OTHER_CONFIG",
    "DEFAULT_WATER_CONFIG",
    "load_energy_config",
    "load_env_sensor_map",
    "load_frontend_config",
    "load_home_timezone",
    "load_iaq_config",
    "load_notification_config",
    "load_other_config",
    "load_security_section",
    "load_water_config",
    "merge_notification_settings",
    "resolve_notification_fetch_limit",
]
