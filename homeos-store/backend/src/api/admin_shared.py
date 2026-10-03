"""运营后台的共享助手：审计落库、锁定保护、金额窗口、账号与会话清理。
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..api.store_catalog import _image_map, _license_meta, _product_stats
from ..commerce import money
from ..commerce.order_status import (
    FULFILLABLE_STATUSES as ORDER_FULFILLABLE_STATUSES,
)
from ..commerce.order_status import ORDER_STATUS_LABELS
from ..core.deps import AdminAccount, SettingsDep
from ..core.models import (
    Account,
    AccountSession,
    AuditLog,
    Entitlement,
    License,
    Order,
    OrderRefund,
    Product,
    ReferralWallet,
    StoreSetting,
)
from ..core.serializers import license_payload, product_payload
from ..ops import site_settings as site_config
from ..security.security import iso, iso_z, utcnow

logger = logging.getLogger(__name__)


def _naive_utc(value: datetime | None) -> datetime | None:
    """把后台传入的时间统一成 naive UTC。
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _admin_actor(admin: AdminAccount) -> str:
    return admin.email or str(admin.id)


def _guard_self_lockout(account: Account, admin: AdminAccount, *, action: str) -> None:
    """不许管理员把自己关在门外（停用自己 / 取消自己的管理员权限）。
    """
    if account.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"不能{action}。"
        )


def _guard_last_active_admin(session: Session, account: Account) -> None:
    """停用或降权一个**启用中的管理员**前，确认系统里还留得下至少一个管理员。
    """
    if not (account.is_admin and account.is_active):
        return
    remaining = session.execute(
        select(func.count(Account.id)).where(
            Account.is_admin.is_(True),
            Account.is_active.is_(True),
            Account.id != account.id,
        )
    ).scalar_one()
    if not remaining:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="系统必须保留至少一个启用状态的管理员。",
        )


def _audit(session, actor: str, action: str, target: str = "", detail: str = "") -> None:
    session.add(AuditLog(actor=actor, action=action, target=target, detail=detail))
    session.flush()


def _product_or_404(session, product_id: str) -> Product:
    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在。")
    return product


def _account_payload(session, account: Account) -> dict:
    """账号序列化。
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
        "balance": money.format_centi(wallet.balance_centi) if wallet else "0.00",
        "licenseCount": int(
            session.execute(
                select(func.count(License.id)).where(License.account_id == account.id)
            ).scalar_one()
            or 0
        ),
    }


def _drop_account_sessions(session, account_id: str, *, keep_hash: str | None = None) -> int:
    """清掉某个账号的全部登录会话，返回删除条数。

    keep_hash 给定时保留该会话（改密码 / 改邮箱只踢其它设备，当前设备不下线）。
    """
    records = list(
        session.scalars(select(AccountSession).where(AccountSession.account_id == account_id))
    )
    removed = 0
    for record in records:
        if keep_hash is not None and record.id_hash == keep_hash:
            continue
        session.delete(record)
        removed += 1
    return removed


def _cooldown(setting: StoreSetting, settings: SettingsDep) -> int:
    return site_config.resolve_device_release_cooldown(setting, settings)


_OVERVIEW_WINDOWS: tuple[tuple[str, timedelta], ...] = (
    ("last24h", timedelta(hours=24)),
    ("last7d", timedelta(days=7)),
    ("last30d", timedelta(days=30)),
)

PAID_MONEY_STATUSES: tuple[str, ...] = (
    "paid",
    "fulfilled",
    "refunded",
    "partially_refunded",
    "fulfillment_failed",
)

OVERVIEW_EXPIRING_DAYS = 30


def _billable_money_clause():
    """营收口径的过滤条件：**排除人工补记**。
    """
    return Order.manual_settlement.is_(False)


def _window_money(session: Session, since: datetime) -> dict:
    """统计 ``[since, now)`` 内的收款与退款（后台时间窗 KPI 都读它）。

    收款按**订单支付时间**归因；退款按**退款流水的发生时间**归因（不是订单支付时间）。
    两者若都用支付时间，今天为 40 天前订单办的退款不会被计入「近 24 小时/7 天」，
    而今天支付、明天退款的单又会把退款算进今天的窗口 —— netCents 就与窗口内真实
    现金流对不上（累计 ``totalRefunded`` 不受影响）。
    """
    row = session.execute(
        select(
            func.coalesce(func.sum(Order.amount_cents), 0),
            func.count(Order.id),
        ).where(
            Order.paid_at.is_not(None),
            Order.paid_at >= since,
            Order.status.in_(PAID_MONEY_STATUSES),
            _billable_money_clause(),
        )
    ).one()
    refunded = int(
        session.execute(
            select(func.coalesce(func.sum(OrderRefund.amount_cents), 0))
            .join(Order, Order.id == OrderRefund.order_id)
            .where(
                OrderRefund.status == "succeeded",
                OrderRefund.created_at >= since,
                Order.manual_settlement.is_(False),
            )
        ).scalar_one()
        or 0
    )
    manual_row = session.execute(
        select(
            func.coalesce(func.sum(Order.amount_cents), 0),
            func.count(Order.id),
        ).where(
            Order.paid_at.is_not(None),
            Order.paid_at >= since,
            Order.status.in_(PAID_MONEY_STATUSES),
            Order.manual_settlement.is_(True),
        )
    ).one()
    gross = int(row[0] or 0)
    return {
        "grossCents": gross,
        "refundCents": refunded,
        "netCents": gross - refunded,
        "paidOrders": int(row[1] or 0),
        "manualCents": int(manual_row[0] or 0),
        "manualOrders": int(manual_row[1] or 0),
    }


def _page_bounds(limit: int, offset: int) -> tuple[int, int]:
    """分页参数的统一闸门：单页上限 500，offset 不允许负数或离谱的大值。"""
    size = max(1, min(int(limit or 200), 500))
    skip = max(0, min(int(offset or 0), 1_000_000))
    return size, skip


def _count_rows(session: Session, base) -> int:
    """数一个**未加 limit/order** 的 select 有多少行（供分页返回 total）。"""
    return int(
        session.execute(
            select(func.count()).select_from(base.order_by(None).subquery())
        ).scalar_one()
        or 0
    )


def _page(session: Session, base, order_by, *, limit: int, offset: int, render) -> dict:
    """给一个未加 limit/order 的 select 加排序与分页，并附上总数。
    """
    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = session.scalars(base.order_by(*order_by).limit(size).offset(skip)).all()
    return {"items": [render(row) for row in rows], "total": total, "limit": size, "offset": skip}


def _page_items(session: Session, base, order_by, *, limit: int, offset: int, build) -> dict:
    """``_page`` 的两段式版本：先把**本页的行**整批交给 ``build(rows)``。
    """
    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = session.scalars(base.order_by(*order_by).limit(size).offset(skip)).all()
    return {"items": build(rows), "total": total, "limit": size, "offset": skip}


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
        "activeFlag": bool(entry.active),
        "active": bool(entry.active) and (entry.expires_at is None or entry.expires_at > now),
        "startsAt": iso_z(entry.starts_at),
        "expiresAt": iso_z(entry.expires_at),
        "createdAt": iso_z(entry.created_at),
    }


def _by_ids(session: Session, model, ids) -> dict[str, Any]:
    """按主键批量取行，返回 ``{主键: 行}``；空集合直接返回空字典。
    """
    wanted = {item for item in ids if item}
    if not wanted:
        return {}
    return {
        row.id: row
        for row in session.scalars(select(model).where(model.id.in_(wanted)))
    }


def _cutoff_days(older_than_days: int) -> datetime:
    """清理入口的统一时间闸门：必须显式给出天数且至少 1 天。
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


