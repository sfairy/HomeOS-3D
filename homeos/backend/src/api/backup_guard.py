"""恢复类端点共用的「管理员密码再验证」门（``/api/v1/backups`` 与 ``/api/v1/system/backup``）。

为什么需要它：业务备份恢复与服务器快照恢复都会**整体覆盖数据库**（含账号与授权），
是整套系统里破坏力最大的两个写入。只有「当前已登录」不足以证明此刻是本人操作 ——
一条被窃取的会话 Cookie、一段 XSS 就足以让攻击者清库并换成自己的数据。因此这两处
写入前必须重输当前管理员密码。

限流维度是「用户 + 会话令牌哈希」而不是来源 IP：同一个局域网里不同会话要各自计数；
爆破者换 IP 也不该绕过同一会话的失败上限（而按 IP 限流会让 NAT 后的其他人被连坐）。
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from ..platform.core.db.models import User
from ..platform.security.login_limiter import retry_after_headers
from ..platform.security.passwords import verify_password
from ..platform.security.session_store import session_token_hash

#: 备份类操作的限流作用域前缀。两类恢复共用一份失败计数：它们能造成的后果等价，
#: 分开计数只会给爆破者多一倍尝试次数。
BACKUP_PASSWORD_SCOPE = "backup-restore"


def owner_session_key(request: Request, user: dict[str, Any]) -> str:
    """「用户 + 会话」维度的归属键（票据绑定与密码限流共用）。"""
    token = request.cookies.get(request.app.state.settings.cookie_name, "") or ""
    return f"{user.get('userId')}:{session_token_hash(token)}"


def _verify_admin_password_blocking(
    request: Request,
    user: dict[str, Any],
    password: str,
    *,
    scope: str = BACKUP_PASSWORD_SCOPE,
) -> JSONResponse | None:
    """校验当前管理员密码（同步实现，只允许经 ``asyncio.to_thread`` 调用）。

    ``None`` 表示通过（调用方可以继续执行破坏性写入），否则返回**应当直接回给客户端**
    的响应对象（429 限流 / 401 密码错误），调用方原样 return 即可。

    为什么独立出同步实现：这里的 ``database.session_factory`` 是同步 SQLAlchemy 会话，
    ``verify_password`` 是 argon2id（默认 64 MiB / 数十毫秒 CPU）。两者直接在 async
    路由里执行会冻结事件循环，期间 WebSocket 推送、健康检查与其他请求全部停顿。
    限流器 ``LoginAttemptLimiter`` 自带 ``threading.Lock``，整个函数放进线程池是安全的。
    """
    gate = getattr(request.app.state, "business_backup", None)
    limiter = getattr(gate, "backup_password_limiter", None)
    limiter_key = f"{scope}:{owner_session_key(request, user)}"
    if limiter is not None and limiter.blocked(limiter_key):
        return JSONResponse(
            status_code=429,
            content={"detail": "密码尝试过多，请稍后再试。"},
            headers=retry_after_headers(limiter.retry_after(limiter_key)),
        )

    database = getattr(request.app.state, "database", None)
    admin = None
    if database is not None:
        with database.session_factory() as session:
            admin = session.scalar(select(User).where(User.id == user["userId"]))
    if admin is None or not verify_password(password, admin.password):
        if limiter is not None:
            limiter.record_failure(limiter_key)
        return JSONResponse(status_code=401, content={"detail": "当前管理员密码不正确。"})

    if limiter is not None:
        limiter.reset(limiter_key)
    return None


async def verify_admin_password(
    request: Request,
    user: dict[str, Any],
    password: str,
    *,
    scope: str = BACKUP_PASSWORD_SCOPE,
) -> JSONResponse | None:
    """异步门：DB 读取与 argon2 校验整体丢进线程池，避免阻塞事件循环。

    返回语义与同步实现完全一致（``None`` 通过 / 429 或 401 响应对象）；调用方直接
    ``await`` 后原样 return 错误响应即可，状态码与响应体不变。
    """
    return await asyncio.to_thread(
        _verify_admin_password_blocking, request, user, password, scope=scope
    )


__all__ = ["BACKUP_PASSWORD_SCOPE", "owner_session_key", "verify_admin_password"]
