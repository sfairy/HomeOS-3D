"""认证与初始化接口：设置管理员账号、登录、登出与查询当前身份。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import delete, select, text

from ..core.models import LoginSession, User
from ..core.schemas import (
    LoginRequest,
    LoginSessionListResponse,
    LoginSessionResponse,
    SetupAdminRequest,
    SetupStatusResponse,
    UserResponse,
)
from ..core.time_utils import ensure_aware
from ..security.access import admin_token_from, check_admin_session
from ..security.admin_account import EXTERNAL_PASSWORD_SENTINEL, AdminAccountConflict
from ..security.dependencies import CurrentUser, DatabaseSession, require_admin
from ..security.http_security import resolve_client_ip, secure_cookies_enabled
from ..security.security import (
    hash_password,
    new_session_token,
    session_expiry,
    session_token_hash,
    verify_password,
)

# 整组路由不带 prefix：路径里的 /setup/* 与 /auth/* 是与前端约定死的，别改。
router = APIRouter(tags=["authentication"])


def public_user(user: User) -> UserResponse:
    """把 User 行裁剪成对外字段（不含口令哈希与 auth_externalized 等内部标记）。"""
    return UserResponse(id=user.id, username=user.username, role=user.role)


def request_metadata(request: Request) -> tuple[str, str]:
    """取出用于审计与限流的请求元信息。
    """
    ip_address = resolve_client_ip(request).ip
    return (ip_address[:64], request.headers.get("user-agent", "")[:512])


def login_limiter_scopes(request: Request, username: str) -> list[tuple]:
    """列出本次登录要检查 / 累加的限流档位。
    """
    limiter = getattr(request.app.state, "login_limiter", None)
    account_limiter = getattr(request.app.state, "login_account_limiter", None)
    scopes: list[tuple] = []
    if account_limiter is not None:
        scopes.append((account_limiter, f"account:{username.casefold()}"))
    address = resolve_client_ip(request)
    if limiter is not None and address.per_client and address.ip:
        scopes.append((limiter, f"ip:{address.ip}"))
        scopes.append((limiter, f"account-ip:{address.ip}:{username.casefold()}"))
    return scopes


def _retry_after_seconds(scopes: list[tuple]) -> str:
    """被拦时回带的 Retry-After：取所有命中档里剩余等待时间最长的。
    """
    remaining = [limiter.retry_after(key) for limiter, key in scopes]
    return str(max(remaining, default=1))


def create_login_session(request: Request, database: DatabaseSession, user: User) -> str:
    """为已通过校验的用户新建一条登录会话，返回明文令牌。
    """
    settings = request.app.state.settings
    token = new_session_token()
    ip_address, user_agent = request_metadata(request)
    # 入库的是令牌哈希：即使数据库泄露也无法直接拿去冒用会话。
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
    """把会话令牌写进管理员 Cookie。
    """
    settings = request.app.state.settings
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=secure_cookies_enabled(request),
        samesite="lax",
        path="/",
    )


@router.get("/setup/status", response_model=SetupStatusResponse)
def setup_status(request: Request) -> SetupStatusResponse:
    """查询系统是否已完成初始化，供前端决定进设置页还是登录页。
    """
    return SetupStatusResponse(
        initialized=request.app.state.admin_account.initialized,
        version=request.app.state.settings.version,
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
    """首次初始化管理员账号，或在账号文件丢失后重新设置。
    """
    account_store = request.app.state.admin_account
    # 廉价预检放最前：已初始化时对**所有**来源都只会是 409（端点已关闭），
    if account_store.initialized:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="系统已经完成初始化。",
        )
    # 再过守卫：这是「先到先得拿管理员」的唯一屏障，且必须排在 argon2 之前。
    request.app.state.setup_guard.authorize(request, payload.setup_token)
    # 口令哈希在事务外先算好：argon2 很慢，不该占着写锁算。
    password_hash = hash_password(payload.password)
    # 记录已落盘的临时凭据文件，异常分支要靠它回滚。
    staged_credentials = None
    # BEGIN IMMEDIATE 立即取写锁：两个初始化请求同时到达时，只有一个能通过 initialized 检查。
    database.execute(text("BEGIN IMMEDIATE"))
    try:
        if account_store.initialized:
            database.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="系统已经完成初始化。",
            )
        # 库里还留着管理员行（账号文件被删过）：复用它以保住 project.created_by 等外键引用。
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
        # 清空全部登录会话：换了口令之后旧会话不能继续有效。
        database.execute(delete(LoginSession))
        # 先把新凭据原子落盘（尚未生效）；库提交失败时由 abort 删除该文件。
        try:
            staged_credentials = account_store.stage(user, password_hash)
        except AdminAccountConflict as error:
            # 两类**可预期**的冲突：并发初始化请求先赢了，或盘上出现了一份不属于本次初始化的
            database.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=error.detail,
            ) from error
        # 库内哈希改回哨兵值：认证只认账号文件，这一行只是「凭据已外置」的标记。
        user.password_hash = EXTERNAL_PASSWORD_SENTINEL
        user.auth_externalized = True
        token = create_login_session(request, database, user)
        database.commit()
        account_store.activate(staged_credentials)
        # 初始化完成：作废这次窗口用的引导密钥（生成的那份文件会立刻删掉）。
        request.app.state.setup_guard.consume()
        set_session_cookie(request, response, token)
        action = "重新设置" if recovery_user else "首次初始化"
        request.app.state.global_log.append(
            "success", "系统后台", "账号", f"管理员 {user.username} 完成{action}"
        )
        return public_user(user)
    # 已知业务错误：事务已在抛出处回滚，这里原样上抛，由 FastAPI 转成中文响应。
    except HTTPException:
        raise
    # 未知异常：先回滚数据库，再删掉已落盘的账号文件，保证两处状态一致。
    except Exception:
        database.rollback()
        if staged_credentials is not None:
            account_store.abort(staged_credentials)
        raise


@router.post("/auth/login", response_model=UserResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    database: DatabaseSession,
) -> UserResponse:
    """用账号名与口令登录，成功后下发会话 Cookie。
    """
    username = payload.username.strip()
    # 多维限流：账号档（换 IP 也躲不掉）+ 按 IP / IP+账号档（仅当来源地址可信时）。
    scopes = login_limiter_scopes(request, username)
    blocked = [(limiter, key) for limiter, key in scopes if limiter.blocked(key)]
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录失败次数过多，请稍后再试。",
            headers={"Retry-After": _retry_after_seconds(blocked)},
        )
    # 凭据只取自账号文件快照：users 表里的 password_hash 是哨兵值，不参与校验。
    credentials = request.app.state.admin_account.credentials
    user = database.get(User, credentials.user_id) if credentials else None
    # 口令校验先无条件算一次：写进上面的 if 里的话，用户名对不上就会短路跳过 argon2，
    stored_hash = credentials.password_hash if credentials is not None else None
    password_ok = verify_password(stored_hash, payload.password)
    # 五个条件全过才放行；任一不满足都按同一条 401 文案返回，不给攻击者区分线索。
    if not (
        credentials is not None
        and username == credentials.username
        and user is not None
        and user.is_active
        and password_ok
    ):
        for limiter, key in scopes:
            limiter.record_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号或密码错误。",
        )
    # 登录成功即清零所有档位的计数。
    for limiter, key in scopes:
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
    """退出登录：删除服务端会话记录并清掉浏览器 Cookie，返回 204。
    """
    token = request.cookies.get(request.app.state.settings.cookie_name, "")
    username = "管理员"
    if token:
        record = database.scalar(
            select(LoginSession).where(
                LoginSession.id_hash == session_token_hash(token)
            )
        )
        # 查会话只是为了把用户名写进日志，查不到也照常登出。
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
    """返回当前登录用户，供前端刷新页面时确认登录态（未登录由依赖层直接 401）。"""
    return public_user(user)


def session_payload(record: LoginSession, settings, current_hash: str) -> dict:
    """把一条会话行拼成对外的 JSON。
    """
    hard_max_age = int(getattr(settings, "session_hard_max_age_seconds", 0) or 0)
    return {
        "id": record.id_hash,
        "current": record.id_hash == current_hash,
        "createdAt": record.created_at,
        "lastSeenAt": record.last_seen_at,
        "expiresAt": record.expires_at,
        "absoluteExpiresAt": (
            record.created_at + timedelta(seconds=hard_max_age) if hard_max_age > 0 else None
        ),
        "ipAddress": record.ip_address,
        "userAgent": record.user_agent,
    }


def _current_session_hash(request: Request) -> str:
    """本次请求所用会话的哈希；没有 Cookie 时为空串。"""
    token = request.cookies.get(request.app.state.settings.cookie_name, "")
    return session_token_hash(token) if token else ""


@router.get("/auth/sessions", response_model=LoginSessionListResponse)
def list_sessions(
    request: Request,
    database: DatabaseSession,
    user: CurrentUser,
) -> LoginSessionListResponse:
    """列出当前管理员的全部登录会话（最近活跃在前）。
    """
    require_admin(user, detail='仅管理员可以管理登录会话。')
    now = datetime.now(timezone.utc)
    settings = request.app.state.settings
    records = list(
        database.scalars(
            select(LoginSession)
            .where(LoginSession.user_id == user.id)
            .order_by(LoginSession.last_seen_at.desc())
        )
    )
    expired = [record for record in records if ensure_aware(record.expires_at) <= now]
    if expired:
        for record in expired:
            database.delete(record)
        database.commit()
        records = [record for record in records if record not in expired]
    current_hash = _current_session_hash(request)
    items = [
        LoginSessionResponse(**session_payload(record, settings, current_hash))
        for record in records
    ]
    return LoginSessionListResponse(items=items, total=len(items))


@router.delete("/auth/sessions", status_code=status.HTTP_204_NO_CONTENT)
def revoke_other_sessions(
    request: Request,
    database: DatabaseSession,
    user: CurrentUser,
) -> None:
    """退出其他所有设备，只保留当前这条会话，返回 204。
    """
    require_admin(user, detail='仅管理员可以管理登录会话。')
    # 「只保留当前这条会话」的前提是知道当前这条是哪条：复用与认证依赖完全同一个判据，
    session = check_admin_session(
        database,
        request.app.state.settings,
        admin_token_from(request.cookies, request.app.state.settings),
        account_user_id=request.app.state.admin_account.user_id,
    )
    if not session.ok or session.record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录状态已失效，请重新登录。",
        )
    current_hash = session.record.id_hash
    database.execute(
        delete(LoginSession).where(
            LoginSession.user_id == user.id,
            LoginSession.id_hash != current_hash,
        )
    )
    database.commit()
    request.app.state.global_log.append("info", "系统后台", "账号", f"{user.username} 已退出其他所有设备的登录会话")


@router.delete("/auth/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(
    session_id: str,
    request: Request,
    response: Response,
    database: DatabaseSession,
    user: CurrentUser,
) -> None:
    """撤销指定的登录会话，返回 204（幂等：不存在也算成功）。
    """
    require_admin(user, detail='仅管理员可以管理登录会话。')
    record = database.scalar(
        select(LoginSession).where(
            LoginSession.id_hash == session_id,
            # 限定在自己的会话里：别人的会话 id 猜到了也删不掉。
            LoginSession.user_id == user.id,
        )
    )
    if record is None:
        return
    database.delete(record)
    database.commit()
    if session_id == _current_session_hash(request):
        response.delete_cookie(request.app.state.settings.cookie_name, path="/")
    request.app.state.global_log.append("info", "系统后台", "账号", f"{user.username} 撤销了一条登录会话")
