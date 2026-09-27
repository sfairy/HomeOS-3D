"""支付宝当面付（扫码支付）渠道：下单、异步通知验签、主动查单。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from uuid import uuid4

import httpx

from apps.store.config import StoreSettings
from apps.store.core.models import Order, StoreSetting
from apps.store.ops.net_probe import (
    LEVEL_FAIL,
    LEVEL_PASS,
    LEVEL_SKIP,
    LEVEL_WARN,
    check_result,
    host_from_url,
    probe_tls,
)
# CloseResult 曾定义在本模块里；现在住在 base.py（微信支付用同一套关单语义）。
from apps.store.payments import channels
from apps.store.payments.base import (
    CloseResult,
    PaymentError,
    PaymentIntent,
    RefundResult,
)

# 凭据与签名层在 alipay_signing.py；这里再导入一次，



logger = logging.getLogger("apps.store.payments.alipay")

#: 沙箱（openapi-sandbox.dl.alipaydev.com）与它的开关已**整块删除**。理由与模拟收银台同源：
#: 它是一个「能在生产上被单点打开、而且打开后看不出来」的通道 —— 沙箱下订单能建、二维码
#: 能出，只是那张码只有沙箱买家账号付得了，真钱一分进不来（表现为静默停收）。
#: 联调改用生产环境的 0.01 元小额自测：把某个商品临时改成 0.01，自己扫码付一笔，
#: 走完「下单 → 出码 → 通知/查单 → 入账 → 发码 → 邮件」再把价格改回来。


#: 支付成功的两种交易状态
SUCCESS_TRADE_STATUSES = frozenset({"TRADE_SUCCESS", "TRADE_FINISHED"})

#: 交易不存在（还没付款）时的子错误码
TRADE_NOT_EXIST_SUB_CODES = frozenset({"ACQ.TRADE_NOT_EXIST", "ACQ.TRADE_HAS_CLOSE"})

#: 关单时「本来就无需关闭」的子错误码：交易不存在，或已经关闭过。
CLOSE_IDEMPOTENT_SUB_CODES = frozenset({"ACQ.TRADE_NOT_EXIST", "ACQ.TRADE_HAS_CLOSE"})

#: 关单时发现交易**已经付掉了**。这不是关单失败：钱已经进来，调用方必须立刻
CLOSE_ALREADY_PAID_SUB_CODES = frozenset({"ACQ.TRADE_HAS_FINISHED"})

#: 明确指向「这套凭据有问题」的子错误码，用于凭据自检时区分「凭据错」与
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




#: 「网关不认识这个 APPID」这类子错误码。
_APP_ID_SUB_CODES = frozenset({"isv.invalid-app-id", "isv.app-not-exist"})

#: 支付宝生产网关域名。自检用它回答「网关是不是被指到别处了」——
#: 不 import credentials 的常量是为了避免循环依赖（credentials 反过来 import 本模块）。
PRODUCTION_GATEWAY_HOST = "openapi.alipay.com"


def _gateway_hint(settings: StoreSettings, sub_code: str) -> str:
    """给「网关不认识这个 APPID」补一句最可能的解释。

    这条错误和「密钥填错」的现象一模一样（都只回「应用不存在 / APPID 无效」），
    但处置方式完全不同：一个要去查签约状态与 APPID，一个要去换公钥。自检的价值
    就在区分它们，所以这里必须把话说出来。
    """
    if sub_code not in _APP_ID_SUB_CODES:
        return ""
    return (
        "。请确认 APPID 就是开放平台里那个应用的应用 ID，且该应用**已签约「当面付」**——"
        "未签约时生产网关同样回「应用不存在」，那是签约问题而不是密钥问题。"
    )

class AlipayProvider:
    name = "alipay"

    def __init__(self, settings: StoreSettings | None = None) -> None:
        #: 由 resolve_provider 注入的「已合并站点配置」的 settings：方法收到的
        self._settings = settings

    def _resolve(self, settings: StoreSettings) -> StoreSettings:
        return self._settings or settings

    def resolve_settings(self, settings: StoreSettings) -> StoreSettings:
        """返回本次调用**实际生效**的凭据集合（已合并后台站点配置）。
        """
        return self._resolve(settings)

        # 配置
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
            # sign_params 实际写死 SHA256withRSA（RSA2），但 sign_type 可配：配成
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

        # 调接口
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
            # 只有下单需要回调地址；优先用请求推导出的 base_url（穿透/反代下它才可达）
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

        # 下单
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

        # 显示名走统一口径（见 payments/channels.py）：单渠道时代它是无条件的，
        # 两个渠道并存后必须只在「支付宝是默认渠道」时才用它。
        display_name = channels.display_name_for("alipay", setting, settings)
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

        # 退款
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
            # 每次退款动作唯一：支付宝按它幂等，重复点击不会扣两次，而多次部分退款
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

        # fund_change=N 表示本次没有实际资金变动（重复退款/已退款），按成功处理。
        fund_change = str(node.get("fund_change", "")).upper()
        # ``refund_fee`` 是**本次实际**退出的钱，必须原样采信（含 0）：写成
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

        # 异步通知验签
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

        # 凭据自检
    def _probe_gateway_credentials(self, settings: StoreSettings) -> tuple[bool, str]:
        """用一笔**不存在的交易**探活，判断网关认不认这套 app_id + 私钥。
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
            return False, f"凭据不可用（{code}）：{detail or sub_code}{_gateway_hint(settings, sub_code)}"
        return False, f"网关返回了预期外的错误（{code}）：{detail or '无详细说明'}"

    def diagnose_credentials(
        self,
        settings: StoreSettings,
        *,
        notify_url: str = "",
        return_url: str = "",
    ) -> tuple[bool, str, list[dict]]:
        """逐项自检凭据与回调配置，返回 ``(是否全部通过, 一句话结论, 结论列表)``。
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
            # 支付宝在「app_id/私钥不对」这类错误上不签名，此时无法判定公钥。
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

        # ---- 运行环境 ---- #
        #: 沙箱已删除，所以这里只剩一件事可报：网关指向的**不是**支付宝生产域名。
        #: 这不是「不允许」的配置（网关迁移、代理都可能改它），但它一定值得看一眼 ——
        #: 指到别人家的地址上，钱和通知都会去别处。
        production_host = PRODUCTION_GATEWAY_HOST
        if gateway_host and gateway_host != production_host:
            checks.append(
                check_result(
                    "gateway-environment",
                    "运行环境",
                    LEVEL_WARN,
                    f"网关域名 {gateway_host} 不是支付宝生产域名（{production_host}）：确认这是有意的。",
                )
            )
        else:
            checks.append(
                check_result("gateway-environment", "运行环境", LEVEL_PASS, "支付宝生产网关。")
            )

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

        # 查单
    def query_payment(
        self, settings: StoreSettings, order: Order
    ) -> dict[str, object] | None:
        """查单。返回响应节点；**确认**交易不存在（尚未支付）时返回 ``None``。
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
        raise PaymentError(f"支付宝查单失败（{code}）：{detail}")

        # 关单

    # ---- 查单响应的解读 ---- #
    #
    # 对账层（payments/reconcile.py）只认下面这四个方法，不认任何渠道特有的字段名：
    # 支付宝的钱在 ``total_amount``（元/字符串），微信的在 ``amount.total``（分/整数），
    # 把这些差异留在各自的 provider 里，「两个渠道各写一套 if」才不会长到对账层去。

    def is_success_node(self, node: dict) -> bool:
        return str(node.get("trade_status") or "") in SUCCESS_TRADE_STATUSES

    def trade_state_of(self, node: dict) -> str:
        return str(node.get("trade_status") or "")

    def trade_no_of(self, node: dict) -> str:
        return str(node.get("trade_no") or "")

    def paid_cents_of(self, node: dict) -> int | None:
        return cents_from_yuan(node.get("total_amount"))

    def close_payment(self, settings: StoreSettings, order: Order) -> CloseResult:
        """关闭渠道侧的预下单交易（``alipay.trade.close``）。
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

# 凭据与签名层在 alipay_signing.py；这里再导出一次，
from .alipay_signing import (
    ResponseSignatureInvalid,
    ResponseSignatureMissing,
    _callback_check,
    _url_port,
    alipay_timestamp,
    build_sign_content,
    cents_from_yuan,
    extract_raw_node,
    key_pair_same_modulus,
    private_key_error,
    public_key_error,
    sign_params,
    validate_callback_url,
    validate_gateway_url,
    verify_content,
    yuan_from_cents,
)

__all__ = [
    'AlipayNotification',
    'AlipayProvider',
    'CLOSE_ALREADY_PAID_SUB_CODES',
    'CLOSE_IDEMPOTENT_SUB_CODES',
    'CREDENTIAL_ERROR_SUB_CODES',
    'CloseResult',
    'ResponseSignatureInvalid',
    'ResponseSignatureMissing',
    'PRODUCTION_GATEWAY_HOST',
    'SUCCESS_TRADE_STATUSES',
    'TRADE_NOT_EXIST_SUB_CODES',
    '_callback_check',
    '_url_port',
    'alipay_timestamp',
    'build_sign_content',
    'cents_from_yuan',
    'extract_raw_node',
    'key_pair_same_modulus',
    'logger',
    'private_key_error',
    'public_key_error',
    'sign_params',
    'validate_callback_url',
    'validate_gateway_url',
    'verify_content',
    'yuan_from_cents',
]
