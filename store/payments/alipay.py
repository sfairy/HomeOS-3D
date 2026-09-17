"""支付宝当面付（扫码支付）渠道。

实现三件事：

1. **下单**：``alipay.trade.precreate`` 拿到 ``qr_code``，前端用二维码渲染，
   用户扫码后由支付宝异步通知 + 主动查单两条路确认到账。
2. **异步通知验签**：``verify_notification`` 用支付宝公钥做 RSA2 验签，
   接口层再校验 app_id / 金额 / 商户号，全部通过才入账。
3. **主动查单**：``query_payment`` 调 ``alipay.trade.query``。异步通知依赖
   公网可达（本地穿透经常掉线），所以本地轮询订单时用它兜底，
   否则会出现「钱付了但订单一直不到账」。

关于签名，有两个容易踩的坑，这里刻意写成两个函数区分：

- **请求签名**：排除 ``sign``，**包含** ``sign_type``。
- **异步通知验签**：排除 ``sign`` **和** ``sign_type``。

两者规则不同，混用会表现为「本地自测能过、真机全部验签失败」。
"""

from __future__ import annotations

import base64
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from store.config import StoreSettings
from store.models import Order, StoreSetting
from store.net_probe import (
    LEVEL_FAIL,
    LEVEL_PASS,
    LEVEL_SKIP,
    LEVEL_WARN,
    check_result,
    host_from_url,
    is_private_host,
    probe_http,
    probe_tls,
)
from store.payments.base import PaymentError, PaymentIntent, RefundResult

logger = logging.getLogger("store.payments.alipay")

#: 沙箱网关（后台的「沙箱环境」开关会切到这里）。
#:
#: 注意是**新版**沙箱的域名 ``openapi-sandbox.dl.alipaydev.com``，不是旧的
#: ``openapi.alipaydev.com``：支付宝两代沙箱是两套完全独立的 AppID 与密钥，
#: 旧版沙箱已不再维护，新控制台里创建/升级出来的沙箱应用用旧域名调不通
#: （报「验签失败」或「应用不存在」，看提示完全指不到域名上）。
SANDBOX_GATEWAY_URL = "https://openapi-sandbox.dl.alipaydev.com/gateway.do"

#: 中国没有夏令时，用固定 +8 偏移，避免依赖 tzdata
CHINA_TZ = timezone(timedelta(hours=8))

#: 支付成功的两种交易状态
SUCCESS_TRADE_STATUSES = frozenset({"TRADE_SUCCESS", "TRADE_FINISHED"})

#: 交易不存在（还没付款）时的子错误码
TRADE_NOT_EXIST_SUB_CODES = frozenset({"ACQ.TRADE_NOT_EXIST", "ACQ.TRADE_HAS_CLOSE"})

#: 关单时「本来就无需关闭」的子错误码：交易不存在，或已经关闭过。
#: 都按成功处理 —— 目标状态（这笔交易不能再被支付）已经达成。
CLOSE_IDEMPOTENT_SUB_CODES = frozenset({"ACQ.TRADE_NOT_EXIST", "ACQ.TRADE_HAS_CLOSE"})

#: 关单时发现交易**已经付掉了**。这不是关单失败：钱已经进来，调用方必须立刻
#: 去对账把订单拉回已支付，否则用户付了款订单却停在过期状态。
CLOSE_ALREADY_PAID_SUB_CODES = frozenset({"ACQ.TRADE_HAS_FINISHED"})

#: 明确指向「这套凭据有问题」的子错误码，用于凭据自检时区分「凭据错」与
#: 「渠道侧其它故障」—— 两者的处置完全不同：前者要运营改配置，后者只能等。
CREDENTIAL_ERROR_SUB_CODES = frozenset(
    {
        "isv.invalid-app-id",
        "isv.app-not-exist",
        "isv.invalid-signature",
        "isv.invalid-signature-type",
        "isv.invalid-encrypt-type",
        "isv.insufficient-isv-permissions",
        "isv.missing-parameter",
    }
)

_PRE_HEADER = "RSA PRIVATE KEY"
_PKCS8_HEADER = "PRIVATE KEY"


# --------------------------------------------------------------------------- #
# 金额：分 ↔ 元
# --------------------------------------------------------------------------- #
def yuan_from_cents(cents: int) -> str:
    """分转元，固定两位小数（支付宝要求 ``total_amount`` 形如 ``12.00``）。"""
    return str((Decimal(int(cents or 0)) / Decimal(100)).quantize(Decimal("0.01")))


def cents_from_yuan(value: object) -> int | None:
    """元转分；解析失败返回 None（调用方必须把 None 当校验失败，不能当 0）。"""
    try:
        return int((Decimal(str(value).strip()) * 100).quantize(Decimal("1")))
    except (InvalidOperation, ValueError, TypeError):
        return None


# --------------------------------------------------------------------------- #
# 密钥：把支付宝密钥工具产出的各种格式统一成 PEM
# --------------------------------------------------------------------------- #
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


