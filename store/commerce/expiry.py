"""本地例行收尾：待支付订单的过期处理 + 过期登录会话的清理（都与支付渠道无关）。

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

同一个理由让 :func:`prune_expired_sessions` 也住在这里，而且**只**挂在巡检上：
过期登录会话的删除原本藏在认证依赖里（每个带旧 Cookie 的请求顺手删一行），
那正是 S28 —— 读请求变成写热点。它是同一类「没人访问也要发生」的收尾，所以换了
一个执行者，而不是被取消。
"""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session

from store.commerce import fulfill
from store.config import StoreSettings
from store.core.models import AccountSession, Order, Product, utcnow

logger = logging.getLogger("store.commerce.expiry")

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

#: 单次最多删多少条过期登录会话（见 :func:`prune_expired_sessions`）。
#: 与 ``EXPIRE_BATCH_LIMIT`` 同一个理由：一次清空整表可能是几十万行，
#: 而它占用的写锁会把同时段的下单一起挡住。删不完的留给下一轮，反正巡检一直在跑。
SESSION_PRUNE_BATCH = 500


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
    """删掉已经过期的登录会话行，返回删除条数（S28）。

    这些行的删除原本在认证依赖里（``deps._resolve_session``）顺手做，而那是**读
    路径**：每个带着过期 Cookie 的 GET 都会开一个写事务，并在请求剩下的整个生命
    周期里持有 SQLite 的写锁 —— 一份浏览器一直带在身上的旧 Cookie 就能把全站的写
    请求串起来。认证依赖现在只回答「这个会话不能用」，清理搬到这里，由支付巡检
    定时执行：它无流量、未配渠道也照跑（见模块顶部），正好是「没人访问也要发生」
    这件事的正确执行者。

    先 ``SELECT`` 再决定要不要 ``DELETE``：稳态下绝大多数轮次是「没有过期的」，
    而一条无匹配的 ``DELETE`` 在 SQLite 里同样会开写事务 —— 那会把「巡检每 30 秒
    一次」变成「每 30 秒抢一次写锁」。一次带索引的 ``SELECT`` 只读，值得。
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
    ).rowcount
    session.flush()
    return int(deleted or 0)
