"""商店 API：``/store/v1/*``。
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from . import store_auth, store_orders, store_referrals, telemetry
from .admin_shared import _drop_account_sessions
from .store_catalog import (
    _bundled_map,
    _center_payload,
    _evaluate_coupon_limited,
    _image_map,
    _product_item,
    _product_or_404,
    _product_stats,
    _release_snapshot_conflict,
)
from .store_shared import (
    MAX_VERIFICATION_SENDS_PER_HOUR,
    _assert_purpose_allowed,
    _check_verification_code,
    _consume_verification,
    _consume_verification_record,
    _enforce_password_confirmation_gate,
    _enforce_verification_send_quota,
    _note_password_confirmation_failure,
    _require_verified,
    logger,
)
from ..commerce import delivery
from ..config import StoreSettings
from ..core.deps import AuthedAccount, CurrentAccount, DbSession, SettingsDep
from ..core.models import (
    Account,
    Customer,
    DeviceBinding,
    DeviceReleaseEvent,
    EmailVerification,
    License,
    Order,
    Product,
)
from ..core.schemas import (
    ChangeEmailRequest,
    CouponPreviewRequest,
    LabelRequest,
    ReleaseDeviceRequest,
    VerificationRequest,
    VerifyEmailRequest,
)
from ..core.serializers import (
    device_release_policy,
    product_payload,
)
from ..ops import incidents, mail_settings, mailer
from ..ops import site_settings as site_config
from ..ops.release_sync import select_latest_release as _select_latest_release
from ..security import password_gate
from ..security.limiter import SlidingWindowLimiter
from ..security.security import (
    code_hash,
    is_valid_email,
    new_code_salt,
    new_verification_code,
    token_hash,
    utcnow,
    verify_password,
)

router = APIRouter(prefix="/store/v1", tags=["store"])

@router.get("/configuration")
def configuration(session: DbSession, settings: SettingsDep) -> dict:
    setting = site_config.get_setting(session)
    return site_config.site_configuration_payload(
        setting, settings, include_credentials=False
    )


_DECK_KEYS = {"store": "store.html", "admin": "admin.html", "setup": "setup.html"}


@router.get("/shell/deck")
def shell_deck(request: Request, session: DbSession, page: str = "store") -> dict:
    """SPA 状态甲板的读数。"""
    page_key = _DECK_KEYS.get(page)
    if page_key is None:
        raise HTTPException(status_code=404, detail="未知页面。")
    tiles = telemetry.deck_tiles(page_key, session=session, request=request)
    return {
        "tiles": [
            {
                "label": label,
                "text": text,
                "unit": unit,
                "spark": spark,
                "hook": hook,
                "since": stamp,
            }
            for (label, text, unit, spark, hook, stamp) in tiles
        ]
    }

@router.get("/products")
def list_products(session: DbSession) -> dict:
    images = _image_map(session)
    bundled = _bundled_map(session)
    products = session.scalars(
        select(Product).where(Product.active.is_(True)).order_by(Product.sort_order, Product.created_at)
    ).all()
    stats = _product_stats(session, [product.id for product in products])
    return {
        "items": [
            product_payload(
                product,
                images.get(product.id),
                bundled=bundled,
                customer_count=int(stats["customer"].get(product.id, 0)),
                purchase_count=int(stats["purchase"].get(product.id, 0)),
            )
            for product in products
        ]
    }

@router.get("/item/{product_id}")
def product_detail(product_id: str, session: DbSession) -> dict:
    product = session.get(Product, product_id)
    if product is None or not product.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在或已下架。")
    return _product_item(session, product)

@router.get("/updates/latest")
def latest_release(request: Request, session: DbSession, channel: str = "docker") -> JSONResponse:
    # 按版本号取最新（而非写入时间）：GitHub 同步行与本地补写行的写入顺序不固定。
    release = _select_latest_release(session, channel)
    payload = {
        "product": "homeos",
        "channel": channel,
        "release": None
        if release is None
        else {
            "id": release.id,
            "version": release.version,
            "releaseDate": release.release_date,
            "upgradeNotes": release.upgrade_notes,
        },
    }
    response = JSONResponse(payload)
    response.headers["Cache-Control"] = "no-store"
    return response

@router.post("/verifications")
def send_verification(
    payload: VerificationRequest,
    request: Request,
    session: DbSession,
    account: CurrentAccount,
) -> dict:
    email = payload.email.strip().lower()
    if not is_valid_email(email):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="请输入有效的邮箱地址。")

    setting = site_config.get_setting(session)
    settings: StoreSettings = mail_settings.merge_mail_settings(
        request.app.state.settings, setting
    )
    purpose = payload.purpose

    _assert_purpose_allowed(session, purpose=purpose, email=email, account=account)

    _enforce_verification_send_quota(request, settings, email=email)

    cooldown_scope = f"verify:{email}"
    remaining = password_gate.retry_after_seconds(session, cooldown_scope)
    recent = session.scalars(
        select(EmailVerification)
        .where(EmailVerification.email == email)
        .where(EmailVerification.purpose == purpose)
        .order_by(EmailVerification.created_at.desc())
        .limit(1)
    ).first()
    if recent is not None:
        elapsed = (utcnow() - recent.created_at).total_seconds()
        if elapsed < settings.verification_cooldown_seconds and remaining == 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"请 {int(settings.verification_cooldown_seconds - elapsed)} 秒后再获取验证码。",
                headers={"Retry-After": str(int(settings.verification_cooldown_seconds - elapsed))},
            )

    sent_in_window = session.execute(
        select(func.count())
        .select_from(EmailVerification)
        .where(EmailVerification.email == email)
        .where(EmailVerification.created_at >= utcnow() - timedelta(hours=1))
    ).scalar_one()
    if int(sent_in_window or 0) >= MAX_VERIFICATION_SENDS_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="该邮箱短时间内获取验证码过于频繁，请 1 小时后再试。",
        )

    code = new_verification_code()
    salt = new_code_salt()
    record = EmailVerification(
        email=email,
        purpose=purpose,
        code_hash=code_hash(code, salt),
        code_salt=salt,
        expires_at=utcnow() + timedelta(seconds=settings.verification_ttl_seconds),
    )
    session.add(record)
    password_gate.clear(session, f"verify:{email}")
    session.commit()

    result = mailer.send_verification_email(
        settings, setting, email=email, code=code, purpose=purpose
    )

    try:
        record.delivery_mode = result.mode
        record.delivery_attempts = result.attempts
        record.delivery_error = result.error
        record.delivered = result.delivered if result.mode == "smtp" else None
        record.delivered_at = utcnow()
        session.commit()
    except SQLAlchemyError as error:
        session.rollback()
        incidents.note(
            "verification.delivery_record",
            error=f"email={email} {error}",
        )
        logger.exception("验证码投递结果落库失败，验证码本身仍然有效 email=%s", email)

    body = {
        "email": email,
        "purpose": purpose,
        "expiresInSeconds": settings.verification_ttl_seconds,
        "resendAfter": settings.verification_cooldown_seconds,
        "delivered": result.delivered,
        "deliveryMode": result.mode,
        "deliveryAttempts": result.attempts,
    }
    if not result.delivered:
        if result.mode == "smtp":
            body["deliveryError"] = "验证码邮件发送失败，请稍后重试或联系客服。"
        elif result.error:
            body["deliveryError"] = result.error
    return body

router.include_router(store_auth.router)

@router.get("/account")
def account_center(request: Request, session: DbSession, account: AuthedAccount) -> Response:
    response = JSONResponse(_center_payload(session, request, account))
    response.headers["Cache-Control"] = "no-store"
    return response

@router.post("/account/email/verify")
def verify_account_email(
    payload: VerifyEmailRequest, session: DbSession, account: AuthedAccount
) -> dict:
    """用发到「当前账号邮箱」的验证码，把账号标记为邮箱已验证。
    """
    email = payload.email.strip().lower()
    if (account.email or "").strip().lower() != email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能验证当前账号绑定的邮箱。",
        )
    if account.email_verified_at is not None:
        return {"email": email, "verified": True, "alreadyVerified": True}

    _consume_verification(session, email=email, purpose="verify", code=payload.code)
    account.email_verified_at = utcnow()
    session.flush()
    logger.info("账号邮箱已验证 account=%s email=%s", account.id, email)
    return {"email": email, "verified": True, "alreadyVerified": False}

@router.post("/account/email")
def change_account_email(
    payload: ChangeEmailRequest,
    request: Request,
    session: DbSession,
    account: AuthedAccount,
) -> dict:
    """把账号邮箱换成新地址，需要发到**新地址**的验证码 + 当前登录密码。
    """
    confirm_scope = _enforce_password_confirmation_gate(session, account)
    if not verify_password(payload.password, account.password_hash):
        _note_password_confirmation_failure(session, confirm_scope)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="登录密码不正确。")
    password_gate.clear(session, confirm_scope)

    email = payload.email.strip().lower()
    if (account.email or "").strip().lower() == email:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="新邮箱与当前邮箱相同。")

    record = _check_verification_code(
        session, email=email, purpose="change_email", code=payload.code
    )

    taken = session.scalars(
        select(Account).where(func.lower(Account.email) == email)
    ).first()
    if taken is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="该邮箱已被其它账号使用。"
        )

    _consume_verification_record(session, record, email=email)

    previous = account.email
    account.email = email
    account.email_verified_at = utcnow()

    customer = session.scalars(
        select(Customer).where(Customer.account_id == account.id)
    ).first()
    if customer is not None:
        customer.email = email

    settings: StoreSettings = request.app.state.settings
    current = token_hash(request.cookies.get(settings.cookie_name) or "")
    _drop_account_sessions(session, account.id, keep_hash=current)

    session.commit()
    logger.info("账号邮箱变更 account=%s %s -> %s", account.id, previous, email)
    return {"email": email, "previousEmail": previous, "verified": True}

_LICENSE_EMAIL_LIMITER = SlidingWindowLimiter(limit=5, window_seconds=3600.0)

@router.post("/account/licenses/{license_id}/email")
def resend_license_email(
    license_id: str, request: Request, session: DbSession, account: AuthedAccount
) -> dict:
    """把这张授权的激活码重新发到购买邮箱。

    自动发码邮件已经在履约后发过一次；这个入口是给「邮箱已满 / 误删 / 当时 SMTP 抖了」
    的买家用的 —— 没有它，那些人只能靠客服人工重发。
    """
    _require_verified(account)
    license_row = session.get(License, license_id)
    if license_row is None or license_row.account_id != account.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")
    order = session.scalars(
        select(Order)
        .where(Order.license_id == license_row.id)
        .order_by(Order.created_at.desc())
    ).first()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="找不到这张授权对应的订单，无法发信，请联系客服。",
        )

    scope = f"license-email:{account.id}"
    if not _LICENSE_EMAIL_LIMITER.allow(scope):
        retry_after = max(1, int(_LICENSE_EMAIL_LIMITER.retry_after(scope)) or 1)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"重发过于频繁，请 {retry_after} 秒后再试。",
            headers={"Retry-After": str(retry_after)},
        )

    result = delivery.notify_license_issued(
        request.app.state.database, order_id=order.id, force=True
    )
    sent = bool(result.get("sent"))
    return {
        "email": order.email,
        "sent": sent,
        "deliveryError": "" if sent else (
            result.get("error") or "邮件未能发出，请稍后再试或联系客服。"
        ),
    }

@router.patch("/account/licenses/{license_id}/label")
def update_license_label(
    license_id: str, payload: LabelRequest, session: DbSession, account: AuthedAccount
) -> dict:
    license = session.get(License, license_id)
    if license is None or license.account_id != account.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")
    label = (payload.label or "").strip()
    license.user_label = label or None
    session.flush()
    return {"activationCodeId": license.id, "userLabel": license.user_label}

@router.post("/account/licenses/{license_id}/release")
def release_device(
    license_id: str,
    payload: ReleaseDeviceRequest,
    request: Request,
    session: DbSession,
    account: AuthedAccount,
) -> dict:
    license = session.get(License, license_id)
    if license is None or license.account_id != account.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")
    confirm_scope = _enforce_password_confirmation_gate(session, account)
    if not verify_password(payload.password, account.password_hash):
        _note_password_confirmation_failure(session, confirm_scope)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="登录密码不正确。")
    password_gate.clear(session, confirm_scope)

    setting = site_config.get_setting(session)
    settings: StoreSettings = request.app.state.settings
    cooldown = site_config.resolve_device_release_cooldown(setting, settings)
    moment = utcnow()
    authority = request.app.state.license_authority
    remaining = authority.release_remaining_seconds(session, license.id, moment)
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"解绑冷却中，请 {remaining} 秒后再试。",
            headers={"Retry-After": str(remaining)},
        )

    binding = session.scalars(
        select(DeviceBinding)
        .where(DeviceBinding.license_id == license.id)
        .order_by(*DeviceBinding.liveness_order())
    ).first()

    conflict = _release_snapshot_conflict(payload, binding)
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=conflict,
        )

    instance_id = binding.instance_id if binding is not None else None
    if binding is not None:
        binding.active = False
        binding.released_at = moment

    session.add(
        DeviceReleaseEvent(
            license_id=license.id,
            account_id=account.id,
            instance_id=instance_id,
            source="self_service",
        )
    )
    session.flush()
    return {
        "activationCodeId": license.id,
        "released": True,
        "deviceReleasePolicy": device_release_policy(
            cooldown_seconds=cooldown,
            last_released_at=moment,
            now=moment,
        ),
    }

router.include_router(store_orders.router)

@router.post("/coupons/preview")
def preview_coupon(
    payload: CouponPreviewRequest, session: DbSession, account: AuthedAccount
) -> dict:
    product = _product_or_404(session, payload.product_id)
    coupon, discount = _evaluate_coupon_limited(
        session, account=account, product=product, code=payload.coupon_code
    )
    original = int(product.price_cents or 0)
    return {
        "code": coupon.code,
        "description": coupon.description,
        "discountCents": discount,
        "originalAmountCents": original,
        "amountCents": max(0, original - discount),
    }

router.include_router(store_referrals.router)
