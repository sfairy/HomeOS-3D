"""邀请与积分账本。

积分口径：1 积分 = 1 元，奖励 = 实付金额（元）× 奖励比例，不足 0.01 的部分舍去。
**单位**：账本里所有积分都是 ``int`` 厘（1 积分 = 100 厘），运算交给
:mod:`store.commerce.money`；用整数是因为浮点会让 SQL 与 Python 的舍入规则
（half-away / half-even）在 ``.xx5`` 上分叉，提现的并发比对会误报冲突。
"""

from __future__ import annotations

import logging

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from store.commerce import money
from store.core.models import (
    Account,
    Order,
    ReferralLedger,
    ReferralWallet,
    ReferralWithdrawal,
    utcnow,
)
from store.security.security import new_referral_code, new_uuid

logger = logging.getLogger("store.commerce.referrals")

#: 积分流水类型（``ReferralLedger.kind``）的取值与中文名 —— **后端是唯一出处**。
#:
#: 本模块与 ``api/admin.py`` 的人工调账就是全部写入方，所以词表放在这里。后台的筛选下拉与
#: 流水列表都改由接口下发（``ledger_kind_options``），不再自存一份 —— 自存的那份 6 个键里
#: 只有 ``manual_adjust`` 与后端对得上，而筛选是精确等值匹配，选任何一项都返回空列表。
#: 前台用户流水（store/static/referrals.js）有意使用另一套更口语的说法（如 reward 说成
#: 「邀请奖励」），那是面向用户的措辞，不并入这张账务口径的表。
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

    ``balance_centi`` / ``frozen_centi`` 是读-改-写的聚合值：两个请求各自读到
    ``frozen = 0`` 会各自冻结成功并覆盖对方，账面只冻结一笔却挂着两笔待审提现。
    """


class WalletGuardError(RuntimeError):
    """写入会让钱包违反业务不变式（如余额为负），**不可重试**。

    与冲突的区别在语义：那个是「有人抢先了，重来可能就成了」，这个是「请求本身不合法」，
    所以调用方必须转成 4xx 而不是 503。
    """


def get_or_create_wallet(session: Session, account: Account) -> ReferralWallet:
    """取（必要时建）该账号的积分钱包。

    ``account_id`` 与 ``code`` 都有唯一索引，并发下两条都会撞：插入放在 SAVEPOINT 里，
    撞了只回滚这一次插入，再判断是「复用对手建好的」还是「换一个码重试」。
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

    只做「查」：并发下查出来的空位随时可能被对手先占，真正的占用判定交给唯一索引。
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

    这是全站唯一口径：``balance_centi`` 是已赚到的总额（含正在提现的部分），界面上叫
    「可用积分」，提现校验也必须用它，否则「可用 0 元」的用户仍能提交提现申请。
    """
    if wallet is None:
        return 0
    return max(
        0, int(wallet.balance_centi or 0) - int(wallet.frozen_centi or 0)
    )


def is_self_referral(session: Session, referrer: Account | None, account: Account) -> bool:
    """判断「自己邀请自己」。

    两种形态都要拦：同一个账号，以及**同邮箱开小号**（注册 A、拿 A 的码注册 B、用 B
    下单给自己返点）。邮箱是这套系统里唯一的身份标识，因此按它判定。
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
    """把余额变动写成**一条 SQL** 并返回改动后的 ``(balance_centi, frozen_centi)``。

    不能用 ``wallet.balance_centi += delta``：读-改-写会让并发请求互相覆盖、账本少记
    且不报错。整数列不需要 round；``min_*`` 是可选下界守卫，塞进同一条 UPDATE 的
    ``WHERE``，结果会变成负数的那次匹配不到行（``rowcount == 0``）。
    """
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
        #: 并夹到非负（退回奖励时可能把累计值扣到 0 以下）。
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
    #: 只在**这一列真的要被改动**时才加守卫：历史负值不该让无关写入也被拒绝。
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
        #: 唯一能走到这里的原因是守卫不成立（``id`` 一定存在，调用方刚拿到这本钱包）。
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

    ``min_balance_centi`` / ``min_frozen_centi`` 透传给 :func:`_apply_wallet_delta`
    作为**下界守卫**：不满足时整个写入不生效并抛 ``WalletGuardError``，流水也不会被
    插入（两条语句在同一个事务里，调用方转成 4xx 即可）。
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
        #: 这个字段就是发现「有人绕过账本直接改钱包」的唯一线索。
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
    # 自邀（同账号 / 同邮箱开小号）不发奖励：否则等于把奖励比例变成永久折扣。
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

    可扣上限 = 余额 - 冻结（冻结部分已进入提现审批，动不得）。扣不回来的差额记进
    流水备注作为追偿依据 —— 硬扣会写出负数余额，而系统没有任何追偿手段。
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
    # 冻结部分不能动（那笔钱已经进入提现审批），所以可扣上限是「余额 - 冻结」。
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
        #: 累计获得按**整笔**奖励回退（不是按实际扣回的 deductible）：退款后这笔奖励
        #: 就不存在了，counted 值应回到发放前的口径；夹到 0 由 SQL 完成。
        earned_delta_centi=-points_centi,
        note=detail,
        reference=order.order_no,
        order_id=order.id,
    )
    #: 只把**真正扣回的部分**结清：还有短差时保留短差，而不是清零。
    #: 清零会让这笔债权从账上消失，而短差恰恰最容易发生在「积分正在提现审批中」的时候 ——
    #: 那笔提现一旦被驳回，冻结会回到余额，本该追回的奖励就白拿了，库里却再也查不到欠多少。
    #: 保留短差后，这个字段的含义变成「还没扣回的奖励」，重复调用即继续追偿。
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

    冻结用条件 UPDATE 抢单（``where frozen == 读到的值``），而不是直接累加：否则两个
    请求都读到 frozen=0、都通过校验，账面只冻结一笔却挂着两笔待审提现，甚至可以反复
    套现。``rowcount == 0`` 说明期间有人改过钱包，抛 ``WalletConflictError`` 让调用方重试。
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
        )
        .values(
            frozen_centi=func.coalesce(ReferralWallet.frozen_centi, 0) + int(points_centi)
        )
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount == 0:
        raise WalletConflictError("钱包刚刚被其它操作改过，请重试。")

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

    #: 抢单已加进 frozen，这里只补流水（frozen_delta=0 避免加两次）。
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

    双击审批在过去会把同一笔结算两次；条件 UPDATE 让「状态迁移」与「记账」成为同一个
    原子动作，``rowcount == 0`` 说明别人已处理，直接返回。
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
            #: 所以扣掉冻结额不会让余额变负。但这条不变式可以由**人工调账**打破（后台调账
            #: 允许传负 delta），一旦打破，这里就会把余额写成负数 —— 而负余额会让后续每一笔
            #: 记账都撞守卫。宁可拒绝：CAS 与记账在同一个事务里，抛出去等于整笔回滚、
            #: 申请仍是 pending，运营把钱补回来再点一次即可。调用方须把它转成 4xx。
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
