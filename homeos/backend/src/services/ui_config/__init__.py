"""UI 配置域（对齐 ``modules/ui-config``）。"""

from __future__ import annotations

from .layout_secrets import (
    mask_layout,
    merge_layout_secrets_on_save,
    strip_legacy_ha_connection,
    strip_retired_layout_keys,
)
from .service import UiConfigService
from .static_assets import UiConfigStaticAssetService

__all__ = [
    "UiConfigService",
    "UiConfigStaticAssetService",
    "mask_layout",
    "merge_layout_secrets_on_save",
    "strip_legacy_ha_connection",
    "strip_retired_layout_keys",
]
