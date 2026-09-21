"""认证与初始化接口：设置管理员账号、登录、登出与查询当前身份。

对外路径为 /api/v1/setup/* 与 /api/v1/auth/*，分别对应前端的设置页与登录页。
凭据来自 AdminAccountStore 外置的账号文件，users 表里的哈希只是「已外置」的哨兵值，
因此登录校验走 credentials 快照 + 登录限流器，不查库里的口令哈希。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import delete, select, text

from ..security.access import admin_token_from, check_admin_session
from ..security.admin_account import AdminAccountConflict, EXTERNAL_PASSWORD_SENTINEL
from ..security.dependencies import CurrentUser, DatabaseSession
from ..security.http_security import resolve_client_ip, secure_cookies_enabled
from ..core.models import LoginSession, User
from ..core.schemas import (
    LoginRequest,
    LoginSessionListResponse,
    LoginSessionResponse,
    SetupAdminRequest,
    SetupStatusResponse,
    UserResponse,
)
from ..security.security import (
    hash_password,
    new_session_token,
    session_expiry,
    session_token_hash,
    verify_password,
)
from ..core.time_utils import ensure_aware

# 整组路由不带 prefix：路径里的 /setup/* 与 /auth/* 是与前端约定死的，别改。
# 单例限流器挂在 app.state.login_limiter 上，本模块只读取与累加计数。
router = APIRouter(tags=["authentication"])


def public_user(user: User) -> UserResponse:
    """把 User 行裁剪成对外字段（不含口令哈希与 auth_externalized 等内部标记）。"""
    return UserResponse(id=user.id, username=user.username, role=user.role)


def require_admin_account(user: User) -> None:
    """确认当前账号是管理员，否则 403「仅管理员可以管理登录会话。」。

    登录会话列表里能看到 IP 与 UA，撤销会踢人下线，属于管理动作。角色是数据字段，
    接口自己再确认一次，不依赖「目前只有管理员」这个假设。
    """
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅管理员可以管理登录会话。")
    return None


def request_metadata(request: Request) -> tuple[str, str]:
    """取出用于审计与限流的请求元信息。

    返回 ``(客户端 IP, User-Agent)``，两者按数据库列宽上限截断（IP 64、UA 512）。
    客户端 IP 由 :func:`http_security.resolve_client_ip` 解析：配了可信反向代理时取真实来源
    地址，否则一律用 TCP 对端地址 —— 转发头在这两种情况下都不可信，信了就等于让攻击者自选 IP。
    """
    ip_address = resolve_client_ip(request).ip
    return (ip_address[:64], request.headers.get("user-agent", "")[:512])


def login_limiter_scopes(request: Request, username: str) -> list[tuple]:
    """列出本次登录要检查 / 累加的限流档位。

    三档，各挡一类攻击：账号档（``login_account_limiter``，不含 IP，换 IP 也躲不掉）、
    按 IP 档（``login_limiter``，挡单机爆破）、按 IP + 账号档（挡同一台机器换账号试）。
    后两档只在「来源地址真的代表一个客户端」时启用：反代后面没配可信代理时所有人共用代理那一个
    地址，用它计数会让任何一个人失败几次就锁掉所有人（包括管理员自己）。账号档不受影响。
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

    用剩余时间而不是 ``block_seconds``（封禁总时长）：调用方是在封禁中途某刻才被拦下的，
    回总时长等于让客户端多等「已经等过的那段」。取最长的一档保证客户端按它等满必然越过所有档。
    """
    remaining = [limiter.retry_after(key) for limiter, key in scopes]
    return str(max(remaining, default=1))


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

    httponly 防脚本读取，samesite=lax 允许同源跳转带上，path=/ 保证 /api/* 与页面请求都能携带。
    Secure 由 :func:`secure_cookies_enabled` 按请求自动判定（https 基址 / 可信代理转发的 https /
    本连接 https 都算），因此漏配 APP_COOKIE_SECURE 也不会明文下发。
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

    刻意不要求任何身份：未初始化时必须能匿名访问，否则首次设置无从下手。返回 initialized
    与 version。也不开数据库会话：两项都来自进程内状态，而这个端点会被前端反复轮询。
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

    请求字段：username、password、setupToken。返回管理员 UserResponse，同时下发登录 Cookie。
    会抛：403「首次设置需要引导密钥。…」、429 初始化尝试过多、409 已完成初始化 / 账号名已用 /
    现有账号无法重新设置。顺序是「已初始化 → 409，再看引导密钥，最后才 argon2」，未授权请求
    换不到哈希。事务与回滚：BEGIN IMMEDIATE 取写锁；账号文件 stage 落盘、activate 延后到库提交成功。
    """
    account_store = request.app.state.admin_account
    # 廉价预检放最前：已初始化时对**所有**来源都只会是 409（端点已关闭），
    # 先答完这件事就不必再去碰引导密钥、更不必算 argon2 —— 未认证请求换不到 CPU。
    if account_store.initialized:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="系统已经完成初始化。",
        )
    # 再过守卫：这是「先到先得拿管理员」的唯一屏障，且必须排在 argon2 之前。
    # 本机直连放行；其余来源必须带对引导密钥（见 setup_guard 模块说明）。
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
            # 账号文件。都不是「服务器坏了」，所以回 409 而不是 500。事务必须在这里回滚：
            # 外层的 HTTPException 分支刻意不回滚（它假定抛出处已处理过）。
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
        # 库事务提交成功后才让账号文件生效，避免出现「文件已生效、库里却没有对应行」的中间态。
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

    请求字段：username、password；返回登录成功的 UserResponse。
    会抛：429「登录失败次数过多，请稍后再试。」（命中限流，回带 Retry-After）；
    401「账号或密码错误。」（账号不存在、停用或口令不匹配都归到这一条，不向外区分）。
    """
    # 先去掉首尾空白再比较：避免「 admin」与「admin」被当成两个账号绕过计数。
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
    # 耗时差别本身就回答了「这个用户名存不存在」。缺哈希时用哑哈希顶上，耗时一致。
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
        # 只有失败才累加计数，成功路径统一 reset，避免正常登录把计数越推越高。
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


def session_payload(record: LoginSession, settings, current_hash: str) -> dict:
    """把一条会话行拼成对外的 JSON。

    只暴露会话元信息，不带任何能用于认证的东西：`id` 是令牌的 sha256，
    不可逆也当不了凭据。
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

    用途：让主人能看见「有哪些设备登录着」，并在怀疑被盗用时一键踢掉。只列自己的会话，
    别人的（多管理员场景）与中控设备令牌都不在这里管。已过期的行顺手删掉。
    """
    require_admin_account(user)
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

    比「改密码」轻，但足以把被盗 Cookie 踢下线；当前会话保留，避免操作者自己掉线。
    """
    require_admin_account(user)
    # 「只保留当前这条会话」的前提是知道当前这条是哪条：复用与认证依赖完全同一个判据，
    # 要求它对应库里真实存在且仍有效的会话行。不能只看 Cookie 里有没有值 —— 删除条件是
    # id_hash != current_hash，空串会让「不等于」退化成「删掉该用户的全部会话」。
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

    撤销自己当前这条时会一并清掉浏览器 Cookie，等于原地登出。`session_id` 是会话令牌的
    sha256（列表接口给出的那个 id）。
    """
    require_admin_account(user)
    record = database.scalar(
        select(LoginSession).where(
            LoginSession.id_hash == session_id,
            # 限定在自己的会话里：别人的会话 id 猜到了也删不掉。
            LoginSession.user_id == user.id,
        )
    )
    if record is None:
        return None
    database.delete(record)
    database.commit()
    if session_id == _current_session_hash(request):
        response.delete_cookie(request.app.state.settings.cookie_name, path="/")
    request.app.state.global_log.append("info", "系统后台", "账号", f"{user.username} 撤销了一条登录会话")
