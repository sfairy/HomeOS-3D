"""商店 API：``/store/v1/*``。

字段命名与 ``pay.habridge.cn`` 实测响应保持一致（camelCase），
路由与状态机也按参考站前端实际调用的方式实现。
"""

from __future__ import annotations

import logging
import math
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select

from store import coupons, fulfill, mailer, password_gate, referrals, site_settings
from store.config import StoreSettings
from store.deps import AuthedAccount, CurrentAccount, DbSession, SettingsDep
from store.models import (
    Account,
    AccountSession,
    Coupon,
    CouponRedemption,
    Customer,
    DeviceBinding,
    DeviceReleaseEvent,
    EmailVerification,
    Entitlement,
    License,
    Order,
    Product,
    ProductImage,
    ReferralLedger,
    ReferralWallet,
    ReferralWithdrawal,
    Release,
    StoreSetting,
    utcnow,
)
from store.schemas import (
    CouponPreviewRequest,
    CreateOrderRequest,
    LabelRequest,
    LoginRequest,
    PasswordResetRequest,
    RegisterRequest,
    ReleaseDeviceRequest,
    VerificationRequest,
    WithdrawalRequest,
)
from store.security import (
    code_hash,
    hash_password,
    iso,
    iso_z,
    new_order_no,
    new_token,
    new_verification_code,
    token_hash,
    utcnow,
    verify_password,
)
from store.serializers import (
    account_center_payload,
    account_state_payload,
    order_payload,
    product_payload,
)
from store import site_settings as site_config
from store.payments.reconcile import reconcile_alipay_order

logger = logging.getLogger("store.api")

router = APIRouter(prefix="/store/v1", tags=["store"])

PENDING_ORDER_LIMIT = 20
HISTORY_PAGE_SIZE = 20


# --------------------------------------------------------------------------- #
# 公共工具
# --------------------------------------------------------------------------- #
def _smtp_setting(request: Request) -> StoreSettings:
    return request.app.state.settings


def _base_url(request: Request) -> str:
    return request.app.state.settings.public_base_url


def _require_verified(account: Account) -> None:
    if account.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="请先验证邮箱。"
        )


def _account_license_state(session, account: Account) -> tuple[bool, bool]:
    """返回 (是否有永久授权, 是否有期限授权)。"""
    rows = session.execute(
        select(License.validity_days, License.access_expires_at).where(
            License.account_id == account.id, License.active.is_(True)
        )
    ).all()
    moment = utcnow()
    permanent = False
    temporary = False
    for validity_days, access_expires_at in rows:
        expired = access_expires_at is not None and access_expires_at <= moment
        if expired:
            continue
        if validity_days is None and access_expires_at is None:
            permanent = True
        else:
            temporary = True
    return permanent, temporary


def _set_session_cookies(
    request: Request, response: Response, *, token: str, hint: str
) -> None:
    settings: StoreSettings = request.app.state.settings
    response.set_cookie(
        settings.cookie_name,
        token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )
    response.set_cookie(
        settings.hint_cookie_name,
        hint,
        max_age=settings.session_max_age_seconds,
        httponly=False,
        samesite="lax",
        secure=settings.cookie_secure,
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
            # 之后被提权/降权的账号，等下次登录才会更新到新值。
            is_admin_session=bool(account.is_admin),
            expires_at=moment + timedelta(seconds=settings.session_max_age_seconds),
            last_seen_at=moment,
            ip_address=request.client.host if request.client else None,
            user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        )
    )
    account.last_login_at = moment
    session.flush()
    return token


def _customer_for(session, account: Account) -> Customer:
    customer = session.scalars(
        select(Customer).where(Customer.account_id == account.id)
    ).first()
    if customer is None:
        customer = Customer(account_id=account.id, email=account.email, name=account.email)
        session.add(customer)
        session.flush()
    return customer


def _product_or_404(session, product_id: str) -> Product:
    product = session.get(Product, product_id)
    if product is None or not product.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在或已下架。")
    return product


