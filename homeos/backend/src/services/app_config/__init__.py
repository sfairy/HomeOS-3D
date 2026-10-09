"""应用配置域（对齐 ``shared/app-config``）。

对外只暴露服务与默认值常量；校验 / 脱敏 / 规范化工具按需从子模块导入。
"""

from __future__ import annotations

from .backup import AppConfigBackupService
from .constants import (
    APP_CONFIG_SCHEMA_VERSION,
    CONFIG_AUDIT_STORAGE_ID,
    CONFIG_MASK_PLACEHOLDER,
    CONFIG_REPLACE_NESTED_FIELDS,
    CONFIG_REPLACE_ON_UPDATE_SECTIONS,
    PUBLIC_CONFIG_SECTIONS,
)
from .defaults import DEFAULT_APP_CONFIG, build_default_app_config
from .mask import is_masked_value, pick_config_for_role, strip_masked_placeholders
from .service import APP_CONFIG_UPDATED, AppConfigService
from .validate import (
    AppConfigValidationError,
    validate_app_config_full,
    validate_app_config_partial,
    validate_app_config_section,
)

__all__ = [
    "APP_CONFIG_SCHEMA_VERSION",
    "APP_CONFIG_UPDATED",
    "CONFIG_AUDIT_STORAGE_ID",
    "CONFIG_MASK_PLACEHOLDER",
    "CONFIG_REPLACE_NESTED_FIELDS",
    "CONFIG_REPLACE_ON_UPDATE_SECTIONS",
    "DEFAULT_APP_CONFIG",
    "PUBLIC_CONFIG_SECTIONS",
    "AppConfigBackupService",
    "AppConfigService",
    "AppConfigValidationError",
    "build_default_app_config",
    "is_masked_value",
    "pick_config_for_role",
    "strip_masked_placeholders",
    "validate_app_config_full",
    "validate_app_config_partial",
    "validate_app_config_section",
]
