"""邀请与积分账本。
"""

from __future__ import annotations

import logging

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.store.commerce import money
from apps.store.core.models import (
    Account,
    Order,
    ReferralLedger,
    ReferralWallet,
    ReferralWithdrawal,
    utcnow,
)
from apps.store.security.security import new_referral_code, new_uuid

logger = logging.getLogger("apps.store.commerce.referrals")

#: 积分流水类型（``ReferralLedger.kind``）的取值与中文名 —— **后端是唯一出处**。
LEDGER_KIND_LABELS: dict[str, str] = {
    "reward": "下单奖励",
    "reversal": "奖励退回",
    "freeze": "提现冻结",
    "withdrawal": "提现完成",
    "release": "提现驳回退回",
    "manual_adjust": "人工调账",
}

#: 提现申请状态（``ReferralWithdrawal.status``）的取值与中文名。同上，后台由接口下发。
WITHDRAWAL_STATUS_LABELS: dict[str, str] = {
    "pending": "待审核",
    "paid": "已提现",
    "rejected": "已驳回",
}


def ledger_kind_options() -> list[dict[str, str]]:
    """给后台筛选下拉用的 ``[{value, label}]``，顺序即展示顺序。"""
    return [
        {"value": kind, "label": label}
        for kind, label in LEDGER_KIND_LABELS.items()
    ]


class WalletConflictError(RuntimeError):
    """并发改动同一本钱包时的冲突（调用方应提示重试，而不是当成 500）。
    """


class WalletGuardError(RuntimeError):
    """写入会让钱包违反业务不变式（如余额为负），**不可重试**。
    """


def get_or_create_wallet(session: Session, account: Account) -> ReferralWallet:
    """取（必要时建）该账号的积分钱包。
    """
    wallet = _wallet_for(session, account)
    if wallet is not None:
        return wallet
    for _ in range(8):
        wallet = ReferralWallet(
            account_id=account.id,
            code=account.referral_code or _pick_free_code(session, account),
        )
        try:
            with session.no_autoflush, session.begin_nested():
                session.add(wallet)
                session.flush()
        except IntegrityError:
            if wallet in session:
                session.expunge(wallet)
            existing = _wallet_for(session, account)
            if existing is not None:
                return existing
            continue
        return wallet
    raise RuntimeError("无法创建积分钱包，请稍后重试。")


def _wallet_for(session: Session, account: Account) -> ReferralWallet | None:
    return session.scalars(
        select(ReferralWallet).where(ReferralWallet.account_id == account.id)
    ).first()


def _pick_free_code(session: Session, account: Account) -> str:
    """挑一个当前没人占用的邀请码并写回账号；查不出来就抛。
    """
    for _ in range(32):
        candidate = new_referral_code()
        taken = session.scalars(
            select(ReferralWallet.id).where(ReferralWallet.code == candidate)
        ).first()
        other = session.scalars(
            select(Account.id).where(Account.referral_code == candidate)
        ).first()
        if taken is None and other is None:
            account.referral_code = candidate
            return candidate
    raise RuntimeError("无法生成唯一邀请码，请稍后重试。")


def available_points_centi(wallet: ReferralWallet | None) -> int:
    """可用积分 = 余额 - 冻结，单位**厘**。
    """
    if wallet is None:
        return 0
    return max(
        0, int(wallet.balance_centi or 0) - int(wallet.frozen_centi or 0)
    )


def is_self_referral(session: Session, referrer: Account | None, account: Account) -> bool:
    """判断「自己邀请自己」。
    """
    if referrer is None or account is None:
        return True
    if referrer.id == account.id:
        return True
    referrer_email = (referrer.email or "").strip().lower()
    account_email = (account.email or "").strip().lower()
    return bool(referrer_email) and referrer_email == account_email


