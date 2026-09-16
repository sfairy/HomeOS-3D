"""邀请与积分账本。

积分口径：1 积分 = 1 元。奖励 = 实付金额（元）× 奖励比例。
保留两位小数，不足 0.01 的部分直接舍去（与参考站说明一致）。
"""

from __future__ import annotations

import logging
import math

from sqlalchemy import func, select, update
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


class WalletConflictError(RuntimeError):
    """并发改动同一本钱包时的冲突（调用方应当提示重试，而不是当成 500）。

    为什么需要一个专门的异常：钱包的 ``balance`` / ``frozen`` 是**读-改-写**的
    聚合值，而提现是「先校验可用积分、再冻结」的两步动作。两个请求各自读到
    ``frozen = 0`` 就会各自冻结成功，而第二次写入会把第一次的冻结覆盖掉 ——
    账面上冻结了 100，实际却挂着两笔各 100 的待审提现，两次审批后 ``frozen``
    变成 -100、``withdrawn`` 翻倍，而且 ``available_points`` 用
    ``max(0, balance - frozen)`` 还会把额度「还」回来，可以反复刷。
    """


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


def _apply_wallet_delta(
    session: Session,
    wallet: ReferralWallet,
    *,
    delta: float,
    frozen_delta: float,
) -> tuple[float, float]:
    """把余额变动写成**一条 SQL** 并返回改动后的 ``(balance, frozen)``。

    为什么不能用 ``wallet.balance = wallet.balance + delta``：那是「读-改-写」，
    两个并发请求（两笔订单同时结算、提现申请与退款回退交叠）会各自基于同一个旧值
    计算，后写的一方把先写的一方整个覆盖掉 —— 账本少记一笔，且没有任何报错。

    这里交给 SQLite 在一条语句里完成「读当前值 + 加 delta」，并用 ``COALESCE``
    兜住历史数据里的 NULL（``NULL + 1`` 在 SQL 里是 NULL，漏掉会让钱包余额直接
    变成空值）。

    刻意**不**在这里夹到非负：能不能扣、扣多少是业务规则（见
    ``reverse_order_reward`` 的「可扣上限 = 余额 - 冻结」），账本层擅自夹会让
    「该扣的没扣到」变成静默发生的事，而那正是需要被记进流水备注去追偿的。
    """
    values: dict[str, object] = {}
    if delta:
        values["balance"] = func.round(
            func.coalesce(ReferralWallet.balance, 0.0) + float(delta), 2
        )
    if frozen_delta:
        values["frozen"] = func.round(
            func.coalesce(ReferralWallet.frozen, 0.0) + float(frozen_delta), 2
        )
    if values:
        session.execute(
            update(ReferralWallet)
            .where(ReferralWallet.id == wallet.id)
            .values(**values)
            .execution_options(synchronize_session=False)
        )
        session.refresh(wallet)
    return float(wallet.balance or 0.0), float(wallet.frozen or 0.0)


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
    balance, frozen = _apply_wallet_delta(
        session, wallet, delta=delta, frozen_delta=frozen_delta
    )
    entry = ReferralLedger(
        wallet_id=wallet.id,
        account_id=wallet.account_id,
        kind=kind,
        delta=round(float(delta), 2),
        frozen_delta=round(float(frozen_delta), 2),
        #: 记的是**数据库里算出来的**结果，而不是本地推导的期望值。两者不一致时
        #: 这个字段就是发现「有人绕过账本直接改钱包」的唯一线索。
        balance_after=balance,
        frozen_after=frozen,
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
    """新建提现申请，并把对应积分**原子地**冻结。

    冻结这一步刻意用条件 UPDATE 抢单（``where frozen == 读到的值``）而不是
    直接用 ``ledger_entry`` 累加。原因是「可用积分够不够」是调用方基于读到的
    ``frozen`` 做的判断，与写入之间存在窗口：

    ｜ 请求 A 读到 frozen=0，算出可用 100，申请提现 100 ｜ 请求 B 同样读到 frozen=0 ｜
    ｜ 两次都通过校验、各插一条 pending 流水，而 frozen 被覆盖成同一个值 ｜

    结果账面只冻结了 100，却挂着两笔 100 的待审提现；两次审批后 ``frozen`` 变负、
    ``withdrawn`` 翻倍，而 ``available_points`` 用 ``max(0, balance - frozen)``
    还会把额度「还」回来 —— 可以反复套现。

    条件 UPDATE 把「校验」与「写入」压进同一条语句：``rowcount == 0`` 说明
    期间有人改过钱包，直接抛 :class:`WalletConflictError` 让调用方提示重试。
    这与 ``_claim_refund_amount`` 是同一套写法。
    """
    existing = session.scalars(
        select(ReferralWithdrawal).where(ReferralWithdrawal.request_key == request_key)
    ).first()
    if existing is not None:
        return existing

    frozen_before = round(float(wallet.frozen or 0.0), 2)
    claimed = session.execute(
        update(ReferralWallet)
        .where(
            ReferralWallet.id == wallet.id,
            #: 用 round 后的值比对，避免浮点误差让「没人改过」也被判成冲突
            func.round(func.coalesce(ReferralWallet.frozen, 0.0), 2) == frozen_before,
        )
        .values(
            frozen=func.round(
                func.coalesce(ReferralWallet.frozen, 0.0) + round(float(points), 2), 2
            )
        )
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount == 0:
        raise WalletConflictError("钱包刚刚被其它操作改过，请重试。")

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

    #: 抢单已经把钱加进 frozen 了，这里只补一条流水（frozen_delta=0 避免加两次），
    #: 用 ``session.refresh`` 取到数据库里的真实值写进 balance_after/frozen_after。
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

    双击审批（或运营两个标签页同时点）在过去会把同一笔提现结算两次：
    ``frozen`` 被扣两次、``withdrawn`` 加两次。这里的条件 UPDATE 保证
    「状态迁移」与「记账」是同一个原子动作，``rowcount == 0`` 说明别人已经处理过，
    直接返回即可（重复点击对用户表现为「已处理」，不会再动账）。
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
        #: ``withdrawn`` 也是聚合值，必须原子自增：两次审批并发时会互相覆盖。
        session.execute(
            update(ReferralWallet)
            .where(ReferralWallet.id == wallet.id)
            .values(
                withdrawn=func.round(
                    func.coalesce(ReferralWallet.withdrawn, 0.0) + withdrawal.points, 2
                )
            )
            .execution_options(synchronize_session=False)
        )
    else:
        ledger_entry(
            session,
            wallet,
            kind="release",
            frozen_delta=-withdrawal.points,
            note=note or "提现未通过，积分退回",
            reference=withdrawal.id,
        )

    session.refresh(withdrawal)
    session.flush()
    return withdrawal
