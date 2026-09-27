"""微信支付 APIv3 的凭据与密码学层：请求签名、回调验签、资源解密、密钥校验。

与支付宝那条（alipay_signing.py）的关键差异，决定了这里每一段都必须自己写：

* **请求签名**是 SHA256-RSA，签的是「方法 / URL / 时间戳 / 随机串 / 请求体」五行拼串；
* **回调**不仅要验签（同样五行里的后三行），资源体是 **AES-256-GCM 加密**的，
  要用 APIv3 密钥解密后才能看到交易状态 —— 也就是说「验签通过」不等于「能读内容」，
  两步都得成功才算收到一条可信通知；
* 金额单位是**分**（与库里的 ``amount_cents`` 同口径），不需要支付宝那套元/分换算。
"""

from __future__ import annotations

import base64
import json
import re
import secrets
import string
from functools import lru_cache
from typing import Any

from cryptography.exceptions import InvalidSignature, InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.x509 import load_pem_x509_certificate


class WeChatPaymentError(RuntimeError):
    """微信支付渠道的错误（凭据、签名、网关调用、回调验签）。"""


#: APIv3 密钥必须是**恰好 32 个字符**（微信的硬要求，长度不对会在解密时才炸，
#: 那时已经收到通知了 —— 所以必须在保存时就拦住）。
API_V3_KEY_LENGTH = 32

#: 随机串允许的字符集。微信要求 32 位以内，这里用去掉易混字符的字母数字。
_NONCE_ALPHABET = string.ascii_letters + string.digits


def new_nonce(length: int = 32) -> str:
    """生成请求用的随机串。

    必须**每次请求都不同**：它参与签名，重放同一个 nonce + timestamp 组合会被网关拒绝。
    """
    return "".join(secrets.choice(_NONCE_ALPHABET) for _ in range(length))


def _strip_wrapping(raw: str) -> str:
    """把环境变量里常见的写法归一：字面量 \\n、外层引号、首尾空白。"""
    text = (raw or "").strip()
    if "\\\\n" in text and "BEGIN" in text:
        text = text.replace("\\\\n", "\n")
    return text.strip().strip('"').strip("'")


def _pem_candidates(raw: str, *, label: str) -> tuple[str, ...]:
    """把「PEM 全文」与「裸 base64 正文」两种写法都变成候选 PEM。"""
    text = _strip_wrapping(raw)
    if not text:
        return ()
    if "BEGIN" in text:
        return (text,)
    body = "".join(text.split())
    wrapped = "\n".join(body[i : i + 64] for i in range(0, len(body), 64))
    return (f"-----BEGIN {label}-----\n{wrapped}\n-----END {label}-----",)


@lru_cache(maxsize=8)
def _load_private_key(raw: str) -> rsa.RSAPrivateKey:
    """解析商户 API 私钥（apiclient_key.pem）。支持 PKCS#8 与 PKCS#1。"""
    for header in ("PRIVATE KEY", "RSA PRIVATE KEY"):
        for candidate in _pem_candidates(raw, label=header):
            try:
                key = serialization.load_pem_private_key(candidate.encode("utf-8"), password=None)
            except (ValueError, TypeError):
                continue
            if isinstance(key, rsa.RSAPrivateKey):
                return key
    raise WeChatPaymentError(
        "无法解析商户 API 私钥：请填写微信支付商户平台下载的 apiclient_key.pem 内容。"
    )


@lru_cache(maxsize=8)
def _load_public_key(raw: str) -> rsa.RSAPublicKey:
    """解析「微信支付公钥」或平台证书里的公钥。"""
    text = _strip_wrapping(raw)
    if "BEGIN CERTIFICATE" in text:
        try:
            certificate = load_pem_x509_certificate(text.encode("utf-8"))
            public = certificate.public_key()
        except (ValueError, TypeError) as error:
            raise WeChatPaymentError(f"无法解析平台证书：{error}") from error
        if isinstance(public, rsa.RSAPublicKey):
            return public
        raise WeChatPaymentError("平台证书里的公钥不是 RSA，无法用于验签。")
    for candidate in _pem_candidates(text, label="PUBLIC KEY"):
        try:
            public = serialization.load_pem_public_key(candidate.encode("utf-8"))
        except (ValueError, TypeError):
            continue
        if isinstance(public, rsa.RSAPublicKey):
            return public
    raise WeChatPaymentError(
        "无法解析微信支付平台公钥：请填写商户平台「API 安全」里的微信支付公钥，或平台证书。"
    )