# --------------------------------------------------------------------------- #
# 凭据校验（纯函数：返回错误文案而不是抛异常，供保存校验与后台自检共用）
# --------------------------------------------------------------------------- #
#: 支付宝要求 RSA2048。低于这个位数本地能签名成功，网关却一律拒绝 ——
#: 报错只有一句笼统的「验签失败」，运营根本想不到是密钥长度问题。
MIN_RSA_BITS = 2048


class ResponseSignatureMissing(PaymentError):
    """响应里没有 ``sign``：支付宝在「app_id / 私钥不对」这类错误上**不签名**
    （它没有一把已知的公钥可用于签），所以此时**测不了**公钥对不对。

    单独成类是为了让自检能把它判成「无法判定」而不是「通过」—— 过去自检靠
    ``"缺少 sign" in str(error)`` 这样的**字符串匹配**来区分，那么只要有人改了
    那句报错文案，判定就会静默退化成最宽松的那一支（WARN，永不 FAIL）。
    """


class ResponseSignatureInvalid(PaymentError):
    """响应带了签名但验不过：配置的那把「支付宝公钥」是错的。

    这是最该判 FAIL 的一支（典型成因：把「应用公钥」填成了「支付宝公钥」），
    同样不能靠匹配报错文案来判断。
    """


def private_key_error(text: str) -> str:
    """应用私钥的校验结论；合法时返回空串。

    返回文案而不是抛异常，是为了让「保存时校验」（抛给改配置的人）与
    「后台自检」（把结论念给运维听）能共用同一份判断 —— 两边各写一遍的话，
    迟早出现「保存拦得住、自检说没问题」这种自相矛盾。
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
    """配置的「支付宝公钥」是否就是**应用私钥自己导出的公钥**。

    这是本项目最容易犯、也最难自查的一个配置错误：支付宝开放平台上有两个长得很像
    的公钥（「应用公钥」与「支付宝公钥」），把前者填到「支付宝公钥」那一栏，

    * 下单、查单**全都正常**（请求只用应用私钥签名，网关那边有我们的应用公钥）；
    * 唯独**异步通知验签全部失败** —— 因为通知是支付宝用它自己的私钥签的，
      要用「支付宝公钥」才能验。表现是「用户付了钱、订单永远停在待支付」，
      而日志里只有一句笼统的「通知验签失败」。

    两个公钥的模数相同即等价于「填的是自己那把公钥」，可以确定填错了。
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

    这里刻意允许 http：本地用 ngrok/frp 之外的纯内网调试时会用到，
    而它填错的真实代价是「用户付了钱订单不到账」，那种错误支付宝**不会**报给
    我们（它只是连不上我们的地址），只能靠运营自己看地址对不对。所以宁可在
    保存时就拦下明显写不成 URL 的值（漏了协议、只填了路径、指向内网）。
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

    用 GET 探测而不是 POST：异步通知端点只接受 POST，GET 会得到 405 ——
    而 405 恰恰证明「域名解析正常、TLS 正常、HTTP 服务在监听、路由到对了地方」。
    用 POST 去探则会真的撞进通知处理逻辑，绝不能在自检里做。
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


# --------------------------------------------------------------------------- #
# 签名
# --------------------------------------------------------------------------- #
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


def extract_raw_node(raw: str, key: str) -> str | None:
    """从原始响应文本里抠出某个 JSON 节点的**原始子串**。

    验签必须用原始字节，重新 ``json.dumps`` 会因为空格/转义差异导致验签失败。
    """
    needle = f'"{key}"'
    index = raw.find(needle)
    if index < 0:
        return None
    colon = raw.find(":", index + len(needle))
    if colon < 0:
        return None
    start = raw.find("{", colon)
    if start < 0:
        return None

    depth = 0
    in_string = False
    escaped = False
    for position in range(start, len(raw)):
        char = raw[position]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return raw[start : position + 1]
    return None


def alipay_timestamp(moment: datetime | None = None) -> str:
    return (moment or datetime.now(CHINA_TZ)).astimezone(CHINA_TZ).strftime(
        "%Y-%m-%d %H:%M:%S"
    )


# --------------------------------------------------------------------------- #
# 通知解析结果
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class AlipayNotification:
    """异步通知的验签结果。``ok`` 为假时**绝不能入账**。"""

    ok: bool
    reason: str = ""
    out_trade_no: str = ""
    trade_no: str = ""
    trade_status: str = ""
    total_amount: str = ""
    app_id: str = ""
    seller_id: str = ""
    fields: dict[str, str] = field(default_factory=dict)

    @property
    def is_success(self) -> bool:
        return self.trade_status in SUCCESS_TRADE_STATUSES


@dataclass(frozen=True)
class CloseResult:
    """关单结果。

    ``closed`` 为真表示渠道侧那笔交易已经不可能再被支付（包含「本来就不存在 /
    已经关闭过」这类幂等情况）。``already_paid`` 为真表示关单时发现**钱已经付了**——
    这不是失败，调用方必须立刻去对账认领这笔钱，否则用户付了款、订单却停在
    过期状态，只能等人工客服。
    """

    closed: bool
    already_paid: bool = False
    reason: str = ""


