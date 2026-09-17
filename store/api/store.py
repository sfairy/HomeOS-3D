"""商店 API：``/store/v1/*``。

字段命名与 ``pay.habridge.cn`` 实测响应保持一致（camelCase），
路由与状态机也按参考站前端实际调用的方式实现。
"""

from __future__ import annotations

import logging
from datetime import timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from store import (
    coupons,
    fulfill,
    mail_settings,
    mailer,
    money,
    password_gate,
    referrals,
)
from store.config import StoreSettings
from store.deps import AuthedAccount, CurrentAccount, DbSession, SettingsDep
from store.expiry import expire_stale_orders
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
)
from store.limiter import SlidingWindowLimiter
from store.request_security import resolve_client_ip, secure_cookies_required
from store.schemas import (
    ChangeEmailRequest,
    ChangePasswordRequest,
    CouponPreviewRequest,
    CreateOrderRequest,
    LabelRequest,
    LoginRequest,
    PasswordResetRequest,
    RegisterRequest,
    ReleaseDeviceRequest,
    VerificationRequest,
    VerifyEmailRequest,
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
    token_matches,
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
from store.payments.base import PaymentError
from store.payments.reconcile import reconcile_alipay_order

logger = logging.getLogger("store.api")

router = APIRouter(prefix="/store/v1", tags=["store"])

PENDING_ORDER_LIMIT = 20
HISTORY_PAGE_SIZE = 20

#: 同一邮箱一小时内最多能索取多少次验证码（含注册与找回密码）。
MAX_VERIFICATION_SENDS_PER_HOUR = 10

#: S14：发信配额的另外两个维度。已有那条只按**邮箱**算，挡得住「把一个邮箱炸爆」，
#: 挡不住「用脚本给上万个**不同**邮箱各发一封」—— 那是把本站当发信机去轰炸第三方。
#: 发件域信誉一旦因此毁掉，之后**正常用户**的验证码会成批进垃圾箱，且基本不可逆；
#: 顺带还有 SMTP 配额与成本。所以再补两条：
#:
#: * 按**来源 IP**：脚本通常来自同一批地址。真实用户每小时 1~3 封足够，
#:   20 是很宽松的上限。
#: * 按**全站**：兜住换 IP 的分布式来源。这条做成可配置的，因为它的合理值随站点
#:   规模变化（小站 500/小时绰绰有余，大促期间可能需要调高）；上限由
#:   ``STORE_VERIFICATION_GLOBAL_HOURLY_LIMIT`` 控制，触发时会打一条明确的告警，
#:   让运营知道该往上调而不是对着「收不到验证码」干着急。
#:
#: 与 ``store/limiter.py`` 里的其它限流器同一个实现、同一套取舍（进程内计数，
#: 单进程部署够用；多进程时额度会翻倍，见该模块 docstring）。
_VERIFICATION_IP_LIMITER = SlidingWindowLimiter(limit=20, window_seconds=3600.0)

#: 全站配额按 ``limit`` 缓存实例（见下）。
_VERIFICATION_GLOBAL_LIMITERS: dict[int, SlidingWindowLimiter] = {}


def _verification_global_limiter(limit: int) -> SlidingWindowLimiter:
    """全站发信配额。上限来自配置，所以按 ``limit`` 缓存一份实例 ——
    ``SlidingWindowLimiter`` 的计数在内部持有，每次请求都新建一个等于没有限流。

    缓存不会无限增长：``limit`` 来自进程启动时解析的环境变量，一个进程里只有一个值。
    """
    cached = _VERIFICATION_GLOBAL_LIMITERS.get(limit)
    if cached is None:
        cached = SlidingWindowLimiter(limit=limit, window_seconds=3600.0)
        _VERIFICATION_GLOBAL_LIMITERS[limit] = cached
    return cached


def _enforce_verification_send_quota(
    request: Request, settings: StoreSettings, *, email: str
) -> None:
    """按来源 IP 与全站总量限制发信（S14）。超限抛 429。

    IP 取 ``resolve_client_ip`` 的解析结果（只在可信代理后面才采信转发头），
    与验证码回显、登录限流用的是同一个来源判定 —— 各写一份就会出现「限流按 A
    计算、回显按 B 计算」这类漂移，而伪造 ``X-Forwarded-For`` 正是绕过它们的手法。
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


def _is_trial_product(product: Product) -> bool:
    """试用商品的判定口径与前台 ``store.js`` 的 ``isTrialProduct`` 完全一致。

    试用 = 「有时限的商品」。这个口径必须两侧同一份，否则会出现「前台显示不能买、
    后端却放行」这类只在一侧成立的规则。
    """
    return product.validity_days is not None


def _has_used_trial(session, account: Account) -> bool:
    """该账号是否已经买过（或被后台发过）试用授权。

    判定用的是「账号下是否存在有时限的授权」，而不是「是否存在试用商品的订单」——
    后台手动补发的试用同样应该占用这一名额，退款/停用的历史记录也不该让规则失效。
    """
    found = session.execute(
        select(License.id)
        .where(License.account_id == account.id)
        .where(License.validity_days.is_not(None))
        .limit(1)
    ).first()
    return found is not None


def _resolve_upgrade_target(
    session, account: Account, upgrade_license_id: str | None
) -> License | None:
    """解析「试用升级为永久」要就地升级的那张授权。

    前台升级链接过去把 ``Customer.id`` 当参数传（``&upgrade=<customerId>``），而
    后端完全没有消费这个参数 —— 于是点了「升级为永久授权」只是重新买了一张新码，
    原试用授权依旧到期。现在按授权主键解析，并校验它确实属于当前账号且有时限。
    """
    normalized = (upgrade_license_id or "").strip()
    if not normalized:
        return None
    license = session.get(License, normalized)
    if license is None or license.account_id != account.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="要升级的授权不存在。")
    if not license.active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="要升级的授权已停用。")
    if license.validity_days is None and license.access_expires_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该授权已是永久授权，无需升级。")
    return license


def _set_session_cookies(
    request: Request, response: Response, *, token: str, hint: str
) -> None:
    settings: StoreSettings = request.app.state.settings
    # Secure 按请求自动判定（https 基址 / 可信代理转发的 https / 本连接 https），
    # 漏配 STORE_COOKIE_SECURE 时也不会把后台会话明文下发。
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
            # 之后被提权/降权的账号，等下次登录才会更新到新值。
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

    ``customers.account_id`` 上有唯一索引，而这里是「先查后插」—— 两个并发请求
    会同时查不到、同时插入，后到的那个撞唯一约束并把整个请求打成 500
    （由 S41 的并发测试当场发现：8 个并发下单里有 1 个是
    ``UNIQUE constraint failed: customers.account_id``，而不是预期的 409）。

    唯一索引本身就保证了「每个账号至多一行」，所以撞约束时不必报错 ——
    说明另一个请求刚好抢先建好了，直接把它读回来即可（幂等）。
    """
    customer = session.scalars(
        select(Customer).where(Customer.account_id == account.id)
    ).first()
    if customer is not None:
        return customer

    customer = Customer(account_id=account.id, email=account.email, name=account.email)
    try:
        # 用 SAVEPOINT 而非整个事务回滚：失败时只丢掉这一条 INSERT，
        # 调用方在本事务里已完成的其它写入（例如 expire_stale_orders 关掉的过期单）
        # 不该被这次撞车连累。本仓的 SQLite 驱动下 SAVEPOINT 语义已实测正确
        # （内层失败后外层写入仍在、会话仍可用）。
        with session.begin_nested():
            session.add(customer)
            session.flush()
    except IntegrityError as error:
        message = str(getattr(error, "orig", error))
        if "UNIQUE constraint failed" not in message or "customers.account_id" not in message:
            raise
        # 竞争对手先建好了：把自己这条脏对象从会话里摘掉，把已有的读回来。
        # 先判断再摘：SAVEPOINT 回滚时 SQLAlchemy 已经会把它从会话里清掉，
        # 此时再 expunge 会抛 ``InvalidRequestError``（实测抓到过）。
        if customer in session:
            session.expunge(customer)
        existing = session.scalars(
            select(Customer).where(Customer.account_id == account.id)
        ).first()
        if existing is None:  # 只可能是对方又把它删了，属于异常状态，不掩盖
            raise
        return existing
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
        # 走整数基点运算：原写法 `int(math.floor(price * float(percent) / 100.0))`
        # 在 price 很大（万元分级别）时会落到无法精确表示的浮点上，恰好差一个 ULP
        # 时 floor 会少算一分。折扣少算一分用户吃亏，多算一分平台吃亏。
        discount = min(money.discount_centi(price, coupon.percent), price)
    return coupon, max(0, discount)


#: 人工发卡商品不支持优惠码的统一文案。下单与 ``/coupons/preview`` 必须**一字不差**：
#: 预览说能用、下单说不能用（或反过来）比两边都不支持更糟 ——
#: 用户会觉得系统在骗他，而这种分歧恰恰来自两条路径各写了一遍判断。
_MANUAL_COUPON_DETAIL = "该商品为人工发卡，不支持使用优惠码。"


def _evaluate_coupon_limited(
    session, *, account: Account, product: Product, code: str
) -> tuple[Coupon, int]:
    """试算优惠码：口径校验 → 限流 → 试算 → 记失败 / 清计数，全部收在一处。

    下单与预览必须走同一条路径，原因有两个，都是真实踩过的坑：

    1. **预览过去完全没有限流**。它是一个不消耗任何东西、可以无限调的接口，
       而每次试探都会返回精确折扣额 —— 等于把「这个码对不对、能减多少」直接
       念出来。下单路径有 ``password_gate``，预览没有，爆破者当然走预览。
    2. **两条路径对「哪些商品不能用码」的判断各写了一遍**，于是人工发卡商品在
       预览里按折后价展示、在下单时被静默忽略原价收款，用户毫无提示地多付了钱。

    失败时用**独立会话**落一条尝试记录：本请求接下来一定会回滚（HTTPException
    会被转成 4xx，事务回滚），在本会话里写的记录会跟着消失，限流就形同虚设。
    """
    normalized = (code or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请输入优惠码。")
    if product.fulfillment_mode == "manual":
        # 人工发卡商品由运营手工核对后发码，折扣没法自动结算，因此明确不支持。
        # 关键是**两条路径都拒绝**：过去下单路径静默忽略、预览照常打折。
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_MANUAL_COUPON_DETAIL
        )
    scope = f"coupon:{account.id}"
    if password_gate.retry_after_seconds(session, scope) > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="优惠码尝试次数过多，请稍后再试。",
        )
    try:
        coupon, discount = _evaluate_coupon(
            session, account=account, product=product, code=normalized
        )
    except HTTPException:
        record_attempt_in_new_session(session, scope)
        raise
    password_gate.clear(session, scope)
    return coupon, discount