def merchant_private_key_error(text: str) -> str:
    """校验商户私钥；返回错误文案，空串表示合法。"""
    if not (text or "").strip():
        return "商户 API 私钥不能为空：请填 apiclient_key.pem 的内容。"
    try:
        key = _load_private_key(text)
    except WeChatPaymentError as error:
        return str(error)
    if key.key_size < 2048:
        return f"商户私钥只有 {key.key_size} 位，微信支付要求 RSA 2048。"
    return ""


def platform_public_key_error(text: str) -> str:
    """校验微信支付平台公钥（或平台证书）；返回错误文案，空串表示合法。"""
    if not (text or "").strip():
        return "微信支付平台公钥不能为空：回调验签必须用它。"
    try:
        _load_public_key(text)
    except WeChatPaymentError as error:
        return str(error)
    return ""


def api_v3_key_error(text: str) -> str:
    """校验 APIv3 密钥；返回错误文案，空串表示合法。"""
    value = (text or "").strip()
    if not value:
        return "APIv3 密钥不能为空：回调资源是用它解密（AES-256-GCM）的。"
    if len(value) != API_V3_KEY_LENGTH:
        return (
            f"APIv3 密钥必须是恰好 {API_V3_KEY_LENGTH} 个字符，当前 {len(value)} 个。"
            "它不是 API 证书、也不是商户号，而是在商户平台「API 安全」里自己设置的那串。"
        )
    return ""


def merchant_serial_no_error(text: str) -> str:
    """校验商户证书序列号；返回错误文案，空串表示合法。"""
    value = (text or "").strip()
    if not value:
        return (
            "商户证书序列号不能为空：签名请求要把它放进 Authorization 头。"
            "可在商户平台「API 安全 → 商户 API 证书」看到，或用证书文件算出来。"
        )
    if not re.fullmatch(r"[0-9A-Fa-f]{8,64}", value):
        return "商户证书序列号应当是 16 进制字符串（不含空格与冒号）。"
    return ""


def serial_from_certificate(pem: str) -> str:
    """从商户 API 证书（apiclient_cert.pem）里取出序列号（大写 16 进制）。

    只是方便运营：把证书内容贴进来就能填出序列号，省得再去网页上抄。
    """
    text = _strip_wrapping(pem)
    if "BEGIN CERTIFICATE" not in text:
        raise WeChatPaymentError("这不是一份 PEM 证书（缺少 BEGIN CERTIFICATE）。")
    try:
        certificate = load_pem_x509_certificate(text.encode("utf-8"))
    except (ValueError, TypeError) as error:
        raise WeChatPaymentError(f"无法解析证书：{error}") from error
    return format(certificate.serial_number, "X")


def build_sign_message(
    *, timestamp: str, nonce: str, body: str
) -> str:
    """回调验签用的待签串：时间戳、随机串、请求体三行（每行都以 \\n 结尾）。"""
    return f"{timestamp}\n{nonce}\n{body}\n"


def build_request_sign_message(
    *, method: str, url_path: str, timestamp: str, nonce: str, body: str
) -> str:
    """请求签名用的待签串：方法、URL（含查询串）、时间戳、随机串、请求体五行。

    ``url_path`` 必须是 **path + query**（例如 ``/v3/pay/transactions/native`` 或
    ``/v3/pay/transactions/out-trade-no/xxx?mchid=yyy``）—— 少了查询串会验签失败，
    而网关只会回一句「签名错误」，从现象看不出是这里漏了。
    """
    return f"{method.upper()}\n{url_path}\n{timestamp}\n{nonce}\n{body}\n"


