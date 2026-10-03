"""商店接口的共享助手：会话 Cookie、验证码与限流、口令确认闸门等跨组要用的东西。
"""
from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from ..config import StoreSettings
from ..core.models import (
    Account,
    AccountSession,
    Customer,
    EmailVerification,
)
from ..ops import site_settings as site_config
from ..payments.base import PaymentError
from ..security import password_gate
from ..security.limiter import SlidingWindowLimiter
from ..security.request_security import resolve_client_ip, secure_cookies_required
from ..security.security import (
    code_hash,
    new_token,
    token_hash,
    token_matches,
    utcnow,
)

logger = logging.getLogger("src.api")
MAX_VERIFICATION_SENDS_PER_HOUR = 10
_VERIFICATION_IP_LIMITER = SlidingWindowLimiter(limit=20, window_seconds=3600.0)
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

    并发创建撞唯一键时用 SAVEPOINT 只回滚这一条 INSERT：调用方在本事务里已完成的其它
    写入必须保住，因此不能整个事务回滚。
    """
    customer = session.scalars(
        select(Customer).where(Customer.account_id == account.id)
    ).first()
    if customer is not None:
        return customer

    customer = Customer(account_id=account.id, email=account.email, name=account.email)
    try:
        with session.begin_nested():
            session.add(customer)
            session.flush()
    except IntegrityError as error:
        message = str(getattr(error, "orig", error))
        if "UNIQUE constraint failed" not in message or "customers.account_id" not in message:
            raise
        if customer in session:
            session.expunge(customer)
        existing = session.scalars(
            select(Customer).where(Customer.account_id == account.id)
        ).first()
        if existing is None:
            raise
        return existing
    return customer

_PURPOSES_REQUIRING_ACCOUNT = frozenset({"verify", "change_email"})


def _assert_purpose_allowed(
    session, *, purpose: str, email: str, account: Account | None
) -> None:
    """按用途校验发码前置条件。
    """
    if purpose in _PURPOSES_REQUIRING_ACCOUNT and account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录后再获取该验证码。"
        )


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
        if account is not None and (account.email or "").strip().lower() == email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="新邮箱与当前邮箱相同。"
            )
def _check_verification_code(
    session, *, email: str, purpose: str, code: str
) -> EmailVerification:
    """校验验证码，但**不**标记为已消费。

    调用方需要「校验 → 查重/占用判断 → 消费」这个顺序时用本函数，再用
    _consume_verification_record 收尾：中间那步失败（409）时验证码仍然有效，
    用户不必重新收码；而校验在查重之前，没有验证码的人依旧问不出「该邮箱注册过没有」。
    """
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码已过期，请重新获取。")
    if int(record.attempts or 0) >= MAX_VERIFICATION_CODE_ATTEMPTS:
        _record_verify_failure(session, scope)
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="尝试次数过多，请重新获取验证码。")
    provided = code_hash(code.strip(), record.code_salt or "")
    if not token_matches(provided, record.code_hash):
        _record_verify_failure(session, scope)
        _bump_verification_attempts(session, record_id=record.id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码不正确。")
    return record


def _consume_verification_record(
    session, record: EmailVerification, *, email: str
) -> None:
    """消费一条已通过校验的验证码记录（同时清掉该邮箱的错误计数）。"""
    record.consumed_at = utcnow()
    password_gate.clear(session, f"verify:{email}")
    session.flush()


def _consume_verification(session, *, email: str, purpose: str, code: str) -> None:
    """校验并立即消费（给没有中间判断步骤的调用方用）。"""
    record = _check_verification_code(session, email=email, purpose=purpose, code=code)
    _consume_verification_record(session, record, email=email)
MAX_VERIFICATION_CODE_ATTEMPTS = 8
def _record_verify_failure(session, scope: str) -> None:
    """记录一次验证码失败，作为 verify:<email> 的限流依据。
    """
    record_attempt_in_new_session(session, scope)


def _bump_verification_attempts(session, *, record_id: str) -> None:
    """把某条验证码记录的尝试次数 +1，并在**独立事务**里提交。

    必须独立提交：调用方紧接着就会 raise，请求作用域的会话会整体回滚，
    写在同一事务里的自增会连同失败一起消失（单码尝试上限就永远不会生效）。
    """
    factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False, future=True)
    try:
        with factory() as probe:
            probe.execute(
                update(EmailVerification)
                .where(EmailVerification.id == record_id)
                .values(attempts=EmailVerification.attempts + 1)
                .execution_options(synchronize_session=False)
            )
            probe.commit()
    except SQLAlchemyError:
        logger.warning("验证码尝试次数写入失败 record=%s", record_id, exc_info=True)
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
LOGIN_IP_MAX_ATTEMPTS = 30
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
def close_order_channel_best_effort(
    request: Request,
    session,
    order,
    *,
    log_context: str,
    already_paid_detail: str,
) -> bool:
    """取消订单第一步：best-effort 关闭支付渠道，返回「渠道是否已明确关单」。

    买家自助取消（store_orders.cancel_order）与后台取消（admin_orders.admin_cancel）必须
    **同一口径**：少了这一步，旧二维码在巡检关单前（最长 RECONCILE_LOOKBACK_HOURS）仍可被支付，
    一笔迟到的成功付款会把已取消单「复活」并自动发码，取消意图被静默推翻。两条路径共用这一份
    实现，避免「改了一处忘了另一处」再次分叉。

    关单失败只记日志（留给巡检重试）并返回 False；渠道侧已付款时抛 409，文案由调用方给
    （买家看「账号中心」，管理员看「退款流程」）。
    """
    setting = site_config.get_setting(session)
    try:
        provider = request.app.state.resolve_payment_provider(
            setting, name=order.payment_provider or None
        )
    except PaymentError:
        provider = None
    if provider is None or getattr(provider, "name", "") not in {"alipay", "wechat"}:
        return False
    try:
        outcome = provider.close_payment(request.app.state.settings, order)
    except PaymentError as error:
        logger.warning(
            "%s关单失败 order=%s 错误=%s（留给巡检重试）", log_context, order.order_no, error
        )
        return False
    if outcome.already_paid:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=already_paid_detail,
        )
    return bool(outcome.closed)
