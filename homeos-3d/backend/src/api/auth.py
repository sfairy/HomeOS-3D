from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import delete, select, text

from ..admin_account import EXTERNAL_PASSWORD_SENTINEL
from ..auth_limiter import retry_after_headers
from ..dependencies import CurrentUser, DatabaseSession
from ..models import LoginSession, User
from ..schemas import LoginRequest, SetupAdminRequest, SetupStatusResponse, UserResponse
from ..security import (
    hash_password,
    new_session_token,
    session_expiry,
    session_token_hash,
    verify_password,
)

router = APIRouter(tags=["authentication"])


def public_user(user: User) -> UserResponse:
    return UserResponse(id=user.id, username=user.username, role=user.role)


def request_metadata(request: Request) -> tuple[str, str]:
    ip_address = request.client.host if request.client else ""
    return (ip_address[:64], request.headers.get("user-agent", "")[:512])


def create_login_session(request: Request, database: DatabaseSession, user: User) -> str:
    settings = request.app.state.settings
    token = new_session_token()
    (ip_address, user_agent) = request_metadata(request)
    database.add(
        LoginSession(
            id_hash=session_token_hash(token),
            user_id=user.id,
            expires_at=session_expiry(settings.session_max_age_seconds),
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    return token


def set_session_cookie(request: Request, response: Response, token: str) -> None:
    settings = request.app.state.settings
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.get("/setup/status", response_model=SetupStatusResponse)
def setup_status(request: Request, database: DatabaseSession) -> SetupStatusResponse:
    return SetupStatusResponse(
        initialized=request.app.state.admin_account.initialized,
    )


@router.post(
    "/setup/admin",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def setup_admin(
    payload: SetupAdminRequest,
    request: Request,
    response: Response,
    database: DatabaseSession,
) -> UserResponse:
    password_hash = hash_password(payload.password)
    account_store = request.app.state.admin_account
    staged_credentials = None
    try:
        database.execute(text("BEGIN IMMEDIATE"))
        if account_store.initialized:
            database.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="系统已经完成初始化。",
            )
        recovery_user = (
            database.get(User, account_store.recovery_user_id)
            if account_store.recovery_user_id
            else None
        )
        if recovery_user is not None:
            conflict = database.scalar(
                select(User).where(
                    User.username == payload.username,
                    User.id != recovery_user.id,
                )
            )
            if conflict is not None:
                database.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="这个账号名已被使用。",
                )
            user = recovery_user
            user.username = payload.username
            user.role = "admin"
            user.is_active = True
        else:
            if database.scalar(select(User.id).limit(1)) is not None:
                database.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="现有账号无法安全重置，请检查账号文件。",
                )
            user = User(
                username=payload.username,
                password_hash=EXTERNAL_PASSWORD_SENTINEL,
                role="admin",
                auth_externalized=True,
            )
            database.add(user)
        database.flush()
        database.execute(delete(LoginSession))
        staged_credentials = account_store.stage(user, password_hash)
        user.password_hash = EXTERNAL_PASSWORD_SENTINEL
        user.auth_externalized = True
        token = create_login_session(request, database, user)
        database.commit()
    except HTTPException:
        raise
    except Exception:
        database.rollback()
        if staged_credentials is not None:
            account_store.abort(staged_credentials)
        raise
    account_store.activate(staged_credentials)
    set_session_cookie(request, response, token)
    action = "重新设置" if recovery_user else "首次初始化"
    request.app.state.global_log.append(
        "success", "系统后台", "账号", f"管理员 {user.username} 完成{action}"
    )
    return public_user(user)


@router.post("/auth/login", response_model=UserResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    database: DatabaseSession,
) -> UserResponse:
    username = payload.username.strip()
    (ip_address, _user_agent) = request_metadata(request)
    limiter_keys = (f"ip:{ip_address}", f"account:{ip_address}:{username.casefold()}")
    limiter = request.app.state.login_limiter
    retry_after = max(limiter.retry_after(key) for key in limiter_keys)
    if any(limiter.blocked(key) for key in limiter_keys):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录失败次数过多，请稍后再试。",
            headers=retry_after_headers(retry_after),
        )
    credentials = request.app.state.admin_account.credentials
    user = database.get(User, credentials.user_id) if credentials else None
    if (
        credentials is None
        or username != credentials.username
        or user is None
        or not user.is_active
        or not verify_password(credentials.password_hash, payload.password)
    ):
        for key in limiter_keys:
            limiter.record_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号或密码错误。",
        )
    for key in limiter_keys:
        limiter.reset(key)
    token = create_login_session(request, database, user)
    database.commit()
    set_session_cookie(request, response, token)
    request.app.state.global_log.append(
        "success", "系统后台", "账号", f"管理员 {user.username} 已登录"
    )
    return public_user(user)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    database: DatabaseSession,
) -> None:
    token = request.cookies.get(request.app.state.settings.cookie_name, "")
    username = "管理员"
    if token:
        record = database.scalar(
            select(LoginSession).where(
                LoginSession.id_hash == session_token_hash(token)
            )
        )
        if record is not None:
            user = database.get(User, record.user_id)
            if user is not None:
                username = user.username
        database.execute(
            delete(LoginSession).where(
                LoginSession.id_hash == session_token_hash(token)
            )
        )
        database.commit()
    request.app.state.global_log.append(
        "info", "系统后台", "账号", f"{username} 已退出登录"
    )
    response.delete_cookie(request.app.state.settings.cookie_name, path="/")


@router.get("/auth/me", response_model=UserResponse)
def me(user: CurrentUser) -> UserResponse:
    return public_user(user)
