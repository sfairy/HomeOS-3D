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
    "AppConfigService",
    "AppConfigBackupService",
    "APP_CONFIG_UPDATED",
    "AppConfigValidationError",
    "DEFAULT_APP_CONFIG",
    "build_default_app_config",
    "validate_app_config_partial",
    "validate_app_config_section",
    "validate_app_config_full",
    "pick_config_for_role",
    "strip_masked_placeholders",
    "is_masked_value",
    "PUBLIC_CONFIG_SECTIONS",
    "APP_CONFIG_SCHEMA_VERSION",
    "CONFIG_AUDIT_STORAGE_ID",
    "CONFIG_MASK_PLACEHOLDER",
    "CONFIG_REPLACE_ON_UPDATE_SECTIONS",
    "CONFIG_REPLACE_NESTED_FIELDS",
]
