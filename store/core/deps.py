"""API 层公共依赖：数据库会话、登录态，以及按主键取行的几个共用查询。"""

from __future__ import annotations

from typing import Annotated, Iterator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from store.core.models import Account, AccountSession, Order
from store.config import StoreSettings
from store.security.security import token_hash, utcnow

#: ``last_seen_at`` 的写入节流窗口（秒）。诊断页要回答"这个会话现在还有人用吗"，
#: 但每个请求都写一次会把 SQLite 变成写热点，所以最多每分钟落一次盘。
LAST_SEEN_REFRESH_SECONDS = 60

#: 只有这些方法算「用户做了点什么」，才值得刷 ``last_seen_at``。SQLite 写锁从**第一条写语句**开始
#: 持有到事务提交（提交在请求收尾），所以在读路径上写一行等于让这个 GET 在剩余生命周期里占着写锁 ——
#: 一个用户刷十遍账号中心就把全站下单串十次。反过来写方法本来就要写库，边际成本为零。代价是「只在
#: 浏览、不做操作」的会话 ``last_seen_at`` 会停在最后一次操作上，但这个字段回答的是「还有人在用吗」、
#: 与浏览无关。
ACTIVITY_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def get_session(request: Request) -> Iterator[Session]:
    database = request.app.state.database
    with database.session() as session:
        yield session


#: ``scope="function"`` 是这里的正确性关键，不是性能开关。``database.session()`` 在上下文退出时
#: ``commit()``，用默认的 ``scope="request"`` 时这次提交排在**响应已经发出之后**，会出现「用户已经
#: 拿到订单号，提交却失败了」这种无法挽回的状态：下单接口只 ``flush()`` 而响应体里带着订单号，支付宝
#: 通知接口先回 ``success`` 再提交、提交失败时永不重推，形成没有凭证的悬款。改成 ``function`` 后收尾
#: 在响应送出**之前**执行：提交失败变成真实 5xx，抛 ``HTTPException`` 时仍走 ``except`` 分支回滚。
DbSession = Annotated[Session, Depends(get_session, scope="function")]


def _resolve_session(request: Request, session: Session) -> AccountSession | None:
    """按 Cookie 找回当前会话。**这个函数不写库**。
    过期会话行不再在读路径上顺手删除（那会让每个带旧 Cookie 的 GET 都开写事务），改由例行维护
    ``expiry.prune_expired_sessions`` 收拾 —— 它不依赖流量与渠道配置，没人访问也该发生。
    刷 ``last_seen_at`` 仍然做，但只在**用户确实做了点什么**的请求上（见 ``ACTIVITY_METHODS``）。
    """
    token = request.cookies.get(request.app.state.settings.cookie_name)
    if not token:
        return None
    record = session.get(AccountSession, token_hash(token))
    if record is None:
        return None
    moment = utcnow()
    if record.expires_at <= moment:
        # 只回答「这个会话不能用」，不做任何清理。
        return None
    # 会话活跃时间：不更新的话诊断里永远显示成登录时间，判断不出"还在用 / 早就不用了"。
    if request.method in ACTIVITY_METHODS:
        seen = record.last_seen_at or record.created_at
        if seen is None or (moment - seen).total_seconds() >= LAST_SEEN_REFRESH_SECONDS:
            record.last_seen_at = moment
            session.flush()
    return record


def current_account(request: Request, session: DbSession) -> Account | None:
    record = _resolve_session(request, session)
    if record is None:
        return None
    account = session.get(Account, record.account_id)
    if account is None or not account.is_active:
        return None
    return account


CurrentAccount = Annotated[Account | None, Depends(current_account)]


def require_account(account: CurrentAccount) -> Account:
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录。"
        )
    return account


AuthedAccount = Annotated[Account, Depends(require_account)]


def require_admin(account: AuthedAccount) -> Account:
    if not account.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限。"
        )
    return account


AdminAccount = Annotated[Account, Depends(require_admin)]


def get_settings(request: Request) -> StoreSettings:
    return request.app.state.settings


SettingsDep = Annotated[StoreSettings, Depends(get_settings)]


def order_or_404(session: Session, order_no: str) -> Order:
    """按订单号取订单；取不到就 404「订单不存在。」。
    放在这里而不是各自的 API 模块：后台（``api/admin.py``）与前台（``api/pages.py``）都要按同一个
    单号取单，且这条 404 文案不该有两套说法 —— 改一处漏一处就会让同一个事实在两个界面上长得不一样。
    """
    order = session.scalars(select(Order).where(Order.order_no == order_no)).first()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")
    return order