def _product_stats(session) -> dict[str, dict]:
    purchase_counts = dict(
        session.execute(
            select(Order.product_id, func.count(Order.id))
            .where(Order.status == "fulfilled")
            .group_by(Order.product_id)
        ).all()
    )
    customer_counts = dict(
        session.execute(
            select(License.product_id, func.count(func.distinct(License.customer_id)))
            .where(License.active.is_(True))
            .group_by(License.product_id)
        ).all()
    )
    return {
        "purchase": purchase_counts,
        "customer": customer_counts,
    }


def _image_map(session) -> dict[str, ProductImage]:
    return {
        image.product_id: image
        for image in session.scalars(select(ProductImage))
    }


def _bundled_map(session) -> dict[str, Product]:
    return {product.id: product for product in session.scalars(select(Product))}


def _product_item(session, product: Product) -> dict:
    stats = _product_stats(session)
    return product_payload(
        product,
        _image_map(session).get(product.id),
        bundled=_bundled_map(session),
        customer_count=int(stats["customer"].get(product.id, 0)),
        purchase_count=int(stats["purchase"].get(product.id, 0)),
    )


def _expire_stale_orders(session, setting: StoreSetting) -> None:
    """把超时的待支付订单置为 expired，并释放占用的库存与优惠码。"""
    moment = utcnow()
    stale = session.scalars(
        select(Order).where(Order.status == "pending").where(Order.expires_at <= moment)
    ).all()
    for order in stale:
        order.status = "expired"
        order.cancelled_at = moment
        product = session.get(Product, order.product_id) if order.product_id else None
        fulfill.release_reserved_stock(session, product, 1)
        coupons.release_coupon(session, order)
    if stale:
        session.flush()


def _evaluate_coupon(
    session, *, account: Account, product: Product, code: str
) -> tuple[Coupon, int]:
    normalized = (code or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请输入优惠码。")
    coupon = session.scalars(
        select(Coupon).where(func.lower(Coupon.code) == normalized.lower())
    ).first()
    if coupon is None or not coupon.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="优惠码无效。")

    moment = utcnow()
    if coupon.starts_at is not None and coupon.starts_at > moment:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="优惠码尚未开始。")
    if coupon.expires_at is not None and coupon.expires_at <= moment:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="优惠码已过期。")
    if coupon.max_redemptions is not None and int(coupon.redeemed_count or 0) >= coupon.max_redemptions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="优惠码已被领完。")
    if coupon.per_account_limit:
        # 「这个账号用过没有」不能只看有没有核销记录：订单取消/超时/支付失败时
        # release_coupon 已经把名额还回去了（见 store/coupons.py 的 RELEASED_STATUSES），
        # 但核销记录会作为历史凭证永久保留。如果这里把所有记录都算成「已使用」，
        # per_account_limit=1 的用户只要有一单被取消，就永久失去这个优惠码 ——
        # 名额明明还在，却永远提示「你已使用过」。
        # 反过来说，refunded（已退款）不在 RELEASED_STATUSES 里：码确实被用掉了，不还名额。
        used = session.execute(
            select(func.count(CouponRedemption.id))
            .outerjoin(Order, Order.id == CouponRedemption.order_id)
            .where(CouponRedemption.coupon_id == coupon.id)
            .where(CouponRedemption.account_id == account.id)
            .where(
                or_(
                    CouponRedemption.order_id.is_(None),
                    Order.status.notin_(coupons.RELEASED_STATUSES),
                )
            )
        ).scalar_one()
        if int(used or 0) >= int(coupon.per_account_limit):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="你已使用过该优惠码。")

    from store.serializers import json_list

    applicable = [str(item) for item in json_list(coupon.applicable_product_ids_json)]
    if applicable and product.id not in applicable:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该优惠码不适用于此商品。")

    price = int(product.price_cents or 0)
    if coupon.min_amount_cents and price < int(coupon.min_amount_cents):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"订单金额未达到优惠码门槛（{int(coupon.min_amount_cents) / 100:.2f} 元）。",
        )

    if coupon.discount_type == "fixed":
        discount = min(int(coupon.amount_cents or 0), price)
    else:
        discount = int(math.floor(price * float(coupon.percent or 0.0) / 100.0))
        discount = min(discount, price)
    return coupon, max(0, discount)


