"""API 层公共依赖：数据库会话、登录态，以及按主键取行的几个共用查询。"""

from __future__ import annotations

from typing import Annotated, Iterator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.store.core.models import Account, AccountSession, Order
from apps.store.config import StoreSettings
from apps.store.security.security import token_hash, utcnow

#: ``last_seen_at`` 的写入节流窗口（秒）。诊断页要回答"这个会话现在还有人用吗"，
LAST_SEEN_REFRESH_SECONDS = 60

ACTIVITY_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def get_session(request: Request) -> Iterator[Session]:
    database = request.app.state.database
    with database.session() as session:
        yield session


DbSession = Annotated[Session, Depends(get_session, scope="function")]


def _resolve_session(request: Request, session: Session) -> AccountSession | None:
    """按 Cookie 找回当前会话。**这个函数不写库**。
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
    """
    order = session.scalars(select(Order).where(Order.order_no == order_no)).first()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")
    return order