def _flush_order(session, order: Order) -> str:
    """插入订单；把唯一索引的裁决翻译成业务语义。

    返回 ``"ok"``（已落库）/ ``"pending"``（该账号已有待付单）/ ``"retry"``（订单号
    撞车，请调用方重试整个请求）。

    订单号由 :func:`store.security.new_order_no` 末尾的随机段保证**按构造即唯一**，
    所以这里刻意**不再**「撞号就换一个再插」。那种事后重试在 SQLAlchemy 里是个陷阱：
    flush 失败会把对象**逐出会话**，于是重试那次 flush 实际什么都没插、却返回成功
    （实测：换号重试的写法返回 "ok" 但行根本没落库）—— 订单静默丢失，比 500 更糟。
    真撞上订单号（概率可忽略）就交给上层让客户端重试，绝不假装成功。

    flush 放在 SAVEPOINT 内并关掉自动 flush：先建 SAVEPOINT、再显式 flush，失败时
    只回滚这一次插入，本事务中此前的改动（``_customer_for`` 建的客户档案等）不受
    影响，会话也仍可正常提交。
    """
    try:
        with session.no_autoflush, session.begin_nested():
            session.flush()
    except IntegrityError as error:
        # SQLite 的报错只列列名、不带索引名（``UNIQUE constraint failed:
        # orders.account_id``），所以按列名判断，而不是按索引名。
        message = str(getattr(error, "orig", error))
        if "UNIQUE constraint failed" not in message:
            raise
        if "orders.account_id" in message:
            # 待付单唯一索引（``uq_orders_pending_per_account``）挡下并发重复下单：
            # 上面的 ``pending`` 预检查是「先 SELECT 再 INSERT」，两个并发请求会同时
            # 看到没有待付单；真正定胜负的是这条索引。翻译成与预检查**完全相同** 的
            # 409，调用方无从分辨、也无需分辨。
            return "pending"
        if "orders.order_no" in message:
            return "retry"
        raise
    return "ok"


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


