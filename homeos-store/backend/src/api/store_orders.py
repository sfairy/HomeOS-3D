"""商店接口的 orders 资源组（从 api/store.py 拆出）。
"""
from __future__ import annotations

import json
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select

from .store_catalog import (
    ACCOUNT_ORDER_PAGE_SIZE,
    _account_license_state,
    _account_orders,
    _account_orders_total,
    _evaluate_coupon_limited,
    _flush_order,
    _has_used_trial,
    _is_trial_product,
    _product_or_404,
    _reconcile_payment,
    _resolve_upgrade_target,
)
from .store_shared import (
    _base_url,
    _customer_for,
    _require_verified,
    close_order_channel_best_effort,
    logger,
)
from ..commerce import coupons, delivery, fulfill
from ..commerce.expiry import expire_stale_orders
from ..core.deps import AuthedAccount, CurrentAccount, DbSession, SettingsDep, order_or_404
from ..core.models import (
    License,
    Order,
    Product,
)
from ..core.schemas import (
    CreateOrderRequest,
)
from ..core.serializers import (
    is_sold_out,
    order_payload,
)
from ..ops import site_settings as site_config
from ..payments import (
    default_channel_name,
    enabled_channel_names,
    is_known_provider,
    normalize_provider_name,
    provider_label,
)
from ..payments.base import PaymentError
from ..security.security import (
    new_order_no,
    new_token,
    token_matches,
    utcnow,
)

router = APIRouter()


def _resolve_requested_channel(setting, payload, request) -> str:
    """顾客在收银台选的渠道 → 渠道名；留空返回空串（表示「用默认渠道」）。

    这里**必须**校验：一个请求字段不能让顾客自己决定走哪个商户号收款。校验三件事 ——
    渠道受支持、运营启用了它、它的凭据齐备（不齐的话建单必然失败，不如现在就报清楚）。
    """
    requested = normalize_provider_name(getattr(payload, "payment_channel", None))
    if not requested:
        return ""
    if not is_known_provider(requested):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的支付渠道「{requested}」。",
        )
    settings = request.app.state.settings
    if requested not in enabled_channel_names(setting, settings):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"支付渠道「{provider_label(requested)}」未启用，请换一个渠道。",
        )
    provider = request.app.state.resolve_payment_provider(setting, name=requested)
    if not provider.is_configured(settings) or not bool(setting.payment_enabled):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(f"支付渠道「{provider_label(requested)}」当前不可用，请换一个渠道或稍后再试。"),
        )
    return requested


@router.get("/orders")
def list_orders(
    request: Request,
    session: DbSession,
    account: AuthedAccount,
    settings: SettingsDep,
    limit: int = ACCOUNT_ORDER_PAGE_SIZE,
    offset: int = 0,
) -> dict:
    """账号中心的订单列表（分页）。
    """
    _require_verified(account)
    size = max(1, min(int(limit or ACCOUNT_ORDER_PAGE_SIZE), 100))
    skip = max(0, int(offset or 0))
    orders = _account_orders(session, account, limit=size, offset=skip)
    # 与 get_order 同一顺序：先对账，再过期。账号中心是买家最可能先看到结果的地方，
    # 顺序反了会让「刚过期但钱已到账」的单在这一屏显示成已过期。每个账号最多一笔待
    # 支付订单（数据库唯一索引），所以这里的对账最多一次查单请求。
    pending = [item for item in orders if item.status == "pending"]
    for item in pending:
        _reconcile_payment(session, request, item)
    expire_stale_orders(session, settings)
    for item in pending:
        session.refresh(item)
    return {
        "items": [order_payload(order) for order in orders],
        "ordersTotal": _account_orders_total(session, account),
        "limit": size,
        "offset": skip,
    }


