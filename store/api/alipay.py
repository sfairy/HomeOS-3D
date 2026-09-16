"""支付宝回调路由：异步通知 + 同步跳转页。

异步通知是**唯一可信的到账依据**（同步跳转只是用户浏览器行为，可以被伪造），
所以这里只认验签通过的通知，并且必须回纯文本 ``success``，否则支付宝会一直重推。
"""

from __future__ import annotations

import html
import logging

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, PlainTextResponse
from sqlalchemy import select

from store import site_settings as site_config
from store.deps import DbSession
from store.models import Order
from store.payments.alipay import cents_from_yuan
from store.payments.base import PaymentError
from store.payments.reconcile import reconcile_alipay_order
from store.payments.settlement import settle_paid_order

logger = logging.getLogger("store.api.alipay")

router = APIRouter(tags=["alipay"])

NOTIFY_PATH = "/store/v1/payments/alipay/notify"


def _alipay_provider(request: Request, session=None):
    """返回当前站点配置下的支付宝渠道；不是支付宝就返回 None。

    传入 ``session`` 是为了让后台配置的凭据生效（凭据存在站点配置里）。
    不传时 ``resolve_payment_provider`` 会自己读一次库。

    ``resolve_payment_provider`` 在渠道没配好时会抛 ``PaymentError``（典型例子是默认
    关闭的模拟收银台）。这属于「当前不是支付宝在收款」的一种，不能让它冒出去变成 500：
    异步通知那边必须回纯文本失败让支付宝停止重推，同步跳转页那边必须照常渲染。
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
async def alipay_notify(request: Request, session: DbSession) -> PlainTextResponse:
    settings = request.app.state.settings
    provider = _alipay_provider(request, session)
    if provider is None:
        logger.warning("收到支付宝异步通知，但当前支付渠道不是支付宝，已忽略")
        return PlainTextResponse("failure")

    try:
        form = await request.form()
    except Exception:  # noqa: BLE001 - 请求体异常不应抛出 500，否则支付宝会重推到天亮
        logger.error("支付宝异步通知解析失败")
        return PlainTextResponse("failure")

    form_fields = {str(key): str(value) for key, value in form.items()}

    if not provider.is_configured(settings):
        logger.error("收到支付宝异步通知，但收款凭据未配置，无法验签")
        return PlainTextResponse("failure")

    notification = provider.verify_notification(settings, form_fields)
    if not notification.ok:
        # 验签失败意味着来源不可信，绝不能入账
        logger.error("支付宝异步通知验签未通过：%s", notification.reason)
        return PlainTextResponse("failure")

    # app_id / seller_id 是「这笔通知属于哪个商户」的判据，必须拿**验签用的那份**
    # 凭据来比。provider 内部已经合并过后台站点配置，而这里手上的 ``settings``
    # （来自 app.state.settings）只有环境变量：用它比较的话，后台配了商户号的部署
    # 里这两个字段是空的，整段校验会被「非空才比较」静默跳过；环境变量与后台不一致
    # 时又会把正常通知全部拒掉。
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
<link rel="stylesheet" href="/store-static/theme.css?v=20260916230552">
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
    provider = _alipay_provider(request, session)

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

    # 用户刚付完款就跳回来，此刻查单命中率很高——force 绕过节流
    if provider is not None and provider.is_configured(settings):
        setting = site_config.get_setting(session)
        try:
            reconcile_alipay_order(
                session, order=order, settings=settings, setting=setting, force=True
            )
        except Exception:  # noqa: BLE001 - 对账失败不能挡住跳转页
            logger.exception("同步跳转页对账失败 order=%s", order.order_no)

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
