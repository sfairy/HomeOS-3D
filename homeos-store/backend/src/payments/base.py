"""支付渠道抽象。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from src.config import StoreSettings
from src.core.models import Order, StoreSetting


@dataclass(frozen=True)
class PaymentIntent:
    """一次支付发起的结果。``payload`` 会被原样写进订单并回给前端。"""

    provider: str
    payload: dict = field(default_factory=dict)
    pay_url: str | None = None
    qr_code: str | None = None


class PaymentProvider(Protocol):
    name: str

    def is_configured(self, settings: StoreSettings) -> bool: ...

    def create_payment(
        self,
        *,
        order: Order,
        settings: StoreSettings,
        setting: StoreSetting,
        base_url: str,
    ) -> PaymentIntent: ...

    def refund_payment(
        self,
        *,
        order: Order,
        amount_cents: int,
        reason: str,
        out_request_no: str,
        settings: StoreSettings,
        setting: StoreSetting,
    ) -> "RefundResult": ...


@dataclass(frozen=True)
class CloseResult:
    """关单结果。两个渠道共用一套语义：

    * ``closed`` —— 这笔渠道交易现在肯定不可能再被支付了；
    * ``already_paid`` —— 关单时发现**钱已经进来了**，这不是关单失败：
      调用方必须立刻去查单入账，而不是把订单当过期处理。
    """

    closed: bool
    already_paid: bool = False
    reason: str = ""


@dataclass(frozen=True)
class RefundResult:
    """一次退款的执行结果。
    """

    ok: bool
    #: 渠道侧的退款单号 / 交易号，用于对账
    trade_no: str | None = None
    #: 未退回的金额（渠道部分退款时 > 0）
    unrefunded_cents: int = 0
    detail: str = ""


class PaymentError(RuntimeError):
    pass
