"""邀请与积分账本。

积分口径：1 积分 = 1 元。奖励 = 实付金额（元）× 奖励比例。
保留两位小数，不足 0.01 的部分直接舍去（与参考站说明一致）。
"""

from __future__ import annotations

import logging
import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from store.models import (
    Account,
    Order,
    ReferralLedger,
    ReferralWallet,
    ReferralWithdrawal,
    utcnow,
)
from store.security import new_referral_code, new_uuid

logger = logging.getLogger("store.referrals")


def _floor2(value: float) -> float:
    return math.floor(round(float(value or 0.0) * 100)) / 100


def get_or_create_wallet(session: Session, account: Account) -> ReferralWallet:
    wallet = session.scalars(
        select(ReferralWallet).where(ReferralWallet.account_id == account.id)
    ).first()
    if wallet is not None:
        return wallet
    wallet = ReferralWallet(
        account_id=account.id,
        code=account.referral_code or _unique_code(session, account),
    )
    session.add(wallet)
    session.flush()
    return wallet


def _unique_code(session: Session, account: Account) -> str:
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
            session.flush()
            return candidate
    raise RuntimeError("无法生成唯一邀请码，请稍后重试。")


def available_points(wallet: ReferralWallet | None) -> float:
    """可用积分 = 余额 - 冻结。

    这是全站唯一的口径：``balance`` 是「已经赚到的总额（含正在提现的部分）」，
    ``frozen`` 是「已申请提现、还没结算的部分」。界面上叫「可用积分」，提现
    校验也必须用这个数 —— 这两处口径曾经不一致（界面按 balance-frozen 显示、
    提现接口却只比 balance），于是「可用 0 元」的用户仍能提交提现申请，
    申请一路走到后台审核才被人工拒绝。
    """
    if wallet is None:
        return 0.0
    return round(
        max(0.0, float(wallet.balance or 0.0) - float(wallet.frozen or 0.0)), 2
    )


def is_self_referral(session: Session, referrer: Account | None, account: Account) -> bool:
    """判断「自己邀请自己」。

    两种形态都要拦：同一个账号（``referred_by_account_id == 自己的 id``，理论上
    注册流程已挡），以及**同一个邮箱/同一个邀请码持有者开小号**（这才是实际
    能刷到积分的路径：注册 A、拿 A 的码注册 B、用 B 下单给自己返点）。
    邮箱是这套系统里唯一的身份标识，因此按它判定。
    """
    if referrer is None or account is None:
        return True
    if referrer.id == account.id:
        return True
    referrer_email = (referrer.email or "").strip().lower()
    account_email = (account.email or "").strip().lower()
    return bool(referrer_email) and referrer_email == account_email


def ledger_entry(
    session: Session,
    wallet: ReferralWallet,
    *,
    kind: str,
    delta: float = 0.0,
    frozen_delta: float = 0.0,
    note: str = "",
    reference: str | None = None,
    order_id: str | None = None,
) -> ReferralLedger:
    wallet.balance = round(float(wallet.balance or 0.0) + float(delta), 2)
    wallet.frozen = round(float(wallet.frozen or 0.0) + float(frozen_delta), 2)
    entry = ReferralLedger(
        wallet_id=wallet.id,
        account_id=wallet.account_id,
        kind=kind,
        delta=round(float(delta), 2),
        frozen_delta=round(float(frozen_delta), 2),
        balance_after=wallet.balance,
        frozen_after=wallet.frozen,
        note=note,
        reference=reference,
        order_id=order_id,
    )
    session.add(entry)
    session.flush()
    return entry


def reward_points_for(order: Order, rate_percent: float) -> float:
    """按实付金额计算奖励积分。免费订单不参与奖励。"""
    if not order.amount_cents or order.amount_cents <= 0:
        return 0.0
    amount_yuan = float(order.amount_cents) / 100.0
    return _floor2(amount_yuan * float(rate_percent) / 100.0)


def grant_order_reward(
    session: Session,
    *,
    order: Order,
    rate_percent: float,
    enabled: bool,
) -> float:
    """订单履约成功后给邀请人记奖励。返回实际发放的积分。"""
    if not enabled or not order.account_id:
        return 0.0
    buyer = session.get(Account, order.account_id)
    if buyer is None or not buyer.referred_by_account_id:
        return 0.0

    referrer = session.get(Account, buyer.referred_by_account_id)
    if referrer is None or not referrer.is_active:
        return 0.0
    # 自邀（同账号 / 同邮箱开小号）不发奖励：否则「自己下单给自己返点」等于
    # 把奖励比例变成永久折扣，比例设得高一点就能刷出负毛利。
    if is_self_referral(session, referrer, buyer):
        logger.warning(
            "检测到自邀并跳过奖励 buyer=%s referrer=%s order=%s",
            buyer.email,
            referrer.email,
            order.order_no,
        )
        return 0.0

    points = reward_points_for(order, rate_percent)
    if points <= 0:
        return 0.0

    wallet = get_or_create_wallet(session, referrer)
    ledger_entry(
        session,
        wallet,
        kind="reward",
        delta=points,
        note=f"好友订单 {order.order_no} 实付奖励",
        reference=order.order_no,
        order_id=order.id,
    )
    wallet.earned = round(float(wallet.earned or 0.0) + points, 2)
    order.referral_reward_points = points
    session.flush()
    return points


