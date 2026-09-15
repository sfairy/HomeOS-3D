"""管理后台 API：``/store-admin/v1/*``。

参考站没有公开管理台，这里自建最小可用后台，让商店「可运营」：
商品、订单、激活码、设备绑定、优惠码、提现审核、站点配置、版本发布。
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session, aliased

from store import coupons, fulfill, referrals, site_settings as site_config
from store.api.store import (
    _expire_stale_orders,
    _image_map,
    _license_meta,
    _product_stats,
)
from store.deps import AdminAccount, DbSession, SettingsDep
from store.models import (
    Account,
    AccountSession,
    AuditLog,
    Coupon,
    CouponRedemption,
    Customer,
    DeviceBinding,
    DeviceReleaseEvent,
    EmailVerification,
    Entitlement,
    License,
    LicenseSession,
    LoginAttempt,
    Order,
    Product,
    ProductImage,
    RecoveryToken,
    ReferralLedger,
    ReferralWallet,
    ReferralWithdrawal,
    Release,
    StoreSetting,
    utcnow,
)
from store.schemas import (
    AdminAccountPatch,
    AdminCouponPatch,
    AdminCouponRequest,
    AdminEntitlementPatch,
    AdminEntitlementRequest,
    AdminLicensePatch,
    AdminLicenseRequest,
    AdminOrderActionRequest,
    AdminProductPatch,
    AdminProductRequest,
    AdminReleasePatch,
    AdminReleaseRequest,
    AdminSettingsRequest,
    AdminWalletAdjustRequest,
    AdminWithdrawalResolveRequest,
)
from store.security import (
    activation_code_hint,
    hash_password,
    is_valid_email,
    iso,
    new_uuid,
    normalize_email,
    utcnow,
)  # noqa: F401
from store.serializers import (
    license_payload,
    list_json,
    order_payload,
    product_payload,
)

logger = logging.getLogger("store.admin")

router = APIRouter(prefix="/store-admin/v1", tags=["admin"])


def _naive_utc(value: datetime | None) -> datetime | None:
    """把后台传入的时间统一成 naive UTC。

    库内时间列都是 naive（见 models.py 的注释），若把带时区的 datetime 直接
    写进去，读出来的比较逻辑会因 tzinfo 混用而行为不一致。这里统一收口。
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _admin_actor(admin: AdminAccount) -> str:
    return admin.email or admin.username or str(admin.id)


def _audit(session, actor: str, action: str, target: str = "", detail: str = "") -> None:
    session.add(AuditLog(actor=actor, action=action, target=target, detail=detail))
    session.flush()


def _product_or_404(session, product_id: str) -> Product:
    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在。")
    return product


def _order_or_404(session, order_no: str) -> Order:
    order = session.scalars(select(Order).where(Order.order_no == order_no)).first()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")
    return order


def _account_payload(session, account: Account) -> dict:
    """账号序列化。

    列表与「修改账号」共用同一份口径，避免同一行数据在两个接口里长得不一样。
    """
    wallet = session.scalars(
        select(ReferralWallet).where(ReferralWallet.account_id == account.id)
    ).first()
    return {
        "id": account.id,
        "email": account.email,
        "isAdmin": bool(account.is_admin),
        "isActive": bool(account.is_active),
        "emailVerifiedAt": iso(account.email_verified_at),
        "lastLoginAt": iso(account.last_login_at),
        "createdAt": iso(account.created_at),
        "referralCode": wallet.code if wallet else account.referral_code,
        "balance": f"{float(wallet.balance or 0.0):.2f}" if wallet else "0.00",
        "licenseCount": int(
            session.execute(
                select(func.count(License.id)).where(License.account_id == account.id)
            ).scalar_one()
            or 0
        ),
    }


def _drop_account_sessions(session, account_id: str) -> int:
    """清掉某个账号的全部登录会话，返回删除条数。"""
    records = list(
        session.scalars(select(AccountSession).where(AccountSession.account_id == account_id))
    )
    for record in records:
        session.delete(record)
    return len(records)


def _cooldown(setting: StoreSetting, settings: SettingsDep) -> int:
    return int(
        setting.device_release_cooldown_seconds
        if setting.device_release_cooldown_seconds is not None
        else settings.device_release_cooldown_seconds
    )


# --------------------------------------------------------------------------- #
# 概览
# --------------------------------------------------------------------------- #
@router.get("/overview")
def overview(session: DbSession, _admin: AdminAccount) -> dict:
    setting = site_config.get_setting(session)
    _expire_stale_orders(session, setting)
    moment = utcnow()

    def count(statement) -> int:
        return int(session.execute(statement).scalar_one() or 0)

    paid_total = count(
        select(func.coalesce(func.sum(Order.amount_cents), 0)).where(
            Order.status.in_(["fulfilled", "paid"])
        )
    )
    return {
        "accounts": count(select(func.count(Account.id))),
        "products": count(select(func.count(Product.id))),
        "licenses": count(select(func.count(License.id))),
        "activeLicenses": count(
            select(func.count(License.id)).where(License.active.is_(True))
        ),
        "pendingOrders": count(
            select(func.count(Order.id)).where(Order.status == "pending")
        ),
        "fulfilledOrders": count(
            select(func.count(Order.id)).where(Order.status == "fulfilled")
        ),
        "revenueCents": paid_total,
        "pendingWithdrawals": count(
            select(func.count(ReferralWithdrawal.id)).where(
                ReferralWithdrawal.status == "pending"
            )
        ),
        "deviceBindings": count(
            select(func.count(DeviceBinding.id)).where(DeviceBinding.active.is_(True))
        ),
        "serverTime": iso(moment),
        "maintenanceMode": bool(setting.maintenance_mode),
    }


# --------------------------------------------------------------------------- #
# 维护动作
# --------------------------------------------------------------------------- #
@router.post("/maintenance/recompute-stock")
def admin_recompute_stock(session: DbSession, admin: AdminAccount) -> dict:
    """按订单表重算各商品的 ``reserved_stock``。

    这个计数只是缓存，真实依据是仍处于 pending / paid 的订单条数。历史缺陷
    （对已取消订单履约）会重复释放预留，把缓存扣低并直接放开超卖——超卖以后
    没法自动回滚，只能人工处理。所以给运营一个显式入口把缓存拉回真实值。
    """
    changes = fulfill.recompute_reserved_stock(session)
    detail = "、".join(f"{pid} {delta:+d}" for pid, delta in changes.items()) or "无变化"
    _audit(session, _admin_actor(admin), "maintenance.recompute_stock", "", detail)
    return {"updated": len(changes), "changes": changes, "detail": detail}


# --------------------------------------------------------------------------- #
# 商品
# --------------------------------------------------------------------------- #
def _product_delete_refs(session) -> tuple[dict[str, int], dict[str, int]]:
    """统计每个商品被多少条授权 / 订单引用。

    这里的口径必须和 ``admin_delete_product`` 的守卫**完全一致**：不带
    ``active`` / ``status`` 过滤，因为守卫是「只要有任意一条引用就改为下架」。
    前台的 ``_product_stats`` 只数 fulfilled 订单和 active 授权，拿它当依据会让
    确认弹窗在「其实会被下架」的时候显示成「将被彻底删除」。
    """
    licenses = {
        product_id: int(count or 0)
        for product_id, count in session.execute(
            select(License.product_id, func.count(License.id)).group_by(License.product_id)
        ).all()
    }
    orders = {
        product_id: int(count or 0)
        for product_id, count in session.execute(
            select(Order.product_id, func.count(Order.id)).group_by(Order.product_id)
        ).all()
    }
    return licenses, orders


def _admin_product_context(session) -> dict:
    """一次性查出列表渲染所需的所有辅助数据，避免逐行 N+1。"""
    licenses, orders = _product_delete_refs(session)
    return {
        "stats": _product_stats(session),
        "images": _image_map(session),
        "bundled": {item.id: item for item in session.scalars(select(Product))},
        "licenses": licenses,
        "orders": orders,
    }


def _product_admin_payload(session, product: Product, context: dict | None = None) -> dict:
    context = context or _admin_product_context(session)
    payload = product_payload(
        product,
        context["images"].get(product.id),
        bundled=context["bundled"],
        customer_count=int(context["stats"]["customer"].get(product.id, 0)),
        purchase_count=int(context["stats"]["purchase"].get(product.id, 0)),
    )
    # 后台比前台多几个运营字段
    payload["originalPriceCents"] = product.original_price_cents
    payload["requiresLicense"] = bool(product.requires_license)
    payload["note"] = product.note
    # 把删除守卫的判定依据原样交给前端，确认弹窗才能如实预告「真删」还是「下架」
    payload["licenseCount"] = int(context["licenses"].get(product.id, 0))
    payload["orderCount"] = int(context["orders"].get(product.id, 0))
    return payload


@router.get("/products")
def admin_list_products(session: DbSession, _admin: AdminAccount) -> dict:
    context = _admin_product_context(session)
    products = session.scalars(
        select(Product).order_by(Product.sort_order, Product.created_at)
    )
    return {"items": [_product_admin_payload(session, product, context) for product in products]}


@router.post("/products")
def admin_create_product(
    payload: AdminProductRequest, session: DbSession, admin: AdminAccount
) -> dict:
    product = Product(
        name=payload.name,
        product_code=payload.product_code or "homeos",
        price_cents=payload.price_cents,
        original_price_cents=payload.original_price_cents,
        is_full_price=payload.is_full_price,
        validity_days=payload.validity_days,
        product_type=payload.product_type,
        feature_codes_json=list_json(payload.feature_codes),
        included_product_ids_json=list_json(payload.included_product_ids),
        package_contents_locked=payload.package_contents_locked,
        active=payload.active,
        note=payload.note,
        display_description=payload.display_description,
        badge_text=payload.badge_text,
        featured=payload.featured,
        sort_order=payload.sort_order,
        fulfillment_mode=payload.fulfillment_mode,
        stock_quantity=payload.stock_quantity,
        requires_license=payload.requires_license,
    )
    session.add(product)
    session.flush()
    _audit(session, _admin_actor(admin), "product.create", product.id, product.name)
    return _product_admin_payload(session, product)


@router.patch("/products/{product_id}")
def admin_update_product(
    product_id: str, payload: AdminProductPatch, session: DbSession, admin: AdminAccount
) -> dict:
    product = _product_or_404(session, product_id)
    mapping = {
        "name": "name",
        "product_code": "product_code",
        "price_cents": "price_cents",
        "original_price_cents": "original_price_cents",
        "is_full_price": "is_full_price",
        "validity_days": "validity_days",
        "product_type": "product_type",
        "package_contents_locked": "package_contents_locked",
        "active": "active",
        "note": "note",
        "display_description": "display_description",
        "badge_text": "badge_text",
        "featured": "featured",
        "sort_order": "sort_order",
        "fulfillment_mode": "fulfillment_mode",
        "stock_quantity": "stock_quantity",
        "requires_license": "requires_license",
    }
    data = payload.model_dump(exclude_unset=True)
    for field, column in mapping.items():
        if field in data:
            setattr(product, column, data[field])
    # product_code 是结算与授权里的产品标识，绝不能留空（留空会让下游按空标识建授权）
    if not product.product_code:
        product.product_code = "homeos"
    if "feature_codes" in data:
        product.feature_codes_json = list_json(data["feature_codes"] or [])
    if "included_product_ids" in data:
        product.included_product_ids_json = list_json(data["included_product_ids"] or [])
    session.flush()
    _audit(session, _admin_actor(admin), "product.update", product.id)
    return _product_admin_payload(session, product)