def _unique_order_no(session, email: str, moment) -> str:
    """参考站格式 ``HB-20260906224517-156120718``；同一秒内重复下单时补序号。"""
    base = new_order_no(email, now=moment)
    candidate = base
    counter = 1
    while session.scalars(select(Order.id).where(Order.order_no == candidate)).first() is not None:
        counter += 1
        candidate = f"{base}-{counter}"
    return candidate


def _license_meta(session, licenses: list[License]) -> dict[str, dict]:
    meta: dict[str, dict] = {}
    if not licenses:
        return meta
    license_ids = [item.id for item in licenses]
    customer_ids = {item.customer_id for item in licenses if item.customer_id}
    customers = {
        customer.id: customer
        for customer in session.scalars(select(Customer).where(Customer.id.in_(customer_ids)))
    }
    bindings = {
        binding.license_id: binding
        for binding in session.scalars(
            select(DeviceBinding).where(DeviceBinding.license_id.in_(license_ids))
        )
    }
    releases: dict[str, object] = {}
    for license_id, created_at in session.execute(
        select(DeviceReleaseEvent.license_id, func.max(DeviceReleaseEvent.created_at))
        .where(DeviceReleaseEvent.license_id.in_(license_ids))
        .group_by(DeviceReleaseEvent.license_id)
    ).all():
        releases[license_id] = created_at

    for license in licenses:
        meta[license.id] = {
            "customer": customers.get(license.customer_id),
            "binding": bindings.get(license.id),
            "last_released_at": releases.get(license.id),
        }
    return meta


def _account_licenses(session, account: Account) -> list[License]:
    return list(
        session.scalars(
            select(License)
            .where(License.account_id == account.id)
            .order_by(License.created_at.desc())
        )
    )


def _account_orders(session, account: Account, *, limit: int = 50) -> list[Order]:
    return list(
        session.scalars(
            select(Order)
            .where(Order.account_id == account.id)
            .order_by(Order.created_at.desc())
            .limit(limit)
        )
    )


def _center_payload(session, request: Request, account: Account) -> dict:
    setting = site_config.get_setting(session)
    _expire_stale_orders(session, setting)
    licenses = _account_licenses(session, account)
    entitlements = list(
        session.scalars(
            select(Entitlement)
            .where(Entitlement.customer_id.in_([item.customer_id for item in licenses] or [""]))
            .order_by(Entitlement.created_at.desc())
        )
    )
    return account_center_payload(
        account=account,
        setting=setting,
        settings=request.app.state.settings,
        licenses=licenses,
        license_meta=_license_meta(session, licenses),
        entitlements=entitlements,
        orders=_account_orders(session, account),
    )


# --------------------------------------------------------------------------- #
# 站点配置与商品
# --------------------------------------------------------------------------- #
@router.get("/configuration")
def configuration(session: DbSession, settings: SettingsDep) -> dict:
    setting = site_config.get_setting(session)
    return site_config.site_configuration_payload(setting, settings)


@router.get("/products")
def list_products(session: DbSession) -> dict:
    stats = _product_stats(session)
    images = _image_map(session)
    bundled = _bundled_map(session)
    products = session.scalars(
        select(Product).where(Product.active.is_(True)).order_by(Product.sort_order, Product.created_at)
    )
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


