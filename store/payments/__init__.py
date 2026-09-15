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
    else:
        name = normalize_provider_name(
            getattr(setting, "payment_provider", None) or settings.payment_provider or "mock"
        )
    if name == "alipay":
        # 站点配置（后台可改）优先于环境变量；合并后注入 provider，让它后续
        # 每个方法都用同一份凭据，不会因为调用方传进来的 settings 只有环境变量
        # 就悄悄退回旧商户号。
        return AlipayProvider(merge_alipay_settings(settings, setting))
    if name == "mock":
        return MockPaymentProvider()
    raise PaymentError(
        f"支付渠道配置为「{name}」，不是受支持的渠道（可选：{'、'.join(PROVIDER_NAMES)}）。"
        "请到后台「站点配置 → 支付渠道」修正后重启服务。"
    )