@router.delete("/products/{product_id}")
def admin_delete_product(
    product_id: str, session: DbSession, admin: AdminAccount, settings: SettingsDep
) -> dict:
    product = _product_or_404(session, product_id)

    # 有历史授权或订单的商品只下架，不做物理删除，避免历史数据悬空。
    # 注意 Order.product_id 是 NOT NULL 外键且没有 ondelete，而 SQLite 连接上开了
    # foreign_keys=ON，所以只要有订单引用该商品，物理删除就会撞 FK 约束直接 500。
    # 计数复用 _product_delete_refs，保证和列表接口暴露给前端的 licenseCount /
    # orderCount 是同一套口径，确认弹窗的预告不会和实际结果打架。
    license_counts, order_counts = _product_delete_refs(session)
    license_count = int(license_counts.get(product.id, 0))
    order_count = int(order_counts.get(product.id, 0))

    if license_count or order_count:
        product.active = False
        parts = []
        if license_count:
            parts.append(f"{license_count} 条授权")
        if order_count:
            parts.append(f"{order_count} 笔订单")
        reason = "、".join(parts) + "引用该商品，改为下架"
        session.flush()
        _audit(session, _admin_actor(admin), "product.deactivate", product.id, reason)
        return {
            "id": product.id,
            "deleted": False,
            "deactivated": True,
            "licenses": license_count,
            "orders": order_count,
            "reason": reason,
        }

    # 物理删除：数据库里 product_images 是 ON DELETE CASCADE，但磁盘上的图片文件
    # 不会被连带清理，这里先把路径收集出来，删完行之后再把文件删掉。
    image_paths = [
        settings.product_images_dir / image.path
        for image in session.scalars(
            select(ProductImage).where(ProductImage.product_id == product.id)
        )
        if image.path
    ]

    session.delete(product)
    session.flush()
    for path in image_paths:
        try:
            path.unlink(missing_ok=True)
        except OSError:  # pragma: no cover - 文件被占用/权限问题时不该影响删除结果
            logger.warning("商品图文件删除失败：%s", path)

    _audit(session, _admin_actor(admin), "product.delete", product.id, product.name)
    return {"id": product_id, "deleted": True, "deactivated": False}


@router.post("/products/{product_id}/image")
async def admin_upload_product_image(
    product_id: str,
    request: Request,
    session: DbSession,
    admin: AdminAccount,
    file: UploadFile = File(...),
) -> dict:
    product = _product_or_404(session, product_id)
    settings = request.app.state.settings
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[1].lower()[:8]
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
        suffix = ".png"
    folder = settings.product_images_dir
    folder.mkdir(parents=True, exist_ok=True)
    relative = f"{product.id}{suffix}"
    target = folder / relative
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="图片不能超过 8MB。")

    image = session.scalars(
        select(ProductImage).where(ProductImage.product_id == product.id)
    ).first()
    # 换扩展名（png → jpg）时旧文件名不再被引用，先删掉，否则磁盘上会留孤儿文件。
    # 路径是上传时自己按 product.id + 白名单后缀拼的，但仍然按目录边界校验一次。
    if image is not None and image.path != relative:
        root = folder.resolve()
        stale = (root / image.path).resolve()
        if stale != root and root in stale.parents and stale.is_file():
            try:
                stale.unlink()
            except OSError as exc:
                logger.warning("清理旧商品图失败 %s：%s", stale, exc)

    target.write_bytes(content)

    version = secrets.token_hex(6)
    if image is None:
        image = ProductImage(product_id=product.id, path=relative, version=version)
        session.add(image)
    else:
        image.path = relative
        image.version = version
    image.updated_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "product.image", product.id, relative)
    return {"id": product.id, "imageUrl": f"/store/v1/product-images/{product.id}?v={version}"}


# --------------------------------------------------------------------------- #
# 订单
# --------------------------------------------------------------------------- #
#: 允许被后台标记支付 / 履约的状态，与 ``fulfill.RESERVING_STATUSES`` 对齐：
#: 只有仍持有库存预留的订单才谈得上「入账」。终态订单一律拒绝——
#: cancelled / expired 的库存与优惠码名额早已释放，refunded 的授权也已收回，
#: 对它们履约等于凭空发一张可用授权，还会重复扣减预留并造成超卖。
#: 钱确实到账的「复活」场景由支付宝结算路径处理，不走后台接口。
_FULFILLABLE_STATUSES = fulfill.RESERVING_STATUSES

#: 订单状态中文口径，与前端 ``admin.html`` 的 ORDER_STATUS 保持一致，
#: 避免「后台弹窗说 cancelled、页面显示已取消」这种同一状态两套说法。
_ORDER_STATUS_LABELS = {
    "pending": "待付款",
    "paid": "已付款",
    "fulfilled": "已完成",
    "cancelled": "已取消",
    "expired": "已过期",
    "payment_failed": "下单失败",
    "fulfillment_failed": "处理中",
    "refunded": "已退款",
}


def _status_label(status: str) -> str:
    return _ORDER_STATUS_LABELS.get(status, status)


@router.get("/orders")
def admin_list_orders(
    session: DbSession,
    _admin: AdminAccount,
    status_filter: str | None = None,
    keyword: str | None = None,
    limit: int = 100,
) -> dict:
    setting = site_config.get_setting(session)
    _expire_stale_orders(session, setting)
    statement = select(Order).order_by(Order.created_at.desc()).limit(max(1, min(limit, 500)))
    if status_filter:
        statement = statement.where(Order.status == status_filter)
    if keyword:
        like = f"%{keyword.strip()}%"
        statement = statement.where(
            or_(Order.order_no.like(like), Order.email.like(like))
        )
    return {"items": [order_payload(order) for order in session.scalars(statement)]}


@router.post("/orders/{order_no}/mark-paid")
def admin_mark_paid(
    order_no: str, session: DbSession, admin: AdminAccount
) -> dict:
    setting = site_config.get_setting(session)
    order = _order_or_404(session, order_no)
    if order.status == "fulfilled":
        return order_payload(order)
    # payment_failed 不在这里补标记：该状态在支付失败时已释放库存预留与优惠码
    # 名额，再标记支付并履约会造成二次扣减。
    if order.status not in _FULFILLABLE_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"订单状态为 {order.status}，无法标记支付。")
    order.status = "paid"
    order.paid_at = utcnow()
    order.payment_provider = order.payment_provider or "manual"
    session.flush()
    _audit(session, _admin_actor(admin), "order.mark_paid", order.order_no)
    # 自动发卡商品立刻履约（发码 / 追加增量包 / 邀请奖励）。
    # 手动发卡商品只标记已支付，把发码留给「履约」按钮——两条支付路径必须一致：
    # 真实支付宝到账（settle_paid_order）也是见到 manual 就停在 paid 等人核对，
    # 后台这边一按就发码的话，"人工发卡"这道闸门等于不存在。
    if order.fulfillment_mode != "manual":
        fulfill.fulfill_order(session, order=order, setting=setting)
    session.refresh(order)
    return order_payload(order)


@router.post("/orders/{order_no}/fulfill")
def admin_fulfill(order_no: str, session: DbSession, admin: AdminAccount) -> dict:
    setting = site_config.get_setting(session)
    order = _order_or_404(session, order_no)
    if order.status == "fulfilled":
        return order_payload(order)
    # 终态订单不能履约：cancelled / expired 的库存与优惠码名额早已释放，
    # refunded 的授权已收回。放行会凭空发码，并重复扣减预留造成超卖。
    if order.status not in _FULFILLABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"订单状态为{_status_label(order.status)}，不能履约；"
                "只有待付款或已付款的订单可以履约。"
            ),
        )
    if order.paid_at is None:
        order.paid_at = utcnow()
    fulfill.fulfill_order(session, order=order, setting=setting)
    session.refresh(order)
    _audit(session, _admin_actor(admin), "order.fulfill", order.order_no)
    return order_payload(order)


@router.post("/orders/{order_no}/refund")
def admin_refund(
    order_no: str, payload: AdminOrderActionRequest, session: DbSession, admin: AdminAccount
) -> dict:
    setting = site_config.get_setting(session)
    order = _order_or_404(session, order_no)
    if order.status not in {"paid", "fulfilled"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"订单状态为 {order.status}，无法退款。")

    # 退的是「还没发码」的那一单时，库存预留还挂在这张订单上（见 RESERVING_STATUSES），
    # 必须显式还回去：离开 paid 之后就没人再管它了，漏掉这一步等于这一件货永久卖不出去。
    # 已履约的订单在发码时就把预留释放、库存扣掉了，这里再还一次会把货凭空变多。
    if order.status == "paid":
        product = session.get(Product, order.product_id) if order.product_id else None
        fulfill.release_reserved_stock(session, product, 1)

    # 收回授权：停用订单产生的激活码与权益
    for license in session.scalars(select(License).where(License.order_id == order.id)):
        license.active = False
        license.revoked_at = utcnow()
        # 同 license.deactivate：多设备绑定要全部释放，不能只处理 .first()
        for binding in session.scalars(
            select(DeviceBinding).where(DeviceBinding.license_id == license.id)
        ):
            binding.active = False
            binding.released_at = utcnow()
    for entitlement in session.scalars(
        select(Entitlement).where(Entitlement.product_id == order.product_id)
    ):
        if entitlement.license_id and entitlement.license_id == order.license_id:
            entitlement.active = False

    referrals.reverse_order_reward(session, order=order, note=f"订单 {order.order_no} 退款，奖励退回")
    order.status = "refunded"
    order.refunded_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "order.refund", order.order_no, payload.note)
    session.refresh(order)
    return order_payload(order)


@router.post("/orders/{order_no}/cancel")
def admin_cancel(
    order_no: str, payload: AdminOrderActionRequest, session: DbSession, admin: AdminAccount
) -> dict:
    order = _order_or_404(session, order_no)
    if order.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="只有待支付订单可以取消。")
    product = session.get(Product, order.product_id) if order.product_id else None
    order.status = "cancelled"
    order.cancelled_at = utcnow()
    fulfill.release_reserved_stock(session, product, 1)
    # 与 _expire_stale_orders 对齐：取消要同时归还优惠码名额。漏掉这一步会让
    # redeemed_count 只增不减，而它参与 max_redemptions 校验，名额会被永久占用，
    # 用户之后下单会收到「优惠码已被领完」。
    coupons.release_coupon(session, order)
    session.flush()
    _audit(session, _admin_actor(admin), "order.cancel", order.order_no, payload.note)
    session.refresh(order)
    return order_payload(order)


