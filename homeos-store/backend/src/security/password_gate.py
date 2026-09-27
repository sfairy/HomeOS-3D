"""登录与验证码的失败限流（基于数据库，跨进程一致）。"""

from __future__ import annotations

import time
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..core.models import LoginAttempt, utcnow

MAX_ATTEMPTS = 8
WINDOW_MINUTES = 10


def record_attempt(session: Session, scope: str, *, succeeded: bool) -> None:
    session.add(LoginAttempt(scope=scope, succeeded=succeeded))
    session.flush()


def _count_recent(session: Session, scope: str) -> int:
    since = utcnow() - timedelta(minutes=WINDOW_MINUTES)
    statement = (
        select(func.count())
        .select_from(LoginAttempt)
        .where(LoginAttempt.scope == scope)
        .where(LoginAttempt.succeeded.is_(False))
        .where(LoginAttempt.created_at >= since)
    )
    return int(session.execute(statement).scalar_one() or 0)


def recent_failures(session: Session, scope: str) -> int:
    """返回该 scope 在窗口内的失败次数（只读，供告警/观测用）。"""
    return _count_recent(session, scope)


def retry_after_seconds(
    session: Session, scope: str, *, max_attempts: int = MAX_ATTEMPTS
) -> int:
    """超限时返回需要等待的秒数，未超限返回 0。
    """
    failures = _count_recent(session, scope)
    if failures < max_attempts:
        return 0
    since = utcnow() - timedelta(minutes=WINDOW_MINUTES)
    oldest = session.execute(
        select(func.min(LoginAttempt.created_at))
        .where(LoginAttempt.scope == scope)
        .where(LoginAttempt.succeeded.is_(False))
        .where(LoginAttempt.created_at >= since)
    ).scalar_one_or_none()
    if oldest is None:
        return 0
    elapsed = (utcnow() - oldest).total_seconds()
    return max(1, int(WINDOW_MINUTES * 60 - elapsed))


def clear(session: Session, scope: str) -> None:
    session.execute(delete(LoginAttempt).where(LoginAttempt.scope == scope))


def prune(session: Session) -> None:
    cutoff = utcnow() - timedelta(hours=6)
    session.execute(delete(LoginAttempt).where(LoginAttempt.created_at < cutoff))


#: 上次清理的时间（``time.monotonic()``）。进程级即可：清理是幂等的，
_last_prune_at: float = 0.0


def maybe_prune(session: Session, *, interval_seconds: float = 3600.0) -> bool:
    """按时间节流地调用 :func:`prune`，返回本次是否真的执行了清理。
    """
    global _last_prune_at
    now = time.monotonic()
    if interval_seconds > 0 and now - _last_prune_at < interval_seconds:
        return False
    _last_prune_at = now
    prune(session)
    return True
