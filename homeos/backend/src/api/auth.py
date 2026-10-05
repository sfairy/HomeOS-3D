"""认证路由（``/api/v1/auth/*``），逐条对齐 Nest AuthController。"""

from __future__ import annotations

import json
from typing import Any

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from ..core.deps import get_session
from ..core.errors import api_error, bad_request, forbidden, unauthorized
from ..security.auth_context import require_roles, require_user
from ..security.cookies import (
    clear_auth_cookies,
    ensure_csrf_cookie,
    resolve_cookie_secure_for_request,
    set_auth_cookie,
    set_csrf_cookie,
)
from ..security.limiter import rate_limit
from ..services import auth as auth_service
from .router import NestRouter
from .schemas.auth import (
    CreateUserDto,
    GuestExchangeDto,
    GuestLoginDto,
    GuestTokenDto,
    LoginDto,
    MfaSetupConfirmDto,
    MfaVerifyDto,
    SetupDto,
    UpdateProfileDto,
    UpdateUserDto,
    UpdateUserPreferencesDto,
)

router = NestRouter(prefix="/auth", tags=["auth"])

_SECRET_FALLBACK = "homeos-dev-secret"

def _secret(request: Request) -> str:
    return request.app.state.settings.jwt_secret or _SECRET_FALLBACK

def _cookie_name(request: Request) -> str:
    return request.app.state.settings.cookie_name

def _csrf_cookie_name(request: Request) -> str:
    return request.app.state.settings.csrf_cookie_name

def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None

def _user_agent(request: Request) -> str | None:
    ua = request.headers.get("user-agent")
    return ua[:256] if ua else None

def _cache(request: Request) -> Any:
    return getattr(request.app.state, "token_version_cache", None)

def _revocation(request: Request) -> Any:
    return getattr(request.app.state, "session_revocation", None)

@router.get("/status")
async def get_status(request: Request, response: Response, session: Session = Depends(get_session)):
    ensure_csrf_cookie(
        response, request, _csrf_cookie_name(request), auth_service.cookie_max_age_ms(session)
    )
    count = auth_service.count_users(session)
    token = request.cookies.get(_cookie_name(request))
    authenticated = False
    username = ""
    role = ""
    restrictions: list[str] = []
    if token:
        try:
            payload = auth_service.verify_token(token, _secret(request))
            authenticated = True
            username = payload.get("username", "")
            role = payload.get("role", "")
            restrictions = payload.get("restrictions") or []
        except Exception:  # noqa: BLE001 - token 无效时忽略
            authenticated = False
    return {
        "initialized": count > 0,
        "authenticated": authenticated,
        "username": username,
        "role": role,
        "restrictions": restrictions,
        "external_url": auth_service.get_external_url(session) if count > 0 else "",
    }

@router.post("/setup", status_code=201, dependencies=[Depends(rate_limit(10))])
async def setup(
    body: SetupDto,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
):
    if auth_service.count_users(session) > 0:
        forbidden(api_error("AUTH_SYSTEM_INITIALIZED"))
    user = auth_service.register_first_user(session, body.username, body.password)
    result = auth_service.login_response(session, _secret(request), user)
    set_auth_cookie(response, request, result["access_token"], _cookie_name(request), auth_service.cookie_max_age_ms(session))
    set_csrf_cookie(response, request, _csrf_cookie_name(request), auth_service.cookie_max_age_ms(session))
    return {
        "username": result["username"],
        "role": result["role"],
        "restrictions": result["restrictions"],
        "external_url": result["external_url"],
    }

@router.post("/login", status_code=200, dependencies=[Depends(rate_limit(15))])
async def login(
    body: LoginDto,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
):
    if not body.username:
        bad_request("username 不能为空")
    if len(body.password) < 8:
        bad_request("password 至少 8 位")
    user = auth_service.validate_user(session, body.username, body.password, _client_ip(request), _user_agent(request))
    if auth_service.user_requires_mfa(user):
        return {"requiresMfa": True, "username": user.username}
    result = auth_service.login_response(session, _secret(request), user)
    set_auth_cookie(response, request, result["access_token"], _cookie_name(request), auth_service.cookie_max_age_ms(session))
    set_csrf_cookie(response, request, _csrf_cookie_name(request), auth_service.cookie_max_age_ms(session))
    return {
        "username": result["username"],
        "role": result["role"],
        "restrictions": result["restrictions"],
        "external_url": result["external_url"],
    }

