"""订单状态枚举与中文口径（服务端唯一来源）。
"""

from __future__ import annotations

RESERVING_STATUSES: tuple[str, ...] = ("pending", "paid", "fulfillment_failed")

FULFILLABLE_STATUSES: tuple[str, ...] = ("pending", "paid", "fulfillment_failed")

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

ORDER_STATUS_CHOICES: tuple[str, ...] = tuple(ORDER_STATUS_LABELS)

FAILURE_MARKABLE_STATUSES: tuple[str, ...] = ("paid", "fulfillment_failed")

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

