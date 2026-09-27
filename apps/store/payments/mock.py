"""模拟收银台。
"""

from __future__ import annotations

from urllib.parse import quote

from apps.store.config import StoreSettings
from apps.store.core.models import Order, StoreSetting
from apps.store.ops.net_probe import LEVEL_SKIP, LEVEL_WARN, check_result
from apps.store.payments.base import PaymentIntent, RefundResult


class MockPaymentProvider:
    name = "mock"

    def is_configured(self, settings: StoreSettings) -> bool:
        # 「没配置」和「被禁用」都算不可用：只有显式打开开关（STORE_ALLOW_MOCK_PAYMENTS=1）
        return bool(getattr(settings, "allow_mock_payments", False))

    def diagnose_credentials(
        self,
        settings: StoreSettings,
        *,
        notify_url: str = "",
        return_url: str = "",
    ) -> tuple[bool, str, list[dict]]:
        """模拟渠道没有凭据可测，如实报告「未做凭据校验」。
        """
        return (
            False,
            "当前支付渠道是模拟收银台（mock），没有真实凭据可校验；"
            "它不需要密钥，也不会产生真实资金 —— 正式收款前请切换到支付宝。",
            [
                check_result(
                    "provider",
                    "支付凭据校验",
                    LEVEL_SKIP,
                    "模拟收银台没有密钥与商户号，无需校验。",
                ),
                check_result(
                    "provider-environment",
                    "运行环境",
                    LEVEL_WARN,
                    "模拟收银台：下单后可由站内按钮直接标记支付并发码，切勿用于生产收款。",
                ),
            ],
        )

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
        """
        trade = order.payment_trade_no or f"MOCK{order.order_no[-10:]}"
        return RefundResult(
            ok=True,
            # 把幂等请求号带进单号里：测试就能验证「两次部分退款拿到的是两个不同的
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
        pay_token: str | None = None,
    ) -> PaymentIntent:
        # 页面凭证**不再是** ``lookup_token``：那是长期有效、还能查订单详情的 bearer 凭据，
        ticket = pay_token or ""
        query = f"?t={quote(ticket, safe='')}" if ticket else ""
        pay_url = f"{base_url}/store/mock/pay/{order.order_no}{query}"
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
