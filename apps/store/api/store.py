"""商店 API：``/store/v1/*``。
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select

from apps.store.ops import mail_settings, mailer
from apps.store.security import password_gate
from apps.store.config import StoreSettings
from apps.store.core.deps import AuthedAccount, CurrentAccount, DbSession, SettingsDep
from apps.store.core.models import (
    Account,
    AccountSession,
    Customer,
    DeviceBinding,
    DeviceReleaseEvent,
    EmailVerification,
    License,
    Product,
    Release,
)
from apps.store.core.schemas import (
    ChangeEmailRequest,
    CouponPreviewRequest,
    LabelRequest,
    ReleaseDeviceRequest,
    VerificationRequest,
    VerifyEmailRequest,
)
from apps.store.security.security import (
    code_hash,
    new_code_salt,
    is_valid_email,
    new_verification_code,
    token_hash,
    utcnow,
    verify_password,
)
from apps.store.core.serializers import (
    device_release_policy,
    product_payload,
)
from apps.store.ops import site_settings as site_config


from .store_shared import (
    MAX_VERIFICATION_SENDS_PER_HOUR,
    _assert_purpose_allowed,
    _client_host,
    _consume_verification,
    _enforce_password_confirmation_gate,
    _enforce_verification_send_quota,
    _is_loopback_client,
    _note_password_confirmation_failure,
    logger,
)
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
from . import store_auth
from . import store_orders
from . import store_referrals

router = APIRouter(prefix="/store/v1", tags=["store"])


























































# 站点配置与商品
@router.get("/configuration")
def configuration(session: DbSession, settings: SettingsDep) -> dict:
    setting = site_config.get_setting(session)
    # 这是**匿名可读**的接口：不带商户凭据概览（appId / 网关 / 密钥配置状态）。
    return site_config.site_configuration_payload(
        setting, settings, include_credentials=False
    )


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
    release = session.scalars(
        select(Release)
        .where(Release.product == "homeos")
        .where(Release.channel == channel)
        .order_by(Release.created_at.desc())
        .limit(1)
    ).first()
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

    # ---- 按来源 IP 与全站的发信配额 ---- #
    _enforce_verification_send_quota(request, settings, email=email)

    _assert_purpose_allowed(session, purpose=purpose, email=email, account=account)

    cooldown_scope = f"verify:{email}"
    remaining = password_gate.retry_after_seconds(session, cooldown_scope)
    # 复用登录限流表做冷却：超过阈值即为冷却中
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

    # 单邮箱发信上限：cooldown 只管「两次之间要隔多久」，一个脚本持续按冷却
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
    session.flush()
    password_gate.clear(session, f"verify:{email}")

    result = mailer.send_verification_email(
        settings, setting, email=email, code=code, purpose=purpose
    )

    # 投递结果必须落库：只回给前端就丢了，事后无法回答「用户说没收到，那封信到底发出去没有」——只能翻日志，而日志会轮转。
    record.delivery_mode = result.mode
    record.delivery_attempts = result.attempts
    record.delivery_error = result.error
    record.delivered = result.delivered if result.mode == "smtp" else None
    record.delivered_at = utcnow()
    session.flush()

    body = {
        "email": email,
        "purpose": purpose,
        "expiresInSeconds": settings.verification_ttl_seconds,
        #: 前端用 resendAfter 驱动「重新发送」倒计时；缺省会让按钮白白多锁 120 秒
        "resendAfter": settings.verification_cooldown_seconds,
        "delivered": result.delivered,
        "deliveryMode": result.mode,
        "deliveryAttempts": result.attempts,
    }
    if result.error:
        # 发信失败要如实告诉用户「可能收不到」，而不是让他对着收件箱干等
        body["deliveryError"] = "验证码邮件发送失败，请稍后重试或联系客服。"
    #: 任何把验证码写进 HTTP 响应的路径都只认**本机**客户端：判定必须覆盖所有 mail_mode，
    echo_allowed = _is_loopback_client(request)
    if result.exposed_code is not None and not echo_allowed:
        logger.warning(
            "本次验证码本可在响应中回显（mail_mode=%s，expose_verification_code=%s），"
            "但请求来自 %s（非本机），已按 log 处理：验证码只写服务端日志、不回显。",
            settings.mail_mode,
            settings.expose_verification_code,
            _client_host(request) or "未知地址",
        )
    if result.exposed_code is not None and echo_allowed:
        body["code"] = result.exposed_code
        if settings.mail_mode == "echo":
            body["devNotice"] = "mail_mode=echo，验证码直接在响应中回显，仅供本地联调。"
        else:
            body["devNotice"] = (
                "验证码在响应中回显（mail_mode="
                f"{settings.mail_mode}，由 STORE_EXPOSE_VERIFICATION_CODE 决定）；"
                "仅本机访问才会回显，生产请关闭该开关。"
            )
    elif result.exposed_code is not None:
        body["devNotice"] = (
            "验证码未在响应中回显：只有本机访问才允许回显。"
            "验证码已写入服务端日志，请查阅日志获取。"
        )
    elif settings.mail_mode == "echo":
        body["devNotice"] = (
            "mail_mode=echo 仅在本机访问时回显验证码；本次请求来自其它地址，"
            "验证码已写入服务端日志。请把投递方式改为 smtp。"
        )
    return body










# auth 资源组第 1 段（include 放在原位置以保持顺序）。
router.include_router(store_auth.router)


# 账号中心
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

    # 占用校验必须在**消费验证码之后**（不能随意挪动）：放前面就成了「该邮箱有没有账号」的探针，
    _consume_verification(session, email=email, purpose="change_email", code=payload.code)

    taken = session.scalars(
        select(Account).where(func.lower(Account.email) == email)
    ).first()
    if taken is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="该邮箱已被其它账号使用。"
        )

    previous = account.email
    account.email = email
    account.email_verified_at = utcnow()

    customer = session.scalars(
        select(Customer).where(Customer.account_id == account.id)
    ).first()
    if customer is not None:
        customer.email = email

    # 登录标识变了：把其它设备上的会话全部踢下线，只保留当前这一个。
    settings: StoreSettings = request.app.state.settings
    current = token_hash(request.cookies.get(settings.cookie_name) or "")
    for record in session.scalars(
        select(AccountSession).where(AccountSession.account_id == account.id)
    ):
        if record.id_hash != current:
            session.delete(record)

    session.commit()
    logger.info("账号邮箱变更 account=%s %s -> %s", account.id, previous, email)
    return {"email": email, "previousEmail": previous, "verified": True}


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
    # 冷却是「两次解绑之间」的间隔：解绑后**可以立刻激活**（任意设备），但同一张授权
    authority = request.app.state.license_authority
    remaining = authority.release_remaining_seconds(session, license.id, moment)
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"解绑冷却中，请 {remaining} 秒后再试。",
            headers={"Retry-After": str(remaining)},
        )

    # 与 ``licensing.ensure_binding`` 同一口径：同一张授权可能留下多行绑定（解绑只是
    binding = session.scalars(
        select(DeviceBinding)
        .where(DeviceBinding.license_id == license.id)
        .order_by(*DeviceBinding.liveness_order())
    ).first()

    # 乐观锁：前端在弹窗里看到的绑定快照必须仍然有效。用户输密码的这段时间里
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
        # 复用账号中心那一份构造：同一个字段在两处各拼一次，迟早有一处漏改
        "deviceReleasePolicy": device_release_policy(
            cooldown_seconds=cooldown,
            last_released_at=moment,
            now=moment,
        ),
    }






# orders 资源组第 1 段（include 放在原位置以保持顺序）。
router.include_router(store_orders.router)


# 优惠码
@router.post("/coupons/preview")
def preview_coupon(
    payload: CouponPreviewRequest, session: DbSession, account: AuthedAccount
) -> dict:
    product = _product_or_404(session, payload.product_id)
    # 与下单走同一条路径（含限流）：预览返回精确折扣额，是一个天然的判定 oracle，
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




# referrals 资源组第 1 段（include 放在原位置以保持顺序）。
router.include_router(store_referrals.router)
