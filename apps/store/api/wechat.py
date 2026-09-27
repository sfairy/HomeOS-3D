"""微信支付回调路由：Native 扫码支付的异步通知。

与支付宝那条（api/alipay.py）的结构对齐，但有三处**必须**不同的地方：

1. 微信要求应答体是 JSON：成功回 ``{"code":"SUCCESS"}`` 且 HTTP 200，
   失败回非 200（微信据此重推）。支付宝要的是纯文本 ``success``。
2. 回调体是**加密**的：验签只证明「这条消息来自微信」，还要用 APIv3 密钥解密
   才能读到交易状态与金额 —— 两步都成功才算可信。
3. 金额原生就是**分**，与订单同口径直接比（支付宝要元→分换算）。

事务边界是刻意摆出来的（见 ``_handle``）：``SUCCESS`` 只在**确实提交之后**才回给
微信。回了 SUCCESS 却没落库，这笔钱就再也不会被重推了。
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy import select, update

from apps.store.commerce import delivery, fulfill
from apps.store.core.models import Order, Product
from apps.store.ops import incidents, site_settings as site_config
from apps.store.payments import normalize_provider_name, wechat as wechat_module
from apps.store.payments.base import PaymentError
from apps.store.payments.settlement import settle_paid_order
from apps.store.security.security import utcnow

logger = logging.getLogger("apps.store.api.wechat")

router = APIRouter(tags=["wechat"])

NOTIFY_PATH = "/store/v1/payments/wechat/notify"


def _ok() -> JSONResponse:
    """微信约定的成功应答。回错格式等于没收到 —— 它会一直重推。"""
    return JSONResponse({"code": "SUCCESS", "message": "成功"}, status_code=200)


def _fail(message: str, *, status_code: int = 400, quiet: bool = False) -> JSONResponse:
    """失败应答：**必须非 200**，否则微信不会重推。"""
    if not quiet:
        logger.error("微信支付回调处理失败：%s", message)
    return JSONResponse({"code": "FAIL", "message": message[:120]}, status_code=status_code)


@router.post(NOTIFY_PATH, include_in_schema=False)
async def wechat_notify(request: Request, background: BackgroundTasks) -> JSONResponse:
    """微信支付异步通知。

    这里必须是 ``async def``：要 ``await request.body()`` 拿**原始报文**（验签覆盖的
    就是它，任何重新序列化都会让签名对不上）。随后的同步数据库工作交给线程池，
    免得阻塞事件循环。
    """
    raw = await request.body()
    return await run_in_threadpool(_handle, request, background, raw)


def _handle(request: Request, background: BackgroundTasks, raw: bytes) -> JSONResponse:
    """同步处理主体。用 ``with database.session()`` 把事务边界摆明：

    ``return`` 会让上下文先提交、再把应答交给调用方 —— 也就是「先落库、后回 SUCCESS」；
    中途抛异常则回滚并变成 500，微信会重推。
    """
    settings = request.app.state.settings
    try:
        body = raw.decode("utf-8")
    except UnicodeDecodeError:
        return _fail("回调体不是 UTF-8")
    if not body.strip():
        return _fail("回调体为空")

    database = request.app.state.database
    with database.session() as session:
        setting = site_config.get_setting(session)
        try:
            # 按**渠道名**解析微信支付，不看当前默认渠道：回调服务的是已经存在的订单。
            provider = request.app.state.resolve_payment_provider(setting, name="wechat")
        except PaymentError as error:
            logger.warning("按渠道名解析微信支付失败，按「非微信通知」处理：%s", error)
            return _fail("当前支付渠道不是微信支付，已忽略", status_code=200, quiet=True)

        if not provider.is_configured(settings):
            # 配置不全时既验不了签也解不开密。**回 200**：重推一万次还是解不开，
            # 而刷满微信的告警面板只会掩盖真正的问题。记 incident 让后台看得见。
            incidents.note("wechat.config", error="回调到达时微信支付凭据未配置完整")
            return _fail("微信支付凭据未配置完整，无法验签", status_code=200, quiet=True)

        notification = provider.verify_notification(
            settings, headers=dict(request.headers), body=body
        )
        if not notification.ok:
            # 验签/解密失败 = 来源不可信，绝不入账。回非 200 让微信重推，但**不**记
            # incident：任何人都能往这个地址 POST 垃圾，记账会被刷爆。
            return _fail(f"回调不可信：{notification.reason}", quiet=True)

        effective = provider.resolve_settings(settings)
        if effective.wechat_mch_id and notification.mch_id != effective.wechat_mch_id:
            return _fail(f"商户号不匹配：收到 {notification.mch_id or '（空）'}")
        if effective.wechat_app_id and notification.app_id != effective.wechat_app_id:
            return _fail(f"appid 不匹配：收到 {notification.app_id or '（空）'}")

        order = session.scalars(
            select(Order).where(Order.order_no == notification.out_trade_no)
        ).first()
        if order is None:
            return _fail(f"找不到订单 out_trade_no={notification.out_trade_no}")

        if normalize_provider_name(order.payment_provider) != "wechat":
            # 验签通过但订单不是走微信建的：只可能是订单号被复用或渠道配置被改过。
            # 绝不能拿微信的钱去结一笔别的渠道的订单。
            incidents.note(
                "wechat.foreign_order",
                order_no=order.order_no,
                error=f"order.payment_provider={order.payment_provider!r}",
            )
            return _fail("该订单不是微信支付订单，拒绝入账")

        if not notification.is_success:
            # 与支付宝那条同理：还在等付款的保持待支付；渠道已终结的（CLOSED / REVOKED /
            # PAYERROR）要本地收尾，否则它会一直占着库存预留与优惠码名额。
            if notification.trade_state in wechat_module.CLOSED_TRADE_STATES:
                _close_pending_after_channel_close(session, order=order)
            logger.info(
                "微信支付回调交易未成功 order=%s trade_state=%s",
                order.order_no,
                notification.trade_state or "（空）",
            )
            return _ok()

        expected = int(order.amount_cents or 0)
        if notification.total_cents is None or notification.total_cents != expected:
            # 金额不符绝不入账：这是「拿一笔小额支付换一张授权」的唯一防线。
            incidents.note(
                "wechat.amount_mismatch",
                order_no=order.order_no,
                error=f"期望 {expected} 分，收到 {notification.total_cents} 分",
            )
            return _fail("金额与订单不符，拒绝入账")

        settle_paid_order(
            session,
            order=order,
            setting=setting,
            trade_no=notification.transaction_id,
            source="wechat.notify",
        )
        # 发码邮件排在**响应之后**：后台任务在响应之后运行，此时事务已提交，
        # 发信必然看到已经落库的授权，同时不拖慢给微信的 ack。
        background.add_task(
            delivery.notify_license_issued,
            database,
            order_id=order.id,
        )
        return _ok()


def _close_pending_after_channel_close(session, *, order: Order) -> bool:
    """渠道已明确终结时，把本地待支付订单推进终态。

    不这么做的话订单会一直停在 pending：库存预留与优惠码名额继续被占着，直到本地
    TTL 或巡检才回收。
    """
    product = session.get(Product, order.product_id) if order.product_id else None
    closed = fulfill.close_pending_order(
        session, order=order, product=product, status="expired"
    )
    if not closed:
        return False
    session.execute(
        update(Order)
        .where(Order.id == order.id)
        .values(channel_closed_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    session.flush()
    logger.warning("微信支付已终结该交易，本地订单同步过期 order=%s", order.order_no)
    return True


__all__ = ["NOTIFY_PATH", "router"]
