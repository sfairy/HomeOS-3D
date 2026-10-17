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

#: 订单号唯一约束撞车时的重试次数（含首次）。撞号是服务端随机数的概率事件，重试几次即可。
_ORDER_NO_ATTEMPTS = 3


def _resolve_requested_channel(setting, order_body, request) -> str:
    """顾客在收银台选的渠道 → 渠道名；留空返回空串（表示「用默认渠道」）。

    这里**必须**校验：一个请求字段不能让顾客自己决定走哪个商户号收款。校验三件事 ——
    渠道受支持、运营启用了它、它的凭据齐备（不齐的话建单必然失败，不如现在就报清楚）。
    """
    requested = normalize_provider_name(getattr(order_body, "payment_channel", None))
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


def _assert_store_open(setting) -> None:
    """维护模式与支付开关的闸门：任一不满足就按「暂时不可用」拒绝下单。
    """
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


def _assert_no_pending_order(session, account: AuthedAccount) -> None:
    """一个账号同时只允许一笔待支付订单。
    """
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


def _resolve_target_license(
    session,
    account: AuthedAccount,
    product,
    *,
    is_addon: bool,
    target_license_id: str,
    upgrade_license_id: str | None,
) -> License | None:
    """解析本单要挂靠 / 升级的主授权（增量包、试用、升级三种形态各有一道闸门）。
    """
    if is_addon:
        selected_id = (target_license_id or "").strip()
        if not selected_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="请选择增量包要附加到的主授权。",
            )
        target_license = session.get(License, selected_id)
        if target_license is None or target_license.account_id != account.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="选择的授权不存在。")
        if not target_license.active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="选择的授权已停用。")
        if target_license.access_expires_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="增量包只能添加到永不过期的主授权上。",
            )
        return target_license
    if _is_trial_product(product):
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
        return None
    return _resolve_upgrade_target(session, account, upgrade_license_id)


def _resolve_order_action(product, *, is_addon: bool, is_upgrade: bool) -> tuple[str, str]:
    """按商品形态定 ``(order_type, license_action)``。"""
    if is_addon:
        return "addon", "patch"
    if is_upgrade:
        return "upgrade", "upgrade"
    if product.product_type == "package":
        return "package", "issue"
    return "base", "issue"


def _flush_order_with_retry(session, order: Order, account: AuthedAccount) -> None:
    """落库待支付订单；订单号撞唯一键时换号重试，其余结果各自给出明确响应。
    """
    outcome = _flush_order(session, order)
    for _ in range(_ORDER_NO_ATTEMPTS - 1):
        if outcome != "retry":
            break
        # 订单号撞车：换一个号重试。撞号是服务端随机数的事，与顾客的请求频率无关，
        # 不能报成「请求过于频繁」。
        logger.warning("订单号 %s 冲突，重新生成后重试", order.order_no)
        order.order_no = new_order_no(account.email)
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
            detail="订单号生成冲突，请重试。",
            headers={"Retry-After": "1"},
        )


def _reserve_stock_and_coupon(
    session,
    order: Order,
    product,
    coupon,
    account: AuthedAccount,
    discount: int,
) -> None:
    """先占库存、再核销优惠码（顺序不可颠倒，理由见下）。
    """
    # 顺序很重要：**先占库存，再核销优惠码**。
    # 反过来的话，「库存不足 → 409」这条最常走的失败路径会在已经扣掉一个优惠码名额
    # **之后**才抛出：请求级会话虽然会回滚，但名额计数是 `UPDATE … SET count = count + 1`
    # 直接写的，中途任何一次 flush / 新会话（`record_attempt_in_new_session` 那类）都可能
    # 把它落库，回滚就救不回来了 —— 用户看到「已售罄」，码却已经废掉。
    if not fulfill.reserve_stock(session, product, 1):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该商品已售罄。")
    if coupon is not None:
        try:
            coupons.redeem_coupon(session, order, coupon, account, discount)
        except coupons.CouponUnavailable as error:
            # 核销失败在这里同样是干净的：整个请求回滚，上面刚占的库存一起释放
            #（`reserve_stock` 与优惠码都在同一个请求级事务里）。
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)
            ) from error


def _complete_free_order(
    session,
    request: Request,
    background: BackgroundTasks,
    order: Order,
    setting,
) -> JSONResponse:
    """0 元订单直接开通：记账、履约，并把发码邮件排到响应之后。"""
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


def _open_channel_payment(
    request: Request,
    session,
    order: Order,
    setting,
    product,
    chosen: str,
) -> JSONResponse:
    """向渠道下单并落二维码；渠道不可用时回滚订单、释放库存与优惠码。"""
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


@router.post("/orders")
def create_order(
    body: CreateOrderRequest,
    request: Request,
    background: BackgroundTasks,
    session: DbSession,
    account: AuthedAccount,
    settings: SettingsDep,
) -> Response:
    _require_verified(account)
    setting = site_config.get_setting(session)
    _assert_store_open(setting)
    expire_stale_orders(session, settings)
    _assert_no_pending_order(session, account)

    product = _product_or_404(session, body.product_id)
    if is_sold_out(product):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该商品已售罄。")

    is_addon = product.product_type in {"module", "template"} or bool(product.requires_license)
    target_license = _resolve_target_license(
        session,
        account,
        product,
        is_addon=is_addon,
        target_license_id=body.target_license_id or "",
        upgrade_license_id=body.upgrade_license_id,
    )

    coupon = None
    discount = 0
    coupon_code = (body.coupon_code or "").strip()
    if coupon_code:
        coupon, discount = _evaluate_coupon_limited(
            session, account=account, product=product, code=coupon_code
        )

    original_amount = int(product.price_cents or 0)
    amount = max(0, original_amount - discount)
    order_type, license_action = _resolve_order_action(
        product, is_addon=is_addon, is_upgrade=not is_addon and target_license is not None
    )
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
            _resolve_requested_channel(setting, body, request)
            or default_channel_name(setting, request.app.state.settings)
        ),
        expires_at=moment + timedelta(seconds=request.app.state.settings.order_ttl_seconds),
    )
    session.add(order)
    _flush_order_with_retry(session, order, account)
    _reserve_stock_and_coupon(session, order, product, coupon, account, discount)

    if amount <= 0:
        return _complete_free_order(session, request, background, order, setting)

    chosen = _resolve_requested_channel(setting, body, request)
    return _open_channel_payment(request, session, order, setting, product, chosen)


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
