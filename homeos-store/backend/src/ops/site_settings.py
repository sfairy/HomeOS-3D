"""站点级运行时配置：门面 + 支付渠道相关的序列化。

分工
----
* 单例读写、设备解绑冷却、站点/邀请配置序列化 → :mod:`core.site_settings`（叶子层）；
* 支付渠道的启用集合、凭据合并与「已配置/可用」判定 → 本模块（它依赖 ``payments``，
  因而不能放进 ``core``）；
* 旧导入路径 ``from ..ops import site_settings`` 继续可用：这里 re-export 了全部核心符号。
"""

from __future__ import annotations

from ..config import StoreSettings
from ..core.clock import iso
from ..core.models import StoreSetting
from ..core.site_settings import (
    DEFAULT_LOGO_URL,
    DEPLOY_SCRIPTS,
    effective_device_release_cooldown,
    get_setting,
    referral_settings_payload,
    resolve_device_release_cooldown,
    store_configuration_payload,
    update_setting,
)
from ..payments.common.channels import (
    default_channel_name,
    display_name_for,
    enabled_channel_names,
)
from ..payments.common.credentials import merge_alipay_settings, merge_wechat_settings
from ..payments.wechat.provider import WeChatPayProvider

__all__ = [
    "DEFAULT_LOGO_URL",
    "DEPLOY_SCRIPTS",
    "effective_device_release_cooldown",
    "get_setting",
    "payment_channels_payload",
    "payment_configuration_payload",
    "referral_settings_payload",
    "resolve_device_release_cooldown",
    "site_configuration_payload",
    "store_configuration_payload",
    "update_setting",
]


def _mask_secret(configured: bool) -> bool:
    return bool(configured)


def _channel_credentials(name: str, setting: StoreSetting, settings: StoreSettings) -> StoreSettings:
    """某个渠道**合并站点配置后**的凭据集合（与 ``resolve_provider`` 注入的是同一份）。

    只读启动时的环境变量合并进来，否则自检会报「未配置」而实际能收款。
    """
    if name == "wechat":
        return merge_wechat_settings(settings, setting)
    return merge_alipay_settings(settings, setting)


def _channel_ready(name: str, merged: StoreSettings) -> bool:
    """这个渠道的凭据是否齐全（齐全 = 能真的收到钱）。"""
    if name == "wechat":
        return not WeChatPayProvider.missing_credentials(merged)
    return bool(merged.alipay_app_id) and bool(merged.alipay_private_key_text) and bool(merged.alipay_public_key_text)


def _channel_note(name: str) -> str:
    """付款页给顾客的一句话。措辞必须与渠道一致 —— 让用户拿微信扫支付宝的码是
    最常见的收银台事故。"""
    if name == "wechat":
        return "请用微信扫一扫支付，付款后本页会自动确认。"
    return "打开支付宝「扫一扫」完成付款，付款后本页会自动确认。"


def payment_channels_payload(setting: StoreSetting, settings: StoreSettings) -> list[dict]:
    """**已启用**的渠道清单（含各自的可用性）。前台据此决定「直接出码」还是「先让顾客选」。

    每个渠道各报各的 ``available``：一个渠道凭据不齐不该把另一个也藏起来。
    """
    enabled = enabled_channel_names(setting, settings)
    default_name = default_channel_name(setting, settings)
    channels: list[dict] = []
    for name in enabled:
        merged = _channel_credentials(name, setting, settings)
        ready = _channel_ready(name, merged)
        channels.append(
            {
                "provider": name,
                "displayName": display_name_for(name, setting, settings),
                "icon": name,
                "note": _channel_note(name),
                "configured": ready,
                "available": bool(setting.payment_enabled) and ready,
                "isDefault": name == default_name,
            }
        )
    return channels


def payment_configuration_payload(setting: StoreSetting, settings: StoreSettings, *, include_credentials: bool) -> dict:
    """支付配置的序列化。

    顶层字段（provider / displayName / available / configured）取**默认渠道**的值；
    新增的 ``channels`` 数组才是多渠道的信息来源。
    """
    channels = payment_channels_payload(setting, settings)
    default_name = default_channel_name(setting, settings)
    chosen = next(
        (item for item in channels if item["provider"] == default_name),
        channels[0] if channels else None,
    )

    if chosen is None:
        provider = ""
        display_name = "未配置支付渠道"
        icon = "alipay"
        available = False
        configured = False
    else:
        provider = chosen["provider"]
        display_name = chosen["displayName"]
        icon = chosen["icon"]
        available = chosen["available"]
        configured = bool(setting.payment_enabled) and chosen["configured"]

    transaction_description = (
        setting.payment_transaction_description
        or settings.alipay_transaction_description
        or settings.wechat_transaction_description
    )
    payload = {
        "provider": provider,
        "enabled": bool(setting.payment_enabled),
        "displayName": display_name,
        "icon": icon,
        "transactionDescription": transaction_description,
        "configured": configured,
        "available": available,
        "channels": channels,
        "updatedAt": iso(setting.updated_at),
    }
    if include_credentials:
        alipay_merged = merge_alipay_settings(settings, setting)
        payload |= {
            "appId": alipay_merged.alipay_app_id,
            "applicationPrivateKeyConfigured": _mask_secret(bool(alipay_merged.alipay_private_key_text)),
            "alipayPublicKeyConfigured": _mask_secret(bool(alipay_merged.alipay_public_key_text)),
            "gatewayUrl": alipay_merged.alipay_gateway_url,
            "transactionDescriptionFromDatabase": bool((setting.payment_transaction_description or "").strip()),
        }
    return payload


def site_configuration_payload(setting: StoreSetting, settings: StoreSettings, *, include_credentials: bool) -> dict:
    return {
        "store": store_configuration_payload(setting),
        "payment": payment_configuration_payload(setting, settings, include_credentials=include_credentials),
    }
