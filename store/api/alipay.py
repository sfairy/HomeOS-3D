"""支付宝回调路由：异步通知 + 同步跳转页。

异步通知是**唯一可信的到账依据**（同步跳转只是用户浏览器行为，可以被伪造），
所以这里只认验签通过的通知，并且必须回纯文本 ``success``，否则支付宝会一直重推。
"""

from __future__ import annotations

import html
import logging
from urllib.parse import parse_qsl

from fastapi import APIRouter, Body, Request
from fastapi.responses import HTMLResponse, PlainTextResponse
from sqlalchemy import select

from store.ops import incidents, site_settings as site_config
from store.core.deps import DbSession
from store.security.limiter import SlidingWindowLimiter
from store.core.models import Order
from store.payments.alipay import cents_from_yuan
from store.payments.base import PaymentError
from store.payments.reconcile import reconcile_alipay_order
from store.payments.settlement import settle_paid_order
from store.security.request_security import resolve_client_ip
from store.security.security import token_matches

logger = logging.getLogger("store.api.alipay")

#: 同步跳转页的**按来源**查单预算。
#:
#: 这个端点是匿名 GET，且 ``out_trade_no`` 由调用方直接给，会对 ``pending`` 订单**真的
#: 发一次渠道查单**（阻塞网络往返），只靠「按订单号节流」挡不住 —— 攻击者换订单号即可
#: 绕过，把跳转页变成查单风暴并占满 AnyIO 线程池。按来源给粗粒度总预算（含 force 路径）。
_RETURN_QUERY_LIMITER = SlidingWindowLimiter(limit=20, window_seconds=60.0)

router = APIRouter(tags=["alipay"])

NOTIFY_PATH = "/store/v1/payments/alipay/notify"


def _active_alipay_provider(request: Request, session=None):
    """返回**当前站点配置下真正在收款**的支付宝渠道；不是支付宝（或渠道不可用）就返回 None。

    本函数按**当前**站点配置解析且**永不抛错**（两个调用点都匿名可达，500 会让支付宝一直重推、
    也让用户看到白屏）。与 ``reconcile._reconcile_alipay_provider`` 是两份不同的知识：那份带
    ``name_override="alipay"``、**绕过渠道开关**且允许抛错 —— 巡检要打的是「这单当时用的渠道」，
    不能因为运营今天切了渠道就不再认领历史订单。
    """
    setting = site_config.get_setting(session) if session is not None else None
    try:
        provider = request.app.state.resolve_payment_provider(setting)
    except PaymentError as error:
        logger.warning("支付渠道当前不可用，按「非支付宝通知」处理：%s", error)
        return None
    if getattr(provider, "name", "") != "alipay":
        return None
    return provider


@router.post(NOTIFY_PATH, include_in_schema=False)
def alipay_notify(
    request: Request, session: DbSession, body: bytes = Body(b"")
) -> PlainTextResponse:
    """支付宝异步通知（同步端点，跑在线程池里）。

    刻意写成同步 ``def``：每一步都是同步阻塞的（验签是 RSA 运算，之后还要开 SQLite 会话
    写订单），而它**匿名可达**且支付宝失败时会密集重推；放事件循环上跑，持续 POST 就能把
    整个服务卡住。请求体自己按 urlencoded 解析（同步端点不能 await ``request.form()``），
    真正的闸门仍是 ``verify_notification`` 验签。
    """
    settings = request.app.state.settings
    provider = _active_alipay_provider(request, session)
    if provider is None:
        logger.warning("收到支付宝异步通知，但当前支付渠道不是支付宝，已忽略")
        return PlainTextResponse("failure")

    # 支付宝的通知固定是 urlencoded；其它形态直接拒掉，不去猜。
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if content_type != "application/x-www-form-urlencoded":
        logger.error("支付宝异步通知的 Content-Type 不是表单：%s", content_type or "(空)")
        return PlainTextResponse("failure")

    try:
        pairs = parse_qsl(body.decode("utf-8"), keep_blank_values=True)
    except (UnicodeDecodeError, ValueError):  # pragma: no cover - 畸形字节
        logger.error("支付宝异步通知解析失败")
        return PlainTextResponse("failure")

    form_fields = {str(key): str(value) for key, value in pairs}

    if not provider.is_configured(settings):
        logger.error("收到支付宝异步通知，但收款凭据未配置，无法验签")
        return PlainTextResponse("failure")

    notification = provider.verify_notification(settings, form_fields)
    if not notification.ok:
        # 验签失败意味着来源不可信，绝不能入账
        logger.error("支付宝异步通知验签未通过：%s", notification.reason)
        return PlainTextResponse("failure")

    # app_id / seller_id 必须拿**验签用的那份**凭据来比：provider 内部已合并后台站点配置，
    # 而手上的 ``settings`` 只有环境变量，用它比较会在后台配了商户号时静默跳过整段校验。
    effective = provider.resolve_settings(settings)

    if notification.app_id and effective.alipay_app_id:
        if notification.app_id != effective.alipay_app_id:
            logger.error(
                "支付宝异步通知 app_id 不匹配：收到 %s，期望 %s",
                notification.app_id,
                effective.alipay_app_id,
            )
            return PlainTextResponse("failure")

    if effective.alipay_seller_id and notification.seller_id:
        if notification.seller_id != effective.alipay_seller_id:
            logger.error(
                "支付宝异步通知 seller_id 不匹配：收到 %s，期望 %s",
                notification.seller_id,
                effective.alipay_seller_id,
            )
            return PlainTextResponse("failure")

    order = session.scalars(
        select(Order).where(Order.order_no == notification.out_trade_no)
    ).first()
    if order is None:
        logger.error("支付宝异步通知找不到订单 out_trade_no=%s", notification.out_trade_no)
        return PlainTextResponse("failure")

    if not notification.is_success:
        # TRADE_CLOSED 等未成功状态：不改成已支付，但回 success 停止重推
        logger.info(
            "支付宝异步通知交易未成功 order=%s trade_status=%s",
            order.order_no,
            notification.trade_status,
        )
        return PlainTextResponse("success")

    expected = int(order.amount_cents or 0)
    actual = cents_from_yuan(notification.total_amount)
    if actual is None or actual != expected:
        # 金额不符必须拒绝：可能被篡改，或订单号被复用
        logger.error(
            "支付宝异步通知金额不符，拒绝入账 order=%s 期望=%s 实际=%s",
            order.order_no,
            expected,
            notification.total_amount,
        )
        return PlainTextResponse("failure")

    setting = site_config.get_setting(session)
    settle_paid_order(
        session,
        order=order,
        setting=setting,
        trade_no=notification.trade_no,
        source="alipay.notify",
    )
    return PlainTextResponse("success")


