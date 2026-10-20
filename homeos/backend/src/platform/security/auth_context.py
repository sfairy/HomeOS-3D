"""鉴权依赖：DB 会话解析与登录守卫。

会话真相源是 homeos-3d 的 ``sessions`` 表（``LoginSession``）：Cookie
``settings.cookie_name`` 携带不透明令牌，落库形态为其 sha256，因而会话**可服务端吊销**，
并自带滑动续期。

**无角色维度**：HomeOS 是单一管理员模型 —— 注册即唯一账号，库里不存在非管理员用户
（也没有创建其他账号的入口，见 ``api/auth.py``）。因此这里只提供「是否已登录」这一种
判定，没有角色守卫；授权边界落在「登录会话 + 授权许可（license）」两层上。

返回字典形状（``userId`` / ``username`` / ``restrictions``）保持稳定，使业务路由调用点零改动。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .session_store import (
    LAST_SEEN_REFRESH_SECONDS,
    session_token_hash,
    set_session_cookie,
)
from ..core.deps import get_session
from ..core.errors import unauthorized
from ..core.models import LoginSession, User

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def _settings(request: Request):
    return request.app.state.settings


def resolve_restrictions(preferences: Any = None) -> list[str] | None:
    """实体级白名单限制：**刻意未实现**，恒返回 ``None``。

    这是与角色无关的独立维度（per-entity whitelist）。HomeOS 现行模型不做实体级收敛，
    只靠「登录 + 许可」两层把关；保留签名以免 Agent / MCP / 备份路径的调用点断裂。
    请勿假设返回值非空 —— 该字段目前恒为空列表 / ``None``。
    """
    return None


def _user_from_db(user: Any) -> dict[str, Any]:
    """把 ORM ``User`` 归一成守卫链使用的用户字典。

    ``mfa`` 恒记 ``True``：DB 会话只在完整登录之后才签发，会话本身即代表已通过登录校验。
    """
    return {
        "userId": user.id,
        "username": user.username,
        "restrictions": resolve_restrictions(getattr(user, "preferences", None)),
        "mfa": True,
        "notificationPrefs": {},
        "allowedSceneIds": None,
    }


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def authenticate_session(
    request: Request, response: Response, session: Session
) -> User | None:
    """HTTP 请求唯一的 DB 会话入口：解析 + 滑动续期 + 回写 Cookie。

    设计要点：

    - **Cookie 与服务端记录同寿**：会话记录续期后立即把新的到期时间写回 Cookie，
      否则服务端已续、浏览器却按旧期限丢弃 Cookie，表现为「用着用着就掉线」。
    - 只有超过 ``LAST_SEEN_REFRESH_SECONDS`` 才写库与 ``Set-Cookie``，避免只读请求
      写放大（与 ``session_store.resolve_login_session`` 的阈值一致）。
    - 过期、账号删除 / 停用的会话立即清理并返回 ``None``（吊销即时生效）。

    不用 ``session_store.resolve_login_session`` 是因为那个函数不返回「是否续期」
    的信号，而这里必须知道该不该补 ``Set-Cookie``；两处阈值与判定保持同源常量。
    """
    settings = _settings(request)
    token = request.cookies.get(settings.cookie_name, "")
    if not token:
        return None
    # 一次 outer join 同时取会话与用户：原先 select(LoginSession) + session.get(User) 是
    # 每个受保护请求 2 次 SQLite；合并后 1 次。用 outer join 而不是 inner join，是为了在
    # 「用户已被删除」时仍能拿到会话行并清理它（inner join 会让该行永远留在库里）。
    row = session.execute(
        select(LoginSession, User)
        .outerjoin(User, User.id == LoginSession.user_id)
        .where(LoginSession.id_hash == session_token_hash(token))
    ).first()
    if row is None:
        return None
    record, user = row
    now = datetime.now(UTC)
    if _aware(record.expires_at) <= now:
        session.delete(record)
        session.commit()
        return None
    max_age = settings.session_max_age_seconds
    if now - _aware(record.last_seen_at) >= timedelta(seconds=LAST_SEEN_REFRESH_SECONDS):
        record.last_seen_at = now
        record.expires_at = now + timedelta(seconds=max_age)
        session.commit()
        set_session_cookie(
            response, settings, token, max_age_seconds=max_age, request=request
        )
    if user is None or not getattr(user, "is_active", True):
        session.delete(record)
        session.commit()
        return None
    return user


def get_current_user(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """解析当前用户；无有效会话时抛 401。

    同步实现是有意的：FastAPI 会把同步依赖丢到线程池，SQLite 查询不占事件循环。
    """
    user = authenticate_session(request, response, session)
    if user is not None:
        return _user_from_db(user)
    return unauthorized("未登录或登录已过期")


async def require_user(
    request: Request, user: dict[str, Any] = Depends(get_current_user)
) -> dict[str, Any]:
    """受保护路由：已通过会话校验即放行（单一管理员模型，无角色判定）。"""
    return user


__all__ = [
    "authenticate_session",
    "get_current_user",
    "require_user",
]
