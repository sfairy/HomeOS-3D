"""鉴权依赖：DB 会话解析与角色守卫。

会话真相源是 homeos-3d 的 ``sessions`` 表（``LoginSession``）：Cookie
``settings.cookie_name`` 携带不透明令牌，落库形态为其 sha256，因而会话**可服务端吊销**，
并自带滑动续期。

函数名与返回字典形状（``userId`` / ``username`` / ``role`` / ``restrictions``）与合并前
保持一致，使 180 余处业务路由调用点零改动；内部实现已从 legacy JWT 收敛为纯 DB 会话。
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .session_store import resolve_login_session
from ..core.app_config import get_auth_config
from ..core.deps import get_session
from ..core.errors import forbidden, unauthorized

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def _settings(request: Request):
    return request.app.state.settings


def resolve_restrictions(role: str, preferences: Any = None) -> list[str] | None:
    """实体级白名单限制（adult/child/guest ACL）：**刻意未实现**，恒返回 ``None``。

    HomeOS 现行模型只用角色（admin/user/child/guest）+ 域级限制
    （见 ``is_child_domain_access_denied``），不做 per-entity whitelist。
    保留签名以免 Agent/MCP / 备份路径的调用点断裂；勿再假设返回值非空。
    """
    return None


def _user_from_db(user: Any) -> dict[str, Any]:
    """把 ORM ``User`` 归一成守卫链使用的用户字典。

    ``mfa`` 恒记 ``True``：DB 会话只在完整登录之后才签发，会话本身即代表已通过登录校验。
    """
    role = user.role or "user"
    return {
        "userId": user.id,
        "username": user.username,
        "role": role,
        "restrictions": resolve_restrictions(role),
        "mfa": True,
        "notificationPrefs": {},
        "allowedSceneIds": None,
    }


async def get_current_user(
    request: Request, session: Session = Depends(get_session)
) -> dict[str, Any]:
    """解析当前用户；无有效会话时抛 401。"""
    settings = _settings(request)
    token = request.cookies.get(settings.cookie_name, "")
    if token:
        user = resolve_login_session(
            session, token, max_age_seconds=settings.session_max_age_seconds
        )
        if user is not None:
            return _user_from_db(user)
    return unauthorized("未登录或登录已过期")


async def require_user(
    request: Request, user: dict[str, Any] = Depends(get_current_user)
) -> dict[str, Any]:
    """受保护路由：已通过会话校验即放行（homeos-3d 为单一管理员模型）。"""
    return user


def require_roles(*roles: str):
    """角色守卫依赖工厂。

    homeos-3d 只存在 ``admin`` 一种角色；保留工厂签名以兼容既有 ``@Roles`` 调用点。
    """

    async def _dependency(
        request: Request, user: dict[str, Any] = Depends(get_current_user)
    ) -> dict[str, Any]:
        role = user.get("role")
        if role == "admin" or role in roles:
            return user
        return forbidden("没有权限执行此操作")

    return _dependency


__all__ = [
    "get_auth_config",
    "get_current_user",
    "require_roles",
    "require_user",
]