@router.delete("/orders/{order_no}")
def admin_delete_order(order_no: str, session: DbSession, admin: AdminAccount) -> dict:
    """删除订单（用于清理测试单 / 垃圾单）。

    订单是营收与授权来源的凭证，所以只允许删除**确定没有产生授权**的历史单据：
      · 状态必须是终态 ``cancelled`` 或 ``expired``（待支付单请先取消，才会释放库存）；
      · 不能关联任何授权（``license_id`` 与 ``target_license_id`` 都为空）。

    已付款/已履约的订单请走「退款」，用退款保留资金流水的可追溯性。
    """
    order = _order_or_404(session, order_no)

    if order.status not in {"cancelled", "expired"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"状态为 {order.status} 的订单不能删除；待支付请先取消，已支付请走退款。",
        )
    if order.license_id or order.target_license_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该订单已关联授权，不能删除；如需收回授权请使用退款。",
        )

    session.delete(order)
    session.flush()
    _audit(session, _admin_actor(admin), "order.delete", order_no, f"状态 {order.status}")
    return {"orderNo": order_no, "deleted": True}


# --------------------------------------------------------------------------- #
# 激活码
# --------------------------------------------------------------------------- #
@router.get("/licenses")
def admin_list_licenses(
    session: DbSession,
    settings: SettingsDep,
    _admin: AdminAccount,
    keyword: str | None = None,
    limit: int = 200,
) -> dict:
    statement = select(License).order_by(License.created_at.desc()).limit(max(1, min(limit, 500)))
    if keyword:
        like = f"%{keyword.strip()}%"
        statement = statement.where(
            or_(License.activation_code.like(like), License.code_hint.like(like))
        )
    licenses = list(session.scalars(statement))
    meta = _license_meta(session, licenses)
    setting = site_config.get_setting(session)
    return {
        "items": [
            license_payload(
                license,
                customer=meta.get(license.id, {}).get("customer"),
                binding=meta.get(license.id, {}).get("binding"),
                cooldown_seconds=_cooldown(setting, settings),
                last_released_at=meta.get(license.id, {}).get("last_released_at"),
            )
            for license in licenses
        ]
    }


@router.post("/licenses")
def admin_issue_license(
    payload: AdminLicenseRequest, session: DbSession, admin: AdminAccount
) -> dict:
    product = _product_or_404(session, payload.product_id)
    email = payload.email.strip().lower()
    account = session.scalars(select(Account).where(func.lower(Account.email) == email)).first()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="该邮箱尚未注册账号。")
    customer = session.scalars(
        select(Customer).where(Customer.account_id == account.id)
    ).first()
    if customer is None:
        customer = Customer(account_id=account.id, email=email, name=email)
        session.add(customer)
        session.flush()

    from store.fulfill import _unique_activation_code

    moment = utcnow()
    validity_days = payload.validity_days if payload.validity_days is not None else product.validity_days
    code = _unique_activation_code(session)
    license = License(
        activation_code=code,
        code_hint=activation_code_hint(code),
        customer_id=customer.id,
        account_id=account.id,
        product_id=product.id,
        product_name=product.name,
        product_type=product.product_type,
        price_cents=product.price_cents,
        validity_days=validity_days,
        issuance_source="manual",
        active=True,
        issued_at=moment,
        access_started_at=moment,
        access_expires_at=(moment + timedelta(days=int(validity_days)) if validity_days else None),
    )
    session.add(license)
    session.flush()
    _audit(session, _admin_actor(admin), "license.issue", license.id, code)
    return {"activationCodeId": license.id, "activationCode": code, "email": email}


@router.post("/licenses/{license_id}/deactivate")
def admin_deactivate_license(
    license_id: str, payload: AdminOrderActionRequest, session: DbSession, admin: AdminAccount
) -> dict:
    license = session.get(License, license_id)
    if license is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")
    license.active = False
    license.revoked_at = utcnow()
    # 一条授权可能在多台设备上绑定过（每个 instance_id 一行），停用必须把它们
    # 全部释放。只释放 .first() 会留下仍为 active 的绑定行，既让客户端以为还
    # 能用，也会让「删除授权」的活跃绑定守卫形同虚设。
    for binding in session.scalars(
        select(DeviceBinding).where(DeviceBinding.license_id == license.id)
    ):
        binding.active = False
        binding.released_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "license.deactivate", license.id, payload.note)
    return {"activationCodeId": license.id, "active": False}


@router.post("/licenses/{license_id}/activate")
def admin_activate_license(license_id: str, session: DbSession, admin: AdminAccount) -> dict:
    license = session.get(License, license_id)
    if license is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")
    license.active = True
    license.revoked_at = None
    session.flush()
    _audit(session, _admin_actor(admin), "license.activate", license.id)
    return {"activationCodeId": license.id, "active": True}


@router.delete("/licenses/{license_id}")
def admin_delete_license(license_id: str, session: DbSession, admin: AdminAccount) -> dict:
    """彻底删除一条授权（含级联的权益、绑定、租约与会话）。

    这是不可恢复操作，所以两道守卫：
      1. 必须**先停用**——强制「停用 → 再删」两步，避免误点直接抹掉在用授权；
      2. 不允许存在仍然活跃的设备绑定（说明还有设备在用）。
    ``orders.license_id`` / ``orders.target_license_id`` 是 ON DELETE SET NULL，
    订单本身会保留，只是不再指向这条授权。
    """
    license = session.get(License, license_id)
    if license is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")

    if license.active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="请先停用该授权，确认无设备在用后再删除。",
        )

    active_binding = session.scalars(
        select(DeviceBinding).where(
            DeviceBinding.license_id == license.id, DeviceBinding.active.is_(True)
        )
    ).first()
    if active_binding is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该授权仍有活跃设备绑定，请先强制解绑。",
        )

    code = license.activation_code
    binding_count = int(
        session.execute(
            select(func.count(DeviceBinding.id)).where(DeviceBinding.license_id == license.id)
        ).scalar_one()
        or 0
    )
    session.delete(license)
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "license.delete",
        license_id,
        f"{code}（连带清理 {binding_count} 条绑定记录）",
    )
    return {"activationCodeId": license_id, "deleted": True, "bindings": binding_count}


# --------------------------------------------------------------------------- #
# 设备绑定
# --------------------------------------------------------------------------- #
@router.get("/bindings")
def admin_list_bindings(
    session: DbSession, _admin: AdminAccount, active_only: bool = False
) -> dict:
    statement = select(DeviceBinding).order_by(DeviceBinding.updated_at.desc())
    if active_only:
        statement = statement.where(DeviceBinding.active.is_(True))
    items = []
    for binding in session.scalars(statement):
        license = session.get(License, binding.license_id)
        items.append(
            {
                "bindingId": binding.id,
                "licenseId": binding.license_id,
                "activationCodeHint": license.code_hint if license else None,
                "instanceId": binding.instance_id,
                "clientVersion": binding.client_version,
                "lastIp": binding.last_ip,
                "active": bool(binding.active),
                "activatedAt": iso(binding.activated_at),
                "lastHeartbeatAt": iso(binding.last_heartbeat_at),
                "releasedAt": iso(binding.released_at),
            }
        )
    return {"items": items}


@router.post("/bindings/{binding_id}/release")
def admin_release_binding(
    binding_id: str, payload: AdminOrderActionRequest, session: DbSession, admin: AdminAccount
) -> dict:
    binding = session.get(DeviceBinding, binding_id)
    if binding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="设备绑定不存在。")
    license = session.get(License, binding.license_id)
    account_id = license.account_id if license is not None else None
    binding.active = False
    binding.released_at = utcnow()
    session.add(
        DeviceReleaseEvent(
            license_id=binding.license_id,
            account_id=account_id,
            instance_id=binding.instance_id,
            source="admin",
        )
    )
    if account_id:
        account = session.get(Account, account_id)
        if account is not None:
            account.last_device_release_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "binding.release", binding.id, payload.note)
    return {"bindingId": binding.id, "released": True}


# --------------------------------------------------------------------------- #
# 优惠码
# --------------------------------------------------------------------------- #
@router.get("/coupons")
def admin_list_coupons(session: DbSession, _admin: AdminAccount) -> dict:
    counts = _coupon_redemption_counts(session)
    items = [
        _coupon_payload(coupon, counts.get(coupon.id, 0))
        for coupon in session.scalars(select(Coupon).order_by(Coupon.created_at.desc()))
    ]
    return {"items": items}


def _coupon_redemption_counts(session) -> dict[str, int]:
    """按核销记录表统计每个优惠码的实际用量。

    刻意不用 ``Coupon.redeemed_count`` 这个反规范化计数列：它是发放时的快照，
    一旦和 ``coupon_redemptions`` 漂移，删除守卫（数记录）与界面提示（读计数列）
    就会各说各话——确认弹窗写着「尚未被使用」，点下去却只停用。
    """
    return {
        coupon_id: int(count or 0)
        for coupon_id, count in session.execute(
            select(CouponRedemption.coupon_id, func.count(CouponRedemption.id)).group_by(
                CouponRedemption.coupon_id
            )
        ).all()
    }


def _coupon_redemption_count(session, coupon_id: str) -> int:
    """单个优惠码的核销数（供非列表场景复用，避免全表 group by）。"""
    return int(
        session.execute(
            select(func.count(CouponRedemption.id)).where(
                CouponRedemption.coupon_id == coupon_id
            )
        ).scalar_one()
        or 0
    )


def _coupon_payload(coupon: Coupon, redemption_count: int) -> dict:
    """优惠码的后台视图。

    两个「用量」字段刻意分开，因为它们回答的是两个不同问题：

    * ``redeemedCount``（读 ``coupon.redeemed_count`` 计数列）—— **此刻还被占用
      多少名额**，参与 ``max_redemptions`` 校验。取消/退款会让它回落。
    * ``redemptionCount``（数 ``coupon_redemptions`` 记录）—— **历史上被占用过
      多少次**，作为对账凭证永久保留，也是删除守卫的判据。

    把两者混成一个字段，就会出现「确认弹窗写着没人用过、点下去却只停用」。
    """
    return {
        "id": coupon.id,
        "code": coupon.code,
        "description": coupon.description,
        "discountType": coupon.discount_type,
        "percent": float(coupon.percent or 0.0),
        "amountCents": int(coupon.amount_cents or 0),
        "minAmountCents": int(coupon.min_amount_cents or 0),
        "maxRedemptions": coupon.max_redemptions,
        "redeemedCount": int(coupon.redeemed_count or 0),
        "redemptionCount": int(redemption_count),
        "perAccountLimit": int(coupon.per_account_limit or 0),
        "applicableProductIds": [
            str(item) for item in list_json(coupon.applicable_product_ids_json)
        ],
        "startsAt": iso(coupon.starts_at),
        "expiresAt": iso(coupon.expires_at),
        "active": bool(coupon.active),
        "createdAt": iso(coupon.created_at),
    }


