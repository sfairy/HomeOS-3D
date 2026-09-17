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


def expire_stale_orders(session: Session, settings: StoreSettings) -> int:
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
    """
    moment = utcnow()
    ttl = timedelta(seconds=max(0, int(settings.order_ttl_seconds or 0)))
    legacy_before = moment - ttl
    stale = session.scalars(
        select(Order)
        .where(Order.status == "pending")
        .where(
            or_(
                Order.expires_at <= moment,
                and_(Order.expires_at.is_(None), Order.created_at <= legacy_before),
            )
        )
    ).all()
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
        product = session.get(Product, order.product_id) if order.product_id else None
        fulfill.release_order_reservation(session, order=order, product=product)
        coupons.release_coupon(session, order)
    if expired:
        session.flush()
    return expired
