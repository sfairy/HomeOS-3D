"""商店接口的共享助手：会话 Cookie、验证码与限流、口令确认闸门等跨组要用的东西。
"""
from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from apps.store.security import password_gate
from apps.store.config import StoreSettings
from apps.store.core.models import (
    Account,
    AccountSession,
    Customer,
    EmailVerification,
)
from apps.store.security.limiter import SlidingWindowLimiter
from apps.store.security.request_security import resolve_client_ip, secure_cookies_required
from apps.store.security.security import (
    code_hash,
    new_token,
    token_hash,
    utcnow,
)


logger = logging.getLogger("apps.store.api")
#: 同一邮箱一小时内最多能索取多少次验证码（含注册与找回密码）。
MAX_VERIFICATION_SENDS_PER_HOUR = 10
_VERIFICATION_IP_LIMITER = SlidingWindowLimiter(limit=20, window_seconds=3600.0)
#: 全站配额按 ``limit`` 缓存实例（见下）。
_VERIFICATION_GLOBAL_LIMITERS: dict[int, SlidingWindowLimiter] = {}
def _verification_global_limiter(limit: int) -> SlidingWindowLimiter:
    cached = _VERIFICATION_GLOBAL_LIMITERS.get(limit)
    if cached is None:
        cached = SlidingWindowLimiter(limit=limit, window_seconds=3600.0)
        _VERIFICATION_GLOBAL_LIMITERS[limit] = cached
    return cached
def _enforce_verification_send_quota(
    request: Request, settings: StoreSettings, *, email: str
) -> None:
    """按来源 IP 与全站总量限制发信。超限抛 429。
    """
    address = resolve_client_ip(request)
    if address.per_client and address.ip:
        if not _VERIFICATION_IP_LIMITER.allow(f"ip:{address.ip}"):
            retry_after = max(1, int(_VERIFICATION_IP_LIMITER.retry_after(f"ip:{address.ip}")) or 1)
            logger.warning("发信配额：来源 IP 触顶 ip=%s", address.ip)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="当前网络获取验证码过于频繁，请 1 小时后再试。",
                headers={"Retry-After": str(retry_after)},
            )

    limit = max(1, int(settings.verification_global_hourly_limit or 500))
    global_limiter = _verification_global_limiter(limit)
    if not global_limiter.allow("global"):
        retry_after = max(1, int(global_limiter.retry_after("global")) or 1)
        logger.error(
            "发信配额：全站小时上限 %d 已触顶，所有用户都将暂时收不到验证码。"
            "如属正常业务量，请调高 STORE_VERIFICATION_GLOBAL_HOURLY_LIMIT。",
            limit,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="暂时无法发送验证码，请稍后再试。",
            headers={"Retry-After": str(retry_after)},
        )
# 公共工具
def _base_url(request: Request) -> str:
    return request.app.state.settings.public_base_url
def _require_verified(account: Account) -> None:
    if account.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="请先验证邮箱。"
        )
def _set_session_cookies(
    request: Request, response: Response, *, token: str, hint: str
) -> None:
    settings: StoreSettings = request.app.state.settings
    # Secure 按请求自动判定（https 基址 / 可信代理转发的 https / 本连接 https），
    secure = secure_cookies_required(request)
    response.set_cookie(
        settings.cookie_name,
        token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )
    response.set_cookie(
        settings.hint_cookie_name,
        hint,
        max_age=settings.session_max_age_seconds,
        httponly=False,
        samesite="lax",
        secure=secure,
        path="/",
    )
def _clear_session_cookies(request: Request, response: Response) -> None:
    settings: StoreSettings = request.app.state.settings
    response.delete_cookie(settings.cookie_name, path="/")
    response.delete_cookie(settings.hint_cookie_name, path="/")