def _account_orders(
    session, account: Account, *, limit: int = 50, offset: int = 0
) -> list[Order]:
    return list(
        session.scalars(
            select(Order)
            .where(Order.account_id == account.id)
            # 用户主动「清除订单记录」写的就是 archived_at。这个字段此前没有任何
            # 查询过滤它，于是按钮点了只弹个提示，订单照样躺在账号中心。
            .where(Order.archived_at.is_(None))
            .order_by(Order.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    )


def _account_orders_total(session, account: Account) -> int:
    """账号中心订单总数（与 ``_account_orders`` 同口径，含 ``archived_at`` 过滤）。

    加它的理由：这个列表原来固定 ``limit=50`` 且没有任何分页 —— 买满 50 单的
    用户会**永远看不到**自己更早的订单，界面上也没有任何「还有更多」的提示，
    看起来就像订单丢了。总数让前端能如实显示「共 N 单」并接上「加载更多」。
    """
    return int(
        session.execute(
            select(func.count())
            .select_from(Order)
            .where(Order.account_id == account.id)
            .where(Order.archived_at.is_(None))
        ).scalar_one()
        or 0
    )


def _center_payload(session, request: Request, account: Account) -> dict:
    setting = site_config.get_setting(session)
    expire_stale_orders(session, request.app.state.settings)
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
        #: 总数单独查一次（与列表同口径），让前端能如实显示「还有 N 单未加载」——
        #: 过去固定 limit=50 且界面上没有任何提示，买满 50 单的用户会以为
        #: 更早的订单被系统丢掉了。
        orders_total=_account_orders_total(session, account),
        has_used_trial=_has_used_trial(session, account),
    )


# --------------------------------------------------------------------------- #
# 站点配置与商品
# --------------------------------------------------------------------------- #
@router.get("/configuration")
def configuration(session: DbSession, settings: SettingsDep) -> dict:
    setting = site_config.get_setting(session)
    # 这是**匿名可读**的接口：不带商户凭据概览（appId / 网关 / 密钥配置状态）。
    # 那几项只有后台需要，放在这里等于给扫描器白送一份侦察材料。
    return site_config.site_configuration_payload(
        setting, settings, include_credentials=False
    )


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
#: 需要登录态才能发码的用途。
#:
#: 「换绑邮箱」尤其重要：不校验登录态的话，任何人都能填任意邮箱触发验证码，
#: 这个接口就成了免费的邮件群发器（而且发件人是我们自己的域名，会被拉黑）。
_PURPOSES_REQUIRING_ACCOUNT = frozenset({"verify", "change_email"})

#: 视为「本机」的客户端地址（含空串：Starlette 的 TestClient 是进程内调用，
#: 根本没有网络对端，与 localhost 同级；``testclient`` 是为显式构造的请求保留的）。
#: 只有这些地址才允许看到 echo 回显的验证码 —— echo 的假设就是「访问者本身就在
#: 这台机器上」。
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", "testclient", ""})


def _client_host(request: Request) -> str:
    client = getattr(request, "client", None)
    return str(getattr(client, "host", "") or "").strip().lower()


def _is_loopback_client(request: Request) -> bool:
    """请求的**真实来源**是否在本机。

    刻意用 ``resolve_client_ip`` 而不是直接读 ``request.client.host``：后者只是
    TCP 对端，而在本机反代（nginx/caddy 与 store 同机）后面，**每一个**外部请求的
    对端都是 ``127.0.0.1``，直接读对端会把它们全部误判成本机，验证码就回显给了
    整个互联网。``resolve_client_ip`` 只在「对端确实是配置里的可信代理」时才采信
    ``X-Forwarded-For``，指向客户端的真实地址；没配 ``STORE_TRUSTED_PROXIES`` 时
    转发头一律忽略，语义与直接读对端一致（此时本机反代无法区分，靠 ``load_settings``
    的启动告警提示运营）。

    地址为空或标记 ``per_client=False``（链路全程可信、拿不到具体客户端）时按本机
    处理：那只会出现在进程内调用与 TestClient 场景，不存在「谁从网络上打过来」。
    反过来误判成本机才是危险的，所以只有能确定指向本机时才返回真。
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

    集中在一处是有原因的：每种用途的「谁能给哪个邮箱发码」规则都不一样，
    散在接口里最容易漏 —— 漏掉 ``change_email`` 的占用校验就会出现两台账号
    的邮箱被换到同一个地址上，之后登录按邮箱查账号会随机命中其中一个。
    """
    if purpose in _PURPOSES_REQUIRING_ACCOUNT and account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录后再获取该验证码。"
        )

    existing = session.scalars(
        select(Account).where(func.lower(Account.email) == email)
    ).first()

    # ---- S13：``register`` / ``reset`` 的「邮箱是否已存在」不再在这里回答 ---- #
    #
    # 这两个用途此前会给出「该邮箱已注册」(409) 与「该邮箱尚未注册」(404)，
    # 而这个端点**匿名可达、不需要邮箱里的验证码**。于是它就是一个随时可用的
    # 账号枚举探针：一次请求问一个地址，拿到的状态码直接就是答案。被枚举出来的
    # 是登录名，配合撞库/钓鱼这一步的价值远高于「知道某人注册过」。
    #
    # 现在两个分支一律按正常流程发码并返回同样的 200。真相挪到**用码的那一步**
    # 才说（见 ``register`` / ``reset_password``）—— 那时对方已经证明自己能收到
    # 该邮箱的邮件，告知归属不再构成泄漏。
    #
    # 代价是「用已注册邮箱去注册」会真发一封验证码邮件，而不是当场被拒。
    # 这是标准取舍（所有不做枚举的注册流程都是这样），发信量由
    # :func:`_enforce_verification_send_quota`、单邮箱小时上限与冷却共同封顶。
    if purpose in {"register", "reset"}:
        return

    if purpose == "verify":
        # 只允许验证「当前账号自己绑定的邮箱」：否则可以拿别人的邮箱刷验证码
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


