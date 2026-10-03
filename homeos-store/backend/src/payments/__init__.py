"""支付渠道实现与注册表。

渠道名、启用集合与显示名的口径在 ``channels.py``（这里重新导出，调用点不用改）。
"""

from __future__ import annotations

from ..config import StoreSettings
from ..payments.alipay import AlipayProvider
from ..payments.base import PaymentError, PaymentIntent, PaymentProvider
from ..payments.channels import (
    CHANNEL_LABELS,
    PROVIDER_NAMES,
    default_channel_name,
    display_name_for,
    enabled_channel_names,
    is_known_provider,
    normalize_provider_name,
    provider_label,
)
from ..payments.credentials import (
    alipay_credentials_summary,
    merge_alipay_settings,
    merge_wechat_settings,
    wechat_credentials_summary,
)
from ..payments.wechat import WeChatPayProvider

__all__ = [
    "CHANNEL_LABELS",
    "PROVIDER_NAMES",
    "AlipayProvider",
    "PaymentError",
    "PaymentIntent",
    "PaymentProvider",
    "WeChatPayProvider",
    "alipay_credentials_summary",
    "default_channel_name",
    "display_name_for",
    "enabled_channel_names",
    "is_known_provider",
    "merge_alipay_settings",
    "merge_wechat_settings",
    "normalize_provider_name",
    "provider_label",
    "resolve_provider",
    "wechat_credentials_summary",
]


def resolve_provider(
    settings: StoreSettings, setting=None, *, name_override: str | None = None
) -> PaymentProvider:
    """按渠道名构造 provider（站点配置优先于环境变量）。

    ``name_override`` 供回调/查单使用：那两条服务的是**已经存在的订单**，
    必须按订单上冻结的渠道名解析，而不是看「现在默认收款的是哪个渠道」。
    """
    if name_override is not None:
        name = normalize_provider_name(name_override)
    else:
        # 默认渠道必须走 default_channel_name（只在**启用集合**内挑）：直接读原始
        # payment_provider 会与前台展示的渠道脱节 —— 运营以为只启用了微信（DB 的
        # payment_channels_json=["wechat"]），而环境变量 STORE_PAYMENT_PROVIDER=alipay
        # 会让没有显式选渠道的请求冻结成支付宝，甚至因支付宝凭据已清空而整店下不了单。
        name = default_channel_name(setting, settings)
    if not name:
        raise PaymentError(
            "尚未配置支付渠道，无法创建订单。请在后台「站点配置 → 支付渠道」选择渠道，"
            "或设置 STORE_PAYMENT_PROVIDER 环境变量。"
        )
    if name == "alipay":
        # 站点配置（后台可改）优先于环境变量；合并后注入 provider，让它每个方法都用同一份
        return AlipayProvider(merge_alipay_settings(settings, setting))
    if name == "wechat":
        return WeChatPayProvider(merge_wechat_settings(settings, setting))
    raise PaymentError(
        f"支付渠道配置为「{name}」，不是受支持的渠道（可选：{'、'.join(PROVIDER_NAMES)}）。"
        "请到后台「站点配置 → 支付渠道」修正后重启服务。"
    )