def sign(message: str, private_key_text: str) -> str:
    """SHA256-RSA 签名，返回 base64。"""
    key = _load_private_key(private_key_text)
    signature = key.sign(message.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(signature).decode("ascii")


def build_authorization_header(
    *, mchid: str, serial_no: str, nonce: str, timestamp: str, signature: str
) -> str:
    """拼出 Authorization 头。五段缺一不可，顺序无所谓但字段名必须一致。"""
    return (
        "WECHATPAY2-SHA256-RSA2048 "
        f'mchid="{mchid}",'
        f'nonce_str="{nonce}",'
        f'signature="{signature}",'
        f'timestamp="{timestamp}",'
        f'serial_no="{serial_no}"'
    )


def verify_notification(
    *, timestamp: str, nonce: str, body: str, signature: str, platform_public_key_text: str
) -> bool:
    """验回调签名。**任何**失败都返回 False，绝不向上抛。

    与支付宝那条同理：这个函数只回答一个是非问题，调用方据此决定回 SUCCESS 还是 FAIL。
    密钥本身解析不出来（配置故障）也走 False，不让异常逃到端点层变成 500 ——
    微信看到 5xx 会重推，而重推永远不会成功。
    """
    if not signature or not timestamp or not nonce:
        return False
    try:
        public_key = _load_public_key(platform_public_key_text)
        public_key.verify(
            base64.b64decode(signature),
            build_sign_message(timestamp=timestamp, nonce=nonce, body=body).encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except (InvalidSignature, ValueError, TypeError, WeChatPaymentError):
        return False


def decrypt_resource(
    api_v3_key: str, resource: dict[str, Any]
) -> dict[str, Any]:
    """用 APIv3 密钥解密通知里的 ``resource``（AES-256-GCM），返回其中的 JSON。

    ``associated_data`` 可能是空串，但**必须原样传进去**：GCM 把它作为附加认证数据，
    传成 None 或漏掉会直接认证失败（报 InvalidTag），而现象看起来像「密钥不对」。
    """
    problem = api_v3_key_error(api_v3_key)
    if problem:
        raise WeChatPaymentError(problem)
    ciphertext_b64 = str(resource.get("ciphertext") or "")
    nonce = str(resource.get("nonce") or "")
    associated_data = str(resource.get("associated_data") or "")
    if not ciphertext_b64 or not nonce:
        raise WeChatPaymentError("通知资源缺少 ciphertext 或 nonce，无法解密。")
    try:
        ciphertext = base64.b64decode(ciphertext_b64)
    except (ValueError, TypeError) as error:
        raise WeChatPaymentError(f"通知资源的 ciphertext 不是合法 base64：{error}") from error
    try:
        plaintext = AESGCM(api_v3_key.encode("utf-8")).decrypt(
            nonce.encode("utf-8"), ciphertext, associated_data.encode("utf-8")
        )
    except InvalidTag as error:
        raise WeChatPaymentError(
            "通知资源解密失败（AES-256-GCM 认证不通过）：APIv3 密钥不对，或该通知不属于这个商户。"
        ) from error
    try:
        payload = json.loads(plaintext.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WeChatPaymentError(f"通知资源解密后不是合法 JSON：{error}") from error
    if not isinstance(payload, dict):
        raise WeChatPaymentError("通知资源解密后的 JSON 不是一个对象。")
    return payload


__all__ = [
    "API_V3_KEY_LENGTH",
    "WeChatPaymentError",
    "api_v3_key_error",
    "build_authorization_header",
    "build_request_sign_message",
    "build_sign_message",
    "decrypt_resource",
    "merchant_private_key_error",
    "merchant_serial_no_error",
    "new_nonce",
    "platform_public_key_error",
    "serial_from_certificate",
    "sign",
    "verify_notification",
]
