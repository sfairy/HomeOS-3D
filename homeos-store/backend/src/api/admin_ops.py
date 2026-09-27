"""运营后台的 ops 资源组（从 api/admin.py 拆出）。
"""
from __future__ import annotations

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..commerce import coupons, money, referrals
from ..core.deps import AdminAccount, DbSession
from ..core.models import (
    Account,
    AccountSession,
    Coupon,
    CouponRedemption,
    Customer,
    License,
    LoginAttempt,
    Order,
    ReferralLedger,
)
from ..security.security import (
    iso,
    utcnow,
)  # noqa: F401

logger = logging.getLogger("src.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
from .admin_shared import (
    _admin_actor,
    _audit,
    _by_ids,
    _cutoff_days,
    _page,
    _page_items,
    _purge_rows,
    _resolve_by_hash_hint,
)


router = APIRouter()


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

    def build(rows) -> list[dict]:
        #: 账号映射整批取（原先每行一次 ``session.get``，500 行就是 500 次往返）。
        account_map = _by_ids(session, Account, (record.account_id for record in rows))
        return [
            {
                "ref": (record.id_hash or "")[:12],
                "accountId": record.account_id,
                "accountEmail": account_map[record.account_id].email
                if record.account_id in account_map
                else "",
                "isAdminSession": bool(record.is_admin_session),
                "ipAddress": record.ip_address,
                "userAgent": record.user_agent,
                "createdAt": iso(record.created_at),
                "lastSeenAt": iso(record.last_seen_at),
                "expiresAt": iso(record.expires_at),
                "expired": record.expires_at <= moment,
            }
            for record in rows
        ]

    return _page_items(
        session,
        base,
        (AccountSession.last_seen_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


@router.delete("/sessions/{ref}")
def admin_revoke_session(ref: str, session: DbSession, admin: AdminAccount) -> dict:
    """把单条登录会话踢下线。
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

    def build(rows) -> list[dict]:
        accounts = _by_ids(session, Account, (entry.account_id for entry in rows))
        return [
            {
                "id": entry.id,
                "accountId": entry.account_id,
                "accountEmail": accounts[entry.account_id].email
                if entry.account_id in accounts
                else "",
                "walletId": entry.wallet_id,
                "kind": entry.kind,
                "delta": money.format_centi(entry.delta_centi),
                "frozenDelta": money.format_centi(entry.frozen_delta_centi),
                "balanceAfter": money.format_centi(entry.balance_after_centi),
                "frozenAfter": money.format_centi(entry.frozen_after_centi),
                "note": entry.note,
                "reference": entry.reference,
                "orderId": entry.order_id,
                "createdAt": iso(entry.created_at),
            }
            for entry in rows
        ]

    return {
        **_page_items(
            session,
            base,
            (ReferralLedger.created_at.desc(),),
            limit=limit,
            offset=offset,
            build=build,
        ),
        # 类型词表随数据一起下发（同 ``incidents.kinds`` 的做法）：后台的筛选下拉与列表标签
        "kinds": referrals.ledger_kind_options(),
    }


@router.get("/coupon-redemptions")
def admin_list_coupon_redemptions(
    session: DbSession,
    _admin: AdminAccount,
    coupon_id: str | None = None,
    account_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    base = select(CouponRedemption)
    if coupon_id:
        base = base.where(CouponRedemption.coupon_id == coupon_id)
    if account_id:
        base = base.where(CouponRedemption.account_id == account_id)

    def build(rows) -> list[dict]:
        #: 三张关联表各取一次，而不是每行三次（500 行时是 1500 → 3）。
        coupon_map = _by_ids(session, Coupon, (record.coupon_id for record in rows))
        account_map = _by_ids(session, Account, (record.account_id for record in rows))
        order_map = _by_ids(session, Order, (record.order_id for record in rows))
        items: list[dict] = []
        for record in rows:
            coupon = coupon_map.get(record.coupon_id)
            account = account_map.get(record.account_id)
            order = order_map.get(record.order_id) if record.order_id else None
            items.append(
                {
                    "id": record.id,
                    "couponId": record.coupon_id,
                    "couponCode": coupon.code if coupon else "",
                    "accountId": record.account_id,
                    "accountEmail": account.email if account else "",
                    "orderId": record.order_id,
                    "orderNo": order.order_no if order else "",
                    "orderStatus": order.status if order else "",
                    # 判据与 SQL 侧同源（coupons.holds_slot），不要再在这里写第二份规则：
                    "holding": coupons.holds_slot(record, order),
                    "voidedAt": iso(record.voided_at) if record.voided_at else "",
                    "voidReason": record.void_reason or "",
                    "discountCents": int(record.discount_cents or 0),
                    "createdAt": iso(record.created_at),
                }
            )
        return items

    return _page_items(
        session,
        base,
        (CouponRedemption.created_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


def _recount_coupon_redemptions(session: Session, coupon: Coupon | None) -> int:
    """把 ``coupon.redeemed_count`` 按「仍占用名额」的核销记录重算。
    """
    if coupon is None:
        return 0
    used = int(
        session.execute(
            select(func.count(CouponRedemption.id))
            .outerjoin(Order, Order.id == CouponRedemption.order_id)
            .where(CouponRedemption.coupon_id == coupon.id)
            .where(*coupons.holds_slot_conditions())
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
    """
    record = session.get(CouponRedemption, redemption_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="核销记录不存在。")
    coupon = session.get(Coupon, record.coupon_id)
    account = session.get(Account, record.account_id)
    code = coupon.code if coupon else record.coupon_id

    #: 已作废的记录再点一次（双击、两个标签页）不再重复记账：置空时间会覆盖掉
    already = record.voided_at is not None
    if not already:
        record.voided_at = utcnow()
        record.void_reason = f"后台作废（{_admin_actor(admin)}）"
        session.flush()
    used = _recount_coupon_redemptions(session, coupon)
    if not already:
        _audit(
            session,
            _admin_actor(admin),
            "coupon.redemption.void",
            code,
            (
                f"账号 {account.email if account else record.account_id}，"
                f"折扣 {int(record.discount_cents or 0) / 100:.2f} 元，"
                f"剩余占用名额 {used}"
            ),
        )
    return {
        "id": redemption_id,
        "deleted": True,
        "voided": not already,
        "alreadyVoided": already,
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

    def build(rows) -> list[dict]:
        #: 两个计数改成**每页两条**聚合查询（``GROUP BY customer_id``），而不是每行两条：
        customer_ids = {row.id for row in rows}
        scope_ids = customer_ids or {""}
        order_counts = dict(
            session.execute(
                select(Order.customer_id, func.count(Order.id))
                .where(Order.customer_id.in_(scope_ids))
                .group_by(Order.customer_id)
            ).all()
        )
        license_counts = dict(
            session.execute(
                select(License.customer_id, func.count(License.id))
                .where(License.customer_id.in_(scope_ids))
                .group_by(License.customer_id)
            ).all()
        )
        return [
            {
                "id": customer.id,
                "accountId": customer.account_id,
                "email": customer.email,
                "name": customer.name,
                "createdAt": iso(customer.created_at),
                "orderCount": int(order_counts.get(customer.id, 0) or 0),
                "licenseCount": int(license_counts.get(customer.id, 0) or 0),
            }
            for customer in rows
        ]

    return _page_items(
        session,
        base,
        (Customer.created_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
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
