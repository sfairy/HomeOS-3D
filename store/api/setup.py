"""商店首次部署初始化：通过页面设置管理员账号。

seed 脚本适合 CI/自动化场景；本模块提供等价的 HTTP 接口，让部署者直接在
浏览器里完成首次初始化，无需 SSH 到服务器跑命令。

安全约束：
- 仅在没有任何管理员账号时可用（已有管理员则 409）。
- POST 请求受 same_origin 中间件保护（/store/v1/ 前缀）。
- 创建后自动登录并下发会话 Cookie，部署者无需再手动登一次。
"""

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from store.deps import DbSession
from store.models import Account, AccountSession
from store.request_security import resolve_client_ip, secure_cookies_required
from store.security import hash_password, new_token, token_hash, utcnow

logger = logging.getLogger("store.setup")

router = APIRouter(prefix="/store/v1/setup", tags=["setup"])

MIN_PASSWORD_LENGTH = 8


class SetupAdminRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=MIN_PASSWORD_LENGTH)
    confirm_password: str = Field(min_length=MIN_PASSWORD_LENGTH)


@router.get("/status", include_in_schema=False)
def setup_status(session: DbSession) -> dict:
    """检查是否需要初始化管理员。"""
    admin_count = session.scalar(
        select(func.count()).select_from(Account).where(Account.is_admin == True)  # noqa: E712
    )
    initialized = (admin_count or 0) > 0
    return {"initialized": initialized}


@router.post("/admin", status_code=status.HTTP_201_CREATED)
def setup_admin(
    payload: SetupAdminRequest,
    request: Request,
    session: DbSession,
) -> Response:
    email = payload.email.strip().lower()

    if payload.confirm_password != payload.password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="两次输入的密码不一致。",
        )

    # 幂等守卫：已有管理员时拒绝创建第二个。
    existing_admin = session.scalar(
        select(Account).where(Account.is_admin == True).limit(1)  # noqa: E712
    )
    if existing_admin is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="管理员账号已存在，无法重复初始化。",
        )

    # 邮箱唯一性
    existing = session.scalar(
        select(Account).where(func.lower(Account.email) == email)
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该邮箱已被注册，请更换邮箱或直接登录。",
        )

    account = Account(
        email=email,
        password_hash=hash_password(payload.password),
        is_admin=True,
        is_active=True,
        email_verified_at=utcnow(),
    )
    session.add(account)
    session.flush()

    # 自动登录：下发会话 Cookie，部署者无需再手动登一次。
    settings = request.app.state.settings
    token = new_token(32)
    moment = utcnow()
    session.add(
        AccountSession(
            id_hash=token_hash(token),
            account_id=account.id,
            is_admin_session=True,
            expires_at=moment + timedelta(seconds=settings.session_max_age_seconds),
            last_seen_at=moment,
            ip_address=resolve_client_ip(request).ip[:64] or None,
            user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        )
    )
    account.last_login_at = moment
    session.flush()
    session.commit()

    logger.info("商店管理员初始化成功 email=%s", email)

    secure = secure_cookies_required(request)
    response = JSONResponse(
        {"email": account.email, "isAdmin": True},
        status_code=status.HTTP_201_CREATED,
    )
    response.set_cookie(
        settings.cookie_name,
        token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )
    return response
