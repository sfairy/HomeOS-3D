"""商店接口的 auth 资源组（从 api/store.py 拆出）。
"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select

from ..commerce import referrals
from ..security import password_gate
from ..config import StoreSettings
from ..core.deps import AuthedAccount, CurrentAccount, DbSession
from ..core.models import (
    Account,
    AccountSession,
    ReferralWallet,
)
from .admin_shared import _drop_account_sessions
from ..security.request_security import resolve_client_ip
from ..core.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    PasswordResetRequest,
    RegisterRequest,
)
from ..security.security import (
    hash_password,
    token_hash,
    utcnow,
    verify_password,
)
from ..core.serializers import (
    account_state_payload,
)


from .store_shared import (
    LOGIN_IP_MAX_ATTEMPTS,
    _clear_session_cookies,
    _consume_verification,
    _create_session,
    _customer_for,
    _enforce_password_confirmation_gate,
    _login_scopes,
    _note_login_failure,
    _note_password_confirmation_failure,
    _set_session_cookies,
    logger,
)
from .store_catalog import (
    _account_license_state,
    _has_used_trial,
)


router = APIRouter()

#: 未知账号时用来空跑一次口令校验的哈希。与真实哈希**同一套参数**（同一个 PBKDF2
#: 迭代次数），否则「空跑」本身又是另一种耗时。惰性计算：一次 PBKDF2 是几十毫秒，
#: 不该加在进程启动（以及每次跑测试建 app）的路径上。
_dummy_hash: str | None = None


def _dummy_password_hash() -> str:
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password(secrets.token_urlsafe(32))
    return _dummy_hash


@router.post("/auth/register")
def register(payload: RegisterRequest, request: Request, session: DbSession) -> Response:
    email = payload.email.strip().lower()
    if payload.confirm_password and payload.confirm_password != payload.password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="两次输入的密码不一致。")

    _consume_verification(session, email=email, purpose="register", code=payload.code)

    existing = session.scalars(select(Account).where(func.lower(Account.email) == email)).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该邮箱已注册，请直接登录。")

    account = Account(
        email=email,
        password_hash=hash_password(payload.password),
        email_verified_at=utcnow(),
    )
    session.add(account)
    session.flush()
    _customer_for(session, account)

    referral_code = (payload.referral_code or "").strip()
    referral_note = ""
    if referral_code:
        if not referral_code.isdigit():
            # 邀请码是纯数字；填错格式时之前是**静默忽略**，用户以为绑定成功了，
            referral_note = "邀请码格式不正确（应为纯数字），本次未绑定邀请关系。"
        else:
            referrer_wallet = session.scalars(
                select(ReferralWallet).where(ReferralWallet.code == referral_code)
            ).first()
            if referrer_wallet is None:
                referral_note = "邀请码不存在，本次未绑定邀请关系。"
            else:
                referrer = session.get(Account, referrer_wallet.account_id)
                if referrals.is_self_referral(session, referrer, account):
                    referral_note = "不能使用自己的邀请码，本次未绑定邀请关系。"
                    logger.warning("拦截自邀注册 email=%s code=%s", email, referral_code)
                else:
                    account.referred_by_account_id = referrer_wallet.account_id
                    account.referral_bound_at = utcnow()
                    session.flush()

    token = _create_session(session, request, account)
    session.commit()
    state = _account_license_state(session, account)
    body = account_state_payload(
        account,
        has_permanent=state[0],
        has_temporary=state[1],
        has_used_trial=_has_used_trial(session, account),
    )
    # 邀请码没能绑定时必须让用户看到：绑定只在注册这一步发生，静默失败之后
    body["referralNote"] = referral_note
    response = JSONResponse(body)
    _set_session_cookies(
        request,
        response,
        token=token,
        hint="permanent" if state[0] else ("temporary" if state[1] else "unlicensed"),
    )
    return response
















@router.post("/auth/login")
def login(payload: LoginRequest, request: Request, session: DbSession) -> Response:
    email = payload.email.strip().lower()
    # 限流表只增不减（prune 定义了却没人调用），挂在登录这条本来就要写的路径上。
    password_gate.maybe_prune(session)
    account_scope = f"login:{email}"
    # 按 IP 那一档只在来源地址可信时启用，理由见 _login_scopes。
    address = resolve_client_ip(request)
    ip_scope = f"login-ip:{address.ip}" if address.per_client and address.ip else ""

    remaining = password_gate.retry_after_seconds(session, account_scope)
    blocked_scope = account_scope
    if remaining <= 0 and ip_scope:
        remaining = password_gate.retry_after_seconds(
            session, ip_scope, max_attempts=LOGIN_IP_MAX_ATTEMPTS
        )
        blocked_scope = ip_scope
    if remaining > 0:
        logger.warning("登录被限流 scope=%s 剩余=%s 秒", blocked_scope, remaining)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"尝试过于频繁，请 {remaining} 秒后再试。",
            headers={"Retry-After": str(remaining)},
        )

    account = session.scalars(select(Account).where(func.lower(Account.email) == email)).first()
    # 未知 / 已停用的账号也要**空跑**一次等价的口令校验。短路掉 PBKDF2 会让
    # 「账号不存在」明显快于「密码错」，那本身就是一个可被利用的账号枚举侧信道：
    # 攻击者不需要读响应，只要量时间就能筛出哪些邮箱注册过。
    if account is None or not account.is_active:
        verify_password(payload.password, _dummy_password_hash())
        ok = False
    else:
        ok = verify_password(payload.password, account.password_hash)
    if not ok:
        _note_login_failure(session, _login_scopes(request, email))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码不正确。")

    # 登录成功：清掉这个账号与这个来源 IP 的失败计数。清来源 IP 是为了「同一个人先打错几次再成功」的正常体验，
    password_gate.clear(session, account_scope)
    if ip_scope:
        password_gate.clear(session, ip_scope)
    password_gate.record_attempt(session, account_scope, succeeded=True)

    # 走到这里 ``ok`` 必为真，意味着上面对 ``account`` 的 ``is None`` 分支已被排除，
    # 此处显式收窄给静态检查看（运行期不变量，不改任何业务路径）。
    assert account is not None

    token = _create_session(session, request, account)
    session.commit()
    permanent, temporary = _account_license_state(session, account)
    response = JSONResponse(
        account_state_payload(
            account,
            has_permanent=permanent,
            has_temporary=temporary,
            has_used_trial=_has_used_trial(session, account),
        )
    )
    _set_session_cookies(
        request,
        response,
        token=token,
        hint="permanent" if permanent else ("temporary" if temporary else "unlicensed"),
    )
    return response


@router.delete("/auth/logout")
def logout(request: Request, session: DbSession) -> Response:
    settings: StoreSettings = request.app.state.settings
    token = request.cookies.get(settings.cookie_name)
    if token:
        record = session.get(AccountSession, token_hash(token))
        if record is not None:
            session.delete(record)
            session.flush()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_session_cookies(request, response)
    return response


@router.get("/auth/me")
def me(request: Request, session: DbSession, account: CurrentAccount) -> Response:
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录。")
    permanent, temporary = _account_license_state(session, account)
    response = JSONResponse(
        account_state_payload(
            account,
            has_permanent=permanent,
            has_temporary=temporary,
            has_used_trial=_has_used_trial(session, account),
        )
    )
    return response


@router.post("/auth/change-password")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    session: DbSession,
    account: AuthedAccount,
) -> dict:
    """已登录账号修改密码。
    """
    confirm_scope = _enforce_password_confirmation_gate(session, account)
    if not verify_password(payload.old_password, account.password_hash):
        _note_password_confirmation_failure(session, confirm_scope)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="当前密码不正确。")
    password_gate.clear(session, confirm_scope)

    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="两次输入的新密码不一致。")

    if verify_password(payload.new_password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="新密码与当前密码相同。")

    account.password_hash = hash_password(payload.new_password)

    # 踢掉其它设备的会话，只保留当前这一个。改密码就是为了止损，
    settings: StoreSettings = request.app.state.settings
    current = token_hash(request.cookies.get(settings.cookie_name) or "")
    _drop_account_sessions(session, account.id, keep_hash=current)

    session.commit()
    logger.info("密码已修改 account=%s", account.id)
    return {"success": True}


@router.post("/auth/password/reset")
def reset_password(payload: PasswordResetRequest, request: Request, session: DbSession) -> dict:
    email = payload.email.strip().lower()
    if payload.confirm_password and payload.confirm_password != payload.password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="两次输入的密码不一致。")
    # 同 ``register`` —— 先消费验证码，再表态邮箱是否存在。
    _consume_verification(session, email=email, purpose="reset", code=payload.code)

    account = session.scalars(select(Account).where(func.lower(Account.email) == email)).first()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="该邮箱尚未注册。")

    account.password_hash = hash_password(payload.password)
    # 重置密码后强制所有会话下线
    _drop_account_sessions(session, account.id)
    session.commit()
    return {"email": email, "reset": True}
