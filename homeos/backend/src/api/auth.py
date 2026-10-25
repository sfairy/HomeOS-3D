"""认证与初始化接口（单用户注册登录口径）。

对外路径为 ``/api/v1/setup/*`` 与 ``/api/v1/auth/*``，分别对应前端的注册页与登录页。

首装流程：
1. 首次部署无任何用户 → ``GET /setup/status`` 返回 ``initialized=false``，前端跳注册页；
2. 注册要求账号、密码、邮箱与邮箱验证码（验证码由商店服务器发送/校验），
   ``POST /auth/register`` 建号后立即建立登录会话；
3. 已有用户后注册入口关闭（409），只能 ``POST /auth/login``。

会话仍是 ``sessions`` 表的不透明令牌（HttpOnly Cookie），可服务端吊销。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .router import NestRouter
from .schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    PasswordResetRequest,
    RegisterRequest,
    SetupStatusResponse,
    UserResponse,
    VerificationRequest,
)
from ..dependencies import CurrentUser
from ..domains.store import (
    StoreVerificationError,
    VerificationPurpose,
    verification_client_from_settings,
)
from ..platform.core.db_exec import run_db
from ..platform.core.deps import get_session
from ..platform.core.models import LoginSession, User
from ..platform.security.cookies import ensure_csrf_cookie
from ..platform.security.limiter import rate_limit
from ..platform.security.login_limiter import LoginAttemptLimiter, retry_after_headers
from ..platform.security.passwords import (
    PASSWORD_POLICY_MESSAGE,
    hash_password,
    is_credentialless,
    is_password_policy_compliant,
    verify_password,
)
from ..platform.security.request_origin import require_same_origin_write
from ..platform.security.session_store import (
    clear_login_sessions,
    clear_session_cookie,
    create_login_session,
    new_session_token,
    session_token_hash,
    set_session_cookie,
)

router = NestRouter(tags=["authentication"])

#: CSRF Cookie 有效期（30 天）：沿用原 ``/auth/status`` 引导端点的口径。
CSRF_MAX_AGE_MS = 30 * 24 * 3600 * 1000


def public_user(user: User) -> UserResponse:
    return UserResponse(id=user.id, username=user.username, email=user.email)


def request_metadata(request: Request) -> tuple[str, str]:
    ip_address = request.client.host if request.client else ""
    return (ip_address[:64], request.headers.get("user-agent", "")[:512])


def _session_max_age(request: Request) -> int:
    return request.app.state.settings.session_max_age_seconds


def _has_any_user(session: Session) -> bool:
    return session.scalar(select(User.id).limit(1)) is not None


def _claimable_credentialless_user(session: Session) -> User | None:
    """找出可被首装注册**就地接管**的无凭据行，没有则返回 ``None``。

    这类行来自备份导入：口令被写成哨兵值（``security.passwords.EXTERNAL_PASSWORD_SENTINEL``），
    哨兵不是任何哈希算法可产生的格式 —— ``verify_password`` 对**任何**输入都返回 False，
    所以这一行根本登不进来。若同时被 ``_has_any_user`` 算作「本机已有账号」，首装注册就会
    被永久挡在 409 之外、登录又永远 401。因此注册时允许接管它。

    只认「全库唯一一行」：多用户库里不做接管（409）。
    """
    rows = session.scalars(select(User).limit(2)).all()
    if len(rows) != 1:
        return None
    (only,) = rows
    return only if is_credentialless(only.password) else None


def _verification_client(request: Request):
    return verification_client_from_settings(request.app.state.settings)


def _store_error(error: StoreVerificationError) -> HTTPException:
    """把商店错误翻译成对浏览器有意义的响应。

    - 商店**不可达**（未配置 / 连不上 / 5xx）：503 ``STORE_UNAVAILABLE``。
      不能伪装成 422「验证码错误」——用户会以为自己输错了码而反复重试。
    - 商店限流（429）：429 + ``Retry-After``（商店给了就透传）。
    - 其余 4xx：验证码 / 邮箱确实有问题，422。
    """
    if error.unavailable:
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "STORE_UNAVAILABLE", "message": str(error)},
        )
    if error.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(error),
            headers=retry_after_headers(error.retry_after or 60),
        )
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
    )


async def _verify_email_code(
    request: Request, email: str, code: str, *, purpose: VerificationPurpose
) -> None:
    """调用商店校验并消费指定用途的验证码；失败统一映射（见 :func:`_store_error`）。"""
    client = _verification_client(request)
    try:
        await client.verify_code(email, code, purpose=purpose)
    except StoreVerificationError as error:
        raise _store_error(error) from error


@router.get("/setup/status", response_model=SetupStatusResponse)
def setup_status(request: Request, response: Response) -> SetupStatusResponse:
    """系统初始化状态；同时兼作 CSRF 引导端点。

    ``initialized`` 的语义 = 本机是否已有**可用**账号（单用户模型下即为「是否已注册」）。
    拿哨兵口令的无凭据老行不算：它既登不进来、又能被注册接管，报 ``False`` 才能让前端
    把「创建本机唯一账号」的入口显出来（``router/auth.util.ts``：未初始化 → 登录页放行并
    给出注册入口），而不是让人对着一个永远登不进去的登录表单猜。
    """
    settings = request.app.state.settings
    ensure_csrf_cookie(response, request, settings.csrf_cookie_name, CSRF_MAX_AGE_MS)
    with request.app.state.database.session_factory() as session:
        initialized = _has_any_user(session) and _claimable_credentialless_user(session) is None
        return SetupStatusResponse(initialized=initialized)


@router.post(
    "/auth/verification",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit(5, 60.0))],
)
async def send_verification(
    payload: VerificationRequest,
    request: Request,
) -> dict:
    """请求商店向指定邮箱发送验证码（公开，但要求同源写 + 限流）。

    密码找回依赖「能读注册邮箱」这个前提，所以这里刻意做两件事：

    - **注册用途在本机已有账号后关闭**：否则这台机器会变成一个对任意邮箱群发
      「注册本机账号」验证码的中继；
    - **重置用途只对本机已登记的邮箱真的发信**：查不到用户时直接返回与成功完全同形状的
      响应（不发信、也不告诉调用方「这个邮箱不存在」），账号存在与否不泄露。
    """
    require_same_origin_write(request)
    session_factory = request.app.state.database.session_factory
    store_purpose: VerificationPurpose
    if payload.purpose == "register":
        if await run_db(_has_existing_account, session_factory):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="本机已有账号，请直接登录或重置密码。",
            )
        store_purpose = "homeos_register"
    else:
        if not await run_db(_email_registered, session_factory, payload.email):
            # 与成功响应**逐字段同形**：不泄露「该邮箱不是本机账号」，也不消耗商店的发信配额。
            # ``resendAfter`` 取商店默认冷却（60s）而不是随手写 120 —— 否则默认配置下
            # 「已注册 → 60 / 未注册 → 120」本身就是一枚可观测的账号枚举探针。
            # 不回 ``deliveryMode``：真实响应的该字段随商店投递方式变化，留着同样会泄露。
            return {
                "email": payload.email,
                "delivered": True,
                "resendAfter": 60,
            }
        store_purpose = "homeos_reset"

    client = _verification_client(request)
    try:
        result = await client.send_code(payload.email, purpose=store_purpose)
    except StoreVerificationError as error:
        raise _store_error(error) from error
    return {
        "email": payload.email,
        "delivered": bool(result.get("delivered", True)),
        "resendAfter": result.get("resendAfter"),
    }


def _assert_registrable(session: Session) -> None:
    """注册判据：本机既没有可用账号，也没有可接管的无凭据行（否则 409）。"""
    if _claimable_credentialless_user(session) is None and _has_any_user(session):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="本机已有账号，请直接登录。",
        )


def _registration_precheck(session_factory) -> None:
    """只读快速预判（供 ``run_db``）：已注册时直接 409，不消耗用户的验证码。"""
    with session_factory() as session:
        _assert_registrable(session)


def _has_existing_account(session_factory) -> bool:
    """``/auth/verification`` 注册用途的判定（供 ``run_db``）。"""
    with session_factory() as session:
        return _has_any_user(session) and _claimable_credentialless_user(session) is None


def _email_registered(session_factory, email: str) -> bool:
    """重置用途：本机是否登记了该邮箱（供 ``run_db``，只回布尔值防账号枚举）。"""
    with session_factory() as session:
        return (
            session.scalar(
                select(User.id).where(func.lower(User.email) == email.strip().lower())
            )
            is not None
        )


def _register_in_transaction(
    session_factory,
    username: str,
    email: str,
    raw_password: str,
    ip_address: str,
    user_agent: str,
    max_age_seconds: int,
) -> tuple[User, str, str]:
    """同步事务体：``BEGIN IMMEDIATE`` 写锁下复核并建号，返回 (user, token, 日志文案)。

    为什么是一个写事务：注册判据「本机还没有账号」是**先读后写**，并发下两个请求都能
    读到「没有」，于是可能建出两个账号。旧实现用 ``locked_file``（同步文件锁）跨
    ``await` 持有来串行化 —— 那既会卡死事件循环，也不能真正保护「读 → 验码 → 写」这段
    长临界区。这里改为在数据库侧取写锁：SQLite 的 ``BEGIN IMMEDIATE`` 让写者互斥，
    锁的生命周期就是这段同步代码，不跨越任何 ``await``；验码在**锁外**完成。

    备份导入的库里若只有一行「无凭据行」（哨兵口令，见 ``_claimable_credentialless_user``），
    这里**就地接管那一行**而不是插新行：保留 ``id``，``projects.created_by`` /
    ``project_drafts.updated_by`` 这些 RESTRICT 外键因此继续成立 —— 用户已有的 3D
    仪表盘不会因为重新注册而失去归属（实测直接删号会被外键拒绝）。
    """
    with session_factory() as session:
        # 结束 SQLAlchemy 的隐式事务，否则 BEGIN IMMEDIATE 会落在事务内而报错。
        session.commit()
        session.execute(text("BEGIN IMMEDIATE"))
        _assert_registrable(session)
        claim = _claimable_credentialless_user(session)
        conflict_query = select(User).where(
            or_(User.username == username, func.lower(User.email) == email)
        )
        if claim is not None:
            # 接管时这一行就是「自己」，不能把自己判成冲突（否则用回原账号名会被 409）。
            conflict_query = conflict_query.where(User.id != claim.id)
        if session.scalar(conflict_query) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="账号或邮箱已被使用。"
            )
        if claim is not None:
            user = claim
            user.username = username
            user.email = email
            user.password = hash_password(raw_password)
            user.is_active = True
            user.email_verified_at = datetime.now(UTC)
            registered_note = f"账号 {user.username} 接管了无凭据行并完成注册"
        else:
            user = User(
                username=username,
                email=email,
                password=hash_password(raw_password),
                is_active=True,
                email_verified_at=datetime.now(UTC),
            )
            session.add(user)
            registered_note = f"账号 {user.username} 完成注册"
        try:
            session.flush()
        except IntegrityError as error:
            # 兜底：users_email_idx / users.username 唯一约束（并发注册绕过了上面的判据）。
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="账号或邮箱已被使用。"
            ) from error
        # 只清该账号自己的会话：接管无凭据行后旧会话必须失效，但不能误踢别的账号。
        session.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
        token = new_session_token()
        session.add(
            LoginSession(
                id_hash=session_token_hash(token),
                user_id=user.id,
                expires_at=datetime.now(UTC) + timedelta(seconds=max_age_seconds),
                ip_address=ip_address,
                user_agent=user_agent,
            )
        )
        session.commit()
        return user, token, registered_note


def _reset_password_in_db(
    session_factory, email: str, raw_password: str
) -> tuple[str, str] | None:
    """同步事务体：验码通过后按邮箱改密并吊销全部会话（供 ``run_db``）。"""
    with session_factory() as session:
        user = session.scalar(
            select(User).where(func.lower(User.email) == email.strip().lower())
        )
        if user is None:
            # 与「验证码错误」同一句：不区分「码不对」与「邮箱不匹配本机账号」。
            return None
        user.password = hash_password(raw_password)
        user.email_verified_at = datetime.now(UTC)
        clear_login_sessions(session, user.id)
        user_id, username = user.id, user.username
        session.commit()
    return user_id, username


def _change_password_in_db(
    session_factory,
    request: Request,
    user_id: str,
    current_password: str,
    new_password: str,
    max_age_seconds: int,
) -> tuple[str, str, str, str]:
    """同步事务体：校验并轮换密码，返回 (id, username, email, 新会话 token)。

    改密即轮换会话：清掉该账号全部 DB 会话后立刻签发一条给当前浏览器 —— 否则被盗的
    旧 Cookie 在改密后仍然有效，改密就失去了「止血」的意义。
    """
    with session_factory() as session:
        account = session.get(User, user_id)
        if account is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="登录状态已失效，请重新登录。",
            )
        if not verify_password(current_password, account.password):
            # 用 422 而不是 403：403 在本项目里还表示「CSRF 失效 / 授权受限」，会误导前端。
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="当前密码不正确。",
            )
        if verify_password(new_password, account.password):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="新密码与当前密码相同。",
            )
        account.password = hash_password(new_password)
        clear_login_sessions(session, account.id)
        token = create_login_session(
            session, request, account.id, max_age_seconds=max_age_seconds
        )
        account_id, username, email = account.id, account.username, account.email
        session.commit()
    return account_id, username, email or "", token


def _logout_in_db(session_factory, token: str) -> tuple[str, str | None]:
    """同步事务体：删除当前登录会话，返回 (用户名, 被吊销会话的 user_id)。"""
    username = "用户"
    revoked_user_id: str | None = None
    token_hash = session_token_hash(token)
    with session_factory() as session:
        record = session.scalar(
            select(LoginSession).where(LoginSession.id_hash == token_hash)
        )
        if record is not None:
            revoked_user_id = record.user_id
            user = session.get(User, record.user_id)
            if user is not None:
                username = user.username
        session.execute(delete(LoginSession).where(LoginSession.id_hash == token_hash))
        session.commit()
    return username, revoked_user_id


@router.post(
    "/auth/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    # 注册是公开写端点：按来源 IP 限流 5 次/小时，压住「批量试验证码 / 批量建号」。
    dependencies=[Depends(rate_limit(5, 3600.0))],
)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
) -> UserResponse:
    """单用户注册：账号 + 邮箱 + 密码 + 邮箱验证码，建号后立即登录。

    顺序：同源写校验 → 口令策略 → **只读预判**（已注册直接 409）→ 商店验码 →
    ``BEGIN IMMEDIATE`` 事务内复核 + 建号 + 签发会话。

    所有数据库操作都在 ``run_db``（``asyncio.to_thread``）里执行，事件循环不碰
    同步 SQLAlchemy 调用（``ops/checks/check_async_db.py`` 会拦）。
    """
    require_same_origin_write(request)
    if not is_password_policy_compliant(payload.password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=PASSWORD_POLICY_MESSAGE,
        )
    settings = request.app.state.settings
    session_factory = request.app.state.database.session_factory
    max_age_seconds = settings.session_max_age_seconds
    (ip_address, user_agent) = request_metadata(request)
    await run_db(_registration_precheck, session_factory)
    # 先验码（商店侧消费）：验证码通过说明邮箱真实可用，才允许继续谈建号。
    await _verify_email_code(
        request, payload.email, payload.code, purpose="homeos_register"
    )
    user, token, registered_note = await run_db(
        _register_in_transaction,
        session_factory,
        payload.username,
        payload.email,
        payload.password,
        ip_address,
        user_agent,
        max_age_seconds,
    )
    set_session_cookie(
        response,
        settings,
        token,
        max_age_seconds=max_age_seconds,
        request=request,
    )
    request.app.state.global_log.append("success", "系统后台", "账号", registered_note)
    return public_user(user)


@router.post("/auth/login", response_model=UserResponse, status_code=status.HTTP_200_OK)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> UserResponse:
    require_same_origin_write(request)
    account = payload.username.strip()
    account_lower = account.lower()
    (ip_address, _user_agent) = request_metadata(request)
    limiter_keys = (f"ip:{ip_address}", f"account:{ip_address}:{account_lower}")
    limiter: LoginAttemptLimiter = request.app.state.login_limiter
    retry_after = max(limiter.retry_after(key) for key in limiter_keys)
    if any(limiter.blocked(key) for key in limiter_keys):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录失败次数过多，请稍后再试。",
            headers=retry_after_headers(retry_after),
        )
    user = session.scalar(
        select(User).where(
            or_(User.username == account, func.lower(User.email) == account_lower)
        )
    )
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password)
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
        response,
        request.app.state.settings,
        token,
        max_age_seconds=_session_max_age(request),
        request=request,
    )
    request.app.state.global_log.append(
        "success", "系统后台", "账号", f"账号 {user.username} 已登录"
    )
    return public_user(user)


async def _disconnect_realtime(request: Request, user_id: str) -> None:
    """切断某账号的实时连接（登出 / 改密 / 重置密码共用）。"""
    gateway = getattr(request.app.state, "realtime", None)
    if gateway is not None and user_id:
        await gateway.disconnect_user(user_id)


@router.post(
    "/auth/password/reset",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit(5, 60.0))],
)
async def reset_password(
    payload: PasswordResetRequest,
    request: Request,
    response: Response,
) -> dict:
    """用注册邮箱验证码重置本机管理员密码（未登录可调用）。

    顺序是「**先验码**、再查库」：验证码由商店校验并消费，没有码的人拿不到任何关于
    「这个邮箱是不是本机账号」的差异化响应。验码通过后邮箱必然已通过商店验证，
    因此命中用户时也顺带把 ``email_verified_at`` 补上。

    改密后**吊销全部会话**并清掉当前 Cookie —— 与 ``clear_login_sessions`` 的既有语义
    一致（改密即全端下线）。刻意**不**改 ``is_active``：被停用的账号重置完仍然登不进来。
    """
    require_same_origin_write(request)
    if not is_password_policy_compliant(payload.password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=PASSWORD_POLICY_MESSAGE,
        )
    await _verify_email_code(
        request, payload.email, payload.code, purpose="homeos_reset"
    )
    session_factory = request.app.state.database.session_factory
    result = await run_db(
        _reset_password_in_db, session_factory, payload.email, payload.password
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="邮箱或验证码无效。",
        )
    user_id, username = result
    clear_session_cookie(response, request.app.state.settings, request)
    request.app.state.global_log.append(
        "success", "系统后台", "账号", f"账号 {username} 通过邮箱验证码重置了密码"
    )
    # 光删 DB 会话不够：WS 在握手时一次性鉴权、之后不再查库，必须显式切断。
    await _disconnect_realtime(request, user_id)
    return {"reset": True}


@router.post(
    "/auth/password/change",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit(5, 60.0))],
)
async def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    response: Response,
    user: CurrentUser,
) -> UserResponse:
    """已登录管理员修改本机密码。

    改密即轮换会话：清掉该账号的全部 DB 会话后立刻签发一条新的给当前浏览器 ——
    否则被盗的旧 Cookie 在改密后仍然有效，改密就失去了「止血」的意义。
    """
    require_same_origin_write(request)
    settings = request.app.state.settings
    session_factory = request.app.state.database.session_factory
    max_age_seconds = _session_max_age(request)
    account_id, username, email, token = await run_db(
        _change_password_in_db,
        session_factory,
        request,
        user.id,
        payload.current_password,
        payload.new_password,
        max_age_seconds,
    )
    set_session_cookie(
        response,
        settings,
        token,
        max_age_seconds=max_age_seconds,
        request=request,
    )
    request.app.state.global_log.append(
        "success", "系统后台", "账号", f"账号 {username} 已修改密码"
    )
    await _disconnect_realtime(request, account_id)
    return UserResponse(id=account_id, username=username, email=email)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
) -> None:
    settings = request.app.state.settings
    token = request.cookies.get(settings.cookie_name, "")
    username = "用户"
    revoked_user_id: str | None = None
    if token:
        session_factory = request.app.state.database.session_factory
        username, revoked_user_id = await run_db(_logout_in_db, session_factory, token)
    request.app.state.global_log.append(
        "info", "系统后台", "账号", f"{username} 已退出登录"
    )
    clear_session_cookie(response, settings, request)
    # 光删 DB 会话不够：WS 连接在握手时一次性鉴权、之后不再查库，所以登出后那条连接
    # 仍会持续收到家中的状态变更与站内通知。这里显式切断该账号的在线连接。
    gateway = getattr(request.app.state, "realtime", None)
    if gateway is not None and revoked_user_id:
        await gateway.disconnect_user(revoked_user_id)


@router.get("/auth/me", response_model=UserResponse)
def me(user: CurrentUser) -> UserResponse:
    return public_user(user)
