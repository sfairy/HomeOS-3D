"""认证与初始化接口：设置管理员账号、登录、登出与查询当前身份。

对外路径为 /api/v1/setup/* 与 /api/v1/auth/*，分别对应前端的设置页与登录页。
凭据来自 AdminAccountStore 外置的账号文件，users 表里的哈希只是「已外置」的哨兵值，
因此登录校验走 credentials 快照 + 登录限流器，不查库里的口令哈希。
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import delete, select, text

from ..admin_account import EXTERNAL_PASSWORD_SENTINEL
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

# 整组路由不带 prefix：路径里的 /setup/* 与 /auth/* 是与前端约定死的，别改。
# 单例限流器挂在 app.state.login_limiter 上，本模块只读取与累加计数。
router = APIRouter(tags=["authentication"])


def public_user(user: User) -> UserResponse:
    """把 User 行裁剪成对外字段（不含口令哈希与 auth_externalized 等内部标记）。"""
    return UserResponse(id=user.id, username=user.username, role=user.role)


def request_metadata(request: Request) -> tuple[str, str]:
    """取出用于审计与限流的请求元信息。

    返回:
        (客户端 IP, User-Agent) 二元组；按数据库列宽上限截断
        （IP 截 64、UA 截 512），防止超长请求头把审计字段撑爆。
    """
    ip_address = request.client.host if request.client else ""
    return (ip_address[:64], request.headers.get("user-agent", "")[:512])


def create_login_session(request: Request, database: DatabaseSession, user: User) -> str:
    """为已通过校验的用户新建一条登录会话，返回明文令牌。

    库里只写令牌哈希；明文令牌仅通过 Cookie 下发给浏览器，不落库。
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

    httponly 防脚本读取，samesite=lax 允许同源跳转带上，
    path=/ 保证 /api/* 与页面请求都能携带。
    """
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
    """查询系统是否已完成初始化，供前端决定进设置页还是登录页。

    刻意不要求任何身份：未初始化时必须能匿名访问，否则首次设置无从下手。
    返回 initialized（账号文件是否生效）与 version（当前版本号）。
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

    请求字段：username、password（见 SetupAdminRequest）。
    返回：管理员 UserResponse，同时直接下发登录 Cookie（设置完即为登录态）。
    会抛的中文错误文案：
    - 409「系统已经完成初始化。」：账号文件已生效，禁止二次设置；
    - 409「这个账号名已被使用。」：重建时应与库内其它账号重名；
    - 409「现有账号无法安全重置，请检查账号文件。」：库里有账号但找不到待重置的那一行。

    事务与回滚：先 BEGIN IMMEDIATE 取写锁，避免并发初始化；
    账号文件用 stage 先落盘、activate 等库提交成功后才生效，
    任何一步失败都回滚数据库并 abort 掉已落盘的凭据文件。
    """
    # 口令哈希在事务外先算好：argon2 很慢，不该占着写锁算。
    password_hash = hash_password(payload.password)
    account_store = request.app.state.admin_account
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
        staged_credentials = account_store.stage(user, password_hash)
        # 库内哈希改回哨兵值：认证只认账号文件，这一行只是「凭据已外置」的标记。
        user.password_hash = EXTERNAL_PASSWORD_SENTINEL
        user.auth_externalized = True
        token = create_login_session(request, database, user)
        database.commit()
        # 库事务提交成功后才让账号文件生效，避免出现「文件已生效、库里却没有对应行」的中间态。
        account_store.activate(staged_credentials)
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

    请求字段：username、password。
    返回：登录成功的 UserResponse。
    会抛的中文错误文案：
    - 429「登录失败次数过多，请稍后再试。」：命中限流，并回带 Retry-After；
    - 401「账号或密码错误。」：账号不存在、账号停用或口令不匹配都归到这一条，不向外区分。
    """
    # 先去掉首尾空白再比较：避免「 admin」与「admin」被当成两个账号绕过计数。
    username = payload.username.strip()
    ip_address, _user_agent = request_metadata(request)
    # 双维度限流：IP 维度挡单机爆破，「IP + 账号」维度挡换 IP 撞同一个账号；
    # 账号部分做 casefold，改大小写也重置不了计数。
    limiter_keys = (
        f"ip:{ip_address}",
        f"account:{ip_address}:{username.casefold()}",
    )
    limiter = request.app.state.login_limiter
    if any(limiter.blocked(key) for key in limiter_keys):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录失败次数过多，请稍后再试。",
            headers={"Retry-After": str(limiter.block_seconds)},
        )
    # 凭据只取自账号文件快照：users 表里的 password_hash 是哨兵值，不参与校验。
    credentials = request.app.state.admin_account.credentials
    user = database.get(User, credentials.user_id) if credentials else None
    # 五个条件全过才放行；任一不满足都按同一条 401 文案返回，不给攻击者区分线索。
    if not (
        credentials is not None
        and username == credentials.username
        and user is not None
        and user.is_active
        and verify_password(credentials.password_hash, payload.password)
    ):
        # 只有失败才累加计数，成功路径统一 reset，避免正常登录把计数越推越高。
        for key in limiter_keys:
            limiter.record_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号或密码错误。",
        )
    # 登录成功即清零两个维度的计数。
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
    """退出登录：删除服务端会话记录并清掉浏览器 Cookie，返回 204。

    幂等：Cookie 缺失或会话已不存在时同样返回 204，前端不必区分。
    """
    token = request.cookies.get(request.app.state.settings.cookie_name, "")
    # 会话不存在时日志里退化成占位名，避免为了取用户名再多查一次库。
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
