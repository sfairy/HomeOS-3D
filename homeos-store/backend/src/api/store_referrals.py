"""商店接口的 referrals 资源组（从 api/store.py 拆出）。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .store_catalog import (
    HISTORY_PAGE_SIZE,
    _wallet_payload,
    _withdrawal_payload,
)
from ..commerce import money, referrals
from ..core.deps import AuthedAccount, DbSession
from ..core.models import (
    Account,
    ReferralLedger,
    ReferralWallet,
    ReferralWithdrawal,
)
from ..core.schemas import (
    WithdrawalRequest,
)
from ..ops import site_settings as site_config
from ..security.security import (
    iso,
)

router = APIRouter()


@router.get("/referrals")
def referral_overview(session: DbSession, account: AuthedAccount) -> dict:
    setting = site_config.get_setting(session)
    wallet = session.scalars(
        select(ReferralWallet).where(ReferralWallet.account_id == account.id)
    ).first()
    invited = session.execute(
        select(func.count(Account.id)).where(Account.referred_by_account_id == account.id)
    ).scalar_one()
    return {
        "wallet": _wallet_payload(wallet),
        "invitedCount": int(invited or 0),
        "settings": site_config.referral_settings_payload(setting),
    }


@router.post("/referrals/code")
def create_referral_code(session: DbSession, account: AuthedAccount) -> dict:
    setting = site_config.get_setting(session)
    if not setting.referral_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邀请活动暂时关闭。")
    wallet = referrals.get_or_create_wallet(session, account)
    return {"wallet": _wallet_payload(wallet)}


@router.get("/referrals/history")
def referral_history(
    session: DbSession,
    account: AuthedAccount,
    kind: str = "ledger",
    page: int = 1,
) -> dict:
    page = max(1, int(page or 1))
    wallet = session.scalars(
        select(ReferralWallet).where(ReferralWallet.account_id == account.id)
    ).first()
    if wallet is None:
        return {"items": [], "total": 0, "page": page}

    if kind == "withdrawals":
        total = int(
            session.execute(
                select(func.count(ReferralWithdrawal.id)).where(
                    ReferralWithdrawal.wallet_id == wallet.id
                )
            ).scalar_one()
            or 0
        )
        rows = session.scalars(
            select(ReferralWithdrawal)
            .where(ReferralWithdrawal.wallet_id == wallet.id)
            .order_by(ReferralWithdrawal.created_at.desc())
            .offset((page - 1) * HISTORY_PAGE_SIZE)
            .limit(HISTORY_PAGE_SIZE)
        )
        items = [
            {
                **_withdrawal_payload(row),
                "note": row.note,
                "resolvedAt": iso(row.resolved_at),
            }
            for row in rows
        ]
        return {"items": items, "total": total, "page": page}

    total = int(
        session.execute(
            select(func.count(ReferralLedger.id)).where(ReferralLedger.wallet_id == wallet.id)
        ).scalar_one()
        or 0
    )
    rows = session.scalars(
        select(ReferralLedger)
        .where(ReferralLedger.wallet_id == wallet.id)
        .order_by(ReferralLedger.created_at.desc())
        .offset((page - 1) * HISTORY_PAGE_SIZE)
        .limit(HISTORY_PAGE_SIZE)
    )
    items = [
        {
            "id": row.id,
            "kind": row.kind,
            "delta": money.format_centi(row.delta_centi),
            "frozenDelta": money.format_centi(row.frozen_delta_centi),
            "balanceAfter": money.format_centi(row.balance_after_centi),
            "frozenAfter": money.format_centi(row.frozen_after_centi),
            "note": row.note,
            "reference": row.reference,
            "createdAt": iso(row.created_at),
        }
        for row in rows
    ]
    return {"items": items, "total": total, "page": page}


@router.post("/referrals/withdrawals")
def request_withdrawal(
    payload: WithdrawalRequest, session: DbSession, account: AuthedAccount
) -> dict:
    setting = site_config.get_setting(session)
    if not setting.referral_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邀请活动暂时关闭。")

    wallet = session.scalars(
        select(ReferralWallet).where(ReferralWallet.account_id == account.id)
    ).first()
    if wallet is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="请先生成邀请码。")

    existing = session.scalars(
        select(ReferralWithdrawal).where(ReferralWithdrawal.request_key == payload.request_key)
    ).first()
    if existing is not None:
        if existing.wallet_id != wallet.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该请求号已被占用，请重试。")
        return _withdrawal_payload(existing)

    minimum_centi = money.to_centi(setting.referral_withdrawal_min_points or 100.0)
    points_centi = money.to_centi(payload.points)
    if points_centi < minimum_centi:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"最低提现 {money.format_centi(minimum_centi)} 积分。",
        )
    available_centi = referrals.available_points_centi(wallet)
    if points_centi > available_centi:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"可用积分不足（当前可用 {money.format_centi(available_centi)}，"
                f"已被提现申请冻结 {money.format_centi(wallet.frozen_centi)}）。"
            ),
        )
    if int(wallet.frozen_centi or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="你有正在处理中的提现申请，请等待处理完成。"
        )
    fee_percent = float(setting.referral_withdrawal_fee_percent or 0.0)
    if payload.expected_fee_percent is not None and money.percent_to_bps(
        payload.expected_fee_percent
    ) != money.percent_to_bps(fee_percent):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"提现手续费已从 {float(payload.expected_fee_percent):.2f}% "
                f"调整为 {fee_percent:.2f}%，请确认后重新提交。"
            ),
        )
    try:
        withdrawal = referrals.create_withdrawal(
            session,
            wallet,
            points_centi=points_centi,
            request_key=payload.request_key,
            fee_percent=fee_percent,
        )
    except referrals.WalletConflictError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="钱包刚刚有其它操作，请刷新后重试。",
        ) from None
    except IntegrityError:
        session.rollback()
        clashing = session.scalars(
            select(ReferralWithdrawal).where(ReferralWithdrawal.request_key == payload.request_key)
        ).first()
        if clashing is not None:
            if clashing.wallet_id == wallet.id:
                return _withdrawal_payload(clashing)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="该请求号已被占用，请更换后重试。",
            ) from None
        raise
    return _withdrawal_payload(withdrawal)
