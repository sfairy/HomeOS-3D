"""支付宝回调路由：异步通知 + 同步跳转页。
"""

from __future__ import annotations

import html
import logging
from urllib.parse import parse_qsl

from fastapi import APIRouter, BackgroundTasks, Body, Request
from fastapi.responses import HTMLResponse, PlainTextResponse
from sqlalchemy import select, update

from ..api.page_shell import APPEARANCE_PLACEHOLDER, inject_scene
from ..commerce import delivery, fulfill
from ..core.deps import DbSession
from ..core.models import Order, Product
from ..core.static_revision import file_revision
from ..ops import incidents
from ..ops import site_settings as site_config
from ..payments.alipay import cents_from_yuan, public_key_error
from ..payments.base import PaymentError
from ..payments.reconcile import reconcile_channel_order
from ..payments.settlement import settle_paid_order
from ..security.limiter import SlidingWindowLimiter
from ..security.request_security import resolve_client_ip
from ..security.security import token_matches, utcnow

logger = logging.getLogger("src.api.alipay")

#: 同步跳转页的**按来源**查单预算。
_RETURN_QUERY_LIMITER = SlidingWindowLimiter(limit=20, window_seconds=60.0)

router = APIRouter(tags=["alipay"])

NOTIFY_PATH = "/store/v1/payments/alipay/notify"


def _alipay_provider_for_callback(request: Request, session=None):
    """按**渠道名**解析支付宝渠道，而不是看「当前在收款的是哪个渠道」。

    回调与查单服务的是**已经存在的订单**：运营把站点渠道临时清空（或换成别的
    留空）时，在途的那批订单还必须能被对账。按当前渠道判断会让这些通知一律回 failure，
    支付宝于是重推数小时，钱到了却没人入账。巡检早就是这么做的（见 reconcile.py 的
    name_override），这里与它对齐。
    """
    setting = site_config.get_setting(session) if session is not None else None
    try:
        return request.app.state.resolve_payment_provider(setting, name="alipay")
    except PaymentError as error:
        logger.warning("按渠道名解析支付宝失败，按「非支付宝通知」处理：%s", error)
        return None


