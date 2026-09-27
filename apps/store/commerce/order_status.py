"""订单状态枚举与中文口径（服务端唯一来源）。
"""

from __future__ import annotations

#: 会占用库存预留与优惠码名额的状态，真相源就是本模块（``fulfill`` 直接 re-export 同一对象）。
RESERVING_STATUSES: tuple[str, ...] = ("pending", "paid", "fulfillment_failed")

#: 允许被「入账 / 标记支付 / 履约」的状态。终态一律拒绝 —— cancelled / expired 的预留与
FULFILLABLE_STATUSES: tuple[str, ...] = ("pending", "paid", "fulfillment_failed")

#: 允许发起退款的状态。
REFUNDABLE_STATUSES: tuple[str, ...] = (
    "paid",
    "fulfilled",
    "fulfillment_failed",
    "partially_refunded",
)

ORDER_STATUS_LABELS: dict[str, str] = {
    "pending": "待付款",
    "paid": "已付款",
    "fulfilled": "已完成",
    "cancelled": "已取消",
    "expired": "已过期",
    "payment_failed": "支付失败",
    "fulfillment_failed": "发货失败",
    "partially_refunded": "部分退款",
    "refunded": "已退款",
}

#: 可在后台筛选器里选择的状态（保持与状态机的展示顺序一致）。
ORDER_STATUS_CHOICES: tuple[str, ...] = tuple(ORDER_STATUS_LABELS)

#: 允许被**标记为**「发货失败」的状态。退款 / 部分退款与各种终态一律拒绝：
#: 它们是可运营的状态，不能被一次履约异常改写成另一条业务线。
#: 入账路径（payments/settlement.py）与后台路径（api/admin_orders.py）必须共用它 ——
#: 两套口径会让「同一件事从一个入口点进去行为不同」。
FAILURE_MARKABLE_STATUSES: tuple[str, ...] = ("paid", "fulfillment_failed")

#: 需要人工介入的状态 —— 「必须有人看一眼」的唯一定义。
ORDER_ATTENTION_STATUSES: tuple[str, ...] = ("payment_failed", "fulfillment_failed")


def order_status_label(status: str | None) -> str:
    """把状态码翻成中文；未知状态原样返回，方便发现新值没登记。"""
    text = (status or "").strip()
    if not text:
        return ""
    return ORDER_STATUS_LABELS.get(text, text)


def refundable_cents(amount_cents: int | None, refunded_cents: int | None) -> int:
    """还能退多少钱（分）。必须夹到 0，绝不返回负数。
    """
    return max(0, int(amount_cents or 0) - int(refunded_cents or 0))

