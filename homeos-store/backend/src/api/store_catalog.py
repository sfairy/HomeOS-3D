"""商店接口的目录与账簿助手：商品/图片/优惠码、授权元信息、账号中心与订单账目。
"""
from __future__ import annotations

from datetime import timezone

from fastapi import HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..commerce import coupons, money
from ..commerce.expiry import expire_stale_orders
from ..core.models import (
    Account,
    Coupon,
    CouponRedemption,
    Customer,
    DeviceBinding,
    DeviceReleaseEvent,
    Entitlement,
    License,
    Order,
    Product,
    ProductImage,
    ReferralWallet,
    ReferralWithdrawal,
)
from ..core.schemas import (
    ReleaseDeviceRequest,
)
from ..core.serializers import (
    account_center_payload,
    binding_version,
    json_list,
    product_payload,
)
from ..ops import incidents
from ..ops import site_settings as site_config
from ..payments.reconcile import reconcile_channel_order
from ..security import password_gate
from ..security.security import (
    iso,
    utcnow,
)

HISTORY_PAGE_SIZE = 20
from .store_shared import logger, record_attempt_in_new_session


def _account_license_state(session, account: Account) -> tuple[bool, bool]:
    """返回 (是否有永久授权, 是否有期限授权)。"""
    rows = session.execute(
        select(License.validity_days, License.access_expires_at).where(
            License.account_id == account.id, License.active.is_(True)
        )
    ).all()
    moment = utcnow()
    permanent = False
    temporary = False
    for validity_days, access_expires_at in rows:
        expired = access_expires_at is not None and access_expires_at <= moment
        if expired:
            continue
        if validity_days is None and access_expires_at is None:
            permanent = True
        else:
            temporary = True
    return permanent, temporary
def _is_trial_product(product: Product) -> bool:
    """试用商品的判定口径与前台 ``store.js`` 的 ``isTrialProduct`` 完全一致。
    """
    return product.validity_days is not None
def _has_used_trial(session, account: Account) -> bool:
    """该账号是否已经买过（或被后台发过）试用授权。
    """
    found = session.execute(
        select(License.id)
        .where(License.account_id == account.id)
        .where(License.validity_days.is_not(None))
        .limit(1)
    ).first()
    return found is not None
def _resolve_upgrade_target(
    session, account: Account, upgrade_license_id: str | None
) -> License | None:
    """解析「试用升级为永久」要就地升级的那张授权。
    """
    normalized = (upgrade_license_id or "").strip()
    if not normalized:
        return None
    license = session.get(License, normalized)
    if license is None or license.account_id != account.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="要升级的授权不存在。")
    if not license.active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="要升级的授权已停用。")
    if license.validity_days is None and license.access_expires_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该授权已是永久授权，无需升级。")
    return license
def _product_or_404(session, product_id: str) -> Product:
    product = session.get(Product, product_id)
    if product is None or not product.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在或已下架。")
    return product
def _product_stats(session, product_ids=None) -> dict[str, dict]:
    """商品的「已售份数 / 拥有客户数」，只在商品卡片展示、不参与任何判定。
    """
    purchase_query = select(Order.product_id, func.count(Order.id)).where(
        Order.status == "fulfilled"
    )
    customer_query = select(
        License.product_id, func.count(func.distinct(License.customer_id))
    ).where(License.active.is_(True))
    if product_ids is not None:
        wanted = {item for item in product_ids if item}
        if not wanted:
            return {"purchase": {}, "customer": {}}
        purchase_query = purchase_query.where(Order.product_id.in_(wanted))
        customer_query = customer_query.where(License.product_id.in_(wanted))
    purchase_counts = dict(
        session.execute(purchase_query.group_by(Order.product_id)).all()
    )
    customer_counts = dict(
        session.execute(customer_query.group_by(License.product_id)).all()
    )
    return {
        "purchase": purchase_counts,
        "customer": customer_counts,
    }


def _image_map(session) -> dict[str, ProductImage]:
    return {
        image.product_id: image
        for image in session.scalars(select(ProductImage))
    }


def _bundled_map(session) -> dict[str, Product]:
    return {product.id: product for product in session.scalars(select(Product))}


def _product_item(session, product: Product) -> dict:
    stats = _product_stats(session, {product.id})
    image = session.scalars(
        select(ProductImage).where(ProductImage.product_id == product.id).limit(1)
    ).first()
    included_ids = [str(item) for item in json_list(product.included_product_ids_json)]
    bundled: dict[str, Product] = {}
    if included_ids:
        bundled = {
            item.id: item
            for item in session.scalars(select(Product).where(Product.id.in_(included_ids)))
        }
    return product_payload(
        product,
        image,
        bundled=bundled,
        customer_count=int(stats["customer"].get(product.id, 0)),
        purchase_count=int(stats["purchase"].get(product.id, 0)),
    )