@router.post("/coupons")
def admin_create_coupon(
    payload: AdminCouponRequest, session: DbSession, admin: AdminAccount
) -> dict:
    code = payload.code.strip().upper()
    if payload.discount_type not in coupons.DISCOUNT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"折扣类型只能是 {'/'.join(sorted(coupons.DISCOUNT_TYPES))}。",
        )
    exists = session.scalars(select(Coupon).where(func.upper(Coupon.code) == code)).first()
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="优惠码已存在。")
    coupon = Coupon(
        code=code,
        description=payload.description,
        discount_type=payload.discount_type,
        percent=payload.percent,
        amount_cents=payload.amount_cents,
        min_amount_cents=payload.min_amount_cents,
        max_redemptions=payload.max_redemptions,
        per_account_limit=payload.per_account_limit,
        starts_at=_naive_utc(payload.starts_at),
        expires_at=_naive_utc(payload.expires_at),
        applicable_product_ids_json=list_json(payload.applicable_product_ids),
        active=payload.active,
    )
    if coupon.starts_at and coupon.expires_at and coupon.starts_at >= coupon.expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="开始时间必须早于结束时间。"
        )
    session.add(coupon)
    session.flush()
    _audit(session, _admin_actor(admin), "coupon.create", coupon.id, code)
    return _coupon_payload(coupon, 0)


@router.delete("/coupons/{coupon_id}")
def admin_delete_coupon(coupon_id: str, session: DbSession, admin: AdminAccount) -> dict:
    """删除优惠码。

    ``coupon_redemptions`` 对优惠码是 ON DELETE CASCADE，物理删会把兑换历史一起
    抹掉。所以只有**从未被使用**的优惠码才真删；用过的只能停用，保住核销记录。
    """
    coupon = session.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="优惠码不存在。")

    redemption_count = _coupon_redemption_count(session, coupon.id)
    if redemption_count:
        coupon.active = False
        reason = f"该优惠码已被使用 {redemption_count} 次，已停用而非删除"
        session.flush()
        _audit(session, _admin_actor(admin), "coupon.deactivate", coupon.id, reason)
        return {
            "id": coupon.id,
            "deleted": False,
            "deactivated": True,
            "reason": reason,
            "redemptions": redemption_count,
        }

    code = coupon.code
    session.delete(coupon)
    session.flush()
    _audit(session, _admin_actor(admin), "coupon.delete", coupon_id, code)
    return {"id": coupon_id, "deleted": True, "deactivated": False}


@router.patch("/coupons/{coupon_id}")
def admin_patch_coupon(
    coupon_id: str, payload: AdminCouponPatch, session: DbSession, admin: AdminAccount
) -> dict:
    """编辑优惠码（含启用 / 停用）。

    除了 ``code`` 本身（它是对外承诺，改了会让已发放的码失效）以外，
    其余字段都允许修正：折扣、门槛、名额、有效期、适用范围。
    核销记录不会被删除，``redeemed_count`` 始终是唯一的用量口径。
    """
    coupon = session.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="优惠码不存在。")

    data = payload.model_dump(exclude_unset=True)
    if "discount_type" in data and data["discount_type"] not in coupons.DISCOUNT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"折扣类型只能是 {'/'.join(sorted(coupons.DISCOUNT_TYPES))}。",
        )

    # 换了折扣类型就把另一种折扣的残留值清零。两个字段同时有非零值时，结算只认
    # discount_type，但后台会把两个数字都显示出来，运营看不出哪个在生效。
    # 两个列都是 NOT NULL 且默认 0，所以这里是归零、不是置空。
    if "discount_type" in data:
        if data["discount_type"] == "fixed":
            data.setdefault("percent", 0.0)
        else:
            data.setdefault("amount_cents", 0)

    # 名额是反规范化的用量计数，改到低于已核销数会让"剩余名额"变成负数，
    # 表面上像还能用、实际永远校验不过。这种情况直接拒绝并说明该怎么改。
    redeemed = _coupon_redemption_count(session, coupon.id)
    if data.get("max_redemptions") is not None and int(data["max_redemptions"]) < redeemed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"该优惠码已核销 {redeemed} 次，名额不能改到 {data['max_redemptions']} 以下。"
                "想立刻停发请直接停用。"
            ),
        )

    mapping = {
        "description": "description",
        "discount_type": "discount_type",
        "percent": "percent",
        "amount_cents": "amount_cents",
        "min_amount_cents": "min_amount_cents",
        "max_redemptions": "max_redemptions",
        "per_account_limit": "per_account_limit",
        "active": "active",
    }
    changed: list[str] = []
    for field, column in mapping.items():
        if field in data:
            setattr(coupon, column, data[field])
            changed.append(field)
    for field, column in (("starts_at", "starts_at"), ("expires_at", "expires_at")):
        if field in data:
            setattr(coupon, column, _naive_utc(data[field]))
            changed.append(field)
    if "applicable_product_ids" in data:
        coupon.applicable_product_ids_json = list_json(data["applicable_product_ids"])
        changed.append("applicable_product_ids")

    if not changed:
        return _coupon_payload(coupon, _coupon_redemption_count(session, coupon.id))

    if coupon.starts_at and coupon.expires_at and coupon.starts_at >= coupon.expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="开始时间必须早于结束时间。"
        )

    session.flush()
    _audit(session, _admin_actor(admin), "coupon.update", coupon.id, ",".join(sorted(changed)))
    return _coupon_payload(coupon, _coupon_redemption_count(session, coupon.id))


# --------------------------------------------------------------------------- #
# 提现审核
# --------------------------------------------------------------------------- #
@router.get("/withdrawals")
def admin_list_withdrawals(
    session: DbSession, _admin: AdminAccount, status_filter: str | None = None
) -> dict:
    statement = select(ReferralWithdrawal).order_by(ReferralWithdrawal.created_at.desc())
    if status_filter:
        statement = statement.where(ReferralWithdrawal.status == status_filter)
    items = []
    for row in session.scalars(statement):
        account = session.get(Account, row.account_id)
        items.append(
            {
                "id": row.id,
                "accountId": row.account_id,
                "email": account.email if account else None,
                "points": f"{float(row.points or 0.0):.2f}",
                "feePoints": f"{float(row.fee_points or 0.0):.2f}",
                "feePercent": float(row.fee_percent or 0.0),
                "netPoints": f"{float(row.net_points or 0.0):.2f}",
                "qq": row.qq,
                "status": row.status,
                "note": row.note,
                "createdAt": iso(row.created_at),
                "resolvedAt": iso(row.resolved_at),
            }
        )
    return {"items": items}


@router.post("/withdrawals/{withdrawal_id}/resolve")
def admin_resolve_withdrawal(
    withdrawal_id: str,
    payload: AdminWithdrawalResolveRequest,
    session: DbSession,
    admin: AdminAccount,
) -> dict:
    withdrawal = session.get(ReferralWithdrawal, withdrawal_id)
    if withdrawal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="提现申请不存在。")
    if withdrawal.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该申请已处理。")
    referrals.resolve_withdrawal(
        session, withdrawal, approve=payload.approve, note=payload.note
    )
    _audit(
        session,
        _admin_actor(admin),
        "withdrawal.resolve",
        withdrawal.id,
        f"approve={payload.approve}",
    )
    return {"id": withdrawal.id, "status": withdrawal.status}


@router.delete("/withdrawals/{withdrawal_id}")
def admin_delete_withdrawal(
    withdrawal_id: str, session: DbSession, admin: AdminAccount
) -> dict:
    """删除提现申请记录（仅限**已结算**的申请）。

    待审核（pending）的申请带着被冻结的积分，删掉会让冻结额度对不上账，
    所以必须先通过或驳回。已结算的申请删除后，积分流水（referral_ledger）
    仍然保留，资金审计不受影响。
    """
    withdrawal = session.get(ReferralWithdrawal, withdrawal_id)
    if withdrawal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="提现申请不存在。")

    if withdrawal.status == "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="待审核的申请不能删除；请先通过或驳回，以退回/结算冻结积分。",
        )

    status_label = withdrawal.status
    points = float(withdrawal.points or 0.0)
    session.delete(withdrawal)
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "withdrawal.delete",
        withdrawal_id,
        f"{status_label} · {points:.2f} 积分",
    )
    return {"id": withdrawal_id, "deleted": True}


# --------------------------------------------------------------------------- #
# 站点配置
# --------------------------------------------------------------------------- #
@router.get("/settings")
def admin_get_settings(session: DbSession, _admin: AdminAccount, settings: SettingsDep) -> dict:
    setting = site_config.get_setting(session)
    return site_config.site_configuration_payload(setting, settings) | {
        "referral": site_config.referral_settings_payload(setting),
        "deviceReleaseCooldownSeconds": setting.device_release_cooldown_seconds,
        "announcement": setting.announcement,
    }


@router.put("/settings")
def admin_update_settings(
    payload: AdminSettingsRequest,
    session: DbSession,
    admin: AdminAccount,
    settings: SettingsDep,
) -> dict:
    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "site_name": "site_name",
        "site_title": "site_title",
        "description": "description",
        "announcement": "announcement",
        "support_email": "support_email",
        # logo_url 留空表示回到默认标识（见 site_settings.DEFAULT_LOGO_URL）
        "logo_url": "logo_url",
        "maintenance_mode": "maintenance_mode",
        "maintenance_message": "maintenance_message",
        "payment_provider": "payment_provider",
        "payment_display_name": "payment_display_name",
        "payment_enabled": "payment_enabled",
        "payment_transaction_description": "payment_transaction_description",
        "payment_merchant_order_template": "payment_merchant_order_template",
        "referral_enabled": "referral_enabled",
        "referral_rate_percent": "referral_rate_percent",
        "referral_withdrawal_fee_percent": "referral_withdrawal_fee_percent",
        "referral_withdrawal_min_points": "referral_withdrawal_min_points",
        "referral_qq_group": "referral_qq_group",
        "referral_qq_url": "referral_qq_url",
        "device_release_cooldown_seconds": "device_release_cooldown_seconds",
    }
    updates = {column: data[field] for field, column in mapping.items() if field in data}
    if "logo_url" in updates:
        updates["logo_url"] = (
            str(updates["logo_url"] or "").strip() or site_config.DEFAULT_LOGO_URL
        )
    setting = site_config.update_setting(session, **updates)
    _audit(session, _admin_actor(admin), "settings.update", "1", ",".join(sorted(updates)))
    return site_config.site_configuration_payload(setting, settings) | {
        "referral": site_config.referral_settings_payload(setting),
        "deviceReleaseCooldownSeconds": setting.device_release_cooldown_seconds,
        "announcement": setting.announcement,
    }


