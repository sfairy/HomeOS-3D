"""认证与初始化接口（homeos-3d 原生契约）。

对外路径为 ``/api/v1/setup/*`` 与 ``/api/v1/auth/*``，分别对应前端的设置页与登录页。
逐条对齐 homeos-3d 的 ``api/auth.py``：单一管理员账号 + 凭据外置文件（``admin_account``）
+ 可服务端吊销的 ``sessions`` 表会话。
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..admin_account import EXTERNAL_PASSWORD_SENTINEL
from ..core.deps import get_session
from ..core.models import LoginSession, User
from ..dependencies import CurrentUser
from ..security.cookies import ensure_csrf_cookie
from ..security.login_limiter import LoginAttemptLimiter, retry_after_headers
from ..security.passwords import hash_password, verify_password
from ..security.session_store import create_login_session, set_session_cookie
from .router import NestRouter
from .schemas.auth import (
    LoginRequest,
    SetupAdminRequest,
    SetupStatusResponse,
    UserResponse,
)

router = NestRouter(tags=["authentication"])

#: CSRF Cookie 有效期（30 天）：沿用原 ``/auth/status`` 引导端点的口径。
CSRF_MAX_AGE_MS = 30 * 24 * 3600 * 1000


def public_user(user: User) -> UserResponse:
    return UserResponse(id=user.id, username=user.username, role=user.role)


def request_metadata(request: Request) -> tuple[str, str]:
    ip_address = request.client.host if request.client else ""
    return (ip_address[:64], request.headers.get("user-agent", "")[:512])


def _session_max_age(request: Request) -> int:
    return request.app.state.settings.session_max_age_seconds


@router.get("/setup/status", response_model=SetupStatusResponse)
def setup_status(request: Request, response: Response) -> SetupStatusResponse:
    """系统初始化状态；同时兼作 CSRF 引导端点。

    每次启动首屏都会调用本端点，正是原 ``/auth/status`` 承担的角色：缺少 ``csrf_token``
    时下发 Cookie，供 homeos 业务侧的 double-submit 校验使用（3D 前端不发 CSRF 头，
    且初始化 / 登录 / 登出 / 授权系列端点已在豁免表内，因此不受影响）。
    """
    settings = request.app.state.settings
    ensure_csrf_cookie(response, request, settings.csrf_cookie_name, CSRF_MAX_AGE_MS)
    return SetupStatusResponse(initialized=request.app.state.admin_account.initialized)


@router.post("/setup/admin", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def setup_admin(
    payload: SetupAdminRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> UserResponse:
    password_hash = hash_password(payload.password)
    account_store = request.app.state.admin_account
    staged_credentials = None
    try:
        if account_store.initialized:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="系统已经完成初始化。",
            )
        recovery_user = (
            session.get(User, account_store.recovery_user_id)
            if account_store.recovery_user_id
            else None
        )
        if recovery_user is not None:
            conflict = session.scalar(
                select(User).where(
                    User.username == payload.username,
                    User.id != recovery_user.id,
                )
            )
            if conflict is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="这个账号名已被使用。",
                )
            user = recovery_user
            user.username = payload.username
            user.role = "admin"
            user.is_active = True
        else:
            if session.scalar(select(User.id).limit(1)) is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="现有账号无法安全重置，请检查账号文件。",
                )
            user = User(
                username=payload.username,
                password=EXTERNAL_PASSWORD_SENTINEL,
                role="admin",
                auth_externalized=True,
            )
            session.add(user)
        session.flush()
        session.execute(delete(LoginSession))
        staged_credentials = account_store.stage(user, password_hash)
        user.password = EXTERNAL_PASSWORD_SENTINEL
        user.auth_externalized = True
        token = create_login_session(
            session, request, user.id, max_age_seconds=_session_max_age(request)
        )
        session.commit()
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        if staged_credentials is not None:
            account_store.abort(staged_credentials)
        raise
    account_store.activate(staged_credentials)
    set_session_cookie(
        response, request.app.state.settings, token, max_age_seconds=_session_max_age(request)
    )
    action = "重新设置" if recovery_user else "首次初始化"
    request.app.state.global_log.append(
        "success", "系统后台", "账号", f"管理员 {user.username} 完成{action}"
    )
    return public_user(user)


@router.post("/auth/login", response_model=UserResponse, status_code=status.HTTP_200_OK)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> UserResponse:
    username = payload.username.strip()
    (ip_address, _user_agent) = request_metadata(request)
    limiter_keys = (f"ip:{ip_address}", f"account:{ip_address}:{username.casefold()}")
    limiter: LoginAttemptLimiter = request.app.state.login_limiter
    retry_after = max(limiter.retry_after(key) for key in limiter_keys)
    if any(limiter.blocked(key) for key in limiter_keys):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录失败次数过多，请稍后再试。",
            headers=retry_after_headers(retry_after),
        )
    credentials = request.app.state.admin_account.credentials
    user = session.get(User, credentials.user_id) if credentials else None
    if (
        credentials is None
        or username != credentials.username
        or user is None
        or not user.is_active
        or not verify_password(payload.password, credentials.password_hash)
    ):
        for key in limiter_keys:
            limiter.record_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号或密码错误。",
        )
    for key in limiter_keys:
        limiter.reset(key)
    token = create_login_session(
        session, request, user.id, max_age_seconds=_session_max_age(request)
    )
    session.commit()
    set_session_cookie(
        response, request.app.state.settings, token, max_age_seconds=_session_max_age(request)
    )
    request.app.state.global_log.append(
        "success", "系统后台", "账号", f"管理员 {user.username} 已登录"
    )
    return public_user(user)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> None:
    settings = request.app.state.settings
    token = request.cookies.get(settings.cookie_name, "")
    username = "管理员"
    if token:
        from ..security.session_store import session_token_hash

        token_hash = session_token_hash(token)
        record = session.scalar(
            select(LoginSession).where(LoginSession.id_hash == token_hash)
        )
        if record is not None:
            user = session.get(User, record.user_id)
            if user is not None:
                username = user.username
        session.execute(delete(LoginSession).where(LoginSession.id_hash == token_hash))
        session.commit()
    request.app.state.global_log.append(
        "info", "系统后台", "账号", f"{username} 已退出登录"
    )
    response.delete_cookie(settings.cookie_name, path="/")


@router.get("/auth/me", response_model=UserResponse)
def me(user: CurrentUser) -> UserResponse:
    return public_user(user)
