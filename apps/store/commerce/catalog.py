"""商品目录口径：类型与履约方式的合法取值（服务端唯一来源）。
"""

from __future__ import annotations

#: 商品类型 → 中文名（列表页展示用的映射前端也有一份）。``template`` / ``bundle``
PRODUCT_TYPE_LABELS: dict[str, str] = {
    "base": "基础授权",
    "module": "增量包",
    "template": "模板",
    "package": "套餐",
    "bundle": "全授权",
}

PRODUCT_TYPES: frozenset[str] = frozenset(PRODUCT_TYPE_LABELS)

#: 履约方式 → 中文名。``automatic`` 付款即发码；``manual`` 只把订单标记成已付款，等运营
FULFILLMENT_MODE_LABELS: dict[str, str] = {
    "automatic": "自动发码",
    "manual": "人工发码",
}

FULFILLMENT_MODES: frozenset[str] = frozenset(FULFILLMENT_MODE_LABELS)


def validate_product_type(value: str) -> str:
    """归一化并校验商品类型，非法取值返回可读的中文清单。"""
    normalized = str(value or "").strip()
    if normalized not in PRODUCT_TYPES:
        options = "、".join(PRODUCT_TYPE_LABELS)
        raise ValueError(
            f"商品类型「{value}」不是受支持的取值（可选：{options}）。"
        )
    return normalized


def validate_fulfillment_mode(value: str) -> str:
    """归一化并校验履约方式。
    """
    normalized = str(value or "").strip()
    if normalized not in FULFILLMENT_MODES:
        options = "、".join(FULFILLMENT_MODE_LABELS)
        raise ValueError(
            f"履约方式「{value}」不是受支持的取值（可选：{options}）。"
        )
    return normalized