# --------------------------------------------------------------------------- #
# 账号
# --------------------------------------------------------------------------- #
@router.post("/verifications")
def send_verification(
    payload: VerificationRequest, request: Request, session: DbSession
) -> dict:
    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="请输入有效的邮箱地址。")

    settings: StoreSettings = request.app.state.settings
    setting = site_config.get_setting(session)
    purpose = payload.purpose

    existing_account = session.scalars(
        select(Account).where(func.lower(Account.email) == email)
    ).first()
    if purpose == "register" and existing_account is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该邮箱已注册，请直接登录。")
    if purpose == "reset" and existing_account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="该邮箱尚未注册。")

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

    code = new_verification_code()
    session.add(
        EmailVerification(
            email=email,
            purpose=purpose,
            code_hash=code_hash(code),
            expires_at=utcnow() + timedelta(seconds=settings.verification_ttl_seconds),
        )
    )
    session.flush()

    result = mailer.send_verification_email(
        settings, setting, email=email, code=code, purpose=purpose
    )
    body = {
        "email": email,
        "purpose": purpose,
        "expiresInSeconds": settings.verification_ttl_seconds,
        #: 前端用 resendAfter 驱动「重新发送」倒计时；缺省会让按钮白白多锁 120 秒
        "resendAfter": settings.verification_cooldown_seconds,
        "delivered": result.delivered,
        "deliveryMode": settings.mail_mode,
    }
    if result.exposed_code is not None:
        body["code"] = result.exposed_code
        if settings.mail_mode == "echo":
            body["devNotice"] = "mail_mode=echo，验证码直接在响应中回显，仅供本地联调。"
        else:
            # smtp 误配置/发信失败后回退，或显式打开了 STORE_EXPOSE_VERIFICATION_CODE
            body["devNotice"] = (
                "验证码在响应中回显（mail_mode="
                f"{settings.mail_mode}，由 STORE_EXPOSE_VERIFICATION_CODE 决定）；仅供本地联调，生产请关闭。"
            )
    return body


def _consume_verification(session, *, email: str, purpose: str, code: str) -> None:
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
    if int(record.attempts or 0) >= 8:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="尝试次数过多，请重新获取验证码。")
    if record.code_hash != code_hash(code.strip()):
        record.attempts = int(record.attempts or 0) + 1
        session.flush()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码不正确。")
    record.consumed_at = utcnow()
    session.flush()


@router.post("/auth/register")
def register(payload: RegisterRequest, request: Request, session: DbSession) -> Response:
    email = payload.email.strip().lower()
    if payload.confirm_password and payload.confirm_password != payload.password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="两次输入的密码不一致。")

    existing = session.scalars(select(Account).where(func.lower(Account.email) == email)).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该邮箱已注册，请直接登录。")

    _consume_verification(session, email=email, purpose="register", code=payload.code)

    account = Account(
        email=email,
        password_hash=hash_password(payload.password),
        email_verified_at=utcnow(),
    )
    session.add(account)
    session.flush()
    _customer_for(session, account)

    referral_code = (payload.referral_code or "").strip()
    if referral_code and referral_code.isdigit():
        referrer_wallet = session.scalars(
            select(ReferralWallet).where(ReferralWallet.code == referral_code)
        ).first()
        if referrer_wallet is not None and referrer_wallet.account_id != account.id:
            account.referred_by_account_id = referrer_wallet.account_id
            account.referral_bound_at = utcnow()
            session.flush()

    token = _create_session(session, request, account)
    state = _account_license_state(session, account)
    response = JSONResponse(
        account_state_payload(
            account, has_permanent=state[0], has_temporary=state[1]
        )
    )
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
    scope = f"login:{email}"
    remaining = password_gate.retry_after_seconds(session, scope)
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"尝试过于频繁，请 {remaining} 秒后再试。",
            headers={"Retry-After": str(remaining)},
        )

    account = session.scalars(select(Account).where(func.lower(Account.email) == email)).first()
    if account is None or not account.is_active or not verify_password(payload.password, account.password_hash):
        password_gate.record_attempt(session, scope, succeeded=False)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码不正确。")

    password_gate.clear(session, scope)
    password_gate.record_attempt(session, scope, succeeded=True)

    token = _create_session(session, request, account)
    permanent, temporary = _account_license_state(session, account)
    response = JSONResponse(
        account_state_payload(account, has_permanent=permanent, has_temporary=temporary)
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
        account_state_payload(account, has_permanent=permanent, has_temporary=temporary)
    )
    return response


