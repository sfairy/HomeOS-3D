"""管理后台 API：``/store-admin/v1/*``。

参考站没有公开管理台，这里自建最小可用后台，让商店「可运营」：
商品、订单、激活码、设备绑定、优惠码、提现审核、站点配置、版本发布。
"""

from __future__ import annotations

import logging
import secrets
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from store import coupons, features, fulfill, incidents, money, referrals, site_settings as site_config
from store import catalog, mail_settings, mailer
from store.api.store import (
    _image_map,
    _license_meta,
    _product_stats,
)
from store.deps import AdminAccount, DbSession, SettingsDep, order_or_404
from store.expiry import expire_stale_orders
from store.order_status import (
    ORDER_ATTENTION_STATUSES,
    ORDER_STATUS_LABELS,
    ORDER_STATUS_CHOICES,
    order_status_label,
)
from store.order_status import (
    FULFILLABLE_STATUSES as ORDER_FULFILLABLE_STATUSES,
)
from store.order_status import (
    REFUNDABLE_STATUSES as ORDER_REFUNDABLE_STATUSES,
)
from store.order_status import refundable_cents
from store.payments import PROVIDER_NAMES, is_known_provider, normalize_provider_name
from store.payments.base import PaymentError
from store.payments.credentials import (
    alipay_credentials_summary,
    resolve_secret_input,
    validate_callback_url,
    validate_gateway_url,
    validate_private_key_text,
    validate_public_key_text,
)
from store.payments.reconcile import CLOSE_LOOKBACK_HOURS, channel_still_payable
from store.payments.refunds import record_refund_in_new_session
from store.payments.sweeper import sweep_status
from store.models import (
    Account,
    AccountSession,
    AuditLog,
    Coupon,
    CouponRedemption,
    Customer,
    DEFAULT_SUPPORT_EMAIL,
    DeviceBinding,
    DeviceReleaseEvent,
    EmailVerification,
    Entitlement,
    License,
    LicenseSession,
    LoginAttempt,
    Order,
    OrderRefund,
    Product,
    ProductImage,
    RecoveryToken,
    ReferralLedger,
    ReferralWallet,
    ReferralWithdrawal,
    Release,
    StoreSetting,
)
from store.schemas import (
    AdminAccountPatch,
    AdminCouponPatch,
    AdminCouponRequest,
    AdminEntitlementPatch,
    AdminEntitlementRequest,
    AdminLicensePatch,
    AdminLicenseRequest,
    AdminMailTestRequest,
    AdminOrderActionRequest,
    AdminOrderReviewRequest,
    AdminProductPatch,
    AdminProductRequest,
    AdminReleasePatch,
    AdminReleaseRequest,
    AdminSettingsRequest,
    AdminWalletAdjustRequest,
    AdminWithdrawalResolveRequest,
)
from store.security import (
    activation_code_hint,
    hash_password,
    is_valid_email,
    iso,
    iso_z,
    new_uuid,
    normalize_email,
    utcnow,
)  # noqa: F401
from store.serializers import (
    json_list,
    license_payload,
    list_json,
    order_payload,
    product_payload,
)

logger = logging.getLogger("store.admin")

router = APIRouter(prefix="/store-admin/v1", tags=["admin"])


