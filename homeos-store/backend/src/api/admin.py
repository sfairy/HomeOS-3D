"""管理后台 API：``/store-admin/v1/*``。
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from ..commerce import coupons, fulfill, money, referrals
from ..commerce.expiry import expire_stale_orders
from ..commerce.order_status import (
    FULFILLABLE_STATUSES as ORDER_FULFILLABLE_STATUSES,
)
from ..commerce.order_status import (
    ORDER_ATTENTION_STATUSES,
    ORDER_STATUS_CHOICES,
    ORDER_STATUS_LABELS,
)
from ..commerce.order_status import (
    REFUNDABLE_STATUSES as ORDER_REFUNDABLE_STATUSES,
)
from ..core.deps import AdminAccount, DbSession, SettingsDep
from ..core.models import (
    Account,
    DeviceBinding,
    Entitlement,
    License,
    Order,
    Product,
    ReferralWallet,
    ReferralWithdrawal,
)
from ..core.schemas import (
    AdminLicensePatch,
    AdminWalletAdjustRequest,
)
from ..ops import features, incidents
from ..ops import site_settings as site_config
from ..payments.sweeper import sweep_status
from ..security.security import (
    iso_z,
    utcnow,
)

logger = logging.getLogger("src.admin")


from . import (
    admin_accounts,
    admin_bindings,
    admin_compliance,
    admin_coupons,
    admin_entitlements,
    admin_licenses,
    admin_ops,
    admin_orders,
    admin_products,
    admin_settings,
    admin_withdrawals,
)
from .admin_shared import (
    _OVERVIEW_WINDOWS,
    OVERVIEW_EXPIRING_DAYS,
    PAID_MONEY_STATUSES,
    _admin_actor,
    _audit,
    _billable_money_clause,
    _license_detail,
    _naive_utc,
    _window_money,
)

router = APIRouter(prefix="/store-admin/v1", tags=["admin"])


@router.get("/overview")
def overview(session: DbSession, _admin: AdminAccount, settings: SettingsDep) -> dict:
    """经营看板数据。
    """
    setting = site_config.get_setting(session)
    expire_stale_orders(session, settings)
    moment = utcnow()

    def count(statement) -> int:
        return int(session.execute(statement).scalar_one() or 0)

    total_gross = count(
        select(func.coalesce(func.sum(Order.amount_cents), 0)).where(
            Order.paid_at.is_not(None),
            Order.status.in_(PAID_MONEY_STATUSES),
            _billable_money_clause(),
        )
    )
    total_refunded = count(
        select(func.coalesce(func.sum(Order.refund_amount_cents), 0)).where(
            Order.paid_at.is_not(None),
            Order.status.in_(PAID_MONEY_STATUSES),
            _billable_money_clause(),
        )
    )
    total_manual = count(
        select(func.coalesce(func.sum(Order.amount_cents), 0)).where(
            Order.paid_at.is_not(None),
            Order.status.in_(PAID_MONEY_STATUSES),
            Order.manual_settlement.is_(True),
        )
    )

    revenue: dict[str, Any] = {"totalCents": total_gross - total_refunded, "totalGrossCents": total_gross,
               "totalRefundCents": total_refunded, "totalManualCents": total_manual,
               "currency": "CNY", "windows": []}
    for key, span in _OVERVIEW_WINDOWS:
        bucket = _window_money(session, moment - span)
        bucket["key"] = key
        revenue["windows"].append(bucket)

    status_rows = session.execute(
        select(
            Order.status,
            func.count(Order.id),
            func.coalesce(func.sum(Order.amount_cents), 0),
        ).group_by(Order.status)
    ).all()
    by_status = {
        str(row[0]): {"count": int(row[1] or 0), "amountCents": int(row[2] or 0)}
        for row in status_rows
    }
    funnel = [
        {
            "status": code,
            "label": ORDER_STATUS_LABELS.get(code, code),
            "count": by_status.get(code, {}).get("count", 0),
            "amountCents": by_status.get(code, {}).get("amountCents", 0),
        }
        for code in ORDER_STATUS_CHOICES
    ]

    awaiting_fulfillment = count(
        select(func.count(Order.id)).where(
            Order.status == "paid", Order.fulfillment_mode == "automatic"
        )
    )
    attention_counts = {
        status: count(select(func.count(Order.id)).where(Order.status == status))
        for status in ORDER_ATTENTION_STATUSES
    }
    fulfillment_failed = attention_counts["fulfillment_failed"]
    payment_failed = attention_counts["payment_failed"]
    needs_review = count(
        select(func.count(Order.id)).where(Order.needs_review.is_(True))
    )

    expiring_licenses = list(
        session.scalars(
            select(License)
            .where(
                License.active.is_(True),
                License.access_expires_at.is_not(None),
                License.access_expires_at <= moment + timedelta(days=OVERVIEW_EXPIRING_DAYS),
            )
            .order_by(License.access_expires_at.asc())
            .limit(20)
        )
    )

    low_stock = list(
        session.scalars(
            select(Product)
            .where(
                Product.active.is_(True),
                Product.stock_quantity.is_not(None),
            )
            .order_by(Product.stock_quantity.asc())
            .limit(20)
        )
    )

    pending_withdrawal_rows = session.execute(
        select(
            func.count(ReferralWithdrawal.id),
            func.coalesce(func.sum(ReferralWithdrawal.net_points_centi), 0),
        ).where(ReferralWithdrawal.status == "pending")
    ).one()

    wallet_row = session.execute(
        select(
            func.count(ReferralWallet.id),
            func.coalesce(func.sum(ReferralWallet.balance_centi), 0),
            func.coalesce(func.sum(ReferralWallet.frozen_centi), 0),
        )
    ).one()

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
        "entitlements": count(select(func.count(Entitlement.id))),
        "activeEntitlements": count(
            select(func.count(Entitlement.id)).where(Entitlement.active.is_(True))
        ),
        "revenueCents": total_gross - total_refunded,
        "pendingWithdrawals": int(pending_withdrawal_rows[0] or 0),
        "deviceBindings": count(
            select(func.count(DeviceBinding.id)).where(DeviceBinding.live_clause())
        ),
        "serverTime": iso_z(moment),
        "maintenanceMode": bool(setting.maintenance_mode),
        "paymentSweep": sweep_status(),
        "incidents": incidents.status(),
        "revenue": revenue,
        "orderFunnel": funnel,
        "attention": {
            "awaitingFulfillment": awaiting_fulfillment,
            "fulfillmentFailed": fulfillment_failed,
            "paymentFailed": payment_failed,
            "needsReview": needs_review,
            "expiringLicenses": len(expiring_licenses),
            "expiringWindowDays": OVERVIEW_EXPIRING_DAYS,
            "lowStock": len(low_stock),
            "pendingWithdrawals": int(pending_withdrawal_rows[0] or 0),
            "soldOut": count(
                select(func.count(Product.id)).where(
                    Product.active.is_(True),
                    Product.stock_quantity.is_not(None),
                    Product.stock_quantity <= 0,
                )
            ),
        },
        "expiringLicenses": [
            {
                "activationCodeId": item.id,
                "codeHint": item.code_hint,
                "productName": item.product_name,
                "productType": item.product_type,
                "accountId": item.account_id,
                "accessExpiresAt": iso_z(item.access_expires_at),
            }
            for item in expiring_licenses
        ],
        "lowStockProducts": [
            {
                "id": item.id,
                "name": item.name,
                "stockQuantity": int(item.stock_quantity or 0),
                "reservedStock": int(item.reserved_stock or 0),
                "availableStock": max(0, int(item.stock_quantity or 0) - int(item.reserved_stock or 0)),
            }
            for item in low_stock
        ],
        "referral": {
            "wallets": int(wallet_row[0] or 0),
            "balancePoints": money.format_centi(wallet_row[1] or 0),
            "frozenPoints": money.format_centi(wallet_row[2] or 0),
            "availablePoints": money.format_centi(
                int(wallet_row[1] or 0) - int(wallet_row[2] or 0)
            ),
            "pendingWithdrawalPoints": money.format_centi(pending_withdrawal_rows[1] or 0),
        },
    }


@router.post("/maintenance/recompute-stock")
def admin_recompute_stock(session: DbSession, admin: AdminAccount) -> dict:
    """按订单表重算各商品的 ``reserved_stock``。
    """
    changes = fulfill.recompute_reserved_stock(session)
    detail = "、".join(f"{pid} {delta:+d}" for pid, delta in changes.items()) or "无变化"
    _audit(session, _admin_actor(admin), "maintenance.recompute_stock", "", detail)
    return {"updated": len(changes), "changes": changes, "detail": detail}

@router.post("/maintenance/recompute-coupons")
def admin_recompute_coupons(session: DbSession, admin: AdminAccount) -> dict:
    """按核销表重算各优惠码的 ``redeemed_count``。

    与「重算库存预留」对称：优惠码名额同样是被反规范化成计数列的快照，
    发现后台显示的已核销数与真实占用对不上时，用它一次性纠回。
    """
    changes = coupons.recompute_coupon_slots(session)
    detail = "、".join(f"{cid} {delta:+d}" for cid, delta in changes.items()) or "无变化"
    _audit(session, _admin_actor(admin), "maintenance.recompute_coupons", "", detail)
    return {"updated": len(changes), "changes": changes, "detail": detail}


@router.post("/incidents/ack")
def admin_ack_incidents(session: DbSession, admin: AdminAccount) -> dict:
    """确认（清零）资金/履约异常计数。
    """
    before = incidents.clear(actor=_admin_actor(admin))
    detail = (
        "、".join(f"{item['label']} {item['count']} 次" for item in before["kinds"])
        or "无异常"
    )
    _audit(
        session,
        _admin_actor(admin),
        "incidents.ack",
        "",
        f"清零 {before['total']} 次：{detail}",
    )
    return {"cleared": before["total"], "detail": detail, "incidents": incidents.status()}


@router.get("/feature-codes")
def admin_feature_codes(_admin: AdminAccount) -> dict:
    """商品可选的功能码目录（中文名 + 说明）。
    """
    return features.feature_catalog_payload()


router.include_router(admin_products.router)


@router.get("/order-status-meta")
def admin_order_status_meta(_admin: AdminAccount) -> dict:
    """下发订单状态词表与两个动作集合（后台下拉、标签、按钮门禁的唯一来源）。
    """
    return {
        "labels": dict(ORDER_STATUS_LABELS),
        "choices": list(ORDER_STATUS_CHOICES),
        "fulfillable": list(ORDER_FULFILLABLE_STATUSES),
        "refundable": list(ORDER_REFUNDABLE_STATUSES),
    }


router.include_router(admin_orders.router)


router.include_router(admin_licenses.router)
router.include_router(admin_bindings.router)


router.include_router(admin_coupons.router)
router.include_router(admin_withdrawals.router)


router.include_router(admin_settings.router)
router.include_router(admin_accounts.router)


@router.patch("/licenses/{license_id}")
def admin_patch_license(
    license_id: str,
    payload: AdminLicensePatch,
    session: DbSession,
    settings: SettingsDep,
    admin: AdminAccount,
) -> dict:
    """修正授权的有效期 / 备注。
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