def reverse_order_reward(session: Session, *, order: Order, note: str = "订单退款，奖励退回") -> float:
    """退款时把已发放的奖励扣回。返回**实际扣回**的积分。

    余额必须夹到 0：邀请人可能已经把积分提现了（余额不足），此时硬扣会写出
    负数余额 —— 负数余额意味着「账本上先欠着」，而系统没有任何追偿手段，
    它只会让邀请人的可用积分变成负数、再也提不出钱，同时把总负债算错。
    实际扣不回来的差额记进流水备注，作为追偿依据。
    """
    if not order.referral_reward_points or order.referral_reward_points <= 0:
        return 0.0
    if not order.account_id:
        return 0.0
    buyer = session.get(Account, order.account_id)
    if buyer is None or not buyer.referred_by_account_id:
        return 0.0
    referrer = session.get(Account, buyer.referred_by_account_id)
    if referrer is None:
        return 0.0
    wallet = get_or_create_wallet(session, referrer)
    points = round(float(order.referral_reward_points), 2)
    # 冻结部分不能动（那笔钱已经进入提现审批），所以可扣上限是「余额 - 冻结」。
    deductible = min(points, available_points(wallet))
    shortfall = round(points - deductible, 2)
    detail = note if not shortfall else f"{note}；余额不足，另有 {shortfall:.2f} 积分无法扣回，请人工追偿"
    ledger_entry(
        session,
        wallet,
        kind="reversal",
        delta=-deductible,
        note=detail,
        reference=order.order_no,
        order_id=order.id,
    )
    wallet.earned = round(max(0.0, float(wallet.earned or 0.0) - points), 2)
    order.referral_reward_points = 0.0
    session.flush()
    return deductible


def withdraw_fee(points: float, fee_percent: float) -> tuple[float, float]:
    """返回 (手续费, 实际到账)。手续费不足 0.01 部分舍去。"""
    gross_cents = int(round(float(points) * 100))
    bps = int(round(float(fee_percent) * 100))
    fee_cents = gross_cents * bps // 10000
    fee_points = fee_cents / 100.0
    net_points = (gross_cents - fee_cents) / 100.0
    return round(fee_points, 2), round(net_points, 2)


def create_withdrawal(
    session: Session,
    wallet: ReferralWallet,
    *,
    points: float,
    request_key: str,
    fee_percent: float,
) -> ReferralWithdrawal:
    existing = session.scalars(
        select(ReferralWithdrawal).where(ReferralWithdrawal.request_key == request_key)
    ).first()
    if existing is not None:
        return existing

    fee_points, net_points = withdraw_fee(points, fee_percent)
    withdrawal = ReferralWithdrawal(
        id=new_uuid(),
        wallet_id=wallet.id,
        account_id=wallet.account_id,
        request_key=request_key,
        points=round(float(points), 2),
        fee_percent=round(float(fee_percent), 2),
        fee_points=fee_points,
        net_points=net_points,
        status="pending",
    )
    session.add(withdrawal)
    session.flush()

    ledger_entry(
        session,
        wallet,
        kind="freeze",
        frozen_delta=withdrawal.points,
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
    if withdrawal.status != "pending":
        return withdrawal
    wallet = session.get(ReferralWallet, withdrawal.wallet_id)
    if wallet is None:
        return withdrawal

    if approve:
        ledger_entry(
            session,
            wallet,
            kind="withdrawal",
            delta=-withdrawal.points,
            frozen_delta=-withdrawal.points,
            note=note or "提现完成",
            reference=withdrawal.id,
        )
        wallet.withdrawn = round(float(wallet.withdrawn or 0.0) + withdrawal.points, 2)
        withdrawal.status = "paid"
    else:
        ledger_entry(
            session,
            wallet,
            kind="release",
            frozen_delta=-withdrawal.points,
            note=note or "提现未通过，积分退回",
            reference=withdrawal.id,
        )
        withdrawal.status = "rejected"

    withdrawal.note = note
    withdrawal.resolved_at = utcnow()
    session.flush()
    return withdrawal