@router.post("/verifications")
def send_verification(
    payload: VerificationRequest,
    request: Request,
    session: DbSession,
    account: CurrentAccount,
) -> dict:
    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="请输入有效的邮箱地址。")

    setting = site_config.get_setting(session)
    # 邮件 / 验证码相关配置一律用**合并后**的值（站点配置优先、环境变量兜底）。
    # 直接拿 ``app.state.settings`` 只会读到环境变量，于是后台改的有效期、
    # 冷却、投递方式全都不生效 —— 表现是「保存成功但没有任何反应」，
    # 而这恰恰是这几个字段被搬进后台的全部意义。
    settings: StoreSettings = mail_settings.merge_mail_settings(
        request.app.state.settings, setting
    )
    purpose = payload.purpose

    # ---- S14：按来源 IP 与全站的发信配额 ---- #
    # 放在最前面是刻意的：这一步之下要写库、要连 SMTP，都是每秒几次量级的开销，
    # 而上面的入口只需要一次内存计数。更关键的是，这个端点匿名可达、又能给
    # **任意**地址发信，是天然的「邮件轰炸第三方」放大器；配额不前置，前面的
    # 参数校验分支就成了绕过配额的免费通道。
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
    # 间隔调用就能无限量给同一个邮箱发信（轰炸 + 邮件成本）。这里再加一道
    # 小时级总量闸门，在真正写库/发信之前拦下。
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
    record = EmailVerification(
        email=email,
        purpose=purpose,
        code_hash=code_hash(code),
        expires_at=utcnow() + timedelta(seconds=settings.verification_ttl_seconds),
    )
    session.add(record)
    session.flush()
    #: 发出新码 = 换了一份新凭据，过去的输错次数不该继续拖累它。
    #: 不清的话会出现这种荒唐情形：用户忘了密码、连错 7 次，重新获取验证码后
    #: 第 8 次（正确的那次）一输入就被限流 —— 「重新获取」这个动作等于没有用。
    password_gate.clear(session, f"verify:{email}")

    result = mailer.send_verification_email(
        settings, setting, email=email, code=code, purpose=purpose
    )

    # 投递结果落库。过去 ``delivered`` 只回给前端就丢了，事后完全无法回答
    # 「用户说没收到，那封信到底发出去没有」—— 只能翻日志，而日志会轮转。
    # ``mode`` 记录的是**实际生效**的方式（smtp 失败会回退成 log），
    # 所以不能拿 settings.mail_mode 冒充：那会把「以为发了其实只写了日志」藏起来。
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
    #: 任何把验证码写进 HTTP 响应的路径都只认**本机**客户端。
    #:
    #: 这一条必须覆盖所有 mail_mode，而不只是 echo：``result.exposed_code`` 在
    #: ``mail_mode=log`` 与 ``mail_mode=smtp``（凭据不全或发信重试全失败而回退）下
    #: 同样会有值 —— 只要 ``STORE_EXPOSE_VERIFICATION_CODE`` 打开。此前这里写的是
    #: ``settings.mail_mode != "echo" or echo_allowed``，「非 echo」直接短路为真，
    #: 于是远端请求在 log / smtp 两种模式下都能从响应里拿到验证码，等于给任意账号
    #: （含管理员）留了接管路径；只有 echo 一个模式恰好被挡住。
    #:
    #: 非本机一律按 log 处理并告警：验证码仍写进服务端日志（运营能捞到），
    #: 但不会出现在任何一个跨网络的响应里。
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
            # smtp 误配置/发信失败后回退，或显式打开了 STORE_EXPOSE_VERIFICATION_CODE
            body["devNotice"] = (
                "验证码在响应中回显（mail_mode="
                f"{settings.mail_mode}，由 STORE_EXPOSE_VERIFICATION_CODE 决定）；"
                "仅本机访问才会回显，生产请关闭该开关。"
            )
    elif result.exposed_code is not None:
        # 非本机：明确告知验证码去了哪里，避免本地联调时以为发丢了
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
        #: 刻意**不**记失败：这条路径连一个验证码记录都没有，记一笔既不反映
        #: 暴力破解（攻击者连码都不用去拿），又能被用来把任意邮箱锁死 ——
        #: 免费打 8 次空请求，受害者自己 15 分钟内就无法验证邮箱/重置密码了。
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先获取邮箱验证码。")
    if record.expires_at <= utcnow():
        # 同上：过期不是「猜错」，把它算成失败次数只会让正常用户被自己拖累。
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码已过期，请重新获取。")
    if int(record.attempts or 0) >= MAX_VERIFICATION_CODE_ATTEMPTS:
        _record_verify_failure(session, scope)
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="尝试次数过多，请重新获取验证码。")
    if record.code_hash != code_hash(code.strip()):
        # 先记账再从 ORM 改 attempts：此时本事务还只有 SELECT，没有持有 SQLite
        # 写锁，独立会话的 INSERT 不会被自己挡住。
        _record_verify_failure(session, scope)
        record.attempts = int(record.attempts or 0) + 1
        session.flush()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码不正确。")
    record.consumed_at = utcnow()
    # 成功后清空该邮箱的失败计数，避免用户被自己过去的输错次数拖累。
    password_gate.clear(session, scope)
    session.flush()


#: 单封验证码最多可以被尝试几次（按验证码记录计）。
MAX_VERIFICATION_CODE_ATTEMPTS = 8


def _record_verify_failure(session, scope: str) -> None:
    """记录一次验证码失败，作为 ``verify:<email>`` 的限流依据。

    这里有个必须注意的坑：本函数之后一定会抛 HTTPException，请求事务随之回滚，
    所以**在本会话里写的记录会被一起回滚掉**。因此改用独立会话提交
    （``record_attempt_in_new_session``），失败尝试才真的算数。
    """
    record_attempt_in_new_session(session, scope)


def record_attempt_in_new_session(session, scope: str) -> None:
    """在一个独立事务里记录失败尝试，确保外层请求回滚不会把它抹掉。

    限流记录的语义就是「即使这次请求失败也要留下痕迹」，所以它天然不能和
    请求共用事务 —— 共用事务时所有失败路径的记录都会被回滚，限流永远不会触发
    （``verify:<email>`` 这个 scope 之前就是这样，形同虚设）。

    写入失败（SQLite 写锁被外层事务占着等）一律吞掉并告警：这是限流记账，
    让用户的「验证码不正确」变成 500 是不可接受的降级。
    """
    factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False, future=True)
    try:
        with factory() as probe:
            password_gate.record_attempt(probe, scope, succeeded=False)
            probe.commit()
    except SQLAlchemyError:
        logger.warning("限流记录写入失败，本次不计入 scope=%s", scope, exc_info=True)


@router.post("/auth/register")
def register(payload: RegisterRequest, request: Request, session: DbSession) -> Response:
    email = payload.email.strip().lower()
    if payload.confirm_password and payload.confirm_password != payload.password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="两次输入的密码不一致。")

    # S13：先消费验证码，再回答「这个邮箱是否已注册」。
    #
    # 反过来的话，任何人都能拿一个瞎编的验证码去 POST：拿 409 = 该邮箱有账号，
    # 拿「请先获取邮箱验证码」= 没有。那就等于把 :func:`_assert_purpose_allowed`
    # 里刚堵上的枚举口又原样挪到了这里。
    #
    # 换到「先验码」之后，能走到 409 的只有**确实持有该邮箱**（验证码是发到那里、
    # 且只在那里）的人，告知归属不再泄漏任何东西。未持有邮箱者两条分支所见完全一致。
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
            # 而关系永远补不上（注册流程只有这一次机会写入 referred_by）。
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
    # 显式 commit —— 同 login handler 的原因
    session.commit()
    state = _account_license_state(session, account)
    body = account_state_payload(
        account,
        has_permanent=state[0],
        has_temporary=state[1],
        has_used_trial=_has_used_trial(session, account),
    )
    # 邀请码没能绑定时必须让用户看到：绑定只在注册这一步发生，静默失败之后
    # 没有任何补救入口。
    body["referralNote"] = referral_note
    response = JSONResponse(body)
    _set_session_cookies(
        request,
        response,
        token=token,
        hint="permanent" if state[0] else ("temporary" if state[1] else "unlicensed"),
    )
    return response