@router.post("/orders")
def create_order(
    payload: CreateOrderRequest,
    request: Request,
    background: BackgroundTasks,
    session: DbSession,
    account: AuthedAccount,
    settings: SettingsDep,
) -> Response:
    _require_verified(account)
    setting = site_config.get_setting(session)
    if setting.maintenance_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=setting.maintenance_message or "商城正在升级维护，请稍后再试。",
        )
    # 「启用支付」必须在**下单流程**里读：只影响站点配置接口的展示
    if not setting.payment_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="当前暂未开放支付，请稍后再试或联系客服。",
        )

    expire_stale_orders(session, settings)

    pending = session.scalars(
        select(Order)
        .where(Order.account_id == account.id)
        .where(Order.status == "pending")
        .order_by(Order.created_at.desc())
    ).first()
    if pending is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"你有一笔待支付订单（{pending.order_no}），请先完成或等待其超时关闭。",
        )

    product = _product_or_404(session, payload.product_id)
    #: 只判售罄，不为了这一位去算「已售份数 / 拥有客户数」与整张商品表 ——
    if is_sold_out(product):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该商品已售罄。")

    # 判定订单类型：module / template 之类的功能增量包属于 addon
    is_addon = product.product_type in {"module", "template"} or bool(product.requires_license)
    target_license: License | None = None
    if is_addon:
        target_license_id = (payload.target_license_id or "").strip()
        if not target_license_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="请选择增量包要附加到的主授权。",
            )
        target_license = session.get(License, target_license_id)
        if target_license is None or target_license.account_id != account.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="选择的授权不存在。")
        if not target_license.active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="选择的授权已停用。")
        if target_license.access_expires_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="增量包只能添加到永不过期的主授权上。",
            )
    elif _is_trial_product(product):
        # 「每个账号只能买一次试用」必须在**服务端**兜底：只写在前端
        permanent, _temporary = _account_license_state(session, account)
        if permanent:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="当前账号已有永久授权，无需购买试用。",
            )
        if _has_used_trial(session, account):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="每个账号只能购买一次试用授权。",
            )
    else:
        target_license = _resolve_upgrade_target(session, account, payload.upgrade_license_id)

    coupon = None
    discount = 0
    coupon_code = (payload.coupon_code or "").strip()
    if coupon_code:
        # 限流、口径校验、失败记账都在这里 —— 与 ``/coupons/preview`` 走同一条
        coupon, discount = _evaluate_coupon_limited(
            session, account=account, product=product, code=coupon_code
        )

    original_amount = int(product.price_cents or 0)
    amount = max(0, original_amount - discount)
    is_upgrade = not is_addon and target_license is not None
    if is_addon:
        order_type = "addon"
        license_action = "patch"
    elif is_upgrade:
        order_type = "upgrade"
        license_action = "upgrade"
    elif product.product_type == "package":
        order_type = "package"
        license_action = "issue"
    else:
        order_type = "base"
        license_action = "issue"
    moment = utcnow()
    order = Order(
        order_no=new_order_no(account.email, now=moment),
        lookup_token=new_token(24),
        account_id=account.id,
        customer_id=_customer_for(session, account).id,
        email=account.email,
        product_id=product.id,
        product_name=product.name,
        product_type=product.product_type,
        order_type=order_type,
        license_action=license_action,
        target_license_id=target_license.id if target_license is not None else None,
        original_amount_cents=original_amount,
        discount_cents=discount,
        amount_cents=amount,
        coupon_code=coupon.code if coupon is not None else None,
        status="pending",
        fulfillment_mode=product.fulfillment_mode,
        #: 订单冻结**顾客实际要用的渠道**：之后运营改默认渠道也不影响在途订单
        #: 的回调与对账（它们都按订单自己的 payment_provider 解析 provider）。
        #: 未显式选渠道时用 default_channel_name（只在启用集合内挑），与前台展示、
        #: resolve_provider 保持同一口径。
        payment_provider=(
            _resolve_requested_channel(setting, payload, request)
            or default_channel_name(setting, request.app.state.settings)
        ),
        expires_at=moment + timedelta(seconds=request.app.state.settings.order_ttl_seconds),
    )
    session.add(order)
    outcome = _flush_order(session, order)
    if outcome == "pending":
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="你有一笔待支付订单，请先完成或等待其超时关闭。",
        )
    if outcome != "ok":
        #: 订单号撞车。``new_order_no`` 末尾的随机段已经让这件事的概率可忽略，但真撞上
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="下单请求过于频繁，请稍后重试。",
            headers={"Retry-After": "1"},
        )

    if coupon is not None:
        try:
            coupons.redeem_coupon(session, order, coupon, account, discount)
        except coupons.CouponUnavailable as error:
            # 名额在「校验」和「占用」之间被别人抢走：整单作废，先建的订单不会
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)
            ) from error
    if not fulfill.reserve_stock(session, product, 1):
        # 并发下单：更早那一次 soldOut 检查是「读」，这里是「原子占位」。
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该商品已售罄。")

    # 优惠后应付 0 元：支付宝不接受 0 元交易，直接按免费订单开通
    if amount <= 0:
        order.status = "paid"
        order.paid_at = utcnow()
        order.payment_trade_no = f"FREE{order.order_no[-10:]}"
        order.payment_payload_json = json.dumps(
            {
                "type": "free",
                "displayName": "0 元订单",
                "note": "优惠后应付 0 元，无需支付，已直接开通。",
            },
            ensure_ascii=False,
        )
        session.flush()
        if order.fulfillment_mode != "manual":
            fulfill.fulfill_order(session, order=order, setting=setting)
        session.refresh(order)
        # 与支付宝/微信回调、后台入账同口径：发码邮件排在响应之后，且必然看到已提交的授权。
        # 少了这一步，免费单只能等巡检（默认 30s）或用户手动重发。
        background.add_task(
            delivery.notify_license_issued,
            request.app.state.database,
            order_id=order.id,
        )
        logger.info("0 元订单直接开通 order=%s", order.order_no)
        return JSONResponse(order_payload(order), status_code=status.HTTP_201_CREATED)

    chosen = _resolve_requested_channel(setting, payload, request)
    try:
        provider = request.app.state.resolve_payment_provider(setting, name=chosen)
    except PaymentError as error:
        # 渠道配置非法（例如后台把 payment_provider 写成了未知值）：此时绝不能
        order.status = "payment_failed"
        fulfill.release_order_effects(session, order=order, product=product)
        session.flush()
        logger.error("支付渠道解析失败 order=%s: %s", order.order_no, error)
        # B904：这条 503 是**转换**而不是新错误，原始异常（哪个渠道的配置、哪一步不合规）
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error

    # 真实渠道的支付页由渠道自己承载（当面付只回一个二维码），没有「页面凭证」这回事 ——
    # 那个参数是模拟收银台为了把票据写进 URL 才存在的。
    try:
        intent = provider.create_payment(
            order=order,
            settings=request.app.state.settings,
            setting=setting,
            base_url=_base_url(request),
        )
    except PaymentError as error:
        order.status = "payment_failed"
        fulfill.release_order_effects(session, order=order, product=product)
        session.flush()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error

    order.payment_payload_json = json.dumps(intent.payload, ensure_ascii=False)
    session.flush()

    return JSONResponse(order_payload(order), status_code=status.HTTP_201_CREATED)


