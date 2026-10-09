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

from .router import NestRouter
from .schemas.auth import (
    LoginRequest,
    RegisterRequest,
    SetupStatusResponse,
    UserResponse,
    VerificationRequest,
)
from ..core.deps import get_session
from ..core.file_lock import locked_file
from ..core.models import LoginSession, User
from ..dependencies import CurrentUser
from ..security.cookies import ensure_csrf_cookie
from ..security.login_limiter import LoginAttemptLimiter, retry_after_headers
from ..security.passwords import (
    PASSWORD_POLICY_MESSAGE,
    hash_password,
    is_credentialless,
    is_password_policy_compliant,
    needs_rehash,
    verify_password,
)
from ..security.request_origin import require_same_origin_write
from ..security.session_store import create_login_session, set_session_cookie
from ..services.store import StoreVerificationError, verification_client_from_settings

router = NestRouter(tags=["authentication"])

#: CSRF Cookie 有效期（30 天）：沿用原 ``/auth/status`` 引导端点的口径。
CSRF_MAX_AGE_MS = 30 * 24 * 3600 * 1000


def public_user(user: User) -> UserResponse:
    return UserResponse(
        id=user.id, username=user.username, role=user.role, email=user.email
    )


def request_metadata(request: Request) -> tuple[str, str]:
    ip_address = request.client.host if request.client else ""
    return (ip_address[:64], request.headers.get("user-agent", "")[:512])


def _session_max_age(request: Request) -> int:
    return request.app.state.settings.session_max_age_seconds


def _has_any_user(session: Session) -> bool:
    return session.scalar(select(User.id).limit(1)) is not None


def _claimable_legacy_user(session: Session) -> User | None:
    """找出可被首装注册**就地接管**的无凭据老行，没有则返回 ``None``。

    这类行只可能来自两条历史路径：删号前的本机管理员账号文件，或备份导入的账号。
    它们的共同点是口令被写成哨兵值（``security.passwords.CREDENTIALLESS_SENTINELS``），
    而哨兵不是任何哈希算法可产生的格式 —— ``verify_password`` 对**任何**输入都返回
    False，所以这一行根本登不进来。

    问题在于它同时会被 ``_has_any_user`` 算作「本机已有账号」，于是首装注册被永久挡在
    409 之外、登录又永远 401：升级安装直接锁死（本机就是这么中招的）。因此注册时要
    允许接管它。

    判定刻意取「口令是哨兵」而不是「口令是哨兵**且**邮箱为空」：只要口令是哨兵，这行就
    **必然**无法登录，接管它不可能夺走任何可用账号（安全性不受影响）；反之若把「邮箱为空」
    也作为条件，一个哨兵口令却有邮箱的行就会永久无法注册、也无法登录 —— 又回到锁死。

    只认「全库唯一一行」：多用户库里不做接管，行为与原先一致（409）。
    """
    rows = session.scalars(select(User).limit(2)).all()
    if len(rows) != 1:
        return None
    (only,) = rows
    return only if is_credentialless(only.password) else None


def _verification_client(request: Request):
    return verification_client_from_settings(request.app.state.settings)


async def _verify_email_code(request: Request, email: str, code: str) -> None:
    """调用商店校验并消费注册验证码；失败统一映射成 422。"""
    client = _verification_client(request)
    try:
        await client.verify_code(email, code)
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
        initialized = _has_any_user(session) and _claimable_legacy_user(session) is None
        return SetupStatusResponse(initialized=initialized)


@router.post("/auth/verification", status_code=status.HTTP_200_OK)
async def send_verification(payload: VerificationRequest, request: Request) -> dict:
    """请求商店向指定邮箱发送注册验证码（公开，但要求同源写）。"""
    require_same_origin_write(request)
    client = _verification_client(request)
    try:
        result = await client.send_code(payload.email)
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
        "deliveryMode": result.get("deliveryMode"),
    }


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> UserResponse:
    """单用户注册：账号 + 邮箱 + 密码 + 邮箱验证码，建号后立即登录。

    升级安装里若只躺着一行「无凭据老行」（哨兵口令，见 ``_claimable_legacy_user``），
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
        claim = _claimable_legacy_user(session)
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
        await _verify_email_code(request, payload.email, payload.code)

        if claim is not None:
            user = claim
            user.username = payload.username
            user.email = payload.email
            user.password = hash_password(payload.password)
            user.role = "admin"
            user.is_active = True
            user.email_verified_at = datetime.now(UTC)
            # 凭据已落到本地，这行不再是「外置凭据」行。
            user.auth_externalized = False
            registered_note = f"账号 {user.username} 接管了无凭据老行并完成注册"
        else:
            user = User(
                username=payload.username,
                email=payload.email,
                password=hash_password(payload.password),
                role="admin",
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
            response, request.app.state.settings, token, max_age_seconds=_session_max_age(request)
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
    # 存量 bcrypt 哈希在登录成功后平滑升级为 argon2。
    if needs_rehash(user.password):
        user.password = hash_password(payload.password)
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
        "success", "系统后台", "账号", f"账号 {user.username} 已登录"
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
    username = "用户"
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