def _evaluate_coupon(
    session, *, account: Account, product: Product, code: str
) -> tuple[Coupon, int]:
    normalized = (code or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请输入优惠码。")
    coupon = session.scalars(
        select(Coupon).where(func.lower(Coupon.code) == normalized.lower())
    ).first()
    if coupon is None or not coupon.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="优惠码无效。")

    moment = utcnow()
    if coupon.starts_at is not None and coupon.starts_at > moment:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="优惠码尚未开始。")
    if coupon.expires_at is not None and coupon.expires_at <= moment:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="优惠码已过期。")
    if coupon.max_redemptions is not None and int(coupon.redeemed_count or 0) >= coupon.max_redemptions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="优惠码已被领完。")
    if coupon.per_account_limit:
        # 「这个账号还用没用过该码」的判据收在 coupons.holds_slot_conditions()：
        used = session.execute(
            select(func.count(CouponRedemption.id))
            .outerjoin(Order, Order.id == CouponRedemption.order_id)
            .where(CouponRedemption.coupon_id == coupon.id)
            .where(CouponRedemption.account_id == account.id)
            .where(*coupons.holds_slot_conditions())
        ).scalar_one()
        if int(used or 0) >= int(coupon.per_account_limit):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="你已使用过该优惠码。")

    applicable = [str(item) for item in json_list(coupon.applicable_product_ids_json)]
    if applicable and product.id not in applicable:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该优惠码不适用于此商品。")

    price = int(product.price_cents or 0)
    if coupon.min_amount_cents and price < int(coupon.min_amount_cents):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"订单金额未达到优惠码门槛（{int(coupon.min_amount_cents) / 100:.2f} 元）。",
        )

    if coupon.discount_type == "fixed":
        discount = min(int(coupon.amount_cents or 0), price)
    else:
        discount = min(money.discount_centi(price, coupon.percent), price)
    return coupon, max(0, discount)
#: 人工发卡商品不支持优惠码的统一文案。下单与 ``/coupons/preview`` 必须**一字不差**：
_MANUAL_COUPON_DETAIL = "该商品为人工发卡，不支持使用优惠码。"
def _evaluate_coupon_limited(
    session, *, account: Account, product: Product, code: str
) -> tuple[Coupon, int]:
    """试算优惠码：口径校验 → 限流 → 试算 → 记失败 / 清计数，全部收在一处。
    """
    normalized = (code or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请输入优惠码。")
    if product.fulfillment_mode == "manual":
        # 人工发卡商品由运营手工核对后发码，折扣没法自动结算，因此明确不支持。
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=_MANUAL_COUPON_DETAIL
        )
    scope = f"coupon:{account.id}"
    if password_gate.retry_after_seconds(session, scope) > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="优惠码尝试次数过多，请稍后再试。",
        )
    try:
        coupon, discount = _evaluate_coupon(
            session, account=account, product=product, code=normalized
        )
    except HTTPException:
        record_attempt_in_new_session(session, scope)
        raise
    password_gate.clear(session, scope)
    return coupon, discount
def _flush_order(session, order: Order) -> str:
    try:
        with session.no_autoflush, session.begin_nested():
            session.flush()
    except IntegrityError as error:
        # SQLite 的报错只列列名、不带索引名（``UNIQUE constraint failed:
        message = str(getattr(error, "orig", error))
        if "UNIQUE constraint failed" not in message:
            raise
        if "orders.account_id" in message:
            return "pending"
        if "orders.order_no" in message:
            return "retry"
        raise
    return "ok"
def _license_meta(session, licenses: list[License]) -> dict[str, dict]:
    meta: dict[str, dict] = {}
    if not licenses:
        return meta
    license_ids = [item.id for item in licenses]
    customer_ids = {item.customer_id for item in licenses if item.customer_id}
    customers = {
        customer.id: customer
        for customer in session.scalars(select(Customer).where(Customer.id.in_(customer_ids)))
    }
    bindings: dict[str, DeviceBinding] = {}
    for binding in session.scalars(
        select(DeviceBinding)
        .where(DeviceBinding.license_id.in_(license_ids))
        .order_by(*DeviceBinding.liveness_order())
    ):
        # 有序之后，先到的那一行就是该授权最该显示的一行；非「存活」的一律跳过 ——
        if binding.is_live:
            bindings.setdefault(binding.license_id, binding)
    releases: dict[str, object] = {}
    for license_id, created_at in session.execute(
        select(DeviceReleaseEvent.license_id, func.max(DeviceReleaseEvent.created_at))
        .where(DeviceReleaseEvent.license_id.in_(license_ids))
        .group_by(DeviceReleaseEvent.license_id)
    ).all():
        releases[license_id] = created_at

    for license in licenses:
        meta[license.id] = {
            "customer": customers.get(license.customer_id),
            "binding": bindings.get(license.id),
            "last_released_at": releases.get(license.id),
        }
    return meta
def _account_licenses(session, account: Account) -> list[License]:
    return list(
        session.scalars(
            select(License)
            .where(License.account_id == account.id)
            .order_by(License.created_at.desc())
        )
    )