_PURGE_BATCH = 500


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
    """按给定谓词分批删除。返回删除行数，并写一条审计。
    """
    total = 0
    while True:
        ids = list(session.scalars(select(pk).where(where).limit(_PURGE_BATCH)))
        if not ids:
            break
        session.execute(delete(model).where(pk.in_(ids)))
        session.flush()
        total += len(ids)
        if len(ids) < _PURGE_BATCH:
            break
    _audit(session, _admin_actor(admin), action, label, f"{detail}，共 {total} 条")
    return {"deleted": total, "detail": detail}


_HEX_CHARS = frozenset("0123456789abcdef")


def _resolve_by_hash_hint(session: Session, model, hint: str, label: str):
    """按「令牌哈希前缀」定位一行。
    """
    prefix = (hint or "").strip().lower()
    if len(prefix) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label}标识至少 8 位字符。"
        )
    if not set(prefix) <= _HEX_CHARS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label}标识只能是十六进制字符（0-9a-f）。",
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


def _product_delete_refs(session) -> tuple[dict[str, int], dict[str, int]]:
    """统计每个商品被多少条授权 / 订单引用。
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

def _admin_product_context(session, product_ids=None) -> dict:
    licenses, orders = _product_delete_refs(session)
    return {
        "stats": _product_stats(session, product_ids),
        "images": _image_map(session),
        "bundled": {item.id: item for item in session.scalars(select(Product))},
        "licenses": licenses,
        "orders": orders,
    }

def _product_admin_payload(session, product: Product, context: dict | None = None) -> dict:
    context = context or _admin_product_context(session, [product.id])
    payload = product_payload(
        product,
        context["images"].get(product.id),
        bundled=context["bundled"],
        customer_count=int(context["stats"]["customer"].get(product.id, 0)),
        purchase_count=int(context["stats"]["purchase"].get(product.id, 0)),
    )
    payload["originalPriceCents"] = product.original_price_cents
    payload["requiresLicense"] = bool(product.requires_license)
    payload["note"] = product.note
    payload["licenseCount"] = int(context["licenses"].get(product.id, 0))
    payload["orderCount"] = int(context["orders"].get(product.id, 0))
    return payload

_FULFILLABLE_STATUS_TEXT = " / ".join(
    ORDER_STATUS_LABELS.get(code, code) for code in ORDER_FULFILLABLE_STATUSES
)

def _safe_image_target(root: Path, raw: str) -> Path | None:
    """把库里的商品图相对路径解析成绝对路径；越界返回 ``None``。
    """
    base = root.resolve()
    if not raw:
        return None
    target = (base / raw).resolve()
    if target == base or base not in target.parents:
        return None
    return target
