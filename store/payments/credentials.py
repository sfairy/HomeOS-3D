"""支付宝凭据解析：站点配置（后台可改）优先，环境变量兜底。

``StoreSettings`` 是启动时装配好的**不可变**对象，而 ``StoreSetting`` 运行时可变 ——
凭据必须每次现算，不能在启动时烘焙进 settings，否则后台改了商户号不重启就不生效。
优先级规则与站点其它配置一致：**站点配置非空则覆盖环境变量，留空表示跟随环境变量**。
"""

from __future__ import annotations

from dataclasses import replace

from store.config import StoreSettings
from store.core.models import StoreSetting
from store.payments.alipay import (
    SANDBOX_GATEWAY_URL,
    PaymentError,
    public_key_error,
    private_key_error,
    validate_callback_url,
    validate_gateway_url,
)
#: 打码/归一化密钥提交值的规则与 SMTP 授权码共用一份实现，这里重新导出以保持调用点不变。
from store.security.secret_fields import (
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

    if bool(setting.alipay_sandbox):
        # 沙箱开关是显式选择，压过手填的网关地址（联调时最怕忘了改回来）
        gateway = SANDBOX_GATEWAY_URL
    else:
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
        # 必须清掉 ``..._PATH``：``alipay_private_key_text`` 是「文件优先于内联」，环境变量
        # 配了 PATH 就会把后台刚填的私钥整个盖掉（后台显示已配置、签名却用旧密钥）。
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
        "sandbox": bool(getattr(setting, "alipay_sandbox", False)),
        #: 当前**实际生效**的异步通知/同步跳转地址（可能来自后台、环境变量或按
        #: STORE_BASE_URL 推导）。「通知没到」时运营第一件事就是确认支付宝在往哪推。
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
        #: 运营随手保存一次站点名就会把它「固化」进库，之后改环境变量再也无效。
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


def validate_private_key_text(text: str) -> None:
    """校验应用私钥能被解析；不能则抛 ``PaymentError``。

    在**保存时**校验而不是等第一次支付：错误应落在改配置的人眼前，而不是用户下单时。
    判定逻辑复用 ``private_key_error``，后台自检要用同一份结论。
    """
    message = private_key_error(text)
    if message:
        raise PaymentError(message)


def validate_public_key_text(text: str) -> None:
    """校验支付宝公钥能被解析；不能则抛 ``PaymentError``。"""
    message = public_key_error(text)
    if message:
        raise PaymentError(message)
