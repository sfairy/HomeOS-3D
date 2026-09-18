"""商店首次部署初始化：通过页面设置管理员账号。

seed 脚本适合 CI/自动化场景；本模块提供等价的 HTTP 接口，让部署者直接在
浏览器里完成首次初始化，无需 SSH 到服务器跑命令。

安全约束（对应安全审计的 S1）：

- **引导密钥**：仅有同源中间件是不够的 —— 它在请求不带 ``Origin``/``Referer``
  时放行，而 ``curl`` 默认就不带，于是未初始化的实例对公网就是「先到先得」。
  现在非本机直连的请求必须带上 ``STORE_SETUP_TOKEN``（或启动日志里那份自动生成的），
  详见 ``store/setup_guard.py``。
- **原子写入**：过去是「先 SELECT 数管理员，再 INSERT」，而 ``hash_password`` 走
  argon2 要几十到几百毫秒，窗口很宽 —— 合法的部署者和攻击者可以各自读到
  ``admin_count=0`` 并双双创建成功。现在改成一条
  ``INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE is_admin)``，
  由数据库决定谁抢到，抢不到的一律 409。
- 仅在没有任何管理员账号时可用（已有管理员则 409）。
- 创建后自动登录并下发会话 Cookie，部署者无需再手动登一次。
"""

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, String, exists, func, insert, literal, select

from store.deps import DbSession
from store.models import Account, AccountSession
from store.request_security import resolve_client_ip, secure_cookies_required
from store.security import (
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
    #: 非本机直连时必须提供；从本机（loopback，未经代理）访问时可以留空。
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

    **S17**：这个接口过去对任何人如实回答「初始化了没有」，等于免费提供了一个探针 ——
    ``false`` 就是在对全网宣告「这家店还没有管理员，来抢」。而它唯一的正当用途
    （首次设置页决定要不要显示表单）只对**本来就有资格初始化**的调用方有意义。

    所以现在只对这类调用方（本机直连，或带了正确的 ``X-Setup-Token``）回答真相，
    其余一律回 ``true``。回 ``true`` 而不是 ``false`` 是刻意的：前端拿到 ``true``
    会退到登录入口，这是安全默认，且两种真实状态下回答完全相同，不泄漏任何信息。

    代价：**未初始化**的远程部署必须带上引导密钥才能看到设置表单 —— 但那本来就是
    ``setup_admin`` 的要求（见 ``SetupGuard.authorize``），并没有新增门槛。
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

    # 邮箱形态校验先于任何状态判断：它只看请求体，与「有没有管理员」「引导密钥
    # 对不对」都无关，因此不会泄漏任何信息，也不会被用来当探针。
    # 为什么必须校验：这个值是**管理员账号的登录标识**，而同一个值在其它入口
    # （后台建账号 ``admin_patch_account``、测试发信的收件人）都是先过
    # ``is_valid_email`` 再落库的 —— 只有「首次设置」这个入口不过，而它恰恰是
    # 部署者第一次也可能是最后一次认真输入它的地方。拼错的后果不是报错，而是
    # 带着一个 `ops@example`（漏了后缀）或 `ops.example.com`（漏了 @）的登录标识
    # 一路跑下去，直到某天要按它收信/找回时才被发现。
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

    # 顺序是有讲究的，三层各自解决一件事：
    #   1. 「是否已有管理员」——最便宜的判空，且决定端点是否还开门。必须排在守卫
    #      之前：初始化成功后守卫会把引导密钥作废，此时若先过守卫，再来一次请求
    #      会得到「缺少引导密钥」这种让人摸不着头脑的 403，而正确答案是 409
    #      「管理员已存在」。这个信息本来也不是秘密（GET /setup/status 公开可查）。
    #   2. 守卫 —— 仍然排在 argon2 之前：``hash_password`` 很贵，让未授权的请求
    #      先烧一遍密码哈希等于提供了免费打满 CPU 的办法。
    #   3. 邮箱唯一性 —— 只为了给出更友好的文案，正确性由唯一索引兜底。
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
