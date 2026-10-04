"""商店接口的 orders 资源组。
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
    if is_sold_out(product):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该商品已售罄。")

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
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)
            ) from error
    if not fulfill.reserve_stock(session, product, 1):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该商品已售罄。")

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
        order.status = "payment_failed"
        fulfill.release_order_effects(session, order=order, product=product)
        session.flush()
        logger.error("支付渠道解析失败 order=%s: %s", order.order_no, error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error

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

    channel_closed = close_order_channel_best_effort(
        request,
        session,
        order,
        log_context="取消订单时",
        already_paid_detail="该订单已有付款记录，无法取消；请稍后到账号中心查看授权。",
    )

    product = session.get(Product, order.product_id) if order.product_id else None
    if not fulfill.close_pending_order(session, order=order, product=product):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="订单状态已变更，请刷新后重试。"
        )
    if channel_closed:
        order.channel_closed_at = utcnow()
    session.flush()
    session.refresh(order)
    logger.info(
        "用户取消待支付订单 订单号=%s 渠道已关=%s", order.order_no, channel_closed
    )
    return order_payload(order)


@router.post("/orders/{order_no}/archive")
def archive_order(order_no: str, session: DbSession, account: AuthedAccount) -> dict:
    _require_verified(account)
    order = order_or_404(session, order_no)
    if order.account_id != account.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")
    order.archived_at = utcnow()
    session.flush()
    return order_payload(order)
