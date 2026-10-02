"""微信支付（Native 扫码支付）渠道：下单、回调验签+解密、主动查单、关单、退款。

选 **Native**（而不是 H5 / JSAPI）是因为它与本商店的收银台形态一致：
收银台显示的是一张二维码给顾客扫，不需要 openid、不需要在微信内打开、
不需要单独申请 H5 支付权限 —— 和支付宝当面付是同一种交互。

金额口径比支付宝简单：微信原生就是**分**，与库里的 ``amount_cents`` 完全一致，
没有元/分换算这一步（也就没有那类换算错误）。
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import httpx

from ..config import StoreSettings
from ..core.models import Order, StoreSetting
from ..ops.net_probe import LEVEL_FAIL, LEVEL_PASS, LEVEL_WARN, check_result, host_from_url
from ..payments import channels
from ..payments import urls as payment_urls
from ..payments import wechat_signing as signing
from ..payments.base import CloseResult, PaymentError, PaymentIntent, RefundResult
from ..payments.wechat_signing import WeChatPaymentError

logger = logging.getLogger("src.payments.wechat")

DEFAULT_GATEWAY_URL = "https://api.mch.weixin.qq.com"
NATIVE_PATH = "/v3/pay/transactions/native"
REFUND_PATH = "/v3/refund/domestic/refunds"

#: 单次网关调用的超时。微信的 P99 通常在一秒内；15 秒足够兜住网络抖动，
#: 又不至于把收银台的下单请求卡到用户以为没反应。
REQUEST_TIMEOUT_SECONDS = 15.0

#: 交易成功。Native 支付只有这一个终态是「钱到了」。
SUCCESS_TRADE_STATES = frozenset({"SUCCESS"})

#: 还在等顾客付款（既不是成功、也不该本地收尾）。
PENDING_TRADE_STATES = frozenset({"NOTPAY", "USERPAYING"})

#: 渠道侧已终结且不会再被支付。与支付宝那条不同：微信把「支付失败」也算终态。
CLOSED_TRADE_STATES = frozenset({"CLOSED", "REVOKED", "PAYERROR"})

#: 关单时「本来就无需关闭」的错误码：订单不存在、或已经关过。
CLOSE_IDEMPOTENT_CODES = frozenset({"ORDER_NOT_EXIST", "ORDER_CLOSED"})

#: 关单时发现**钱已经进来了**。这不是关单失败：调用方必须立刻去查单入账。
CLOSE_ALREADY_PAID_CODES = frozenset({"ORDER_PAID"})

#: 查单时「这笔交易不存在」—— 与「查单失败」是两件不同的事。
TRADE_NOT_EXIST_CODES = frozenset({"ORDER_NOT_EXIST"})

#: 明确指向「这套凭据有问题」的错误码，用于把「配置错」与「网络/限流」区分开。
CREDENTIAL_ERROR_CODES = frozenset(
    {
        "SIGN_ERROR",
        "PARAM_ERROR",
        "APPID_MCHID_NOT_MATCH",
        "MCH_NOT_EXISTS",
        "APPID_NOT_EXIST",
        "NOAUTH",
        "RULE_LIMIT",
    }
)

#: 回调时间戳的容忍窗口（秒）。微信官方建议校验，用来压缩重放窗口。
NOTIFICATION_MAX_SKEW_SECONDS = 300


def _http_request(
    method: str,
    url: str,
    *,
    content: bytes,
    headers: dict[str, str],
    timeout: float,
) -> httpx.Response:
    """唯一的出口。测试把它换成桩函数，就能在没有商户号的情况下验证整条链路。"""
    return httpx.request(method, url, content=content, headers=headers, timeout=timeout)


@dataclass(frozen=True)
class WeChatNotification:
    """回调的验签 + 解密结果。``ok`` 为假时**绝不能入账**。"""

    ok: bool
    reason: str = ""
    event_type: str = ""
    out_trade_no: str = ""
    transaction_id: str = ""
    trade_state: str = ""
    #: 实付金额（分）。与订单金额同口径直接比，不需要换算。
    total_cents: int | None = None
    mch_id: str = ""
    app_id: str = ""
    resource: dict[str, Any] = field(default_factory=dict)

    @property
    def is_success(self) -> bool:
        return self.trade_state in SUCCESS_TRADE_STATES


class WeChatPayProvider:
    name = "wechat"

    def __init__(self, settings: StoreSettings | None = None) -> None:
        #: 由 resolve_provider 注入的「已合并站点配置」的 settings
        self._settings = settings

    # ---- 凭据 ---- #

    def _resolve(self, settings: StoreSettings) -> StoreSettings:
        return self._settings or settings

    def resolve_settings(self, settings: StoreSettings) -> StoreSettings:
        """本次调用**实际生效**的凭据集合（已合并后台站点配置）。"""
        return self._resolve(settings)

    @staticmethod
    def missing_credentials(settings: StoreSettings) -> list[str]:
        """缺哪些必需项。中文名，直接给运营看。"""
        missing: list[str] = []
        if not settings.wechat_mch_id:
            missing.append("商户号 mchid")
        if not settings.wechat_app_id:
            missing.append("公众号/应用 appid")
        if signing.api_v3_key_error(settings.wechat_api_v3_key):
            missing.append("APIv3 密钥（须恰好 32 字符）")
        if signing.merchant_private_key_error(settings.wechat_merchant_private_key_text):
            missing.append("商户 API 私钥 apiclient_key.pem")
        if signing.merchant_serial_no_error(settings.wechat_merchant_serial_no):
            missing.append("商户证书序列号")
        if signing.platform_public_key_error(settings.wechat_platform_public_key_text):
            missing.append("微信支付公钥（或平台证书）")
        return missing

    def is_configured(self, settings: StoreSettings) -> bool:
        return not self.missing_credentials(self._resolve(settings))

    def _assert_configured(self, settings: StoreSettings) -> None:
        missing = self.missing_credentials(settings)
        if missing:
            raise PaymentError("微信支付收款尚未配置完整，缺少：" + "、".join(missing) + "。")

    # ---- 地址 ---- #

    def notify_url(self, settings: StoreSettings, base_url: str) -> str:
        settings = self._resolve(settings)
        return settings.wechat_notify_url or f"{base_url}/store/v1/payments/wechat/notify"

    # ---- 调接口 ---- #

    def _request(
        self,
        settings: StoreSettings,
        method: str,
        path: str,
        *,
        query: str = "",
        body: dict[str, Any] | None = None,
        tolerate_status: tuple[int, ...] = (),
    ) -> tuple[int, dict[str, Any] | None, str]:
        """发一个已签名的 APIv3 请求，返回 ``(状态码, JSON 或 None, 原始文本)``。

        签名覆盖「方法 / URL（**含查询串**）/ 时间戳 / 随机串 / 请求体」——签名用的请求体
        与发出去的是**同一个字符串**（先 dumps 再签再发），不是两次序列化。
        """
        settings = self._resolve(settings)
        self._assert_configured(settings)

        url_path = path + (f"?{query}" if query else "")
        payload = "" if body is None else json.dumps(body, ensure_ascii=False, separators=(",", ":"))
        timestamp = str(int(time.time()))
        nonce = signing.new_nonce()
        message = signing.build_request_sign_message(
            method=method, url_path=url_path, timestamp=timestamp, nonce=nonce, body=payload
        )
        signature = signing.sign(message, settings.wechat_merchant_private_key_text)

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "homeos-store/1.0",
            "Authorization": signing.build_authorization_header(
                mchid=settings.wechat_mch_id,
                serial_no=settings.wechat_merchant_serial_no,
                nonce=nonce,
                timestamp=timestamp,
                signature=signature,
            ),
        }
        gateway = (settings.wechat_gateway_url or DEFAULT_GATEWAY_URL).rstrip("/")
        try:
            response = _http_request(
                method,
                f"{gateway}{url_path}",
                content=payload.encode("utf-8"),
                headers=headers,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            raise PaymentError(f"微信支付网关不可达：{error}") from error

        text = response.text or ""
        node: dict[str, Any] | None = None
        if text.strip():
            try:
                parsed = json.loads(text)
            except ValueError:
                parsed = None
            if isinstance(parsed, dict):
                node = parsed

        if response.status_code >= 400 and response.status_code not in tolerate_status:
            code = str((node or {}).get("code") or "")
            detail = str((node or {}).get("message") or text[:200])
            raise PaymentError(
                f"微信支付接口返回 {response.status_code}（{code or '无错误码'}）：{detail}"
            )
        return response.status_code, node, text

    # ---- 下单 ---- #

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

        description = (
            setting.payment_transaction_description
            or settings.wechat_transaction_description
            or "HomeOS 授权"
        )
        body = {
            "appid": settings.wechat_app_id,
            "mchid": settings.wechat_mch_id,
            # 微信限制 127 个字符，超了会直接回 PARAM_ERROR
            "description": description[:127],
            "out_trade_no": order.order_no,
            "notify_url": self.notify_url(settings, base_url),
            "amount": {"total": int(order.amount_cents or 0), "currency": "CNY"},
        }
        _status, node, _raw = self._request(settings, "POST", NATIVE_PATH, body=body)
        code_url = str((node or {}).get("code_url") or "")
        if not code_url:
            raise PaymentError("微信支付下单成功但没有返回 code_url。")

        # 显示名走统一口径：payment_display_name 是单渠道时代的字段，只在微信是默认渠道
        # （或默认渠道没配）时才采用它，否则会把它串到另一个渠道的二维码弹窗上。
        display_name = channels.display_name_for("wechat", setting, settings)
        logger.info(
            "微信支付下单成功 order=%s amount_fen=%s",
            order.order_no,
            int(order.amount_cents or 0),
        )
        return PaymentIntent(
            provider=self.name,
            payload={
                "type": "wechat",
                "qrCode": code_url,
                "displayName": display_name,
                "transactionDescription": description,
                "outTradeNo": order.order_no,
                "note": "请用微信扫一扫支付，付款后本页会自动确认。",
            },
            qr_code=code_url,
        )

    # ---- 查单 / 关单 ---- #

    def query_payment(self, settings: StoreSettings, order: Order) -> dict[str, Any] | None:
        """查这笔订单在渠道侧的状态；交易不存在时返回 ``None``（不是失败）。"""
        settings = self._resolve(settings)
        path = f"/v3/pay/transactions/out-trade-no/{quote(order.order_no, safe='')}"
        query = f"mchid={quote(settings.wechat_mch_id, safe='')}"
        status, node, _raw = self._request(
            settings, "GET", path, query=query, tolerate_status=(404,)
        )
        if status == 404:
            code = str((node or {}).get("code") or "")
            if code in TRADE_NOT_EXIST_CODES:
                return None
            raise PaymentError(
                f"微信支付查单失败（{code or '未知'}）："
                f"{str((node or {}).get('message') or '')[:200]}"
            )
        return node

    def close_payment(self, settings: StoreSettings, order: Order) -> CloseResult:
        """关单。语义与支付宝那条一致：钱已进账时返回 ``already_paid`` 而不是失败。"""
        settings = self._resolve(settings)
        path = f"/v3/pay/transactions/out-trade-no/{quote(order.order_no, safe='')}/close"
        body = {"mchid": settings.wechat_mch_id}
        try:
            status, _node, _raw = self._request(settings, "POST", path, body=body)
        except PaymentError as error:
            message = str(error)
            for code in CLOSE_ALREADY_PAID_CODES:
                if code in message:
                    return CloseResult(closed=False, already_paid=True, reason=message)
            for code in CLOSE_IDEMPOTENT_CODES:
                if code in message:
                    # 本来就无需关闭：交易不存在、或已经关过了。两者都算「关掉了」，
                    # 因为我们关心的是「它不会再被支付」，而这两条都满足。
                    return CloseResult(closed=True, reason=message)
            raise
        if status in (200, 204):
            return CloseResult(closed=True)
        return CloseResult(closed=False, reason=f"网关返回 {status}")

    # ---- 查单响应的解读 ---- #
    #
    # 与支付宝同一套方法名（见 alipay.py 的说明）：对账层因此完全渠道无关。
    # 微信原生就是「分」，所以这里不需要任何单位换算 —— 也就没有那类换算错误。

    def is_success_node(self, node: dict) -> bool:
        return str(node.get("trade_state") or "") in SUCCESS_TRADE_STATES

    def trade_state_of(self, node: dict) -> str:
        return str(node.get("trade_state") or "")

    def trade_no_of(self, node: dict) -> str:
        return str(node.get("transaction_id") or "")

    def paid_cents_of(self, node: dict) -> int | None:
        amount = node.get("amount")
        total = amount.get("total") if isinstance(amount, dict) else None
        return int(total) if isinstance(total, int) else None

    # ---- 退款 ---- #

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
        del setting
        settings = self._resolve(settings)
        self._assert_configured(settings)
        body = {
            "out_trade_no": order.order_no,
            # 幂等号：同一笔重复提交会返回同一张退款单，不会退两次。
            "out_refund_no": out_request_no,
            "reason": (reason or "用户申请退款")[:80],
            "amount": {
                "refund": int(amount_cents),
                "total": int(order.amount_cents or 0),
                "currency": "CNY",
            },
        }
        _status, node, _raw = self._request(settings, "POST", REFUND_PATH, body=body)
        node = node or {}
        state = str(node.get("status") or "")
        refund_id = str(node.get("refund_id") or "")
        refunded = int(((node.get("amount") or {}).get("refund")) or 0)
        if state == "SUCCESS":
            return RefundResult(
                ok=True,
                trade_no=refund_id or None,
                detail=f"微信支付已退回 ¥{refunded / 100:.2f}",
            )
        if state == "PROCESSING":
            # 微信是异步退款：PROCESSING 表示已受理但钱还没到账。**不能**记成已退款，
            # 也不能当失败 —— 让运营在退款流水里看到它挂着。
            return RefundResult(
                ok=False,
                processing=True,
                trade_no=refund_id or None,
                unrefunded_cents=int(amount_cents),
                detail="微信支付已受理退款但仍在处理中（异步到账），请稍后以退款流水为准。",
            )
        return RefundResult(
            ok=False,
            trade_no=refund_id or None,
            unrefunded_cents=int(amount_cents),
            detail=f"微信支付退款未成功（status={state or '未知'}）。",
        )

    # ---- 回调 ---- #

    def verify_notification(
        self, settings: StoreSettings, *, headers: dict[str, str], body: str
    ) -> WeChatNotification:
        """验签 + 解密。两步都成功才算收到一条可信通知。

        顺序不能反：**先验签再看内容**。解密是纯本地运算，不验签就解密等于让任何人
        用一段自己加密的报文来伪造「已支付」。
        """
        settings = self._resolve(settings)
        lowered = {str(key).lower(): str(value) for key, value in headers.items()}
        timestamp = lowered.get("wechatpay-timestamp", "")
        nonce = lowered.get("wechatpay-nonce", "")
        signature = lowered.get("wechatpay-signature", "")
        if not (timestamp and nonce and signature):
            return WeChatNotification(ok=False, reason="回调缺少 Wechatpay-Timestamp/Nonce/Signature 头")

        try:
            skew = abs(int(time.time()) - int(timestamp))
        except (TypeError, ValueError):
            return WeChatNotification(ok=False, reason="回调时间戳不是整数")
        if skew > NOTIFICATION_MAX_SKEW_SECONDS:
            # 一个很久以前的通知即使签名正确也可能是被录下来重放的。
            return WeChatNotification(
                ok=False,
                reason=f"回调时间戳偏差 {skew} 秒，超出 {NOTIFICATION_MAX_SKEW_SECONDS} 秒容忍窗口",
            )

        if not signing.verify_notification(
            timestamp=timestamp,
            nonce=nonce,
            body=body,
            signature=signature,
            platform_public_key_text=settings.wechat_platform_public_key_text,
        ):
            return WeChatNotification(ok=False, reason="回调验签失败")

        try:
            envelope = json.loads(body)
        except ValueError:
            return WeChatNotification(ok=False, reason="回调体不是合法 JSON")
        if not isinstance(envelope, dict):
            return WeChatNotification(ok=False, reason="回调体不是一个 JSON 对象")

        resource = envelope.get("resource")
        if not isinstance(resource, dict):
            return WeChatNotification(ok=False, reason="回调缺少 resource")
        try:
            payload = signing.decrypt_resource(settings.wechat_api_v3_key, resource)
        except WeChatPaymentError as error:
            return WeChatNotification(ok=False, reason=str(error))

        amount = payload.get("amount")
        total = amount.get("total") if isinstance(amount, dict) else None
        return WeChatNotification(
            ok=True,
            event_type=str(envelope.get("event_type") or ""),
            out_trade_no=str(payload.get("out_trade_no") or ""),
            transaction_id=str(payload.get("transaction_id") or ""),
            trade_state=str(payload.get("trade_state") or ""),
            total_cents=total if isinstance(total, int) else None,
            mch_id=str(payload.get("mchid") or ""),
            app_id=str(payload.get("appid") or ""),
            resource=payload,
        )

    # ---- 凭据自检 ---- #

    def _probe_gateway_credentials(self, settings: StoreSettings) -> tuple[bool, str]:
        """用一笔**不存在的交易**查单，判断网关认不认这套签名。

        这是最省事的探活：不需要真实订单，而 ``ORDER_NOT_EXIST`` 恰恰证明签名被接受了 ——
        签名不对时网关回的是 SIGN_ERROR / 401，两者一眼能分开。
        """
        settings = self._resolve(settings)
        try:
            self._assert_configured(settings)
        except PaymentError as error:
            return False, str(error)
        path = f"/v3/pay/transactions/out-trade-no/HOMEOS-PROBE-{uuid4().hex[:12]}"
        query = f"mchid={quote(settings.wechat_mch_id, safe='')}"
        try:
            status, node, _raw = self._request(
                settings, "GET", path, query=query, tolerate_status=(404,)
            )
        except PaymentError as error:
            return False, str(error)
        code = str((node or {}).get("code") or "")
        if status == 404 and code in TRADE_NOT_EXIST_CODES:
            return True, "凭据可用：网关接受了本次签名（探测单号不存在属于预期结果）。"
        if code in CREDENTIAL_ERROR_CODES:
            return False, f"凭据不可用（{code}）：{str((node or {}).get('message') or '')[:200]}"
        return False, f"网关返回了预期外的结果（HTTP {status}，code={code or '无'}）。"

    def diagnose_credentials(
        self,
        settings: StoreSettings,
        *,
        notify_url: str = "",
        return_url: str = "",
    ) -> tuple[bool, str, list[dict]]:
        """逐项自检凭据与回调配置，返回 ``(是否全部通过, 一句话结论, 结论列表)``。

        ``return_url`` 只是与支付宝那条保持同一签名（Native 支付没有浏览器跳转页）。
        """
        del return_url
        settings = self._resolve(settings)
        checks: list[dict] = []

        gateway = (settings.wechat_gateway_url or "").strip() or DEFAULT_GATEWAY_URL
        gateway_host = host_from_url(gateway)
        default_host = host_from_url(DEFAULT_GATEWAY_URL)
        if not gateway.lower().startswith("https://"):
            checks.append(check_result("gateway-url", "网关地址", LEVEL_FAIL, f"{gateway} 必须以 https:// 开头。"))
        elif gateway_host and gateway_host != default_host:
            checks.append(
                check_result(
                    "gateway-url",
                    "网关地址",
                    LEVEL_WARN,
                    f"网关域名 {gateway_host} 不是微信支付生产域名（{default_host}）：确认这是有意的。",
                )
            )
        else:
            checks.append(check_result("gateway-url", "网关地址", LEVEL_PASS, gateway))

        for check_id, label, value, validator in (
            ("mch-id", "商户号 mchid", settings.wechat_mch_id, lambda text: "" if text else "未填写商户号。"),
            ("app-id", "应用 appid", settings.wechat_app_id, lambda text: "" if text else "未填写 appid。"),
            ("api-v3-key", "APIv3 密钥", settings.wechat_api_v3_key, signing.api_v3_key_error),
            (
                "merchant-serial",
                "商户证书序列号",
                settings.wechat_merchant_serial_no,
                signing.merchant_serial_no_error,
            ),
            (
                "merchant-private-key",
                "商户 API 私钥",
                settings.wechat_merchant_private_key_text,
                signing.merchant_private_key_error,
            ),
            (
                "platform-public-key",
                "微信支付公钥",
                settings.wechat_platform_public_key_text,
                signing.platform_public_key_error,
            ),
        ):
            problem = validator(str(value or ""))
            if problem:
                checks.append(check_result(check_id, label, LEVEL_FAIL, problem))
            else:
                checks.append(check_result(check_id, label, LEVEL_PASS, "已配置且格式合法。"))

        configured = not self.missing_credentials(settings)
        if configured:
            ok, detail = self._probe_gateway_credentials(settings)
            checks.append(
                check_result(
                    "gateway-probe",
                    "网关验签探活",
                    LEVEL_PASS if ok else LEVEL_FAIL,
                    detail,
                )
            )
        else:
            checks.append(check_result("gateway-probe", "网关验签探活", LEVEL_FAIL, "凭据不全，未做探活。"))

        effective_notify = (notify_url or "").strip() or settings.wechat_notify_url
        checks.append(
            payment_urls.callback_url_check(
                "notify-url",
                "异步通知地址",
                effective_notify,
                channel="微信支付",
                reachable_hint="不配也能收款（轮询 + 巡检兜底），但配好会快很多。",
            )
        )

        passed = all(item["level"] == LEVEL_PASS for item in checks)
        failures = [item for item in checks if item["level"] == LEVEL_FAIL]
        warnings = [item for item in checks if item["level"] == LEVEL_WARN]
        if passed:
            message = "凭据自检全部通过：网关验签与回调配置均可用。"
        elif failures:
            message = "自检未通过：" + "；".join(
                f"{item['label']} —— {item['detail']}" for item in failures
            )
        else:
            message = "自检通过但有待确认项：" + "；".join(
                f"{item['label']} —— {item['detail']}" for item in warnings
        )
        return passed, message, checks


__all__ = [
    "CLOSED_TRADE_STATES",
    "CLOSE_ALREADY_PAID_CODES",
    "CLOSE_IDEMPOTENT_CODES",
    "DEFAULT_GATEWAY_URL",
    "NATIVE_PATH",
    "PENDING_TRADE_STATES",
    "SUCCESS_TRADE_STATES",
    "WeChatNotification",
    "WeChatPayProvider",
]
