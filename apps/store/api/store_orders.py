"""商店接口的 orders 资源组（从 api/store.py 拆出）。

子路由不带前缀，由父路由在**原来的位置** include，以此保持注册顺序（FastAPI 按注册序匹配）。
只留「下单 / 查单 / 取消 / 归档」六条路由；账目口径（对账、入账、订单序列化）在 store_catalog.py。
"""
from __future__ import annotations

from __future__ import annotations

import json
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select

from apps.store.commerce import cashier, coupons, fulfill
from apps.store.core.deps import AuthedAccount, CurrentAccount, DbSession, SettingsDep, order_or_404
from apps.store.commerce.expiry import expire_stale_orders
from apps.store.core.models import (
    License,
    Order,
    Product,
)
from apps.store.core.schemas import (
    CreateOrderRequest,
)
from apps.store.security.security import (
    new_order_no,
    new_token,
    token_matches,
    utcnow,
)
from apps.store.core.serializers import (
    is_sold_out,
    order_payload,
)
from apps.store.ops import site_settings as site_config
from apps.store.payments.base import PaymentError


from .store_shared import (
    _base_url,
    _customer_for,
    _require_verified,
    logger,
)
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


router = APIRouter()


@router.get("/orders")
def list_orders(
    session: DbSession,
    account: AuthedAccount,
    settings: SettingsDep,
    limit: int = ACCOUNT_ORDER_PAGE_SIZE,
    offset: int = 0,
) -> dict:
    """账号中心的订单列表（分页）。

    必须带上 ``ordersTotal``：只给固定一批且没有总数的话，用户买满之后更早的订单
    就再也看不到了，界面也没有任何「还有更多」的提示 —— 看起来就像订单丢了。
    分页本身直接复用 ``_account_orders``，
    与账号中心首屏用同一口径（都过滤 ``archived_at``）。
    """
    _require_verified(account)
    expire_stale_orders(session, settings)
    size = max(1, min(int(limit or ACCOUNT_ORDER_PAGE_SIZE), 100))
    skip = max(0, int(offset or 0))
    orders = _account_orders(session, account, limit=size, offset=skip)
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
    # （payment.configured）的话，运营关掉支付后用户依然能下单并拿到二维码。
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
    #: 那两个数只用于商品卡片展示，而这段是下单热路径。
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
        # （store.js 的 primaryProductUnavailable）就挡不住直接调接口，
        # 且已有永久授权时也不必再买。
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
        # 路径；内联在结账里会让「哪些商品支持优惠码」与预览各写一遍，
        # 人工发卡商品在预览里打折、在下单时被静默忽略（用户多付钱且无提示）。
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
        payment_provider=(setting.payment_provider or request.app.state.settings.payment_provider),
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
        #: 也不能把订单发出去 —— 返回可重试的 503 而不是 500。
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
            # 被 flush 到库里（异常会让请求事务回滚）。
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
        logger.info("0 元订单直接开通 order=%s", order.order_no)
        return JSONResponse(order_payload(order), status_code=status.HTTP_201_CREATED)

    try:
        provider = request.app.state.resolve_payment_provider(setting)
    except PaymentError as error:
        # 渠道配置非法（例如后台把 payment_provider 写成了未知值）：此时绝不能
        # 静默回落模拟收银台，也不能把订单留在 pending 占着库存。
        order.status = "payment_failed"
        fulfill.release_order_effects(session, order=order, product=product)
        session.flush()
        logger.error("支付渠道解析失败 order=%s: %s", order.order_no, error)
        # B904：这条 503 是**转换**而不是新错误，原始异常（哪个渠道的配置、哪一步不合规）
        # 必须留在链上 —— 否则排查时只剩一句「渠道配置非法」，看不出是谁判的。
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error

    try:
        # 模拟收银台的页面凭证用短时票据（见 ``apps/store/commerce/cashier.py``），而不是把订单的
        # ``lookup_token`` 拼进 URL；真实渠道由渠道自己签名、链接里没有本店凭据，
        # 这里按渠道判一次纯粹是不给用不上的渠道白写一行票据。
        pay_token = cashier.issue_ticket(session, order) if provider.name == "mock" else None
        intent = provider.create_payment(
            order=order,
            settings=request.app.state.settings,
            setting=setting,
            base_url=_base_url(request),
            pay_token=pay_token,
        )
    except PaymentError as error:
        order.status = "payment_failed"
        fulfill.release_order_effects(session, order=order, product=product)
        session.flush()
        # B904：同上 —— 渠道拒单的原因（签名、参数、上游返回）要留在异常链上。
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error

    order.payment_payload_json = json.dumps(intent.payload, ensure_ascii=False)
    session.flush()

    return JSONResponse(order_payload(order), status_code=status.HTTP_201_CREATED)