def _naive_utc(value: datetime | None) -> datetime | None:
    """把后台传入的时间统一成 naive UTC。

    库内时间列都是 naive（见 models.py 的注释），若把带时区的 datetime 直接
    写进去，读出来的比较逻辑会因 tzinfo 混用而行为不一致。这里统一收口。
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _admin_actor(admin: AdminAccount) -> str:
    # ``Account`` 没有 ``username`` 列（历史遗留的假想字段）：写成
    # ``admin.email or admin.username`` 时，只要邮箱为空就直接 AttributeError，
    # 于是一个「资料不全的管理员」做任何操作都会 500，审计日志也永远写不进去。
    return admin.email or str(admin.id)


def _guard_self_lockout(account: Account, admin: AdminAccount, *, action: str) -> None:
    """不许管理员把自己关在门外（停用自己 / 取消自己的管理员权限）。

    用 409 而不是 400：请求本身完全合法，是它与「当前这个会话就是目标账号」
    这个状态冲突 —— 与文件里其它守卫（待支付订单不可删除、生效中的授权不可删除）
    保持同一口径，前端也不必为这一类拒绝单独分支。
    """
    if account.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"不能{action}。"
        )


def _guard_last_active_admin(session: Session, account: Account) -> None:
    """停用或降权一个**启用中的管理员**前，确认系统里还留得下至少一个管理员。

    没有这道守卫，最后一位管理员可以把自己关掉，后台从此进不去，只能直接改库
    救回来 —— 一个纯粹的运营自锁。判断的是「除他之外还有没有启用中的管理员」，
    所以对非管理员账号、或本来就已停用的账号直接放行。
    """
    if not (account.is_admin and account.is_active):
        return
    remaining = session.execute(
        select(func.count(Account.id)).where(
            Account.is_admin.is_(True),
            Account.is_active.is_(True),
            Account.id != account.id,
        )
    ).scalar_one()
    if not remaining:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="系统必须保留至少一个启用状态的管理员。",
        )


def _audit(session, actor: str, action: str, target: str = "", detail: str = "") -> None:
    session.add(AuditLog(actor=actor, action=action, target=target, detail=detail))
    session.flush()


def _product_or_404(session, product_id: str) -> Product:
    product = session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在。")
    return product


def _account_payload(session, account: Account) -> dict:
    """账号序列化。

    列表与「修改账号」共用同一份口径，避免同一行数据在两个接口里长得不一样。
    """
    wallet = session.scalars(
        select(ReferralWallet).where(ReferralWallet.account_id == account.id)
    ).first()
    return {
        "id": account.id,
        "email": account.email,
        "isAdmin": bool(account.is_admin),
        "isActive": bool(account.is_active),
        "emailVerifiedAt": iso(account.email_verified_at),
        "lastLoginAt": iso(account.last_login_at),
        "createdAt": iso(account.created_at),
        "referralCode": wallet.code if wallet else account.referral_code,
        "balance": money.format_centi(wallet.balance_centi) if wallet else "0.00",
        "licenseCount": int(
            session.execute(
                select(func.count(License.id)).where(License.account_id == account.id)
            ).scalar_one()
            or 0
        ),
    }


def _drop_account_sessions(session, account_id: str) -> int:
    """清掉某个账号的全部登录会话，返回删除条数。"""
    records = list(
        session.scalars(select(AccountSession).where(AccountSession.account_id == account_id))
    )
    for record in records:
        session.delete(record)
    return len(records)


def _cooldown(setting: StoreSetting, settings: SettingsDep) -> int:
    return site_config.resolve_device_release_cooldown(setting, settings)


# 概览
#: 营收与订单量按「滚动时间窗」统计，而不是「自然日」。后台没有站点时区配置，
#: 服务端算自然日只能用 UTC 或服务器本地时区，两者在运营眼里都是猜的；滚动窗口
#: 与运营所在时区无关，文案也直说「近 24 小时」，不会出现「今日营收怎么少了 8 小时」。
_OVERVIEW_WINDOWS: tuple[tuple[str, timedelta], ...] = (
    ("last24h", timedelta(hours=24)),
    ("last7d", timedelta(days=7)),
    ("last30d", timedelta(days=30)),
)

#: 真的收到过钱的状态。``pending`` 从未付款；``expired`` / ``cancelled`` /
#: ``payment_failed`` 的库存预留早已归还，不走支付成功路径；``fulfillment_failed``
#: 的钱是到账的（只是没发出去），所以必须计入。
#:
#: ``partially_refunded`` 同样必须在列：它表达的是「收到过钱、退了一部分、还有余额
#: 没退」，漏掉它会让一笔 10000 分、部分退 3000 的订单在营收里贡献 0（gross 记不到、
#: refund 也记不到），实际应为 7000。order_status.REFUNDABLE_STATUSES 用的是同一套
#: 口径，两处必须一致。
PAID_MONEY_STATUSES: tuple[str, ...] = (
    "paid",
    "fulfilled",
    "refunded",
    "partially_refunded",
    "fulfillment_failed",
)

#: 需要人工介入的授权临期窗口。
OVERVIEW_EXPIRING_DAYS = 30


def _billable_money_clause():
    """营收口径的过滤条件：**排除人工补记**（S8）。

    为什么需要一个条件而不是「按时长」：后台上「标记支付 / 履约」会给一张还没收到
    钱的订单盖上 ``paid_at``（客户催单、先放行、赠送补记都会走这一下），而营收按
    ``paid_at`` 汇总 —— 点一下就凭空空出一笔营收。所以人工补记的订单单独打标
    （``Order.manual_settlement``），照常发码但不计入营收。

    返回的是「可用在 ``.where()`` 里的子句」而不是一个布尔开关常量，是为了让
    三处 KPI（累计 gross/refund、时间窗、概览 netCents）不会各自漏掉它。
    """
    return Order.manual_settlement.is_(False)


def _window_money(session: Session, since: datetime) -> dict:
    """统计 ``[since, now)`` 内的收款、退款与付款订单数。

    口径说明（改这里之前先想清楚，后台三处 KPI 都读它）：

    * 时间归属按 ``paid_at``，不是 ``created_at``——「上周下单今天付款」的订单
      算今天的营收，因为它今天才让钱进账。
    * ``grossCents`` 是**订单实付**（已减优惠码），不是商品原价。
    * ``refundCents`` 是 ``refund_amount_cents``，支持部分退款，所以不能用
      「refunded 订单的实付额」来代替，否则部分退款会被当成全额退货。
    * 人工补记的订单不进 gross/refund，而是单列成 ``manualCents`` / ``manualOrders``
      （S8）：直接丢掉会让运营看不到「有多少单是人工放行的」，那才是真查不出来。
    """
    row = session.execute(
        select(
            func.coalesce(func.sum(Order.amount_cents), 0),
            func.coalesce(func.sum(Order.refund_amount_cents), 0),
            func.count(Order.id),
        ).where(
            Order.paid_at.is_not(None),
            Order.paid_at >= since,
            Order.status.in_(PAID_MONEY_STATUSES),
            _billable_money_clause(),
        )
    ).one()
    manual_row = session.execute(
        select(
            func.coalesce(func.sum(Order.amount_cents), 0),
            func.count(Order.id),
        ).where(
            Order.paid_at.is_not(None),
            Order.paid_at >= since,
            Order.status.in_(PAID_MONEY_STATUSES),
            Order.manual_settlement.is_(True),
        )
    ).one()
    gross = int(row[0] or 0)
    refunded = int(row[1] or 0)
    return {
        "grossCents": gross,
        "refundCents": refunded,
        "netCents": gross - refunded,
        "paidOrders": int(row[2] or 0),
        "manualCents": int(manual_row[0] or 0),
        "manualOrders": int(manual_row[1] or 0),
    }


@router.get("/overview")
def overview(session: DbSession, _admin: AdminAccount, settings: SettingsDep) -> dict:
    """经营看板数据。

    除了原来的累计数，这里补齐了「有时间维度的营收」「订单漏斗」「需要人工处理的
    待办」「库存/授权/积分的风险面」。后台概览页只读这一个接口，所以任何运营每天
    要看一眼的数字都应该在这里出现，而不是让人自己去各分页里数。
    """
    setting = site_config.get_setting(session)
    expire_stale_orders(session, settings)
    moment = utcnow()

    def count(statement) -> int:
        return int(session.execute(statement).scalar_one() or 0)

    # —— 累计数（保持既有键名，后台与外部集成方都在用）——
    total_gross = count(
        select(func.coalesce(func.sum(Order.amount_cents), 0)).where(
            Order.paid_at.is_not(None),
            Order.status.in_(PAID_MONEY_STATUSES),
            _billable_money_clause(),
        )
    )
    total_refunded = count(
        select(func.coalesce(func.sum(Order.refund_amount_cents), 0)).where(
            Order.paid_at.is_not(None),
            Order.status.in_(PAID_MONEY_STATUSES),
            _billable_money_clause(),
        )
    )
    # 人工补记（未收到钱）单独统计：不进营收，但必须看得见（S8）。
    total_manual = count(
        select(func.coalesce(func.sum(Order.amount_cents), 0)).where(
            Order.paid_at.is_not(None),
            Order.status.in_(PAID_MONEY_STATUSES),
            Order.manual_settlement.is_(True),
        )
    )

    # —— 时间窗营收 ——
    revenue = {"totalCents": total_gross - total_refunded, "totalGrossCents": total_gross,
               "totalRefundCents": total_refunded, "totalManualCents": total_manual,
               "currency": "CNY", "windows": []}
    for key, span in _OVERVIEW_WINDOWS:
        bucket = _window_money(session, moment - span)
        bucket["key"] = key
        revenue["windows"].append(bucket)

    # —— 订单漏斗 ——
    # 一次 group by 拿全部状态，避免 8 条 count 语句。缺失的状态补 0，前端才能按
    # ORDER_STATUS_CHOICES 稳定渲染（不能因为「一条 fulfilled 都没有」就少一格）。
    status_rows = session.execute(
        select(
            Order.status,
            func.count(Order.id),
            func.coalesce(func.sum(Order.amount_cents), 0),
        ).group_by(Order.status)
    ).all()
    by_status = {
        str(row[0]): {"count": int(row[1] or 0), "amountCents": int(row[2] or 0)}
        for row in status_rows
    }
    funnel = [
        {
            "status": code,
            "label": ORDER_STATUS_LABELS.get(code, code),
            "count": by_status.get(code, {}).get("count", 0),
            "amountCents": by_status.get(code, {}).get("amountCents", 0),
        }
        for code in ORDER_STATUS_CHOICES
    ]

    # —— 待办：需要人工介入的东西 ——
    # 「待发货」= 钱已到账但还没发出去。失败状态逐项单列，因为它们不是「排队等自动
    # 发货」，而是「自动发货炸了 / 付款没成、必须人工重试或退款」。
    # 清单来自 order_status.ORDER_ATTENTION_STATUSES（唯一定义）：这里按它计数，
    # 新增一个待办状态就不必记得回来改这一段。
    awaiting_fulfillment = count(
        select(func.count(Order.id)).where(
            Order.status == "paid", Order.fulfillment_mode == "automatic"
        )
    )
    attention_counts = {
        status: count(select(func.count(Order.id)).where(Order.status == status))
        for status in ORDER_ATTENTION_STATUSES
    }
    fulfillment_failed = attention_counts["fulfillment_failed"]
    payment_failed = attention_counts["payment_failed"]
    needs_review = count(
        select(func.count(Order.id)).where(Order.needs_review.is_(True))
    )

    expiring_licenses = list(
        session.scalars(
            select(License)
            .where(
                License.active.is_(True),
                License.access_expires_at.is_not(None),
                License.access_expires_at <= moment + timedelta(days=OVERVIEW_EXPIRING_DAYS),
            )
            .order_by(License.access_expires_at.asc())
            .limit(20)
        )
    )

    low_stock = list(
        session.scalars(
            select(Product)
            .where(
                Product.active.is_(True),
                Product.stock_quantity.is_not(None),
            )
            .order_by(Product.stock_quantity.asc())
            .limit(20)
        )
    )

    pending_withdrawal_rows = session.execute(
        select(
            func.count(ReferralWithdrawal.id),
            func.coalesce(func.sum(ReferralWithdrawal.net_points_centi), 0),
        ).where(ReferralWithdrawal.status == "pending")
    ).one()

    wallet_row = session.execute(
        select(
            func.count(ReferralWallet.id),
            func.coalesce(func.sum(ReferralWallet.balance_centi), 0),
            func.coalesce(func.sum(ReferralWallet.frozen_centi), 0),
        )
    ).one()

    return {
        # —— 累计 ——
        "accounts": count(select(func.count(Account.id))),
        "products": count(select(func.count(Product.id))),
        "licenses": count(select(func.count(License.id))),
        "activeLicenses": count(
            select(func.count(License.id)).where(License.active.is_(True))
        ),
        "pendingOrders": count(
            select(func.count(Order.id)).where(Order.status == "pending")
        ),
        "fulfilledOrders": count(
            select(func.count(Order.id)).where(Order.status == "fulfilled")
        ),
        "entitlements": count(select(func.count(Entitlement.id))),
        "activeEntitlements": count(
            select(func.count(Entitlement.id)).where(Entitlement.active.is_(True))
        ),
        # 净营收（已减退款）。它得覆盖全部已收款状态，所以不能只算 fulfilled。
        "revenueCents": total_gross - total_refunded,
        "pendingWithdrawals": int(pending_withdrawal_rows[0] or 0),
        "deviceBindings": count(
            select(func.count(DeviceBinding.id)).where(DeviceBinding.active.is_(True))
        ),
        "serverTime": iso_z(moment),
        "maintenanceMode": bool(setting.maintenance_mode),
        # 后台巡检（查单对账 / 关闭过期渠道交易）的存活状态。它坏掉时没有任何
        # 接口会报错——钱照收、单停在待支付——所以必须由概览主动把它摆出来。
        "paymentSweep": sweep_status(),
        # 被刻意吞掉的资金/履约异常计数（S36）。与巡检同理：这些异常不会让任何接口
        # 报错，只会让「钱收了、码没发」悄悄发生，所以必须主动摆出来。
        "incidents": incidents.status(),
        # —— 营收（含时间窗）——
        "revenue": revenue,
        # —— 订单漏斗 ——
        "orderFunnel": funnel,
        # —— 待办与风险 ——
        "attention": {
            "awaitingFulfillment": awaiting_fulfillment,
            "fulfillmentFailed": fulfillment_failed,
            "paymentFailed": payment_failed,
            "needsReview": needs_review,
            "expiringLicenses": len(expiring_licenses),
            "expiringWindowDays": OVERVIEW_EXPIRING_DAYS,
            "lowStock": len(low_stock),
            "pendingWithdrawals": int(pending_withdrawal_rows[0] or 0),
            "soldOut": count(
                select(func.count(Product.id)).where(
                    Product.active.is_(True),
                    Product.stock_quantity.is_not(None),
                    Product.stock_quantity <= 0,
                )
            ),
        },
        "expiringLicenses": [
            {
                "activationCodeId": item.id,
                "codeHint": item.code_hint,
                "productName": item.product_name,
                "productType": item.product_type,
                "accountId": item.account_id,
                "accessExpiresAt": iso_z(item.access_expires_at),
            }
            for item in expiring_licenses
        ],
        "lowStockProducts": [
            {
                "id": item.id,
                "name": item.name,
                "stockQuantity": int(item.stock_quantity or 0),
                "reservedStock": int(item.reserved_stock or 0),
                # 可售 = 库存 - 已被待支付/已付款订单占用的预留。这才是运营该看的数。
                "availableStock": max(0, int(item.stock_quantity or 0) - int(item.reserved_stock or 0)),
            }
            for item in low_stock
        ],
        # —— 积分负债 ——
        "referral": {
            # 冻结是「已申请提现、还没打款」，仍在 balance 里但用户动不了，
            # 所以可用 = balance - frozen。三者都要摆出来，只给 balance 会让
            # 运营以为要付的钱比实际多。
            "wallets": int(wallet_row[0] or 0),
            #: 对外仍是「两位小数字符串」，与改动前一致（厘是 1/100，无损）。
            #: 聚合值在库侧以厘求和（整数求和精确），只在出口渲染一次。
            "balancePoints": money.format_centi(wallet_row[1] or 0),
            "frozenPoints": money.format_centi(wallet_row[2] or 0),
            "availablePoints": money.format_centi(
                int(wallet_row[1] or 0) - int(wallet_row[2] or 0)
            ),
            "pendingWithdrawalPoints": money.format_centi(pending_withdrawal_rows[1] or 0),
        },
    }


# 维护动作
@router.post("/maintenance/recompute-stock")
def admin_recompute_stock(session: DbSession, admin: AdminAccount) -> dict:
    """按订单表重算各商品的 ``reserved_stock``。

    这个计数只是缓存，真实依据是仍处于 pending / paid 的订单条数。历史缺陷
    （对已取消订单履约）会重复释放预留，把缓存扣低并直接放开超卖——超卖以后
    没法自动回滚，只能人工处理。所以给运营一个显式入口把缓存拉回真实值。
    """
    changes = fulfill.recompute_reserved_stock(session)
    detail = "、".join(f"{pid} {delta:+d}" for pid, delta in changes.items()) or "无变化"
    _audit(session, _admin_actor(admin), "maintenance.recompute_stock", "", detail)
    return {"updated": len(changes), "changes": changes, "detail": detail}


@router.post("/incidents/ack")
def admin_ack_incidents(session: DbSession, admin: AdminAccount) -> dict:
    """确认（清零）资金/履约异常计数（S36）。

    为什么需要这个入口：这些计数是给监控报警用的，一次性的抖动会把它点亮，而它是
    进程内的 —— 除了重启服务没有别的办法按灭。按不灭的灯等于没有灯，所以给后台
    一个「我看到了、已处理」的按钮：清零计数，并把**清零前**的次数写进审计。
    """
    before = incidents.clear(actor=_admin_actor(admin))
    detail = (
        "、".join(f"{item['label']} {item['count']} 次" for item in before["kinds"])
        or "无异常"
    )
    _audit(
        session,
        _admin_actor(admin),
        "incidents.ack",
        "",
        f"清零 {before['total']} 次：{detail}",
    )
    return {"cleared": before["total"], "detail": detail, "incidents": incidents.status()}


# 商品
def _product_delete_refs(session) -> tuple[dict[str, int], dict[str, int]]:
    """统计每个商品被多少条授权 / 订单引用。

    这里的口径必须和 ``admin_delete_product`` 的守卫**完全一致**：不带
    ``active`` / ``status`` 过滤，因为守卫是「只要有任意一条引用就改为下架」。
    前台的 ``_product_stats`` 只数 fulfilled 订单和 active 授权，拿它当依据会让
    确认弹窗在「其实会被下架」的时候显示成「将被彻底删除」。
    """
    licenses = {
        product_id: int(count or 0)
        for product_id, count in session.execute(
            select(License.product_id, func.count(License.id)).group_by(License.product_id)
        ).all()
    }
    orders = {
        product_id: int(count or 0)
        for product_id, count in session.execute(
            select(Order.product_id, func.count(Order.id)).group_by(Order.product_id)
        ).all()
    }
    return licenses, orders


def _admin_product_context(session, product_ids=None) -> dict:
    """一次性查出列表渲染所需的所有辅助数据，避免逐行 N+1。

    ``product_ids`` 只影响 ``stats``：它的聚合条件可以收窄成 ``IN (...)``（S50），
    而 ``licenses`` / ``orders`` 这两个计数是**删除守卫**的依据，必须全表统计、
    不能按需裁剪 —— 见 :func:`_product_delete_refs` 的说明。
    """
    licenses, orders = _product_delete_refs(session)
    return {
        "stats": _product_stats(session, product_ids),
        "images": _image_map(session),
        "bundled": {item.id: item for item in session.scalars(select(Product))},
        "licenses": licenses,
        "orders": orders,
    }


def _product_admin_payload(session, product: Product, context: dict | None = None) -> dict:
    #: 单商品路径（新建/更新返回）也只统计这一张商品。
    context = context or _admin_product_context(session, [product.id])
    payload = product_payload(
        product,
        context["images"].get(product.id),
        bundled=context["bundled"],
        customer_count=int(context["stats"]["customer"].get(product.id, 0)),
        purchase_count=int(context["stats"]["purchase"].get(product.id, 0)),
    )
    # 后台比前台多几个运营字段
    payload["originalPriceCents"] = product.original_price_cents
    payload["requiresLicense"] = bool(product.requires_license)
    payload["note"] = product.note
    # 把删除守卫的判定依据原样交给前端，确认弹窗才能如实预告「真删」还是「下架」
    payload["licenseCount"] = int(context["licenses"].get(product.id, 0))
    payload["orderCount"] = int(context["orders"].get(product.id, 0))
    return payload


@router.get("/feature-codes")
def admin_feature_codes(_admin: AdminAccount) -> dict:
    """商品可选的功能码目录（中文名 + 说明）。

    目录定义在 ``store/features.py``，与主程序的能力码一一对应。后台下拉多选
    直接渲染它，运营不再手写代码，也就不会把 ``ha.control`` 抄成 ``ha.contorl``
    这种「不报错但客户端静默拦截」的隐性故障。
    """
    return features.feature_catalog_payload()


@router.get("/products")
def admin_list_products(
    session: DbSession,
    _admin: AdminAccount,
    keyword: str | None = None,
    status_filter: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """商品列表（分页 + 筛选）。

    删除守卫的依据（授权数 / 订单数）仍然按**全量**商品统计：它决定「能真删还是
    只能下架」，随分页变化会让确认弹窗的预告跟实际行为不一致。
    """
    base = select(Product)
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(
            or_(
                Product.name.like(like),
                Product.product_code.like(like),
                Product.feature_codes_json.like(like),
                Product.display_description.like(like),
            )
        )
    status_value = (status_filter or "").strip()
    if status_value == "active":
        base = base.where(Product.active.is_(True))
    elif status_value == "inactive":
        base = base.where(Product.active.is_(False))
    elif status_value == "soldout":
        base = base.where(
            Product.active.is_(True),
            Product.stock_quantity.is_not(None),
            Product.stock_quantity - Product.reserved_stock <= 0,
        )
    elif status_value == "lowstock":
        # 「低库存」没有全局阈值，这里取「可售 ≤ 5」这一运营常用口径；
        # 真实的分级预警在概览页按可售升序展示。
        base = base.where(
            Product.active.is_(True),
            Product.stock_quantity.is_not(None),
            Product.stock_quantity - Product.reserved_stock <= 5,
        )

    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = list(
        session.scalars(
            base.order_by(Product.sort_order, Product.created_at).limit(size).offset(skip)
        )
    )
    context = _admin_product_context(session, [product.id for product in rows])
    return {
        "items": [_product_admin_payload(session, product, context) for product in rows],
        "total": total,
        "limit": size,
        "offset": skip,
    }


def _assert_product_configuration(
    product_type: str,
    fulfillment_mode: str,
    feature_codes: list,
    included_product_ids: list,
) -> None:
    """校验商品的可枚举字段，并拦下「什么都不会发放」的套餐配置。

    1. **取值校验**（``store.catalog``）：``product_type`` / ``fulfillment_mode`` 直接决定下单走哪个
       分支、付款后自不自动发码，写错一个字母不会报错但会静默走错路；功能码同理，不在这里校验的话
       抄错的能力码会一路发到客户端然后被静默拦截。
    2. **可发放性**：履约时功能码有两个来源 —— 商品自己的 ``feature_codes``，以及套餐
       ``included_product_ids`` 展开出的功能码。两者都为空时用户付了钱却拿不到任何功能码，授权会在
       激活时因空功能集被 422 拒绝，所以这类错配必须尽早拦住。

    第 2 条只对 ``package`` 强制：单卖的主授权 / 增量包允许先建后补功能码（运营常常先建商品再配
    功能），而套餐的卖点就是「包含若干商品」，「既没有自己的功能码、也没包含任何商品」的套餐没有
    任何合法用途。
    """
    try:
        catalog.validate_product_type(product_type)
        catalog.validate_fulfillment_mode(fulfillment_mode)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error

    codes = [str(code).strip() for code in (feature_codes or []) if str(code).strip()]
    unknown = sorted({code for code in codes if code not in features.FEATURE_CODES})
    if unknown:
        # 能力码清单在主项目（``backend/app/license/service.py``）与
        # ``store/features.py`` 里各有一份、必须同步；抄错的码不会让任何一步报错，
        # 只会在客户端被静默拦截，所以宁可在这里拒绝。
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"功能码 {'、'.join(unknown)} 不在能力目录里，客户端不会认它。"
                "请从「功能码」选择器里勾选。"
            ),
        )

    if str(product_type or "").strip() != "package":
        return
    if codes:
        return
    if [str(item).strip() for item in (included_product_ids or []) if str(item).strip()]:
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="套餐必须填写功能码，或指定「套餐包含商品 ID」，否则发货后客户端拿不到任何能力。",
    )


@router.post("/products")
def admin_create_product(
    payload: AdminProductRequest, session: DbSession, admin: AdminAccount
) -> dict:
    _assert_product_configuration(
        payload.product_type,
        payload.fulfillment_mode,
        payload.feature_codes,
        payload.included_product_ids,
    )
    product = Product(
        name=payload.name,
        product_code=payload.product_code or "homeos",
        price_cents=payload.price_cents,
        original_price_cents=payload.original_price_cents,
        is_full_price=payload.is_full_price,
        validity_days=payload.validity_days,
        product_type=payload.product_type,
        feature_codes_json=list_json(payload.feature_codes),
        included_product_ids_json=list_json(payload.included_product_ids),
        package_contents_locked=payload.package_contents_locked,
        active=payload.active,
        note=payload.note,
        display_description=payload.display_description,
        badge_text=payload.badge_text,
        featured=payload.featured,
        sort_order=payload.sort_order,
        fulfillment_mode=payload.fulfillment_mode,
        stock_quantity=payload.stock_quantity,
        requires_license=payload.requires_license,
    )
    session.add(product)
    session.flush()
    _audit(session, _admin_actor(admin), "product.create", product.id, product.name)
    return _product_admin_payload(session, product)


@router.patch("/products/{product_id}")
def admin_update_product(
    product_id: str, payload: AdminProductPatch, session: DbSession, admin: AdminAccount
) -> dict:
    product = _product_or_404(session, product_id)
    mapping = {
        "name": "name",
        "product_code": "product_code",
        "price_cents": "price_cents",
        "original_price_cents": "original_price_cents",
        "is_full_price": "is_full_price",
        "validity_days": "validity_days",
        "product_type": "product_type",
        "package_contents_locked": "package_contents_locked",
        "active": "active",
        "note": "note",
        "display_description": "display_description",
        "badge_text": "badge_text",
        "featured": "featured",
        "sort_order": "sort_order",
        "fulfillment_mode": "fulfillment_mode",
        "stock_quantity": "stock_quantity",
        "requires_license": "requires_license",
    }
    data = payload.model_dump(exclude_unset=True)
    for field, column in mapping.items():
        if field in data:
            setattr(product, column, data[field])
    # product_code 是结算与授权里的产品标识，绝不能留空（留空会让下游按空标识建授权）
    if not product.product_code:
        product.product_code = "homeos"
    if "feature_codes" in data:
        product.feature_codes_json = list_json(data["feature_codes"] or [])
    if "included_product_ids" in data:
        product.included_product_ids_json = list_json(data["included_product_ids"] or [])
    _assert_product_configuration(
        product.product_type,
        product.fulfillment_mode,
        json_list(product.feature_codes_json),
        json_list(product.included_product_ids_json),
    )
    session.flush()
    _audit(session, _admin_actor(admin), "product.update", product.id)
    return _product_admin_payload(session, product)


@router.delete("/products/{product_id}")
def admin_delete_product(
    product_id: str, session: DbSession, admin: AdminAccount, settings: SettingsDep
) -> dict:
    product = _product_or_404(session, product_id)

    # 有历史授权或订单的商品只下架，不做物理删除，避免历史数据悬空。
    # 注意 Order.product_id 是 NOT NULL 外键且没有 ondelete，而 SQLite 连接上开了
    # foreign_keys=ON，所以只要有订单引用该商品，物理删除就会撞 FK 约束直接 500。
    # 计数复用 _product_delete_refs，保证和列表接口暴露给前端的 licenseCount /
    # orderCount 是同一套口径，确认弹窗的预告不会和实际结果打架。
    license_counts, order_counts = _product_delete_refs(session)
    license_count = int(license_counts.get(product.id, 0))
    order_count = int(order_counts.get(product.id, 0))

    if license_count or order_count:
        product.active = False
        parts = []
        if license_count:
            parts.append(f"{license_count} 条授权")
        if order_count:
            parts.append(f"{order_count} 笔订单")
        reason = "、".join(parts) + "引用该商品，改为下架"
        session.flush()
        _audit(session, _admin_actor(admin), "product.deactivate", product.id, reason)
        return {
            "id": product.id,
            "deleted": False,
            "deactivated": True,
            "licenses": license_count,
            "orders": order_count,
            "reason": reason,
        }

    # 物理删除：数据库里 product_images 是 ON DELETE CASCADE，但磁盘上的图片文件
    # 不会被连带清理，这里先把路径收集出来，删完行之后再把文件删掉。
    # 路径必须过 _safe_image_target —— 这是本函数原先唯一漏掉边界校验的文件操作。
    image_paths = [
        image.path
        for image in session.scalars(
            select(ProductImage).where(ProductImage.product_id == product.id)
        )
        if image.path
    ]

    session.delete(product)
    session.flush()
    image_root = settings.product_images_dir.resolve()
    for raw_path in image_paths:
        target = _safe_image_target(image_root, raw_path)
        if target is None:
            logger.warning("商品图片路径越界，跳过文件删除：%s", raw_path)
            continue
        try:
            target.unlink(missing_ok=True)
        except OSError:  # pragma: no cover - 文件被占用/权限问题时不该影响删除结果
            logger.warning("商品图文件删除失败：%s", target)

    _audit(session, _admin_actor(admin), "product.delete", product.id, product.name)
    return {"id": product_id, "deleted": True, "deactivated": False}


#: 商品图上传的体积上限。
IMAGE_MAX_BYTES = 8 * 1024 * 1024


def _image_suffix(content: bytes) -> str | None:
    """按**字节**判断图片格式，返回落盘用的后缀（不认识就 ``None``）。

    为什么不能只看文件名后缀（S37）：后缀是调用方随便写的，把 SVG 改名成 ``.png`` 就绕过了白名单；
    而落盘之后静态目录是**按后缀**回 ``Content-Type`` 的，于是「白名单」与「实际回给浏览器的类型」
    说的不是一件事。

    为什么是「按内容派生后缀」而不是「校验后缀与内容一致」：后者会把「一张 JPEG 存成了 logo.png」
    变成一次报错，而用户并不关心文件名叫什么。内容是什么就存成什么，静态目录的 ``Content-Type``
    才与字节一致（改名换格式的场景由调用方清理旧文件）。

    只认四种有明确签名的格式，刻意**不含 SVG**：它是能内嵌 ``<script>`` 的 XML，而商品图是按原样
    回给浏览器的同源资源 —— 上传一个 SVG 就等于在商店域下拿到一个可执行的 XSS 落点。图标需求用 PNG。
    """
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content[:6] in {b"GIF87a", b"GIF89a"}:
        return ".gif"
    # WebP 是 RIFF 容器：0-4 是 "RIFF"，8-12 是 "WEBP"（中间 4 字节是长度）
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    return None


@router.post("/products/{product_id}/image")
def admin_upload_product_image(
    product_id: str,
    request: Request,
    session: DbSession,
    admin: AdminAccount,
    file: UploadFile = File(...),
) -> dict:
    """上传商品自定义图片（同步端点，跑在线程池里）。

    写成同步 ``def``：读文件、校验大小、落盘、写库全是阻塞操作，而这个端点的
    上传上限是 8MB —— 放事件循环上，一次慢盘写入就能卡住整个服务。
    同步端点里用 ``file.file``（底层 SpooledTemporaryFile）同步读取即可，
    不需要 ``await file.read()``。
    """
    product = _product_or_404(session, product_id)
    settings = request.app.state.settings
    folder = settings.product_images_dir
    folder.mkdir(parents=True, exist_ok=True)

    # 先按上限 + 1 字节读：超限时我们已经知道「超了」，不需要把整个文件读进内存。
    # 读满上限才可能落盘，所以这一次 read 的内存占用被硬封顶。
    content = file.file.read(IMAGE_MAX_BYTES + 1)
    if len(content) > IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="图片不能超过 8MB。",
        )

    # 格式**按内容判定**（S37），不看文件名 —— 见 ``_image_suffix`` 的说明。
    suffix = _image_suffix(content)
    if suffix is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "只支持 PNG / JPEG / WebP / GIF 图片（按文件内容识别，与文件名无关）。"
                "SVG 不支持：它是能内嵌脚本的 XML，而商品图是按原样回给浏览器的同源资源。"
            ),
        )

    relative = f"{product.id}{suffix}"
    target = folder / relative

    image = session.scalars(
        select(ProductImage).where(ProductImage.product_id == product.id)
    ).first()
    # 换格式（png → jpg）时旧文件名不再被引用，先删掉，否则磁盘上会留孤儿文件。
    # 路径是上传时自己按 product.id + 白名单后缀拼的，但仍然按目录边界校验一次
    # （与另外两处删除点共用同一份判定，见 _safe_image_target）。
    if image is not None and image.path != relative:
        stale = _safe_image_target(folder, image.path)
        if stale is not None and stale.is_file():
            try:
                stale.unlink()
            except OSError as exc:
                logger.warning("清理旧商品图失败 %s：%s", stale, exc)

    target.write_bytes(content)

    version = secrets.token_hex(6)
    if image is None:
        image = ProductImage(product_id=product.id, path=relative, version=version)
        session.add(image)
    else:
        image.path = relative
        image.version = version
    image.updated_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "product.image", product.id, relative)
    return {"id": product.id, "imageUrl": f"/store/v1/product-images/{product.id}?v={version}"}


# 订单
#: 允许被后台标记支付 / 履约的状态。参见 ``store.order_status``：
#: 只有仍持有库存预留的订单才谈得上「入账」。终态订单一律拒绝——
#: cancelled / expired 的库存与优惠码名额早已释放，refunded 的授权也已收回，
#: 对它们履约等于凭空发一张可用授权，还会重复扣减预留并造成超卖。
#: 钱确实到账的「复活」场景由支付宝结算路径处理，不走后台接口。
_FULFILLABLE_STATUSES = ORDER_FULFILLABLE_STATUSES

#: 订单状态中文口径统一来自 ``store.order_status``（服务端唯一来源），
#: 避免「后台弹窗说 cancelled、页面显示已取消」这种同一状态两套说法。
#: 取文案一律走 ``order_status_label()`` 或 ``ORDER_STATUS_LABELS``（后者用于
#: 批量拼列表），不要在后台再留一份「本地副本」——P9 删掉的 `_ORDER_STATUS_LABELS`
#: 就是那样一份没人读的别名。


def _status_label(status: str) -> str:
    return order_status_label(status)


@router.get("/orders")
def admin_list_orders(
    session: DbSession,
    _admin: AdminAccount,
    settings: SettingsDep,
    status_filter: str | None = None,
    keyword: str | None = None,
    needs_review: bool | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    """订单列表（分页 + 筛选）。

    ``status_filter`` 支持多状态，用逗号分隔（例如 ``paid,fulfillment_failed``）——
    概览看板的「待发货」待办就靠它一次带出两类需要人工推进的订单。

    日期区间按 ``created_at`` 过滤，边界都含。时间参数由前端按本地时区算好再转
    UTC 传出，服务端只做 naive UTC 归一（见 ``_naive_utc``）。
    """
    expire_stale_orders(session, settings)
    base = select(Order)
    wanted = [part.strip() for part in (status_filter or "").split(",") if part.strip()]
    if wanted:
        base = base.where(Order.status.in_(wanted))
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(
            or_(Order.order_no.like(like), Order.email.like(like), Order.product_name.like(like))
        )
    if needs_review:
        base = base.where(Order.needs_review.is_(True))
    start = _naive_utc(date_from)
    if start is not None:
        base = base.where(Order.created_at >= start)
    end = _naive_utc(date_to)
    if end is not None:
        base = base.where(Order.created_at <= end)
    return _page(
        session,
        base,
        (Order.created_at.desc(),),
        limit=limit,
        offset=offset,
        # 删除守卫的第三条判据（渠道交易是否已确认关闭）前端拿不到，这里补进列表，
        # 让「能不能删」只有一个口径 —— 否则按钮会照常显示、点下去才 409。
        # ``paymentProvider`` 同理：人工标记支付的订单（manual）只能线下退款，前端要靠
        # 它把退款确认框的文案换成「线下退款」，不能只说「确认退款」就把钱记成已退。
        render=lambda row: {
            **order_payload(row),
            "channelPayable": channel_still_payable(row),
            "paymentProvider": row.payment_provider or "",
        },
    )


def _fulfill_with_failure_state(
    session: Session, *, order: Order, setting: StoreSetting, actor: str
) -> dict:
    """履约并处理失败：抛异常时把订单标记为 ``fulfillment_failed`` 而不是 500。

    用 SAVEPOINT 包住履约，失败只回滚这一段的写入（已发的半张授权、扣掉的库存、
    记上的邀请奖励），订单本身仍占着库存预留与优惠码名额 —— 因为货并没有真的
    发出去。这样状态机是自洽的：``fulfillment_failed`` 既在
    ``RESERVING_STATUSES``（预留未归还）又在 ``FULFILLABLE_STATUSES``（可以重试），
    运营点「履约」就能重来，点「退款」也能正常退。

    过去这里没有兜底：履约抛异常直接 500，订单停在 ``paid``，而且没有任何地方
    记录「这张单发不出去」，只能靠错误日志发现。
    """
    try:
        with session.begin_nested():
            fulfill.fulfill_order(session, order=order, setting=setting)
    except Exception as error:  # noqa: BLE001 - 兜底转成可运营的状态
        reason = str(error).strip() or error.__class__.__name__
        session.execute(
            update(Order)
            .where(Order.id == order.id)
            .where(Order.status != "refunded")
            .values(
                status="fulfillment_failed",
                # 履约入口会把 fulfilled_at 抢先写上做幂等闸门，SAVEPOINT 回滚后
                # 库里已是旧值；这里再显式清一次，避免重试被判成「已完成」。
                fulfilled_at=None,
                needs_review=True,
                review_note=f"履约失败：{reason[:230]}",
            )
            .execution_options(synchronize_session=False)
        )
        session.flush()
        _audit(session, actor, "order.fulfill_failed", order.order_no, reason[:200])
        logger.exception("后台履约失败 order=%s", order.order_no)
        session.refresh(order)
        return order_payload(order)
    session.refresh(order)
    _audit(session, actor, "order.fulfill", order.order_no)
    return order_payload(order)


@router.post("/orders/{order_no}/mark-paid")
def admin_mark_paid(
    order_no: str, session: DbSession, admin: AdminAccount
) -> dict:
    """人工补记：把订单放行（发码），但**不计入营收**（S8）。

    这个按钮最常见的用法是「客户催单、钱还没到，先放行」和「赠送/补偿」，这几种
    情况下账上并没有钱。以前它会盖上 ``paid_at``，而营收按 ``paid_at`` 汇总 ——
    点一下就凭空多出一笔营收，且事后分不清哪些是人工补的。现在它同时置
    ``manual_settlement``，营收口径（``_billable_money_clause``）把这类订单排除，
    概览里单列成 ``manualCents`` / ``manualOrders``，订单行上也会标注。

    **钱确实收到了**（线下转账、现金）请用 ``settle-offline``：那才是把人工收到的
    钱计入营收的入口。两个入口分开而不是加一个布尔参数，是为了让「这一下算不算
    营收」写在 URL 与审计动作里，事后查账不用去翻请求体。
    """
    return _manual_payment(session, order_no, admin=admin, manual_settlement=True)


@router.post("/orders/{order_no}/settle-offline")
def admin_settle_offline(
    order_no: str, session: DbSession, admin: AdminAccount
) -> dict:
    """线下收款入账：人工确认这笔钱**已经收到**（转账/现金），计入营收。

    与 ``mark-paid`` 的唯一差别是营收口径：``manual_settlement=False``。金额仍按
    订单实付记，审计动作是独立的 ``order.settle_offline``，所以「某笔营收是人确认过
    的」在审计日志里查得到 —— 渠道确认过钱的订单不会留下这条动作。
    """
    return _manual_payment(session, order_no, admin=admin, manual_settlement=False)


def _manual_payment(
    session: Session, order_no: str, *, admin: AdminAccount, manual_settlement: bool
) -> dict:
    """``mark-paid`` / ``settle-offline`` 的共用实现。

    两处必须逐字节一致：状态守卫、条件 UPDATE 抢单、履约分流（``manual`` 模式停在
    ``paid`` 等人核对）—— 任何一处只改一个入口，就会出现「同样一张单，从哪个按钮点
    进去行为不同」。
    """
    setting = site_config.get_setting(session)
    order = order_or_404(session, order_no)
    if order.status == "fulfilled":
        return order_payload(order)
    # payment_failed 不在这里补标记：该状态在支付失败时已释放库存预留与优惠码
    # 名额，再标记支付并履约会造成二次扣减。
    if order.status not in _FULFILLABLE_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"订单状态为 {order.status}，无法标记支付。")
    # 条件 UPDATE 抢单：后台按钮可以双击、也可能与「履约」按钮并发点击。
    # 只靠上面的读判断的话，两个请求各自把订单标成 paid 并各发一次码。
    result = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(Order.status.in_(_FULFILLABLE_STATUSES))
        .values(
            status="paid",
            paid_at=order.paid_at or utcnow(),
            payment_provider=order.payment_provider or "manual",
            manual_settlement=manual_settlement,
        )
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        session.refresh(order)
        logger.info("标记支付重复提交，已忽略 order=%s status=%s", order.order_no, order.status)
        return order_payload(order)
    session.refresh(order)
    _audit(
        session,
        _admin_actor(admin),
        "order.mark_paid" if manual_settlement else "order.settle_offline",
        order.order_no,
        "" if manual_settlement else "人工确认已收到钱（线下），计入营收",
    )
    # 自动发卡商品立刻履约（发码 / 追加增量包 / 邀请奖励）。
    # 手动发卡商品只标记已支付，把发码留给「履约」按钮——两条支付路径必须一致：
    # 真实支付宝到账（settle_paid_order）也是见到 manual 就停在 paid 等人核对，
    # 后台这边一按就发码的话，"人工发卡"这道闸门等于不存在。
    if order.fulfillment_mode != "manual":
        return _fulfill_with_failure_state(
            session, order=order, setting=setting, actor=_admin_actor(admin)
        )
    session.refresh(order)
    return order_payload(order)


@router.post("/orders/{order_no}/fulfill")
def admin_fulfill(order_no: str, session: DbSession, admin: AdminAccount) -> dict:
    setting = site_config.get_setting(session)
    order = order_or_404(session, order_no)
    if order.status == "fulfilled":
        return order_payload(order)
    # 终态订单不能履约：cancelled / expired 的库存与优惠码名额早已释放，
    # refunded 的授权已收回。放行会凭空发码，并重复扣减预留造成超卖。
    if order.status not in _FULFILLABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"订单状态为{_status_label(order.status)}，不能履约；"
                "只有待付款或已付款的订单可以履约。"
            ),
        )
    if order.paid_at is None:
        # 只补时间戳，不碰状态：状态流转与幂等由 fulfill_order 的条件 UPDATE 负责。
        # 同时置人工补记标记（S8）：这里也是「没收到钱就放行」的一条路 —— 例如
        # 手动发卡的订单直接点「履约」。不标记的话，一笔钱根本没到的订单会因为
        # 这个按钮进入营收。
        session.execute(
            update(Order)
            .where(Order.id == order.id)
            .where(Order.paid_at.is_(None))
            .values(paid_at=utcnow(), manual_settlement=True)
            .execution_options(synchronize_session=False)
        )
        session.refresh(order)
    return _fulfill_with_failure_state(
        session, order=order, setting=setting, actor=_admin_actor(admin)
    )


@router.post("/orders/{order_no}/review")
def admin_review_order(
    order_no: str, payload: AdminOrderReviewRequest, session: DbSession, admin: AdminAccount
) -> dict:
    """把订单的「待复核」标记清掉（人工已处理）。

    ``needs_review`` 目前唯一的来源是「订单超时关闭后支付才到账」的复活单 ——
    钱收了、码也发了，但那一件库存早已还给别人，需要人确认补货还是退款。
    只有置位路径（``settle_paid_order`` / 履约失败）而**没有任何清除路径**时，
    概览页那条待办会永久挂着：第 10 单之后运营就再也看不见它了，告警等于失效。

    刻意**不**在履约成功时自动清除：复活单的价值就在于让人看见「这单超卖过」，
    必须由人确认（哪怕确认的结论是「不用处理」）。所以这里要求订单已经不在
    ``pending``：钱还没到账的单谈不上「已处理」。

    清标记同时把复核结论追加进 ``review_note``（保留原因，不覆盖）：事后复盘
    「这单当时为什么放行」只能靠它。
    """
    order = order_or_404(session, order_no)
    if order.status == "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="订单尚未支付，没有需要处理的复核事项。",
        )
    if not order.needs_review:
        #: 幂等：重复点击（两个标签页、误触）不该报错，也不该覆盖上一个人的结论。
        return order_payload(order)

    previous = (order.review_note or "").strip()
    note = (payload.note or "").strip()
    stamp = utcnow().strftime("%Y-%m-%d %H:%M UTC")
    order.needs_review = False
    #: 保留原始原因而不是清空：这一栏是「这单为什么被标出来」的唯一记录，
    #: 清掉之后几天后回头看就只剩一句「已处理」，等于把线索删了。
    order.review_note = (
        f"{previous}｜{stamp} 已处理：{note}" if note else f"{previous}｜{stamp} 已处理"
    )[:255]
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "order.review",
        order.order_no,
        note[:200] or "标记为已处理",
    )
    session.refresh(order)
    return order_payload(order)


#: 同一订单的退款必须串行执行。渠道退款是**不可逆的资金动作**，而退款接口是「读累计值 →
#: 调渠道 → 写累计值」的形状：两个并发请求（双击按钮、两个标签页、两位客服同时操作）会各自
#: 读到同一个 ``refund_amount_cents``、各自把同一笔钱退给用户，而累计值只加一次 —— 钱多退
#: 一倍，账面却显示只退了一笔。
#:
#: 为什么不用「条件 UPDATE 抢单」当闸门：闸门必须在**调渠道之前**取得，而那一刻请求事务还没
#: 写过任何东西；条件 UPDATE 会把 SQLite 的写锁一直攥到请求结束，也就是在整个网络往返期间阻塞
#: 所有下单。放到调渠道之后又拦不住第二次调用。所以用进程内锁把同一订单串起来：不占数据库写锁，
#: 正好覆盖「同一进程内并发」这个真实场景；跨进程的残余窗口由 ``_claim_refund_amount`` 兜住
#: （不静默吞掉）。
#:
#: 每个订单号一把进程内锁，**带引用计数**：没有计数的话这个字典只增不减 —— 每来一笔新订单就
#: 永久留下一个 Lock 对象，站点跑上几个月就是一条缓慢但确定的内存泄漏。最后一个使用者退出时
#: 把表项删掉。
_refund_locks: dict[str, list] = {}
_refund_locks_guard = threading.Lock()


@contextmanager
def _refund_lock(order_no: str) -> Iterator[None]:
    """按订单号取一把进程内互斥锁，保证同一订单的退款不会交叠。"""
    with _refund_locks_guard:
        entry = _refund_locks.get(order_no)
        if entry is None:
            entry = [threading.Lock(), 0]
            _refund_locks[order_no] = entry
        lock, holders = entry[0], entry[1]
        entry[1] = holders + 1
    lock.acquire()
    try:
        yield
    finally:
        lock.release()
        with _refund_locks_guard:
            entry = _refund_locks.get(order_no)
            #: 只在「还是同一把锁」时才动计数：期间可能有人把表项删掉重建了。
            if entry is not None and entry[0] is lock:
                if entry[1] <= 1:
                    del _refund_locks[order_no]
                else:
                    entry[1] -= 1


def _claim_refund_amount(
    session: Session, order: Order, *, seen_cents: int, add_cents: int
) -> bool:
    """把本次退款金额并进累计值，条件是「累计值仍是本次读到的那个」。

    与 ``expire_stale_orders`` 同一套抢单套路：只有还能看到 ``seen_cents`` 的
    一方才有资格写。``refund_amount_cents`` 是可空列，用 ``coalesce`` 兜住历史
    数据里的 NULL（``NULL = 0`` 在 SQL 里不成立，漏掉会让老订单永远抢不到）。
    """
    claimed = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(func.coalesce(Order.refund_amount_cents, 0) == seen_cents)
        .values(refund_amount_cents=seen_cents + add_cents)
        .execution_options(synchronize_session=False)
    )
    return claimed.rowcount == 1


@router.post("/orders/{order_no}/refund")
def admin_refund(
    order_no: str,
    payload: AdminOrderActionRequest,
    request: Request,
    session: DbSession,
    admin: AdminAccount,
) -> dict:
    """后台退款。真正的逻辑在 ``_refund_order``，这里只负责把同一订单的退款串行化。"""
    with _refund_lock(order_no):
        result = _refund_order(order_no, payload, request, session, admin)
        # 必须在本进程锁**之内**把抢单结果与流水落库。请求会话的 commit 发生在
        # 依赖 teardown（见 store.database.Database.session），那时锁早就释放了：
        # 第二笔并发退款会读到同一个旧累计值，于是两次渠道退款都发出去、两次
        # 抢单也都成立 —— 钱多退一倍。teardown 的 commit 之后是空操作。
        session.commit()
        return result


def _refund_order(
    order_no: str,
    payload: AdminOrderActionRequest,
    request: Request,
    session: Session,
    admin: AdminAccount,
) -> dict:
    setting = site_config.get_setting(session)
    order = order_or_404(session, order_no)
    if order.status not in ORDER_REFUNDABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"订单状态为{_status_label(order.status)}，无法退款。",
        )

    total_cents = max(0, int(order.amount_cents or 0))
    refunded_cents = max(0, int(order.refund_amount_cents or 0))
    remaining_cents = refundable_cents(total_cents, refunded_cents)
    if remaining_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"该订单已全额退款 ¥{refunded_cents / 100:.2f}，没有可退余额。",
        )

    # 不传金额 = 退掉剩余全部（与历史上「一退就退全款」的行为保持一致）
    amount_cents = remaining_cents if payload.amount_cents is None else int(payload.amount_cents)
    if amount_cents > remaining_cents:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"退款金额超出可退余额：本次最多可退 ¥{remaining_cents / 100:.2f}"
                f"（订单 ¥{total_cents / 100:.2f}，已退 ¥{refunded_cents / 100:.2f}）。"
            ),
        )

    refund_reason = (payload.note or f"订单 {order.order_no} 后台退款")[:255]

    #: 人工标记支付的订单（以及没记渠道 / 渠道名已失效的老订单）在渠道侧没有可退的
    #: 交易：必须按**线下退款**记账，绝不能回落到「当前站点配置的渠道」——配模拟收银台
    #: 时会「退成功」却分文未动（S47）。这里不抛 409：这类订单本来就只能线下退，
    #: 拒绝只会让运营在后台点不动退款按钮。改为自动改走线下，并把原因写进审计与流水。
    forced_offline = _offline_refund_reason(order)
    offline_refund = bool(payload.offline) or bool(forced_offline)
    if forced_offline and not payload.offline:
        logger.warning(
            "退款按线下处理 order=%s：%s（未走任何支付渠道）", order.order_no, forced_offline
        )
        refund_reason = f"{refund_reason}｜{forced_offline}，按线下退款记账"[:255]

    # 幂等键必须**每次退款动作都不同**。写成 RF{订单号} 的话，支付宝会把第二次
    # 部分退款当成「同一笔退款」直接返回上次结果 —— 钱没退出去，本地却记成已退。
    out_request_no = f"RF{order.order_no}-{new_uuid()[:8]}"[:128]
    refund = OrderRefund(
        order_id=order.id,
        order_no=order.order_no,
        out_request_no=out_request_no,
        amount_cents=amount_cents,
        reason=refund_reason,
        offline=offline_refund,
        operator=_admin_actor(admin),
        status="failed",
    )
    # 先不加进请求事务：失败路径要靠独立事务落库，而已经绑在请求会话上的对象
    # 再挂到新会话会报「object already attached to session」。

    refund_trade_no: str | None = None
    refund_detail = ""
    #: 渠道**实际**退回的金额。渠道可能只退了一部分（unrefunded_cents > 0），
    #: 记账必须按实际数字，否则账面营收会被多减。
    settled_cents = amount_cents

    if amount_cents > 0 and not offline_refund:
        # 关键：退款必须真的把钱退回去。这里过去只改本地状态，界面显示「已退款」
        # 而钱仍在商户账户：账面上营收消失了，用户却没收到退款。
        # 网关/渠道失败一律 409 且**不改任何状态**，绝不出现「状态改了、钱没退」。
        provider = _refund_provider(
            request.app.state.resolve_payment_provider,
            order=order,
            setting=setting,
        )
        try:
            result = provider.refund_payment(
                order=order,
                amount_cents=amount_cents,
                reason=refund_reason,
                out_request_no=out_request_no,
                settings=request.app.state.settings,
                setting=setting,
            )
        except PaymentError as error:
            # 失败也要留痕：否则「退了几次都没成功」这件事在库里查不出来。
            # 注意这里必须用独立事务 —— 下面抛的 409 会让请求事务整体回滚，
            # 共用事务的话这条流水会被一起抹掉，等于没记。
            refund.detail = str(error)[:255]
            record_refund_in_new_session(session, refund)
            logger.warning("退款被渠道拒绝 order=%s: %s", order.order_no, error)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
        if not result.ok:
            refund.detail = (result.detail or "支付渠道未确认退款成功。")[:255]
            record_refund_in_new_session(session, refund)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=result.detail or "支付渠道未确认退款成功。",
            )
        refund_trade_no = result.trade_no
        refund_detail = result.detail
        # 渠道只退了一部分时按实际金额入账，并把差额如实告诉运营 ——
        # 过去这种情况直接 409 拒绝，连「退了多少」都没记下来。
        settled_cents = max(0, amount_cents - int(result.unrefunded_cents or 0))

    # 渠道确认「本次没有新增资金变动」时 settled_cents 会是 0（``fund_change=N`` /
    # ``refund_fee=0``）。这不是一次成功的退款，而是「这笔钱早就退过了」——绝不能
    # 因此把订单推进 ``partially_refunded``（那会让一笔资金未动的订单显示成退过钱，
    # 还会连带把预留归还掉）。只留一条流水并如实告知运营，订单状态保持原样。
    if settled_cents <= 0:
        refund.status = "succeeded"
        refund.amount_cents = 0
        refund.trade_no = refund_trade_no
        refund.detail = (refund_detail or "渠道确认本次无新增资金变动。")[:255]
        session.add(refund)
        session.flush()
        _audit(
            session,
            _admin_actor(admin),
            "order.refund",
            order.order_no,
            f"未产生资金变动（{refund_detail or '该笔可能已退过款'}）"
            + ("（线下退款）" if offline_refund else "")
            + (f" 幂等号 {out_request_no}" if not offline_refund else "")
            + (f" 渠道单号 {refund_trade_no}" if refund_trade_no else ""),
        )
        session.refresh(order)
        return order_payload(order)

    # 走到这里渠道已经确认退款（或本来就是线下退款），可以安全地并入请求事务。
    # 先抢单把本次金额并进累计值，再落流水 —— 两者必须同生共死，否则审计流水会
    # 与订单上的累计值对不上。
    cumulative_cents = refunded_cents + settled_cents
    if not _claim_refund_amount(
        session, order, seen_cents=refunded_cents, add_cents=settled_cents
    ):
        # 抢单失败：本次渠道退款**已经发出去了**，但本地累计值在「读」与「写」之间
        # 被另一笔退款改动过（进程内锁没覆盖到的跨进程并发）。这里绝不能静默把本次
        # 覆盖掉 —— 覆盖等于那笔钱从账面上消失；也不能只回一句 409 让人以为没退。
        # 先在独立事务里把流水留下，再明确告知需要人工核对。
        # 先回滚请求事务：它此刻可能已持有写锁，独立事务会写不进去（而这条流水
        # 恰恰是最不能丢的那条）。回滚也会把还没落库的 refund 对象退成游离态，
        # 正好满足 record_refund_in_new_session 的要求。
        session.rollback()
        refund.status = "succeeded"
        refund.amount_cents = settled_cents
        refund.trade_no = refund_trade_no
        refund.detail = (
            f"{refund_detail} 本地记账冲突：累计值已不是 ¥{refunded_cents / 100:.2f}，"
            f"本次渠道退款 ¥{settled_cents / 100:.2f} 待人工核对。"
        )[:255]
        record_refund_in_new_session(session, refund)
        logger.error(
            "退款记账抢单失败（渠道已退款）order=%s out_request_no=%s settled=%s",
            order.order_no,
            out_request_no,
            settled_cents,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"渠道已退出 ¥{settled_cents / 100:.2f}，但本地退款累计值被并发改动，"
                "为避免重复记账已中止。请到「退款流水」核对这笔后手工处理。"
            ),
        )

    session.add(refund)
    refund.status = "succeeded"
    refund.amount_cents = settled_cents
    refund.trade_no = refund_trade_no
    refund.detail = refund_detail[:255]
    if refund_trade_no:
        order.refund_trade_no = refund_trade_no

    # 预留归还的判定必须用**退款前**的状态，且对部分退款同样生效：
    # ``partially_refunded`` 不在 RESERVING_STATUSES 里，订单一旦离开那些状态，
    # 就再没人负责归还这一件预留了（漏掉等于这件货永久卖不出去）。
    if order.status in {"paid", "fulfillment_failed"}:
        product = session.get(Product, order.product_id) if order.product_id else None
        fulfill.release_order_reservation(session, order=order, product=product)

    fully_refunded = total_cents > 0 and cumulative_cents >= total_cents
    if fully_refunded:
        # 全额退完才收回授权、回退邀请奖励、把订单推进终态。
        # 部分退款只记录资金流出：客户仍然持有（且我们仍然欠着）那张授权。
        _revoke_order_entitlements(session, order)
        referrals.reverse_order_reward(
            session, order=order, note=f"订单 {order.order_no} 退款，奖励退回"
        )
        order.status = "refunded"
        order.refunded_at = utcnow()
    else:
        order.status = "partially_refunded"

    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "order.refund",
        order.order_no,
        (
            f"退款 ¥{settled_cents / 100:.2f}（累计 ¥{cumulative_cents / 100:.2f}"
            f" / 订单 ¥{total_cents / 100:.2f}）"
            + ("（线下退款）" if offline_refund else "")
            + (f" 幂等号 {out_request_no}" if not offline_refund else "")
            + (f" 渠道单号 {refund_trade_no}" if refund_trade_no else "")
            + (f" {refund_detail}" if refund_detail else "")
            + (f" 备注：{refund_reason}" if (payload.note or forced_offline) else "")
        ),
    )
    session.refresh(order)
    return order_payload(order)


def _revoke_order_entitlements(session, order: Order) -> None:
    """收回订单产生的激活码与权益（全额退款时调用）。

    两种情况必须分开处理，因为它们的**权属**完全不同：

    * ``issue``（本单发了一张新授权）→ 这张码就是本单的产物，整张作废；
    * ``upgrade`` / ``patch``（本单改的是用户**此前已经付过钱**的那张授权）→
      只能还原成改动前的样子。整张作废等于没收了他原来那笔消费，而什么都不做
      则是「钱退了、永久授权还在手里」—— 后者是过去真实存在的漏洞：这类授权的
      ``License.order_id`` 仍指向最早那张订单，按 ``order_id`` 找根本找不到它。
    """
    if (
        order.license_action in {"upgrade", "patch"}
        and order.license_id
        and (order.license_state_before_json or "").strip()
    ):
        license = session.get(License, order.license_id)
        if license is not None and fulfill.revert_license_change(
            session, order=order, license=license
        ):
            session.flush()
            return

    for license in session.scalars(select(License).where(License.order_id == order.id)):
        license.active = False
        license.revoked_at = utcnow()
        # 同 license.deactivate：多设备绑定要全部释放，不能只处理 .first()
        for binding in session.scalars(
            select(DeviceBinding).where(DeviceBinding.license_id == license.id)
        ):
            binding.active = False
            binding.released_at = utcnow()
    for entitlement in session.scalars(
        select(Entitlement).where(Entitlement.product_id == order.product_id)
    ):
        if entitlement.license_id and entitlement.license_id == order.license_id:
            entitlement.active = False


def _offline_refund_reason(order: Order) -> str:
    """这笔退款为什么**只能**按线下处理（渠道侧没有可退的交易）；无需强制时返回空串。

    后台「标记支付」的订单（:func:`admin_mark_paid`）把 ``payment_provider`` 记成
    ``manual``。这类订单在渠道侧**根本不存在交易**，过去却会回落到「当前站点配置的
    渠道」去退：

    * 配支付宝 → 报「交易不存在」，运营看到一条看不懂的 409；
    * 配模拟收银台 → 直接「退成功」，于是账面上凭空多出一笔已退款、还写上了渠道单号，
      而钱一分没动 —— 这正是审计里那条「假称已退款却无资金流动」。

    没记下单渠道、或渠道名已不在受支持列表里的老订单同理：无从判断该打哪个网关，
    只能按线下退款如实记账。
    """
    provider = normalize_provider_name(order.payment_provider)
    if provider == "manual":
        return "该订单是后台人工标记支付的（渠道侧没有这笔交易）"
    if not provider:
        return "该订单没有记录下单渠道，无从判断该退到哪个渠道"
    if provider not in PROVIDER_NAMES:
        return f"该订单的下单渠道「{provider}」不是受支持的渠道"
    return ""


def _refund_provider(resolver, *, order: Order, setting):
    """按**订单下单时**的渠道退款，而不是当前站点配置的渠道。

    运营中途把渠道从支付宝切到模拟收银台（或反过来）后，用当前渠道去退老订单
    会打到错误的网关：要么报「交易不存在」，要么（模拟渠道）直接「退成功」。
    所以优先按 ``order.payment_provider`` 找渠道实现。

    能走到这里的订单，渠道名必然在受支持列表内：``manual`` / 未知渠道由
    :func:`_offline_refund_reason` 提前拦下、改走线下退款，不会再落到「当前渠道」。
    """
    order_provider = normalize_provider_name(order.payment_provider)
    if order_provider in PROVIDER_NAMES:
        return resolver(setting, name=order_provider)
    return resolver(setting)


@router.get("/orders/{order_no}/refunds")
def admin_list_order_refunds(
    order_no: str, session: DbSession, _admin: AdminAccount
) -> dict:
    """某张订单的退款流水（含被渠道拒绝的尝试）。

    支持多次部分退款之后，「这张单到底退了几次、每次多少钱」必须能一眼查到，
    否则对账只能靠翻审计日志里的自由文本。
    """
    order = order_or_404(session, order_no)
    rows = session.scalars(
        select(OrderRefund)
        .where(OrderRefund.order_id == order.id)
        .order_by(OrderRefund.created_at.desc())
    ).all()
    total_cents = int(order.amount_cents or 0)
    refunded_cents = int(order.refund_amount_cents or 0)
    return {
        "orderNo": order.order_no,
        "amountCents": total_cents,
        "refundedCents": refunded_cents,
        "refundableCents": max(0, total_cents - refunded_cents),
        "items": [
            {
                "id": row.id,
                "amountCents": int(row.amount_cents or 0),
                "status": row.status,
                "offline": bool(row.offline),
                "tradeNo": row.trade_no,
                "outRequestNo": row.out_request_no,
                "reason": row.reason,
                "detail": row.detail,
                "operator": row.operator,
                "createdAt": iso_z(row.created_at),
            }
            for row in rows
        ],
    }


@router.post("/orders/{order_no}/cancel")
def admin_cancel(
    order_no: str, payload: AdminOrderActionRequest, session: DbSession, admin: AdminAccount
) -> dict:
    order = order_or_404(session, order_no)
    if order.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="只有待支付订单可以取消。")
    product = session.get(Product, order.product_id) if order.product_id else None
    # 条件 UPDATE 抢单：取消与超时扫描/支付入账可能同时发生，只有把订单从
    # pending 推走的那一个请求才释放预留与优惠码名额。
    if not fulfill.close_pending_order(session, order=order, product=product):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="订单状态已变更，请刷新后重试。"
        )
    session.flush()
    _audit(session, _admin_actor(admin), "order.cancel", order.order_no, payload.note)
    session.refresh(order)
    return order_payload(order)


@router.delete("/orders/{order_no}")
def admin_delete_order(order_no: str, session: DbSession, admin: AdminAccount) -> dict:
    """删除订单（用于清理测试单 / 垃圾单）。

    订单是营收与授权来源的凭证，所以只允许删除**确定没有动过任何授权**的历史单据：状态必须是终态
    ``cancelled`` / ``expired``（待支付单请先取消，才会释放库存）；``license_id`` 为空 —— 这一单
    没有发出过授权（``License.order_id`` 是 ON DELETE SET NULL，删掉订单会静默切断授权与来源订单
    的溯源）；``license_state_before_json`` 为空 —— 这一单没有改过别人已有的授权；渠道交易已确认
    关闭（``channel_still_payable`` 为假，见下面的支付宝说明）。

    注意**不能**拿 ``target_license_id`` 当判据：增量包（addon）与升级单在**下单时**就会写入这一列，
    指向用户已持有、被选作目标的那张授权 —— 它表达的是「这单打算改谁」，而不是「这单已经改过谁」。
    已取消 / 已过期的这类订单从未履约（履约会把 ``license_id`` 与快照一起写上并推进
    ``fulfilled``），把「指向某张授权」当成「已关联授权」会让所有增购 / 升级的垃圾单永远删不掉。

    已付款 / 已履约的订单请走「退款」，用退款保留资金流水的可追溯性。

    支付宝还有一道额外守卫：本地订单过期 / 取消**不代表**渠道那笔预下单交易结束，用户手机上那个旧
    二维码仍然能付款。这种单删掉，延迟到账的钱就再也没有凭证（异步通知按订单号查不到，只会打一条
    error 日志；巡检的回看窗口也已经过去）。
    """
    order = order_or_404(session, order_no)

    if order.status not in {"cancelled", "expired"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"状态为 {order.status} 的订单不能删除；待支付请先取消，已支付请走退款。",
        )
    if order.license_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该订单已关联授权，不能删除；如需收回授权请使用退款。",
        )
    if order.license_state_before_json:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该订单改动过一张已有授权（升级/增量包），不能删除；如需还原请使用退款。",
        )
    if channel_still_payable(order):
        # 删掉之后钱进来就再没有任何凭证：异步通知找不到订单号只会打 error 日志，
        # 巡检的回看窗口也已覆盖过它（见 ``channel_still_payable``）。
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "该订单的支付宝交易尚未确认关闭，用户手上那个旧二维码仍可能被付款；"
                "删除会让一笔延迟到账的付款失去凭证。请等对账巡检关单后再删除"
                f"（下单后 {CLOSE_LOOKBACK_HOURS} 小时内巡检会持续重试）。"
            ),
        )

    session.delete(order)
    session.flush()
    _audit(session, _admin_actor(admin), "order.delete", order_no, f"状态 {order.status}")
    return {"orderNo": order_no, "deleted": True}


# 激活码
@router.get("/licenses")
def admin_list_licenses(
    session: DbSession,
    settings: SettingsDep,
    _admin: AdminAccount,
    keyword: str | None = None,
    status_filter: str | None = None,
    expiring_days: int | None = None,
    account_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """激活码列表（分页 + 筛选）。

    这里没有直接套 ``_page``：``_license_payload`` 需要账号、设备绑定与最近一次
    解绑时间，逐行去查就是 N+1。所以先取出本页的行，再一次性交给
    ``_license_meta`` 批量补齐（``_count_rows`` 负责 total）。
    """
    base = select(License)
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(
            or_(
                License.activation_code.like(like),
                License.code_hint.like(like),
                License.product_name.like(like),
                License.user_label.like(like),
            )
        )
    status_value = (status_filter or "").strip()
    if status_value == "active":
        base = base.where(License.active.is_(True))
    elif status_value == "inactive":
        base = base.where(License.active.is_(False))
    if account_id:
        base = base.where(License.account_id == account_id)
    if expiring_days is not None:
        # 只圈「还没过期、但 N 天内过期」的：已经过期的授权不属于「临期提醒」，
        # 混进来会让运营误以为还有救。
        moment = utcnow()
        base = base.where(
            License.access_expires_at.is_not(None),
            License.access_expires_at >= moment,
            License.access_expires_at <= moment + timedelta(days=max(1, int(expiring_days))),
        )

    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = list(session.scalars(base.order_by(License.created_at.desc()).limit(size).offset(skip)))
    meta = _license_meta(session, rows)
    setting = site_config.get_setting(session)
    return {
        "items": [
            license_payload(
                license,
                customer=meta.get(license.id, {}).get("customer"),
                binding=meta.get(license.id, {}).get("binding"),
                cooldown_seconds=_cooldown(setting, settings),
                last_released_at=meta.get(license.id, {}).get("last_released_at"),
            )
            for license in rows
        ],
        "total": total,
        "limit": size,
        "offset": skip,
    }


@router.post("/licenses")
def admin_issue_license(
    payload: AdminLicenseRequest, session: DbSession, admin: AdminAccount
) -> dict:
    product = _product_or_404(session, payload.product_id)
    email = payload.email.strip().lower()
    account = session.scalars(select(Account).where(func.lower(Account.email) == email)).first()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="该邮箱尚未注册账号。")
    customer = session.scalars(
        select(Customer).where(Customer.account_id == account.id)
    ).first()
    if customer is None:
        customer = Customer(account_id=account.id, email=email, name=email)
        session.add(customer)
        session.flush()

    moment = utcnow()
    validity_days = payload.validity_days if payload.validity_days is not None else product.validity_days

    def build(code: str) -> License:
        return License(
            activation_code=code,
            code_hint=activation_code_hint(code),
            customer_id=customer.id,
            account_id=account.id,
            product_id=product.id,
            product_name=product.name,
            product_type=product.product_type,
            price_cents=product.price_cents,
            validity_days=validity_days,
            issuance_source="manual",
            active=True,
            issued_at=moment,
            access_started_at=moment,
            access_expires_at=(
                moment + timedelta(days=int(validity_days)) if validity_days else None
            ),
        )

    # 与订单履约走同一条「撞码重试」路径（S35），否则同一种冲突在这里是 500、
    # 在那里是自动重试，两个入口的可靠性不一样。
    license = fulfill.insert_license_with_unique_code(session, build)
    # 审计只记 id + 提示码，**绝不落激活码明文**：激活码就是这张授权的凭证，
    # 审计日志会在后台列表里长期展示、也常被导出/转发，等于把它抄了一份到
    # 一个没有访问控制的地方。列表页自己也只用 code_hint。
    _audit(
        session,
        _admin_actor(admin),
        "license.issue",
        license.id,
        f"{license.code_hint}（人工签发）",
    )
    # 后台签发成功后要在一个常驻面板里展示结果，所以把「给谁、什么商品、有效期到哪天」
    # 一并返回，省得前端再发一次列表查询去凑（列表还带分页，不一定含这一条）。
    return {
        "activationCodeId": license.id,
        # 明文取自这一行本身（``activation_code`` 列存的就是明文，激活要按它查；
        # 脱敏提示码另存 ``code_hint``）。后台签发是一次性展示，返回它是刻意的。
        "activationCode": license.activation_code,
        "email": email,
        "productName": license.product_name,
        "accessExpiresAt": iso_z(license.access_expires_at),
        "validityDays": validity_days,
    }


@router.post("/licenses/{license_id}/deactivate")
def admin_deactivate_license(
    license_id: str, payload: AdminOrderActionRequest, session: DbSession, admin: AdminAccount
) -> dict:
    license = session.get(License, license_id)
    if license is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")
    license.active = False
    license.revoked_at = utcnow()
    # 一条授权可能在多台设备上绑定过（每个 instance_id 一行），停用必须把它们
    # 全部释放。只释放 .first() 会留下仍为 active 的绑定行，既让客户端以为还
    # 能用，也会让「删除授权」的活跃绑定守卫形同虚设。
    for binding in session.scalars(
        select(DeviceBinding).where(DeviceBinding.license_id == license.id)
    ):
        binding.active = False
        binding.released_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "license.deactivate", license.id, payload.note)
    return {"activationCodeId": license.id, "active": False}


@router.post("/licenses/{license_id}/activate")
def admin_activate_license(license_id: str, session: DbSession, admin: AdminAccount) -> dict:
    license = session.get(License, license_id)
    if license is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")
    license.active = True
    license.revoked_at = None
    session.flush()
    _audit(session, _admin_actor(admin), "license.activate", license.id)
    return {"activationCodeId": license.id, "active": True}


@router.delete("/licenses/{license_id}")
def admin_delete_license(license_id: str, session: DbSession, admin: AdminAccount) -> dict:
    """彻底删除一条授权（含级联的权益、绑定、租约与会话）。

    这是不可恢复操作，所以两道守卫：
      1. 必须**先停用**——强制「停用 → 再删」两步，避免误点直接抹掉在用授权；
      2. 不允许存在仍然活跃的设备绑定（说明还有设备在用）。
    ``orders.license_id`` / ``orders.target_license_id`` 是 ON DELETE SET NULL，
    订单本身会保留，只是不再指向这条授权。
    """
    license = session.get(License, license_id)
    if license is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")

    if license.active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="请先停用该授权，确认无设备在用后再删除。",
        )

    active_binding = session.scalars(
        select(DeviceBinding).where(
            DeviceBinding.license_id == license.id, DeviceBinding.active.is_(True)
        )
    ).first()
    if active_binding is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该授权仍有活跃设备绑定，请先强制解绑。",
        )

    code_hint = license.code_hint
    binding_count = int(
        session.execute(
            select(func.count(DeviceBinding.id)).where(DeviceBinding.license_id == license.id)
        ).scalar_one()
        or 0
    )
    session.delete(license)
    session.flush()
    # 只留提示码：审计日志不该成为激活码的第二份副本（见 license.issue 处的说明）
    _audit(
        session,
        _admin_actor(admin),
        "license.delete",
        license_id,
        f"{code_hint}（连带清理 {binding_count} 条绑定记录）",
    )
    return {"activationCodeId": license_id, "deleted": True, "bindings": binding_count}


# 设备绑定
@router.get("/bindings")
def admin_list_bindings(
    session: DbSession,
    _admin: AdminAccount,
    active_only: bool = False,
    keyword: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """设备绑定列表（分页 + 筛选）。

    ``keyword`` 命中实例号 / 客户端版本 / IP / 激活码提示，排障时按客户端上报的
    实例号或 IP 直接搜比翻页快得多。``serializers`` 里没有绑定载荷，所以这里的
    render 自己拼；激活码提示走本页预取的 License 映射，避免逐行 session.get。
    """
    base = select(DeviceBinding)
    if active_only:
        base = base.where(DeviceBinding.active.is_(True))
    if keyword:
        like = f"%{keyword.strip()}%"
        # 激活码提示也要能搜到：docstring 与后台搜索框都承诺了这一点，但这里的
        # 条件一直只有实例号 / 版本 / IP。排障时手上拿到的往往正是客户报过来的
        # 那段提示码（``HOMEOS-****-1234``），搜不到就只能一条条翻页。
        hinted_license_ids = select(License.id).where(
            or_(License.activation_code.like(like), License.code_hint.like(like))
        )
        base = base.where(
            or_(
                DeviceBinding.instance_id.like(like),
                DeviceBinding.client_version.like(like),
                DeviceBinding.last_ip.like(like),
                DeviceBinding.license_id.in_(hinted_license_ids),
            )
        )

    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = list(
        session.scalars(
            base.order_by(DeviceBinding.updated_at.desc()).limit(size).offset(skip)
        )
    )
    license_ids = {row.license_id for row in rows}
    hints = {
        license.id: license.code_hint
        for license in session.scalars(select(License).where(License.id.in_(license_ids or {""})))
    }
    items = [
        {
            "bindingId": binding.id,
            "licenseId": binding.license_id,
            "activationCodeHint": hints.get(binding.license_id),
            "instanceId": binding.instance_id,
            "clientVersion": binding.client_version,
            "lastIp": binding.last_ip,
            "active": bool(binding.active),
            "activatedAt": iso_z(binding.activated_at),
            "lastHeartbeatAt": iso_z(binding.last_heartbeat_at),
            "releasedAt": iso_z(binding.released_at),
        }
        for binding in rows
    ]
    return {"items": items, "total": total, "limit": size, "offset": skip}


@router.post("/bindings/{binding_id}/release")
def admin_release_binding(
    binding_id: str, payload: AdminOrderActionRequest, session: DbSession, admin: AdminAccount
) -> dict:
    binding = session.get(DeviceBinding, binding_id)
    if binding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="设备绑定不存在。")
    license = session.get(License, binding.license_id)
    account_id = license.account_id if license is not None else None
    binding.active = False
    binding.released_at = utcnow()
    session.add(
        DeviceReleaseEvent(
            license_id=binding.license_id,
            account_id=account_id,
            instance_id=binding.instance_id,
            source="admin",
        )
    )
    if account_id:
        account = session.get(Account, account_id)
        if account is not None:
            account.last_device_release_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "binding.release", binding.id, payload.note)
    return {"bindingId": binding.id, "released": True}


# 优惠码
@router.get("/coupons")
def admin_list_coupons(
    session: DbSession,
    _admin: AdminAccount,
    keyword: str | None = None,
    status_filter: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """优惠码列表（分页 + 筛选）。

    ``redemptionCount`` 需要数核销记录，所以只对**本页**的优惠码做一次
    ``in_`` 分组统计，而不是全表 ``group by``——优惠码多起来以后全表统计
    会随表增长变慢，而界面一页只看得到 200 条。
    """
    base = select(Coupon)
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(
            or_(Coupon.code.like(like), Coupon.description.like(like))
        )
    status_value = (status_filter or "").strip()
    moment = utcnow()
    if status_value == "active":
        base = base.where(Coupon.active.is_(True))
    elif status_value == "inactive":
        base = base.where(Coupon.active.is_(False))
    elif status_value == "expired":
        base = base.where(Coupon.expires_at.is_not(None), Coupon.expires_at < moment)
    elif status_value == "scheduled":
        base = base.where(Coupon.starts_at.is_not(None), Coupon.starts_at > moment)

    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = list(session.scalars(base.order_by(Coupon.created_at.desc()).limit(size).offset(skip)))
    counts = _coupon_redemption_counts(session, [row.id for row in rows])
    return {
        "items": [_coupon_payload(coupon, counts.get(coupon.id, 0)) for coupon in rows],
        "total": total,
        "limit": size,
        "offset": skip,
    }


def _coupon_redemption_counts(session, coupon_ids=None) -> dict[str, int]:
    """按核销记录表统计每个优惠码的实际用量。

    刻意不用 ``Coupon.redeemed_count`` 这个反规范化计数列：它是发放时的快照，
    一旦和 ``coupon_redemptions`` 漂移，删除守卫（数记录）与界面提示（读计数列）
    就会各说各话——确认弹窗写着「尚未被使用」，点下去却只停用。

    ``coupon_ids`` 给出时只统计这些码（列表页用它把全表 group by 降成本页
    ``in_`` 统计）；为 None 时统计全部（导出/校验等场景）。
    """
    statement = select(
        CouponRedemption.coupon_id, func.count(CouponRedemption.id)
    ).group_by(CouponRedemption.coupon_id)
    if coupon_ids is not None:
        ids = [str(item) for item in coupon_ids]
        if not ids:
            return {}
        statement = statement.where(CouponRedemption.coupon_id.in_(ids))
    return {
        coupon_id: int(count or 0)
        for coupon_id, count in session.execute(statement).all()
    }


def _coupon_redemption_count(session, coupon_id: str) -> int:
    """单个优惠码的核销数（供非列表场景复用，避免全表 group by）。"""
    return int(
        session.execute(
            select(func.count(CouponRedemption.id)).where(
                CouponRedemption.coupon_id == coupon_id
            )
        ).scalar_one()
        or 0
    )


def _coupon_payload(coupon: Coupon, redemption_count: int) -> dict:
    """优惠码的后台视图。

    两个「用量」字段刻意分开，因为它们回答的是两个不同问题：

    * ``redeemedCount``（读 ``coupon.redeemed_count`` 计数列）—— **此刻还被占用
      多少名额**，参与 ``max_redemptions`` 校验。取消/退款会让它回落。
    * ``redemptionCount``（数 ``coupon_redemptions`` 记录）—— **历史上被占用过
      多少次**，作为对账凭证永久保留，也是删除守卫的判据。

    把两者混成一个字段，就会出现「确认弹窗写着没人用过、点下去却只停用」。
    """
    return {
        "id": coupon.id,
        "code": coupon.code,
        "description": coupon.description,
        "discountType": coupon.discount_type,
        "percent": float(coupon.percent or 0.0),
        "amountCents": int(coupon.amount_cents or 0),
        "minAmountCents": int(coupon.min_amount_cents or 0),
        "maxRedemptions": coupon.max_redemptions,
        "redeemedCount": int(coupon.redeemed_count or 0),
        "redemptionCount": int(redemption_count),
        "perAccountLimit": int(coupon.per_account_limit or 0),
        "applicableProductIds": [
            str(item) for item in json_list(coupon.applicable_product_ids_json)
        ],
        "startsAt": iso(coupon.starts_at),
        "expiresAt": iso(coupon.expires_at),
        "active": bool(coupon.active),
        "createdAt": iso(coupon.created_at),
    }


@router.post("/coupons")
def admin_create_coupon(
    payload: AdminCouponRequest, session: DbSession, admin: AdminAccount
) -> dict:
    code = payload.code.strip().upper()
    if payload.discount_type not in coupons.DISCOUNT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"折扣类型只能是 {'/'.join(sorted(coupons.DISCOUNT_TYPES))}。",
        )
    exists = session.scalars(select(Coupon).where(func.upper(Coupon.code) == code)).first()
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="优惠码已存在。")
    coupon = Coupon(
        code=code,
        description=payload.description,
        discount_type=payload.discount_type,
        percent=payload.percent,
        amount_cents=payload.amount_cents,
        min_amount_cents=payload.min_amount_cents,
        max_redemptions=payload.max_redemptions,
        per_account_limit=payload.per_account_limit,
        starts_at=_naive_utc(payload.starts_at),
        expires_at=_naive_utc(payload.expires_at),
        applicable_product_ids_json=list_json(payload.applicable_product_ids),
        active=payload.active,
    )
    if coupon.starts_at and coupon.expires_at and coupon.starts_at >= coupon.expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="开始时间必须早于结束时间。"
        )
    session.add(coupon)
    session.flush()
    _audit(session, _admin_actor(admin), "coupon.create", coupon.id, code)
    return _coupon_payload(coupon, 0)


@router.delete("/coupons/{coupon_id}")
def admin_delete_coupon(coupon_id: str, session: DbSession, admin: AdminAccount) -> dict:
    """删除优惠码。

    ``coupon_redemptions`` 对优惠码是 ON DELETE CASCADE，物理删会把兑换历史一起
    抹掉。所以只有**从未被使用**的优惠码才真删；用过的只能停用，保住核销记录。
    """
    coupon = session.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="优惠码不存在。")

    redemption_count = _coupon_redemption_count(session, coupon.id)
    if redemption_count:
        coupon.active = False
        reason = f"该优惠码已被使用 {redemption_count} 次，已停用而非删除"
        session.flush()
        _audit(session, _admin_actor(admin), "coupon.deactivate", coupon.id, reason)
        return {
            "id": coupon.id,
            "deleted": False,
            "deactivated": True,
            "reason": reason,
            "redemptions": redemption_count,
        }

    code = coupon.code
    session.delete(coupon)
    session.flush()
    _audit(session, _admin_actor(admin), "coupon.delete", coupon_id, code)
    return {"id": coupon_id, "deleted": True, "deactivated": False}


@router.patch("/coupons/{coupon_id}")
def admin_patch_coupon(
    coupon_id: str, payload: AdminCouponPatch, session: DbSession, admin: AdminAccount
) -> dict:
    """编辑优惠码（含启用 / 停用）。

    除了 ``code`` 本身（它是对外承诺，改了会让已发放的码失效）以外，
    其余字段都允许修正：折扣、门槛、名额、有效期、适用范围。
    核销记录不会被删除，``redeemed_count`` 始终是唯一的用量口径。
    """
    coupon = session.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="优惠码不存在。")

    data = payload.model_dump(exclude_unset=True)
    if "discount_type" in data and data["discount_type"] not in coupons.DISCOUNT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"折扣类型只能是 {'/'.join(sorted(coupons.DISCOUNT_TYPES))}。",
        )

    # 换了折扣类型就把另一种折扣的残留值清零。两个字段同时有非零值时，结算只认
    # discount_type，但后台会把两个数字都显示出来，运营看不出哪个在生效。
    # 两个列都是 NOT NULL 且默认 0，所以这里是归零、不是置空。
    if "discount_type" in data:
        if data["discount_type"] == "fixed":
            data.setdefault("percent", 0.0)
        else:
            data.setdefault("amount_cents", 0)

    # 名额是反规范化的用量计数，改到低于已核销数会让"剩余名额"变成负数，
    # 表面上像还能用、实际永远校验不过。这种情况直接拒绝并说明该怎么改。
    redeemed = _coupon_redemption_count(session, coupon.id)
    if data.get("max_redemptions") is not None and int(data["max_redemptions"]) < redeemed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"该优惠码已核销 {redeemed} 次，名额不能改到 {data['max_redemptions']} 以下。"
                "想立刻停发请直接停用。"
            ),
        )

    mapping = {
        "description": "description",
        "discount_type": "discount_type",
        "percent": "percent",
        "amount_cents": "amount_cents",
        "min_amount_cents": "min_amount_cents",
        "max_redemptions": "max_redemptions",
        "per_account_limit": "per_account_limit",
        "active": "active",
    }
    changed: list[str] = []
    for field, column in mapping.items():
        if field in data:
            setattr(coupon, column, data[field])
            changed.append(field)
    for field, column in (("starts_at", "starts_at"), ("expires_at", "expires_at")):
        if field in data:
            setattr(coupon, column, _naive_utc(data[field]))
            changed.append(field)
    if "applicable_product_ids" in data:
        coupon.applicable_product_ids_json = list_json(data["applicable_product_ids"])
        changed.append("applicable_product_ids")

    if not changed:
        return _coupon_payload(coupon, _coupon_redemption_count(session, coupon.id))

    if coupon.starts_at and coupon.expires_at and coupon.starts_at >= coupon.expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="开始时间必须早于结束时间。"
        )

    session.flush()
    _audit(session, _admin_actor(admin), "coupon.update", coupon.id, ",".join(sorted(changed)))
    return _coupon_payload(coupon, _coupon_redemption_count(session, coupon.id))


# 提现审核
@router.get("/withdrawals")
def admin_list_withdrawals(
    session: DbSession,
    _admin: AdminAccount,
    status_filter: str | None = None,
    keyword: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """提现申请列表（分页 + 筛选）。

    ``keyword`` 命中账号邮箱：运营手里通常只有用户报的邮箱，
    让他自己在几百条里翻既慢又容易看错行。
    """
    base = select(ReferralWithdrawal)
    if status_filter:
        base = base.where(ReferralWithdrawal.status == status_filter)
    if keyword:
        like = f"%{keyword.strip()}%"
        matched = select(Account.id).where(Account.email.like(like))
        base = base.where(ReferralWithdrawal.account_id.in_(matched))

    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = list(
        session.scalars(
            base.order_by(ReferralWithdrawal.created_at.desc()).limit(size).offset(skip)
        )
    )
    account_ids = {row.account_id for row in rows}
    emails = {
        account.id: account.email
        for account in session.scalars(
            select(Account).where(Account.id.in_(account_ids or {""}))
        )
    }
    items = [
        {
            "id": row.id,
            "accountId": row.account_id,
            "email": emails.get(row.account_id),
            "points": money.format_centi(row.points_centi),
            "feePoints": money.format_centi(row.fee_points_centi),
            "feePercent": float(money.from_centi(row.fee_bps)),
            "netPoints": money.format_centi(row.net_points_centi),
            "status": row.status,
            "note": row.note,
            "createdAt": iso_z(row.created_at),
            "resolvedAt": iso_z(row.resolved_at),
        }
        for row in rows
    ]
    return {"items": items, "total": total, "limit": size, "offset": skip}


@router.post("/withdrawals/{withdrawal_id}/resolve")
def admin_resolve_withdrawal(
    withdrawal_id: str,
    payload: AdminWithdrawalResolveRequest,
    session: DbSession,
    admin: AdminAccount,
) -> dict:
    withdrawal = session.get(ReferralWithdrawal, withdrawal_id)
    if withdrawal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="提现申请不存在。")
    if withdrawal.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该申请已处理。")
    referrals.resolve_withdrawal(
        session, withdrawal, approve=payload.approve, note=payload.note
    )
    _audit(
        session,
        _admin_actor(admin),
        "withdrawal.resolve",
        withdrawal.id,
        f"approve={payload.approve}",
    )
    return {"id": withdrawal.id, "status": withdrawal.status}


@router.delete("/withdrawals/{withdrawal_id}")
def admin_delete_withdrawal(
    withdrawal_id: str, session: DbSession, admin: AdminAccount
) -> dict:
    """删除提现申请记录（仅限**已结算**的申请）。

    待审核（pending）的申请带着被冻结的积分，删掉会让冻结额度对不上账，
    所以必须先通过或驳回。已结算的申请删除后，积分流水（referral_ledger）
    仍然保留，资金审计不受影响。
    """
    withdrawal = session.get(ReferralWithdrawal, withdrawal_id)
    if withdrawal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="提现申请不存在。")

    if withdrawal.status == "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="待审核的申请不能删除；请先通过或驳回，以退回/结算冻结积分。",
        )

    status_label = withdrawal.status
    points = money.format_centi(withdrawal.points_centi)
    session.delete(withdrawal)
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "withdrawal.delete",
        withdrawal_id,
        f"{status_label} · {points} 积分",
    )
    return {"id": withdrawal_id, "deleted": True}


# 站点配置
def _alipay_settings_payload(settings: SettingsDep, setting) -> dict:
    return alipay_credentials_summary(settings, setting)


def _mail_settings_payload(settings: SettingsDep, setting) -> dict:
    return mail_settings.mail_delivery_summary(settings, setting)


def _settings_response(setting, settings: SettingsDep) -> dict:
    """``GET/PUT /settings`` 的统一响应体。

    两个入口必须返回**同一个形状**：前端改完配置直接用 PUT 的返回值刷新页面状态，
    两边字段不一致时会出现「保存成功但界面还是旧值」——运营会再点一次保存。
    """
    return site_config.site_configuration_payload(
        setting, settings, include_credentials=True
    ) | {
        "referral": site_config.referral_settings_payload(setting),
        "deviceReleaseCooldownSeconds": setting.device_release_cooldown_seconds,
        "announcement": setting.announcement,
        #: 支付宝凭据概览（不含明文）。与 ``payment_provider`` 分开放：
        #: 前者是「渠道怎么走」，这里是「渠道的钥匙」。
        "alipay": _alipay_settings_payload(settings, setting),
        #: 注册邮箱验证码配置概览（不含 SMTP 授权码明文）。
        "mail": _mail_settings_payload(settings, setting),
    }


@router.get("/settings")
def admin_get_settings(session: DbSession, _admin: AdminAccount, settings: SettingsDep) -> dict:
    setting = site_config.get_setting(session)
    return _settings_response(setting, settings)


@router.put("/settings")
def admin_update_settings(
    payload: AdminSettingsRequest,
    session: DbSession,
    admin: AdminAccount,
    settings: SettingsDep,
) -> dict:
    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "site_name": "site_name",
        "site_title": "site_title",
        "description": "description",
        "announcement": "announcement",
        "support_email": "support_email",
        # logo_url 留空表示回到默认标识（见 site_settings.DEFAULT_LOGO_URL）
        "logo_url": "logo_url",
        "maintenance_mode": "maintenance_mode",
        "maintenance_message": "maintenance_message",
        "payment_provider": "payment_provider",
        "payment_display_name": "payment_display_name",
        "payment_enabled": "payment_enabled",
        "payment_transaction_description": "payment_transaction_description",
        "referral_enabled": "referral_enabled",
        "referral_rate_percent": "referral_rate_percent",
        "referral_withdrawal_fee_percent": "referral_withdrawal_fee_percent",
        "referral_withdrawal_min_points": "referral_withdrawal_min_points",
        "device_release_cooldown_seconds": "device_release_cooldown_seconds",
        # ---- 注册邮箱验证码 ----
        "mail_mode": "mail_mode",
        "mail_from": "mail_from",
        "smtp_host": "smtp_host",
        "smtp_port": "smtp_port",
        "smtp_username": "smtp_username",
        "smtp_security": "smtp_security",
        "verification_ttl_seconds": "verification_ttl_seconds",
        "verification_cooldown_seconds": "verification_cooldown_seconds",
    }
    updates = {column: data[field] for field, column in mapping.items() if field in data}
    if "payment_provider" in updates:
        # 渠道名写错一个字符就会让商店静默切到模拟收银台（本地点一下就发码），
        # 因此在入口直接拒绝未知取值，而不是等到下单时才 503。
        candidate = updates["payment_provider"]
        if not is_known_provider(candidate):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"支付渠道「{candidate}」不受支持，可选值为 "
                    f"{'、'.join(PROVIDER_NAMES)}，留空表示跟随环境变量。"
                ),
            )
        updates["payment_provider"] = normalize_provider_name(candidate)
    if "logo_url" in updates:
        updates["logo_url"] = (
            str(updates["logo_url"] or "").strip() or site_config.DEFAULT_LOGO_URL
        )
    if "support_email" in updates:
        # 与 logo_url 同一口径：这个字段**没有「空着」这个状态**。
        # 允许写空串的话，库里是空的、页面上却总显示默认值（读路径回落），
        # 于是「清空客服邮箱」是个永远不生效的假选项 —— 不如把默认值直接落库。
        updates["support_email"] = (
            str(updates["support_email"] or "").strip() or DEFAULT_SUPPORT_EMAIL
        )
    updates |= _alipay_settings_updates(data)
    updates |= _mail_settings_updates(data, current=site_config.get_setting(session), settings=settings)
    # ``update_setting`` 把 ``None`` 当作「这个字段别动」（全局约定，见其实现），
    # 但回显开关的 NULL 本身就是一个有意义的取值（「跟随环境变量」，区别于
    # 「生产上明确关掉」的 False）。所以这一个字段单独落地：摘出来，写入后再显式
    # 写回 NULL。不加这个例外的话，界面上「跟随环境变量」那一项永远选不回去。
    # 注意不能写成 ``updates.pop(...) is None``：``pop`` 无论值是什么都会摘掉这个键，
    # 于是「显式传 false」会被顺手丢掉，界面上关掉回显却毫无反应。
    clear_expose = (
        "expose_verification_code" in updates
        and updates["expose_verification_code"] is None
    )
    if clear_expose:
        del updates["expose_verification_code"]
    setting = site_config.update_setting(session, **updates)
    if clear_expose:
        setting.expose_verification_code = None
        setting.updated_at = utcnow()
        session.flush()
    audited = sorted(set(updates) | ({"expose_verification_code"} if clear_expose else set()))
    _audit(session, _admin_actor(admin), "settings.update", "1", ",".join(audited))
    return _settings_response(setting, settings)


#: 支付宝的纯文本配置项：前端字段名 → 数据库列名。留空即清空、跟随环境变量。
_ALIPAY_TEXT_FIELDS = {
    "alipay_app_id": "alipay_app_id",
    "alipay_seller_id": "alipay_seller_id",
    "alipay_gateway_url": "alipay_gateway_url",
    "alipay_notify_url": "alipay_notify_url",
    "alipay_return_url": "alipay_return_url",
}

#: 回调地址的字段名 → 中文标签，仅用于报错文案。
_ALIPAY_CALLBACK_LABELS = {
    "alipay_notify_url": "异步通知地址",
    "alipay_return_url": "同步跳转地址",
}


def _alipay_settings_updates(data: dict) -> dict:
    """校验并归一化后台提交的支付宝凭据字段，返回待写入的 updates。

    为什么必须在这里校验而不是等第一次支付：私钥填错时 ``sign_params`` 抛的
    ``PaymentError`` 会出现在**用户下单**的动线上，支付失败的是客户，改配置的人
    却看不到任何反馈。把校验前移到配置接口，错误当场落在改配置的那个人眼前。

    密钥字段的三种语义（见 ``resolve_secret_input``）：未提交=不改动、
    空串=清空（跟随环境变量）、打码值=不改动、其它=新密钥。
    """
    updates: dict = {}
    try:
        for field, column in _ALIPAY_TEXT_FIELDS.items():
            if field in data:
                updates[column] = str(data[field] or "").strip()
        if updates.get("alipay_gateway_url"):
            validate_gateway_url(updates["alipay_gateway_url"])
        for field, label in _ALIPAY_CALLBACK_LABELS.items():
            if updates.get(field):
                validate_callback_url(updates[field], label=label)

        private_key = resolve_secret_input(data.get("alipay_app_private_key"))
        if private_key is not None:
            if private_key:
                validate_private_key_text(private_key)
            updates["alipay_app_private_key"] = private_key

        public_key = resolve_secret_input(data.get("alipay_public_key"))
        if public_key is not None:
            if public_key:
                validate_public_key_text(public_key)
            updates["alipay_public_key"] = public_key

        if "alipay_sandbox" in data:
            updates["alipay_sandbox"] = bool(data["alipay_sandbox"])
    except PaymentError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error
    return updates


#: 邮件的纯文本配置项：前端字段名 → 数据库列名。留空即清空、跟随环境变量。
_MAIL_TEXT_FIELDS = {
    "mail_from": "mail_from",
    "smtp_host": "smtp_host",
    "smtp_username": "smtp_username",
}


def _mail_settings_updates(data: dict, *, current: StoreSetting, settings: SettingsDep) -> dict:
    """校验并归一化后台提交的邮件 / 验证码字段，返回待写入的 updates。

    校验前移到配置接口的理由与支付宝凭据完全相同：SMTP 填错时受害的是
    **正在注册的用户**（收不到验证码就等于注册不了），而改配置的运营一无所知。
    错误必须当场落在改配置的那个人眼前。

    这里还要额外校验「有效期 / 冷却」的联动关系，而且必须拿**合并后**的值去算：
    有效期可能配在后台、冷却可能来自环境变量，只校验提交的那一半会漏掉
    「冷却 >= 有效期」这种跨来源的死锁（见 ``validate_verification_window``）。
    """
    updates: dict = {}
    for field, column in _MAIL_TEXT_FIELDS.items():
        if field in data:
            updates[column] = str(data[field] or "").strip()

    if "mail_mode" in data:
        mode = str(data["mail_mode"] or "").strip().lower()
        if mode and mode not in mail_settings.MAIL_MODES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"邮件投递方式「{mode}」不受支持，可选值为 "
                    f"{'、'.join(mail_settings.MAIL_MODES)}，留空表示跟随环境变量。"
                ),
            )
        updates["mail_mode"] = mode

    if "smtp_security" in data:
        security = str(data["smtp_security"] or "").strip().lower()
        if security and security not in mail_settings.SMTP_SECURITY_MODES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"SMTP 加密方式「{security}」不受支持，可选值为 "
                    f"{'、'.join(mail_settings.SMTP_SECURITY_MODES)}，留空表示跟随环境变量。"
                ),
            )
        updates["smtp_security"] = security

    if "smtp_port" in data:
        updates["smtp_port"] = int(data["smtp_port"] or 0)

    # 授权码：空串=清空、打码值/未提交=不改动、其它=新授权码。
    # 「清除已保存的授权码」勾选框必须**压过**输入框：运营勾了它却因为输入框
    # 里还留着上一次的输入而没清掉，是这类表单最常见的挫败。
    if data.get("smtp_clear_password"):
        updates["smtp_password"] = ""
    else:
        password = resolve_secret_input(data.get("smtp_password"))
        if password is not None:
            updates["smtp_password"] = password

    for field, column in (
        ("verification_ttl_seconds", "verification_ttl_seconds"),
        ("verification_cooldown_seconds", "verification_cooldown_seconds"),
    ):
        if field in data:
            updates[column] = int(data[field] or 0)

    # 三态回显开关：字段在请求里就代表运营做了选择。显式传 null 表示清回
    # 「跟随环境变量」—— 列是可空的，NULL 与 False 是两件事（「没配过」vs
    # 「生产上明确关掉」），所以这里绝不能写成 ``bool(None) == False``：那会让
    # 运营一旦点过这个下拉框，就再也回不到「跟随环境变量」。
    if "expose_verification_code" in data:
        value = data["expose_verification_code"]
        updates["expose_verification_code"] = None if value is None else bool(value)

    _validate_verification_window(updates, current=current, settings=settings)
    return updates


def _validate_verification_window(
    updates: dict, *, current: StoreSetting, settings: SettingsDep
) -> None:
    """校验「有效期 / 冷却」的联动关系。

    只在本次提交**动过**这两个字段时才校验：环境变量里历史遗留的坏值
    （比如 ``STORE_VERIFICATION_TTL_SECONDS=30``）不应该把「改个站点名」
    这种无关操作也一并卡死 —— 那样运营会陷入「什么都保存不了，但不知道
    该改哪个页面上的哪个框」。

    校验用的是**合并后**的有效值，所以「有效期配在后台、冷却来自环境变量」
    这种跨来源的死锁也拦得住（见 ``validate_verification_window``）。
    """
    touched = {
        "verification_ttl_seconds",
        "verification_cooldown_seconds",
    } & set(updates)
    if not touched:
        return
    ttl, cooldown = mail_settings.effective_verification_window(
        settings,
        current,
        ttl_override=updates.get("verification_ttl_seconds"),
        cooldown_override=updates.get("verification_cooldown_seconds"),
    )
    try:
        mail_settings.validate_verification_window(ttl, cooldown)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error


@router.post("/settings/alipay/test")
def admin_test_alipay_credentials(
    request: Request,
    session: DbSession,
    admin: AdminAccount,
    settings: SettingsDep,
) -> dict:
    """测试**当前支付渠道**的凭据与回调配置，逐项给出结论。

    只看**已保存**的配置，不做「先试再存」：探活要真的把密钥拿去签名并发出请求，
    如果允许测试未保存的内容，就等于多一条「任意字符串都能触发外呼」的路径，
    而且试通了却忘了保存反而更乱。运营的正常流程是保存 → 测试。

    这里刻意测「当前渠道」而不是硬编码 alipay：这个按钮要回答的问题始终是
    「用户现在能不能付钱」，而不是「我填的支付宝参数对不对」。渠道还停在 mock
    时，最该让运营看到的就是那句「模拟收银台不能用于生产收款」——
    过去这一栏会绕开渠道选择直接去测支付宝，于是界面全绿、站点却在白送授权。

    这是个**同步**端点（和 ``admin_refund`` 一样），FastAPI 会把它丢进线程池执行，
    所以内部的阻塞式 HTTPS/DNS 调用不会卡住事件循环。
    """
    setting = site_config.get_setting(session)
    try:
        provider = request.app.state.resolve_payment_provider(setting)
    except PaymentError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    diagnose = getattr(provider, "diagnose_credentials", None)
    if diagnose is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="当前支付渠道不支持凭据自检，请把支付渠道切换为 alipay 后再试。",
        )

    # 回调地址取**实际生效**的那一份（后台配置 / 环境变量 / 按 STORE_BASE_URL 推导），
    # 而不是把库里的原始值报出去 —— 运营要核对的是「支付宝到底会往哪推」。
    base_url = settings.public_base_url
    notify = provider.notify_url(settings, base_url) if hasattr(provider, "notify_url") else ""
    callback = provider.return_url(settings, base_url) if hasattr(provider, "return_url") else ""

    ok, message, checks = diagnose(settings, notify_url=notify, return_url=callback)
    #: 把探测结论也写进审核日志：凭据是否通过验证是排障时的关键事实，
    #: 事后复盘「谁在什么时候确认过配置可用」只能靠它。不记密钥内容。
    _audit(
        session,
        _admin_actor(admin),
        "settings.alipay_probe",
        "1",
        f"{'通过' if ok else '未通过'}：{message}"[:255],
    )
    return {
        "ok": ok,
        "message": message,
        "checks": checks,
        "provider": getattr(provider, "name", ""),
        "sandbox": bool(setting.alipay_sandbox),
    }


@router.post("/settings/mail/test")
def admin_test_mail_delivery(
    payload: AdminMailTestRequest,
    session: DbSession,
    admin: AdminAccount,
    settings: SettingsDep,
) -> dict:
    """按当前（已保存）邮件配置做一次诊断；给了收件人就再真发一封。

    与支付宝凭据自检同一套立场：只看**已保存**的配置，不做「先试再存」。「填了 SMTP 但授权码过期 /
    端口选错」过去唯一的暴露方式就是用户注册不了，而运营在后台看不出任何异常 —— 这个按钮把那条反馈
    回路缩短到一次点击。

    收件人留空表示**只做连接诊断**（域名解析 + TCP/TLS + 登录握手，不发信），这是能反复点的那一半；
    填了收件人才会真的投递一封，用来回答「用户到底收得到吗」。两者分开是刻意的 —— SMTP 的故障在握手
    阶段就能定位到具体原因（授权码错 / 端口与加密方式不匹配 / 防火墙），而发信失败往往只回一句笼统的
    5xx。

    发信与探测都是阻塞 I/O，所以这是个**同步**端点，FastAPI 会把它丢进线程池，不会卡住事件循环。
    返回里的 ``ok`` 必须如实反映结果：带收件人时以「真的投递出去没」为准，不带收件人时以「连接诊断
    是否全绿」为准。``mail_mode=log/echo`` 时它一定是 ``false``（压根没发信），前端要明确提示
    「当前是日志模式，测试不会真的发出去」，否则运营会以为链路通了，实际只是写了行日志。
    """
    email = normalize_email(payload.email or "")
    if email and not is_valid_email(email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="请输入有效的邮箱地址。"
        )

    setting = site_config.get_setting(session)
    #: 必须用合并后的配置：直接拿 ``app.state.settings`` 只会读到环境变量，
    #: 于是「后台刚填的授权码」永远测不出来 —— 而那正是运营点这个按钮的原因。
    merged = mail_settings.merge_mail_settings(settings, setting)
    diagnosed, checks = mailer.diagnose_mail(merged)

    if not email:
        failures = [item for item in checks if item["level"] == "fail"]
        if diagnosed:
            message = "连接诊断全部通过（未发送邮件）。填写收件邮箱可以再验证一次真实投递。"
        elif failures:
            message = "连接诊断未通过：" + "；".join(
                f"{item['label']} —— {item['detail']}" for item in failures
            )
        else:
            message = (
                f"未做真实投递：当前投递方式是 {merged.mail_mode}"
                "（验证码不会离开服务器），因此只报告了配置层面的结论。"
            )
        _audit(
            session,
            _admin_actor(admin),
            "settings.mail_probe",
            "1",
            f"仅连接诊断：{'通过' if diagnosed else '未通过'}"[:255],
        )
        return {
            "ok": diagnosed,
            "email": "",
            "mode": merged.mail_mode,
            "attempts": 0,
            "message": message,
            "checks": checks,
        }

    result = mailer.send_test_email(settings, setting, email=email)

    if result.delivered:
        message = f"测试邮件已通过 SMTP 投递到 {email}（第 {result.attempts} 次尝试成功）。"
    elif merged.smtp_misconfigured:
        message = (
            f"未真正发信：投递方式选了 smtp，但凭据不全（缺服务器地址或授权码），"
            f"本次已退化为 {result.mode} 模式。请补全后重试。"
        )
    elif merged.mail_mode != "smtp":
        message = (
            f"未真正发信：当前投递方式是 {merged.mail_mode}（只写日志"
            f"{'并回显' if merged.mail_mode == 'echo' else ''}），验证码不会离开服务器。"
            "要真正发信请把投递方式改为 smtp。"
        )
    else:
        message = f"发信失败（已尝试 {result.attempts} 次）：{result.error or '未返回具体原因'}"

    #: 结论写进审核日志：和支付宝探活同理，「谁在什么时候确认过邮件链路可用」
    #: 是事后复盘的关键事实。不记授权码。
    _audit(
        session,
        _admin_actor(admin),
        "settings.mail_probe",
        "1",
        f"{email}：{'已投递' if result.delivered else '未投递'}（{result.mode}）"[:255],
    )
    return {
        #: 带收件人时以**真实投递结果**为准：此时它才是「这条路通不通」的直接证据，
        #: 而诊断里的 warn（例如匿名投递）不该把一次成功的投递说成失败。
        #: 各项结论仍原样放在 checks 里供人细看。
        "ok": result.delivered,
        "email": email,
        "mode": result.mode,
        "attempts": result.attempts,
        "message": message,
        "checks": checks,
    }


# 版本发布
@router.get("/releases")
def admin_list_releases(
    session: DbSession,
    _admin: AdminAccount,
    keyword: str | None = None,
    product: str | None = None,
    channel: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """版本发布记录（分页 + 筛选）。"""
    base = select(Release)
    if product:
        base = base.where(Release.product == product.strip())
    if channel:
        base = base.where(Release.channel == channel.strip())
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(
            or_(
                Release.version.like(like),
                Release.upgrade_notes.like(like),
                Release.release_date.like(like),
            )
        )
    return _page(
        session,
        base,
        (Release.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=_release_payload,
    )


@router.post("/releases")
def admin_create_release(
    payload: AdminReleaseRequest, session: DbSession, admin: AdminAccount
) -> dict:
    product = payload.product or "homeos"
    channel = payload.channel or "docker"
    version = payload.version
    # (product, channel, version) 上有唯一索引：同一个版本只能有一条记录，否则客户端
    # 「检查更新」会在同一版本的两条说法之间随机挑一条（升级说明、发布日期都可能不同）。
    # 先查一次给出可读的 409，别让用户看见裸的 IntegrityError。
    duplicate = session.scalars(
        select(Release).where(
            Release.product == product,
            Release.channel == channel,
            Release.version == version,
        )
    ).first()
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{product}/{channel} {version} 已存在，请直接编辑那条记录。",
        )

    release = Release(
        product=product,
        channel=channel,
        version=version,
        release_date=payload.release_date or "",
        upgrade_notes=payload.upgrade_notes or "",
    )
    session.add(release)
    # 上面那次查询挡不住并发（两个管理员同时提交）：唯一索引是最终防线，撞上时同样
    # 翻译成 409 —— 否则前端只会看到一个没有解释的 500。flush 必须**在 SAVEPOINT 内**
    # 且关掉自动 flush：先建 SAVEPOINT 再显式 flush，失败时只回滚这一次插入，会话仍可
    # 正常提交（提前 flush 会把会话打成 needs-rollback，之后连读都读不了）。
    try:
        with session.no_autoflush, session.begin_nested():
            session.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{product}/{channel} {version} 已存在，请直接编辑那条记录。",
        ) from None
    _audit(session, _admin_actor(admin), "release.create", release.id, release.version)
    return {
        "id": release.id,
        "product": release.product,
        "channel": release.channel,
        "version": release.version,
        "releaseDate": release.release_date,
        "upgradeNotes": release.upgrade_notes,
    }


@router.delete("/releases/{release_id}")
def admin_delete_release(release_id: str, session: DbSession, admin: AdminAccount) -> dict:
    """删除版本记录。

    ``releases`` 是叶子表（没有任何外键指向它），物理删除不会影响授权数据；
    客户端的「检查更新」会自动回退到次新的那条记录。
    """
    release = session.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本记录不存在。")
    label = f"{release.product}/{release.channel} {release.version}"
    session.delete(release)
    session.flush()
    _audit(session, _admin_actor(admin), "release.delete", release_id, label)
    return {"id": release_id, "deleted": True, "label": label}


# 账号
@router.get("/accounts")
def admin_list_accounts(
    session: DbSession,
    _admin: AdminAccount,
    keyword: str | None = None,
    role: str | None = None,
    status_filter: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    """账号列表（分页 + 筛选）。

    ``role`` 取 ``admin`` / ``user``；``status_filter`` 取 ``active`` / ``inactive`` /
    ``unverified``（注册了但邮箱还没验证——这些人登不上前台，客服工单基本都是他们）。
    """
    base = select(Account)
    if keyword:
        like = f"%{keyword.strip()}%"
        # 邮箱是主键式的检索口径；邀请码是用户唯一会主动报给客服的另一个标识。
        base = base.where(
            or_(Account.email.like(like), Account.referral_code.like(like))
        )
    role_value = (role or "").strip()
    if role_value == "admin":
        base = base.where(Account.is_admin.is_(True))
    elif role_value == "user":
        base = base.where(Account.is_admin.is_(False))
    status_value = (status_filter or "").strip()
    if status_value == "active":
        base = base.where(Account.is_active.is_(True))
    elif status_value == "inactive":
        base = base.where(Account.is_active.is_(False))
    elif status_value == "unverified":
        base = base.where(Account.email_verified_at.is_(None))
    return _page(
        session,
        base,
        (Account.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=lambda account: _account_payload(session, account),
    )


@router.post("/accounts/{account_id}/activate")
def admin_activate_account(account_id: str, session: DbSession, admin: AdminAccount) -> dict:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在。")
    account.is_active = True
    session.flush()
    _audit(session, _admin_actor(admin), "account.activate", account.id)
    return {"id": account.id, "isActive": True}


@router.post("/accounts/{account_id}/deactivate")
def admin_deactivate_account(account_id: str, session: DbSession, admin: AdminAccount) -> dict:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在。")
    # 与 ``admin_patch_account`` 的两条自锁保护必须一致：这个端点是「停用」的
    # 快捷入口，如果这里不拦，运营绕过 PATCH 一样能把自己（或最后一位管理员）
    # 关在门外，后台只剩「改数据库」这一条路。
    _guard_self_lockout(account, admin, action="停用当前登录的账号")
    _guard_last_active_admin(session, account)
    account.is_active = False
    _drop_account_sessions(session, account.id)
    session.flush()
    _audit(session, _admin_actor(admin), "account.deactivate", account.id)
    return {"id": account.id, "isActive": False}


@router.patch("/accounts/{account_id}")
def admin_patch_account(
    account_id: str, payload: AdminAccountPatch, session: DbSession, admin: AdminAccount
) -> dict:
    """修正账号资料 / 重置密码 / 调整管理员与启用状态。

    两条自锁保护：不能取消自己的管理员权限、也不能停用自己——否则后台会把
    管理员自己关在门外，只能直接改库救回来。降权时还会校验系统里必须剩下
    至少一个启用状态的管理员。
    """
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在。")

    data = payload.model_dump(exclude_unset=True)
    if data.get("is_admin") is False:
        _guard_self_lockout(account, admin, action="取消自己的管理员权限")
    if data.get("is_active") is False:
        _guard_self_lockout(account, admin, action="停用当前登录的账号")

    changed: list[str] = []
    if data.get("email"):
        email = normalize_email(str(data["email"]))
        if not is_valid_email(email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱格式不正确。"
            )
        taken = session.scalars(
            select(Account.id).where(
                func.lower(Account.email) == email, Account.id != account.id
            )
        ).first()
        if taken is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="该邮箱已被其他账号使用。"
            )
        account.email = email
        # 客户档案里的邮箱是下单/开票用的，跟着账号一起改，免得两处不一致
        customer = session.scalars(
            select(Customer).where(Customer.account_id == account.id)
        ).first()
        if customer is not None:
            customer.email = email
        changed.append("email")

    if data.get("is_admin") is False and bool(account.is_admin):
        _guard_last_active_admin(session, account)
    if "is_admin" in data and data["is_admin"] is not None:
        account.is_admin = bool(data["is_admin"])
        changed.append("is_admin")

    if "is_active" in data and data["is_active"] is not None:
        if data["is_active"] is False:
            # 停用最后一位启用中的管理员同样会造成后台自锁
            _guard_last_active_admin(session, account)
        account.is_active = bool(data["is_active"])
        if not account.is_active:
            _drop_account_sessions(session, account.id)
        changed.append("is_active")

    if "email_verified" in data and data["email_verified"] is not None:
        account.email_verified_at = utcnow() if data["email_verified"] else None
        changed.append("email_verified")

    if data.get("new_password"):
        account.password_hash = hash_password(data["new_password"])
        # 密码一改就踢掉全部会话，避免旧 token 继续用
        _drop_account_sessions(session, account.id)
        # 审计里只记「改过密码」，绝不记明文
        changed.append("new_password")

    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="没有需要更新的字段。"
        )

    session.flush()
    _audit(session, _admin_actor(admin), "account.update", account.id, ",".join(sorted(changed)))
    return _account_payload(session, account)


@router.delete("/accounts/{account_id}")
def admin_delete_account(account_id: str, session: DbSession, admin: AdminAccount) -> dict:
    """删除账号。

    账号下面挂着授权、订单、积分流水，硬删会连带清空或留下孤儿指针。所以只要
    还挂着业务数据就拒绝删除，只允许停用；真正放行硬删的只有从未产生过业务
    数据的「干净」账号。管理员自己不能删自己。
    """
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在。")
    if account.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除当前登录的账号。"
        )

    blockers = {
        "授权": int(
            session.execute(
                select(func.count(License.id)).where(License.account_id == account.id)
            ).scalar_one()
            or 0
        ),
        "订单": int(
            session.execute(
                select(func.count(Order.id)).where(Order.account_id == account.id)
            ).scalar_one()
            or 0
        ),
        "积分流水": int(
            session.execute(
                select(func.count(ReferralLedger.id)).where(
                    ReferralLedger.account_id == account.id
                )
            ).scalar_one()
            or 0
        ),
    }
    blocking = {name: count for name, count in blockers.items() if count}
    if blocking:
        detail = "、".join(f"{name} {count} 条" for name, count in blocking.items())
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"该账号仍有 {detail}，不能删除。请改用「停用」以保留历史记录。",
        )

    email = account.email
    _drop_account_sessions(session, account.id)
    session.delete(account)
    session.flush()
    _audit(session, _admin_actor(admin), "account.delete", account_id, email)
    return {"id": account_id, "deleted": True, "email": email}


# 授权修正
def _license_detail(session, settings, license: License) -> dict:
    """按列表接口同一口径返回单条授权。"""
    meta = _license_meta(session, [license])
    setting = site_config.get_setting(session)
    return license_payload(
        license,
        customer=meta.get(license.id, {}).get("customer"),
        binding=meta.get(license.id, {}).get("binding"),
        cooldown_seconds=_cooldown(setting, settings),
        last_released_at=meta.get(license.id, {}).get("last_released_at"),
    )


@router.patch("/licenses/{license_id}")
def admin_patch_license(
    license_id: str,
    payload: AdminLicensePatch,
    session: DbSession,
    settings: SettingsDep,
    admin: AdminAccount,
) -> dict:
    """修正授权的有效期 / 备注。

    过去这几个字段完全没有入口，客服遇到「客户要延期」「备注写错了」只能改库。
    到期时间的三种给法互斥，避免一次请求里两个字段互相覆盖：
    - ``extend_days``：在现有到期时间上顺延（永久授权以当前时刻为起点重新计时）
    - ``access_expires_at``：直接指定绝对时间，显式传 null 表示改为永久有效
    - 只给 ``validity_days``：按开始时间重算到期时间，避免出现「买的 365 天、
      实际只到明年」这种自相矛盾的授权
    """
    license = session.get(License, license_id)
    if license is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")

    data = payload.model_dump(exclude_unset=True)
    extend_days = data.get("extend_days")
    explicit_expiry = "access_expires_at" in data
    if extend_days and explicit_expiry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="顺延天数与绝对到期时间不能同时提交，请二选一。",
        )

    changed: list[str] = []
    if explicit_expiry:
        license.access_expires_at = _naive_utc(data["access_expires_at"])
        changed.append("access_expires_at")
    elif extend_days:
        base = license.access_expires_at or utcnow()
        license.access_expires_at = base + timedelta(days=int(extend_days))
        changed.append("access_expires_at")
    elif "validity_days" in data:
        if data["validity_days"] is None:
            license.access_expires_at = None
        else:
            start = license.access_started_at or license.issued_at or utcnow()
            license.access_expires_at = start + timedelta(days=int(data["validity_days"]))
        changed.append("access_expires_at")

    if "validity_days" in data:
        license.validity_days = data["validity_days"]
        changed.append("validity_days")
    if "access_started_at" in data:
        license.access_started_at = _naive_utc(data["access_started_at"])
        changed.append("access_started_at")
    if "user_label" in data:
        license.user_label = data["user_label"]
        changed.append("user_label")

    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="没有需要更新的字段。"
        )

    license.updated_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "license.update", license.id, ",".join(sorted(changed)))
    return _license_detail(session, settings, license)


# 权益（决定客户端功能开关）
def _entitlement_payload(entry: Entitlement) -> dict:
    now = utcnow()
    return {
        "id": entry.id,
        "licenseId": entry.license_id,
        "customerId": entry.customer_id,
        "productId": entry.product_id,
        "productName": entry.product_name,
        "productType": entry.product_type,
        "featureCode": entry.feature_code,
        # activeFlag 是库里的原始开关，active 是叠加了有效期后的实际生效状态：
        # 两者分开返回，后台才能解释「为什么开关是开的但客户端没该功能」。
        "activeFlag": bool(entry.active),
        "active": bool(entry.active) and (entry.expires_at is None or entry.expires_at > now),
        "startsAt": iso_z(entry.starts_at),
        "expiresAt": iso_z(entry.expires_at),
        "createdAt": iso_z(entry.created_at),
    }


@router.get("/entitlements")
def admin_list_entitlements(
    session: DbSession,
    _admin: AdminAccount,
    license_id: str | None = None,
    account_id: str | None = None,
    feature_code: str | None = None,
    keyword: str | None = None,
    status_filter: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """权益列表（分页 + 筛选）。

    ``status_filter`` 取 ``active`` / ``inactive``。这里的 active 是**叠加有效期后**
    的实际生效状态，与库里的开关列不同（见 ``_entitlement_payload``）：运营问
    「这个人到底有没有这个功能」时，答案只能是叠加后的那一个。
    """
    base = select(Entitlement)
    if license_id:
        base = base.where(Entitlement.license_id == license_id)
    if feature_code:
        base = base.where(Entitlement.feature_code == feature_code)
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(
            or_(
                Entitlement.feature_code.like(like),
                Entitlement.product_name.like(like),
                Entitlement.license_id.like(like),
            )
        )
    if account_id:
        base = base.where(
            Entitlement.license_id.in_(
                select(License.id).where(License.account_id == account_id)
            )
        )
    moment = utcnow()
    status_value = (status_filter or "").strip()
    if status_value == "active":
        base = base.where(
            Entitlement.active.is_(True),
            or_(Entitlement.expires_at.is_(None), Entitlement.expires_at > moment),
        )
    elif status_value == "inactive":
        base = base.where(
            or_(
                Entitlement.active.is_(False),
                and_(Entitlement.expires_at.is_not(None), Entitlement.expires_at <= moment),
            )
        )
    return _page(
        session,
        base,
        (Entitlement.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=_entitlement_payload,
    )


@router.post("/entitlements")
def admin_create_entitlement(
    payload: AdminEntitlementRequest, session: DbSession, admin: AdminAccount
) -> dict:
    """手工补一条权益。

    同一张授权下同一个 ``feature_code`` 只能有一条，否则客户端到底按哪条开功能
    就说不清了，所以重复时直接报冲突、引导去编辑已有那条。
    """
    license = session.get(License, payload.license_id)
    if license is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")
    feature_code = payload.feature_code.strip()
    # 补权益是「手工放行一个能力」：码写错了不会报错，客户端的 ``allows`` 只会
    # 一直拒绝 —— 表现是「后台显示已发放、功能却打不开」。所以必须对齐能力目录。
    if feature_code not in features.FEATURE_CODES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"功能码 {feature_code} 不在能力目录里，客户端不会认它。"
                "请从「功能码」选择器里勾选。"
            ),
        )
    exists = session.scalars(
        select(Entitlement).where(
            Entitlement.license_id == license.id,
            Entitlement.feature_code == feature_code,
        )
    ).first()
    if exists is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"该授权下已存在功能 {feature_code} 的权益，请直接编辑它。",
        )

    starts_at = _naive_utc(payload.starts_at) or utcnow()
    expires_at = (
        _naive_utc(payload.expires_at)
        if payload.expires_at
        else license.access_expires_at
    )
    if expires_at is not None and expires_at <= starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="结束时间必须晚于开始时间。"
        )

    entry = Entitlement(
        customer_id=license.customer_id,
        license_id=license.id,
        product_id=payload.product_id or license.product_id,
        product_name=payload.product_name or license.product_name,
        product_type=payload.product_type or license.product_type,
        feature_code=feature_code,
        active=payload.active,
        starts_at=starts_at,
        expires_at=expires_at,
    )
    session.add(entry)
    session.flush()
    _audit(
        session, _admin_actor(admin), "entitlement.create", entry.id,
        f"{license.code_hint} / {feature_code}",
    )
    return _entitlement_payload(entry)


@router.patch("/entitlements/{entitlement_id}")
def admin_patch_entitlement(
    entitlement_id: str, payload: AdminEntitlementPatch, session: DbSession, admin: AdminAccount
) -> dict:
    entry = session.get(Entitlement, entitlement_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="权益不存在。")

    data = payload.model_dump(exclude_unset=True)
    changed: list[str] = []
    if data.get("feature_code"):
        feature_code = str(data["feature_code"]).strip()
        # 与 admin_create_entitlement 对齐：功能码写错了不会报任何错，客户端的
        # ``allows`` 只会一直拒绝 —— 表现是「后台显示已发放、功能却打不开」。
        # 创建时校验、编辑时不校验，等于给同一条规则留了一个后门。
        if feature_code not in features.FEATURE_CODES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"功能码 {feature_code} 不在能力目录里，客户端不会认它。"
                    "请从「功能码」选择器里勾选。"
                ),
            )
        if feature_code != entry.feature_code:
            taken = session.scalars(
                select(Entitlement.id).where(
                    Entitlement.license_id == entry.license_id,
                    Entitlement.feature_code == feature_code,
                    Entitlement.id != entry.id,
                )
            ).first()
            if taken is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"该授权下已存在功能 {feature_code} 的权益。",
                )
        entry.feature_code = feature_code
        changed.append("feature_code")
    if "product_name" in data and data["product_name"] is not None:
        entry.product_name = data["product_name"]
        changed.append("product_name")
    if "active" in data and data["active"] is not None:
        entry.active = bool(data["active"])
        changed.append("active")
    if "starts_at" in data:
        entry.starts_at = _naive_utc(data["starts_at"]) or entry.starts_at
        changed.append("starts_at")
    if "expires_at" in data:
        # 显式 null 表示改为永久有效
        entry.expires_at = _naive_utc(data["expires_at"])
        changed.append("expires_at")

    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="没有需要更新的字段。"
        )
    if entry.expires_at is not None and entry.expires_at <= entry.starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="结束时间必须晚于开始时间。"
        )

    session.flush()
    _audit(
        session, _admin_actor(admin), "entitlement.update", entry.id, ",".join(sorted(changed))
    )
    return _entitlement_payload(entry)


@router.delete("/entitlements/{entitlement_id}")
def admin_delete_entitlement(
    entitlement_id: str, session: DbSession, admin: AdminAccount
) -> dict:
    entry = session.get(Entitlement, entitlement_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="权益不存在。")
    label = f"{entry.license_id} / {entry.feature_code}"
    session.delete(entry)
    session.flush()
    _audit(session, _admin_actor(admin), "entitlement.delete", entitlement_id, label)
    return {"id": entitlement_id, "deleted": True}


# 邀请积分：人工调账
@router.post("/referral-wallets/{account_id}/adjust")
def admin_adjust_wallet(
    account_id: str, payload: AdminWalletAdjustRequest, session: DbSession, admin: AdminAccount
) -> dict:
    """人工调账（有资金影响）。

    强制要求备注，且一律走 ``referrals.ledger_entry`` 记账：余额与流水在同一个
    事务里更新，不允许直接改余额绕过账本，否则对账时余额对不上流水。
    """
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在。")
    note = payload.note.strip()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="人工调账必须填写备注。"
        )

    #: NaN / Infinity 必须在这里被挡掉。JSON 标准里没有这两个字面量，但 Python 的
    #: ``json`` 默认**接受**它们，所以构造出来的请求体能把 nan 一路写进钱包余额：
    #: ``nan == 0`` 与 ``nan < 0`` 全为假，后面两道守卫都会被绕过，落库之后该账号
    #: 的余额永远算不回正常值（所有加减都是 nan）。``money.to_centi`` 对非有限数
    #: 直接抛 ``ValueError``，这里翻译成 400 而不是让它变成 500。
    try:
        delta_centi = money.to_centi(payload.delta)
        frozen_delta_centi = money.to_centi(payload.frozen_delta)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"变动金额必须是有限数字（{error}）。"
        ) from None
    if delta_centi == 0 and frozen_delta_centi == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="变动金额不能为 0。")

    wallet = referrals.get_or_create_wallet(session, account)
    next_balance_centi = int(wallet.balance_centi or 0) + delta_centi
    next_frozen_centi = int(wallet.frozen_centi or 0) + frozen_delta_centi
    if next_balance_centi < 0 or next_frozen_centi < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"调账后余额或冻结金额不能为负（余额 "
                f"{money.format_centi(next_balance_centi)} / 冻结 "
                f"{money.format_centi(next_frozen_centi)}）。"
            ),
        )

    try:
        #: 上面那次判断只是**为了给出带数字的文案**，它自己挡不住并发：两个调账
        #: 请求各自读到同一份余额、各自算出「不会为负」、再各自把结果写回去 ——
        #: 后写的一方覆盖先写的，负余额就这么落库（而接口返回 200，没有任何异常）。
        #: 真正的守卫传进 ``ledger_entry``，与加法压在同一条 UPDATE 的 ``WHERE`` 里，
        #: 匹配不到行即拒绝（见 ``referrals._apply_wallet_delta``）。
        entry = referrals.ledger_entry(
            session,
            wallet,
            kind="manual_adjust",
            delta_centi=delta_centi,
            frozen_delta_centi=frozen_delta_centi,
            note=note,
            reference=_admin_actor(admin),
            min_balance_centi=0,
            min_frozen_centi=0,
        )
    except referrals.WalletGuardError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "钱包余额刚刚被其它操作改动，这次调账会让余额或冻结额为负，已拒绝。"
                "请刷新后按最新余额重算。"
            ),
        ) from None
    _audit(
        session,
        _admin_actor(admin),
        "wallet.adjust",
        account.id,
        f"余额 {money.format_centi(delta_centi)} / 冻结 "
        f"{money.format_centi(frozen_delta_centi)}，备注：{note}",
    )
    return {
        "accountId": account.id,
        "balance": money.format_centi(wallet.balance_centi),
        "frozen": money.format_centi(wallet.frozen_centi),
        "ledgerId": entry.id,
    }


# 商品图片 / 设备绑定 / 版本发布：删除与修正
def _safe_image_target(root: Path, raw: str) -> Path | None:
    """把库里的商品图相对路径解析成绝对路径；越界返回 ``None``。

    防目录穿越：``path`` 是上传时自己拼出来的文件名，但不排除被改过，也不排除历史
    数据里就有 ``../``。越界的路径绝不能落到文件系统调用上 —— ``admin_delete_product``
    过去把 ``product_images_dir / path`` 直接 ``unlink``，等于「能改库就能删任意文件」。
    两处删除点（删单图、删商品）原先各写各的，这里收成一份。

    内部对 ``root`` 也做一次 ``resolve()``：调用方本来就传的是已解析路径，但
    macOS 上 ``/var`` 是指向 ``/private/var`` 的符号链接 —— 一旦谁传了未解析的
    ``root``，下面那句 ``root not in target.parents`` 会对**所有**路径成立，
    函数就变成「永远返回 None」，静默跳过全部文件删除。失败方向是安全的，
    但会让人以为删除逻辑坏了。
    """
    base = root.resolve()
    if not raw:
        return None
    target = (base / raw).resolve()
    if target == base or base not in target.parents:
        return None
    return target


@router.delete("/products/{product_id}/image")
def admin_delete_product_image(
    product_id: str, request: Request, session: DbSession, admin: AdminAccount
) -> dict:
    """移除商品自定义图片（含磁盘文件），回落到默认标识。"""
    product = _product_or_404(session, product_id)
    images = list(
        session.scalars(select(ProductImage).where(ProductImage.product_id == product.id))
    )
    if not images:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="该商品没有自定义图片。"
        )

    settings = request.app.state.settings
    root = settings.product_images_dir.resolve()
    removed: list[str] = []
    missing: list[str] = []
    for image in images:
        target = _safe_image_target(root, image.path)
        # 防目录穿越：库里的 path 是上传时自己拼的文件名，但不排除被改过，
        # 越界的路径只清记录、不碰文件。
        if target is None:
            logger.warning("商品图片路径越界，跳过文件删除：%s", image.path)
            missing.append(image.path)
        elif target.is_file():
            try:
                target.unlink()
                removed.append(image.path)
            except OSError as exc:
                # 文件删不掉也要把记录清掉，否则列表里会挂着一张点不开的图
                logger.warning("删除商品图片文件失败 %s：%s", target, exc)
                missing.append(image.path)
        else:
            missing.append(image.path)
        session.delete(image)

    session.flush()
    _audit(session, _admin_actor(admin), "product.image_delete", product.id, ",".join(image_path for image_path in removed))
    return {"id": product.id, "removed": removed, "missing": missing, "imageUrl": None}


@router.delete("/bindings/{binding_id}")
def admin_delete_binding(binding_id: str, session: DbSession, admin: AdminAccount) -> dict:
    """物理删除设备绑定记录。

    与「释放绑定」的区别：释放只是把绑定置为失效、保留历史，客户端重新激活仍
    受冷却时间约束；删除会把记录整条抹掉（会话与找回令牌按外键级联清理），
    客户端可以立刻重新激活。只用于清理测试机、重复绑定这类脏数据，故强制审计。
    """
    binding = session.get(DeviceBinding, binding_id)
    if binding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="绑定记录不存在。")
    license_id = binding.license_id
    instance_id = binding.instance_id
    session.delete(binding)
    session.flush()
    _audit(
        session, _admin_actor(admin), "binding.delete", binding_id,
        f"授权 {license_id} / 实例 {instance_id}",
    )
    return {"id": binding_id, "deleted": True, "licenseId": license_id}


def _release_payload(release: Release) -> dict:
    return {
        "id": release.id,
        "product": release.product,
        "channel": release.channel,
        "version": release.version,
        "releaseDate": release.release_date,
        "upgradeNotes": release.upgrade_notes,
        "createdAt": iso(release.created_at),
    }


@router.patch("/releases/{release_id}")
def admin_patch_release(
    release_id: str, payload: AdminReleasePatch, session: DbSession, admin: AdminAccount
) -> dict:
    """修正已发布的版本记录（发错渠道、版本号打错、说明写错都要能改）。"""
    release = session.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本记录不存在。")

    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "product": "product",
        "channel": "channel",
        "version": "version",
        "release_date": "release_date",
        "upgrade_notes": "upgrade_notes",
    }
    changed: list[str] = []
    for field, column in mapping.items():
        if field in data and data[field] is not None:
            setattr(release, column, data[field])
            changed.append(field)

    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="没有需要更新的字段。"
        )
    session.flush()
    _audit(session, _admin_actor(admin), "release.update", release.id, ",".join(sorted(changed)))
    return _release_payload(release)


# 只读数据面：这些表过去在后台完全看不到，出问题时只能连库查
#
# 分页口径统一为 {items, total, limit, offset}。此前各接口一律 limit<=500 且没有
# offset，第 501 条之后的记录在界面上永远看不到 —— 而这几张表（登录尝试、验证码、
# 解绑事件）恰恰靠「翻旧账」定位问题，看不到旧记录等于白存。
def _page_bounds(limit: int, offset: int) -> tuple[int, int]:
    """分页参数的统一闸门：单页上限 500，offset 不允许负数或离谱的大值。"""
    size = max(1, min(int(limit or 200), 500))
    skip = max(0, min(int(offset or 0), 1_000_000))
    return size, skip


def _count_rows(session: Session, base) -> int:
    """数一个**未加 limit/order** 的 select 有多少行（供分页返回 total）。"""
    return int(
        session.execute(
            select(func.count()).select_from(base.order_by(None).subquery())
        ).scalar_one()
        or 0
    )


def _page(session: Session, base, order_by, *, limit: int, offset: int, render) -> dict:
    """给一个未加 limit/order 的 select 加排序与分页，并附上总数。

    ``render`` 是**逐行**调用的，所以只适合「载荷完全来自本行字段」的表
    （登录尝试、验证码、审计日志这类）。凡是每行还要去查关联对象（账号、授权、
    订单……），一律改用 :func:`_page_items` —— 逐行 ``session.get`` 就是 N+1：
    500 行会产生 500~1500 条独立查询，而列表页的响应时间因此随数据量线性增长。
    """
    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = session.scalars(base.order_by(*order_by).limit(size).offset(skip)).all()
    return {"items": [render(row) for row in rows], "total": total, "limit": size, "offset": skip}


def _page_items(session: Session, base, order_by, *, limit: int, offset: int, build) -> dict:
    """``_page`` 的两段式版本：先把**本页的行**整批交给 ``build(rows)``。

    存在的唯一理由是让「先取本页行、再一次性补关联数据」成为顺手写法。逐行
    ``session.get`` 的代价不是「多几条 SQL」那么轻：每一条都是一次独立的
    SQLite 往返，页大小 500 时是 500~1500 次，而这几张表（会话、令牌、核销记录）
    恰恰是**越积越多**的运维表 —— 出问题时要去翻的正是它们的旧记录。

    约定：``build`` 只能看到本页的行，所需的关联对象自己用 :func:`_by_ids`
    批量取，然后按行拼装。
    """
    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = session.scalars(base.order_by(*order_by).limit(size).offset(skip)).all()
    return {"items": build(rows), "total": total, "limit": size, "offset": skip}


def _by_ids(session: Session, model, ids) -> dict[str, object]:
    """按主键批量取行，返回 ``{主键: 行}``；空集合直接返回空字典。

    ``ids`` 里可以有 None 与重复值（调用方通常是 ``{row.license_id for row in rows}``），
    这里统一过滤。找不到的主键不进结果，调用方用 ``.get()`` 落到兜底值 ——
    与原来逐行 ``session.get`` 返回 None 的语义一致。
    """
    wanted = {item for item in ids if item}
    if not wanted:
        return {}
    return {
        row.id: row
        for row in session.scalars(select(model).where(model.id.in_(wanted)))
    }



def _cutoff_days(older_than_days: int) -> datetime:
    """清理入口的统一时间闸门：必须显式给出天数且至少 1 天。

    这样「一键清空全部」在接口层就不成立 —— 任何清理都只针对明确的天数之前。
    """
    try:
        days = int(older_than_days)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="older_than_days 必须是整数天。"
        ) from None
    if days < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="older_than_days 至少为 1 天。"
        )
    return utcnow() - timedelta(days=days)


#: 批量清理时每批取多少行（S30）。
#:
#: 500 这个量级的依据是 SQLite 的两条硬约束：一条 ``IN (...)`` 的变量数上限，
#: 以及「一批的写锁占用时间」要小到不会被用户感知。老版本 SQLite 的变量上限是 999，
#: 500 留了一半余量；再大的批次只会把写锁拉长，而清理本来就不急。
_PURGE_BATCH = 500


def _purge_rows(
    session: Session,
    admin: AdminAccount,
    *,
    model,
    pk,
    where,
    label: str,
    action: str,
    detail: str,
) -> dict:
    """按给定谓词分批删除。返回删除行数，并写一条审计（S30）。

    过去的写法是「先把命中的主键**全部**读进内存，再发一条 ``DELETE ... WHERE``」。后台这些清理按钮
    点的正是最容易攒出量的表（``account_sessions`` / ``license_sessions`` / ``recovery_tokens`` /
    ``email_verifications``）：运维勾「清理 0 天前的会话」时命中数可能是几十万，内存里先堆出等量的
    Python 字符串，再让 SQLite 在一个事务里删掉它们 —— 期间全站的写请求都被这把写锁挡住，而后台只
    看到按钮转圈。

    现在按 :data:`_PURGE_BATCH` 一批一批删：每批一个 ``DELETE``、批间 ``flush()``，写锁有机会在批与
    批之间让出去。删不完的下一轮继续 —— 端点本身是幂等的。

    批内用主键 ``IN`` 而不是把 ``where`` 再跑一遍：语义更硬 —— 删掉的正是刚读到的那些行。
    """
    total = 0
    while True:
        ids = list(session.scalars(select(pk).where(where).limit(_PURGE_BATCH)))
        if not ids:
            break
        session.execute(delete(model).where(pk.in_(ids)))
        session.flush()
        total += len(ids)
        if len(ids) < _PURGE_BATCH:
            break
    _audit(session, _admin_actor(admin), action, label, f"{detail}，共 {total} 条")
    return {"deleted": total, "detail": detail}


#: ``id_hash`` 是 ``sha256`` 的 hexdigest，合法前缀只可能是这些字符。
_HEX_CHARS = frozenset("0123456789abcdef")


def _resolve_by_hash_hint(session: Session, model, hint: str, label: str):
    """按「令牌哈希前缀」定位一行。

    列表接口只下发哈希前 12 位（48 bit）——足够做标识，又不至于把完整哈希（可用来
    在别处比对/冒用）暴露到浏览器里。删除/撤销时用同一个前缀回查：命中多行就要求
    调用方给更长的前缀，绝不猜。

    前缀**必须是纯十六进制**：``id_hash`` 是 ``sha256`` 的 hexdigest，所以这不是
    收窄、而是精确描述。顺带堵掉 LIKE 的通配符注入 —— 直接把输入拼进 ``like(f"{p}%")``
    时，``%`` 会匹配任意内容（8 个下划线 ``________`` 即可命中全表，把一个「按标识
    定位一行」的接口变成「批量命中」）；换成白名单校验比转义 ``ESCAPE`` 更不容易漏。
    """
    prefix = (hint or "").strip().lower()
    if len(prefix) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label}标识至少 8 位字符。"
        )
    if not set(prefix) <= _HEX_CHARS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label}标识只能是十六进制字符（0-9a-f）。",
        )
    rows = list(
        session.scalars(select(model).where(model.id_hash.like(f"{prefix}%")).limit(2))
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{label}不存在（可能已被清理）。"
        )
    if len(rows) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"该{label}标识不唯一，请提供更长的前缀。"
        )
    return rows[0]


@router.get("/sessions")
def admin_list_sessions(
    session: DbSession,
    _admin: AdminAccount,
    account_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """登录会话。只回令牌哈希的前 12 位做标识，不暴露完整哈希。"""
    base = select(AccountSession)
    if account_id:
        base = base.where(AccountSession.account_id == account_id)
    moment = utcnow()

    def build(rows) -> list[dict]:
        #: 账号映射整批取（原先每行一次 ``session.get``，500 行就是 500 次往返）。
        account_map = _by_ids(session, Account, (record.account_id for record in rows))
        return [
            {
                "ref": (record.id_hash or "")[:12],
                "accountId": record.account_id,
                "accountEmail": account_map[record.account_id].email
                if record.account_id in account_map
                else "",
                "isAdminSession": bool(record.is_admin_session),
                "ipAddress": record.ip_address,
                "userAgent": record.user_agent,
                "createdAt": iso(record.created_at),
                "lastSeenAt": iso(record.last_seen_at),
                "expiresAt": iso(record.expires_at),
                "expired": record.expires_at <= moment,
            }
            for record in rows
        ]

    return _page_items(
        session,
        base,
        (AccountSession.last_seen_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


@router.delete("/sessions/{ref}")
def admin_revoke_session(ref: str, session: DbSession, admin: AdminAccount) -> dict:
    """把单条登录会话踢下线。

    过去只能改密码或停用账号来「踢人」，两种做法都会连带踢掉该账号的**全部**会话
    （包括管理员自己正在用的那条）。这里按会话粒度撤销。
    """
    record = _resolve_by_hash_hint(session, AccountSession, ref, "登录会话")
    account = session.get(Account, record.account_id)
    email = account.email if account else record.account_id
    hint = (record.id_hash or "")[:12]
    session.delete(record)
    session.flush()
    _audit(session, _admin_actor(admin), "session.revoke", email, hint)
    return {"ref": hint, "revoked": True, "accountEmail": email}


@router.delete("/sessions")
def admin_purge_sessions(session: DbSession, admin: AdminAccount, older_than_days: int) -> dict:
    """清理早已过期的登录会话。

    安全谓词：只清 ``expires_at`` 本身早于截止时间的。未过期的会话一律保留 ——
    删掉等于把正在用的人踢下线。
    """
    cutoff = _cutoff_days(older_than_days)
    return _purge_rows(
        session,
        admin,
        model=AccountSession,
        pk=AccountSession.id_hash,
        where=AccountSession.expires_at < cutoff,
        label="登录会话",
        action="session.purge",
        detail=f"{older_than_days} 天前就已过期的会话",
    )


@router.get("/referral-ledger")
def admin_list_referral_ledger(
    session: DbSession,
    _admin: AdminAccount,
    account_id: str | None = None,
    kind: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """积分流水。余额由流水汇总而来，这张表是唯一的对账依据。"""
    base = select(ReferralLedger)
    if account_id:
        base = base.where(ReferralLedger.account_id == account_id)
    if kind:
        base = base.where(ReferralLedger.kind == kind)

    def build(rows) -> list[dict]:
        accounts = _by_ids(session, Account, (entry.account_id for entry in rows))
        return [
            {
                "id": entry.id,
                "accountId": entry.account_id,
                "accountEmail": accounts[entry.account_id].email
                if entry.account_id in accounts
                else "",
                "walletId": entry.wallet_id,
                "kind": entry.kind,
                "delta": money.format_centi(entry.delta_centi),
                "frozenDelta": money.format_centi(entry.frozen_delta_centi),
                "balanceAfter": money.format_centi(entry.balance_after_centi),
                "frozenAfter": money.format_centi(entry.frozen_after_centi),
                "note": entry.note,
                "reference": entry.reference,
                "orderId": entry.order_id,
                "createdAt": iso(entry.created_at),
            }
            for entry in rows
        ]

    return _page_items(
        session,
        base,
        (ReferralLedger.created_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


@router.get("/coupon-redemptions")
def admin_list_coupon_redemptions(
    session: DbSession,
    _admin: AdminAccount,
    coupon_id: str | None = None,
    account_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """优惠码的「曾占用过名额」历史凭证。

    注意它**不是**可随便清的日志：``per_account_limit`` 判定要读这张表，
    清掉一条就等于给那个账号重新开一个名额。所以这里只提供单条作废，
    不提供按时间批量清理（详见 ``admin_void_coupon_redemption``）。
    """
    base = select(CouponRedemption)
    if coupon_id:
        base = base.where(CouponRedemption.coupon_id == coupon_id)
    if account_id:
        base = base.where(CouponRedemption.account_id == account_id)

    def build(rows) -> list[dict]:
        #: 三张关联表各取一次，而不是每行三次（500 行时是 1500 → 3）。
        coupon_map = _by_ids(session, Coupon, (record.coupon_id for record in rows))
        account_map = _by_ids(session, Account, (record.account_id for record in rows))
        order_map = _by_ids(session, Order, (record.order_id for record in rows))
        items: list[dict] = []
        for record in rows:
            coupon = coupon_map.get(record.coupon_id)
            account = account_map.get(record.account_id)
            order = order_map.get(record.order_id) if record.order_id else None
            items.append(
                {
                    "id": record.id,
                    "couponId": record.coupon_id,
                    "couponCode": coupon.code if coupon else "",
                    "accountId": record.account_id,
                    "accountEmail": account.email if account else "",
                    "orderId": record.order_id,
                    "orderNo": order.order_no if order else "",
                    # 订单进了 RELEASED_STATUSES、名额已归还的核销记录，只是历史凭证；
                    # 其余状态（含 fulfilled / refunded）都仍占着名额。界面据此区分。
                    "orderStatus": order.status if order else "",
                    # 判据与 SQL 侧同源（coupons.holds_slot），不要再在这里写第二份规则：
                    # 两边不一致时，界面显示「占用中」而实际上名额已经放开了。
                    "holding": coupons.holds_slot(record, order),
                    "voidedAt": iso(record.voided_at) if record.voided_at else "",
                    "voidReason": record.void_reason or "",
                    "discountCents": int(record.discount_cents or 0),
                    "createdAt": iso(record.created_at),
                }
            )
        return items

    return _page_items(
        session,
        base,
        (CouponRedemption.created_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


def _recount_coupon_redemptions(session: Session, coupon: Coupon | None) -> int:
    """把 ``coupon.redeemed_count`` 按「仍占用名额」的核销记录重算。

    核销记录的作废会改变「此刻还被占用多少名额」，而这个计数参与
    ``max_redemptions`` 校验，所以任何一次作废之后都必须跟着重算，
    否则会出现「名额看着还有、下单却说领完」。

    谓词与下单校验（``store/api/store.py``）同源：``coupons.holds_slot_conditions()``
    —— 订单进了 ``RELEASED_STATUSES``、记录被作废、或订单已被删除，都不再计入。
    """
    if coupon is None:
        return 0
    used = int(
        session.execute(
            select(func.count(CouponRedemption.id))
            .outerjoin(Order, Order.id == CouponRedemption.order_id)
            .where(CouponRedemption.coupon_id == coupon.id)
            .where(*coupons.holds_slot_conditions())
        ).scalar_one()
        or 0
    )
    coupon.redeemed_count = used
    session.flush()
    return used


@router.delete("/coupon-redemptions/{redemption_id}")
def admin_void_coupon_redemption(
    redemption_id: str, session: DbSession, admin: AdminAccount
) -> dict:
    """作废一条核销记录（仅供纠错：重复核销、测试单、误发折扣）。

    **软删除**：置 ``voided_at`` 而不是删行。这张表有两个身份 —— 它既是
    ``per_account_limit`` 的判定依据（所以作废必须真的放开名额），又是
    「谁在什么时候用哪个码减了多少钱」的唯一凭证。过去直接 ``session.delete``
    等于把凭证本身删掉：审计日志里只剩一句「作废了某条记录」，被作废的折扣额、
    账号、订单号全部查不回来，对账时无法复核这次作废是否该做。

    作废后连带重算 ``coupon.redeemed_count``；这条记录的账号也因此重新获得一个
    名额。两件事都写进审计，事后可追。
    """
    record = session.get(CouponRedemption, redemption_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="核销记录不存在。")
    coupon = session.get(Coupon, record.coupon_id)
    account = session.get(Account, record.account_id)
    code = coupon.code if coupon else record.coupon_id

    #: 已作废的记录再点一次（双击、两个标签页）不再重复记账：置空时间会覆盖掉
    #: 第一次的作废人与时间，审计里就会出现两条「作废」却只有一个时间戳。
    already = record.voided_at is not None
    if not already:
        record.voided_at = utcnow()
        record.void_reason = f"后台作废（{_admin_actor(admin)}）"
        session.flush()
    used = _recount_coupon_redemptions(session, coupon)
    if not already:
        _audit(
            session,
            _admin_actor(admin),
            "coupon.redemption.void",
            code,
            (
                f"账号 {account.email if account else record.account_id}，"
                f"折扣 {int(record.discount_cents or 0) / 100:.2f} 元，"
                f"剩余占用名额 {used}"
            ),
        )
    return {
        "id": redemption_id,
        "deleted": True,
        "voided": not already,
        "alreadyVoided": already,
        "couponCode": code,
        "redeemedCount": used,
    }


@router.get("/customers")
def admin_list_customers(
    session: DbSession,
    _admin: AdminAccount,
    keyword: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    base = select(Customer)
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(or_(Customer.email.like(like), Customer.name.like(like)))

    def build(rows) -> list[dict]:
        #: 两个计数改成**每页两条**聚合查询（``GROUP BY customer_id``），而不是每行两条：
        #: 页大小 500 时原来要发 1000 条 ``SELECT count(*)``，客户表越大越慢。
        customer_ids = {row.id for row in rows}
        scope_ids = customer_ids or {""}
        order_counts = dict(
            session.execute(
                select(Order.customer_id, func.count(Order.id))
                .where(Order.customer_id.in_(scope_ids))
                .group_by(Order.customer_id)
            ).all()
        )
        license_counts = dict(
            session.execute(
                select(License.customer_id, func.count(License.id))
                .where(License.customer_id.in_(scope_ids))
                .group_by(License.customer_id)
            ).all()
        )
        return [
            {
                "id": customer.id,
                "accountId": customer.account_id,
                "email": customer.email,
                "name": customer.name,
                "createdAt": iso(customer.created_at),
                "orderCount": int(order_counts.get(customer.id, 0) or 0),
                "licenseCount": int(license_counts.get(customer.id, 0) or 0),
            }
            for customer in rows
        ]

    return _page_items(
        session,
        base,
        (Customer.created_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


@router.get("/login-attempts")
def admin_list_login_attempts(
    session: DbSession,
    _admin: AdminAccount,
    scope: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """登录尝试。排查「是不是被撞库了」时用，只存 scope 不存密码。"""
    base = select(LoginAttempt)
    if scope:
        base = base.where(LoginAttempt.scope == scope)
    return _page(
        session,
        base,
        (LoginAttempt.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=lambda record: {
            "id": record.id,
            "scope": record.scope,
            "succeeded": bool(record.succeeded),
            "createdAt": iso(record.created_at),
        },
    )


@router.delete("/login-attempts")
def admin_purge_login_attempts(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早于指定天数的登录尝试记录。这是纯日志表，删了不影响任何判定。"""
    cutoff = _cutoff_days(older_than_days)
    return _purge_rows(
        session,
        admin,
        model=LoginAttempt,
        pk=LoginAttempt.id,
        where=LoginAttempt.created_at < cutoff,
        label="登录尝试",
        action="login-attempt.purge",
        detail=f"{older_than_days} 天前",
    )


