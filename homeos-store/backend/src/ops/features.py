"""客户端能力码目录（中文名 + 说明）—— 商店运营展示面。

**唯一真源是仓库根的 ``ops/check/feature_codes.json``**：加载与内嵌副本在
``homeos_shared.feature_codes``（主应用同一份）。本模块只派生商店后台下拉 / 商品种子
需要的结构。
"""

from __future__ import annotations

from homeos_shared.feature_codes import EMBEDDED_CATALOG, load_catalog

CATALOG: dict = load_catalog()

FEATURE_GROUPS: tuple[tuple[str, str], ...] = tuple(
    (group["key"], group["label"]) for group in CATALOG["groups"]
)

FEATURE_CATALOG: tuple[dict[str, str], ...] = tuple(
    {
        "code": feature["code"],
        "label": feature["label"],
        "group": feature["group"],
        "description": feature.get("description", ""),
    }
    for feature in CATALOG["features"]
)

FEATURE_CODES: frozenset[str] = frozenset(item["code"] for item in FEATURE_CATALOG)

#: 基础能力码（编辑器整包包含的能力）：``base: true`` 的项。
BASE_PRODUCT_FEATURES: tuple[str, ...] = tuple(
    feature["code"] for feature in CATALOG["features"] if feature.get("base")
)

#: 全部增量模块码（``base: false``）：可单独售卖，也被 ``all`` 覆盖。
MODULE_FEATURES: tuple[str, ...] = tuple(
    feature["code"] for feature in CATALOG["features"] if not feature.get("base")
)

#: 3D 交互增量包（保持既有名字，供商城内置商品种子使用）。
MODULE_3D_FEATURES: tuple[str, ...] = tuple(
    code for code in MODULE_FEATURES if code == "module.3d_interaction"
)


def feature_catalog_payload() -> dict:
    """后台下拉多选直接渲染这个结构。"""
    label_by_key = dict(FEATURE_GROUPS)
    return {
        "groups": [{"key": key, "label": label} for key, label in FEATURE_GROUPS],
        "items": [
            {**item, "groupLabel": label_by_key.get(item["group"], item["group"])}
            for item in FEATURE_CATALOG
        ],
    }


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
