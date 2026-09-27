"""支付宝的凭据与签名层：密钥解析、参数签名、异步通知验签、凭据校验。

从 payments/alipay.py 拆出来的（那个文件 1126 行：既做签名，又做 HTTP 调用与订单状态机）。
这一层里的东西都能**单独验证** —— 签名与验签可以拿一对固定密钥做往返测试，而 AlipayProvider
那边的行为必须连真实网关才能测。拆开之后改密钥处理或签名口径，不必碰订单状态机那一半。

validate_gateway_url / validate_callback_url 会做可达性探测（走 .net_probe），那是「凭据是否
可用」的一部分校验，不是下单链路。
"""
from __future__ import annotations

from __future__ import annotations

import base64
import json
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from urllib.parse import urlsplit

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from apps.store.ops.net_probe import (
    LEVEL_FAIL,
    LEVEL_PASS,
    LEVEL_WARN,
    check_result,
    host_from_url,
    is_private_host,
    probe_http,
)
from apps.store.payments.base import PaymentError


CHINA_TZ = timezone(timedelta(hours=8))


_PRE_HEADER = "RSA PRIVATE KEY"
_PKCS8_HEADER = "PRIVATE KEY"


# 金额：分 ↔ 元
def yuan_from_cents(cents: int) -> str:
    """分转元，固定两位小数（支付宝要求 ``total_amount`` 形如 ``12.00``）。"""
    return str((Decimal(int(cents or 0)) / Decimal(100)).quantize(Decimal("0.01")))


def cents_from_yuan(value: object) -> int | None:
    """元转分；解析失败返回 None（调用方必须把 None 当校验失败，不能当 0）。"""
    try:
        return int((Decimal(str(value).strip()) * 100).quantize(Decimal("1")))
    except (InvalidOperation, ValueError, TypeError):
        return None


# 密钥：把支付宝密钥工具产出的各种格式统一成 PEM
def _strip_wrapping(raw: str) -> str:
    text = (raw or "").strip()
    # 环境变量里常见把换行写成字面量 \n 的写法
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
    # 支付宝密钥工具给的是纯 base64，PKCS1/PKCS8 都遇到过，全部试一遍
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
        # 候选逐个试：这一份不是 PEM 私钥就试下一份，全部失败由调用方报错。
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
        # 同上：这一份不是合法 PEM 公钥就试下一份。
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


# 凭据校验（纯函数：返回错误文案而不是抛异常，供保存校验与后台自检共用）
#: 支付宝要求 RSA2048。低于这个位数本地能签名成功，网关却一律拒绝 ——
#: 报错只有一句笼统的「验签失败」，运营根本想不到是密钥长度问题。
MIN_RSA_BITS = 2048


class ResponseSignatureMissing(PaymentError):
    """响应里没有 ``sign``：支付宝在「app_id / 私钥不对」这类错误上**不签名**
    （它没有一把已知的公钥可用于签），所以此时**测不了**公钥对不对。

    单独成类，让自检能按异常类型判成「无法判定」而不是靠匹配报错文案 —— 文案一改，
    判定就会静默退化成最宽松的 WARN。
    """


class ResponseSignatureInvalid(PaymentError):
    """响应带了签名但验不过：配置的那把「支付宝公钥」是错的。

    这是最该判 FAIL 的一支（典型成因：把「应用公钥」填成了「支付宝公钥」），
    同样不能靠匹配报错文案来判断。
    """