def _apply_wallet_delta(
    session: Session,
    wallet: ReferralWallet,
    *,
    delta_centi: int,
    frozen_delta_centi: int,
    earned_delta_centi: int = 0,
    withdrawn_delta_centi: int = 0,
    min_balance_centi: int | None = None,
    min_frozen_centi: int | None = None,
) -> tuple[int, int]:
    values: dict[str, object] = {}
    if delta_centi:
        values["balance_centi"] = func.coalesce(ReferralWallet.balance_centi, 0) + int(
            delta_centi
        )
    if frozen_delta_centi:
        values["frozen_centi"] = func.coalesce(ReferralWallet.frozen_centi, 0) + int(
            frozen_delta_centi
        )
    if earned_delta_centi:
        #: 累计获得同样是读-改-写：两笔奖励并发结算会互相覆盖，改成一条 SQL 的加法，
        values["earned_centi"] = func.max(
            0,
            func.coalesce(ReferralWallet.earned_centi, 0) + int(earned_delta_centi),
        )
    if withdrawn_delta_centi:
        #: 累计提现同理：放在这条语句里，钱包的三个聚合值就只有一个写入点。
        values["withdrawn_centi"] = func.coalesce(
            ReferralWallet.withdrawn_centi, 0
        ) + int(withdrawn_delta_centi)
    if not values:
        return int(wallet.balance_centi or 0), int(wallet.frozen_centi or 0)

    conditions = [ReferralWallet.id == wallet.id]
    if delta_centi and min_balance_centi is not None:
        conditions.append(
            func.coalesce(ReferralWallet.balance_centi, 0) + int(delta_centi)
            >= int(min_balance_centi)
        )
    if frozen_delta_centi and min_frozen_centi is not None:
        conditions.append(
            func.coalesce(ReferralWallet.frozen_centi, 0) + int(frozen_delta_centi)
            >= int(min_frozen_centi)
        )
    result = session.execute(
        update(ReferralWallet)
        .where(*conditions)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        raise WalletGuardError(
            "这次记账会让钱包余额或冻结额变成负数，已拒绝写入。"
        )
    session.refresh(wallet)
    return int(wallet.balance_centi or 0), int(wallet.frozen_centi or 0)


def ledger_entry(
    session: Session,
    wallet: ReferralWallet,
    *,
    kind: str,
    delta_centi: int = 0,
    frozen_delta_centi: int = 0,
    earned_delta_centi: int = 0,
    withdrawn_delta_centi: int = 0,
    note: str = "",
    reference: str | None = None,
    order_id: str | None = None,
    min_balance_centi: int | None = None,
    min_frozen_centi: int | None = None,
) -> ReferralLedger:
    """记一条流水并原子更新钱包。
    """
    balance, frozen = _apply_wallet_delta(
        session,
        wallet,
        delta_centi=delta_centi,
        frozen_delta_centi=frozen_delta_centi,
        earned_delta_centi=earned_delta_centi,
        withdrawn_delta_centi=withdrawn_delta_centi,
        min_balance_centi=min_balance_centi,
        min_frozen_centi=min_frozen_centi,
    )
    entry = ReferralLedger(
        wallet_id=wallet.id,
        account_id=wallet.account_id,
        kind=kind,
        delta_centi=int(delta_centi),
        frozen_delta_centi=int(frozen_delta_centi),
        #: 记的是**数据库里算出来的**结果，而不是本地推导的期望值。两者不一致时
        balance_after_centi=balance,
        frozen_after_centi=frozen,
        note=note,
        reference=reference,
        order_id=order_id,
    )
    session.add(entry)
    session.flush()
    return entry


def reward_points_for(order: Order, rate_percent: float) -> int:
    """按实付金额计算奖励积分，返回**厘**。免费订单不参与奖励。"""
    if not order.amount_cents or order.amount_cents <= 0:
        return 0
    return money.apply_rate_floor_cents(int(order.amount_cents), rate_percent)


def grant_order_reward(
    session: Session,
    *,
    order: Order,
    rate_percent: float,
    enabled: bool,
) -> int:
    """订单履约成功后给邀请人记奖励。返回**实际发放的积分（厘）**。"""
    if not enabled or not order.account_id:
        return 0
    buyer = session.get(Account, order.account_id)
    if buyer is None or not buyer.referred_by_account_id:
        return 0

    referrer = session.get(Account, buyer.referred_by_account_id)
    if referrer is None or not referrer.is_active:
        return 0
    if is_self_referral(session, referrer, buyer):
        logger.warning(
            "检测到自邀并跳过奖励 buyer=%s referrer=%s order=%s",
            buyer.email,
            referrer.email,
            order.order_no,
        )
        return 0

    points_centi = reward_points_for(order, rate_percent)
    if points_centi <= 0:
        return 0

    wallet = get_or_create_wallet(session, referrer)
    ledger_entry(
        session,
        wallet,
        kind="reward",
        delta_centi=points_centi,
        #: 累计获得与余额在同一条 SQL 里更新，分成两次写会丢掉并发下的更新。
        earned_delta_centi=points_centi,
        note=f"好友订单 {order.order_no} 实付奖励",
        reference=order.order_no,
        order_id=order.id,
    )
    order.referral_reward_points_centi = points_centi
    session.flush()
    return points_centi


def reverse_order_reward(
    session: Session, *, order: Order, note: str = "订单退款，奖励退回"
) -> int:
    """退款时把已发放的奖励扣回。返回**实际扣回的积分（厘）**。
    """
    if not order.referral_reward_points_centi or order.referral_reward_points_centi <= 0:
        return 0
    if not order.account_id:
        return 0
    buyer = session.get(Account, order.account_id)
    if buyer is None or not buyer.referred_by_account_id:
        return 0
    referrer = session.get(Account, buyer.referred_by_account_id)
    if referrer is None:
        return 0
    wallet = get_or_create_wallet(session, referrer)
    points_centi = int(order.referral_reward_points_centi)
    deductible = min(points_centi, available_points_centi(wallet))
    shortfall = points_centi - deductible
    detail = note if not shortfall else (
        f"{note}；余额不足，另有 {money.format_centi(shortfall)} 积分无法扣回，请人工追偿"
    )
    ledger_entry(
        session,
        wallet,
        kind="reversal",
        delta_centi=-deductible,
        earned_delta_centi=-points_centi,
        note=detail,
        reference=order.order_no,
        order_id=order.id,
    )
    #: 只把**真正扣回的部分**结清：还有短差时保留短差，而不是清零。
    order.referral_reward_points_centi = shortfall
    session.flush()
    return deductible


def withdraw_fee(points_centi: int, fee_percent: float) -> tuple[int, int]:
    """返回 ``(手续费厘, 实际到账厘)``。手续费不足 0.01 部分舍去。"""
    return money.withdraw_fee_centi(int(points_centi), fee_percent)


def create_withdrawal(
    session: Session,
    wallet: ReferralWallet,
    *,
    points_centi: int,
    request_key: str,
    fee_percent: float,
) -> ReferralWithdrawal:
    """新建提现申请，并把对应积分**原子地**冻结。
    """
    existing = session.scalars(
        select(ReferralWithdrawal).where(ReferralWithdrawal.request_key == request_key)
    ).first()
    if existing is not None:
        return existing

    frozen_before = int(wallet.frozen_centi or 0)
    claimed = session.execute(
        update(ReferralWallet)
        .where(
            ReferralWallet.id == wallet.id,
            func.coalesce(ReferralWallet.frozen_centi, 0) == frozen_before,
            (
                func.coalesce(ReferralWallet.balance_centi, 0)
                - func.coalesce(ReferralWallet.frozen_centi, 0)
            )
            >= int(points_centi),
        )
        .values(
            frozen_centi=func.coalesce(ReferralWallet.frozen_centi, 0) + int(points_centi)
        )
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount == 0:
        raise WalletConflictError("可用余额不足，或钱包刚刚被其它操作改过，请重试。")

    fee_centi, net_centi = withdraw_fee(points_centi, fee_percent)
    withdrawal = ReferralWithdrawal(
        id=new_uuid(),
        wallet_id=wallet.id,
        account_id=wallet.account_id,
        request_key=request_key,
        points_centi=int(points_centi),
        fee_bps=money.percent_to_bps(fee_percent),
        fee_points_centi=fee_centi,
        net_points_centi=net_centi,
        status="pending",
    )
    session.add(withdrawal)
    session.flush()

    session.refresh(wallet)
    ledger_entry(
        session,
        wallet,
        kind="freeze",
        note="提现申请冻结",
        reference=withdrawal.id,
    )
    return withdrawal


def resolve_withdrawal(
    session: Session,
    withdrawal: ReferralWithdrawal,
    *,
    approve: bool,
    note: str = "",
) -> ReferralWithdrawal:
    """审批一笔待处理提现。**抢单式**：只有把状态从 pending 改走的那一次才动钱包。
    """
    if withdrawal.status != "pending":
        return withdrawal
    wallet = session.get(ReferralWallet, withdrawal.wallet_id)
    if wallet is None:
        return withdrawal

    target_status = "paid" if approve else "rejected"
    claimed = session.execute(
        update(ReferralWithdrawal)
        .where(
            ReferralWithdrawal.id == withdrawal.id,
            ReferralWithdrawal.status == "pending",
        )
        .values(status=target_status, note=note, resolved_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount == 0:
        #: 别人刚刚处理完这笔；刷新一次让调用方看到真实终态，但绝不再记账。
        session.refresh(withdrawal)
        return withdrawal

    points_centi = int(withdrawal.points_centi or 0)
    if approve:
        ledger_entry(
            session,
            wallet,
            kind="withdrawal",
            delta_centi=-points_centi,
            frozen_delta_centi=-points_centi,
            #: ``withdrawn`` 也走同一个写入点，保持「钱包聚合值只有一个写入点」。
            withdrawn_delta_centi=points_centi,
            note=note or "提现完成",
            reference=withdrawal.id,
            #: 下界守卫：冻结额是「余额里被预留的那一份」，正常情况下 balance >= frozen，
            min_balance_centi=0,
        )
    else:
        ledger_entry(
            session,
            wallet,
            kind="release",
            frozen_delta_centi=-points_centi,
            note=note or "提现未通过，积分退回",
            reference=withdrawal.id,
        )

    session.refresh(withdrawal)
    session.flush()
    return withdrawal
