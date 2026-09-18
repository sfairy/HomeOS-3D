"""模拟收银台。

本地联调用：下单后返回一个站内收银台地址，同时把该地址作为二维码内容，
前端用 jquery.qrcode 渲染，等价于真实扫码支付的交互路径。
"""

from __future__ import annotations

from urllib.parse import quote

from store.config import StoreSettings
from store.models import Order, StoreSetting
from store.net_probe import LEVEL_SKIP, LEVEL_WARN, check_result
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
        pay_token: str | None = None,
    ) -> PaymentIntent:
        # 页面凭证**不再是** ``lookup_token``（S53）：那是一枚长期有效、还能查订单
        # 详情的 bearer 凭据，写在 URL 里会进访问日志、Referer 与浏览器历史 ——
        # 漏出一次就不只是丢掉这张收银台页面。这里换成短时票据（30 分钟、与订单
        # 绑定、只能打开这笔订单的收银台）；页面加载后立刻用 ``history.replaceState``
        # 把查询串从地址栏与历史记录里抹掉（见 ``store/api/pages.py``）。
        #
        # 因此链接里没有任何长期凭据；订单号现在带随机尾缀（``new_order_no``），
        # 猜不出来 —— 但可枚举性从来不是这里的边界，凭据才是。
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