#: 登录限流的三档阈值。按账号必须最紧（保护单个账号），按来源 IP 放宽
#: （同一个出口 NAT 后面可能坐着整间办公室）。
LOGIN_ACCOUNT_MAX_ATTEMPTS = password_gate.MAX_ATTEMPTS
LOGIN_IP_MAX_ATTEMPTS = 30
#: 全局维度**只告警、不拦截**，见 :func:`_note_login_failure` 的说明。
LOGIN_FLOOD_ALERT_ATTEMPTS = 120
LOGIN_GLOBAL_SCOPE = "login-global"


def _login_scopes(request: Request, email: str) -> list[str]:
    """一次登录失败要记到哪些维度上。

    只有「按账号」这一档能保护单个账号；加上「按 IP」是为了挡住「同一个来源
    横扫很多账号」——只有按账号时，攻击者换一个邮箱就等于换了一个全新的计数桶。

    按 IP 那一档只在「来源地址真的代表一个客户端」时启用：反代后面没配可信代理时
    所有人共用代理那一个地址，用它计数会让任何一个人失败几次就锁掉所有人
    （包括管理员自己）。这种情况由按账号那一档继续兜底。
    """
    scopes = [f"login:{email}"]
    address = resolve_client_ip(request)
    if address.per_client and address.ip:
        scopes.append(f"login-ip:{address.ip}")
    return scopes


def _note_login_failure(session, scopes: list[str]) -> None:
    """把失败记进各维度，并在全局量异常时告警。

    **必须先结束本请求的事务，再用独立会话提交。** 这里有两层原因，都是实测出来的：

    1. 本函数之后一定会抛 401，请求事务随之回滚 —— 写在请求会话里的失败记录会
       一起消失，限流永远不会触发（这正是审计里「40 次错误密码无一被拦」的成因）。
    2. 光换成独立会话还不够：请求会话此刻可能**正持着 SQLite 写锁**（``maybe_prune``
       的 DELETE 会开启写事务）。SQLite 是单写者，独立会话的写入会一直等到
       ``busy_timeout``（5 秒）才失败，然后被 ``record_attempt_in_new_session``
       吞掉并只留一条告警 —— 既拖慢每次失败登录，又照样丢计数。所以先回滚把锁放掉。

    此时回滚是安全的：失败分支到此为止只做过读与一次可丢弃的清理，``account``
    对象之后不再使用。
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
    if account is None or not account.is_active or not verify_password(payload.password, account.password_hash):
        _note_login_failure(session, _login_scopes(request, email))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码不正确。")

    # 登录成功：清掉这个账号与这个来源 IP 的失败计数。
    # 清来源 IP 一档是为了「同一个人先打错几次再成功」的正常体验；它带来的唯一
    # 放宽是「持有任一有效凭据者可重置该 IP 的计数」，而攻击者一旦有有效凭据就
    # 不需要撞库，且按账号那一档始终在拦他真正想攻的那个账号。
    # 全局桶不清 —— 它是聚合观测，被一次成功登录清零就失去了发现慢速撞库的意义。
    password_gate.clear(session, account_scope)
    if ip_scope:
        password_gate.clear(session, ip_scope)
    password_gate.record_attempt(session, account_scope, succeeded=True)

    token = _create_session(session, request, account)
    # 显式 commit —— 依赖里的 context manager 会在 response **发送完毕后**才 commit，
    # Set-Cookie 里的 token 在 commit 前查不到。浏览器拿到 200 后立刻发 /auth/me，
    # 就会撞进「上一个请求还没 commit」的窗口。
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

    安全约束：
    - 必须凭**当前密码**确认身份（挡住会话被劫持场景）
    - 新密码 ≥ 8 位（与注册一致）
    - 改密后踢掉其它设备的会话，只保留当前这一个
    """
    if not verify_password(payload.old_password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="当前密码不正确。")

    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="两次输入的新密码不一致。")

    if verify_password(payload.new_password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="新密码与当前密码相同。")

    account.password_hash = hash_password(payload.new_password)

    # 踢掉其它设备的会话，只保留当前这一个。改密码就是为了止损，
    # 不这么做的话——会话被偷了，改完密码攻击者依然保持登录。
    settings: StoreSettings = request.app.state.settings
    current = token_hash(request.cookies.get(settings.cookie_name) or "")
    for record in session.scalars(
        select(AccountSession).where(AccountSession.account_id == account.id)
    ):
        if record.id_hash != current:
            session.delete(record)

    session.commit()
    logger.info("密码已修改 account=%s", account.id)
    return {"success": True}


@router.post("/auth/password/reset")
def reset_password(payload: PasswordResetRequest, request: Request, session: DbSession) -> dict:
    email = payload.email.strip().lower()
    if payload.confirm_password and payload.confirm_password != payload.password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="两次输入的密码不一致。")
    # S13：同 ``register`` —— 先消费验证码，再表态邮箱是否存在。
    # 「尚未注册」这个回答只该给到已经证明持有该邮箱的人；否则这里就是一个
    # 一次请求一个答案的枚举探针（而且它连验证码都不用去拿）。
    _consume_verification(session, email=email, purpose="reset", code=payload.code)

    account = session.scalars(select(Account).where(func.lower(Account.email) == email)).first()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="该邮箱尚未注册。")

    account.password_hash = hash_password(payload.password)
    # 重置密码后强制所有会话下线
    for record in session.scalars(
        select(AccountSession).where(AccountSession.account_id == account.id)
    ):
        session.delete(record)
    session.commit()
    return {"email": email, "reset": True}


