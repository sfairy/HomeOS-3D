"""商店首次部署初始化：通过页面设置管理员账号。
"""

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import Boolean, DateTime, String, exists, func, insert, literal, select

from .store_shared import _customer_for, _set_session_cookies
from ..core.deps import DbSession
from ..core.models import Account, AccountSession
from ..core.schemas import StrongPassword
from ..security.request_security import resolve_client_ip
from ..security.security import (
    PASSWORD_POLICY_MESSAGE,
    hash_password,
    is_password_policy_compliant,
    is_valid_email,
    new_token,
    new_uuid,
    normalize_username,
    token_hash,
    utcnow,
)

logger = logging.getLogger("src.setup")

router = APIRouter(prefix="/store/v1/setup", tags=["setup"])


class SetupAdminRequest(BaseModel):
    #: 登录账号名：与商店注册同口径（3–64 位，不含 ``@`` 与空白）。
    #: 建好的管理员同时也是商店用户，之后可像普通用户一样用账号名或邮箱登录前台。
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    password: StrongPassword
    confirm_password: StrongPassword
    setup_token: str = Field(default="", max_length=512)

    @model_validator(mode="after")
    def normalize(self) -> SetupAdminRequest:
        # 清洗口径与注册完全一致（`RegisterRequest.validate_register`）：
        # 非法账号（含 @ / 空白 / 控制字符）在这里就 422，不等到 insert 撞库再报。
        try:
            self.username = normalize_username(self.username)
        except ValueError as error:
            raise ValueError(str(error)) from error
        self.email = self.email.strip().lower()
        return self


def admin_exists(session) -> bool:
    """库里是否已有管理员。"""
    return (
        session.scalar(
            select(func.count()).select_from(Account).where(Account.is_admin == True)
        )
        or 0
    ) > 0


SETUP_TOKEN_HINT = (
    "启动日志里的 SETUP-TOKEN= 行就是引导密钥；"
    "也可以用 STORE_SETUP_TOKEN 指定一份后重启服务。"
)
SETUP_SERVICE_UNAVAILABLE = "初始化服务未就绪，请重启商店服务后再试。"


@router.get("/status", include_in_schema=False)
def setup_status(request: Request, session: DbSession) -> dict:
    """初始化状态：已初始化 / 可初始化（本机直连，或需引导密钥）/ 服务未就绪。

    以前「没带引导密钥的远程访问者」也会拿到 initialized=true，初始化页于是直接
    把人送去登录页；而库里其实一个管理员都没有 —— 实例就卡在谁也无法初始化的
    状态里。现在的口径只有一条：只有库里真有管理员，才叫已初始化。
    """
    guard = getattr(request.app.state, "setup_guard", None)
    local_access = bool(guard is not None and guard.has_setup_privilege(request))
    if admin_exists(session):
        return {
            "initialized": True,
            "canInitialize": False,
            "localAccess": local_access,
            "requiresSetupToken": False,
            "setupTokenHint": "",
        }
    if guard is None:
        # 装配异常的兜底：宁可报 503 让运维重启，也不能谎报「已初始化」。
        logger.error("初始化状态不可判定：app.state.setup_guard 缺失")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=SETUP_SERVICE_UNAVAILABLE,
        )
    return {
        "initialized": False,
        "canInitialize": True,
        "localAccess": local_access,
        "requiresSetupToken": not local_access,
        "setupTokenHint": "" if local_access else SETUP_TOKEN_HINT,
    }


def _validate_setup_admin_input(payload: SetupAdminRequest, session: DbSession) -> str:
    """校验邮箱格式、确认密码与「尚未初始化」；返回规范化邮箱。

    邮箱 / 账号名唯一性检查仍在 ``setup_admin`` 里、``guard.authorize`` 之后执行（保持原顺序：
    未通过引导密钥的调用方问不出「某个邮箱或账号名是否已被占用」）。
    """
    email = payload.email.strip().lower()
    if not is_valid_email(email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="请输入有效的邮箱地址（形如 name@example.com）。",
        )
    # schema 已在解析期挡过一次；这里再兜一次，防止有人用 ``model_construct`` 绕过校验。
    if not is_password_policy_compliant(payload.password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=PASSWORD_POLICY_MESSAGE,
        )
    if payload.confirm_password != payload.password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="两次输入的密码不一致。",
        )
    if admin_exists(session):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="管理员账号已存在，无法重复初始化。",
        )
    return email


