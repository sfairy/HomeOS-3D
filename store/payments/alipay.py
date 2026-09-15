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

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from store.config import StoreSettings
from store.models import Order, StoreSetting
from store.payments.base import PaymentError, PaymentIntent

logger = logging.getLogger("store.payments.alipay")

#: 沙箱网关（STORE_ALIPAY_GATEWAY_URL 换成这个即可联调）
SANDBOX_GATEWAY_URL = "https://openapi.alipaydev.com/gateway.do"

#: 中国没有夏令时，用固定 +8 偏移，避免依赖 tzdata
CHINA_TZ = timezone(timedelta(hours=8))

#: 支付成功的两种交易状态
SUCCESS_TRADE_STATUSES = frozenset({"TRADE_SUCCESS", "TRADE_FINISHED"})

#: 交易不存在（还没付款）时的子错误码
TRADE_NOT_EXIST_SUB_CODES = frozenset({"ACQ.TRADE_NOT_EXIST", "ACQ.TRADE_HAS_CLOSE"})

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


class AlipayProvider:
    name = "alipay"

    # ------------------------------------------------------------------ #
    # 配置
    # ------------------------------------------------------------------ #
    def is_configured(self, settings: StoreSettings) -> bool:
        return bool(
            settings.alipay_app_id
            and settings.alipay_private_key_text
            and settings.alipay_public_key_text
        )

    def _assert_configured(self, settings: StoreSettings) -> None:
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
        return settings.alipay_notify_url or f"{base_url}/store/v1/payments/alipay/notify"

    def return_url(self, settings: StoreSettings, base_url: str) -> str:
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
    ) -> tuple[dict, str]:
        """调用一个 OpenAPI 方法，返回 (响应节点, 原始响应文本)。"""
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

        if settings.alipay_verify_response_sign:
            self._verify_response(raw, node_key, payload.get("sign"), settings)

        return node, raw

    def _verify_response(
        self,
        raw: str,
        node_key: str,
        signature: object,
        settings: StoreSettings,
    ) -> None:
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
    # 异步通知验签
    # ------------------------------------------------------------------ #
    def verify_notification(
        self, settings: StoreSettings, form: dict[str, str]
    ) -> AlipayNotification:
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
    # 主动查单
    # ------------------------------------------------------------------ #
    def query_payment(
        self, settings: StoreSettings, order: Order
    ) -> dict[str, object] | None:
        """查单。返回响应节点；交易不存在（尚未支付）时返回 None。"""
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
