"""本地待支付订单的过期收尾（与支付渠道无关）。

为什么单独成模块
----------------
订单超时的收尾过去只挂在「有流量才会被执行」的请求路径上（账号中心轮询、后台
列表、下单前的自查都顺手调一次）。于是有两种情况会让超时单**永远**没人处理：

- 商店一整天没人访问，后台也没人打开 —— 没有任何请求，也就没人清理；
- 站点没配支付渠道（或渠道凭据不全），支付巡检在第一步就 ``return`` 了 ——
  巡检虽然照常跑，却什么也没做。

后果不是「晚一点清理」这么轻：那笔单一直占着库存预留与优惠码名额，别的用户看到
的是「已售罄」，而它本人还会被「有未完成订单」挡住不能再下单。

所以这份逻辑必须同时被两条路径复用：请求路径（顺带清理）与后台巡检
（``payments.sweeper``，无流量、未配渠道也照样跑）。放在这里是为了让两边**共用
同一份实现** —— 各写一份条件 UPDATE 迟早会在某一边漏掉归还预留那一步。
"""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import and_, or_, select, update
from sqlalchemy.orm import Session

from store import coupons, fulfill
from store.config import StoreSettings
from store.models import Order, Product, utcnow

logger = logging.getLogger("store.expiry")

#: 单次调用最多处理多少笔超时单。
#:
#: 请求路径上的调用是「顺带清理」，而积压可能是「一整天（或一整个周末）没人访问」
#: 攒出来的：不设上限的话，第一个打开的页面就要在自己的请求事务里逐条 UPDATE
#: 并归还预留，一个页面加载被拖成分钟级 —— 而且账号中心、订单历史、下单前自查、
#: 订单轮询这四条**公开**路径都会各自扛一遍。
#:
#: 200 笔足够清掉日常零散积压，又把单次请求的最坏代价封住。完整清理由
#: ``payments.sweeper`` 反复轮转完成 —— 它无流量、未配渠道也照跑（见模块顶部）。
EXPIRE_BATCH_LIMIT = 200


def _products_in(session: Session, product_ids) -> dict[str, Product]:
    """按主键批量取商品；批内商品一次取回，避免逐条 ``session.get``。"""
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

    返回本次真正完成的过期笔数（``0`` 表示没有需要处理的单）。调用方据此决定
    要不要记日志：多数请求路径上这一趟本来就是空的，不该每刷一次列表就写一行。

    这里用**条件 UPDATE 抢单**：账号中心轮询、后台列表、下单前的自查、后台巡检
    会并发调用本函数，两个并发调用会读到同一批 stale 订单，各自释放一次预留 ——
    预留被还了两遍（同类商品立刻虚增可售量）。
    顺带把「读 - 改 - 写」换成一条语句，避免下单瞬间该订单被标记超时后又被
    改成 paid 导致状态回退。

    超时判据必须带 ``expires_at IS NULL`` 的兜底：``NULL <= moment`` 在 SQL 里
    永远是 NULL（不是 true），那些历史遗留、没写进过 ``expires_at`` 的待支付单
    会**永远**扫不到、永远停在 pending 占着预留，而用户本人还会被
    「有未完成订单」挡住不能再下单。对这类单只用 ``created_at`` 按同一套
    TTL 兜底，语义上等价于「它在下单时就该有的那个过期时间」。

    ``limit`` 是**单次调用**的上限（见 :data:`EXPIRE_BATCH_LIMIT`）：请求路径上
    它是「顺带清理」，不该被积压量拖成分钟级；巡检可以把一次清理的量调大，
    因为那不在用户请求里。无论哪种调用，超出上限的旧单只是留给下一次 ——
    按 ``expires_at`` 推进保证不会饿死。
    """
    moment = utcnow()
    ttl = timedelta(seconds=max(0, int(settings.order_ttl_seconds or 0)))
    legacy_before = moment - ttl
    query = (
        select(Order)
        .where(Order.status == "pending")
        .where(
            or_(
                Order.expires_at <= moment,
                and_(Order.expires_at.is_(None), Order.created_at <= legacy_before),
            )
        )
        #: 按过期时间正序 + 批内主键定序有**两个**作用：一是「每轮都从最老的开始」，
        #: 有上限也不会让某笔老单永远排在后面挨饿；二是顺序确定，重复调用结果可复现
        #: （不加 ORDER BY 时 SQLite 的返回顺序是实现细节，测试会写出飘忽的断言）。
        #: ``expires_at`` 为 NULL 的遗留单在 SQLite 的 ASC 里排最前 —— 正合语义。
        .order_by(Order.expires_at.asc(), Order.id.asc())
        .limit(max(0, int(limit)))
    )
    stale = session.scalars(query).all()
    products = _products_in(session, (order.product_id for order in stale))
    expired = 0
    for order in stale:
        claimed = session.execute(
            update(Order)
            .where(Order.id == order.id)
            .where(Order.status == "pending")
            .values(status="expired", cancelled_at=moment)
            .execution_options(synchronize_session=False)
        )
        if claimed.rowcount == 0:
            # 已被别的路径处理（支付/取消/其它线程的扫描），副作用由它负责。
            continue
        expired += 1
        product = products.get(order.product_id or "")
        fulfill.release_order_reservation(session, order=order, product=product)
        coupons.release_coupon(session, order)
    if expired:
        session.flush()
    return expired