router.include_router(admin_entitlements.router)
@router.post("/referral-wallets/{account_id}/adjust")
def admin_adjust_wallet(
    account_id: str, payload: AdminWalletAdjustRequest, session: DbSession, admin: AdminAccount
) -> dict:
    """人工调账（有资金影响）。
    """
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在。")
    note = payload.note.strip()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="人工调账必须填写备注。"
        )

    try:
        delta_centi = money.to_centi(payload.delta)
        frozen_delta_centi = money.to_centi(payload.frozen_delta)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"变动金额必须是有限数字（{error}）。"
        ) from None
    if delta_centi == 0 and frozen_delta_centi == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="变动金额不能为 0。")

    wallet = referrals.get_or_create_wallet(session, account)
    next_balance_centi = int(wallet.balance_centi or 0) + delta_centi
    next_frozen_centi = int(wallet.frozen_centi or 0) + frozen_delta_centi
    if next_balance_centi < 0 or next_frozen_centi < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"调账后余额或冻结金额不能为负（余额 "
                f"{money.format_centi(next_balance_centi)} / 冻结 "
                f"{money.format_centi(next_frozen_centi)}）。"
            ),
        )

    try:
        entry = referrals.ledger_entry(
            session,
            wallet,
            kind="manual_adjust",
            delta_centi=delta_centi,
            frozen_delta_centi=frozen_delta_centi,
            note=note,
            reference=_admin_actor(admin),
            min_balance_centi=0,
            min_frozen_centi=0,
        )
    except referrals.WalletGuardError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "钱包余额刚刚被其它操作改动，这次调账会让余额或冻结额为负，已拒绝。"
                "请刷新后按最新余额重算。"
            ),
        ) from None
    _audit(
        session,
        _admin_actor(admin),
        "wallet.adjust",
        account.id,
        f"余额 {money.format_centi(delta_centi)} / 冻结 "
        f"{money.format_centi(frozen_delta_centi)}，备注：{note}",
    )
    return {
        "accountId": account.id,
        "balance": money.format_centi(wallet.balance_centi),
        "frozen": money.format_centi(wallet.frozen_centi),
        "ledgerId": entry.id,
    }


router.include_router(admin_products.router_extra)


router.include_router(admin_bindings.router_extra)


router.include_router(admin_ops.router)


router.include_router(admin_compliance.router)
