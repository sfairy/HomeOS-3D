"""能力码目录的门面（实现已下沉到 ``core.features``）。

为什么搬去 ``core``：``core.bootstrap``（启动期补默认商品种子）要读基础能力码，而
``core`` 不得反向依赖 ``ops`` —— 目录只是 ``homeos_shared.feature_codes`` 的派生常量，
放在叶子层既没有依赖代价，也让「商品种子」与「后台下拉」读同一份数据。

调用点仍可 ``from ..ops.features import FEATURE_CODES``；新代码请直接
``from ..core.features import ...``。
"""

from __future__ import annotations

from ..core.features import (
    BASE_PRODUCT_FEATURES,
    CATALOG,
    EMBEDDED_CATALOG,
    FEATURE_CATALOG,
    FEATURE_CODES,
    FEATURE_GROUPS,
    MODULE_3D_FEATURES,
    MODULE_FEATURES,
    feature_catalog_payload,
    load_catalog,
)

__all__ = [
    "BASE_PRODUCT_FEATURES",
    "CATALOG",
    "EMBEDDED_CATALOG",
    "FEATURE_CATALOG",
    "FEATURE_CODES",
    "FEATURE_GROUPS",
    "MODULE_3D_FEATURES",
    "MODULE_FEATURES",
    "feature_catalog_payload",
    "load_catalog",
]
