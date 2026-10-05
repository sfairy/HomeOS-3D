"""鉴权依赖：Token 解析、用户快照解析与角色守卫。

以 FastAPI ``Depends`` 复刻 Nest 的全局守卫链语义：
- ``get_current_user``   ≈ JwtAuthGuard（受保护路由显式声明；公开路由不声明）；
- ``require_user``       ≈ JwtAuthGuard + RolesGuard（未标注角色的路由：child 写请求默认拒绝）；
- ``require_roles(...)`` ≈ RolesGuard（@Roles 注解）；
- ``require_guest_readonly`` ≈ GuestWriteGuard（访客只读）。
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from ..core.app_config import get_auth_config
from ..core.deps import get_session
from ..core.entity_domain import get_entity_domain, is_child_restricted_domain
from ..core.errors import api_error, forbidden, unauthorized
from .tokens import extract_jwt_from_request, verify_token

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

#: 请求体中可能承载目标实体的字段名（覆盖单值 / 复数数组 / HA target 结构）。
_ENTITY_KEYS = ("entity_id", "entityId", "entity_ids", "entityIds", "entities", "targets", "target")


def _settings(request: Request):
    return request.app.state.settings


def _push_entity_ids(out: list[str], value: Any) -> None:
    if isinstance(value, str):
        if value:
            out.append(value)
        return
    if isinstance(value, list):
        for item in value:
            _push_entity_ids(out, item)
        return
    if isinstance(value, dict):
        for key in _ENTITY_KEYS:
            if key in value:
                _push_entity_ids(out, value[key])
        if "service_data" in value:
            _push_entity_ids(out, value["service_data"])


async def _collect_candidate_entity_ids(request: Request) -> list[str]:
    out: list[str] = []
    for value in request.path_params.values():
        _push_entity_ids(out, value)
    for value in request.query_params.values():
        _push_entity_ids(out, value)
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 - 无 body / 非 JSON 时跳过
        body = None
    if body is not None:
        _push_entity_ids(out, body)
    seen: dict[str, None] = {}
    for item in out:
        seen.setdefault(item, None)
    return list(seen)


def resolve_restrictions(role: str, preferences: Any) -> list[str] | None:
    if role == "admin":
        return None
    prefs = preferences if isinstance(preferences, dict) else {}
    value = prefs.get("entityRestrictions")
    if isinstance(value, list) and value:
        return [str(item) for item in value]
    return None


def _extract_notification_prefs(preferences: Any) -> dict[str, Any]:
    prefs = preferences if isinstance(preferences, dict) else {}
    value = prefs.get("notification")
    return value if isinstance(value, dict) else {}


def _user_from_snapshot(
    user_id: str, snapshot: Any, payload: dict[str, Any]
) -> dict[str, Any]:
    role = snapshot.role or "user"
    return {
        "userId": user_id,
        "username": payload.get("username") or snapshot.username,
        "role": role,
        "restrictions": resolve_restrictions(role, snapshot.preferences),
        "mfa": payload.get("mfa") is True,
        "notificationPrefs": _extract_notification_prefs(snapshot.preferences),
        "allowedSceneIds": payload.get("allowedSceneIds"),
    }


async def get_current_user(
    request: Request, session: Session = Depends(get_session)
) -> dict[str, Any]:
    """解析当前用户；无有效凭证时抛 401（文案与 Nest 一致）。"""
    settings = _settings(request)
    token = extract_jwt_from_request(request, settings.cookie_name)
    if not token:
        unauthorized("未登录或登录已过期")

    payload = verify_token(token, settings.jwt_secret or "homeos-dev-secret")

    revocation = getattr(request.app.state, "session_revocation", None)
    jti = payload.get("jti")
    role = payload.get("role") or "user"
    if revocation is not None:
        if jti and await revocation.is_revoked(jti):
            unauthorized(api_error("AUTH_SESSION_EXPIRED"))
        if role == "guest" and await revocation.is_revoked(payload.get("sub")):
            unauthorized(api_error("AUTH_SESSION_EXPIRED"))

    if role == "guest":
        return {
            "userId": payload.get("sub"),
            "username": payload.get("username") or "guest",
            "role": "guest",
            "restrictions": payload.get("restrictions") if isinstance(payload.get("restrictions"), list) else None,
            "allowedSceneIds": payload.get("allowedSceneIds") if isinstance(payload.get("allowedSceneIds"), list) else None,
            "mfa": False,
            "notificationPrefs": {},
        }

    from ..core.models import User  # 局部导入避免环形依赖

    token_version = payload.get("tv") if isinstance(payload.get("tv"), int) else 0
    cache = getattr(request.app.state, "token_version_cache", None)
    cached = cache.get_snapshot(payload["sub"]) if cache is not None else None
    if cached is not None and cached.token_version == token_version:
        return _user_from_snapshot(payload["sub"], cached, payload)

    user = session.get(User, payload["sub"])
    if user is None:
        unauthorized(api_error("AUTH_USER_OR_SESSION_INVALID"))
    if token_version != user.token_version:
        unauthorized(api_error("AUTH_SESSION_EXPIRED"))

    role = user.role or payload.get("role") or "user"
    prefs = _json_or_none(user.preferences)
    if cache is not None:
        cache.set_snapshot(
            payload["sub"],
            token_version=user.token_version,
            username=user.username,
            role=role,
            preferences=prefs,
        )
    return {
        "userId": payload["sub"],
        "username": user.username,
        "role": role,
        "restrictions": resolve_restrictions(role, prefs),
        "mfa": payload.get("mfa") is True,
        "notificationPrefs": _extract_notification_prefs(prefs),
        "allowedSceneIds": payload.get("allowedSceneIds"),
    }


def _json_or_none(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    import json

    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


async def require_user(
    request: Request, user: dict[str, Any] = Depends(get_current_user)
) -> dict[str, Any]:
    """受保护路由：未标注 @Roles 时，child 的写请求默认拒绝。"""
    if user.get("role") == "child" and request.method.upper() in WRITE_METHODS:
        forbidden("没有权限执行此操作")
    return user


def require_roles(*roles: str):
    """角色守卫依赖工厂（复刻 RolesGuard 权限矩阵）。"""

    async def _dependency(
        request: Request, user: dict[str, Any] = Depends(get_current_user)
    ) -> dict[str, Any]:
        role = user.get("role")
        if role == "admin":
            return user
        if role == "child":
            for entity_id in await _collect_candidate_entity_ids(request):
                if is_child_restricted_domain(get_entity_domain(entity_id)):
                    forbidden("没有权限执行此操作")
            if "child" in roles:
                return user
            forbidden("没有权限执行此操作")
        if role == "guest":
            if "guest" in roles:
                return user
            forbidden("没有权限执行此操作")
        if role in roles:
            return user
        forbidden("没有权限执行此操作")

    return _dependency


async def require_guest_readonly(
    request: Request, user: dict[str, Any] = Depends(get_current_user)
) -> dict[str, Any]:
    """访客只读守卫：变更类请求直接 403（复刻 GuestWriteGuard）。"""
    if user.get("role") == "guest" and request.method.upper() in WRITE_METHODS:
        forbidden(api_error("ACCESS_GUEST_READ_ONLY"))
    return user


__all__ = [
    "get_current_user",
    "require_user",
    "require_roles",
    "require_guest_readonly",
    "get_auth_config",
]
