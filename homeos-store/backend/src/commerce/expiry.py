"""本地例行收尾：待支付订单的过期处理 + 过期登录会话的清理（都与支付渠道无关）。
"""

from __future__ import annotations

import logging

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..commerce import fulfill
from ..config import StoreSettings
from ..core.models import AccountSession, Order, Product, utcnow

logger = logging.getLogger("src.commerce.expiry")

#: 单次调用最多处理多少笔超时单。请求路径上的清点是「顺带做」，而积压可能是积了一整天
EXPIRE_BATCH_LIMIT = 200

#: 单次最多删多少条过期登录会话（见 :func:`prune_expired_sessions`）。
SESSION_PRUNE_BATCH = 500


def _products_in(session: Session, product_ids) -> dict[str, Product]:
    wanted = {item for item in product_ids if item}
    if not wanted:
        return {}
    return {
        product.id: product
        for product in session.scalars(select(Product).where(Product.id.in_(wanted)))
    }


def expire_stale_orders(
    session: Session, settings: StoreSettings, *, limit: int = EXPIRE_BATCH_LIMIT
) -> int:
    """把超时的待支付订单置为 expired，并释放占用的库存与优惠码。
    """
    moment = utcnow()
    query = (
        select(Order)
        .where(Order.status == "pending")
        .where(Order.expires_at <= moment)
        #: 按过期时间正序 + 批内主键定序有两个作用：每轮都从最老的开始，有上限也不会让老单
        .order_by(Order.expires_at.asc(), Order.id.asc())
        .limit(max(0, int(limit)))
    )
    stale = session.scalars(query).all()
    products = _products_in(session, (order.product_id for order in stale))
    expired = 0
    for order in stale:
        product = products.get(order.product_id or "")
        if not fulfill.close_pending_order(
            session, order=order, product=product, status="expired", moment=moment
        ):
            # 已被别的路径处理（支付/取消/其它线程的扫描），副作用由它负责。
            continue
        expired += 1
    if expired:
        session.flush()
    return expired


def prune_expired_sessions(
    session: Session, *, now=None, limit: int = SESSION_PRUNE_BATCH
) -> int:
    """删掉已经过期的登录会话行，返回删除条数。
    """
    moment = now or utcnow()
    ids = list(
        session.scalars(
            select(AccountSession.id_hash)
            .where(AccountSession.expires_at <= moment)
            .limit(max(1, int(limit)))
        )
    )
    if not ids:
        return 0
    deleted = session.execute(
        delete(AccountSession).where(AccountSession.id_hash.in_(ids))
    ).rowcount  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
    session.flush()
    return int(deleted or 0)
