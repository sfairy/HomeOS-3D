"""订单状态口径的门面（实现已下沉到 ``core.order_status``）。

为什么搬去 ``core``：``core.serializers`` 要按状态渲染中文文案与可退金额，而
``commerce`` 又依赖 ``core`` —— 实现留在 ``commerce`` 就形成 ``core → commerce`` 反向边。
状态枚举与文案是纯数据 + 纯函数，放在叶子层没有任何代价。

调用点仍可 ``from ..commerce.order_status import order_status_label``；新代码请直接
``from ..core.order_status import ...``。
"""

from __future__ import annotations

from ..core.order_status import (
    FAILURE_MARKABLE_STATUSES,
    FULFILLABLE_STATUSES,
    ORDER_ATTENTION_STATUSES,
    ORDER_STATUS_CHOICES,
    ORDER_STATUS_LABELS,
    REFUNDABLE_STATUSES,
    RESERVING_STATUSES,
    order_status_label,
    refundable_cents,
)

__all__ = [
    "FAILURE_MARKABLE_STATUSES",
    "FULFILLABLE_STATUSES",
    "ORDER_ATTENTION_STATUSES",
    "ORDER_STATUS_CHOICES",
    "ORDER_STATUS_LABELS",
    "REFUNDABLE_STATUSES",
    "RESERVING_STATUSES",
    "order_status_label",
    "refundable_cents",
]
