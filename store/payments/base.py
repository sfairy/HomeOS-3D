"""支付渠道抽象。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from store.config import StoreSettings
from store.models import Order, StoreSetting


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
class RefundResult:
    """一次退款的执行结果。

    后台的「退款」过去只把订单状态改成 ``refunded`` 并停用授权 —— 钱从来没退给
    用户，库里也没有任何「退了多少」的记录，账面上这笔营收却已经消失。现在退款
    必须真的经过支付渠道，并把实际退款金额落库，对账才有依据。
    """

    ok: bool
    #: 渠道侧的退款单号 / 交易号，用于对账
    trade_no: str | None = None
    #: 未退回的金额（渠道部分退款时 > 0）
    unrefunded_cents: int = 0
    detail: str = ""


class PaymentError(RuntimeError):
    pass