@router.post("/refresh", status_code=200)
async def refresh(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    result = auth_service.refresh_session(session, _secret(request), user)
    set_auth_cookie(response, request, result["access_token"], _cookie_name(request), auth_service.cookie_max_age_ms(session))
    ensure_csrf_cookie(response, request, _csrf_cookie_name(request), auth_service.cookie_max_age_ms(session))
    return {
        "username": result["username"],
        "role": result["role"],
        "restrictions": result["restrictions"],
    }

@router.post("/logout", status_code=200)
async def logout(
    request: Request, response: Response, session: Session = Depends(get_session)
):
    token = request.cookies.get(_cookie_name(request))
    if token:
        await auth_service.revoke_session_by_token(
            session, _secret(request), token, _revocation(request), _cache(request)
        )
    clear_auth_cookies(response, request, _cookie_name(request), _csrf_cookie_name(request))
    return {"message": "已登出"}

@router.patch("/profile")
async def update_profile(
    body: UpdateProfileDto,
    request: Request,
    session: Session = Depends(get_session),
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    return auth_service.update_profile(
        session, user["userId"], body.model_dump(exclude_none=True), _cache(request)
    )

@router.post("/guest-token", status_code=201)
async def create_guest_token(
    body: GuestTokenDto,
    request: Request,
    session: Session = Depends(get_session),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return auth_service.generate_guest_token(
        session,
        _secret(request),
        user["userId"],
        body.validHours or 8,
        body.restrictions,
        body.allowedSceneIds,
    )

@router.post("/guest-exchange", status_code=200, dependencies=[Depends(rate_limit(10))])
async def guest_exchange(
    body: GuestExchangeDto,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
):
    result = auth_service.exchange_guest_code(session, _secret(request), body.code)
    from datetime import UTC, datetime

    expires_at = datetime.fromisoformat(result["expiresAt"].replace("Z", "+00:00"))
    max_age = max(int((expires_at - datetime.now(UTC)).total_seconds() * 1000), 60_000)
    set_auth_cookie(response, request, result["access_token"], _cookie_name(request), max_age)
    set_csrf_cookie(response, request, _csrf_cookie_name(request), auth_service.cookie_max_age_ms(session))
    return {"role": result["role"], "restrictions": result["restrictions"], "expiresAt": result["expiresAt"]}

@router.post("/guest-login", status_code=200, dependencies=[Depends(rate_limit(10))])
async def guest_login(
    body: GuestLoginDto,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
):
    result = auth_service.guest_login(_secret(request), body.token)
    from datetime import UTC, datetime

    expires_at = datetime.fromisoformat(result["expiresAt"].replace("Z", "+00:00"))
    max_age = max(int((expires_at - datetime.now(UTC)).total_seconds() * 1000), 60_000)
    set_auth_cookie(response, request, result["access_token"], _cookie_name(request), max_age)
    set_csrf_cookie(response, request, _csrf_cookie_name(request), auth_service.cookie_max_age_ms(session))
    return {"role": result["role"], "restrictions": result["restrictions"], "expiresAt": result["expiresAt"]}

@router.get("/users")
async def list_users(
    session: Session = Depends(get_session),
    _user: dict[str, Any] = Depends(require_roles("admin")),
):
    return auth_service.list_users(session)

@router.get("/login-audit")
async def get_login_audit(
    limit: str | None = None,
    page: str | None = None,
    session: Session = Depends(get_session),
    _user: dict[str, Any] = Depends(require_roles("admin")),
):
    return auth_service.get_login_audit(
        session, int(limit) if limit else 20, int(page) if page else 1
    )

@router.post("/mfa/verify", status_code=200, dependencies=[Depends(rate_limit(5))])
async def mfa_verify(
    body: MfaVerifyDto,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
):
    result = auth_service.login_with_mfa(
        session,
        _secret(request),
        body.username,
        body.password,
        body.code,
        _client_ip(request),
        _user_agent(request),
    )
    set_auth_cookie(response, request, result["access_token"], _cookie_name(request), auth_service.cookie_max_age_ms(session))
    set_csrf_cookie(response, request, _csrf_cookie_name(request), auth_service.cookie_max_age_ms(session))
    return {
        "username": result["username"],
        "role": result["role"],
        "restrictions": result["restrictions"],
        "external_url": result["external_url"],
    }

@router.get("/mfa/status")
async def mfa_status(
    session: Session = Depends(get_session),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return auth_service.get_mfa_status(session, user["userId"])

@router.post("/mfa/setup", status_code=201)
async def mfa_setup(
    session: Session = Depends(get_session),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return auth_service.start_mfa_setup(session, user["userId"])

@router.post("/mfa/confirm", status_code=201)
async def mfa_confirm(
    body: MfaSetupConfirmDto,
    request: Request,
    session: Session = Depends(get_session),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return auth_service.confirm_mfa_setup(session, user["userId"], body.code, _cache(request))

@router.post("/mfa/disable", status_code=201)
async def mfa_disable(
    body: MfaSetupConfirmDto,
    request: Request,
    session: Session = Depends(get_session),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return auth_service.disable_mfa(session, user["userId"], body.code, _cache(request))

@router.post("/users", status_code=201)
async def create_user(
    body: CreateUserDto,
    session: Session = Depends(get_session),
    _user: dict[str, Any] = Depends(require_roles("admin")),
):
    return auth_service.create_user(session, body.model_dump(exclude_none=True))

@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserDto,
    request: Request,
    session: Session = Depends(get_session),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return auth_service.update_user(
        session, user_id, body.model_dump(exclude_none=True), user["role"], _cache(request)
    )

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    session: Session = Depends(get_session),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return auth_service.delete_user(session, user_id, user["userId"], _cache(request))

@router.get("/preferences")
async def get_preferences(
    session: Session = Depends(get_session),
    user: dict[str, Any] = Depends(require_user),
):
    return auth_service.get_user_preferences(session, user["userId"])

@router.put("/preferences")
async def update_preferences(
    body: UpdateUserPreferencesDto,
    request: Request,
    session: Session = Depends(get_session),
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    return auth_service.update_user_preferences(
        session, user["userId"], body.model_dump(exclude_none=True), _cache(request)
    )

# 供 main.ts 等其它模块复用的辅助（保持模块内聚，避免重复实现）。
_ = (unauthorized, resolve_cookie_secure_for_request, json)