def _create_session(session, request: Request, account: Account) -> str:
    token = new_token(32)
    settings: StoreSettings = request.app.state.settings
    moment = utcnow()
    session.add(
        AccountSession(
            id_hash=token_hash(token),
            account_id=account.id,
            # 诊断页要靠这个字段区分「谁在用后台」。登录那一刻账号是否管理员就定了；
            is_admin_session=bool(account.is_admin),
            expires_at=moment + timedelta(seconds=settings.session_max_age_seconds),
            last_seen_at=moment,
            ip_address=resolve_client_ip(request).ip[:64] or None,
            user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        )
    )
    account.last_login_at = moment
    session.flush()
    return token
def _customer_for(session, account: Account) -> Customer:
    """取（必要时创建）账号对应的客户档案行。
    """
    customer = session.scalars(
        select(Customer).where(Customer.account_id == account.id)
    ).first()
    if customer is not None:
        return customer

    customer = Customer(account_id=account.id, email=account.email, name=account.email)
    try:
        # 用 SAVEPOINT 而非整个事务回滚：失败时只丢掉这一条 INSERT，调用方在本事务里已完成的其它写入
        with session.begin_nested():
            session.add(customer)
            session.flush()
    except IntegrityError as error:
        message = str(getattr(error, "orig", error))
        if "UNIQUE constraint failed" not in message or "customers.account_id" not in message:
            raise
        # 竞争对手先建好了：把自己这条脏对象从会话里摘掉，把已有的读回来。
        if customer in session:
            session.expunge(customer)
        existing = session.scalars(
            select(Customer).where(Customer.account_id == account.id)
        ).first()
        if existing is None:
            raise
        return existing
    return customer
# 账号

_PURPOSES_REQUIRING_ACCOUNT = frozenset({"verify", "change_email"})
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", "testclient", ""})
def _client_host(request: Request) -> str:
    client = getattr(request, "client", None)
    return str(getattr(client, "host", "") or "").strip().lower()
def _is_loopback_client(request: Request) -> bool:
    """请求的**真实来源**是否在本机。
    """
    try:
        address = resolve_client_ip(request)
    except Exception:  # noqa: BLE001 - 解析异常时按更严格的「非本机」处理
        return False
    if not getattr(address, "per_client", False):
        return _client_host(request) in _LOOPBACK_HOSTS
    return str(getattr(address, "ip", "") or "").strip().lower() in _LOOPBACK_HOSTS
def _assert_purpose_allowed(
    session, *, purpose: str, email: str, account: Account | None
) -> None:
    """按用途校验发码前置条件。
    """
    if purpose in _PURPOSES_REQUIRING_ACCOUNT and account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录后再获取该验证码。"
        )

    existing = session.scalars(
        select(Account).where(func.lower(Account.email) == email)
    ).first()

    # register / reset 一律按正常流程发码并返回同样的 200（已注册不报 409、未注册不报 404），
    if purpose in {"register", "reset"}:
        return

    if purpose == "verify":
        if account is None or (account.email or "").strip().lower() != email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能验证当前账号绑定的邮箱。",
            )
        if account.email_verified_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="该邮箱已验证，无需重复验证。"
            )
        return

    if purpose == "change_email":
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="该邮箱已被其它账号使用。"
            )
        if account is not None and (account.email or "").strip().lower() == email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="新邮箱与当前邮箱相同。"
            )
def _consume_verification(session, *, email: str, purpose: str, code: str) -> None:
    scope = f"verify:{email}"
    if password_gate.retry_after_seconds(session, scope) > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="验证码错误次数过多，请稍后重新获取。",
        )
    record = session.scalars(
        select(EmailVerification)
        .where(EmailVerification.email == email)
        .where(EmailVerification.purpose == purpose)
        .where(EmailVerification.consumed_at.is_(None))
        .order_by(EmailVerification.created_at.desc())
        .limit(1)
    ).first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先获取邮箱验证码。")
    if record.expires_at <= utcnow():
        # 同上：过期不是「猜错」，把它算成失败次数只会让正常用户被自己拖累。
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码已过期，请重新获取。")
    if int(record.attempts or 0) >= MAX_VERIFICATION_CODE_ATTEMPTS:
        _record_verify_failure(session, scope)
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="尝试次数过多，请重新获取验证码。")
    if record.code_hash != code_hash(code.strip(), record.code_salt or ""):
        # 先记账再从 ORM 改 attempts：此时本事务还只有 SELECT，没有持有 SQLite
        _record_verify_failure(session, scope)
        record.attempts = int(record.attempts or 0) + 1
        session.flush()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码不正确。")
    record.consumed_at = utcnow()
    password_gate.clear(session, scope)
    session.flush()
