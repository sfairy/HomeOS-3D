"""模拟收银台。

本地联调用：下单后返回一个站内收银台地址，同时把该地址作为二维码内容，
前端用 jquery.qrcode 渲染，等价于真实扫码支付的交互路径。
"""

from __future__ import annotations

from urllib.parse import quote

from store.config import StoreSettings
from store.models import Order, StoreSetting
from store.payments.base import PaymentIntent, RefundResult


class MockPaymentProvider:
    name = "mock"

    def is_configured(self, settings: StoreSettings) -> bool:
        # 「没配置」和「被禁用」都算不可用：只有显式打开开关（STORE_ALLOW_MOCK_PAYMENTS=1）
        # 时它才算一个正常渠道。这样巡检、自检等所有以 is_configured 为准的路径都不会
        # 把「当前其实是白送模式」当成健康状态。
        return bool(getattr(settings, "allow_mock_payments", False))

    def diagnose_credentials(
        self,
        settings: StoreSettings,
        *,
        notify_url: str = "",
        return_url: str = "",
    ) -> tuple[bool, str, list[dict]]:
        """模拟渠道没有凭据可测，如实报告「未做凭据校验」。

        刻意返回 ``skip`` 而不是让接口抛 409、更不是报 ``pass``：
        「当前是模拟支付」本身就是一个运营必须一眼看到的事实 —— 它意味着
        点一下按钮就能把订单标成已支付。报成通过等于把这件事藏起来，
        报成 409 则让这个按钮在本地联调时完全不可用（而这正是它最常见的场景）。
        """
        from store.net_probe import LEVEL_SKIP, LEVEL_WARN, check_result

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
        # 页面本身要求带订单凭证（``?token=``）：它会把 lookupToken 交给页面里的
        # 按钮去调 ``mock/pay``。订单号会出现在邮件、客服工单与 Referer 里，从来不是
        # 一道授权，所以页面绝不能无鉴权可达 —— 这条判断不依赖订单号是否可枚举。
        pay_url = (
            f"{base_url}/store/mock/pay/{order.order_no}"
            f"?token={quote(order.lookup_token or '', safe='')}"
        )
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
