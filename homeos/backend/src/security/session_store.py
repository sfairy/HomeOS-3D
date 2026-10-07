"""DB 会话（LoginSession）：签发 / 解析 / 吊销 与 Cookie 读写。

并入 homeos-3d 的会话模型后，会话不再只依赖无状态 JWT，而是在 ``sessions`` 表里留一条
``id_hash``（会话令牌的 sha256）记录，因而可以**服务端吊销**，并能看到最后活跃时间与
来源 IP/UA。

过渡策略：JWT 通道**保留**（``security.auth_context.get_current_user`` 两路都认），
现有前端与既有会话不受影响；新登录同时写入 DB 会话，供移植自 homeos-3d 的路由
（其 ``dependencies`` 读 ``settings.cookie_name`` 口径）与可吊销需求使用。
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..core.models import LoginSession, User

#: 活跃时间刷新阈值：低于此间隔不写库，避免只读请求产生写放大。
LAST_SEEN_REFRESH_SECONDS = 300


def new_session_token() -> str:
    """生成不可预测的会话令牌（URL-safe，256 位熵）。"""
    return secrets.token_urlsafe(32)


def session_token_hash(token: str) -> str:
    """会话令牌的 sha256 十六进制（落库形态；令牌原文绝不持久化）。"""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def create_login_session(
    session: Session, request: Request, user_id: str, *, max_age_seconds: int
) -> str:
    """为用户签发一条 DB 会话，返回令牌原文。

    调用方负责 ``session.commit()``（与业务写入放在同一事务里）。
    """
    token = new_session_token()
    ip_address = request.client.host if request.client else ""
    session.add(
        LoginSession(
            id_hash=session_token_hash(token),
            user_id=user_id,
            expires_at=datetime.now(UTC) + timedelta(seconds=max_age_seconds),
            ip_address=ip_address[:64],
            user_agent=request.headers.get("user-agent", "")[:512],
        )
    )
    return token


def resolve_login_session(
    session: Session, token: str, *, max_age_seconds: int | None = None
) -> User | None:
    """按会话令牌解析用户。

    - 过期记录顺带清理并返回 ``None``；
    - 传入 ``max_age_seconds`` 时执行**滑动续期**（超过刷新阈值才写库）。
    """
    if not token:
        return None
    record = session.scalar(
        select(LoginSession).where(LoginSession.id_hash == session_token_hash(token))
    )
    if record is None:
        return None
    now = datetime.now(UTC)
    if _aware(record.expires_at) <= now:
        session.delete(record)
        session.commit()
        return None
    if max_age_seconds is not None and now - _aware(record.last_seen_at) >= timedelta(
        seconds=LAST_SEEN_REFRESH_SECONDS
    ):
        # 滑动续期：仅超过阈值才写库，避免只读请求产生写放大。
        record.last_seen_at = now
        record.expires_at = now + timedelta(seconds=max_age_seconds)
        session.commit()
    return session.get(User, record.user_id)


def revoke_login_session(session: Session, token: str) -> str | None:
    """吊销一条 DB 会话，返回其所属 ``user_id``（不存在时为 ``None``）。"""
    if not token:
        return None
    record = session.scalar(
        select(LoginSession).where(LoginSession.id_hash == session_token_hash(token))
    )
    if record is None:
        return None
    user_id = record.user_id
    session.execute(
        delete(LoginSession).where(LoginSession.id_hash == session_token_hash(token))
    )
    return user_id


def clear_login_sessions(session: Session, user_id: str) -> None:
    """吊销某用户的全部 DB 会话（改密 / 降权 / 删除账号时调用）。"""
    session.execute(delete(LoginSession).where(LoginSession.user_id == user_id))


def set_session_cookie(response: Response, settings, token: str, *, max_age_seconds: int) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        max_age=max_age_seconds,
        expires=datetime.now(UTC) + timedelta(seconds=max_age_seconds),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, settings) -> None:
    response.delete_cookie(settings.cookie_name, path="/")


def session_expiry(max_age_seconds: int) -> datetime:
    """会话绝对过期时刻（供需要显式回传 ``expires_at`` 的端点使用）。"""
    return datetime.now(UTC) + timedelta(seconds=max_age_seconds)


__all__ = [
    "LAST_SEEN_REFRESH_SECONDS",
    "clear_login_sessions",
    "clear_session_cookie",
    "create_login_session",
    "new_session_token",
    "resolve_login_session",
    "revoke_login_session",
    "session_expiry",
    "session_token_hash",
    "set_session_cookie",
]
