"""支付宝的凭据与签名层：密钥解析、参数签名、异步通知验签、凭据校验。
"""
from __future__ import annotations

import base64
import json
import re
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from ..commerce import money
from ..payments import urls as payment_urls
from ..payments.base import PaymentError

CHINA_TZ = timezone(timedelta(hours=8))


_PRE_HEADER = "RSA PRIVATE KEY"
_PKCS8_HEADER = "PRIVATE KEY"


def yuan_from_cents(cents: int) -> str:
    """分转元，固定两位小数（支付宝要求 ``total_amount`` 形如 ``12.00``）。"""
    return money.format_centi(int(cents or 0))


def cents_from_yuan(value: object) -> int | None:
    """元转分；解析失败返回 None（调用方必须把 None 当校验失败，不能当 0）。"""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        return money.to_centi(value)
    except ValueError:
        return None


def _strip_wrapping(raw: str) -> str:
    text = (raw or "").strip()
    if "\\n" in text and "BEGIN" in text:
        text = text.replace("\\n", "\n")
    return text.strip().strip('"').strip("'")


def _wrap(body: str, header: str) -> str:
    compact = re.sub(r"\s+", "", body)
    chunks = [compact[i : i + 64] for i in range(0, len(compact), 64)]
    return f"-----BEGIN {header}-----\n" + "\n".join(chunks) + f"\n-----END {header}-----"


@lru_cache(maxsize=8)
def _private_key_candidates(raw: str) -> tuple[str, ...]:
    text = _strip_wrapping(raw)
    if not text:
        return ()
    if "BEGIN" in text:
        return (text,)
    return (_wrap(text, _PKCS8_HEADER), _wrap(text, _PRE_HEADER))


@lru_cache(maxsize=8)
def _public_key_candidates(raw: str) -> tuple[str, ...]:
    text = _strip_wrapping(raw)
    if not text:
        return ()
    if "BEGIN" in text:
        return (text,)
    return (_wrap(text, "PUBLIC KEY"),)


@lru_cache(maxsize=8)
def _load_private_key(raw: str) -> rsa.RSAPrivateKey:
    for candidate in _private_key_candidates(raw):
        try:
            key = serialization.load_pem_private_key(
                candidate.encode("utf-8"), password=None
            )
        except (ValueError, TypeError):
            continue
        if isinstance(key, rsa.RSAPrivateKey):
            return key
    raise PaymentError(
        "无法解析支付宝应用私钥：请确认是 RSA 私钥（PKCS1 或 PKCS8，2048 位），"
        "且没有把「支付宝公钥」误填成私钥。"
    )


@lru_cache(maxsize=8)
def _load_public_key(raw: str) -> rsa.RSAPublicKey:
    for candidate in _public_key_candidates(raw):
        try:
            key = serialization.load_pem_public_key(candidate.encode("utf-8"))
        except (ValueError, TypeError):
            continue
        if isinstance(key, rsa.RSAPublicKey):
            return key
    raise PaymentError(
        "无法解析支付宝公钥：请填写支付宝开放平台里的「支付宝公钥」，"
        "而不是你自己的应用公钥。"
    )


MIN_RSA_BITS = 2048


class ResponseSignatureMissing(PaymentError):
    """响应里没有 ``sign``：支付宝在「app_id / 私钥不对」这类错误上**不签名**
    """


class ResponseSignatureInvalid(PaymentError):
    """响应带了签名但验不过：配置的那把「支付宝公钥」是错的。
    """


def private_key_error(text: str) -> str:
    """应用私钥的校验结论；合法时返回空串。
    """
    if not (text or "").strip():
        return "未配置应用私钥。"
    try:
        key = _load_private_key(text)
    except PaymentError as error:
        return str(error)
    if key.key_size < MIN_RSA_BITS:
        return (
            f"应用私钥只有 {key.key_size} 位，支付宝要求 RSA{MIN_RSA_BITS}。"
            "请用支付宝密钥工具重新生成 2048 位密钥。"
        )
    return ""


def public_key_error(text: str) -> str:
    """支付宝公钥的校验结论；合法时返回空串。"""
    if not (text or "").strip():
        return "未配置支付宝公钥。"
    try:
        key = _load_public_key(text)
    except PaymentError as error:
        return str(error)
    if key.key_size < MIN_RSA_BITS:
        return f"支付宝公钥只有 {key.key_size} 位，支付宝要求 RSA{MIN_RSA_BITS}。"
    return ""


def key_pair_same_modulus(private_key_text: str, public_key_text: str) -> bool:
    """配置的「支付宝公钥」是否就是**应用私钥自己导出的公钥**（模数相同即等价）。
    """
    try:
        private_key = _load_private_key(private_key_text)
        public_key = _load_public_key(public_key_text)
    except PaymentError:
        return False
    return private_key.public_key().public_numbers().n == public_key.public_numbers().n


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
    """回调地址必须是带主机名的绝对 http(s) URL，且不能指向本机/内网。

    规则本体在 ``payments/urls.py``（渠道无关）；这里只把渠道名固定成「支付宝」，
    让错误文案说的是运营正在配的那个渠道。
    """
    payment_urls.validate_callback_url(text, label=label, channel="支付宝")


