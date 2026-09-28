"""运营后台的 withdrawals 资源组（从 api/admin.py 拆出）。
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..commerce import money, referrals
from ..core.deps import AdminAccount, DbSession
from ..core.models import (
    Account,
    ReferralWithdrawal,
)
from ..core.schemas import (
    AdminWithdrawalResolveRequest,
)
from ..security.security import (
    iso_z,
)

logger = logging.getLogger("src.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
from .admin_shared import (
    _admin_actor,
    _audit,
    _count_rows,
    _page_bounds,
)

router = APIRouter()


@router.get("/withdrawals")
def admin_list_withdrawals(
    session: DbSession,
    _admin: AdminAccount,
    status_filter: str | None = None,
    keyword: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """提现申请列表（分页 + 筛选）。
    """
    base = select(ReferralWithdrawal)
    if status_filter:
        base = base.where(ReferralWithdrawal.status == status_filter)
    if keyword:
        like = f"%{keyword.strip()}%"
        matched = select(Account.id).where(Account.email.like(like))
        base = base.where(ReferralWithdrawal.account_id.in_(matched))

    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = list(
        session.scalars(
            base.order_by(ReferralWithdrawal.created_at.desc()).limit(size).offset(skip)
        )
    )
    account_ids = {row.account_id for row in rows}
    emails = {
        account.id: account.email
        for account in session.scalars(
            select(Account).where(Account.id.in_(account_ids or {""}))
        )
    }
    items = [
        {
            "id": row.id,
            "accountId": row.account_id,
            "email": emails.get(row.account_id),
            "points": money.format_centi(row.points_centi),
            "feePoints": money.format_centi(row.fee_points_centi),
            "feePercent": float(money.from_centi(row.fee_bps)),
            "netPoints": money.format_centi(row.net_points_centi),
            "status": row.status,
            #: 中文口径由服务端下发（``referrals.WITHDRAWAL_STATUS_LABELS``）：前台
            "statusLabel": referrals.WITHDRAWAL_STATUS_LABELS.get(row.status, row.status),
            "note": row.note,
            "createdAt": iso_z(row.created_at),
            "resolvedAt": iso_z(row.resolved_at),
        }
        for row in rows
    ]
    return {"items": items, "total": total, "limit": size, "offset": skip}


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
    try:
        referrals.resolve_withdrawal(
            session, withdrawal, approve=payload.approve, note=payload.note
        )
    except referrals.WalletGuardError:
        #: 余额小于冻结额（只能由人工调账造成）时记账会被守卫拒绝。整个事务随之回滚，
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "该账号余额不足以完成这笔提现（余额已低于冻结额，通常是人工调账造成的）。"
                "请先核对并补足余额，再重新审批；本次未做任何改动。"
            ),
        ) from None
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
    points = money.format_centi(withdrawal.points_centi)
    session.delete(withdrawal)
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "withdrawal.delete",
        withdrawal_id,
        f"{status_label} · {points} 积分",
    )
    return {"id": withdrawal_id, "deleted": True}
