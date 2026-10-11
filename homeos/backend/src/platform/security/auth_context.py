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

from typing import Any

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .session_store import resolve_login_session
from ..core.app_config import get_auth_config
from ..core.deps import get_session
from ..core.errors import unauthorized

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
    """受保护路由：已通过会话校验即放行（单一管理员模型，无角色判定）。"""
    return user


__all__ = [
    "get_auth_config",
    "get_current_user",
    "require_user",
]