def _insert_admin_account(
    session: DbSession, *, username: str, email: str, password: str, moment
) -> str:
    account_id = new_uuid()
    password_hash = hash_password(password)
    statement = (
        insert(Account)
        .from_select(
            [
                "id",
                "username",
                "email",
                "password_hash",
                "email_verified_at",
                "is_admin",
                "is_active",
                "created_at",
                "updated_at",
            ],
            select(
                literal(account_id, String(36)),
                literal(username, String(64)),
                literal(email, String(255)),
                literal(password_hash, String(512)),
                literal(moment, DateTime),
                literal(True, Boolean),
                literal(True, Boolean),
                literal(moment, DateTime),
                literal(moment, DateTime),
            ).where(~exists(select(Account.id).where(Account.is_admin == True))),
        )
        .execution_options(synchronize_session=False)
    )
    executed = session.execute(statement)
    if executed.rowcount == 0:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="管理员账号已存在，无法重复初始化。",
        )
    return account_id


def _create_admin_session(
    session: DbSession,
    request: Request,
    *,
    account_id: str,
    moment,
    settings,
) -> str:
    token = new_token(32)
    session.add(
        AccountSession(
            id_hash=token_hash(token),
            account_id=account_id,
            is_admin_session=True,
            expires_at=moment + timedelta(seconds=settings.session_max_age_seconds),
            last_seen_at=moment,
            ip_address=resolve_client_ip(request).ip[:64] or None,
            user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        )
    )
    session.execute(
        Account.__table__.update()  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy Table.update()（__table__ 运行期为 Table）
        .where(Account.id == account_id)
        .values(last_login_at=moment)
        .execution_options(synchronize_session=False)
    )
    return token


@router.post("/admin", status_code=status.HTTP_201_CREATED)
def setup_admin(
    payload: SetupAdminRequest,
    request: Request,
    session: DbSession,
) -> Response:
    guard = getattr(request.app.state, "setup_guard", None)
    if guard is None:
        # fail-closed：没有守卫就说明应用装配不完整，绝不能当成「本机放行」。
        logger.error("初始化请求被拒：app.state.setup_guard 缺失（fail-closed）")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=SETUP_SERVICE_UNAVAILABLE,
        )
    # 先过守卫、再动输入：未通过引导密钥的调用方不该问出「管理员是否已存在」，
    # 也不该问出某个邮箱 / 账号名是否已被占用。
    guard.authorize(request, payload.setup_token)
    email = _validate_setup_admin_input(payload, session)

    existing = session.scalar(select(Account).where(func.lower(Account.email) == email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该邮箱已被注册，请更换邮箱或直接登录。",
        )
    taken = session.scalar(select(Account).where(Account.username == payload.username))
    if taken is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该账号名已被占用，请更换账号名。",
        )

    settings = request.app.state.settings
    moment = utcnow()
    account_id = _insert_admin_account(
        session,
        username=payload.username,
        email=email,
        password=payload.password,
        moment=moment,
    )
    # 管理员同时也是商店用户：立刻补建客户档案，账号中心 / 下单不必再等第一次下单时补建。
    account = session.get(Account, account_id)
    if account is not None:
        _customer_for(session, account)
    token = _create_admin_session(
        session, request, account_id=account_id, moment=moment, settings=settings
    )
    session.flush()
    session.commit()

    guard.consume()

    logger.info("商店管理员初始化成功 username=%s email=%s", payload.username, email)
    response = JSONResponse(
        {
            "account": {
                "id": account_id,
                "username": payload.username,
                "email": email,
                "isAdmin": True,
            },
            "email": email,
            "username": payload.username,
            "isAdmin": True,
        },
        status_code=status.HTTP_201_CREATED,
    )
    # 与 `/store/v1/auth/login` 口径一致：会话 cookie 之外还要写 hint cookie。
    # 少了它，初始化完成后首屏之前的外壳读不到登录态，会先闪一帧游客导航。
    _set_session_cookies(request, response, token=token, hint="unlicensed")
    return response
