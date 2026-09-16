"""支付渠道实现。"""

from __future__ import annotations

from store.config import StoreSettings
from store.payments.alipay import AlipayProvider
from store.payments.base import PaymentError, PaymentIntent, PaymentProvider
from store.payments.credentials import (
    alipay_credentials_summary,
    merge_alipay_settings,
)
from store.payments.mock import MockPaymentProvider

__all__ = [
    "AlipayProvider",
    "MockPaymentProvider",
    "PaymentError",
    "PaymentIntent",
    "PaymentProvider",
    "PROVIDER_NAMES",
    "alipay_credentials_summary",
    "is_known_provider",
    "merge_alipay_settings",
    "normalize_provider_name",
    "resolve_provider",
]

#: 站点配置 / 环境变量里合法（且明确支持）的支付渠道名。
PROVIDER_NAMES = ("mock", "alipay")

#: 空值表示「跟随环境变量」，不是渠道名。
_FOLLOW_ENV = ""


def normalize_provider_name(name: str | None) -> str:
    return (name or "").strip().lower()


def is_known_provider(name: str | None) -> bool:
    """``None`` / 空串表示「跟随环境变量」，同样算合法配置值。"""
    normalized = normalize_provider_name(name)
    return normalized == _FOLLOW_ENV or normalized in PROVIDER_NAMES


def resolve_provider(
    settings: StoreSettings, setting=None, *, name_override: str | None = None
) -> PaymentProvider:
    """按站点配置选择支付渠道（站点配置优先于环境变量）。

    未知渠道名**必须直接报错**，不能回落到模拟支付。这里曾经是
    ``if name == "alipay": ... else: MockPaymentProvider()``：运营在后台把渠道名
    写错一个字符（``alipay ``、``wechat``、``none``），商店就会静默切到本地收银台
    —— 而模拟收银台点一下就「已支付并自动发码」，等于把付费授权免费送出去。
    宁可在下单时报 503，也不要静默降级成「免费」。

    ``name_override`` 用于按历史渠道做事后操作（退款）：订单是哪个渠道收的钱，
    就必须去哪个渠道退。
    """
    if name_override is not None:
        name = normalize_provider_name(name_override)
        # 事后操作（退款/查单）要打「这单当时用的渠道」：历史 mock 订单必须仍能退，
        # 不能因为今天关了模拟收银台就退不了旧账。所以这条路径不校验开关。
        allow_mock = True
    else:
        # 注意这里**没有** ``or "mock"`` 兜底。过去那一句是致命的：站点没配渠道时
        # 静默落到模拟收银台，而 mock 点一下就发码 —— 等于默认免费送授权。
        name = normalize_provider_name(
            getattr(setting, "payment_provider", None) or settings.payment_provider
        )
        allow_mock = bool(getattr(settings, "allow_mock_payments", False))
    if not name:
        raise PaymentError(
            "尚未配置支付渠道，无法创建订单。请在后台「站点配置 → 支付渠道」选择渠道，"
            "或设置 STORE_PAYMENT_PROVIDER 环境变量。"
        )
    if name == "alipay":
        # 站点配置（后台可改）优先于环境变量；合并后注入 provider，让它后续
        # 每个方法都用同一份凭据，不会因为调用方传进来的 settings 只有环境变量
        # 就悄悄退回旧商户号。
        return AlipayProvider(merge_alipay_settings(settings, setting))
    if name == "mock":
        if not allow_mock:
            raise PaymentError(
                "模拟收银台（mock）当前未启用：它不需要真实付款即可把订单标成已支付并签发授权，"
                "因此默认关闭。本地联调请显式设置 STORE_ALLOW_MOCK_PAYMENTS=1；"
                "正式收款请改用支付宝。"
            )
        return MockPaymentProvider()
    raise PaymentError(
        f"支付渠道配置为「{name}」，不是受支持的渠道（可选：{'、'.join(PROVIDER_NAMES)}）。"
        "请到后台「站点配置 → 支付渠道」修正后重启服务。"
    )