@router.get("/orders/{order_no}")
def get_order(
    order_no: str,
    request: Request,
    session: DbSession,
    account: CurrentAccount,
    reconcile: int = 0,
) -> Response:
    order = order_or_404(session, order_no)

    order_token = request.headers.get("x-order-token")
    authorized = (
        (account is not None and order.account_id == account.id)
        or token_matches(order_token, order.lookup_token)
    )
    if not authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该订单。")

    # 默认本地状态（轮询）；reconcile=1 时才主动查渠道（手动确认支付）。
    # 渠道收款以 notify / sweeper 为准。本地过期收尾始终执行。
    if int(reconcile or 0):
        _reconcile_payment(session, request, order)
    expire_stale_orders(session, request.app.state.settings)
    session.refresh(order)
    response = JSONResponse(order_payload(order))
    response.headers["Cache-Control"] = "no-store"
    return response


@router.post("/orders/{order_no}/cancel")
def cancel_order(
    order_no: str, request: Request, session: DbSession, account: CurrentAccount
) -> dict:
    """买家自助取消待支付订单：关掉渠道侧收款码，归还库存预留与优惠码名额。
    """
    order = order_or_404(session, order_no)

    order_token = request.headers.get("x-order-token")
    authorized = (
        (account is not None and order.account_id == account.id)
        or token_matches(order_token, order.lookup_token)
    )
    if not authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作该订单。")

    if order.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="只有待支付订单可以取消。"
        )

    # ---- 阶段一：先关渠道（网络调用），失败只记日志 ----
    channel_closed = close_order_channel_best_effort(
        request,
        session,
        order,
        log_context="取消订单时",
        already_paid_detail="该订单已有付款记录，无法取消；请稍后到账号中心查看授权。",
    )

    # ---- 阶段二：本地收尾（条件 UPDATE 抢单） ----
    product = session.get(Product, order.product_id) if order.product_id else None
    # 取消可能和支付回调、超时扫描同时发生：只有把订单从 pending 推走的那一个请求
    if not fulfill.close_pending_order(session, order=order, product=product):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="订单状态已变更，请刷新后重试。"
        )
    if channel_closed:
        #: 只有真的关掉了（或本来就已关闭）才写这个时间戳。关单报错时留空，
        order.channel_closed_at = utcnow()
    session.flush()
    session.refresh(order)
    logger.info(
        "用户取消待支付订单 订单号=%s 渠道已关=%s", order.order_no, channel_closed
    )
    return order_payload(order)


@router.post("/orders/{order_no}/archive")
def archive_order(order_no: str, session: DbSession, account: AuthedAccount) -> dict:
    #: 与 ``GET/POST /orders`` 对齐：能读订单列表的账号必须先验证邮箱。
    _require_verified(account)
    order = order_or_404(session, order_no)
    # 越权访问与「订单不存在」回同一个 404：不给出「这个单号存在」的旁路信息。
    if order.account_id != account.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")
    order.archived_at = utcnow()
    session.flush()
    return order_payload(order)
