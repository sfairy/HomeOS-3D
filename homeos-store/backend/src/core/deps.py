"""API 层公共依赖：数据库会话、登录态，以及按主键取行的几个共用查询。"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import StoreSettings
from ..core.models import Account, AccountSession, Order
from ..security.security import token_hash, utcnow

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
        return None
    if request.method in ACTIVITY_METHODS:
        seen = record.last_seen_at or record.created_at
        if seen is None or (moment - seen).total_seconds() >= LAST_SEEN_REFRESH_SECONDS:
            record.last_seen_at = moment
            session.flush()
    return record


def current_session(request: Request, session: DbSession) -> AccountSession | None:
    """当前会话记录（Cookie → AccountSession）；没有会话或已过期返回 None。"""
    return _resolve_session(request, session)


CurrentSession = Annotated[AccountSession | None, Depends(current_session)]


def current_account(session: DbSession, record: CurrentSession) -> Account | None:
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


def require_admin(account: AuthedAccount, record: CurrentSession) -> Account:
    """后台门槛：账号本身是管理员，且**本次登录**也是管理员会话。

    只看 account.is_admin 会让两类状态漏过去：运营刚把某人提权、但他的旧会话仍是
    普通会话（后台入口该立刻出现）；或者该账号被降权后旧会话还留着后台入口。
    is_admin_session 由登录/提权时在服务端写入，降权时随会话一起清掉。
    """
    if not account.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限。"
        )
    if record is None or not record.is_admin_session:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="管理员登录状态已失效，请重新登录。",
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