@router.post("/auth/password/reset")
def reset_password(payload: PasswordResetRequest, request: Request, session: DbSession) -> dict:
    email = payload.email.strip().lower()
    if payload.confirm_password and payload.confirm_password != payload.password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="两次输入的密码不一致。")
    account = session.scalars(select(Account).where(func.lower(Account.email) == email)).first()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="该邮箱尚未注册。")

    _consume_verification(session, email=email, purpose="reset", code=payload.code)
    account.password_hash = hash_password(payload.password)
    # 重置密码后强制所有会话下线
    for record in session.scalars(
        select(AccountSession).where(AccountSession.account_id == account.id)
    ):
        session.delete(record)
    session.flush()
    return {"email": email, "reset": True}


# --------------------------------------------------------------------------- #
# 账号中心
# --------------------------------------------------------------------------- #
@router.get("/account")
def account_center(request: Request, session: DbSession, account: AuthedAccount) -> Response:
    response = JSONResponse(_center_payload(session, request, account))
    response.headers["Cache-Control"] = "no-store"
    return response


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
    if not verify_password(payload.password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="登录密码不正确。")

    setting = site_config.get_setting(session)
    settings: StoreSettings = request.app.state.settings
    cooldown = int(
        setting.device_release_cooldown_seconds
        if setting.device_release_cooldown_seconds is not None
        else settings.device_release_cooldown_seconds
    )
    moment = utcnow()
    last_release = session.execute(
        select(func.max(DeviceReleaseEvent.created_at)).where(
            DeviceReleaseEvent.license_id == license.id
        )
    ).scalar_one_or_none()
    if last_release is not None:
        remaining = int(max(0, ((last_release + timedelta(seconds=cooldown)) - moment).total_seconds()))
        if remaining > 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"解绑冷却中，请 {remaining} 秒后再试。",
                headers={"Retry-After": str(remaining)},
            )

    binding = session.scalars(
        select(DeviceBinding).where(DeviceBinding.license_id == license.id)
    ).first()
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
    account.last_device_release_at = moment
    session.flush()
    return {
        "activationCodeId": license.id,
        "released": True,
        "deviceReleasePolicy": {
            "cooldownSeconds": cooldown,
            "lastReleasedAt": iso_z(moment),
            "nextAllowedAt": iso_z(moment + timedelta(seconds=cooldown)),
            "remainingSeconds": cooldown,
        },
    }


# --------------------------------------------------------------------------- #
# 订单
# --------------------------------------------------------------------------- #
@router.get("/orders")
def list_orders(session: DbSession, account: AuthedAccount) -> dict:
    _require_verified(account)
    _expire_stale_orders(session, site_config.get_setting(session))
    orders = _account_orders(session, account)
    return {"items": [order_payload(order) for order in orders]}


