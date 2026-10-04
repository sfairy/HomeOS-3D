"""商店首次部署初始化：通过页面设置管理员账号。
"""

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, String, exists, func, insert, literal, select

from .store_shared import _set_session_cookies
from ..core.deps import DbSession
from ..core.models import Account, AccountSession
from ..security.request_security import resolve_client_ip
from ..security.security import (
    hash_password,
    is_valid_email,
    new_token,
    new_uuid,
    token_hash,
    utcnow,
)

logger = logging.getLogger("src.setup")

router = APIRouter(prefix="/store/v1/setup", tags=["setup"])

MIN_PASSWORD_LENGTH = 8


class SetupAdminRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=MIN_PASSWORD_LENGTH)
    confirm_password: str = Field(min_length=MIN_PASSWORD_LENGTH)
    setup_token: str = Field(default="", max_length=512)


def admin_exists(session) -> bool:
    """库里是否已有管理员。"""
    return (
        session.scalar(
            select(func.count()).select_from(Account).where(Account.is_admin == True)
        )
        or 0
    ) > 0


@router.get("/status", include_in_schema=False)
def setup_status(request: Request, session: DbSession) -> dict:
    """检查是否需要初始化管理员。
    """
    if admin_exists(session):
        return {"initialized": True}
    guard = request.app.state.setup_guard
    if guard.has_setup_privilege(request):
        return {"initialized": False}
    return {"initialized": True}


@router.post("/admin", status_code=status.HTTP_201_CREATED)
def setup_admin(
    payload: SetupAdminRequest,
    request: Request,
    session: DbSession,
) -> Response:
    email = payload.email.strip().lower()

    if not is_valid_email(email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="请输入有效的邮箱地址（形如 name@example.com）。",
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

    guard = getattr(request.app.state, "setup_guard", None)
    if guard is not None:
        guard.authorize(request, payload.setup_token)

    existing = session.scalar(
        select(Account).where(func.lower(Account.email) == email)
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该邮箱已被注册，请更换邮箱或直接登录。",
        )

    settings = request.app.state.settings
    moment = utcnow()
    account_id = new_uuid()
    password_hash = hash_password(payload.password)

    statement = (
        insert(Account)
        .from_select(
            [
                "id",
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
                literal(email, String(255)),
                literal(password_hash, String(512)),
                literal(moment, DateTime),
                literal(True, Boolean),
                literal(True, Boolean),
                literal(moment, DateTime),
                literal(moment, DateTime),
            ).where(
                ~exists(
                    select(Account.id).where(Account.is_admin == True)
                )
            ),
        )
        .execution_options(synchronize_session=False)
    )
    result = session.execute(statement)
    if result.rowcount == 0:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="管理员账号已存在，无法重复初始化。",
        )

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
    session.flush()
    session.commit()

    if guard is not None:
        guard.consume()

    logger.info("商店管理员初始化成功 email=%s", email)

    response = JSONResponse(
        {"email": email, "isAdmin": True},
        status_code=status.HTTP_201_CREATED,
    )
    # 与 `/store/v1/auth/login` 口径一致：会话 cookie 之外还要写 hint cookie。
    # 少了它，初始化完成后首屏之前的外壳读不到登录态，会先闪一帧游客导航。
    _set_session_cookies(request, response, token=token, hint="unlicensed")
    return response