_RETURN_PAGE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} - HomeOS 授权中心</title>
<link rel="stylesheet" href="/store-static/theme.css?v=2609211957">
<style>
  /* 与商店/后台同一套暗色 + 琥珀设计语言（令牌来自 theme.css） */
  body {{ margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background: var(--hb-bg); color: var(--hb-ink); font-family: var(--hb-font); }}
  .card {{ background: var(--hb-surface); border:1px solid var(--hb-line); border-radius:9px;
           padding:40px 36px; max-width:440px; width:calc(100% - 48px);
           box-shadow:0 30px 100px #00000094; text-align:center; }}
  .icon {{ font-size:44px; line-height:1; margin-bottom:16px; }}
  h1 {{ font-size:20px; margin:0 0 10px; color: var(--hb-ink); }}
  p {{ color: var(--hb-muted); font-size:14px; line-height:1.7; margin:0 0 8px; }}
  .order {{ font-family: var(--hb-font-mono); font-size:13px; color: var(--hb-accent-bright);
            background: var(--hb-surface-raised); border:1px solid var(--hb-line);
            border-radius:6px; padding:8px 10px; margin:16px 0; word-break:break-all; }}
  /* 按钮直接复用设计系统里的组件，不再抄一份琥珀渐变字面量 */
  a.hb-button {{ margin-top:18px; }}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">{icon}</div>
    <h1>{title}</h1>
    <p>{message}</p>
    {order_block}
    <a class="hb-button hb-button--primary" href="{next_url}">{next_label}</a>
  </div>
</body>
</html>
"""


@router.get("/store/payment/return", include_in_schema=False)
def alipay_return(
    request: Request,
    session: DbSession,
    out_trade_no: str = "",
) -> HTMLResponse:
    """同步跳转页。

    这里展示的状态**不作为到账依据**，只顺手做一次查单对账，
    真正入账仍然依赖验签通过的异步通知或查单结果。
    """
    settings = request.app.state.settings
    provider = _active_alipay_provider(request, session)

    order = None
    if out_trade_no:
        order = session.scalars(select(Order).where(Order.order_no == out_trade_no)).first()

    if order is None:
        return HTMLResponse(
            _RETURN_PAGE.format(
                title="未找到订单",
                icon="&#128533;",
                message="没有找到对应的订单。如果已经付款，请到账号中心查看授权状态。",
                order_block="",
                next_url="/user/dashboard/index",
                next_label="前往账号中心",
            ),
            headers={"Cache-Control": "no-store"},
        )

    # 跳回来这件事无法证明身份，所以 force 只在**持订单凭证**时生效：否则枚举订单号就能绕过
    # 节流，把这里变成查单风暴。不持凭证时走按订单号的常规节流，对真实用户没有影响。
    if provider is not None and provider.is_configured(settings):
        setting = site_config.get_setting(session)
        token = (request.query_params.get("token") or "").strip()
        owns_order = token_matches(token, order.lookup_token)
        source_ip = resolve_client_ip(request).ip or "unknown"
        if _RETURN_QUERY_LIMITER.allow(f"payment-return:{source_ip}"):
            try:
                reconcile_alipay_order(
                    session,
                    order=order,
                    settings=settings,
                    setting=setting,
                    force=owns_order,
                )
            except Exception as error:  # noqa: BLE001 - 对账失败不能挡住跳转页
                # 用户就站在这张页面上等结果，所以不能失败；但要留下计数，否则后台没有任何痕迹。
                incidents.note("reconcile.return", order_no=order.order_no, error=error)
                logger.exception("同步跳转页对账失败 order=%s", order.order_no)
        else:
            logger.info(
                "同步跳转页查单超出按来源预算，跳过本次对账 order=%s ip=%s"
                "（异步通知与巡检仍会入账）",
                order.order_no,
                source_ip,
            )

    if order.status in {"paid", "fulfilled"}:
        title = "支付成功"
        icon = "&#127881;"
        message = (
            "授权已开通，请到账号中心查看激活码。"
            if order.status == "fulfilled"
            else "支付已确认，系统正在发放激活码。"
        )
    else:
        title = "已收到支付结果"
        icon = "&#8987;"
        message = (
            "支付宝尚未确认到账。如果已经付款，稍等片刻后到账号中心刷新即可，"
            "系统会持续核对到账状态。"
        )

    order_block = (
        f'<div class="order">订单号 {html.escape(order.order_no)}</div>'
    )
    return HTMLResponse(
        _RETURN_PAGE.format(
            title=title,
            icon=icon,
            message=message,
            order_block=order_block,
            next_url="/user/dashboard/index",
            next_label="前往账号中心",
        ),
        headers={"Cache-Control": "no-store"},
    )