# --------------------------------------------------------------------------- #
# 账号中心
# --------------------------------------------------------------------------- #
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

    注册流程本来就会写上 ``email_verified_at``，所以走到这里的只有两类账号：
    运营在服务端直接建的号（``seed`` 管理员），以及历史上漏写该字段的老号。
    它们会被 ``_require_verified`` 挡在「查看订单 / 下单」之外 —— 闸门装了却
    没有任何开闸动作，账号就等于废了。这个接口就是那道开闸动作。
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

    为什么两样都要：账号邮箱就是登录名，它一旦被改掉，原主就再也登不进来。

    - 只验旧邮箱 → 任何拿到一次会话的人都能把邮箱改成自己的，再走「忘记密码」
      把账号彻底夺走。
    - 只验新邮箱 → 会话被劫持时同样守不住（新邮箱本来就是攻击者的）。
    - 要求密码 → 这是挡住「会话被劫持」的最后一道锁。
    """
    if not verify_password(payload.password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="登录密码不正确。")

    email = payload.email.strip().lower()
    if (account.email or "").strip().lower() == email:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="新邮箱与当前邮箱相同。")

    # S13：占用校验挪到**消费验证码之后**。
    #
    # 位置不能随意的两个理由：
    # 1. 安全性 —— 放在前面就是个「该邮箱有没有账号」的探针，任何登录用户都能
    #    拿一个瞎编的验证码逐条问出来（409 有账号 / 「请先获取邮箱验证码」没有）。
    #    挪到后面，只有能收到该地址验证码的人才会看到 409，而 409 要保护的
    #    「两台账号撞名」是登录名的归属问题，对地址主人公开并不越界。
    # 2. 正确性 —— TOCTOU 的窗口是「发码 → 落库」，校验必须紧贴写库那次查询。
    #    挪到消费之后仍是「查完即写、同一事务」，窗口反而更小。
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
    # 新地址刚被验证码证明过归属，直接算已验证；否则换完邮箱，账号反而会被
    # ``_require_verified`` 锁死在自己的订单之外。
    account.email_verified_at = utcnow()

    customer = session.scalars(
        select(Customer).where(Customer.account_id == account.id)
    ).first()
    if customer is not None:
        customer.email = email

    # 登录标识变了：把其它设备上的会话全部踢下线，只保留当前这一个。
    # 不这么做的话，「改邮箱之前就偷到会话的人」依然保持登录。
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
    if not verify_password(payload.password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="登录密码不正确。")

    setting = site_config.get_setting(session)
    settings: StoreSettings = request.app.state.settings
    cooldown = site_config.resolve_device_release_cooldown(setting, settings)
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

    # 乐观锁：前端在弹窗里看到的绑定快照必须仍然有效。用户输密码的这段时间里
    # 授权可能已经被重新绑定到另一台设备，按旧快照解绑会误踢一台「它没看到」的
    # 设备。冲突时 409，让前端刷新后重新确认（不猜测、不强行解绑）。
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


def _release_snapshot_conflict(payload: ReleaseDeviceRequest, binding) -> str | None:
    """校验解绑请求里的绑定快照，返回冲突说明（None 表示一致）。

    三个字段都可选：后台脚本 / 老客户端不带快照时保持原行为（不做校验，包括
    「当前没有绑定设备也允许解绑」——smoke 用它验证「未被占用的授权仍可解绑」）。
    带了快照就必须一致：用户在弹窗里输密码的这段时间授权可能已被换绑，按旧快照
    解绑会误踢一台「它没看到」的设备。
    """
    has_snapshot = bool(
        payload.expected_binding_id
        or payload.expected_activated_at
        or payload.expected_binding_version
    )
    if binding is None:
        # 带了快照却查不到绑定：说明它在这几秒内被别处释放/换绑了。
        return "授权绑定的设备已变更，请刷新后重新确认。" if has_snapshot else None
    if payload.expected_binding_id and payload.expected_binding_id != binding.id:
        return "授权绑定的设备已变更，请刷新后重新确认。"
    expected_at = payload.expected_activated_at
    if expected_at is not None:
        # 前端发来的是 iso_z（带 Z 的 UTC 时刻），库内是 naive UTC。
        normalized = expected_at
        if normalized.tzinfo is not None:
            normalized = normalized.astimezone(timezone.utc).replace(tzinfo=None)
        actual = binding.activated_at
        if actual is None or abs((actual - normalized).total_seconds()) > 1:
            return "授权绑定的设备已变更，请刷新后重新确认。"
    if payload.expected_binding_version:
        from store.serializers import binding_version

        if payload.expected_binding_version != binding_version(binding):
            return "授权绑定的设备已变更，请刷新后重新确认。"
    return None


# --------------------------------------------------------------------------- #
# 订单
# --------------------------------------------------------------------------- #
#: 账号中心订单列表每页条数。与后台的 ``_page`` 保持同一量级（后台默认 100），
#: 但前台是按卡片渲染的，一次 100 张卡片会明显拖慢首屏，所以取 20。
ACCOUNT_ORDER_PAGE_SIZE = 20


@router.get("/orders")
def list_orders(
    session: DbSession,
    account: AuthedAccount,
    settings: SettingsDep,
    limit: int = ACCOUNT_ORDER_PAGE_SIZE,
    offset: int = 0,
) -> dict:
    """账号中心的订单列表（分页）。

    带上 ``ordersTotal``：这个接口过去固定返回最近 50 单且没有总数，用户买满
    50 单之后更早的订单就再也看不到了，界面也没有任何「还有更多」的提示 ——
    看起来就像订单丢了。分页本身直接复用 ``_account_orders``，
    与账号中心首屏用同一口径（都过滤 ``archived_at``）。
    """
    _require_verified(account)
    expire_stale_orders(session, settings)
    size = max(1, min(int(limit or ACCOUNT_ORDER_PAGE_SIZE), 100))
    skip = max(0, int(offset or 0))
    orders = _account_orders(session, account, limit=size, offset=skip)
    return {
        "items": [order_payload(order) for order in orders],
        "ordersTotal": _account_orders_total(session, account),
        "limit": size,
        "offset": skip,
    }


@router.post("/orders")
def create_order(
    payload: CreateOrderRequest,
    request: Request,
    session: DbSession,
    account: AuthedAccount,
    settings: SettingsDep,
) -> Response:
    _require_verified(account)
    setting = site_config.get_setting(session)
    if setting.maintenance_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=setting.maintenance_message or "商城正在升级维护，请稍后再试。",
        )
    # 「启用支付」这个开关过去只影响站点配置接口的展示（payment.configured），
    # 下单流程从没读过它 —— 运营关掉支付后，用户依然能下单并拿到二维码。
    if not setting.payment_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="当前暂未开放支付，请稍后再试或联系客服。",
        )

    expire_stale_orders(session, settings)

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
    elif _is_trial_product(product):
        # 「每个账号只能买一次试用」过去只写在前端（store.js 的 primaryProductUnavailable），
        # 而 state.hasUsedTrial 恒为 false（后端从未计算过这个字段），等于这条规则
        # 在前端也是死代码。这里在服务端兜底：试用只能买一次，且已有永久授权时不必再买。
        permanent, _temporary = _account_license_state(session, account)
        if permanent:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="当前账号已有永久授权，无需购买试用。",
            )
        if _has_used_trial(session, account):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="每个账号只能购买一次试用授权。",
            )
    else:
        target_license = _resolve_upgrade_target(session, account, payload.upgrade_license_id)

    coupon = None
    discount = 0
    coupon_code = (payload.coupon_code or "").strip()
    if coupon_code:
        # 限流、口径校验、失败记账都在这里——与 ``/coupons/preview`` 是同一条
        # 路径。过去这段内联在结账里，导致「哪些商品支持优惠码」与预览各写一遍，
        # 人工发卡商品在预览里打折、在下单时被静默忽略（用户多付钱且无提示）。
        coupon, discount = _evaluate_coupon_limited(
            session, account=account, product=product, code=coupon_code
        )

    original_amount = int(product.price_cents or 0)
    amount = max(0, original_amount - discount)
    is_upgrade = not is_addon and target_license is not None
    if is_addon:
        order_type = "addon"
        license_action = "patch"
    elif is_upgrade:
        order_type = "upgrade"
        license_action = "upgrade"
    elif product.product_type == "package":
        order_type = "package"
        license_action = "issue"
    else:
        order_type = "base"
        license_action = "issue"
    moment = utcnow()
    order = Order(
        order_no=new_order_no(account.email, now=moment),
        lookup_token=new_token(24),
        account_id=account.id,
        customer_id=_customer_for(session, account).id,
        email=account.email,
        product_id=product.id,
        product_name=product.name,
        product_type=product.product_type,
        order_type=order_type,
        license_action=license_action,
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
    outcome = _flush_order(session, order)
    if outcome == "pending":
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="你有一笔待支付订单，请先完成或等待其超时关闭。",
        )
    if outcome != "ok":
        #: 订单号撞车。``new_order_no`` 末尾的随机段已经让这件事的概率可忽略，但真撞上
        #: 也不能把订单发出去 —— 返回可重试的 503 而不是 500。
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="下单请求过于频繁，请稍后重试。",
            headers={"Retry-After": "1"},
        )

    if coupon is not None:
        try:
            coupons.redeem_coupon(session, order, coupon, account, discount)
        except coupons.CouponUnavailable as error:
            # 名额在「校验」和「占用」之间被别人抢走：整单作废，先建的订单不会
            # 被 flush 到库里（异常会让请求事务回滚）。
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)
            ) from error
    if not fulfill.reserve_stock(session, product, 1):
        # 并发下单：更早那一次 soldOut 检查是「读」，这里是「原子占位」。
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该商品已售罄。")

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

    from store.payments.base import PaymentError

    try:
        provider = request.app.state.resolve_payment_provider(setting)
    except PaymentError as error:
        # 渠道配置非法（例如后台把 payment_provider 写成了未知值）：此时绝不能
        # 静默回落模拟收银台，也不能把订单留在 pending 占着库存。
        order.status = "payment_failed"
        fulfill.release_order_reservation(session, order=order, product=product)
        coupons.release_coupon(session, order)
        session.flush()
        logger.error("支付渠道解析失败 order=%s: %s", order.order_no, error)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error))

    try:
        intent = provider.create_payment(
            order=order,
            settings=request.app.state.settings,
            setting=setting,
            base_url=_base_url(request),
        )
    except PaymentError as error:
        order.status = "payment_failed"
        fulfill.release_order_reservation(session, order=order, product=product)
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
    try:
        provider = request.app.state.resolve_payment_provider(setting)
    except PaymentError:
        # 渠道名非法时不做任何事：否则轮询接口会 500（对账绝不能打断用户支付）。
        return
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
    if not token_matches(token, order.lookup_token):
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
        or token_matches(order_token, order.lookup_token)
    )
    if not authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该订单。")

    expire_stale_orders(session, request.app.state.settings)
    session.refresh(order)
    # 前端每 3 秒轮询一次；顺带向支付宝查单对账，兜住「异步通知没收到」的情况
    _reconcile_payment(session, request, order)
    response = JSONResponse(order_payload(order))
    response.headers["Cache-Control"] = "no-store"
    return response


@router.post("/orders/{order_no}/cancel")
def cancel_order(
    order_no: str, request: Request, session: DbSession, account: CurrentAccount
) -> dict:
    """买家自助取消待支付订单：关掉渠道侧的收款码，归还库存预留与优惠码名额。

    与后台 ``POST /store-admin/v1/orders/{order_no}/cancel`` 的关键区别：后台取消
    只改本地状态，渠道侧那笔预下单交易仍然开着 —— 用户手里那张二维码还能继续扫、
    继续付。钱进来时本地订单已经进了终态、库存也还给了别人，只能按「复活单」补发
    并挂人工复核。所以这里在改状态**之前**先 ``close_payment``，把这个窗口堵掉。

    关单结果分三种，各自的处理不能混：
      · ``closed`` —— 渠道侧已不可能再被支付（含「交易本来就不存在 / 已经关闭过」
        这类幂等情况）。照常取消，并写下 ``channel_closed_at``：巡检靠它判断
        「这笔远端交易已经关过了」，漏写会让同一笔单被反复关。
      · ``already_paid`` —— 钱已经付了，**绝不能取消**：返回 409。订单保持 pending，
        交给对账（``reconcile_alipay_order``）走正常入账发码，退款是另一条流程。
      · ``PaymentError`` —— 网关抖动或凭据没配好。此时仍然本地取消：库存和优惠码
        必须先还给用户，远端那笔交易留给巡检重试（``channel_closed_at`` 留空，
        下一轮扫描还会再来关一次）。

    授权口径与 ``GET /orders/{order_no}`` 一致（本人订单，或持有订单查询凭证）。
    这里**不**要求邮箱已验证：取消只释放资源、不发放任何权益，而把「验证邮箱」设成
    取消的前提，会把还没验证邮箱却已经占到库存的用户卡在一张他既不能付、也退不掉
    的单上。
    """
    order = session.scalars(select(Order).where(Order.order_no == order_no)).first()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")

    order_token = request.headers.get("x-order-token")
    authorized = (
        (account is not None and order.account_id == account.id)
        or token_matches(order_token, order.lookup_token)
    )
    if not authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作该订单。")

    if order.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="只有待支付订单可以取消。"
        )

    # ---- 阶段一：先关渠道（网络调用），失败只记日志 ----
    setting = site_config.get_setting(session)
    try:
        provider = request.app.state.resolve_payment_provider(setting)
    except PaymentError:
        # 渠道名非法：没有可关的远端交易，按纯本地取消处理。
        provider = None
    channel_closed = False
    if provider is not None and getattr(provider, "name", "") == "alipay":
        try:
            outcome = provider.close_payment(request.app.state.settings, order)
        except PaymentError as error:
            logger.warning(
                "取消订单时关单失败订单号=%s 错误=%s（留给巡检重试）", order.order_no, error
            )
        else:
            if outcome.already_paid:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="该订单已有付款记录，无法取消；请稍后到账号中心查看授权。",
                )
            channel_closed = bool(outcome.closed)

    # ---- 阶段二：本地收尾（条件 UPDATE 抢单） ----
    product = session.get(Product, order.product_id) if order.product_id else None
    # 取消可能和支付回调、超时扫描同时发生：只有把订单从 pending 推走的那一个请求
    # 才负责释放副作用，否则预留与优惠码名额会被释放两次。
    claimed = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(Order.status == "pending")
        .values(status="cancelled", cancelled_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="订单状态已变更，请刷新后重试。"
        )
    if channel_closed:
        #: 只有真的关掉了（或本来就已关闭）才写这个时间戳。关单报错时留空，
        #: 巡检下一轮会重试；写错方向是「把还开着的交易标成已关闭」，那笔钱
        #: 就再也关不掉了。
        order.channel_closed_at = utcnow()
    fulfill.release_order_reservation(session, order=order, product=product)
    #: 与超时扫描、后台取消对齐：取消必须归还优惠码名额。漏掉这一步
    #: ``redeemed_count`` 只增不减，而它参与 ``max_redemptions`` 校验，名额会被
    #: 永久占用，用户之后下单直接收到「优惠码已被领完」。
    coupons.release_coupon(session, order)
    session.flush()
    session.refresh(order)
    logger.info(
        "用户取消待支付订单 订单号=%s 渠道已关=%s", order.order_no, channel_closed
    )
    return order_payload(order)


@router.post("/orders/{order_no}/archive")
def archive_order(order_no: str, session: DbSession, account: AuthedAccount) -> dict:
    #: 与 ``GET/POST /orders`` 对齐：能读订单列表的账号必须先验证邮箱。
    #: 少这一道并不会泄露什么，但会让「未验证邮箱」的账号多出一条可写路径 ——
    #: 权限判断散落成「有的接口查了、有的没查」时，下一个接口照抄哪一份全凭运气。
    _require_verified(account)
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
    # 与下单走同一条路径（含限流）：预览返回精确折扣额，是一个天然的判定 oracle，
    # 不设限流就等于开了一个无限次的优惠码爆破接口。
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


# --------------------------------------------------------------------------- #
# 邀请有礼
# --------------------------------------------------------------------------- #
def _wallet_payload(wallet: ReferralWallet | None) -> dict | None:
    if wallet is None:
        return None
    #: 对外仍是「两位小数字符串」，与改动之前**逐字节一致** —— 厘正好是 1/100，
    #: 两位小数无损，所以前端与调用方都不用改（契约兼容）。
    return {
        "code": wallet.code,
        "balance": money.format_centi(wallet.balance_centi),
        "frozen": money.format_centi(wallet.frozen_centi),
        "earned": money.format_centi(wallet.earned_centi),
        "withdrawn": money.format_centi(wallet.withdrawn_centi),
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
                "points": money.format_centi(row.points_centi),
                "feePoints": money.format_centi(row.fee_points_centi),
                "feePercent": money.format_centi(row.fee_bps).rstrip("0").rstrip("."),
                "netPoints": money.format_centi(row.net_points_centi),
                "status": row.status,
                "note": row.note,
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
            "delta": money.format_centi(row.delta_centi),
            "frozenDelta": money.format_centi(row.frozen_delta_centi),
            "balanceAfter": money.format_centi(row.balance_after_centi),
            "frozenAfter": money.format_centi(row.frozen_after_centi),
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
        "points": money.format_centi(withdrawal.points_centi),
        "feePoints": money.format_centi(withdrawal.fee_points_centi),
        "feePercent": money.format_centi(withdrawal.fee_bps).rstrip("0").rstrip("."),
        "netPoints": money.format_centi(withdrawal.net_points_centi),
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

    minimum_centi = money.to_centi(setting.referral_withdrawal_min_points or 100.0)
    points_centi = money.to_centi(payload.points)
    if points_centi < minimum_centi:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"最低提现 {money.format_centi(minimum_centi)} 积分。",
        )
    # 「可用积分」口径必须与前端展示一致（余额 - 冻结）。过去这里只比 balance，
    # 于是「可用 0 元」的用户照样能提交申请，一路走到后台才被人工拒绝。
    available_centi = referrals.available_points_centi(wallet)
    if points_centi > available_centi:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"可用积分不足（当前可用 {money.format_centi(available_centi)}，"
                f"已被提现申请冻结 {money.format_centi(wallet.frozen_centi)}）。"
            ),
        )
    if int(wallet.frozen_centi or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="你有正在处理中的提现申请，请等待处理完成。"
        )
    fee_percent = float(setting.referral_withdrawal_fee_percent or 0.0)
    # 手续费在用户确认那一刻可能是 1%，等运营改成 5% 后才提交 —— 用户看到的
    # 到账金额与实际不符，只能事后投诉。前端已经在发 expectedFeePercent，
    # 这里真正校验它：不一致就让用户重新确认一次。
    # 比对用基点整数：浮点的 abs(a-b) > 1e-6 对「1% vs 1.0000001%」判不出来，
    # 而这两个值在前端显示成同一个数字。
    if payload.expected_fee_percent is not None and money.percent_to_bps(
        payload.expected_fee_percent
    ) != money.percent_to_bps(fee_percent):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"提现手续费已从 {float(payload.expected_fee_percent):.2f}% "
                f"调整为 {fee_percent:.2f}%，请确认后重新提交。"
            ),
        )
    try:
        withdrawal = referrals.create_withdrawal(
            session,
            wallet,
            points_centi=points_centi,
            request_key=payload.request_key,
            fee_percent=fee_percent,
        )
    except referrals.WalletConflictError:
        #: 上面的「可用积分够不够」「有没有正在处理的提现」都是**读**判断，
        #: 与真正冻结之间存在窗口。两个并发的提现申请会各自读到 frozen=0、
        #: 各自通过校验，最终只冻结一次却挂两笔待审 —— 审完就能重复套现。
        #: 冲突时让用户重试即可，绝不能让它变成一个 500 或静默成功。
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="钱包刚刚有其它操作，请刷新后重试。",
        ) from None
    return _withdrawal_payload(withdrawal)