"""商店 API：``/store/v1/*``。
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from .. import telemetry
from ..admin.shared import _drop_account_sessions
from . import auth as store_auth
from . import orders as store_orders
from . import referrals as store_referrals
from .catalog import (
    _center_payload,
    _evaluate_coupon_limited,
    _product_item,
    _product_or_404,
    _release_snapshot_conflict,
)
from .products_cache import etag_matches, get_products_payload
from .shared import (
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
from ...commerce import delivery
from ...config import StoreSettings
from ...core.persistence.database import Database
from ...core.deps import AuthedAccount, CurrentAccount, DbSession, SettingsDep
from ...core.models import (
    Account,
    Customer,
    DeviceBinding,
    DeviceReleaseEvent,
    EmailVerification,
    License,
    Order,
    Product,
)
from ...core.schemas import (
    ChangeEmailRequest,
    CouponPreviewRequest,
    LabelRequest,
    ReleaseDeviceRequest,
    VerificationRequest,
    VerifyCodeRequest,
    VerifyEmailRequest,
)
from ...core.serializers import device_release_policy
from ...ops import features, incidents, mail_settings, mailer
from ...ops import site_settings as site_config
from ...security import password_gate
from ...security.limiter import SlidingWindowLimiter
from ...security.request_security import request_origin
from ...security.security import (
    code_hash,
    is_valid_email,
    new_code_salt,
    new_verification_code,
    token_hash,
    utcnow,
    verify_password,
)

router = APIRouter(prefix="/store/v1", tags=["store"])

@router.get("/base-url")
def store_base_url(request: Request, settings: SettingsDep) -> JSONResponse:
    """本商店的对外访问地址（``{"baseUrl": "...", "declared": bool}``）。

    给**机器对机器**用：客户机 / 同机的主应用拿它当登录页商店链接的兜底 —— 那边只知道
    容器能连到的商店地址，而链接要给浏览器用（详细理由见
    ``security.request_security.request_origin``）。

    取值口径两条，按序：
    1. 显式配置的 ``STORE_BASE_URL``（权威，公网接入时就是它）—— 此时 ``declared=true``；
    2. 回显本次请求的 scheme + ``Host``，即「调用方是怎么连上我的」—— ``declared=false``。

    ``declared`` 是给调用方的判据：回显值在**同机部署**里就是容器服务名（浏览器解析不了），
    调用方要自己换成浏览器视角的地址；显式值则原样采信，不必推测。
    """
    declared = bool(str(getattr(settings, "base_url", "") or "").strip())
    response = JSONResponse({"baseUrl": request_origin(request), "declared": declared})
    response.headers["Cache-Control"] = "no-store"
    return response


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


@router.get("/features")
def list_features() -> JSONResponse:
    """公开的功能码目录（商品卡片与首页营销面用）。

    只暴露 ``code / label / group / groupLabel / description``：这些本来就是给顾客看的
    中文文案。**不含** ``base`` / ``impliedBy`` 之类的授权判定字段 —— 判定只在客户端与服务端
    的授权链里做，放到公开页面上只会让「哪个码是基础能力」变成两份口径。
    """
    payload = features.feature_catalog_payload()
    response = JSONResponse(payload)
    # 功能目录随仓库的 feature_codes.json 走，只在发版时变化；5 分钟缓存足以吃掉首页的重复拉取。
    response.headers["Cache-Control"] = "public, max-age=300"
    return response


@router.get("/products")
def list_products(
    request: Request, session: DbSession, settings: SettingsDep
) -> Response:
    """在售商品目录（公开）。

    响应体进入 5s 进程内缓存（STORE_PRODUCTS_CACHE_TTL_SECONDS，0 关闭），并带强 ETag：
    首页重复打开、多标签页与反向代理都能用 If-None-Match 换 304，避免重复跑 4 条聚合查询。
    Cache-Control 用 no-cache（而不是 no-store）：允许浏览器存副本，但每次必须回源校验。
    """
    entry = get_products_payload(session, settings.products_cache_ttl_seconds)
    headers = {"ETag": entry.etag, "Cache-Control": "public, no-cache"}
    if etag_matches(request.headers.get("if-none-match"), entry.etag):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    return Response(
        content=entry.body, media_type="application/json", headers=headers
    )

@router.get("/item/{product_id}")
def product_detail(product_id: str, session: DbSession) -> dict:
    product = session.get(Product, product_id)
    if product is None or not product.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在或已下架。")
    return _product_item(session, product)

def _record_verification_delivery(
    database: Database, *, record_id: str, email: str, result: mailer.MailResult
) -> None:
    """把一次投递结果写回验证码记录；独立短会话，失败只留 incident，不影响请求。"""
    try:
        with database.session() as session:
            record = session.get(EmailVerification, record_id)
            if record is None:
                return
            record.delivery_mode = result.mode
            record.delivery_attempts = result.attempts
            record.delivery_error = result.error
            record.delivered = result.delivered if result.mode == "smtp" else None
            record.delivered_at = utcnow()
            session.commit()
    except Exception as error:
        incidents.note("verification.delivery_record", error=f"email={email} {error}")
        logger.exception("验证码投递结果落库失败，验证码本身仍然有效 email=%s", email)


def _send_verification_email_background(
    database: Database,
    settings: StoreSettings,
    *,
    record_id: str,
    email: str,
    code: str,
    purpose: str,
) -> None:
    """响应发出之后才真正投递验证码邮件：SMTP 最坏 20s 不再卡住注册/重发请求。

    验证码在排这个任务之前已经提交，所以发信再慢也不会影响验码；投递结果仍然写回
    EmailVerification（后台审计与用户重试都看得到）。
    """
    try:
        with database.session() as session:
            setting = site_config.get_setting(session)
            merged = mail_settings.merge_mail_settings(settings, setting)
            result = mailer.send_verification_email(
                merged, setting, email=email, code=code, purpose=purpose
            )
    except Exception as error:
        incidents.note("verification.delivery", error=f"email={email} {error}")
        logger.exception("验证码邮件后台发送失败 email=%s", email)
        return
    _record_verification_delivery(
        database, record_id=record_id, email=email, result=result
    )


@router.post("/verifications")
def send_verification(
    payload: VerificationRequest,
    request: Request,
    background: BackgroundTasks,
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

    if settings.smtp_ready:
        # SMTP 投递最坏 20s（含重试等待）：排到响应之后执行，注册/重发请求不再等邮件。
        # 这里的 delivered=True 表示「已受理投递」；真正的投递结果由后台任务写回
        # EmailVerification，响应里用 deliveryPending 标明还没拿到投递结果。
        background.add_task(
            _send_verification_email_background,
            request.app.state.database,
            request.app.state.settings,
            record_id=record.id,
            email=email,
            code=code,
            purpose=purpose,
        )
        return {
            "email": email,
            "purpose": purpose,
            "expiresInSeconds": settings.verification_ttl_seconds,
            "resendAfter": settings.verification_cooldown_seconds,
            "delivered": True,
            "deliveryMode": "smtp",
            "deliveryAttempts": 0,
            "deliveryPending": True,
        }

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


#: 这个公开验码端点只服务主应用（homeos）的账号流程，不接受商店自身账号流程的 purpose。
_HOMEOS_VERIFY_PURPOSES = frozenset({"homeos_register", "homeos_reset"})

#: purpose → 日志里的中文动作，避免用英文码刷日志。
_HOMEOS_PURPOSE_LABELS = {"homeos_register": "注册", "homeos_reset": "重置密码"}


@router.post("/verifications/verify")
def verify_verification(payload: VerifyCodeRequest, session: DbSession) -> dict:
    """校验并消费一个验证码（公开）。

    主应用（homeos）首装注册与找回本机密码时调用：它自己没有 SMTP，发码与验码都委托
    商店。为了不让这个匿名端点被拿去替商店账号流程（verify / reset / change_email）
    消费验证码，``purpose`` 被限定为 ``homeos_register`` / ``homeos_reset`` 两个用途 ——
    它们各自独立发码、独立消费，互不通用。
    """
    email = payload.email.strip().lower()
    if not is_valid_email(email):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="请输入有效的邮箱地址。")
    purpose = (payload.purpose or "").strip()
    if purpose not in _HOMEOS_VERIFY_PURPOSES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="该用途的验证码不支持在此校验。"
        )
    _consume_verification(session, email=email, purpose=purpose, code=payload.code)
    logger.info("主应用%s验证码校验通过 email=%s", _HOMEOS_PURPOSE_LABELS[purpose], email)
    return {"email": email, "purpose": purpose, "verified": True}

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
    license_id: str,
    request: Request,
    background: BackgroundTasks,
    session: DbSession,
    account: AuthedAccount,
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

    # 发信最坏 20s：排到响应之后执行，请求本身只做归属 / 履约 / 开关这几项便宜检查。
    if order.status != "fulfilled" or not order.license_id:
        return {
            "email": order.email,
            "sent": False,
            "deliveryError": "订单尚未完成履约，暂时无法重发激活码邮件。",
        }
    setting = site_config.get_setting(session)
    delivery_enabled = getattr(setting, "delivery_email_enabled", None)
    if delivery_enabled is not None and not bool(delivery_enabled):
        return {
            "email": order.email,
            "sent": False,
            "deliveryError": "站点当前已关闭激活码邮件发送，请联系客服。",
        }
    recipient = (order.email or "").strip()
    if not recipient:
        return {
            "email": order.email,
            "sent": False,
            "deliveryError": "这张订单没有可用的收件邮箱，请联系客服。",
        }

    background.add_task(
        delivery.notify_license_issued,
        request.app.state.database,
        order_id=order.id,
        force=True,
    )
    return {
        "email": order.email,
        "sent": None,
        "queued": True,
        "deliveryError": "",
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

    if binding is None or not binding.is_live:
        # 没有活跃绑定就没得解绑。以前这里照样往下走并写一条释放事件，而事件是
        # release_remaining_seconds 的唯一依据——白写一次等于凭空点燃 8 小时冷却，
        # 用户随后重新激活的设备会被「刚解绑过」拦住。
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="当前没有已绑定的设备，无需解绑。",
        )

    conflict = _release_snapshot_conflict(payload, binding)
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=conflict,
        )

    binding.active = False
    binding.released_at = moment
    # 立刻废会话，避免宽限期内旧实例继续 heartbeat。
    authority.revoke_binding_credentials(session, binding.id)

    session.add(
        DeviceReleaseEvent(
            license_id=license.id,
            account_id=account.id,
            instance_id=binding.instance_id,
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
