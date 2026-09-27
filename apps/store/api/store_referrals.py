"""商店接口的 referrals 资源组（从 api/store.py 拆出）。

子路由不带前缀，由父路由在**原来的位置** include，以此保持注册顺序（FastAPI 按注册序匹配）。
只留邀请总览 / 邀请码 / 邀请历史 / 提现申请四条路由；钱包与提现载荷在 store_catalog.py。
"""
from __future__ import annotations

from __future__ import annotations


from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from apps.store.commerce import money, referrals
from apps.store.core.deps import AuthedAccount, DbSession
from apps.store.core.models import (
    Account,
    ReferralLedger,
    ReferralWallet,
    ReferralWithdrawal,
)
from apps.store.core.schemas import (
    WithdrawalRequest,
)
from apps.store.security.security import (
    iso,
)
from apps.store.ops import site_settings as site_config


from .store_catalog import (
    HISTORY_PAGE_SIZE,
    _wallet_payload,
    _withdrawal_payload,
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
                "id": row.id,
                "points": money.format_centi(row.points_centi),
                "feePoints": money.format_centi(row.fee_points_centi),
                "feePercent": money.format_centi(row.fee_bps).rstrip("0").rstrip("."),
                "netPoints": money.format_centi(row.net_points_centi),
                "status": row.status,
                "note": row.note,
                "createdAt": iso(row.created_at),
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

    # requestKey 是幂等键：重复提交必须原样返回上一次结果，
    # 而不是被"存在处理中提现"这类状态校验挡住。
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
    # 「可用积分」口径必须与前端展示一致（余额 - 冻结）；只比 balance 的话，
    # 「可用 0 元」的用户照样能提交申请，一路走到后台才被人工拒绝。
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
    # 手续费在用户确认那一刻可能是 1%，等运营改成 5% 后才提交 —— 用户看到的到账金额与实际不符，只能事后投诉；
    # 前端已在发 expectedFeePercent，这里真正校验它，不一致就让用户重新确认一次。
    # 比对用基点整数：浮点的 abs(a-b) > 1e-6 对「1% vs 1.0000001%」判不出来，而这两个值在前端显示成同一个数字。
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
        #: 上面的「可用积分够不够」「有没有正在处理的提现」都是**读**判断，与真正冻结之间存在窗口：
        #: 两个并发申请会各自读到 frozen=0、各自通过校验，最终只冻结一次却挂两笔待审 —— 审完就能重复套现。
        #: 冲突时让用户重试即可，绝不能让它变成一个 500 或静默成功。
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="钱包刚刚有其它操作，请刷新后重试。",
        ) from None
    return _withdrawal_payload(withdrawal)