# --------------------------------------------------------------------------- #
# 版本发布
# --------------------------------------------------------------------------- #
@router.get("/releases")
def admin_list_releases(session: DbSession, _admin: AdminAccount) -> dict:
    items = [
        _release_payload(release)
        for release in session.scalars(select(Release).order_by(Release.created_at.desc()))
    ]
    return {"items": items}


@router.post("/releases")
def admin_create_release(
    payload: AdminReleaseRequest, session: DbSession, admin: AdminAccount
) -> dict:
    release = Release(
        product=payload.product or "homeos",
        channel=payload.channel or "docker",
        version=payload.version,
        release_date=payload.release_date or "",
        upgrade_notes=payload.upgrade_notes or "",
    )
    session.add(release)
    session.flush()
    _audit(session, _admin_actor(admin), "release.create", release.id, release.version)
    return {
        "id": release.id,
        "product": release.product,
        "channel": release.channel,
        "version": release.version,
        "releaseDate": release.release_date,
        "upgradeNotes": release.upgrade_notes,
    }


@router.delete("/releases/{release_id}")
def admin_delete_release(release_id: str, session: DbSession, admin: AdminAccount) -> dict:
    """删除版本记录。

    ``releases`` 是叶子表（没有任何外键指向它），物理删除不会影响授权数据；
    客户端的「检查更新」会自动回退到次新的那条记录。
    """
    release = session.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本记录不存在。")
    label = f"{release.product}/{release.channel} {release.version}"
    session.delete(release)
    session.flush()
    _audit(session, _admin_actor(admin), "release.delete", release_id, label)
    return {"id": release_id, "deleted": True, "label": label}


# --------------------------------------------------------------------------- #
# 账号
# --------------------------------------------------------------------------- #
@router.get("/accounts")
def admin_list_accounts(
    session: DbSession, _admin: AdminAccount, keyword: str | None = None, limit: int = 100
) -> dict:
    statement = select(Account).order_by(Account.created_at.desc()).limit(max(1, min(limit, 500)))
    if keyword:
        statement = statement.where(Account.email.like(f"%{keyword.strip()}%"))
    return {"items": [_account_payload(session, account) for account in session.scalars(statement)]}


@router.post("/accounts/{account_id}/activate")
def admin_activate_account(account_id: str, session: DbSession, admin: AdminAccount) -> dict:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在。")
    account.is_active = True
    session.flush()
    _audit(session, _admin_actor(admin), "account.activate", account.id)
    return {"id": account.id, "isActive": True}


@router.post("/accounts/{account_id}/deactivate")
def admin_deactivate_account(account_id: str, session: DbSession, admin: AdminAccount) -> dict:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在。")
    account.is_active = False
    _drop_account_sessions(session, account.id)
    session.flush()
    _audit(session, _admin_actor(admin), "account.deactivate", account.id)
    return {"id": account.id, "isActive": False}


@router.patch("/accounts/{account_id}")
def admin_patch_account(
    account_id: str, payload: AdminAccountPatch, session: DbSession, admin: AdminAccount
) -> dict:
    """修正账号资料 / 重置密码 / 调整管理员与启用状态。

    两条自锁保护：不能取消自己的管理员权限、也不能停用自己——否则后台会把
    管理员自己关在门外，只能直接改库救回来。降权时还会校验系统里必须剩下
    至少一个启用状态的管理员。
    """
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在。")

    data = payload.model_dump(exclude_unset=True)
    if account.id == admin.id:
        if data.get("is_admin") is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="不能取消自己的管理员权限。"
            )
        if data.get("is_active") is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="不能停用当前登录的账号。"
            )

    changed: list[str] = []
    if data.get("email"):
        email = normalize_email(str(data["email"]))
        if not is_valid_email(email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱格式不正确。"
            )
        taken = session.scalars(
            select(Account.id).where(
                func.lower(Account.email) == email, Account.id != account.id
            )
        ).first()
        if taken is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="该邮箱已被其他账号使用。"
            )
        account.email = email
        # 客户档案里的邮箱是下单/开票用的，跟着账号一起改，免得两处不一致
        customer = session.scalars(
            select(Customer).where(Customer.account_id == account.id)
        ).first()
        if customer is not None:
            customer.email = email
        changed.append("email")

    if data.get("is_admin") is False and bool(account.is_admin):
        remaining = session.execute(
            select(func.count(Account.id)).where(
                Account.is_admin.is_(True),
                Account.is_active.is_(True),
                Account.id != account.id,
            )
        ).scalar_one()
        if not remaining:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="系统必须保留至少一个启用状态的管理员。",
            )
    if "is_admin" in data and data["is_admin"] is not None:
        account.is_admin = bool(data["is_admin"])
        changed.append("is_admin")

    if "is_active" in data and data["is_active"] is not None:
        account.is_active = bool(data["is_active"])
        if not account.is_active:
            _drop_account_sessions(session, account.id)
        changed.append("is_active")

    if "email_verified" in data and data["email_verified"] is not None:
        account.email_verified_at = utcnow() if data["email_verified"] else None
        changed.append("email_verified")

    if data.get("new_password"):
        account.password_hash = hash_password(data["new_password"])
        # 密码一改就踢掉全部会话，避免旧 token 继续用
        _drop_account_sessions(session, account.id)
        # 审计里只记「改过密码」，绝不记明文
        changed.append("new_password")

    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="没有需要更新的字段。"
        )

    session.flush()
    _audit(session, _admin_actor(admin), "account.update", account.id, ",".join(sorted(changed)))
    return _account_payload(session, account)


@router.delete("/accounts/{account_id}")
def admin_delete_account(account_id: str, session: DbSession, admin: AdminAccount) -> dict:
    """删除账号。

    账号下面挂着授权、订单、积分流水，硬删会连带清空或留下孤儿指针。所以只要
    还挂着业务数据就拒绝删除，只允许停用；真正放行硬删的只有从未产生过业务
    数据的「干净」账号。管理员自己不能删自己。
    """
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在。")
    if account.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除当前登录的账号。"
        )

    blockers = {
        "授权": int(
            session.execute(
                select(func.count(License.id)).where(License.account_id == account.id)
            ).scalar_one()
            or 0
        ),
        "订单": int(
            session.execute(
                select(func.count(Order.id)).where(Order.account_id == account.id)
            ).scalar_one()
            or 0
        ),
        "积分流水": int(
            session.execute(
                select(func.count(ReferralLedger.id)).where(
                    ReferralLedger.account_id == account.id
                )
            ).scalar_one()
            or 0
        ),
    }
    blocking = {name: count for name, count in blockers.items() if count}
    if blocking:
        detail = "、".join(f"{name} {count} 条" for name, count in blocking.items())
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"该账号仍有 {detail}，不能删除。请改用「停用」以保留历史记录。",
        )

    email = account.email
    _drop_account_sessions(session, account.id)
    session.delete(account)
    session.flush()
    _audit(session, _admin_actor(admin), "account.delete", account_id, email)
    return {"id": account_id, "deleted": True, "email": email}


# --------------------------------------------------------------------------- #
# 授权修正
# --------------------------------------------------------------------------- #
def _license_detail(session, settings, license: License) -> dict:
    """按列表接口同一口径返回单条授权。"""
    meta = _license_meta(session, [license])
    setting = site_config.get_setting(session)
    return license_payload(
        license,
        customer=meta.get(license.id, {}).get("customer"),
        binding=meta.get(license.id, {}).get("binding"),
        cooldown_seconds=_cooldown(setting, settings),
        last_released_at=meta.get(license.id, {}).get("last_released_at"),
    )


@router.patch("/licenses/{license_id}")
def admin_patch_license(
    license_id: str,
    payload: AdminLicensePatch,
    session: DbSession,
    settings: SettingsDep,
    admin: AdminAccount,
) -> dict:
    """修正授权的有效期 / 备注。

    过去这几个字段完全没有入口，客服遇到「客户要延期」「备注写错了」只能改库。
    到期时间的三种给法互斥，避免一次请求里两个字段互相覆盖：
    - ``extend_days``：在现有到期时间上顺延（永久授权以当前时刻为起点重新计时）
    - ``access_expires_at``：直接指定绝对时间，显式传 null 表示改为永久有效
    - 只给 ``validity_days``：按开始时间重算到期时间，避免出现「买的 365 天、
      实际只到明年」这种自相矛盾的授权
    """
    license = session.get(License, license_id)
    if license is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")

    data = payload.model_dump(exclude_unset=True)
    extend_days = data.get("extend_days")
    explicit_expiry = "access_expires_at" in data
    if extend_days and explicit_expiry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="顺延天数与绝对到期时间不能同时提交，请二选一。",
        )

    changed: list[str] = []
    if explicit_expiry:
        license.access_expires_at = _naive_utc(data["access_expires_at"])
        changed.append("access_expires_at")
    elif extend_days:
        base = license.access_expires_at or utcnow()
        license.access_expires_at = base + timedelta(days=int(extend_days))
        changed.append("access_expires_at")
    elif "validity_days" in data:
        if data["validity_days"] is None:
            license.access_expires_at = None
        else:
            start = license.access_started_at or license.issued_at or utcnow()
            license.access_expires_at = start + timedelta(days=int(data["validity_days"]))
        changed.append("access_expires_at")

    if "validity_days" in data:
        license.validity_days = data["validity_days"]
        changed.append("validity_days")
    if "access_started_at" in data:
        license.access_started_at = _naive_utc(data["access_started_at"])
        changed.append("access_started_at")
    if "user_label" in data:
        license.user_label = data["user_label"]
        changed.append("user_label")

    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="没有需要更新的字段。"
        )

    license.updated_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "license.update", license.id, ",".join(sorted(changed)))
    return _license_detail(session, settings, license)


# --------------------------------------------------------------------------- #
# 权益（决定客户端功能开关）
# --------------------------------------------------------------------------- #
def _entitlement_payload(entry: Entitlement) -> dict:
    now = utcnow()
    return {
        "id": entry.id,
        "licenseId": entry.license_id,
        "customerId": entry.customer_id,
        "productId": entry.product_id,
        "productName": entry.product_name,
        "productType": entry.product_type,
        "featureCode": entry.feature_code,
        # activeFlag 是库里的原始开关，active 是叠加了有效期后的实际生效状态：
        # 两者分开返回，后台才能解释「为什么开关是开的但客户端没该功能」。
        "activeFlag": bool(entry.active),
        "active": bool(entry.active) and (entry.expires_at is None or entry.expires_at > now),
        "startsAt": iso(entry.starts_at),
        "expiresAt": iso(entry.expires_at),
        "createdAt": iso(entry.created_at),
    }


