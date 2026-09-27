"""访问主体的唯一解析实现：一次请求（或一条连接）到底是谁。
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Mapping

from sqlalchemy import select
from sqlalchemy.orm import Session

from .display_access import active_display_device
from ..core.models import DisplayDevice, LoginSession, User
from .security import session_token_hash
from ..core.time_utils import ensure_aware

#: 会话滑动续期的写库节流窗口（秒）。展示页与编辑器的轮询是秒级的，
SESSION_REFRESH_INTERVAL_SECONDS = 300


@dataclass(frozen=True)
class ViewerPrincipal:
    """一次请求的访问主体：管理员账号，或一台已配对的中控设备。
    """

    user: User | None = None
    display: DisplayDevice | None = None

    @property
    def project_id(self) -> str | None:
        """该主体被限定到的项目 ID；None 表示不受限（管理员会话）。"""
        return self.display.project_id if self.display is not None else None

    @property
    def is_admin_session(self) -> bool:
        """是否为管理员会话（中控设备为 False）。"""
        return self.user is not None


@dataclass(frozen=True)
class AdminSessionCheck:
    """管理员会话 Cookie 的校验结果；不含任何写操作。
    """

    #: 校验通过时的用户；未通过一律为 None。
    user: User | None = None
    #: 命中的会话行（无论是否有效），供调用方清理。
    record: LoginSession | None = None
    #: 会话行存在但已失效（滑动过期或超过绝对寿命），调用方应当把它删掉。
    expired: bool = False
    #: 本次调用是否已经把滑动有效期往后推（调用方要据此重发 Cookie）。
    renewed: bool = False

    @property
    def ok(self) -> bool:
        return self.user is not None


@dataclass(frozen=True)
class PrincipalResolution:
    """一次凭据解析的完整结果。"""

    viewer: ViewerPrincipal
    admin: AdminSessionCheck

    @property
    def authenticated(self) -> bool:
        """是否解析出了主体（两种身份都没有时为 False）。"""
        return self.viewer.user is not None or self.viewer.display is not None


def admin_token_from(cookies: Mapping[str, str], settings) -> str:
    """从 Cookie 里取出管理员会话令牌原文（没有则空串）。"""
    return (cookies.get(settings.cookie_name, '') or '').strip()


def display_token_from(cookies: Mapping[str, str], settings) -> str:
    """从 Cookie 里取出中控令牌原文（没有则空串）。"""
    return (cookies.get(settings.display_cookie_name, '') or '').strip()


def _positive_seconds(value) -> int:
    """把配置里的秒数读成正整数；缺失或非正值一律当 0（表示不设限）。"""
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return 0
    return seconds if seconds > 0 else 0


def check_admin_session(
    database: Session,
    settings,
    token: str,
    *,
    account_user_id: str | None,
    refresh: bool = False,
    now: datetime | None = None,
) -> AdminSessionCheck:
    """校验管理员会话 Cookie，返回「是谁」以及要不要续期 / 清理。
    """
    if account_user_id is None or not token:
        return AdminSessionCheck()
    moment = now or datetime.now(timezone.utc)
    record = database.scalar(
        select(LoginSession).where(LoginSession.id_hash == session_token_hash(token))
    )
    if record is None:
        return AdminSessionCheck()
    if ensure_aware(record.expires_at) <= moment:
        # 滑动有效期已过：记录还在（管理员列表里还能看到并手动退出），但不再放行。
        return AdminSessionCheck(record=record, expired=True)
    hard_max_age = _positive_seconds(getattr(settings, 'session_hard_max_age_seconds', 0))
    if hard_max_age and moment >= ensure_aware(record.created_at) + timedelta(seconds=hard_max_age):
        # 绝对寿命先到：滑动续期不能突破它。
        return AdminSessionCheck(record=record, expired=True)
    if record.user_id != account_user_id:
        # 不是当前管理员的会话：不动它（它可能仍然有效，只是不该走这条入口）。
        return AdminSessionCheck(record=record)
    user = database.get(User, record.user_id)
    if user is None or not user.is_active:
        return AdminSessionCheck(record=record)
    renewed = False
    if refresh:
        max_age = _positive_seconds(getattr(settings, 'session_max_age_seconds', 0))
        interval = min(SESSION_REFRESH_INTERVAL_SECONDS, max(1, max_age // 2))
        if moment - ensure_aware(record.last_seen_at) >= timedelta(seconds=interval):
            record.last_seen_at = moment
            record.expires_at = moment + timedelta(seconds=max_age)
            database.commit()
            renewed = True
    return AdminSessionCheck(user=user, record=record, renewed=renewed)


def discard_expired_session(database: Session, session: AdminSessionCheck) -> None:
    """删掉已失效的会话行（只有真的存在且已失效时才写库）。
    """
    if session.expired and session.record is not None:
        database.delete(session.record)
        database.commit()


def resolve_principal(
    database: Session,
    settings,
    *,
    admin_token: str = '',
    display_token: str = '',
    account_user_id: str | None = None,
    refresh_admin_session: bool = False,
    now: datetime | None = None,
) -> PrincipalResolution:
    """凭据解析的唯一入口：管理员会话优先，其次中控配对。
    """
    admin = check_admin_session(
        database,
        settings,
        admin_token,
        account_user_id=account_user_id,
        refresh=refresh_admin_session,
        now=now,
    )
    if admin.ok:
        return PrincipalResolution(viewer=ViewerPrincipal(user=admin.user), admin=admin)
    display = (
        active_display_device(database, settings, display_token, now=now)
        if display_token
        else None
    )
    return PrincipalResolution(viewer=ViewerPrincipal(display=display), admin=admin)
