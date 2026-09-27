"""支付宝凭据解析：站点配置（后台可改）优先，环境变量兜底。
"""

from __future__ import annotations

from dataclasses import replace

from src.config import StoreSettings
from src.core.models import StoreSetting
from src.payments import wechat_signing as signing
from src.payments.alipay import (
    PaymentError,
    public_key_error,
    private_key_error,
    validate_callback_url,
    validate_gateway_url,
)
#: 打码/归一化密钥提交值的规则与 SMTP 授权码共用一份实现，这里重新导出以保持调用点不变。
from src.payments.wechat import WeChatPayProvider
#: 打码/归一化密钥提交值的规则与 SMTP 授权码共用一份实现，见上面的支付宝分支。
from src.security.secret_fields import (
    MASK_PREFIX,
    is_masked_secret,
    mask_secret,
    resolve_secret_input,
)

__all__ = [
    "MASK_PREFIX",
    "alipay_credentials_summary",
    "is_masked_secret",
    "mask_secret",
    "merge_alipay_settings",
    "merge_wechat_settings",
    "wechat_credentials_summary",
    "resolve_secret_input",
    "validate_callback_url",
    "validate_gateway_url",
    "validate_private_key_text",
    "validate_public_key_text",
]

#: 支付宝正式网关（站点配置与环境变量都没给时的最终兜底）
PRODUCTION_GATEWAY_URL = "https://openapi.alipay.com/gateway.do"


def merge_alipay_settings(
    settings: StoreSettings, setting: StoreSetting | None
) -> StoreSettings:
    """把站点配置里的支付宝字段合并进 settings，返回一个新的不可变对象。"""
    if setting is None:
        return settings

    database_app_id = (setting.alipay_app_id or "").strip()
    database_seller_id = (setting.alipay_seller_id or "").strip()
    database_private_key = (setting.alipay_app_private_key or "").strip()
    database_public_key = (setting.alipay_public_key or "").strip()
    database_gateway = (setting.alipay_gateway_url or "").strip()
    database_notify_url = (setting.alipay_notify_url or "").strip()
    database_return_url = (setting.alipay_return_url or "").strip()

    # 留空即用支付宝生产网关。
    gateway = database_gateway or settings.alipay_gateway_url or PRODUCTION_GATEWAY_URL

    return replace(
        settings,
        alipay_app_id=database_app_id or settings.alipay_app_id,
        alipay_seller_id=database_seller_id or settings.alipay_seller_id,
        alipay_app_private_key=database_private_key or settings.alipay_app_private_key,
        alipay_public_key=database_public_key or settings.alipay_public_key,
        alipay_gateway_url=gateway,
        # 回调地址同理：留空跟随环境变量，非空以站点配置为准；改它不该需要重启容器。
        alipay_notify_url=database_notify_url or settings.alipay_notify_url,
        alipay_return_url=database_return_url or settings.alipay_return_url,
        alipay_app_private_key_path=(
            "" if database_private_key else settings.alipay_app_private_key_path
        ),
        alipay_public_key_path=(
            "" if database_public_key else settings.alipay_public_key_path
        ),
    )


def alipay_credentials_summary(
    settings: StoreSettings, setting: StoreSetting | None
) -> dict:
    """给后台用的凭据概览。**绝不包含密钥明文**，只报是否已配置。"""
    merged = merge_alipay_settings(settings, setting)
    app_id = merged.alipay_app_id
    private_key = merged.alipay_private_key_text
    public_key = merged.alipay_public_key_text
    return {
        "appId": app_id,
        "sellerId": merged.alipay_seller_id,
        "gatewayUrl": merged.alipay_gateway_url,
        #: 当前**实际生效**的异步通知/同步跳转地址（可能来自后台、环境变量或按
        "notifyUrl": merged.alipay_notify_url,
        "returnUrl": merged.alipay_return_url,
        #: 只读展示：签名算法与响应验签开关仍由环境变量控制（改错会全挂），排障时要看得见。
        "signType": merged.alipay_sign_type,
        "verifyResponseSign": bool(merged.alipay_verify_response_sign),
        "applicationPrivateKeyConfigured": bool(private_key),
        "alipayPublicKeyConfigured": bool(public_key),
        #: 打码后的密钥，只为让运营确认「填的是哪一把」，不能反推出明文。
        "applicationPrivateKeyMasked": mask_secret(
            (getattr(setting, "alipay_app_private_key", "") or "").strip()
        ),
        "alipayPublicKeyMasked": mask_secret(
            (getattr(setting, "alipay_public_key", "") or "").strip()
        ),
        #: 各字段各报各的来源。前端**只回填来源为后台的字段** —— 若把环境变量的值也回填，
        "appIdFromDatabase": bool((getattr(setting, "alipay_app_id", "") or "").strip()),
        "sellerIdFromDatabase": bool((getattr(setting, "alipay_seller_id", "") or "").strip()),
        "gatewayUrlFromDatabase": bool(
            (getattr(setting, "alipay_gateway_url", "") or "").strip()
        ),
        "notifyUrlFromDatabase": bool(
            (getattr(setting, "alipay_notify_url", "") or "").strip()
        ),
        "returnUrlFromDatabase": bool(
            (getattr(setting, "alipay_return_url", "") or "").strip()
        ),
        "applicationPrivateKeyFromDatabase": bool(
            (getattr(setting, "alipay_app_private_key", "") or "").strip()
        ),
        "alipayPublicKeyFromDatabase": bool(
            (getattr(setting, "alipay_public_key", "") or "").strip()
        ),
        "configured": bool(app_id and private_key and public_key),
    }


