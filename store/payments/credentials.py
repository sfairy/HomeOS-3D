"""支付宝凭据解析：站点配置（后台可改）优先，环境变量兜底。

为什么需要单独一层：``StoreSettings`` 是启动时装配好的**不可变**对象，而
``StoreSetting`` 是运行时可变、由后台改写的。凭据必须每次现算，不能在启动时
烘焙进 settings —— 否则运营在后台换了商户号，进程不重启就永远不生效，
而「免重启改配置」恰恰是后台提供这几个字段的全部意义。

优先级规则与站点里其它配置保持一致（见 ``resolve_device_release_cooldown``）：
**站点配置非空则覆盖环境变量，留空表示跟随环境变量**。
"""

from __future__ import annotations

from dataclasses import replace

from store.config import StoreSettings
from store.models import StoreSetting
from store.payments.alipay import (
    SANDBOX_GATEWAY_URL,
    PaymentError,
    _load_private_key,
    _load_public_key,
)
#: 打码 / 归一化密钥提交值的规则与邮箱 SMTP 授权码共用一份实现
#: （见 ``store.secret_fields``。这里重新导出，保持既有调用点的 import 不变）。
from store.secret_fields import (
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
    "validate_gateway_url",
    "validate_private_key_text",
    "validate_public_key_text",
]

#: 支付宝正式网关（站点配置与环境变量都没给时的最终兜底）
PRODUCTION_GATEWAY_URL = "https://openapi.alipay.com/gateway.do"

#: 支付宝要求 RSA2048。低于这个位数本地能签名成功，网关却一律拒绝 ——
#: 报错只有一句笼统的「验签失败」，运营根本想不到是密钥长度问题。
_MIN_RSA_BITS = 2048


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
        # 回调地址同理：留空跟随环境变量，非空则以站点配置为准。
        # 这两项是「钱付了订单不到账」的第一嫌疑人，改它不该需要重启容器。
        alipay_notify_url=database_notify_url or settings.alipay_notify_url,
        alipay_return_url=database_return_url or settings.alipay_return_url,
        # 这一句是必须的：``StoreSettings.alipay_private_key_text`` 的取值顺序是
        # 「文件优先于内联」。如果环境变量配了 ``..._PATH``，后台刚填的私钥会被
        # 那个文件整个盖掉 —— 表现是「后台显示已配置，但签名用的是旧密钥」，
        # 报错只有一句笼统的验签失败。既然后台显式给了密钥，就把路径清掉。
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
        #: 当前**实际生效**的异步通知 / 同步跳转地址（可能是后台配的、环境变量给的、
        #: 或按 STORE_BASE_URL 推导出来的）。把解析后的值报出来，是因为
        #: 「通知没到」时运营第一件要做的事就是确认支付宝到底在往哪个地址推，
        #: 而过去这个值只存在于服务端拼接逻辑里，界面上完全看不到。
        "notifyUrl": merged.alipay_notify_url,
        "returnUrl": merged.alipay_return_url,
        #: 只读展示：签名算法与响应验签开关目前仍由环境变量控制（改错这两项
        #: 会直接导致下单/验签全挂，不适合随手在界面上改），但排障时需要看得见。
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
        #: 凭据是否来自后台（false=来自环境变量/文件）。前端据此提示
        #: 「留空即跟随环境变量」，避免运营以为必须在这里重填一遍。
        #:
        #: 各字段各报各的：只要有一个字段被后台显式写过，它就不再跟随环境变量。
        #: 前端**只回填来源为后台的字段** —— 如果把环境变量的值也回填进输入框，
        #: 运营随手保存一次站点名就会把环境变量「固化」进数据库，之后改环境变量
        #: 再也无效，而界面上完全看不出来。这正是这里的 fromDatabase 标记存在的意义。
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

    为什么要在**保存时**校验，而不是等第一次支付时再暴露：``sign_params`` 抛出的
    是 ``PaymentError``，会以 409/503 的形式出现在**用户下单**的动线上 ——
    运营改配置改错了，付不了款的是客户。把校验前移到配置接口，错误直接落在改配置
    的那个人眼前，用户侧完全无感。
    """
    key = _load_private_key(text)
    if key.key_size < _MIN_RSA_BITS:
        raise PaymentError(
            f"应用私钥只有 {key.key_size} 位，支付宝要求 RSA{_MIN_RSA_BITS}。"
            "请用支付宝密钥工具重新生成 2048 位密钥。"
        )


def validate_public_key_text(text: str) -> None:
    """校验支付宝公钥能被解析；不能则抛 ``PaymentError``。"""
    key = _load_public_key(text)
    if key.key_size < _MIN_RSA_BITS:
        raise PaymentError(
            f"支付宝公钥只有 {key.key_size} 位，支付宝要求 RSA{_MIN_RSA_BITS}。"
        )


def validate_gateway_url(text: str) -> None:
    """网关地址必须是 https（沙箱也是 https），且不能带查询串。"""
    if not text:
        return
    lowered = text.lower()
    if not lowered.startswith("https://"):
        raise PaymentError("支付宝网关地址必须以 https:// 开头。")
    if "?" in text or "#" in text:
        raise PaymentError("支付宝网关地址不能带查询参数，只填到 gateway.do 为止。")


def validate_callback_url(text: str, *, label: str) -> None:
    """回调地址必须是带主机名的绝对 http(s) URL。

    这里刻意允许 http：本地用 ngrok/frp 之外的纯内网调试时会用到，
    而它填错的真实代价是「用户付了钱订单不到账」，那种错误支付宝**不会**报给
    我们（它只是连不上我们的地址），只能靠运营自己看地址对不对。所以宁可在
    保存时就拦下明显写不成 URL 的值（漏了协议、只填了路径、指向 localhost）。
    """
    if not text:
        return
    lowered = text.lower()
    if not (lowered.startswith("http://") or lowered.startswith("https://")):
        raise PaymentError(
            f"{label}必须以 http:// 或 https:// 开头（要填完整的外部可达地址，"
            "不能只填路径）。"
        )
    host = lowered.split("://", 1)[1].split("/", 1)[0].split("?", 1)[0]
    if not host:
        raise PaymentError(f"{label}缺少主机名。")
    if "localhost" in host or host.startswith("127.0.0.1") or host.startswith("[::1]"):
        raise PaymentError(
            f"{label}不能填本机地址：支付宝的服务器访问不到 localhost，"
            "异步通知会永远收不到（订单停在待支付）。请填公网可达的域名，"
            "或用内网穿透工具提供的地址。"
        )
    