def _url_port(url: str, *, default: int) -> int:
    """从 URL 里取端口（规则本体在 payments/urls.py）。"""
    return payment_urls.url_port(url, default=default)


def _callback_check(
    check_id: str, label: str, url_value: str, *, reachable_hint: str
) -> dict:
    """回调地址的单项诊断（规则本体在 payments/urls.py，渠道名固定为支付宝）。"""
    return payment_urls.callback_url_check(
        check_id, label, url_value, channel="支付宝", reachable_hint=reachable_hint
    )


def build_sign_content(params: Mapping[str, object], *, excluded: frozenset[str]) -> str:
    """拼接待签名字符串：按 key 字典序，跳过空值和 excluded。"""
    items = [
        (str(key), str(value))
        for key, value in params.items()
        if key not in excluded and value not in (None, "")
    ]
    items.sort(key=lambda item: item[0])
    return "&".join(f"{key}={value}" for key, value in items)


def sign_params(params: dict[str, object], private_key_text: str) -> str:
    """请求签名：排除 sign，但 sign_type 参与签名。"""
    content = build_sign_content(params, excluded=frozenset({"sign"}))
    key = _load_private_key(private_key_text)
    signature = key.sign(content.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(signature).decode("ascii")


def verify_content(content: str, signature: str, public_key_text: str) -> bool:
    """验签。**任何**失败都返回 False，绝不向上抛。

    这个函数只回答一个是非问题，调用方（异步通知端点）据此回纯文本 failure。
    它自己的密钥加载器在公钥不是合法 PEM 时抛的是 PaymentError（RuntimeError 子类），
    以前漏在外面：公钥填错时异步通知返回的是 HTTP 500 JSON，而不是支付宝约定要的
    failure 文本 —— 支付宝会当成「商户故障」继续重推，而订单永远停在待支付；
    主动查单同样失败，可 /healthz 的巡检状态还是 HEALTH_OK。
    """
    try:
        key = _load_public_key(public_key_text)
        key.verify(
            base64.b64decode(signature),
            content.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except (InvalidSignature, ValueError, TypeError, PaymentError):
        return False


def _skip_ws(raw: str, index: int) -> int:
    """跳过空白，返回第一个非空白字符的位置（越界返回 ``-1``）。"""
    length = len(raw)
    while index < length and raw[index].isspace():
        index += 1
    return index if index < length else -1


def _skip_json_string(raw: str, index: int) -> int:
    """``raw[index]`` 必须是引号：返回**闭合引号之后**的位置（未闭合返回 ``-1``）。
    """
    index += 1
    length = len(raw)
    while index < length:
        char = raw[index]
        if char == "\\":
            index += 2
            continue
        if char == '"':
            return index + 1
        index += 1
    return -1


def _skip_json_value(raw: str, index: int) -> int:
    """返回一个 JSON 值结束之后的位置（``-1`` 表示结构损坏）。
    """
    start = _skip_ws(raw, index)
    if start < 0:
        return -1
    char = raw[start]
    if char == '"':
        return _skip_json_string(raw, start)
    if char in "{[":
        depth = 0
        index = start
        length = len(raw)
        while index < length:
            current = raw[index]
            if current == '"':
                index = _skip_json_string(raw, index)
                if index < 0:
                    return -1
                continue
            if current in "{[":
                depth += 1
            elif current in "}]":
                depth -= 1
                if depth == 0:
                    return index + 1
            index += 1
        return -1
    index = start
    length = len(raw)
    while index < length and raw[index] not in ",}]":
        index += 1
    if index == start:
        return -1
    while index > start and raw[index - 1].isspace():
        index -= 1
    return index


def extract_raw_node(raw: str, key: str) -> str | None:
    """从原始响应文本里抠出**顶层** ``key`` 节点的原始子串。
    """
    target = json.dumps(key, ensure_ascii=False)
    index = _skip_ws(raw, 0)
    if index < 0 or raw[index] != "{":
        return None
    index += 1
    found: str | None = None
    while True:
        index = _skip_ws(raw, index)
        if index < 0:
            return None
        char = raw[index]
        if char == "}":
            return found
        if char != '"':
            return None
        name_end = _skip_json_string(raw, index)
        if name_end < 0:
            return None
        name = raw[index:name_end]
        index = _skip_ws(raw, name_end)
        if index < 0 or raw[index] != ":":
            return None
        value_start = _skip_ws(raw, index + 1)
        if value_start < 0:
            return None
        value_end = _skip_json_value(raw, value_start)
        if value_end < 0:
            return None
        if name == target:
            if found is not None:
                return None
            found = raw[value_start:value_end]
        index = _skip_ws(raw, value_end)
        if index < 0:
            return None
        if raw[index] == ",":
            index += 1
            continue
        if raw[index] == "}":
            return found
        return None


def alipay_timestamp(moment: datetime | None = None) -> str:
    return (moment or datetime.now(CHINA_TZ)).astimezone(CHINA_TZ).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
