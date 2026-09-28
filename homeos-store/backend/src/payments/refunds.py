"""退款流水的落库辅助。
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass

from sqlalchemy import func, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from ..core.models import Order, OrderRefund
from ..ops import incidents

logger = logging.getLogger("src.payments.refunds")

__all__ = [
    "claim_refund_amount",
    "record_refund_audit",
    "record_refund_in_new_session",
    "refund_lock",
]


def record_refund_in_new_session(session: Session, refund: OrderRefund) -> bool:
    """在独立事务里写入一条退款流水，返回是否写入成功。
    """
    factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False, future=True)
    try:
        with factory() as probe:
            probe.add(refund)
            probe.commit()
    except SQLAlchemyError:
        logger.warning(
            "退款流水写入失败 order=%s out_request_no=%s",
            refund.order_no,
            refund.out_request_no,
            exc_info=True,
        )
        return False
    return True


#: 按订单号的进程内互斥锁表（值 = [锁, 持有者计数]）。
#: 放在这里而不是接口层：退款是**渠道侧会真的动钱**的操作，同一订单的两笔并发退款
#: 会让累计额度算错，所以这道锁与退款记账属于同一个关注点。
@dataclass
class _RefundLock:
    """一把锁加上等待它的持锁者计数。原先写成 ``[Lock(), 0]``，被推断成
    ``list[Lock | int]``，``holders + 1`` / ``entry[1] <= 1`` 都会报运算符错误。
    """

    lock: threading.Lock
    holders: int


_refund_locks: dict[str, _RefundLock] = {}
_refund_locks_guard = threading.Lock()


@contextmanager
def refund_lock(order_no: str) -> Generator[None, None, None]:
    """按订单号取一把进程内互斥锁，保证同一订单的退款不会交叠。"""
    with _refund_locks_guard:
        entry = _refund_locks.get(order_no)
        if entry is None:
            entry = _RefundLock(threading.Lock(), 0)
            _refund_locks[order_no] = entry
        lock = entry.lock
        entry.holders += 1
    lock.acquire()
    try:
        yield
    finally:
        lock.release()
        with _refund_locks_guard:
            entry = _refund_locks.get(order_no)
            #: 只在「还是同一把锁」时才动计数：期间可能有人把表项删掉重建了。
            if entry is not None and entry.lock is lock:
                if entry.holders <= 1:
                    del _refund_locks[order_no]
                else:
                    entry.holders -= 1


def claim_refund_amount(session: Session, order, *, seen_cents: int, add_cents: int) -> bool:
    """把本次退款金额并进累计值，条件是「累计值仍是本次读到的那个」（CAS）。

    返回 False = 期间有人改过累计值 —— 调用方必须**放弃本次记账**而不是覆盖，
    否则两笔并发退款会互相盖掉，累计额度少算、后面那笔还能再退一次。
    """
    claimed = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(func.coalesce(Order.refund_amount_cents, 0) == seen_cents)
        .values(refund_amount_cents=seen_cents + add_cents)
        .execution_options(synchronize_session=False)
    )
    return claimed.rowcount == 1  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性


def record_refund_audit(session: Session, refund: OrderRefund) -> bool:
    """把退款流水写进独立事务，**写不进去必须留痕**。

    这个函数只在「渠道那边已经动过钱、本地必须记账」的分支里被调用。它以前把失败
    静默吞掉（只写一条 warning）：结果是渠道已退款、本地没有流水行、order 的
    refund_amount_cents 也没被推进 —— 对账时这笔钱在系统里根本不存在。
    """
    if record_refund_in_new_session(session, refund):
        return True
    incidents.note(
        "refund.ledger",
        order_no=refund.order_no,
        error=f"退款流水写入失败 out_request_no={refund.out_request_no}",
    )
    logger.error(
        "退款流水写入失败（渠道侧已退款，需人工核对）order=%s out_request_no=%s",
        refund.order_no,
        refund.out_request_no,
    )
    return False