def _account_orders(
    session, account: Account, *, limit: int = 50, offset: int = 0
) -> list[Order]:
    return list(
        session.scalars(
            select(Order)
            .where(Order.account_id == account.id)
            # 用户主动「清除订单记录」写的就是 archived_at；不在这里过滤的话，
            .where(Order.archived_at.is_(None))
            .order_by(Order.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    )
def _account_orders_total(session, account: Account) -> int:
    """账号中心订单总数（与 ``_account_orders`` 同口径，含 ``archived_at`` 过滤）。
    """
    return int(
        session.execute(
            select(func.count())
            .select_from(Order)
            .where(Order.account_id == account.id)
            .where(Order.archived_at.is_(None))
        ).scalar_one()
        or 0
    )
def _center_payload(session, request: Request, account: Account) -> dict:
    setting = site_config.get_setting(session)
    expire_stale_orders(session, request.app.state.settings)
    licenses = _account_licenses(session, account)
    entitlements = list(
        session.scalars(
            select(Entitlement)
            .where(Entitlement.customer_id.in_([item.customer_id for item in licenses] or [""]))
            .order_by(Entitlement.created_at.desc())
        )
    )
    return account_center_payload(
        account=account,
        setting=setting,
        settings=request.app.state.settings,
        licenses=licenses,
        license_meta=_license_meta(session, licenses),
        entitlements=entitlements,
        orders=_account_orders(session, account),
        #: 总数单独查一次（与列表同口径），让前端能如实显示「还有 N 单未加载」；
        orders_total=_account_orders_total(session, account),
        has_used_trial=_has_used_trial(session, account),
    )
def _release_snapshot_conflict(payload: ReleaseDeviceRequest, binding) -> str | None:
    """校验解绑请求里的绑定快照，返回冲突说明（None 表示一致）。
    """
    has_snapshot = bool(
        payload.expected_binding_id
        or payload.expected_activated_at
        or payload.expected_binding_version
    )
    if binding is None:
        # 带了快照却查不到绑定：说明它在这几秒内被别处释放/换绑了。
        return "授权绑定的设备已变更，请刷新后重新确认。" if has_snapshot else None
    if payload.expected_binding_id and payload.expected_binding_id != binding.id:
        return "授权绑定的设备已变更，请刷新后重新确认。"
    expected_at = payload.expected_activated_at
    if expected_at is not None:
        # 前端发来的是 iso_z（带 Z 的 UTC 时刻），库内是 naive UTC。
        normalized = expected_at
        if normalized.tzinfo is not None:
            normalized = normalized.astimezone(timezone.utc).replace(tzinfo=None)
        actual = binding.activated_at
        if actual is None or abs((actual - normalized).total_seconds()) > 1:
            return "授权绑定的设备已变更，请刷新后重新确认。"
    if payload.expected_binding_version:
        if payload.expected_binding_version != binding_version(binding):
            return "授权绑定的设备已变更，请刷新后重新确认。"
    return None
# 订单
ACCOUNT_ORDER_PAGE_SIZE = 20
def _reconcile_payment(session, request: Request, order: Order) -> None:
    if order.status != "pending":
        return
    # 不在这里判渠道：``reconcile_channel_order`` 按**订单自己的** provider 决定能不能
    # 查单（运营把默认渠道换掉之后，在途的老订单仍然必须能被对账）。
    setting = site_config.get_setting(session)
    try:
        reconcile_channel_order(
            session,
            order=order,
            settings=request.app.state.settings,
            setting=setting,
        )
    except Exception as error:
        # 查单失败不影响这一轮响应（用户下次轮询还会再查），但它是「订单可能永远
        # 停在待支付」的早期信号，所以除了日志也计入计数。
        incidents.note("reconcile.poll", order_no=order.order_no, error=error)
        logger.exception("订单查单对账失败 order=%s", order.order_no)


# 邀请有礼
def _wallet_payload(wallet: ReferralWallet | None) -> dict | None:
    if wallet is None:
        return None
    #: 对外仍是「两位小数字符串」，与改动之前**逐字节一致** —— 厘正好是 1/100，
    return {
        "code": wallet.code,
        "balance": money.format_centi(wallet.balance_centi),
        "frozen": money.format_centi(wallet.frozen_centi),
        "earned": money.format_centi(wallet.earned_centi),
        "withdrawn": money.format_centi(wallet.withdrawn_centi),
    }


def _withdrawal_payload(withdrawal: ReferralWithdrawal) -> dict:
    return {
        "id": withdrawal.id,
        "points": money.format_centi(withdrawal.points_centi),
        "feePoints": money.format_centi(withdrawal.fee_points_centi),
        "feePercent": money.format_centi(withdrawal.fee_bps).rstrip("0").rstrip("."),
        "netPoints": money.format_centi(withdrawal.net_points_centi),
        "status": withdrawal.status,
        "createdAt": iso(withdrawal.created_at),
    }
