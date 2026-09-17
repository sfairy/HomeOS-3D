"""API 层公共依赖：数据库会话与登录态。"""

from __future__ import annotations

from typing import Annotated, Iterator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from store.models import Account, AccountSession
from store.config import StoreSettings
from store.security import token_hash, utcnow

#: ``last_seen_at`` 的写入节流窗口（秒）。诊断页要回答"这个会话现在还有人用吗"，
#: 但每个请求都写一次会把 SQLite 变成写热点，所以最多每分钟落一次盘。
LAST_SEEN_REFRESH_SECONDS = 60


def get_session(request: Request) -> Iterator[Session]:
    database = request.app.state.database
    with database.session() as session:
        yield session


#: ``scope="function"`` 是这里的正确性关键，不是性能开关。
#:
#: ``database.session()`` 在上下文退出时 ``commit()``。用默认的
#: ``scope="request"`` 时，依赖的收尾（也就是这次提交）排在**响应已经发出之后** ——
#: 于是会出现「用户已经拿到订单号，提交却失败了」这种无法挽回的状态：下单接口
#: 全程只 ``flush()``，响应体里就带着订单号，而支付宝通知接口先回 ``success``
#: 再提交，提交失败时支付宝永不重推，形成没有任何凭证的悬款。
#:
#: 改成 ``scope="function"`` 后，收尾在响应送出**之前**执行：提交失败会变成一次
#: 真实的 5xx，客户端不会拿到一个不存在的订单号；而抛 ``HTTPException`` 时
#: 依旧走 ``except`` 分支回滚，语义不变。
DbSession = Annotated[Session, Depends(get_session, scope="function")]


def _resolve_session(request: Request, session: Session) -> AccountSession | None:
    token = request.cookies.get(request.app.state.settings.cookie_name)
    if not token:
        return None
    record = session.get(AccountSession, token_hash(token))
    if record is None:
        return None
    moment = utcnow()
    if record.expires_at <= moment:
        session.delete(record)
        session.flush()
        return None
    # 会话活跃时间：不更新的话诊断里永远显示成登录时间，判断不出"还在用 / 早就不用了"。
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
