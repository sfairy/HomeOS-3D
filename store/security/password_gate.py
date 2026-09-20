"""登录与验证码的失败限流（基于数据库，跨进程一致）。"""

from __future__ import annotations

import time
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from store.core.models import LoginAttempt, utcnow

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

    ``max_attempts`` 允许不同 scope 用不同阈值：例如「按账号」必须卡得很紧（保护
    单个账号），而「按来源 IP」要放宽（同一个出口 NAT 后面可能坐着整间办公室）。
    阈值放在**判断时**而不是记录时，是因为同一张表要服务多档策略。
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
    """清理过期记录，避免表无限增长。"""
    cutoff = utcnow() - timedelta(hours=6)
    session.execute(delete(LoginAttempt).where(LoginAttempt.created_at < cutoff))


#: 上次清理的时间（``time.monotonic()``）。进程级即可：清理是幂等的，
#: 多个 worker 同时各清一次没有副作用，只是为了别在每个请求里都跑一次 DELETE。
_last_prune_at: float = 0.0


def maybe_prune(session: Session, *, interval_seconds: float = 3600.0) -> bool:
    """按时间节流地调用 :func:`prune`，返回本次是否真的执行了清理。

    ``prune`` 之前定义却没人调用，这张表只增不减且每次失败尝试都写一行，长期运行会拖慢
    每次 ``_count_recent`` 的全表扫描。挂在登录与验证码这两条本来就要写的路径上最省事。
    """
    global _last_prune_at
    now = time.monotonic()
    if interval_seconds > 0 and now - _last_prune_at < interval_seconds:
        return False
    _last_prune_at = now
    prune(session)
    return True
