"""UI 配置域（对齐 ``modules/ui-config``）。"""

from __future__ import annotations

from .layout_secrets import (
    extract_ha_config_fingerprint,
    mask_layout_for_role,
    merge_layout_secrets_on_save,
)
from .service import UiConfigService
from .static_assets import UiConfigStaticAssetService

__all__ = [
    "UiConfigService",
    "UiConfigStaticAssetService",
    "mask_layout_for_role",
    "merge_layout_secrets_on_save",
    "extract_ha_config_fingerprint",
]