@router.get("/email-verifications")
def admin_list_email_verifications(
    session: DbSession,
    _admin: AdminAccount,
    email: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """邮箱验证码记录。``code_hash`` 属敏感字段，一律不下发。

    同时下发投递结果：``delivered`` 为 false 时运营可以当场判断「用户说没收到」
    是发信失败还是收件箱问题，不必再去翻（会轮转的）日志。
    老记录没有这几个字段，一律给 null / 空串，前端按「未记录」展示。
    """
    base = select(EmailVerification)
    if email:
        base = base.where(EmailVerification.email == email.strip().lower())
    moment = utcnow()
    return _page(
        session,
        base,
        (EmailVerification.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=lambda record: {
            "id": record.id,
            "email": record.email,
            "purpose": record.purpose,
            "attempts": int(record.attempts or 0),
            #: None 表示「本次没有真实发信」（log/echo 模式）
            "delivered": record.delivered,
            "deliveryMode": record.delivery_mode or "",
            "deliveryError": record.delivery_error or "",
            "deliveryAttempts": int(record.delivery_attempts or 0),
            "deliveredAt": iso(record.delivered_at),
            "consumedAt": iso(record.consumed_at),
            "expiresAt": iso(record.expires_at),
            "createdAt": iso(record.created_at),
            "settled": bool(record.consumed_at is not None or record.expires_at <= moment),
        },
    )


@router.delete("/email-verifications")
def admin_purge_email_verifications(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早于指定天数的验证码记录。

    安全谓词：只清**已消费或已过期**的。仍在有效期内、且没被用过的验证码
    清掉会让用户正在走的注册/改密流程凭空失败，所以一律留在库里。
    """
    cutoff = _cutoff_days(older_than_days)
    where = and_(
        EmailVerification.created_at < cutoff,
        or_(
            EmailVerification.consumed_at.isnot(None),
            EmailVerification.expires_at < utcnow(),
        ),
    )
    return _purge_rows(
        session,
        admin,
        model=EmailVerification,
        pk=EmailVerification.id,
        where=where,
        label="邮箱验证码",
        action="email-verification.purge",
        detail=f"{older_than_days} 天前的已消费/已过期记录",
    )


@router.get("/device-release-events")
def admin_list_device_release_events(
    session: DbSession,
    _admin: AdminAccount,
    license_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """设备解绑历史。冷却时间是否该放行，看这张表。"""
    base = select(DeviceReleaseEvent)
    if license_id:
        base = base.where(DeviceReleaseEvent.license_id == license_id)

    def build(rows) -> list[dict]:
        licenses = _by_ids(session, License, (event.license_id for event in rows))
        return [
            {
                "id": event.id,
                "licenseId": event.license_id,
                "codeHint": licenses[event.license_id].code_hint
                if event.license_id in licenses
                else "",
                "accountId": event.account_id,
                "instanceId": event.instance_id,
                "source": event.source,
                "createdAt": iso(event.created_at),
            }
            for event in rows
        ]

    return _page_items(
        session,
        base,
        (DeviceReleaseEvent.created_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


@router.delete("/device-release-events")
def admin_purge_device_release_events(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早于指定天数的解绑事件。

    安全谓词：**每条授权的最新一条解绑事件永远保留**。冷却判定读的正是「最近一次
    解绑时间」，只有历史事件才是可丢的日志；如果按时间一刀切，把某条授权的唯一
    事件删掉会顺带解除冷却，等于放行了它本该被拦住的自助解绑。
    """
    cutoff = _cutoff_days(older_than_days)
    newer = aliased(DeviceReleaseEvent)
    latest_for_license = (
        select(func.max(newer.created_at))
        .where(newer.license_id == DeviceReleaseEvent.license_id)
        .scalar_subquery()
    )
    where = and_(
        DeviceReleaseEvent.created_at < cutoff,
        DeviceReleaseEvent.created_at < latest_for_license,
    )
    return _purge_rows(
        session,
        admin,
        model=DeviceReleaseEvent,
        pk=DeviceReleaseEvent.id,
        where=where,
        label="设备解绑事件",
        action="device-release-event.purge",
        detail=f"{older_than_days} 天前（保留每条授权的最新一次）",
    )


# 审计日志
# 客户端侧会话与令牌：过去完全没有入口，只能靠解绑/删绑定级联清理
@router.get("/license-sessions")
def admin_list_license_sessions(
    session: DbSession,
    _admin: AdminAccount,
    license_id: str | None = None,
    binding_id: str | None = None,
    active_only: bool = False,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """客户端登录会话。

    这是「谁在用这张授权」的直接证据：``last_used_at`` 是心跳时间，
    ``binding_id`` 指向具体设备。过去后台只能看到设备绑定、看不到会话，
    排查「同一张授权被多处同时使用」时无从下手。
    """
    base = select(LicenseSession)
    moment = utcnow()
    if license_id:
        base = base.where(LicenseSession.license_id == license_id)
    if binding_id:
        base = base.where(LicenseSession.binding_id == binding_id)
    if active_only:
        base = base.where(LicenseSession.expires_at > moment)

    def build(rows) -> list[dict]:
        bindings = _by_ids(session, DeviceBinding, (record.binding_id for record in rows))
        licenses = _by_ids(session, License, (record.license_id for record in rows))
        return [
            {
                "ref": (record.id_hash or "")[:12],
                "sessionId": record.session_id,
                "licenseId": record.license_id,
                "codeHint": licenses[record.license_id].code_hint
                if record.license_id in licenses
                else "",
                "bindingId": record.binding_id,
                "instanceId": bindings[record.binding_id].instance_id
                if record.binding_id in bindings
                else None,
                "bindingActive": bool(bindings[record.binding_id].active)
                if record.binding_id in bindings
                else False,
                "createdAt": iso(record.created_at),
                "lastUsedAt": iso(record.last_used_at),
                "expiresAt": iso(record.expires_at),
                "expired": record.expires_at <= moment,
            }
            for record in rows
        ]

    return _page_items(
        session,
        base,
        (LicenseSession.last_used_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


@router.delete("/license-sessions/{ref}")
def admin_revoke_license_session(ref: str, session: DbSession, admin: AdminAccount) -> dict:
    """撤销一条客户端会话。下一次心跳会因为会话不存在而要求重新激活。"""
    record = _resolve_by_hash_hint(session, LicenseSession, ref, "授权会话")
    license_ = session.get(License, record.license_id)
    hint = (record.id_hash or "")[:12]
    session.delete(record)
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "license-session.revoke",
        license_.code_hint if license_ else record.license_id,
        hint,
    )
    return {"ref": hint, "revoked": True, "codeHint": license_.code_hint if license_ else ""}


@router.delete("/license-sessions")
def admin_purge_license_sessions(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早已过期的客户端会话。

    安全谓词：只清 ``expires_at`` 本身早于截止时间的（也就是早就失效的）。
    未过期的会话一律保留 —— 删掉等于把在线客户端踢下线。
    """
    cutoff = _cutoff_days(older_than_days)
    return _purge_rows(
        session,
        admin,
        model=LicenseSession,
        pk=LicenseSession.id_hash,
        where=LicenseSession.expires_at < cutoff,
        label="授权会话",
        action="license-session.purge",
        detail=f"{older_than_days} 天前就已过期的会话",
    )


@router.get("/recovery-tokens")
def admin_list_recovery_tokens(
    session: DbSession,
    _admin: AdminAccount,
    license_id: str | None = None,
    binding_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """设备找回令牌。只回哈希前 12 位做标识，完整哈希不下发。"""
    base = select(RecoveryToken)
    moment = utcnow()
    if license_id:
        base = base.where(RecoveryToken.license_id == license_id)
    if binding_id:
        base = base.where(RecoveryToken.binding_id == binding_id)

    def build(rows) -> list[dict]:
        bindings = _by_ids(session, DeviceBinding, (record.binding_id for record in rows))
        licenses = _by_ids(session, License, (record.license_id for record in rows))
        return [
            {
                "ref": (record.id_hash or "")[:12],
                "licenseId": record.license_id,
                "codeHint": licenses[record.license_id].code_hint
                if record.license_id in licenses
                else "",
                "bindingId": record.binding_id,
                "instanceId": bindings[record.binding_id].instance_id
                if record.binding_id in bindings
                else None,
                "createdAt": iso(record.created_at),
                "expiresAt": iso(record.expires_at),
                "expired": record.expires_at <= moment,
            }
            for record in rows
        ]

    return _page_items(
        session,
        base,
        (RecoveryToken.created_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


@router.delete("/recovery-tokens/{ref}")
def admin_revoke_recovery_token(ref: str, session: DbSession, admin: AdminAccount) -> dict:
    """作废一条找回令牌（设备丢了或令牌疑似外泄时用）。"""
    record = _resolve_by_hash_hint(session, RecoveryToken, ref, "找回令牌")
    license_ = session.get(License, record.license_id)
    hint = (record.id_hash or "")[:12]
    session.delete(record)
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "recovery-token.revoke",
        license_.code_hint if license_ else record.license_id,
        hint,
    )
    return {"ref": hint, "revoked": True, "codeHint": license_.code_hint if license_ else ""}


@router.delete("/recovery-tokens")
def admin_purge_recovery_tokens(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早已过期的找回令牌。安全谓词同客户端会话：只清已经失效的。"""
    cutoff = _cutoff_days(older_than_days)
    return _purge_rows(
        session,
        admin,
        model=RecoveryToken,
        pk=RecoveryToken.id_hash,
        where=RecoveryToken.expires_at < cutoff,
        label="找回令牌",
        action="recovery-token.purge",
        detail=f"{older_than_days} 天前就已过期的令牌",
    )


@router.get("/audit-logs")
def admin_audit_logs(
    session: DbSession, _admin: AdminAccount, limit: int = 100, offset: int = 0
) -> dict:
    return _page(
        session,
        select(AuditLog),
        (AuditLog.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=lambda row: {
            "id": row.id,
            "actor": row.actor,
            "action": row.action,
            "target": row.target,
            "detail": row.detail,
            "createdAt": iso(row.created_at),
        },
    )


@router.delete("/audit-logs/{log_id}")
def admin_delete_audit_log(log_id: str, session: DbSession, admin: AdminAccount) -> dict:
    log = session.get(AuditLog, log_id)
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="审计记录不存在。")
    label = f"{log.action} {log.target}".strip()
    session.delete(log)
    session.flush()
    _audit(session, _admin_actor(admin), "audit.delete", log_id, label)
    return {"id": log_id, "deleted": True, "label": label}


@router.delete("/audit-logs")
def admin_purge_audit_logs(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """按时间批量清理审计日志。

    ``older_than_days`` 是**必填**查询参数且最小为 1 天（闸门见 ``_cutoff_days``）：
    这样「一键清空全部」在接口层面就不成立，只能清理明确指定天数之前的记录。
    本次清理动作自己也会写入一条审计记录（其时间为当前时刻，落在保留区内，
    不会被自己删掉）。
    """
    cutoff = _cutoff_days(older_than_days)
    result = _purge_rows(
        session,
        admin,
        model=AuditLog,
        pk=AuditLog.id,
        where=AuditLog.created_at < cutoff,
        label="审计日志",
        action="audit.purge",
        detail=f"older_than_days={older_than_days}",
    )
    return {
        "deleted": result["deleted"],
        "olderThanDays": older_than_days,
        "cutoff": iso(cutoff),
    }