@router.post("/orders")
def create_order(
    payload: CreateOrderRequest, request: Request, session: DbSession, account: AuthedAccount
) -> Response:
    _require_verified(account)
    setting = site_config.get_setting(session)
    if setting.maintenance_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=setting.maintenance_message or "商城正在维护，请稍后再试。",
        )

    _expire_stale_orders(session, setting)

    pending = session.scalars(
        select(Order)
        .where(Order.account_id == account.id)
        .where(Order.status == "pending")
        .order_by(Order.created_at.desc())
    ).first()
    if pending is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"你有一笔待支付订单（{pending.order_no}），请先完成或等待其超时关闭。",
        )

    product = _product_or_404(session, payload.product_id)
    image = _image_map(session).get(product.id)
    stats = _product_stats(session)
    product_view = product_payload(
        product,
        image,
        bundled=_bundled_map(session),
        customer_count=int(stats["customer"].get(product.id, 0)),
        purchase_count=int(stats["purchase"].get(product.id, 0)),
    )
    if product_view["soldOut"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该商品已售罄。")

    # 判定订单类型：module / template 之类的功能增量包属于 addon
    is_addon = product.product_type in {"module", "template"} or bool(product.requires_license)
    target_license: License | None = None
    if is_addon:
        target_license_id = (payload.target_license_id or "").strip()
        if not target_license_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="请选择增量包要附加到的主授权。",
            )
        target_license = session.get(License, target_license_id)
        if target_license is None or target_license.account_id != account.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="选择的授权不存在。")
        if not target_license.active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="选择的授权已停用。")
        if target_license.access_expires_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="增量包只能添加到永不过期的主授权上。",
            )

    coupon = None
    discount = 0
    coupon_code = (payload.coupon_code or "").strip()
    if coupon_code and product.fulfillment_mode != "manual":
        coupon, discount = _evaluate_coupon(
            session, account=account, product=product, code=coupon_code
        )

    original_amount = int(product.price_cents or 0)
    amount = max(0, original_amount - discount)
    moment = utcnow()
    order = Order(
        order_no=_unique_order_no(session, account.email, moment),
        lookup_token=new_token(24),
        account_id=account.id,
        customer_id=_customer_for(session, account).id,
        email=account.email,
        product_id=product.id,
        product_name=product.name,
        product_type=product.product_type,
        order_type="addon" if is_addon else ("package" if product.product_type == "package" else "base"),
        license_action="patch" if is_addon else "issue",
        target_license_id=target_license.id if target_license is not None else None,
        original_amount_cents=original_amount,
        discount_cents=discount,
        amount_cents=amount,
        coupon_code=coupon.code if coupon is not None else None,
        status="pending",
        fulfillment_mode=product.fulfillment_mode,
        payment_provider=(setting.payment_provider or request.app.state.settings.payment_provider),
        expires_at=moment + timedelta(seconds=request.app.state.settings.order_ttl_seconds),
    )
    session.add(order)
    session.flush()

    if coupon is not None:
        coupons.redeem_coupon(session, order, coupon, account, discount)
    fulfill.reserve_stock(session, product, 1)

    import json as _json

    # 优惠后应付 0 元：支付宝不接受 0 元交易，直接按免费订单开通
    if amount <= 0:
        order.status = "paid"
        order.paid_at = utcnow()
        order.payment_trade_no = f"FREE{order.order_no[-10:]}"
        order.payment_payload_json = _json.dumps(
            {
                "type": "free",
                "displayName": "0 元订单",
                "note": "优惠后应付 0 元，无需支付，已直接开通。",
            },
            ensure_ascii=False,
        )
        session.flush()
        if order.fulfillment_mode != "manual":
            fulfill.fulfill_order(session, order=order, setting=setting)
        session.refresh(order)
        logger.info("0 元订单直接开通 order=%s", order.order_no)
        return JSONResponse(order_payload(order), status_code=status.HTTP_201_CREATED)

    provider = request.app.state.resolve_payment_provider(setting)
    from store.payments.base import PaymentError

    try:
        intent = provider.create_payment(
            order=order,
            settings=request.app.state.settings,
            setting=setting,
            base_url=_base_url(request),
        )
    except PaymentError as error:
        order.status = "payment_failed"
        fulfill.release_reserved_stock(session, product, 1)
        coupons.release_coupon(session, order)
        session.flush()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error))

    order.payment_payload_json = _json.dumps(intent.payload, ensure_ascii=False)
    session.flush()

    return JSONResponse(order_payload(order), status_code=status.HTTP_201_CREATED)


def _reconcile_payment(session, request: Request, order: Order) -> None:
    """待支付订单在被轮询时顺带查一次单（目前只对支付宝有意义）。

    节流在 ``reconcile_alipay_order`` 内部做，这里只负责判断渠道。
    """
    if order.status != "pending":
        return
    setting = site_config.get_setting(session)
    provider = request.app.state.resolve_payment_provider(setting)
    if getattr(provider, "name", "") != "alipay":
        return
    try:
        reconcile_alipay_order(
            session,
            order=order,
            settings=request.app.state.settings,
            setting=setting,
        )
    except Exception:  # noqa: BLE001 - 对账出问题绝不能把轮询接口打成 500
        logger.exception("订单查单对账失败 order=%s", order.order_no)