#: 单封验证码最多可以被尝试几次（按验证码记录计）。
MAX_VERIFICATION_CODE_ATTEMPTS = 8
def _record_verify_failure(session, scope: str) -> None:
    """记录一次验证码失败，作为 ``verify:<email>`` 的限流依据。
    """
    record_attempt_in_new_session(session, scope)
def record_attempt_in_new_session(session, scope: str) -> None:
    """在一个独立事务里记录失败尝试，确保外层请求回滚不会把它抹掉。
    """
    factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False, future=True)
    try:
        with factory() as probe:
            password_gate.record_attempt(probe, scope, succeeded=False)
            probe.commit()
    except SQLAlchemyError:
        logger.warning("限流记录写入失败，本次不计入 scope=%s", scope, exc_info=True)
#: 登录限流的阈值。按来源 IP 放宽（同一个出口 NAT 后面可能坐着整间办公室）。
LOGIN_IP_MAX_ATTEMPTS = 30
#: 全局维度**只告警、不拦截**，见 :func:`_note_login_failure` 的说明。
LOGIN_FLOOD_ALERT_ATTEMPTS = 120
LOGIN_GLOBAL_SCOPE = "login-global"
def _login_scopes(request: Request, email: str) -> list[str]:
    """一次登录失败要记到哪些维度上。
    """
    scopes = [f"login:{email}"]
    address = resolve_client_ip(request)
    if address.per_client and address.ip:
        scopes.append(f"login-ip:{address.ip}")
    return scopes
def _note_login_failure(session, scopes: list[str]) -> None:
    """把失败记进各维度，并在全局量异常时告警。
    """
    session.rollback()
    for scope in scopes:
        record_attempt_in_new_session(session, scope)
    record_attempt_in_new_session(session, LOGIN_GLOBAL_SCOPE)
    try:
        factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False, future=True)
        with factory() as probe:
            failures = password_gate.recent_failures(probe, LOGIN_GLOBAL_SCOPE)
    except SQLAlchemyError:
        logger.warning("全局登录失败计数读取失败，跳过告警判断", exc_info=True)
        return
    if failures >= LOGIN_FLOOD_ALERT_ATTEMPTS:
        logger.warning(
            "登录失败量异常：最近 %s 分钟内全局失败 %s 次，疑似分布式撞库（全局维度不拦截，"
            "如需止血请按来源网段处理）",
            password_gate.WINDOW_MINUTES,
            failures,
        )
_PASSWORD_CONFIRM_SCOPE_PREFIX = "confirm:"
def _password_confirmation_scope(account) -> str:
    """口令确认按**账号**限流，不按来源 IP。
    """
    return f"{_PASSWORD_CONFIRM_SCOPE_PREFIX}{account.id}"
def _enforce_password_confirmation_gate(session, account) -> str:
    """校验口令之前先看冷却，返回 scope 供失败/成功记账。
    """
    scope = _password_confirmation_scope(account)
    remaining = password_gate.retry_after_seconds(session, scope)
    if remaining > 0:
        logger.warning("口令确认被限流 scope=%s 剩余=%s 秒", scope, remaining)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"密码错误次数过多，请 {remaining} 秒后再试。",
            headers={"Retry-After": str(remaining)},
        )
    return scope
def _note_password_confirmation_failure(session, scope: str) -> None:
    """记一次口令确认失败。
    """
    session.rollback()
    record_attempt_in_new_session(session, scope)
