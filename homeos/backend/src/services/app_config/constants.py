"""应用配置常量：公开分区、schema 版本、审计存储 id、整段替换分区/字段。

逐字段对齐 ``backend/src/shared/app-config/constants.ts``。
"""

from __future__ import annotations

#: 可公开（免鉴权）下发给前端的分区，不含安防/能源阈值等敏感运行参数。
PUBLIC_CONFIG_SECTIONS: tuple[str, ...] = (
    "frontend",
    "ui",
    "screensaver",
    "weatherEffects",
    "voice",
    "voiceCommands",
)

#: 配置 schema 版本号，结构发生破坏性变更时递增。
APP_CONFIG_SCHEMA_VERSION = 17

#: 配置审计持久化 RuntimeKv id。
CONFIG_AUDIT_STORAGE_ID = "config-audit"

#: PUT 局部更新时整段替换（非 deep merge），以支持删除 Record 内键。
CONFIG_REPLACE_ON_UPDATE_SECTIONS: tuple[str, ...] = (
    "envSensorMap",
    "mediaPlaylists",
)

#: 分区内的 Record 字段：局部更新时整段替换（非 deep merge）。
CONFIG_REPLACE_NESTED_FIELDS: dict[str, tuple[str, ...]] = {
    "other": ("advisorTipActions",),
    "voice": ("ttsAlertTemplates",),
    "frontend": ("widgetPollIntervals",),
}

#: 管理员 GET 时下发的敏感字段占位符（PUT 时原样回传则跳过更新）。
CONFIG_MASK_PLACEHOLDER = "••••••••"

#: frontend.rebuildDebounceMs 合法区间（毫秒）；validate / import_normalize 共用。
REBUILD_DEBOUNCE_MS_MIN = 10
REBUILD_DEBOUNCE_MS_MAX = 2000

__all__ = [
    "APP_CONFIG_SCHEMA_VERSION",
    "CONFIG_AUDIT_STORAGE_ID",
    "CONFIG_MASK_PLACEHOLDER",
    "CONFIG_REPLACE_NESTED_FIELDS",
    "CONFIG_REPLACE_ON_UPDATE_SECTIONS",
    "PUBLIC_CONFIG_SECTIONS",
    "REBUILD_DEBOUNCE_MS_MAX",
    "REBUILD_DEBOUNCE_MS_MIN",
]
