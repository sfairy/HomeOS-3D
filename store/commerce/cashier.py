"""模拟收银台的短时票据：签发、查询、清理。

模拟收银台地址是给扫码方用的，扫码方没有登录态，凭证只能跟着 URL 走。以前跟的是订单
的 ``lookup_token``（长期有效、能查订单详情），而 URL 会进日志、``Referer`` 与浏览器
历史，转发一张收银台链接等于转发订单查询入口。改成短时票据后，URL 里只剩「与订单绑定、
30 分钟有效、只能打开这笔订单收银台」的凭据，页面加载后立刻把查询串从地址栏抹掉。

**为什么不做成一次性**：票据的唯一入口是二维码/链接，作废会让「扫完关掉再扫」「按 F5」
全部失效；可重复使用的代价只是一个 30 分钟、限定单笔订单、只在模拟渠道下存在的窗口。
"""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from store.core.models import CashierTicket, Order, utcnow
from store.security.security import new_token, token_hash

logger = logging.getLogger("store.commerce.cashier")

#: 票据有效期 30 分钟：远长于待支付订单本身的有效期（默认 120 秒），又短到「一条
#: 泄漏的日志」没有长期价值。
TICKET_TTL_SECONDS = 30 * 60

#: 每笔订单同时保留的票据上限。用户反复点「继续支付」会不断签发新票据，超出就把最旧的
#: 删掉 —— 留着没用，而这张表不该被一个按钮点成垃圾场。
MAX_TICKETS_PER_ORDER = 5


def _prune_expired(session: Session, *, order_id: str | None = None) -> None:
    """顺手清掉过期票据与同单超量的旧票据。

    刻意不做成后台任务：这张表只在模拟渠道下产生、数量级极小，签发时顺手清即可。
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

    绑定关系必须在服务端校验：只看「存在这张票据」会让 A 单的票据打开 B 单的收银台。
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
