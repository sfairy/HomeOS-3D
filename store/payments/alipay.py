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
from uuid import uuid4

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from store.config import StoreSettings
from store.models import Order, StoreSetting
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
    ) -> tuple[dict, str]:
        """调用一个 OpenAPI 方法，返回 (响应节点, 原始响应文本)。

        ``require_signature=False`` 只给凭据自检用（见 ``verify_credentials``）：
        支付宝在「app_id 不存在 / 验签失败」这类错误上**不会签名**（它没法用一把
        未知的公钥去签），开启验签就会在读到 sub_code 之前先抛「响应缺少 sign」，
        把「app_id 填错了」误报成「响应没签名」。
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

        if require_signature and settings.alipay_verify_response_sign:
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
            raise PaymentError("支付宝响应缺少 sign，已拒绝该响应（可关闭响应验签开关）。")
        content = extract_raw_node(raw, node_key)
        if not content:
            raise PaymentError("无法从支付宝响应中定位待验签内容。")
        if not verify_content(content, signature, settings.alipay_public_key_text):
            raise PaymentError("支付宝响应验签失败，已拒绝该响应。")

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
        refund_fee_cents = cents_from_yuan(node.get("refund_fee")) or amount_cents
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
    def verify_credentials(self, settings: StoreSettings) -> tuple[bool, str]:
        """用一笔**不存在的交易**探活，判断这套凭据到底能不能用。

        为什么需要一个专门的探测：凭据填错的反馈极其滞后 —— 私钥不对时签名会失败，
        但报错只在「用户点下单」的那一刻出现，而且是一句笼统的「验签失败」。
        运营改完配置只能靠再下一单来验证，改错的代价由客户承担。

        ``alipay.trade.query`` 是理想的探针：它需要一个 out_trade_no，但**不要求
        交易真实存在**（不存在会返回 ``ACQ.TRADE_NOT_EXIST``）。也就是说，只要拿到
        「交易不存在」这个回答，就说明网关已经认可了我们的 app_id 并验签通过 ——
        这正是我们要验证的事，且不产生任何资金动作。

        返回 ``(可用?, 说明文案)``，不抛异常：这是给后台的「测试凭据」按钮用的，
        失败原因要原样展示给人看，而不是变成一个 500。

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
                {"out_trade_no": f"HB-PROBE-{uuid4().hex[:12]}"},
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

    # ------------------------------------------------------------------ #
    # 查单
    # ------------------------------------------------------------------ #
    def query_payment(
        self, settings: StoreSettings, order: Order
    ) -> dict[str, object] | None:
        """查单。返回响应节点；交易不存在（尚未支付）时返回 None。"""
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
        # 查单失败不抛异常：不能因为查单接口抖动就把用户的支付流程打断
        logger.warning("支付宝查单失败 order=%s code=%s detail=%s", order.order_no, code, detail)
        return None

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
