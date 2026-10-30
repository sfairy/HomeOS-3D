"""应用配置分区校验（对齐 ``backend/src/shared/app-config/validate/*``）。

按分区族拆成子模块，本模块只保留分发入口与公共再导出；
``from ...domains.app_config.validate import X`` 的既有调用面不变。
"""

from __future__ import annotations

import copy
from typing import Any

from .core import (
    AppConfigValidationError,
    FieldError,
    is_entity_id,
    num_in,
    require_bool,
    validate_entity_id_list,
    validate_optional_entity_id,
)
from .energy import (
    _validate_energy,
    _validate_pricing,
    clock_ranges_overlap,
    normalize_pricing_patch,
)
from .sections_ops import (
    _validate_client_power,
    _validate_command_proxy,
    _validate_env_sensor_map,
    _validate_external,
    _validate_ha_connector,
    _validate_home_mode,
    _validate_ops,
    _validate_other,
    _validate_profiles,
    _validate_retention,
    _validate_state_store,
    _validate_webrtc,
    _validate_ws_push,
)
from .sections_ui import (
    _validate_frontend,
    _validate_media_playlists,
    _validate_screensaver,
    _validate_ui,
    _validate_voice,
    validate_voice_commands_array,
)
from .security import (
    _validate_auth,
    _validate_circadian,
    _validate_iaq,
    _validate_notification,
    _validate_security,
    _validate_water,
)
from ..constants import PUBLIC_CONFIG_SECTIONS  # noqa: F401 - 保持既有 re-export 便利  # pyright: ignore[reportUnusedImport]
from ....platform.core.errors import bad_request

__all__ = [
    "AppConfigValidationError",
    "FieldError",
    "clock_ranges_overlap",
    "is_entity_id",
    "normalize_pricing_patch",
    "num_in",
    "require_bool",
    "validate_app_config_full",
    "validate_app_config_partial",
    "validate_app_config_replace_import",
    "validate_app_config_section",
    "validate_entity_id_list",
    "validate_optional_entity_id",
    "validate_voice_commands_array",
]


_SECTION_VALIDATORS: dict[str, Any] = {
    "notification": _validate_notification,
    "security": _validate_security,
    "water": _validate_water,
    "iaq": _validate_iaq,
    "circadian": _validate_circadian,
    "energy": _validate_energy,
    "pricing": _validate_pricing,
    "frontend": _validate_frontend,
    "screensaver": _validate_screensaver,
    "voice": _validate_voice,
    "auth": _validate_auth,
    "ops": _validate_ops,
    "haConnector": _validate_ha_connector,
    "stateStore": _validate_state_store,
    "homeMode": _validate_home_mode,
    "other": _validate_other,
    "retention": _validate_retention,
    "external": _validate_external,
    "wsPush": _validate_ws_push,
    "commandProxy": _validate_command_proxy,
    "webrtc": _validate_webrtc,
    "clientPower": _validate_client_power,
    "envSensorMap": _validate_env_sensor_map,
    "profiles": _validate_profiles,
    "ui": _validate_ui,
    "mediaPlaylists": _validate_media_playlists,
}

_ARRAY_SECTIONS = {"voiceCommands"}


def validate_app_config_section(
    section: str, partial: dict[str, Any], context: dict[str, Any] | None = None
) -> None:
    """按分区名分发校验；收集错误后抛出 :class:`AppConfigValidationError`。"""
    errors: list[FieldError] = []
    validator = _SECTION_VALIDATORS.get(section)
    if validator is None and section not in _ARRAY_SECTIONS:
        # 未知分区没有消费方，静默接受只会让配置“看起来保存成功”，实际永不生效。
        raise AppConfigValidationError(
            [{"section": section, "key": "*", "message": "未知配置分区"}]
        )
    if validator is not None:
        if section in ("pricing", "security"):
            validator(section, partial, errors, context)
        else:
            validator(section, partial, errors)
    if errors:
        raise AppConfigValidationError(errors)


_ARRAY_SECTIONS = {"voiceCommands"}

def validate_app_config_partial(partial: dict[str, Any], context: dict[str, Any] | None = None) -> None:
    """校验 PUT /system/config 各分区 partial。"""
    from ..defaults import DEFAULT_APP_CONFIG

    allowed = set(DEFAULT_APP_CONFIG) | _ARRAY_SECTIONS
    unknown = [section for section in partial if section not in allowed]
    if unknown:
        raise AppConfigValidationError(
            [{"section": section, "key": "*", "message": "未知配置分区"} for section in unknown]
        )
    for section, val in partial.items():
        if val is None:
            continue
        if section in _ARRAY_SECTIONS:
            if not isinstance(val, list):
                raise AppConfigValidationError([{"section": section, "key": "*", "message": "分区须为数组"}])
            if section == "voiceCommands":
                errors = validate_voice_commands_array(val)
                if errors:
                    raise AppConfigValidationError(errors)
            continue
        if not isinstance(val, dict):
            raise AppConfigValidationError([{"section": section, "key": "*", "message": "分区须为对象"}])
        validate_app_config_section(section, val, context)

def validate_app_config_full(config: Any) -> None:
    """import replace 时校验完整配置结构。"""
    if not isinstance(config, dict):
        bad_request("配置须为 JSON 对象")
    validate_app_config_partial(config)

def _merge_deep(target: dict[str, Any], source: dict[str, Any]) -> None:
    for key, value in source.items():
        if isinstance(value, dict):
            if not isinstance(target.get(key), dict):
                target[key] = {}
            _merge_deep(target[key], value)
        else:
            target[key] = value

def validate_app_config_replace_import(config: Any) -> None:
    """全量替换导入：拒绝未知顶层分区，并按默认值合并后校验各分区全部字段。"""
    from ..defaults import DEFAULT_APP_CONFIG

    validate_app_config_full(config)
    errors: list[FieldError] = []
    allowed = set(DEFAULT_APP_CONFIG.keys())
    for key in config:
        if key not in allowed:
            errors.append({"section": key, "key": "*", "message": "未知配置分区"})
    if errors:
        raise AppConfigValidationError(errors)

    merged = copy.deepcopy(DEFAULT_APP_CONFIG)
    _merge_deep(merged, config)

    for section in DEFAULT_APP_CONFIG:
        val = merged.get(section)
        if section in _ARRAY_SECTIONS:
            if not isinstance(val, list):
                errors.append({"section": section, "key": "*", "message": "分区须为数组"})
            elif section == "voiceCommands":
                errors.extend(validate_voice_commands_array(val))
            continue
        if not isinstance(val, dict):
            errors.append({"section": section, "key": "*", "message": "分区须为对象"})
            continue
        try:
            validate_app_config_section(section, val)
        except AppConfigValidationError as exc:
            errors.extend(exc.field_errors)
    if errors:
        raise AppConfigValidationError(errors)