@router.get("/entitlements")
def admin_list_entitlements(
    session: DbSession,
    _admin: AdminAccount,
    license_id: str | None = None,
    account_id: str | None = None,
    feature_code: str | None = None,
    limit: int = 200,
) -> dict:
    statement = (
        select(Entitlement)
        .order_by(Entitlement.created_at.desc())
        .limit(max(1, min(limit, 500)))
    )
    if license_id:
        statement = statement.where(Entitlement.license_id == license_id)
    if feature_code:
        statement = statement.where(Entitlement.feature_code == feature_code)
    if account_id:
        statement = statement.where(
            Entitlement.license_id.in_(
                select(License.id).where(License.account_id == account_id)
            )
        )
    return {"items": [_entitlement_payload(entry) for entry in session.scalars(statement)]}


@router.post("/entitlements")
def admin_create_entitlement(
    payload: AdminEntitlementRequest, session: DbSession, admin: AdminAccount
) -> dict:
    """手工补一条权益。

    同一张授权下同一个 ``feature_code`` 只能有一条，否则客户端到底按哪条开功能
    就说不清了，所以重复时直接报冲突、引导去编辑已有那条。
    """
    license = session.get(License, payload.license_id)
    if license is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")
    feature_code = payload.feature_code.strip()
    exists = session.scalars(
        select(Entitlement).where(
            Entitlement.license_id == license.id,
            Entitlement.feature_code == feature_code,
        )
    ).first()
    if exists is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"该授权下已存在功能 {feature_code} 的权益，请直接编辑它。",
        )

    starts_at = _naive_utc(payload.starts_at) or utcnow()
    expires_at = (
        _naive_utc(payload.expires_at)
        if payload.expires_at
        else license.access_expires_at
    )
    if expires_at is not None and expires_at <= starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="结束时间必须晚于开始时间。"
        )

    entry = Entitlement(
        customer_id=license.customer_id,
        license_id=license.id,
        product_id=payload.product_id or license.product_id,
        product_name=payload.product_name or license.product_name,
        product_type=payload.product_type or license.product_type,
        feature_code=feature_code,
        active=payload.active,
        starts_at=starts_at,
        expires_at=expires_at,
    )
    session.add(entry)
    session.flush()
    _audit(
        session, _admin_actor(admin), "entitlement.create", entry.id,
        f"{license.code_hint} / {feature_code}",
    )
    return _entitlement_payload(entry)


@router.patch("/entitlements/{entitlement_id}")
def admin_patch_entitlement(
    entitlement_id: str, payload: AdminEntitlementPatch, session: DbSession, admin: AdminAccount
) -> dict:
    entry = session.get(Entitlement, entitlement_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="权益不存在。")

    data = payload.model_dump(exclude_unset=True)
    changed: list[str] = []
    if data.get("feature_code"):
        feature_code = str(data["feature_code"]).strip()
        if feature_code != entry.feature_code:
            taken = session.scalars(
                select(Entitlement.id).where(
                    Entitlement.license_id == entry.license_id,
                    Entitlement.feature_code == feature_code,
                    Entitlement.id != entry.id,
                )
            ).first()
            if taken is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"该授权下已存在功能 {feature_code} 的权益。",
                )
        entry.feature_code = feature_code
        changed.append("feature_code")
    if "product_name" in data and data["product_name"] is not None:
        entry.product_name = data["product_name"]
        changed.append("product_name")
    if "active" in data and data["active"] is not None:
        entry.active = bool(data["active"])
        changed.append("active")
    if "starts_at" in data:
        entry.starts_at = _naive_utc(data["starts_at"]) or entry.starts_at
        changed.append("starts_at")
    if "expires_at" in data:
        # 显式 null 表示改为永久有效
        entry.expires_at = _naive_utc(data["expires_at"])
        changed.append("expires_at")

    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="没有需要更新的字段。"
        )
    if entry.expires_at is not None and entry.expires_at <= entry.starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="结束时间必须晚于开始时间。"
        )

    session.flush()
    _audit(
        session, _admin_actor(admin), "entitlement.update", entry.id, ",".join(sorted(changed))
    )
    return _entitlement_payload(entry)


@router.delete("/entitlements/{entitlement_id}")
def admin_delete_entitlement(
    entitlement_id: str, session: DbSession, admin: AdminAccount
) -> dict:
    entry = session.get(Entitlement, entitlement_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="权益不存在。")
    label = f"{entry.license_id} / {entry.feature_code}"
    session.delete(entry)
    session.flush()
    _audit(session, _admin_actor(admin), "entitlement.delete", entitlement_id, label)
    return {"id": entitlement_id, "deleted": True}


# --------------------------------------------------------------------------- #
# 邀请积分：人工调账
# --------------------------------------------------------------------------- #
@router.post("/referral-wallets/{account_id}/adjust")
def admin_adjust_wallet(
    account_id: str, payload: AdminWalletAdjustRequest, session: DbSession, admin: AdminAccount
) -> dict:
    """人工调账（有资金影响）。

    强制要求备注，且一律走 ``referrals.ledger_entry`` 记账：余额与流水在同一个
    事务里更新，不允许直接改余额绕过账本，否则对账时余额对不上流水。
    """
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在。")
    note = payload.note.strip()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="人工调账必须填写备注。"
        )

    delta = round(float(payload.delta), 2)
    frozen_delta = round(float(payload.frozen_delta), 2)
    if delta == 0 and frozen_delta == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="变动金额不能为 0。")

    wallet = referrals.get_or_create_wallet(session, account)
    next_balance = round(float(wallet.balance or 0.0) + delta, 2)
    next_frozen = round(float(wallet.frozen or 0.0) + frozen_delta, 2)
    if next_balance < 0 or next_frozen < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"调账后余额或冻结金额不能为负（余额 {next_balance:.2f} / 冻结 {next_frozen:.2f}）。",
        )

    entry = referrals.ledger_entry(
        session,
        wallet,
        kind="manual_adjust",
        delta=delta,
        frozen_delta=frozen_delta,
        note=note,
        reference=_admin_actor(admin),
    )
    _audit(
        session,
        _admin_actor(admin),
        "wallet.adjust",
        account.id,
        f"余额 {delta:+.2f} / 冻结 {frozen_delta:+.2f}，备注：{note}",
    )
    return {
        "accountId": account.id,
        "balance": f"{float(wallet.balance or 0.0):.2f}",
        "frozen": f"{float(wallet.frozen or 0.0):.2f}",
        "ledgerId": entry.id,
    }


# --------------------------------------------------------------------------- #
# 商品图片 / 设备绑定 / 版本发布：删除与修正
# --------------------------------------------------------------------------- #
@router.delete("/products/{product_id}/image")
def admin_delete_product_image(
    product_id: str, request: Request, session: DbSession, admin: AdminAccount
) -> dict:
    """移除商品自定义图片（含磁盘文件），回落到默认标识。"""
    product = _product_or_404(session, product_id)
    images = list(
        session.scalars(select(ProductImage).where(ProductImage.product_id == product.id))
    )
    if not images:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="该商品没有自定义图片。"
        )

    settings = request.app.state.settings
    root = settings.product_images_dir.resolve()
    removed: list[str] = []
    missing: list[str] = []
    for image in images:
        target = (root / image.path).resolve()
        # 防目录穿越：库里的 path 是上传时自己拼的文件名，但不排除被改过，
        # 越界的路径只清记录、不碰文件。
        if target != root and root not in target.parents:
            logger.warning("商品图片路径越界，跳过文件删除：%s", image.path)
            missing.append(image.path)
        elif target.is_file():
            try:
                target.unlink()
                removed.append(image.path)
            except OSError as exc:
                # 文件删不掉也要把记录清掉，否则列表里会挂着一张点不开的图
                logger.warning("删除商品图片文件失败 %s：%s", target, exc)
                missing.append(image.path)
        else:
            missing.append(image.path)
        session.delete(image)

    session.flush()
    _audit(session, _admin_actor(admin), "product.image_delete", product.id, ",".join(image_path for image_path in removed))
    return {"id": product.id, "removed": removed, "missing": missing, "imageUrl": None}


@router.delete("/bindings/{binding_id}")
def admin_delete_binding(binding_id: str, session: DbSession, admin: AdminAccount) -> dict:
    """物理删除设备绑定记录。

    与「释放绑定」的区别：释放只是把绑定置为失效、保留历史，客户端重新激活仍
    受冷却时间约束；删除会把记录整条抹掉（会话与找回令牌按外键级联清理），
    客户端可以立刻重新激活。只用于清理测试机、重复绑定这类脏数据，故强制审计。
    """
    binding = session.get(DeviceBinding, binding_id)
    if binding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="绑定记录不存在。")
    license_id = binding.license_id
    instance_id = binding.instance_id
    session.delete(binding)
    session.flush()
    _audit(
        session, _admin_actor(admin), "binding.delete", binding_id,
        f"授权 {license_id} / 实例 {instance_id}",
    )
    return {"id": binding_id, "deleted": True, "licenseId": license_id}


def _release_payload(release: Release) -> dict:
    return {
        "id": release.id,
        "product": release.product,
        "channel": release.channel,
        "version": release.version,
        "releaseDate": release.release_date,
        "upgradeNotes": release.upgrade_notes,
        "createdAt": iso(release.created_at),
    }


@router.patch("/releases/{release_id}")
def admin_patch_release(
    release_id: str, payload: AdminReleasePatch, session: DbSession, admin: AdminAccount
) -> dict:
    """修正已发布的版本记录（发错渠道、版本号打错、说明写错都要能改）。"""
    release = session.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本记录不存在。")

    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "product": "product",
        "channel": "channel",
        "version": "version",
        "release_date": "release_date",
        "upgrade_notes": "upgrade_notes",
    }
    changed: list[str] = []
    for field, column in mapping.items():
        if field in data and data[field] is not None:
            setattr(release, column, data[field])
            changed.append(field)

    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="没有需要更新的字段。"
        )
    session.flush()
    _audit(session, _admin_actor(admin), "release.update", release.id, ",".join(sorted(changed)))
    return _release_payload(release)


# --------------------------------------------------------------------------- #
# 只读数据面：这些表过去在后台完全看不到，出问题时只能连库查
#
# 分页口径统一为 {items, total, limit, offset}。此前各接口一律 limit<=500 且没有
# offset，第 501 条之后的记录在界面上永远看不到 —— 而这几张表（登录尝试、验证码、
# 解绑事件）恰恰靠「翻旧账」定位问题，看不到旧记录等于白存。
# --------------------------------------------------------------------------- #
def _page(session: Session, base, order_by, *, limit: int, offset: int, render) -> dict:
    """给一个未加 limit/order 的 select 加排序与分页，并附上总数。"""
    size = max(1, min(int(limit or 200), 500))
    skip = max(0, min(int(offset or 0), 1_000_000))
    total = int(
        session.execute(
            select(func.count()).select_from(base.order_by(None).subquery())
        ).scalar_one()
        or 0
    )
    rows = session.scalars(base.order_by(*order_by).limit(size).offset(skip)).all()
    return {"items": [render(row) for row in rows], "total": total, "limit": size, "offset": skip}