#: 微信支付的字段名 → StoreSettings 字段名。合并与概览都按这张表走，
#: 避免「加了一个字段、某一个地方忘了带上」这种最难发现的走散。
_WECHAT_TEXT_FIELDS: tuple[tuple[str, str], ...] = (
    ("wechat_mch_id", "wechat_mch_id"),
    ("wechat_app_id", "wechat_app_id"),
    ("wechat_api_v3_key", "wechat_api_v3_key"),
    ("wechat_merchant_private_key", "wechat_merchant_private_key"),
    ("wechat_merchant_serial_no", "wechat_merchant_serial_no"),
    ("wechat_platform_public_key", "wechat_platform_public_key"),
    ("wechat_platform_public_key_id", "wechat_platform_public_key_id"),
    ("wechat_notify_url", "wechat_notify_url"),
    ("wechat_transaction_description", "wechat_transaction_description"),
)


def merge_wechat_settings(
    settings: StoreSettings, setting: StoreSetting | None
) -> StoreSettings:
    """把站点配置里的微信支付字段合并进 settings（站点配置优先，环境变量兜底）。

    密钥有个额外规则：后台一旦填了**内联**密钥，就必须把环境变量里的**文件路径**让位，
    否则 `_text` 属性会优先读文件、把后台刚填的值悄悄忽略掉。
    """
    if setting is None:
        return settings

    updates: dict[str, str] = {}
    for column, attribute in _WECHAT_TEXT_FIELDS:
        value = (getattr(setting, column, "") or "").strip()
        if value:
            updates[attribute] = value

    if updates.get("wechat_merchant_private_key"):
        updates["wechat_merchant_private_key_path"] = ""
    if updates.get("wechat_platform_public_key"):
        updates["wechat_platform_public_key_path"] = ""

    if not updates:
        return settings
    return replace(settings, **updates)


def wechat_credentials_summary(
    settings: StoreSettings, setting: StoreSetting | None
) -> dict:
    """给后台用的微信支付凭据概览。**绝不包含密钥明文**，只报是否已配置。"""
    merged = merge_wechat_settings(settings, setting)
    private_key = merged.wechat_merchant_private_key_text
    public_key = merged.wechat_platform_public_key_text
    return {
        "mchId": merged.wechat_mch_id,
        "appId": merged.wechat_app_id,
        "merchantSerialNo": merged.wechat_merchant_serial_no,
        "gatewayUrl": merged.wechat_gateway_url,
        "notifyUrl": merged.wechat_notify_url,
        "platformPublicKeyId": merged.wechat_platform_public_key_id,
        "transactionDescription": merged.wechat_transaction_description,
        "apiV3KeyConfigured": not signing.api_v3_key_error(merged.wechat_api_v3_key),
        "merchantPrivateKeyConfigured": bool(private_key),
        "platformPublicKeyConfigured": bool(public_key),
        #: 打码后的值，只为让运营确认「填的是哪一个」，不能反推出明文。
        "apiV3KeyMasked": mask_secret(
            (getattr(setting, "wechat_api_v3_key", "") or "").strip()
        ),
        "merchantPrivateKeyMasked": mask_secret(
            (getattr(setting, "wechat_merchant_private_key", "") or "").strip()
        ),
        "platformPublicKeyMasked": mask_secret(
            (getattr(setting, "wechat_platform_public_key", "") or "").strip()
        ),
        #: 各字段各报各的来源：前端只回填来源为后台的字段，否则会把环境变量的值
        #: 当成后台值再提交回去，等于把环境变量抄进数据库。
        "mchIdFromDatabase": bool((getattr(setting, "wechat_mch_id", "") or "").strip()),
        "appIdFromDatabase": bool((getattr(setting, "wechat_app_id", "") or "").strip()),
        "merchantSerialNoFromDatabase": bool(
            (getattr(setting, "wechat_merchant_serial_no", "") or "").strip()
        ),
        "gatewayUrlFromDatabase": bool(
            (getattr(setting, "wechat_gateway_url", "") or "").strip()
        ),
        "notifyUrlFromDatabase": bool(
            (getattr(setting, "wechat_notify_url", "") or "").strip()
        ),
        "platformPublicKeyIdFromDatabase": bool(
            (getattr(setting, "wechat_platform_public_key_id", "") or "").strip()
        ),
        "apiV3KeyFromDatabase": bool(
            (getattr(setting, "wechat_api_v3_key", "") or "").strip()
        ),
        "merchantPrivateKeyFromDatabase": bool(
            (getattr(setting, "wechat_merchant_private_key", "") or "").strip()
        ),
        "platformPublicKeyFromDatabase": bool(
            (getattr(setting, "wechat_platform_public_key", "") or "").strip()
        ),
        "configured": not WeChatPayProvider.missing_credentials(merged),
    }


def validate_private_key_text(text: str) -> None:
    """校验应用私钥能被解析；不能则抛 ``PaymentError``。
    """
    message = private_key_error(text)
    if message:
        raise PaymentError(message)


def validate_public_key_text(text: str) -> None:
    """校验支付宝公钥能被解析；不能则抛 ``PaymentError``。"""
    message = public_key_error(text)
    if message:
        raise PaymentError(message)