def private_key_error(text: str) -> str:
    """应用私钥的校验结论；合法时返回空串。

    返回文案而非抛异常，是为了让「保存时校验」与「后台自检」共用同一份判断，
    避免出现「保存拦得住、自检说没问题」。
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

    这是最难自查的配置错误：下单、查单全都正常（请求只用应用私钥签名），唯独
    异步通知验签全部失败，表现是「用户付了钱、订单永远停在待支付」，日志里只有
    一句笼统的「通知验签失败」。
    """
    try:
        private_key = _load_private_key(private_key_text)
        public_key = _load_public_key(public_key_text)
    except PaymentError:
        # 解析都过不了时由 private-key / public-key 两条检查去报告，这里不重复啰嗦
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

    刻意允许 http：纯内网调试会用到；而它填错的代价是「用户付了钱订单不到账」，
    支付宝不会报错，所以保存时就拦下明显写不成 URL 的值。
    """
    if not text:
        return
    lowered = text.lower()
    if not (lowered.startswith("http://") or lowered.startswith("https://")):
        raise PaymentError(
            f"{label}必须以 http:// 或 https:// 开头（要填完整的外部可达地址，"
            "不能只填路径）。"
        )
    host = host_from_url(text)
    if not host:
        raise PaymentError(f"{label}缺少主机名。")
    if is_private_host(host):
        raise PaymentError(
            f"{label}不能填本机或内网地址：支付宝的服务器访问不到 {host}，"
            "异步通知会永远收不到（订单停在待支付）。请填公网可达的域名，"
            "或用内网穿透工具提供的地址。"
        )


def _url_port(url: str, *, default: int) -> int:
    """从 URL 里取端口；没写就按协议默认（http 80，其余用 ``default``）。"""
    try:
        parsed = urlsplit((url or "").strip())
    except ValueError:
        return default
    if parsed.port:
        return int(parsed.port)
    return 80 if parsed.scheme == "http" else default


def _callback_check(
    check_id: str, label: str, url_value: str, *, reachable_hint: str
) -> dict:
    """回调地址的单项诊断：格式 → 是否内网 → 本机可达性。

    用 GET 探测而非 POST：通知端点只接受 POST，GET 得到的 405 恰好证明域名解析、
    TLS、HTTP 服务与路由都正常；POST 会真的撞进通知处理逻辑，绝不能在自检里做。
    """
    text = (url_value or "").strip()
    if not text:
        return check_result(
            check_id,
            label,
            LEVEL_FAIL,
            f"未配置，且无法按 STORE_BASE_URL 推导出有效地址。{reachable_hint}",
        )
    try:
        validate_callback_url(text, label=label)
    except PaymentError as error:
        return check_result(check_id, label, LEVEL_FAIL, str(error))

    reachable, detail = probe_http(text)
    if reachable:
        return check_result(check_id, label, LEVEL_PASS, f"{text} — {detail}")
    return check_result(
        check_id,
        label,
        LEVEL_WARN,
        f"{text} — {detail}。{reachable_hint}",
    )


# 签名
def build_sign_content(params: dict[str, object], *, excluded: frozenset[str]) -> str:
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
    try:
        key = _load_public_key(public_key_text)
        key.verify(
            base64.b64decode(signature),
            content.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def _skip_ws(raw: str, index: int) -> int:
    """跳过空白，返回第一个非空白字符的位置（越界返回 ``-1``）。"""
    length = len(raw)
    while index < length and raw[index].isspace():
        index += 1
    return index if index < length else -1


def _skip_json_string(raw: str, index: int) -> int:
    """``raw[index]`` 必须是引号：返回**闭合引号之后**的位置（未闭合返回 ``-1``）。

    必须按转义规则走：值里可能有被转义的引号，草率找下一个引号会截断字符串。
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

    只做「跳过」不做解析：这里要的不是值本身，而是它在**原文里占哪一段** ——
    验签必须对着原始字节算，重新 ``json.dumps`` 会因为空格与转义差异而验不过。
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
    # 数字 / true / false / null：吃到结构分隔符为止，再把尾部空白剪掉。
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

    验签必须用原始字节（重新 ``json.dumps`` 会因空格/转义差异失败）；按 JSON 结构
    逐层跳过并要求键命中恰好一次，重复键或骨架损坏一律返回 ``None`` —— 调用方必须
    当成「不能验签」，绝不能退化成「跳过验签」。
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
            # 顶层对象正常闭合。命中多次会在这里之前就返回 None。
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
                # 同名顶层键出现第二次：该验哪一段没有正确答案，这种报文本就不该出现。
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
        # 既不是 `,` 也不是 `}`：骨架不对，宁可返回「定位不到」也不猜。
        return None


def alipay_timestamp(moment: datetime | None = None) -> str:
    return (moment or datetime.now(CHINA_TZ)).astimezone(CHINA_TZ).strftime(
        "%Y-%m-%d %H:%M:%S"
    )


# 通知解析结果