def _close_pending_after_channel_close(session, *, order: Order) -> bool:
    """渠道已明确关单（TRADE_CLOSED）时，把本地待支付订单推进终态。

    不这么做的话订单会一直停在 pending：库存预留与优惠码名额继续被占着，直到本地
    TTL 或巡检才回收 —— 而生产环境建议的订单 TTL 是十几分钟到几十分钟，那段时间里
    这些名额对别的买家是不可见的。
    """
    product = session.get(Product, order.product_id) if order.product_id else None
    closed = fulfill.close_pending_order(
        session, order=order, product=product, status="expired"
    )
    if not closed:
        # 已被其它路径（支付成功 / 用户取消 / 巡检）处理，副作用由它负责。
        return False
    session.execute(
        update(Order)
        .where(Order.id == order.id)
        .values(channel_closed_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    session.flush()
    logger.warning("渠道已关单，本地订单同步过期 order=%s", order.order_no)
    return True


@router.post(NOTIFY_PATH, include_in_schema=False)
def alipay_notify(
    request: Request,
    session: DbSession,
    background: BackgroundTasks,
    body: bytes = Body(b""),
) -> PlainTextResponse:
    """支付宝异步通知（同步端点，跑在线程池里）。
    """
    settings = request.app.state.settings
    provider = _alipay_provider_for_callback(request, session)
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
    except (UnicodeDecodeError, ValueError):
        logger.error("支付宝异步通知解析失败")
        return PlainTextResponse("failure")

    form_fields = {str(key): str(value) for key, value in pairs}

    if not provider.is_configured(settings):
        logger.error("收到支付宝异步通知，但收款凭据未配置，无法验签")
        return PlainTextResponse("failure")

    # 公钥解析不出来是**配置故障**，不是攻击：它会让所有通知与查单一起失败，而 /healthz
    # 的巡检仍报健康。这里明确记一笔，让后台概览看得见（验签失败本身不记账，否则任何人
    # 往这个地址 POST 垃圾都会刷爆告警）。
    key_problem = public_key_error(provider.resolve_settings(settings).alipay_public_key_text)
    if key_problem:
        logger.error("支付宝公钥无法解析，通知与查单都会失败：%s", key_problem)
        incidents.note("alipay.config", error=key_problem)
        return PlainTextResponse("failure")

    notification = provider.verify_notification(settings, form_fields)
    if not notification.ok:
        # 验签失败意味着来源不可信，绝不能入账
        logger.error("支付宝异步通知验签未通过：%s", notification.reason)
        return PlainTextResponse("failure")

    # app_id / seller_id 必须拿**验签用的那份**凭据来比：provider 内部已合并后台站点配置，
    effective = provider.resolve_settings(settings)

    # 配了期望值就必须**逐字相等**。旧写法是「通知里有这个字段才校验」，于是通知一旦
    # 缺字段就整条跳过校验，只剩签名与金额 —— 而这两条正是「别的商户往本回调地址推
    # 消息」这个场景下**仍然成立**的部分。支付宝的通知始终带这两个字段，所以收紧不会
    # 误伤正常通知。
    if effective.alipay_app_id and notification.app_id != effective.alipay_app_id:
        logger.error(
            "支付宝异步通知 app_id 不匹配：收到 %r，期望 %s",
            notification.app_id,
            effective.alipay_app_id,
        )
        return PlainTextResponse("failure")

    if effective.alipay_seller_id and notification.seller_id != effective.alipay_seller_id:
        logger.error(
            "支付宝异步通知 seller_id 不匹配：收到 %r，期望 %s",
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

    if (order.payment_provider or "").lower() != "alipay":
        # 这笔单不是走支付宝建的。一条验签通过的通知指向它，只可能是订单号被复用或
        # 渠道配置被改过 —— 绝不能拿支付宝的钱去结一笔别的渠道的订单。
        logger.error(
            "支付宝异步通知指向非支付宝订单，拒绝入账 order=%s provider=%r",
            order.order_no,
            order.payment_provider,
        )
        incidents.note(
            "alipay.foreign_order",
            order_no=order.order_no,
            error=f"order.payment_provider={order.payment_provider!r}",
        )
        return PlainTextResponse("failure")

    if not notification.is_success:
        # 未成功状态分两种，处理必须分开：WAIT_BUYER_PAY 是「还没付」，本地保持待支付；
        # TRADE_CLOSED 是「这笔交易已经死了」，本地再留着 pending 只会继续占着库存预留
        # 与优惠码名额，直到本地 TTL 或巡检才收尾（生产 TTL 下可能是几小时的空占）。
        if notification.trade_status == "TRADE_CLOSED":
            _close_pending_after_channel_close(session, order=order)
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
    # 发码邮件排在**响应之后**：DbSession 的提交发生在响应发出之前，而后台任务在
    # 响应之后运行 —— 于是发信必然看到已经提交的授权，同时不拖慢给支付宝的 ack
    # （支付宝有超时重推，ack 越慢越容易重复通知）。
    background.add_task(
        delivery.notify_license_issued,
        request.app.state.database,
        order_id=order.id,
    )
    return PlainTextResponse("success")


_RETURN_PAGE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- 与商店其它页面（store.html / admin.html / setup.html / 收银台）同一个取值：
     这一屏是整屏深色卡片，缺了 theme-color，移动端地址栏会留在默认的浅色，
     付完款跳回来时顶部白一条 —— 与页面本身比手写的 #050912 更扎眼。
     取的是 --hb-bg 的值，不跟随后台配色（与其它页面的处理一致）。 -->
<meta name="theme-color" content="#050912">
<title>{title} - HomeOS 授权中心</title>
<link rel="stylesheet" href="/store-static/theme.css?v={theme_stamp}">
<!-- 站点配色覆盖。和商店其它页面一样走 page_shell 的注入，这里只留插入点：
     少了它，管理员在后台改的配色在用户付完款跳回来的这一屏上不生效 ——
     而这一屏恰恰是用户第一次看到「自己的」商城的地方，配色停在默认值最刺眼。
     插入点的值由下面那个占位字段填空（值就是 page_shell 里的常量），**不手打**：
     本模板要过 str.format()，手打得写成四层花括号才还原得回两层，数错一层
     占位符就永远匹配不上，而 inject_scene 会为此抛异常 —— 页面直接 500。 -->
{appearance}
<style>
  /* 与商店/后台同一套暗色 + 琥珀设计语言（令牌来自 theme.css） */
  body {{ margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background: var(--hb-bg); color: var(--hb-ink); font-family: var(--hb-font); }}
  .card {{ background: var(--hb-surface); border:1px solid var(--hb-line); border-radius:9px;
           padding:40px 36px; max-width:440px; width:calc(100% - 48px);
           box-shadow: var(--hb-shadow-lg); text-align:center; }}
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


def _render_return_page(request: Request, **fields: object) -> HTMLResponse:
    markup = _RETURN_PAGE.format(appearance=APPEARANCE_PLACEHOLDER, **fields)
    return HTMLResponse(
        inject_scene(markup, request),
        headers={"Cache-Control": "no-store"},
    )


@router.get("/store/payment/return", include_in_schema=False)
def alipay_return(
    request: Request,
    session: DbSession,
    out_trade_no: str = "",
) -> HTMLResponse:
    """同步跳转页。
    """
    settings = request.app.state.settings
    provider = _alipay_provider_for_callback(request, session)

    order = None
    if out_trade_no:
        order = session.scalars(select(Order).where(Order.order_no == out_trade_no)).first()

    if order is None:
        return _render_return_page(
            request,
            title="未找到订单",
            icon="&#128533;",
            message="没有找到对应的订单。如果已经付款，请到账号中心查看授权状态。",
            order_block="",
            next_url="/user/dashboard/index",
            next_label="前往账号中心",
            # 主题表按文件 mtime 带版本号（见 core/static_revision.py），
            theme_stamp=file_revision(settings.static_dir / "theme.css"),
        )

    if provider is not None and provider.is_configured(settings):
        setting = site_config.get_setting(session)
        token = (request.query_params.get("token") or "").strip()
        owns_order = token_matches(token, order.lookup_token)
        source_ip = resolve_client_ip(request).ip or "unknown"
        if _RETURN_QUERY_LIMITER.allow(f"payment-return:{source_ip}"):
            try:
                reconcile_channel_order(
                    session,
                    order=order,
                    settings=settings,
                    setting=setting,
                    force=owns_order,
                )
            except Exception as error:
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
    return _render_return_page(
        request,
        title=title,
        icon=icon,
        message=message,
        order_block=order_block,
        next_url="/user/dashboard/index",
        next_label="前往账号中心",
        theme_stamp=file_revision(settings.static_dir / "theme.css"),
    )