def _cutoff_days(older_than_days: int) -> datetime:
    """清理入口的统一时间闸门：必须显式给出天数且至少 1 天。

    这样「一键清空全部」在接口层就不成立 —— 任何清理都只针对明确的天数之前。
    """
    try:
        days = int(older_than_days)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="older_than_days 必须是整数天。"
        ) from None
    if days < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="older_than_days 至少为 1 天。"
        )
    return utcnow() - timedelta(days=days)


def _purge_rows(
    session: Session,
    admin: AdminAccount,
    *,
    model,
    pk,
    where,
    label: str,
    action: str,
    detail: str,
) -> dict:
    """按给定谓词批量删除。返回删除前的命中主键数，并写一条审计。"""
    ids = list(session.scalars(select(pk).where(where)))
    if ids:
        session.execute(delete(model).where(where))
        session.flush()
    _audit(session, _admin_actor(admin), action, label, f"{detail}，共 {len(ids)} 条")
    return {"deleted": len(ids), "detail": detail}


def _resolve_by_hash_hint(session: Session, model, hint: str, label: str):
    """按「令牌哈希前缀」定位一行。

    列表接口只下发哈希前 12 位（48 bit）——足够做标识，又不至于把完整哈希（可用来
    在别处比对/冒用）暴露到浏览器里。删除/撤销时用同一个前缀回查：命中多行就要求
    调用方给更长的前缀，绝不猜。
    """
    prefix = (hint or "").strip().lower()
    if len(prefix) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label}标识至少 8 位字符。"
        )
    rows = list(
        session.scalars(select(model).where(model.id_hash.like(f"{prefix}%")).limit(2))
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{label}不存在（可能已被清理）。"
        )
    if len(rows) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"该{label}标识不唯一，请提供更长的前缀。"
        )
    return rows[0]