@router.get("/orders/lookup/{order_no}")
def lookup_order(
    order_no: str, session: DbSession, token: str | None = None
) -> dict:
    order = order_or_404(session, order_no)
    if not token_matches(token, order.lookup_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="查询凭证不正确。")
    return order_payload(order)


@router.get("/orders/{order_no}")
def get_order(
    order_no: str, request: Request, session: DbSession, account: CurrentAccount
) -> Response:
    order = order_or_404(session, order_no)

    order_token = request.headers.get("x-order-token")
    authorized = (
        (account is not None and order.account_id == account.id)
        or token_matches(order_token, order.lookup_token)
    )
    if not authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该订单。")

    expire_stale_orders(session, request.app.state.settings)
    session.refresh(order)
    # 前端每 3 秒轮询一次；顺带向支付宝查单对账，兜住「异步通知没收到」的情况
    _reconcile_payment(session, request, order)
    response = JSONResponse(order_payload(order))
    response.headers["Cache-Control"] = "no-store"
    return response


@router.post("/orders/{order_no}/cancel")
def cancel_order(
    order_no: str, request: Request, session: DbSession, account: CurrentAccount
) -> dict:
    """买家自助取消待支付订单：关掉渠道侧收款码，归还库存预留与优惠码名额。

    与后台取消不同：后台只改本地状态，渠道侧那笔预下单交易还开着、二维码仍能继续付，所以这里在改状态之前
    先 ``close_payment``。关单结果分三种：``closed`` 照常取消并写 ``channel_closed_at``；``already_paid`` 绝
    不能取消（返回 409 交对账入账）；``PaymentError`` 仍本地取消、远端留给巡检重试。这里不要求邮箱已验证。
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
    setting = site_config.get_setting(session)
    try:
        provider = request.app.state.resolve_payment_provider(setting)
    except PaymentError:
        # 渠道名非法：没有可关的远端交易，按纯本地取消处理。
        provider = None
    channel_closed = False
    if provider is not None and getattr(provider, "name", "") == "alipay":
        try:
            outcome = provider.close_payment(request.app.state.settings, order)
        except PaymentError as error:
            logger.warning(
                "取消订单时关单失败订单号=%s 错误=%s（留给巡检重试）", order.order_no, error
            )
        else:
            if outcome.already_paid:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="该订单已有付款记录，无法取消；请稍后到账号中心查看授权。",
                )
            channel_closed = bool(outcome.closed)

    # ---- 阶段二：本地收尾（条件 UPDATE 抢单） ----
    product = session.get(Product, order.product_id) if order.product_id else None
    # 取消可能和支付回调、超时扫描同时发生：只有把订单从 pending 推走的那一个请求
    # 才负责释放副作用（库存预留 + 优惠码名额，见 close_pending_order），否则
    # 预留与名额会被释放两次。
    if not fulfill.close_pending_order(session, order=order, product=product):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="订单状态已变更，请刷新后重试。"
        )
    if channel_closed:
        #: 只有真的关掉了（或本来就已关闭）才写这个时间戳。关单报错时留空，
        #: 巡检下一轮会重试；写错方向是「把还开着的交易标成已关闭」，那笔钱
        #: 就再也关不掉了。
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
    #: 少这一道并不会泄露什么，但会让「未验证邮箱」的账号多出一条可写路径 ——
    #: 权限判断散落成「有的接口查了、有的没查」时，下一个接口照抄哪一份全凭运气。
    _require_verified(account)
    order = order_or_404(session, order_no)
    # 越权访问与「订单不存在」回同一个 404：不给出「这个单号存在」的旁路信息。
    if order.account_id != account.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")
    order.archived_at = utcnow()
    session.flush()
    return order_payload(order)
