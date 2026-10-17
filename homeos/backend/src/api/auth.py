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

from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from homeos_shared.file_lock import locked_file

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


async def _verify_email_code(
    request: Request, email: str, code: str, *, purpose: VerificationPurpose
) -> None:
    """调用商店校验并消费指定用途的验证码；失败统一映射成 422/429。"""
    client = _verification_client(request)
    try:
        await client.verify_code(email, code, purpose=purpose)
    except StoreVerificationError as error:
        status_code = (
            status.HTTP_429_TOO_MANY_REQUESTS
            if error.status_code == 429
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=status_code, detail=str(error)) from error


@router.get("/setup/status", response_model=SetupStatusResponse)
def setup_status(request: Request, response: Response) -> SetupStatusResponse:
    """系统初始化状态；同时兼作 CSRF 引导端点。

    ``initialized`` 的语义 = 本机是否已有**可用**账号（单用户模型下即为「是否已注册」）。
    拿哨兵口令的无凭据老行不算：它既登不进来、又能被注册接管，报 ``False`` 才能让前端
    把用户送到注册页（``router/auth.util.ts``：未初始化 → ``/register``），而不是送到一个
    他永远登不进去的登录页。
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
    session: Session = Depends(get_session),
) -> dict:
    """请求商店向指定邮箱发送验证码（公开，但要求同源写 + 限流）。

    密码找回依赖「能读注册邮箱」这个前提，所以这里刻意做两件事：

    - **注册用途在本机已有账号后关闭**：否则这台机器会变成一个对任意邮箱群发
      「注册本机账号」验证码的中继；
    - **重置用途只对本机已登记的邮箱真的发信**：查不到用户时直接返回与成功完全同形状的
      响应（不发信、也不告诉调用方「这个邮箱不存在」），账号存在与否不泄露。
    """
    require_same_origin_write(request)
    store_purpose: VerificationPurpose
    if payload.purpose == "register":
        if _has_any_user(session) and _claimable_credentialless_user(session) is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="本机已有账号，请直接登录或重置密码。",
            )
        store_purpose = "homeos_register"
    else:
        user = session.scalar(select(User).where(func.lower(User.email) == payload.email))
        if user is None:
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
        status_code = (
            status.HTTP_429_TOO_MANY_REQUESTS
            if error.status_code == 429
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=status_code, detail=str(error)) from error
    return {
        "email": payload.email,
        "delivered": bool(result.get("delivered", True)),
        "resendAfter": result.get("resendAfter"),
    }


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> UserResponse:
    """单用户注册：账号 + 邮箱 + 密码 + 邮箱验证码，建号后立即登录。

    备份导入的库里若只有一行「无凭据行」（哨兵口令，见 ``_claimable_credentialless_user``），
    这里**就地接管那一行**而不是插新行：保留 ``id``，``projects.created_by`` /
    ``project_drafts.updated_by`` 这些 RESTRICT 外键因此继续成立 —— 用户已有的 3D
    仪表盘不会因为重新注册而失去归属（实测直接删号会被外键拒绝）。
    """
    require_same_origin_write(request)
    if not is_password_policy_compliant(payload.password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=PASSWORD_POLICY_MESSAGE,
        )
    # 跨进程串行化首注册，避免双并发都通过「尚无用户」检查。
    lock_path = request.app.state.settings.data_dir / ".register.lock"
    with locked_file(lock_path):
        claim = _claimable_credentialless_user(session)
        if claim is None and _has_any_user(session):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="本机已有账号，请直接登录。",
            )
        conflict_query = select(User).where(
            or_(User.username == payload.username, func.lower(User.email) == payload.email)
        )
        if claim is not None:
            # 接管时这一行就是「自己」，不能把自己判成冲突（否则用回原账号名会被 409）。
            conflict_query = conflict_query.where(User.id != claim.id)
        if session.scalar(conflict_query) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="账号或邮箱已被使用。"
            )
        await _verify_email_code(
            request, payload.email, payload.code, purpose="homeos_register"
        )

        if claim is not None:
            user = claim
            user.username = payload.username
            user.email = payload.email
            user.password = hash_password(payload.password)
            user.is_active = True
            user.email_verified_at = datetime.now(UTC)
            registered_note = f"账号 {user.username} 接管了无凭据行并完成注册"
        else:
            user = User(
                username=payload.username,
                email=payload.email,
                password=hash_password(payload.password),
                is_active=True,
                email_verified_at=datetime.now(UTC),
            )
            session.add(user)
            registered_note = f"账号 {user.username} 完成注册"
        session.flush()
        session.execute(delete(LoginSession))
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
    session: Session = Depends(get_session),
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
    user = session.scalar(select(User).where(func.lower(User.email) == payload.email))
    if user is None:
        # 与「验证码错误」同一句：不区分「码不对」与「邮箱不匹配本机账号」。
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="邮箱或验证码无效。",
        )
    user.password = hash_password(payload.password)
    user.email_verified_at = datetime.now(UTC)
    clear_login_sessions(session, user.id)
    session.commit()
    clear_session_cookie(response, request.app.state.settings, request)
    request.app.state.global_log.append(
        "success", "系统后台", "账号", f"账号 {user.username} 通过邮箱验证码重置了密码"
    )
    # 光删 DB 会话不够：WS 在握手时一次性鉴权、之后不再查库，必须显式切断。
    await _disconnect_realtime(request, user.id)
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
    session: Session = Depends(get_session),
) -> UserResponse:
    """已登录管理员修改本机密码。

    改密即轮换会话：清掉该账号的全部 DB 会话后立刻签发一条新的给当前浏览器 ——
    否则被盗的旧 Cookie 在改密后仍然有效，改密就失去了「止血」的意义。
    """
    require_same_origin_write(request)
    # ``CurrentUser`` 来自短生命周期会话，行已 detach；写回必须取本会话里的实例。
    account = session.get(User, user.id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="登录状态已失效，请重新登录。"
        )
    if not verify_password(payload.current_password, account.password):
        # 用 422 而不是 403：403 在本项目里还表示「CSRF 失效 / 授权受限」，会误导前端。
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="当前密码不正确。"
        )
    if verify_password(payload.new_password, account.password):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="新密码与当前密码相同。"
        )
    account.password = hash_password(payload.new_password)
    clear_login_sessions(session, account.id)
    token = create_login_session(
        session, request, account.id, max_age_seconds=_session_max_age(request)
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
        "success", "系统后台", "账号", f"账号 {account.username} 已修改密码"
    )
    await _disconnect_realtime(request, account.id)
    return public_user(account)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> None:
    settings = request.app.state.settings
    token = request.cookies.get(settings.cookie_name, "")
    username = "用户"
    revoked_user_id: str | None = None
    if token:
        from ..platform.security.session_store import session_token_hash

        token_hash = session_token_hash(token)
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