@router.get("/orders/lookup/{order_no}")
def lookup_order(
    order_no: str, session: DbSession, token: str | None = None
) -> dict:
    order = session.scalars(select(Order).where(Order.order_no == order_no)).first()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")
    if not token or token != order.lookup_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="查询凭证不正确。")
    return order_payload(order)


@router.get("/orders/{order_no}")
def get_order(
    order_no: str, request: Request, session: DbSession, account: CurrentAccount
) -> Response:
    order = session.scalars(select(Order).where(Order.order_no == order_no)).first()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")

    order_token = request.headers.get("x-order-token")
    authorized = (
        (account is not None and order.account_id == account.id)
        or (bool(order_token) and order_token == order.lookup_token)
    )
    if not authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该订单。")

    _expire_stale_orders(session, site_config.get_setting(session))
    session.refresh(order)
    # 前端每 3 秒轮询一次；顺带向支付宝查单对账，兜住「异步通知没收到」的情况
    _reconcile_payment(session, request, order)
    response = JSONResponse(order_payload(order))
    response.headers["Cache-Control"] = "no-store"
    return response


@router.post("/orders/{order_no}/archive")
def archive_order(order_no: str, session: DbSession, account: AuthedAccount) -> dict:
    order = session.scalars(select(Order).where(Order.order_no == order_no)).first()
    if order is None or order.account_id != account.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")
    order.archived_at = utcnow()
    session.flush()
    return order_payload(order)