class AlipayProvider:
    name = "alipay"

    def __init__(self, settings: StoreSettings | None = None) -> None:
        #: 由 :func:`store.payments.resolve_provider` 注入的「已合并站点配置」的
        #: settings。方法收到的 ``settings`` 常常直接来自 ``app.state.settings``
        #: （只含环境变量），照它取凭据会让后台填的商户号/密钥完全失效，
        #: 所以公开方法一律以注入值为准。
        self._settings = settings

    def _resolve(self, settings: StoreSettings) -> StoreSettings:
        return self._settings or settings

    def resolve_settings(self, settings: StoreSettings) -> StoreSettings:
        """返回本次调用**实际生效**的凭据集合（已合并后台站点配置）。

        调用方要校验 ``app_id`` / ``seller_id`` 这类「这笔交易属于哪个商户」的
        字段时，必须用这一份，而不是自己手里那份（通常直接来自
        ``app.state.settings``，只有环境变量）：

        * 后台配了商户号时，``settings.alipay_app_id`` 是空的 ——「非空才比较」
          的写法会把整段校验静默跳过；
        * 环境变量与后台不一致时，会拿旧商户号把**正常**的通知全部拒掉，
          表现是「用户付了钱、订单永远不到账、日志只说过 app_id 不匹配」。
        """
        return self._resolve(settings)

    # ------------------------------------------------------------------ #
    # 配置
    # ------------------------------------------------------------------ #
    def is_configured(self, settings: StoreSettings) -> bool:
        settings = self._resolve(settings)
        return bool(
            settings.alipay_app_id
            and settings.alipay_private_key_text
            and settings.alipay_public_key_text
        )

    def _assert_configured(self, settings: StoreSettings) -> None:
        settings = self._resolve(settings)
        if self.is_configured(settings):
            # 签名算法（``sign_params``）实际写死 SHA256withRSA，也就是支付宝说的
            # RSA2。``sign_type`` 却是可以配的：配成 ``RSA``（SHA1）时，请求会声明
            # RSA、签名却是 RSA2 的 —— 网关按 SHA1 去验一份 SHA256 签名，只回一句
            # 笼统的「验签失败」，运营根本想不到是配置项的问题。宁可在下单时报错，
            # 也不要让每一笔支付都失败在一个说不清原因的地方。
            sign_type = (settings.alipay_sign_type or "RSA2").upper()
            if sign_type != "RSA2":
                raise PaymentError(
                    f"STORE_ALIPAY_SIGN_TYPE={sign_type} 暂不支持：本服务只实现 RSA2"
                    "（SHA256withRSA）签名。请改为 RSA2。"
                )
            return
        missing = []
        if not settings.alipay_app_id:
            missing.append("应用 appId")
        if not settings.alipay_private_key_text:
            missing.append("应用私钥")
        if not settings.alipay_public_key_text:
            missing.append("支付宝公钥")
        raise PaymentError(
            "支付宝收款尚未配置完整，缺少：" + "、".join(missing) + "。"
        )

    def notify_url(self, settings: StoreSettings, base_url: str) -> str:
        settings = self._resolve(settings)
        return settings.alipay_notify_url or f"{base_url}/store/v1/payments/alipay/notify"

    def return_url(self, settings: StoreSettings, base_url: str) -> str:
        settings = self._resolve(settings)
        return settings.alipay_return_url or f"{base_url}/store/payment/return"

    # ------------------------------------------------------------------ #
    # 调接口
    # ------------------------------------------------------------------ #
    def _call(
        self,
        settings: StoreSettings,
        method: str,
        biz_content: dict[str, object],
        *,
        base_url: str | None = None,
        require_signature: bool = True,
        force_signature_check: bool = False,
    ) -> tuple[dict, str]:
        """调用一个 OpenAPI 方法，返回 (响应节点, 原始响应文本)。

        ``require_signature=False`` 只给凭据自检的**探活那一步**用
        （见 ``_probe_gateway_credentials``）：
        支付宝在「app_id 不存在 / 验签失败」这类错误上**不会签名**（它没法用一把
        未知的公钥去签），开启验签就会在读到 sub_code 之前先抛「响应缺少 sign」，
        把「app_id 填错了」误报成「响应没签名」。

        ``force_signature_check=True`` 供后台自检反向使用：它就是要在
        ``alipay_verify_response_sign`` 关着的时候也真的验一次签名，
        从而回答「那把支付宝公钥到底对不对」—— 通知验签失败是整条支付链路里
        最难自查的故障（用户付了钱、订单永远不到账），不能因为一个环境变量
        没打开就测不到。
        """
        settings = self._resolve(settings)
        self._assert_configured(settings)
        node_key = method.replace(".", "_") + "_response"
        params: dict[str, object] = {
            "app_id": settings.alipay_app_id,
            "method": method,
            "format": "JSON",
            "charset": "utf-8",
            "sign_type": settings.alipay_sign_type or "RSA2",
            "timestamp": alipay_timestamp(),
            "version": "1.0",
            "biz_content": json.dumps(biz_content, ensure_ascii=False, separators=(",", ":")),
        }
        if method == "alipay.trade.precreate":
            # 只有下单需要回调地址；查单不需要。
            # 优先用请求推导出的 base_url（穿透/反代场景下它才是外部可达的地址）
            origin = base_url or settings.public_base_url
            params["notify_url"] = self.notify_url(settings, origin)
            params["return_url"] = self.return_url(settings, origin)

        params["sign"] = sign_params(params, settings.alipay_private_key_text)

        try:
            response = httpx.post(
                settings.alipay_gateway_url,
                data=params,
                timeout=15.0,
                headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
            )
        except httpx.HTTPError as error:
            raise PaymentError(f"访问支付宝网关失败：{error}") from error

        if response.status_code != 200:
            raise PaymentError(
                f"支付宝网关返回 HTTP {response.status_code}：{response.text[:200]}"
            )

        raw = response.text
        try:
            payload = json.loads(raw)
        except ValueError as error:
            raise PaymentError(f"支付宝返回的不是合法 JSON：{raw[:200]}") from error
        if not isinstance(payload, dict):
            raise PaymentError("支付宝返回结构异常。")

        node = payload.get(node_key)
        if not isinstance(node, dict):
            raise PaymentError(f"支付宝返回缺少 {node_key} 节点：{raw[:200]}")

        if (require_signature and settings.alipay_verify_response_sign) or force_signature_check:
            self._verify_response(raw, node_key, payload.get("sign"), settings)

        return node, raw

    def _verify_response(
        self,
        raw: str,
        node_key: str,
        signature: object,
        settings: StoreSettings,
    ) -> None:
        settings = self._resolve(settings)
        if not isinstance(signature, str) or not signature:
            raise ResponseSignatureMissing(
                "支付宝响应缺少 sign，已拒绝该响应（可关闭响应验签开关）。"
            )
        content = extract_raw_node(raw, node_key)
        if not content:
            raise PaymentError("无法从支付宝响应中定位待验签内容。")
        if not verify_content(content, signature, settings.alipay_public_key_text):
            raise ResponseSignatureInvalid("支付宝响应验签失败，已拒绝该响应。")

    # ------------------------------------------------------------------ #
    # 下单
    # ------------------------------------------------------------------ #
    def create_payment(
        self,
        *,
        order: Order,
        settings: StoreSettings,
        setting: StoreSetting,
        base_url: str,
    ) -> PaymentIntent:
        settings = self._resolve(settings)
        self._assert_configured(settings)

        subject = (
            setting.payment_transaction_description
            or settings.alipay_transaction_description
            or "HomeOS 授权"
        )
        biz_content = {
            "out_trade_no": order.order_no,
            "total_amount": yuan_from_cents(order.amount_cents),
            "subject": subject[:256],
        }

        node, _raw = self._call(
            settings, "alipay.trade.precreate", biz_content, base_url=base_url
        )
        code = str(node.get("code", ""))
        if code != "10000":
            detail = node.get("sub_msg") or node.get("msg") or "未知错误"
            raise PaymentError(f"支付宝下单失败（{code}）：{detail}")

        qr_code = str(node.get("qr_code") or "")
        if not qr_code:
            raise PaymentError("支付宝下单成功但没有返回二维码。")

        display_name = setting.payment_display_name or "支付宝"
        logger.info(
            "支付宝下单成功 order=%s amount=%s", order.order_no, biz_content["total_amount"]
        )
        return PaymentIntent(
            provider=self.name,
            payload={
                "type": "alipay",
                "qrCode": qr_code,
                "displayName": display_name,
                "transactionDescription": subject,
                "outTradeNo": order.order_no,
                "note": "请用支付宝扫码支付，付款后本页会自动确认。",
            },
            qr_code=qr_code,
        )

    # ------------------------------------------------------------------ #
    # 退款
    # ------------------------------------------------------------------ #
    def refund_payment(
        self,
        *,
        order: Order,
        amount_cents: int,
        reason: str,
        out_request_no: str,
        settings: StoreSettings,
        setting: StoreSetting,
    ) -> RefundResult:
        """调用 ``alipay.trade.refund`` 真实退款。

        后台「退款」按钮过去只改本地状态：订单显示已退款、授权被停用，但钱仍留在
        商户账户里，客户以为退过了。这里补上真实的资金动作，并把渠道退款单号带回
        去落库，对账时才有依据。

        ``out_request_no`` 由调用方按**每一次退款动作**生成唯一值：支付宝把它当
        幂等键，同一个值重复提交会直接返回上一次的结果。过去它是按订单号写死的，
        于是「先退 30%、再退 70%」的第二次调用被静默去重 —— 钱没退出去，本地却
        已经记成已退款。

        失败一律抛 ``PaymentError``（由调用方转成 409 并**保持订单状态不变**）——
        绝不能出现「状态改了但钱没退」。
        """
        settings = self._resolve(settings)
        self._assert_configured(settings)
        if amount_cents <= 0:
            raise PaymentError("退款金额必须大于 0。")
        if not (out_request_no or "").strip():
            raise PaymentError("退款缺少幂等请求号 out_request_no。")

        biz_content: dict[str, object] = {
            "out_trade_no": order.order_no,
            "refund_amount": yuan_from_cents(amount_cents),
            # 每次退款动作唯一：支付宝按它幂等，重复点击不会把钱扣两次，
            # 而多次部分退款因为值不同都能真的退出去。
            "out_request_no": out_request_no.strip()[:64],
        }
        if reason:
            biz_content["refund_reason"] = reason[:256]

        try:
            node, _raw = self._call(settings, "alipay.trade.refund", biz_content)
        except PaymentError as error:
            raise PaymentError(f"支付宝退款失败：{error}") from error

        code = str(node.get("code", ""))
        if code != "10000":
            detail = node.get("sub_msg") or node.get("msg") or "未知错误"
            raise PaymentError(f"支付宝退款失败（{code}）：{detail}")

        # fund_change=N 表示本次调用没有产生实际资金变动（重复退款/已退款）。
        # 这不算失败 —— 钱本来就在用户那边了，按成功处理并说明。
        fund_change = str(node.get("fund_change", "")).upper()
        # ``refund_fee`` 是**本次实际**退出去的钱，必须原样采信 —— 包括 0。
        # 过去写成 ``cents_from_yuan(...) or amount_cents``：0 是合法值但在 Python 里
        # 是假值，于是「本次一分钱没退」（fund_change=N）被替换成请求金额，本地把没退
        # 出去的钱记成已退 —— 累计退款额虚增、授权被收回、邀请奖励被回退，而钱还在
        # 商户账户里。只有字段缺失或脏数据（cents_from_yuan 返回 None）才需要兜底，
        # 且兜底值必须看 fund_change：没有资金变动时兜 0，否则才按请求金额认。
        parsed_fee = cents_from_yuan(node.get("refund_fee"))
        if parsed_fee is None:
            parsed_fee = 0 if fund_change == "N" else int(amount_cents)
        refund_fee_cents = max(0, int(parsed_fee))
        trade_no = str(node.get("trade_no") or order.payment_trade_no or "")
        logger.info(
            "支付宝退款完成 order=%s amount=%s fund_change=%s",
            order.order_no,
            biz_content["refund_amount"],
            fund_change or "-",
        )
        return RefundResult(
            ok=True,
            trade_no=trade_no or None,
            unrefunded_cents=max(0, int(amount_cents) - int(refund_fee_cents)),
            detail=(
                "渠道确认本次无新增资金变动（该笔可能已退过款）"
                if fund_change == "N"
                else f"支付宝已退回 ¥{refund_fee_cents / 100:.2f}"
            ),
        )

    # ------------------------------------------------------------------ #
    # 异步通知验签
    # ------------------------------------------------------------------ #
    def verify_notification(
        self, settings: StoreSettings, form: dict[str, str]
    ) -> AlipayNotification:
        settings = self._resolve(settings)
        fields = {str(key): ("" if value is None else str(value)) for key, value in form.items()}
        signature = fields.get("sign", "")
        if not signature:
            return AlipayNotification(ok=False, reason="通知缺少 sign 参数", fields=fields)

        # 注意：通知验签要同时排除 sign 和 sign_type，与请求签名规则不同
        content = build_sign_content(
            fields, excluded=frozenset({"sign", "sign_type"})
        )
        if not verify_content(content, signature, settings.alipay_public_key_text):
            return AlipayNotification(ok=False, reason="通知验签失败", fields=fields)

        return AlipayNotification(
            ok=True,
            out_trade_no=fields.get("out_trade_no", ""),
            trade_no=fields.get("trade_no", ""),
            trade_status=fields.get("trade_status", ""),
            total_amount=fields.get("total_amount", ""),
            app_id=fields.get("app_id", ""),
            seller_id=fields.get("seller_id", ""),
            fields=fields,
        )

    # ------------------------------------------------------------------ #
    # 凭据自检
    # ------------------------------------------------------------------ #
    def _probe_gateway_credentials(self, settings: StoreSettings) -> tuple[bool, str]:
        """用一笔**不存在的交易**探活，判断这套凭据到底能不能用。

        这是自检里的**一步**，不是自检本身：对外入口是 ``diagnose_credentials``
        （后台「测试凭据」按钮走的就是它）。名字从 ``verify_credentials`` 改成私有 +
        更具体的说法，正是因为审计里出现过「凭据自检从不使用支付宝公钥」这条结论 ——
        把这一步当成了全部自检。它确实不用公钥，而它**不该**被当成「都验过了」。
        这里只回答「网关认不认这套 app_id + 私钥」；「公钥能不能验通」由
        ``diagnose_credentials`` 的 ``public-key-verified`` 一项负责。

        为什么需要一个专门的探测：凭据填错的反馈极其滞后 —— 私钥不对时签名会失败，
        但报错只在「用户点下单」的那一刻出现，而且是一句笼统的「验签失败」。
        运营改完配置只能靠再下一单来验证，改错的代价由客户承担。

        ``alipay.trade.query`` 是理想的探针：它需要一个 out_trade_no，但**不要求
        交易真实存在**（不存在会返回 ``ACQ.TRADE_NOT_EXIST``）。也就是说，只要拿到
        「交易不存在」这个回答，就说明网关已经认可了我们的 app_id 并验签通过 ——
        这正是我们要验证的事，且不产生任何资金动作。

        返回 ``(可用?, 说明文案)``，不抛异常：结论要原样念给管理员听，
        变成一个 500 就失去了全部意义。

        这里刻意**关掉响应验签**（``require_signature=False``）：凭据填错时支付宝
        的错误响应根本不带 ``sign``（它没有可用的公钥来签），开启验签会先抛
        「响应缺少 sign」，把「app_id 填错了」误报成「响应没签名」。自检只是把结论
        念给管理员听，不改变任何状态，所以不验签的代价可以接受。
        """
        settings = self._resolve(settings)
        try:
            self._assert_configured(settings)
            node, _raw = self._call(
                settings,
                "alipay.trade.query",
                {"out_trade_no": f"HOMEOS-PROBE-{uuid4().hex[:12]}"},
                require_signature=False,
            )
        except PaymentError as error:
            return False, str(error)

        code = str(node.get("code", ""))
        sub_code = str(node.get("sub_code", ""))
        detail = str(node.get("sub_msg") or node.get("msg") or "")
        if code == "10000":
            # 理论上不该命中（探测单号是随机生成的），真命中同样说明凭据可用。
            return True, "凭据可用：网关接受了本次请求。"
        if sub_code in TRADE_NOT_EXIST_SUB_CODES:
            return True, "凭据可用：网关已完成验签（探测单号不存在属于预期结果）。"
        if sub_code in CREDENTIAL_ERROR_SUB_CODES:
            return False, f"凭据不可用（{code}）：{detail or sub_code}"
        return False, f"网关返回了预期外的错误（{code}）：{detail or '无详细说明'}"

    def diagnose_credentials(
        self,
        settings: StoreSettings,
        *,
        notify_url: str = "",
        return_url: str = "",
    ) -> tuple[bool, str, list[dict]]:
        """逐项自检当前凭据与回调配置，返回 ``(是否全部通过, 一句话结论, 结论列表)``。

        与 ``_probe_gateway_credentials`` 的关系：后者只回答「网关认不认这套 app_id + 私钥」，
        用的是 `require_signature=False` 的探活 —— 也就是说它**从来没有用过支付宝
        公钥**。而线上最难自查、损失最直接的两个故障恰好都落在它测不到的地方：

        1. 「支付宝公钥」填成了「应用公钥」→ 下单、查单全通，**每一笔异步通知都验签
           失败**，用户付了钱订单永远停在待支付；
        2. 异步通知地址填成了本机/内网地址 → 支付宝根本够不着，同样表现为
           「钱付了、订单不到账」，而支付宝不会报任何错。

        所以这里把检查项铺开成一张清单，每一项独立判定，并且**任何一项不是 pass
        都不算通过** —— 把「没测到」渲染成绿色正是这轮改造要消灭的东西。

        不抛异常：结论要原样念给运维听，变成一个 500 就失去了全部意义。
        """
        settings = self._resolve(settings)
        checks: list[dict] = []

        # ---- 网关地址 ---- #
        gateway = (settings.alipay_gateway_url or "").strip()
        gateway_valid = True
        try:
            validate_gateway_url(gateway)
        except PaymentError as error:
            gateway_valid = False
            checks.append(check_result("gateway-url", "网关地址", LEVEL_FAIL, str(error)))
        else:
            checks.append(check_result("gateway-url", "网关地址", LEVEL_PASS, gateway or "（未配置）"))

        # ---- 签名算法 ---- #
        sign_type = (settings.alipay_sign_type or "RSA2").upper()
        if sign_type == "RSA2":
            checks.append(check_result("sign-type", "签名算法", LEVEL_PASS, "RSA2（SHA256withRSA）"))
        else:
            checks.append(
                check_result(
                    "sign-type",
                    "签名算法",
                    LEVEL_FAIL,
                    f"当前为 {sign_type}，但本服务只实现 RSA2；下单会直接被拒绝。请改为 RSA2。",
                )
            )

        # ---- 应用私钥 ---- #
        private_text = settings.alipay_private_key_text
        private_error = private_key_error(private_text)
        if private_error:
            checks.append(check_result("private-key", "应用私钥", LEVEL_FAIL, private_error))
        else:
            checks.append(
                check_result("private-key", "应用私钥", LEVEL_PASS, "格式与位数合法（RSA2048）。")
            )

        # ---- 支付宝公钥 ---- #
        public_text = settings.alipay_public_key_text
        public_error = public_key_error(public_text)
        if public_error:
            checks.append(check_result("public-key", "支付宝公钥", LEVEL_FAIL, public_error))
        else:
            checks.append(
                check_result("public-key", "支付宝公钥", LEVEL_PASS, "格式与位数合法（RSA2048）。")
            )

        # ---- 两把公钥是否同一把（最隐蔽的配置错误） ---- #
        # 只在两把都能解析时才判定，否则由上面两条去报告。
        if not private_error and not public_error:
            if key_pair_same_modulus(private_text, public_text):
                checks.append(
                    check_result(
                        "key-pair-distinct",
                        "公钥区分",
                        LEVEL_FAIL,
                        "「支付宝公钥」填成了你自己的应用公钥（两者模数相同）。"
                        "下单能成功，但每一笔异步通知都会验签失败 —— 用户付了钱订单也到不了账。"
                        "请改填开放平台里的「支付宝公钥」。",
                    )
                )
            else:
                checks.append(
                    check_result(
                        "key-pair-distinct",
                        "公钥区分",
                        LEVEL_PASS,
                        "支付宝公钥与应用私钥是两把不同的密钥。",
                    )
                )

        # ---- 网关网络可达性 ---- #
        gateway_host = host_from_url(gateway)
        if not gateway_valid or not gateway_host:
            checks.append(check_result("network", "网关连通性", LEVEL_SKIP, "网关地址无效，未尝试连接。"))
        else:
            gateway_port = _url_port(gateway, default=443)
            reachable, detail = probe_tls(gateway_host, gateway_port)
            checks.append(
                check_result(
                    "network",
                    "网关连通性",
                    LEVEL_PASS if reachable else LEVEL_FAIL,
                    f"{gateway_host}:{gateway_port} — {detail}",
                )
            )

        # ---- 网关是否认可这套凭据（探活，无资金动作） ---- #
        accepted, accepted_detail = self._probe_gateway_credentials(settings)
        checks.append(
            check_result(
                "credentials-accepted",
                "网关验签（探活）",
                LEVEL_PASS if accepted else LEVEL_FAIL,
                accepted_detail,
            )
        )

        # ---- 支付宝公钥能不能真的验通（响应验签） ---- #
        # 这一步是整套诊断里唯一真正使用「支付宝公钥」的地方。
        #
        # 判定按**异常类型**而不是报错文案：文案改一个字，字符串匹配就会静默落进
        # 最宽松的那一支（WARN），而它恰恰是「没测到」的伪装。见
        # ``ResponseSignatureMissing`` / ``ResponseSignatureInvalid``。
        probe_no = f"HOMEOS-PROBE-{uuid4().hex[:12]}"
        try:
            self._call(
                settings,
                "alipay.trade.query",
                {"out_trade_no": probe_no},
                require_signature=False,
                force_signature_check=True,
            )
        except ResponseSignatureMissing:
            # 支付宝在「app_id/私钥不对」这类错误上不签名，此时无法判定公钥；
            # 这是「测不了」，不是「通过」。
            checks.append(
                check_result(
                    "public-key-verified",
                    "响应验签",
                    LEVEL_WARN,
                    "网关本次响应未带签名，无法据此判定支付宝公钥是否正确"
                    "（先修好上面的凭据项再复测）。",
                )
            )
        except ResponseSignatureInvalid:
            checks.append(
                check_result(
                    "public-key-verified",
                    "响应验签",
                    LEVEL_FAIL,
                    "响应验签失败：支付宝公钥不正确。最常见的原因是填成了自己的"
                    "「应用公钥」，请改成开放平台里的「支付宝公钥」。",
                )
            )
        except PaymentError as error:
            checks.append(
                check_result("public-key-verified", "响应验签", LEVEL_WARN, str(error))
            )
        else:
            checks.append(
                check_result(
                    "public-key-verified",
                    "响应验签",
                    LEVEL_PASS,
                    "已用配置的支付宝公钥成功验签一次真实响应。",
                )
            )

        # ---- 卖家 PID ---- #
        if (settings.alipay_seller_id or "").strip():
            checks.append(check_result("seller-id", "卖家 PID", LEVEL_PASS, settings.alipay_seller_id))
        else:
            checks.append(
                check_result(
                    "seller-id",
                    "卖家 PID",
                    LEVEL_WARN,
                    "未配置：异步通知的收款方校验会被跳过。多商户共用同一套 appId 时应补上。",
                )
            )

        # ---- 回调地址 ---- #
        checks.extend(
            [
                _callback_check(
                    "notify-url",
                    "异步通知地址",
                    notify_url,
                    reachable_hint="支付宝服务器回调的地址，必须公网可达；"
                    "本机可达不代表支付宝可达（NAT 回环会让探测提前成功）。",
                ),
                _callback_check(
                    "return-url",
                    "同步跳转地址",
                    return_url,
                    reachable_hint="用户付完款后浏览器回到的页面，必须是公网可达的绝对地址。",
                ),
            ]
        )

        # ---- 沙箱 ---- #
        if bool(getattr(settings, "alipay_sandbox", False)) or gateway_host == host_from_url(
            SANDBOX_GATEWAY_URL
        ):
            checks.append(
                check_result(
                    "sandbox",
                    "运行环境",
                    LEVEL_WARN,
                    "当前指向沙箱网关：不会产生真实资金，也不能用于正式收款。上线前请关闭沙箱并换成正式凭据。",
                )
            )
        else:
            checks.append(check_result("sandbox", "运行环境", LEVEL_PASS, "正式环境网关。"))

        passed = all(item["level"] == LEVEL_PASS for item in checks)
        failures = [item for item in checks if item["level"] == LEVEL_FAIL]
        warnings = [item for item in checks if item["level"] == LEVEL_WARN]
        if passed:
            message = "凭据自检全部通过：网关验签、响应验签与回调地址配置均可用。"
        elif failures:
            message = "自检未通过：" + "；".join(
                f"{item['label']} —— {item['detail']}" for item in failures
            )
        else:
            message = "自检未通过（存在无法判定或需要留意的事项）：" + "；".join(
                f"{item['label']} —— {item['detail']}" for item in warnings
            )
        return passed, message[:500], checks

    # ------------------------------------------------------------------ #
    # 查单
    # ------------------------------------------------------------------ #
    def query_payment(
        self, settings: StoreSettings, order: Order
    ) -> dict[str, object] | None:
        """查单。返回响应节点；**确认**交易不存在（尚未支付）时返回 ``None``。

        三态语义是刻意的，调用方必须区分：

        - 返回节点 → 微信/支付宝那边确实有这笔交易，按 ``trade_status`` 判断。
        - 返回 ``None`` → 渠道明确回答「交易不存在」（``sub_code`` 在白名单里）。
          对调用方意味着「远端没有开着的东西」：待支付单可以安全地本地过期，
          已关闭单可以放心标记 ``channel_closed_at``。
        - 抛 ``PaymentError`` → 查单**失败**（网络抖动、限流、网关 5xx）。这跟
          「交易不存在」是完全相反的结论，绝不能混成同一个 ``None``：关单环节
          过去就是靠 ``None`` 给订单打上 ``channel_closed_at`` 的，一次网关抖动
          会让一笔其实还开着的交易被永久标记成「已关闭」，从此再也不关单 ——
          旧二维码一直能付款。
        """
        settings = self._resolve(settings)
        node, _raw = self._call(
            settings, "alipay.trade.query", {"out_trade_no": order.order_no}
        )
        code = str(node.get("code", ""))
        if code == "10000":
            return node
        sub_code = str(node.get("sub_code", ""))
        if sub_code in TRADE_NOT_EXIST_SUB_CODES:
            return None
        detail = node.get("sub_msg") or node.get("msg") or "未知错误"
        # 查单失败抛异常，由调用方决定「本轮跳过、下轮再来」——
        # 主动查单路径要把它挡在用户流程之外，巡检路径要记 failed 而不是当没查过。
        raise PaymentError(f"支付宝查单失败（{code}）：{detail}")

    # ------------------------------------------------------------------ #
    # 关单
    # ------------------------------------------------------------------ #
    def close_payment(self, settings: StoreSettings, order: Order) -> CloseResult:
        """关闭渠道侧的预下单交易（``alipay.trade.close``）。

        为什么必须关：本地把订单置为 expired / cancelled 只是改了我们自己的状态，
        用户在支付宝里那笔「待付款」交易仍然开着 —— 旧二维码能继续扫、继续付。
        钱进来时本地订单已经进终态、库存预留也还给了别人，只能按「复活单」
        补发并发起人工复核。关单把这个窗口直接堵掉。

        失败的语义刻意分层：

        - 交易不存在 / 已关闭 → 目标已达成，按成功返回（接口幂等，可重复调用）。
        - 交易已付款 → 不是失败，``already_paid=True``，让调用方立刻对账认钱。
        - 其余错误 → 抛 ``PaymentError``，由调用方决定是否重试（``channel_closed_at``
          没写，下一轮扫描还会再来一次）。
        """
        settings = self._resolve(settings)
        self._assert_configured(settings)
        node, _raw = self._call(
            settings, "alipay.trade.close", {"out_trade_no": order.order_no}
        )
        code = str(node.get("code", ""))
        if code == "10000":
            logger.info("支付宝关单成功 order=%s", order.order_no)
            return CloseResult(closed=True)

        sub_code = str(node.get("sub_code", ""))
        detail = str(node.get("sub_msg") or node.get("msg") or "未知错误")
        if sub_code in CLOSE_IDEMPOTENT_SUB_CODES:
            logger.info(
                "支付宝关单：交易本就不存在或已关闭 order=%s sub_code=%s",
                order.order_no,
                sub_code,
            )
            return CloseResult(closed=True, reason=detail)
        if sub_code in CLOSE_ALREADY_PAID_SUB_CODES:
            logger.warning(
                "支付宝关单时发现交易已付款 order=%s sub_code=%s —— 转去对账",
                order.order_no,
                sub_code,
            )
            return CloseResult(closed=False, already_paid=True, reason=detail)

        raise PaymentError(f"支付宝关单失败（{code}）：{detail}")
