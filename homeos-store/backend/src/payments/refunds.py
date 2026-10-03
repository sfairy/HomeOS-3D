"""退款流水的落库辅助。
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass

from sqlalchemy import func, insert, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from ..core.models import Order, OrderRefund
from ..ops import incidents
from ..security.security import utcnow

logger = logging.getLogger("src.payments.refunds")

__all__ = [
    "REFUND_UNSETTLED_STATUSES",
    "claim_refund_amount",
    "open_refund_gate",
    "persist_refund_result",
    "record_refund_audit",
    "record_refund_in_new_session",
    "refund_by_request_no",
    "refund_lock",
    "refund_request_no",
    "unsettled_refund",
    "write_refund_result",
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
def refund_lock(order_no: str) -> Generator[None]:
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


REFUND_UNSETTLED_STATUSES = frozenset({"running", "processing"})


def refund_request_no(order_no: str, target_cents: int) -> str:
    """同一笔退款的确定性幂等键：``RF{订单号}-{累计目标金额}``。

    以前每次点击都随机（``RF{订单号}-{uuid4 前 8 位}``），渠道的幂等去重形同失效：
    运营在「失败」后重试一次，就是**真的再退一笔**，多次部分退款还会层层叠加。
    金额必须进键：多次部分退款要用不同的幂等号，而**同一笔退款的重试必须逐字相同**。
    """
    return f"RF{order_no}-{int(target_cents)}"[:128]


def refund_by_request_no(session: Session, out_request_no: str) -> OrderRefund | None:
    """按幂等号取退款流水：一次退款动作在任何时刻最多一行。"""
    return session.scalars(
        select(OrderRefund).where(OrderRefund.out_request_no == out_request_no)
    ).first()


def unsettled_refund(session: Session, *, order_id: str) -> OrderRefund | None:
    """该订单上仍未定论的退款（``processing``）。

    用来拦住最危险的一种操作：一笔退款超时后，运营换个金额再退一次 —— 前一笔可能
    已经在渠道侧退了钱，两笔叠加就是超额退款。
    """
    return session.scalars(
        select(OrderRefund)
        .where(OrderRefund.order_id == order_id)
        .where(OrderRefund.status == "processing")
        .order_by(OrderRefund.created_at.desc())
    ).first()


def _gate_verdict(row: OrderRefund) -> str:
    """:func:`open_refund_gate` 的裁决：``settled`` 不能再退、``in_flight`` 等一会儿、
    ``retry`` 可以带着同一个幂等号继续调渠道。
    """
    if row.status == "succeeded":
        return "settled"
    if row.status == "running":
        return "in_flight"
    return "retry"


def open_refund_gate(session: Session, refund: OrderRefund) -> tuple[str, OrderRefund | None]:
    """调渠道**之前**用独立事务落一条 ``running`` 流水，返回闸门结论。

    独立事务 + ``out_request_no`` 唯一索引才是真正的闸门：进程内锁只挡得住单进程，
    而渠道退款不可逆、可能跨进程/跨重启。返回值与 :func:`_gate_verdict` 一致，
    另加 ``"open"`` 表示本次是新占位成功、可以调渠道。
    """
    factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False, future=True)
    with factory() as gate:
        existing = refund_by_request_no(gate, refund.out_request_no)
        if existing is not None:
            return _gate_verdict(existing), existing
        try:
            gate.execute(
                insert(OrderRefund).values(
                    id=refund.id,
                    order_id=refund.order_id,
                    order_no=refund.order_no,
                    out_request_no=refund.out_request_no,
                    amount_cents=int(refund.amount_cents or 0),
                    status="running",
                    detail="",
            reason=refund.reason or "",
                    offline=refund.offline,
                    operator=refund.operator,
                    created_at=refund.created_at or utcnow(),
                )
            )
            gate.commit()
        except IntegrityError:
            gate.rollback()
            existing = refund_by_request_no(gate, refund.out_request_no)
            if existing is None:
                raise
            return _gate_verdict(existing), existing
    return "open", None


def write_refund_result(
    session: Session,
    *,
    out_request_no: str,
    status: str,
    amount_cents: int,
    trade_no: str | None = None,
    detail: str = "",
) -> int:
    """把一次退款的结果写进**当前事务**（成功路径与订单累计值一起提交）。"""
    values: dict[str, object] = {
        "status": status,
        "amount_cents": int(amount_cents),
        "detail": (detail or "")[:255],
    }
    if trade_no:
        values["trade_no"] = trade_no
    result = session.execute(
        update(OrderRefund)
        .where(OrderRefund.out_request_no == out_request_no)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    return int(result.rowcount)  # type: ignore[reportAttributeAccessIssue]


def persist_refund_result(
    session: Session,
    *,
    out_request_no: str,
    status: str,
    amount_cents: int,
    trade_no: str | None = None,
    detail: str = "",
) -> bool:
    """在独立事务里落退款结果：失败/处理中的分支随后要 409 回滚，必须单独留痕。"""
    factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False, future=True)
    try:
        with factory() as probe:
            if write_refund_result(
                probe,
                out_request_no=out_request_no,
                status=status,
                amount_cents=amount_cents,
                trade_no=trade_no,
                detail=detail,
            ) != 1:
                logger.error(
                    "退款流水不存在，结果未能落库 out_request_no=%s", out_request_no
                )
                return False
            probe.commit()
    except SQLAlchemyError:
        logger.error(
            "退款结果落库失败 out_request_no=%s status=%s",
            out_request_no,
            status,
            exc_info=True,
        )
        return False
    return True

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
