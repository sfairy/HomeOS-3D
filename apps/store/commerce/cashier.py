"""模拟收银台的短时票据：签发、查询、清理。
"""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from apps.store.core.models import CashierTicket, Order, utcnow
from apps.store.security.security import new_token, token_hash

logger = logging.getLogger("apps.store.commerce.cashier")

#: 票据有效期 30 分钟：远长于待支付订单本身的有效期（默认 120 秒），又短到「一条
TICKET_TTL_SECONDS = 30 * 60

#: 每笔订单同时保留的票据上限。用户反复点「继续支付」会不断签发新票据，超出就把最旧的
MAX_TICKETS_PER_ORDER = 5


def _prune_expired(session: Session, *, order_id: str | None = None) -> None:
    """顺手清掉过期票据与同单超量的旧票据。
    """
    moment = utcnow()
    session.execute(delete(CashierTicket).where(CashierTicket.expires_at <= moment))
    if not order_id:
        return
    rows = session.scalars(
        select(CashierTicket)
        .where(CashierTicket.order_id == order_id)
        .order_by(CashierTicket.created_at.desc(), CashierTicket.id.desc())
    ).all()
    for stale in rows[MAX_TICKETS_PER_ORDER:]:
        session.delete(stale)


def issue_ticket(session: Session, order: Order) -> str:
    """为这笔订单签一张新票据，返回**明文**（库里只存哈希）。"""
    _prune_expired(session, order_id=order.id)
    token = new_token(24)
    session.add(
        CashierTicket(
            order_id=order.id,
            token_hash=token_hash(token),
            expires_at=utcnow() + timedelta(seconds=TICKET_TTL_SECONDS),
        )
    )
    session.flush()
    return token


def find_ticket(session: Session, order: Order, token: str | None) -> CashierTicket | None:
    """按明文票据取出未过期、且确实属于这笔订单的记录。
    """
    if not token:
        return None
    row = session.scalars(
        select(CashierTicket).where(CashierTicket.token_hash == token_hash(token))
    ).first()
    if row is None or row.order_id != order.id:
        return None
    if row.expires_at <= utcnow():
        return None
    return row