# --------------------------------------------------------------------------- #
# 优惠码
# --------------------------------------------------------------------------- #
@router.post("/coupons/preview")
def preview_coupon(
    payload: CouponPreviewRequest, session: DbSession, account: AuthedAccount
) -> dict:
    product = _product_or_404(session, payload.product_id)
    coupon, discount = _evaluate_coupon(
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


# --------------------------------------------------------------------------- #
# 邀请有礼
# --------------------------------------------------------------------------- #
def _wallet_payload(wallet: ReferralWallet | None) -> dict | None:
    if wallet is None:
        return None
    return {
        "code": wallet.code,
        "balance": f"{float(wallet.balance or 0.0):.2f}",
        "frozen": f"{float(wallet.frozen or 0.0):.2f}",
        "earned": f"{float(wallet.earned or 0.0):.2f}",
        "withdrawn": f"{float(wallet.withdrawn or 0.0):.2f}",
    }


@router.get("/referrals")
def referral_overview(session: DbSession, account: AuthedAccount) -> dict:
    setting = site_config.get_setting(session)
    wallet = session.scalars(
        select(ReferralWallet).where(ReferralWallet.account_id == account.id)
    ).first()
    invited = session.execute(
        select(func.count(Account.id)).where(Account.referred_by_account_id == account.id)
    ).scalar_one()
    return {
        "wallet": _wallet_payload(wallet),
        "invitedCount": int(invited or 0),
        "settings": site_config.referral_settings_payload(setting),
    }


@router.post("/referrals/code")
def create_referral_code(session: DbSession, account: AuthedAccount) -> dict:
    setting = site_config.get_setting(session)
    if not setting.referral_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邀请活动暂时关闭。")
    wallet = referrals.get_or_create_wallet(session, account)
    return {"wallet": _wallet_payload(wallet)}


@router.get("/referrals/history")
def referral_history(
    session: DbSession,
    account: AuthedAccount,
    kind: str = "ledger",
    page: int = 1,
) -> dict:
    page = max(1, int(page or 1))
    wallet = session.scalars(
        select(ReferralWallet).where(ReferralWallet.account_id == account.id)
    ).first()
    if wallet is None:
        return {"items": [], "total": 0, "page": page}

    if kind == "withdrawals":
        total = int(
            session.execute(
                select(func.count(ReferralWithdrawal.id)).where(
                    ReferralWithdrawal.wallet_id == wallet.id
                )
            ).scalar_one()
            or 0
        )
        rows = session.scalars(
            select(ReferralWithdrawal)
            .where(ReferralWithdrawal.wallet_id == wallet.id)
            .order_by(ReferralWithdrawal.created_at.desc())
            .offset((page - 1) * HISTORY_PAGE_SIZE)
            .limit(HISTORY_PAGE_SIZE)
        )
        items = [
            {
                "id": row.id,
                "points": f"{float(row.points or 0.0):.2f}",
                "feePoints": f"{float(row.fee_points or 0.0):.2f}",
                "feePercent": f"{float(row.fee_percent or 0.0):.2f}".rstrip("0").rstrip("."),
                "netPoints": f"{float(row.net_points or 0.0):.2f}",
                "status": row.status,
                "note": row.note,
                "qq": row.qq,
                "createdAt": iso(row.created_at),
                "resolvedAt": iso(row.resolved_at),
            }
            for row in rows
        ]
        return {"items": items, "total": total, "page": page}

    total = int(
        session.execute(
            select(func.count(ReferralLedger.id)).where(ReferralLedger.wallet_id == wallet.id)
        ).scalar_one()
        or 0
    )
    rows = session.scalars(
        select(ReferralLedger)
        .where(ReferralLedger.wallet_id == wallet.id)
        .order_by(ReferralLedger.created_at.desc())
        .offset((page - 1) * HISTORY_PAGE_SIZE)
        .limit(HISTORY_PAGE_SIZE)
    )
    items = [
        {
            "id": row.id,
            "kind": row.kind,
            "delta": f"{float(row.delta or 0.0):.2f}",
            "frozenDelta": f"{float(row.frozen_delta or 0.0):.2f}",
            "balanceAfter": f"{float(row.balance_after or 0.0):.2f}",
            "frozenAfter": f"{float(row.frozen_after or 0.0):.2f}",
            "note": row.note,
            "reference": row.reference,
            "createdAt": iso(row.created_at),
        }
        for row in rows
    ]
    return {"items": items, "total": total, "page": page}


def _withdrawal_payload(withdrawal: ReferralWithdrawal) -> dict:
    return {
        "id": withdrawal.id,
        "points": f"{float(withdrawal.points or 0.0):.2f}",
        "feePoints": f"{float(withdrawal.fee_points or 0.0):.2f}",
        "feePercent": f"{float(withdrawal.fee_percent or 0.0):.2f}".rstrip("0").rstrip("."),
        "netPoints": f"{float(withdrawal.net_points or 0.0):.2f}",
        "status": withdrawal.status,
        "createdAt": iso(withdrawal.created_at),
    }


@router.post("/referrals/withdrawals")
def request_withdrawal(
    payload: WithdrawalRequest, session: DbSession, account: AuthedAccount
) -> dict:
    setting = site_config.get_setting(session)
    if not setting.referral_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邀请活动暂时关闭。")

    wallet = session.scalars(
        select(ReferralWallet).where(ReferralWallet.account_id == account.id)
    ).first()
    if wallet is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="请先生成邀请码。")

    # requestKey 是幂等键：重复提交必须原样返回上一次结果，
    # 而不是被"存在处理中提现"这类状态校验挡住。
    existing = session.scalars(
        select(ReferralWithdrawal).where(ReferralWithdrawal.request_key == payload.request_key)
    ).first()
    if existing is not None:
        if existing.wallet_id != wallet.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该请求号已被占用，请重试。")
        return _withdrawal_payload(existing)

    minimum = float(setting.referral_withdrawal_min_points or 100.0)
    points = float(payload.points)
    if points < minimum:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"最低提现 {minimum:.2f} 积分。",
        )
    if points > float(wallet.balance or 0.0):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="可用积分不足。")
    if float(wallet.frozen or 0.0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="你有正在处理中的提现申请，请等待处理完成。"
        )
    if not payload.qq.strip().isdigit():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="请填写有效的联系 QQ。")

    fee_percent = float(setting.referral_withdrawal_fee_percent or 0.0)
    withdrawal = referrals.create_withdrawal(
        session,
        wallet,
        points=points,
        qq=payload.qq.strip(),
        request_key=payload.request_key,
        fee_percent=fee_percent,
    )
    return _withdrawal_payload(withdrawal)