@router.get("/sessions")
def admin_list_sessions(
    session: DbSession,
    _admin: AdminAccount,
    account_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """登录会话。只回令牌哈希的前 12 位做标识，不暴露完整哈希。"""
    base = select(AccountSession)
    if account_id:
        base = base.where(AccountSession.account_id == account_id)
    moment = utcnow()

    def render(record: AccountSession) -> dict:
        account = session.get(Account, record.account_id)
        return {
            "ref": (record.id_hash or "")[:12],
            "accountId": record.account_id,
            "accountEmail": account.email if account else "",
            "isAdminSession": bool(record.is_admin_session),
            "ipAddress": record.ip_address,
            "userAgent": record.user_agent,
            "createdAt": iso(record.created_at),
            "lastSeenAt": iso(record.last_seen_at),
            "expiresAt": iso(record.expires_at),
            "expired": record.expires_at <= moment,
        }

    return _page(
        session,
        base,
        (AccountSession.last_seen_at.desc(),),
        limit=limit,
        offset=offset,
        render=render,
    )


@router.delete("/sessions/{ref}")
def admin_revoke_session(ref: str, session: DbSession, admin: AdminAccount) -> dict:
    """把单条登录会话踢下线。

    过去只能改密码或停用账号来「踢人」，两种做法都会连带踢掉该账号的**全部**会话
    （包括管理员自己正在用的那条）。这里按会话粒度撤销。
    """
    record = _resolve_by_hash_hint(session, AccountSession, ref, "登录会话")
    account = session.get(Account, record.account_id)
    email = account.email if account else record.account_id
    hint = (record.id_hash or "")[:12]
    session.delete(record)
    session.flush()
    _audit(session, _admin_actor(admin), "session.revoke", email, hint)
    return {"ref": hint, "revoked": True, "accountEmail": email}


@router.delete("/sessions")
def admin_purge_sessions(session: DbSession, admin: AdminAccount, older_than_days: int) -> dict:
    """清理早已过期的登录会话。

    安全谓词：只清 ``expires_at`` 本身早于截止时间的。未过期的会话一律保留 ——
    删掉等于把正在用的人踢下线。
    """
    cutoff = _cutoff_days(older_than_days)
    return _purge_rows(
        session,
        admin,
        model=AccountSession,
        pk=AccountSession.id_hash,
        where=AccountSession.expires_at < cutoff,
        label="登录会话",
        action="session.purge",
        detail=f"{older_than_days} 天前就已过期的会话",
    )


@router.get("/referral-ledger")
def admin_list_referral_ledger(
    session: DbSession,
    _admin: AdminAccount,
    account_id: str | None = None,
    kind: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """积分流水。余额由流水汇总而来，这张表是唯一的对账依据。"""
    base = select(ReferralLedger)
    if account_id:
        base = base.where(ReferralLedger.account_id == account_id)
    if kind:
        base = base.where(ReferralLedger.kind == kind)

    def render(entry: ReferralLedger) -> dict:
        account = session.get(Account, entry.account_id)
        return {
            "id": entry.id,
            "accountId": entry.account_id,
            "accountEmail": account.email if account else "",
            "walletId": entry.wallet_id,
            "kind": entry.kind,
            "delta": f"{float(entry.delta or 0.0):.2f}",
            "frozenDelta": f"{float(entry.frozen_delta or 0.0):.2f}",
            "balanceAfter": f"{float(entry.balance_after or 0.0):.2f}",
            "frozenAfter": f"{float(entry.frozen_after or 0.0):.2f}",
            "note": entry.note,
            "reference": entry.reference,
            "orderId": entry.order_id,
            "createdAt": iso(entry.created_at),
        }

    return _page(
        session,
        base,
        (ReferralLedger.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=render,
    )


@router.get("/coupon-redemptions")
def admin_list_coupon_redemptions(
    session: DbSession,
    _admin: AdminAccount,
    coupon_id: str | None = None,
    account_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """优惠码的「曾占用过名额」历史凭证。

    注意它**不是**可随便清的日志：``per_account_limit`` 判定要读这张表，
    清掉一条就等于给那个账号重新开一个名额。所以这里只提供单条作废，
    不提供按时间批量清理（详见 ``admin_void_coupon_redemption``）。
    """
    base = select(CouponRedemption)
    if coupon_id:
        base = base.where(CouponRedemption.coupon_id == coupon_id)
    if account_id:
        base = base.where(CouponRedemption.account_id == account_id)

    def render(record: CouponRedemption) -> dict:
        coupon = session.get(Coupon, record.coupon_id)
        account = session.get(Account, record.account_id)
        order = session.get(Order, record.order_id) if record.order_id else None
        return {
            "id": record.id,
            "couponId": record.coupon_id,
            "couponCode": coupon.code if coupon else "",
            "accountId": record.account_id,
            "accountEmail": account.email if account else "",
            "orderId": record.order_id,
            "orderNo": order.order_no if order else "",
            # 订单进了 RELEASED_STATUSES、名额已归还的核销记录，只是历史凭证；
            # 其余状态（含 fulfilled / refunded）都仍占着名额。界面据此区分。
            "orderStatus": order.status if order else "",
            "holding": bool(
                record.order_id is None
                or (order is not None and order.status not in coupons.RELEASED_STATUSES)
            ),
            "discountCents": int(record.discount_cents or 0),
            "createdAt": iso(record.created_at),
        }

    return _page(
        session,
        base,
        (CouponRedemption.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=render,
    )


def _recount_coupon_redemptions(session: Session, coupon: Coupon | None) -> int:
    """把 ``coupon.redeemed_count`` 按「仍占用名额」的核销记录重算。

    核销记录的增删会改变「此刻还被占用多少名额」，而这个计数参与
    ``max_redemptions`` 校验，所以任何一次作废之后都必须跟着重算，
    否则会出现「名额看着还有、下单却说领完」。

    谓词与下单校验（``store/api/store.py``）保持同一份来源：订单进了
    ``coupons.RELEASED_STATUSES`` 就等于名额已归还，不再计入。
    """
    if coupon is None:
        return 0
    used = int(
        session.execute(
            select(func.count(CouponRedemption.id))
            .outerjoin(Order, Order.id == CouponRedemption.order_id)
            .where(CouponRedemption.coupon_id == coupon.id)
            .where(
                or_(
                    CouponRedemption.order_id.is_(None),
                    Order.status.notin_(coupons.RELEASED_STATUSES),
                )
            )
        ).scalar_one()
        or 0
    )
    coupon.redeemed_count = used
    session.flush()
    return used


@router.delete("/coupon-redemptions/{redemption_id}")
def admin_void_coupon_redemption(
    redemption_id: str, session: DbSession, admin: AdminAccount
) -> dict:
    """作废一条核销记录（仅供纠错：重复核销、测试单、误发折扣）。

    会连带重算 ``coupon.redeemed_count``；这条记录的账号也因此重新获得一个名额。
    这两件事都会写进审计，事后可追。
    """
    record = session.get(CouponRedemption, redemption_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="核销记录不存在。")
    coupon = session.get(Coupon, record.coupon_id)
    account = session.get(Account, record.account_id)
    code = coupon.code if coupon else record.coupon_id

    session.delete(record)
    session.flush()
    used = _recount_coupon_redemptions(session, coupon)
    _audit(
        session,
        _admin_actor(admin),
        "coupon.redemption.void",
        code,
        f"账号 {account.email if account else record.account_id}，剩余占用名额 {used}",
    )
    return {
        "id": redemption_id,
        "deleted": True,
        "couponCode": code,
        "redeemedCount": used,
    }


@router.get("/customers")
def admin_list_customers(
    session: DbSession,
    _admin: AdminAccount,
    keyword: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    base = select(Customer)
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(or_(Customer.email.like(like), Customer.name.like(like)))

    def render(customer: Customer) -> dict:
        return {
            "id": customer.id,
            "accountId": customer.account_id,
            "email": customer.email,
            "name": customer.name,
            "createdAt": iso(customer.created_at),
            "orderCount": int(
                session.execute(
                    select(func.count(Order.id)).where(Order.customer_id == customer.id)
                ).scalar_one()
                or 0
            ),
            "licenseCount": int(
                session.execute(
                    select(func.count(License.id)).where(License.customer_id == customer.id)
                ).scalar_one()
                or 0
            ),
        }

    return _page(
        session,
        base,
        (Customer.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=render,
    )


@router.get("/login-attempts")
def admin_list_login_attempts(
    session: DbSession,
    _admin: AdminAccount,
    scope: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """登录尝试。排查「是不是被撞库了」时用，只存 scope 不存密码。"""
    base = select(LoginAttempt)
    if scope:
        base = base.where(LoginAttempt.scope == scope)
    return _page(
        session,
        base,
        (LoginAttempt.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=lambda record: {
            "id": record.id,
            "scope": record.scope,
            "succeeded": bool(record.succeeded),
            "createdAt": iso(record.created_at),
        },
    )


@router.delete("/login-attempts")
def admin_purge_login_attempts(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早于指定天数的登录尝试记录。这是纯日志表，删了不影响任何判定。"""
    cutoff = _cutoff_days(older_than_days)
    return _purge_rows(
        session,
        admin,
        model=LoginAttempt,
        pk=LoginAttempt.id,
        where=LoginAttempt.created_at < cutoff,
        label="登录尝试",
        action="login-attempt.purge",
        detail=f"{older_than_days} 天前",
    )


@router.get("/email-verifications")
def admin_list_email_verifications(
    session: DbSession,
    _admin: AdminAccount,
    email: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """邮箱验证码记录。``code_hash`` 属敏感字段，一律不下发。"""
    base = select(EmailVerification)
    if email:
        base = base.where(EmailVerification.email == email.strip().lower())
    moment = utcnow()
    return _page(
        session,
        base,
        (EmailVerification.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=lambda record: {
            "id": record.id,
            "email": record.email,
            "purpose": record.purpose,
            "attempts": int(record.attempts or 0),
            "consumedAt": iso(record.consumed_at),
            "expiresAt": iso(record.expires_at),
            "createdAt": iso(record.created_at),
            "settled": bool(record.consumed_at is not None or record.expires_at <= moment),
        },
    )


@router.delete("/email-verifications")
def admin_purge_email_verifications(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早于指定天数的验证码记录。

    安全谓词：只清**已消费或已过期**的。仍在有效期内、且没被用过的验证码
    清掉会让用户正在走的注册/改密流程凭空失败，所以一律留在库里。
    """
    cutoff = _cutoff_days(older_than_days)
    where = and_(
        EmailVerification.created_at < cutoff,
        or_(
            EmailVerification.consumed_at.isnot(None),
            EmailVerification.expires_at < utcnow(),
        ),
    )
    return _purge_rows(
        session,
        admin,
        model=EmailVerification,
        pk=EmailVerification.id,
        where=where,
        label="邮箱验证码",
        action="email-verification.purge",
        detail=f"{older_than_days} 天前的已消费/已过期记录",
    )


@router.get("/device-release-events")
def admin_list_device_release_events(
    session: DbSession,
    _admin: AdminAccount,
    license_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """设备解绑历史。冷却时间是否该放行，看这张表。"""
    base = select(DeviceReleaseEvent)
    if license_id:
        base = base.where(DeviceReleaseEvent.license_id == license_id)

    def render(event: DeviceReleaseEvent) -> dict:
        license = session.get(License, event.license_id)
        return {
            "id": event.id,
            "licenseId": event.license_id,
            "codeHint": license.code_hint if license else "",
            "accountId": event.account_id,
            "instanceId": event.instance_id,
            "source": event.source,
            "createdAt": iso(event.created_at),
        }

    return _page(
        session,
        base,
        (DeviceReleaseEvent.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=render,
    )


@router.delete("/device-release-events")
def admin_purge_device_release_events(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早于指定天数的解绑事件。

    安全谓词：**每条授权的最新一条解绑事件永远保留**。冷却判定读的正是「最近一次
    解绑时间」，只有历史事件才是可丢的日志；如果按时间一刀切，把某条授权的唯一
    事件删掉会顺带解除冷却，等于放行了它本该被拦住的自助解绑。
    """
    cutoff = _cutoff_days(older_than_days)
    newer = aliased(DeviceReleaseEvent)
    latest_for_license = (
        select(func.max(newer.created_at))
        .where(newer.license_id == DeviceReleaseEvent.license_id)
        .scalar_subquery()
    )
    where = and_(
        DeviceReleaseEvent.created_at < cutoff,
        DeviceReleaseEvent.created_at < latest_for_license,
    )
    return _purge_rows(
        session,
        admin,
        model=DeviceReleaseEvent,
        pk=DeviceReleaseEvent.id,
        where=where,
        label="设备解绑事件",
        action="device-release-event.purge",
        detail=f"{older_than_days} 天前（保留每条授权的最新一次）",
    )


# --------------------------------------------------------------------------- #
# 审计日志
# --------------------------------------------------------------------------- #
# --------------------------------------------------------------------------- #
# 客户端侧会话与令牌：过去完全没有入口，只能靠解绑/删绑定级联清理
# --------------------------------------------------------------------------- #
@router.get("/license-sessions")
def admin_list_license_sessions(
    session: DbSession,
    _admin: AdminAccount,
    license_id: str | None = None,
    binding_id: str | None = None,
    active_only: bool = False,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """客户端登录会话。

    这是「谁在用这张授权」的直接证据：``last_used_at`` 是心跳时间，
    ``binding_id`` 指向具体设备。过去后台只能看到设备绑定、看不到会话，
    排查「同一张授权被多处同时使用」时无从下手。
    """
    base = select(LicenseSession)
    moment = utcnow()
    if license_id:
        base = base.where(LicenseSession.license_id == license_id)
    if binding_id:
        base = base.where(LicenseSession.binding_id == binding_id)
    if active_only:
        base = base.where(LicenseSession.expires_at > moment)

    def render(record: LicenseSession) -> dict:
        binding = session.get(DeviceBinding, record.binding_id)
        license_ = session.get(License, record.license_id)
        return {
            "ref": (record.id_hash or "")[:12],
            "sessionId": record.session_id,
            "licenseId": record.license_id,
            "codeHint": license_.code_hint if license_ else "",
            "bindingId": record.binding_id,
            "instanceId": binding.instance_id if binding else None,
            "bindingActive": bool(binding.active) if binding else False,
            "createdAt": iso(record.created_at),
            "lastUsedAt": iso(record.last_used_at),
            "expiresAt": iso(record.expires_at),
            "expired": record.expires_at <= moment,
        }

    return _page(
        session,
        base,
        (LicenseSession.last_used_at.desc(),),
        limit=limit,
        offset=offset,
        render=render,
    )


@router.delete("/license-sessions/{ref}")
def admin_revoke_license_session(ref: str, session: DbSession, admin: AdminAccount) -> dict:
    """撤销一条客户端会话。下一次心跳会因为会话不存在而要求重新激活。"""
    record = _resolve_by_hash_hint(session, LicenseSession, ref, "授权会话")
    license_ = session.get(License, record.license_id)
    hint = (record.id_hash or "")[:12]
    session.delete(record)
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "license-session.revoke",
        license_.code_hint if license_ else record.license_id,
        hint,
    )
    return {"ref": hint, "revoked": True, "codeHint": license_.code_hint if license_ else ""}


@router.delete("/license-sessions")
def admin_purge_license_sessions(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早已过期的客户端会话。

    安全谓词：只清 ``expires_at`` 本身早于截止时间的（也就是早就失效的）。
    未过期的会话一律保留 —— 删掉等于把在线客户端踢下线。
    """
    cutoff = _cutoff_days(older_than_days)
    return _purge_rows(
        session,
        admin,
        model=LicenseSession,
        pk=LicenseSession.id_hash,
        where=LicenseSession.expires_at < cutoff,
        label="授权会话",
        action="license-session.purge",
        detail=f"{older_than_days} 天前就已过期的会话",
    )


@router.get("/recovery-tokens")
def admin_list_recovery_tokens(
    session: DbSession,
    _admin: AdminAccount,
    license_id: str | None = None,
    binding_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """设备找回令牌。只回哈希前 12 位做标识，完整哈希不下发。"""
    base = select(RecoveryToken)
    moment = utcnow()
    if license_id:
        base = base.where(RecoveryToken.license_id == license_id)
    if binding_id:
        base = base.where(RecoveryToken.binding_id == binding_id)

    def render(record: RecoveryToken) -> dict:
        binding = session.get(DeviceBinding, record.binding_id)
        license_ = session.get(License, record.license_id)
        return {
            "ref": (record.id_hash or "")[:12],
            "licenseId": record.license_id,
            "codeHint": license_.code_hint if license_ else "",
            "bindingId": record.binding_id,
            "instanceId": binding.instance_id if binding else None,
            "createdAt": iso(record.created_at),
            "expiresAt": iso(record.expires_at),
            "expired": record.expires_at <= moment,
        }

    return _page(
        session,
        base,
        (RecoveryToken.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=render,
    )


@router.delete("/recovery-tokens/{ref}")
def admin_revoke_recovery_token(ref: str, session: DbSession, admin: AdminAccount) -> dict:
    """作废一条找回令牌（设备丢了或令牌疑似外泄时用）。"""
    record = _resolve_by_hash_hint(session, RecoveryToken, ref, "找回令牌")
    license_ = session.get(License, record.license_id)
    hint = (record.id_hash or "")[:12]
    session.delete(record)
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "recovery-token.revoke",
        license_.code_hint if license_ else record.license_id,
        hint,
    )
    return {"ref": hint, "revoked": True, "codeHint": license_.code_hint if license_ else ""}


@router.delete("/recovery-tokens")
def admin_purge_recovery_tokens(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早已过期的找回令牌。安全谓词同客户端会话：只清已经失效的。"""
    cutoff = _cutoff_days(older_than_days)
    return _purge_rows(
        session,
        admin,
        model=RecoveryToken,
        pk=RecoveryToken.id_hash,
        where=RecoveryToken.expires_at < cutoff,
        label="找回令牌",
        action="recovery-token.purge",
        detail=f"{older_than_days} 天前就已过期的令牌",
    )


@router.get("/audit-logs")
def admin_audit_logs(
    session: DbSession, _admin: AdminAccount, limit: int = 100, offset: int = 0
) -> dict:
    return _page(
        session,
        select(AuditLog),
        (AuditLog.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=lambda row: {
            "id": row.id,
            "actor": row.actor,
            "action": row.action,
            "target": row.target,
            "detail": row.detail,
            "createdAt": iso(row.created_at),
        },
    )


@router.delete("/audit-logs/{log_id}")
def admin_delete_audit_log(log_id: str, session: DbSession, admin: AdminAccount) -> dict:
    log = session.get(AuditLog, log_id)
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="审计记录不存在。")
    label = f"{log.action} {log.target}".strip()
    session.delete(log)
    session.flush()
    _audit(session, _admin_actor(admin), "audit.delete", log_id, label)
    return {"id": log_id, "deleted": True, "label": label}


@router.delete("/audit-logs")
def admin_purge_audit_logs(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """按时间批量清理审计日志。

    ``older_than_days`` 是**必填**查询参数且最小为 1 天（闸门见 ``_cutoff_days``）：
    这样「一键清空全部」在接口层面就不成立，只能清理明确指定天数之前的记录。
    本次清理动作自己也会写入一条审计记录（其时间为当前时刻，落在保留区内，
    不会被自己删掉）。
    """
    cutoff = _cutoff_days(older_than_days)
    result = _purge_rows(
        session,
        admin,
        model=AuditLog,
        pk=AuditLog.id,
        where=AuditLog.created_at < cutoff,
        label="审计日志",
        action="audit.purge",
        detail=f"older_than_days={older_than_days}",
    )
    return {
        "deleted": result["deleted"],
        "olderThanDays": older_than_days,
        "cutoff": iso(cutoff),
    }
