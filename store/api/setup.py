"""商店首次部署初始化：通过页面设置管理员账号。

这是**唯一**的首次初始化入口：部署者直接在浏览器里创建管理员，无需 SSH 到服务器跑命令，也不再有
「用环境变量预置默认管理员」的路径（那等于给每个照文档部署的实例留一个公开后门）。

安全约束：① 仅有同源中间件不够（它在不带 Origin/Referer 时放行，``curl`` 默认不带），非本机直连的
请求必须带上 ``STORE_SETUP_TOKEN``；② 管理员创建改成一条 ``INSERT ... SELECT ... WHERE NOT EXISTS``，
由数据库决定谁抢到，避免「先 SELECT 再 INSERT」在 argon2 的宽窗口里被并发双建，抢不到的一律 409；
③ 仅在没有任何管理员账号时可用；④ 创建后自动登录并下发会话 Cookie。
"""

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, String, exists, func, insert, literal, select

from store.core.deps import DbSession
from store.core.models import Account, AccountSession
from store.security.request_security import resolve_client_ip, secure_cookies_required
from store.security.security import (
    hash_password,
    is_valid_email,
    new_token,
    new_uuid,
    token_hash,
    utcnow,
)

logger = logging.getLogger("store.setup")

router = APIRouter(prefix="/store/v1/setup", tags=["setup"])

MIN_PASSWORD_LENGTH = 8


class SetupAdminRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=MIN_PASSWORD_LENGTH)
    confirm_password: str = Field(min_length=MIN_PASSWORD_LENGTH)
    #: 非本机直连时必须提供；用 localhost / 127.0.0.1 从本机（loopback 对端、未经代理）访问时可以留空。
    setup_token: str = Field(default="", max_length=512)


def admin_exists(session) -> bool:
    """库里是否已有管理员。"""
    return (
        session.scalar(
            select(func.count()).select_from(Account).where(Account.is_admin == True)  # noqa: E712
        )
        or 0
    ) > 0


@router.get("/status", include_in_schema=False)
def setup_status(request: Request, session: DbSession) -> dict:
    """检查是否需要初始化管理员。
    **对任何人如实回答「初始化了没有」等于免费提供探针**：``false`` 就是在对全网宣告「这家店还没有
    管理员，来抢」，而它唯一的正当用途只对**本来就有资格初始化**的调用方有意义。所以只对这类调用方
    （本机直连，或带了正确的 ``X-Setup-Token``）回答真相，其余一律回 ``true`` —— 安全默认且不泄漏信息。
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

    # 邮箱形态校验先于任何状态判断：只看请求体，不泄漏「有没有管理员 / 引导密钥对不对」。
    # 必须校验是因为它是**管理员账号的登录标识**，而同一值在后台建账号、测试发信等入口都先过
    # ``is_valid_email`` 再落库 —— 只有「首次设置」不过，恰恰是部署者最认真输入的一次。
    if not is_valid_email(email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="请输入有效的邮箱地址（形如 name@example.com）。",
        )

    if payload.confirm_password != payload.password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="两次输入的密码不一致。",
        )

    # 顺序有讲究：1) 先判「是否已有管理员」，必须排在守卫前 —— 初始化后守卫会作废
    # 引导密钥，先过守卫会得到摸不着头脑的 403 而非 409；2) 守卫排在 argon2 前，否则
    # 未授权请求先烧一遍 ``hash_password`` 等于免费打满 CPU；3) 邮箱唯一性只为文案。
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

    # 原子抢占「第一个管理员」这个名额：判空与写入在同一条语句里，由数据库定胜负。
    # 不能用「先 SELECT 后 INSERT」—— 两次调用可以各自读到 admin_count=0。
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
                    select(Account.id).where(Account.is_admin == True)  # noqa: E712
                )
            ),
        )
        .execution_options(synchronize_session=False)
    )
    result = session.execute(statement)
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="管理员账号已存在，无法重复初始化。",
        )

    # 自动登录：下发会话 Cookie，部署者无需再手动登一次。
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
        Account.__table__.update()
        .where(Account.id == account_id)
        .values(last_login_at=moment)
        .execution_options(synchronize_session=False)
    )
    session.flush()
    session.commit()

    # 初始化窗口到此关闭：作废引导密钥（自动生成的那份直接删文件）。
    if guard is not None:
        guard.consume()

    logger.info("商店管理员初始化成功 email=%s", email)

    secure = secure_cookies_required(request)
    response = JSONResponse(
        {"email": email, "isAdmin": True},
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
