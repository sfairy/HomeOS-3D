"""模拟收银台。

本地联调用：下单后返回一个站内收银台地址，同时把该地址作为二维码内容，
前端用 jquery.qrcode 渲染，等价于真实扫码支付的交互路径。
"""

from __future__ import annotations

from store.config import StoreSettings
from store.models import Order, StoreSetting
from store.payments.base import PaymentIntent, RefundResult


class MockPaymentProvider:
    name = "mock"

    def is_configured(self, settings: StoreSettings) -> bool:
        return True

    def refund_payment(
        self,
        *,
        order: Order,
        amount_cents: int,
        reason: str,
        out_request_no: str,
        settings: StoreSettings,
        setting: StoreSetting,
    ) -> RefundResult:
        """模拟渠道没有真实资金流，直接判定「已退回」并给出可对账的假单号。

        关键是**接口形状与真实渠道一致**：后台退款走的是同一条代码路径，
        不会出现「模拟能退、支付宝退不了」这种只在生产暴露的差异。
        """
        trade = order.payment_trade_no or f"MOCK{order.order_no[-10:]}"
        return RefundResult(
            ok=True,
            # 把幂等请求号带进单号里：测试就能验证「两次部分退款拿到的是两个不同的
            # 渠道单号」，也就等价于验证了它们不会被渠道去重掉。
            trade_no=f"RF{trade[:32]}-{out_request_no[-12:]}",
            unrefunded_cents=0,
            detail=f"模拟渠道已按 ¥{amount_cents / 100:.2f} 退回（{reason or '无备注'}）",
        )

    def create_payment(
        self,
        *,
        order: Order,
        settings: StoreSettings,
        setting: StoreSetting,
        base_url: str,
    ) -> PaymentIntent:
        pay_url = f"{base_url}/store/mock/pay/{order.order_no}"
        return PaymentIntent(
            provider=self.name,
            payload={
                "type": "mock",
                "qrCode": pay_url,
                "payUrl": pay_url,
                "displayName": setting.payment_display_name or "模拟支付",
                "note": "本地联调收银台，确认后立即发码",
            },
            pay_url=pay_url,
            qr_code=pay_url,
        )
