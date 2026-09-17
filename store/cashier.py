"""模拟收银台的短时票据：签发、查询、清理（S53）。

背景与取舍放在这里，因为它决定了三处代码的形状（``store/payments/mock.py``
把票据拼进页面地址、``store/api/pages.py`` 校验票据并在页面里擦掉查询串、
本模块负责有效期与清理）。

**要解决的问题**：模拟收银台的地址是给「扫码的人」用的 —— 扫码方没有登录态，
凭证只能跟着 URL 走。以前跟的是订单的 ``lookup_token``：长期有效、能查订单详情、
还能调 ``mock/pay`` 的 bearer 凭据。URL 会进访问日志、``Referer``、浏览器历史，
于是「转发一张收银台链接」等于转发订单查询入口。

**修法**：URL 里只放一张短时票据 —— 与订单绑定、30 分钟有效、只能用来打开这笔
订单的收银台。它既不是订单查询凭证，也换不出授权；页面加载后立刻把查询串从地址栏
与历史记录里抹掉（``history.replaceState``），因此后续跳转的 ``Referer`` 是干净的。

**为什么不做成一次性**：这张票据的唯一入口是二维码/链接，作废会让「扫完关掉再扫
一次」「按 F5」「同一张单第二次打开」全部失效；而可重复使用的代价只是一个 30 分钟、
限定单笔订单、只在模拟渠道下存在的窗口。真正的收益是「URL 里不再有长期凭据」，
不是这一层 —— 所以这里选择可用性，并在审计记录里写明这处偏离。
"""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from store.models import CashierTicket, Order, utcnow
from store.security import new_token, token_hash

logger = logging.getLogger("store.cashier")

#: 票据有效期。取 30 分钟：远长于待支付订单本身的有效期（默认 120 秒，超时后
#: 页面也没什么可付的了），又短到「一条泄漏的日志」没有长期价值。
TICKET_TTL_SECONDS = 30 * 60

#: 每笔订单同时保留的票据上限。用户反复点「继续支付」会不断签发新票据，超出就
#: 把最旧的删掉 —— 留着没用，而这张表不该被一个按钮点成垃圾场。
MAX_TICKETS_PER_ORDER = 5


def _prune_expired(session: Session, *, order_id: str | None = None) -> None:
    """顺手清掉过期票据与同单超量的旧票据。

    刻意不做成后台任务：这张表只在模拟渠道下产生、数量级极小，而「签发时顺手清」
    没有额外调度，也不会漏掉没有巡检的场景。
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

    两个条件缺一不可：只看「存在这张票据」会让 A 单的票据打开 B 单的收银台
    （票据是 bearer 凭据，绑定关系必须在服务端校验，不能靠 URL 里的订单号）。
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
