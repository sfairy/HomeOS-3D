"""管理后台 API：``/store-admin/v1/*``。

参考站没有公开管理台，这里自建最小可用后台，让商店「可运营」：
商品、订单、激活码、设备绑定、优惠码、提现审核、站点配置。
"""

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from apps.store.commerce import fulfill, money, referrals
from apps.store.ops import features, incidents, site_settings as site_config
from apps.store.core.deps import AdminAccount, DbSession, SettingsDep
from apps.store.commerce.expiry import expire_stale_orders
from apps.store.commerce.order_status import (
    ORDER_ATTENTION_STATUSES,
    ORDER_STATUS_LABELS,
    ORDER_STATUS_CHOICES,
)
from apps.store.commerce.order_status import (
    FULFILLABLE_STATUSES as ORDER_FULFILLABLE_STATUSES,
)
from apps.store.commerce.order_status import (
    REFUNDABLE_STATUSES as ORDER_REFUNDABLE_STATUSES,
)
from apps.store.commerce.points_migration import migration_status
from apps.store.payments.sweeper import sweep_status
from apps.store.core.models import (
    Account,
    DeviceBinding,
    Entitlement,
    License,
    Order,
    Product,
    ReferralWallet,
    ReferralWithdrawal,
)
from apps.store.core.schemas import (
    AdminLicensePatch,
    AdminWalletAdjustRequest,
)
from apps.store.security.security import (
    iso_z,
    utcnow,
)  # noqa: F401

logger = logging.getLogger("apps.store.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
# 于是本文件剩下的 57 条路由不用改任何一处调用。
from . import admin_coupons
from . import admin_accounts
from . import admin_licenses
from . import admin_entitlements
from . import admin_ops
from . import admin_compliance
from . import admin_withdrawals
from . import admin_bindings
from . import admin_orders
from . import admin_products
from . import admin_settings
from .admin_shared import (
    OVERVIEW_EXPIRING_DAYS,
    PAID_MONEY_STATUSES,
    _OVERVIEW_WINDOWS,
    _admin_actor,
    _audit,
    _billable_money_clause,
    _license_detail,
    _naive_utc,
    _window_money,
)

router = APIRouter(prefix="/store-admin/v1", tags=["admin"])



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
    # 人工补记（未收到钱）单独统计：不进营收，但必须看得见。
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
    # 「待发货」= 钱已到账但还没发出去；失败状态逐项单列，因为它们不是「排队等自动发货」，
    # 而是「自动发货炸了 / 付款没成、必须人工重试或退款」。计数按唯一清单 ORDER_ATTENTION_STATUSES。
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
            select(func.count(DeviceBinding.id)).where(DeviceBinding.live_clause())
        ),
        "serverTime": iso_z(moment),
        "maintenanceMode": bool(setting.maintenance_mode),
        # 后台巡检（查单对账 / 关闭过期渠道交易）的存活状态。它坏掉时没有任何
        # 接口会报错——钱照收、单停在待支付——所以必须由概览主动把它摆出来。
        "paymentSweep": sweep_status(),
        # 被刻意吞掉的资金/履约异常计数。与巡检同理：这些异常不会让任何接口
        # 报错，只会让「钱收了、码没发」悄悄发生，所以必须主动摆出来。
        "incidents": incidents.status(),
        # 启动期积分口径迁移的结果。对账不通过时旧列会被保留，而旧列是 NOT NULL
        # 且无 DDL 默认值 —— 那是**之后每次下单写入**才炸的，届时已经与迁移无关了，
        # 所以要在概览里能回看到「本次启动到底迁干净了没有」。
        "pointsMigration": migration_status(),
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
    """确认（清零）资金/履约异常计数。

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








@router.get("/feature-codes")
def admin_feature_codes(_admin: AdminAccount) -> dict:
    """商品可选的功能码目录（中文名 + 说明）。

    目录定义在 ``apps/store/ops/features.py``，与主程序的能力码一一对应。后台下拉多选
    直接渲染它，运营不再手写代码，也就不会把 ``ha.control`` 抄成 ``ha.contorl``
    这种「不报错但客户端静默拦截」的隐性故障。
    """
    return features.feature_catalog_payload()


# products 资源组第 1 段（include 放在原位置以保持顺序）。
router.include_router(admin_products.router)



#: 订单状态中文口径统一来自 ``apps.store.commerce.order_status``（服务端唯一来源），
#: 避免「后台弹窗说 cancelled、页面显示已取消」这种同一状态两套说法。
#: 取文案一律走 ``order_status_label()`` 或 ``ORDER_STATUS_LABELS``（后者用于
#: 批量拼列表），不要在后台再留一份「本地副本」——曾经那份 `_ORDER_STATUS_LABELS`
#: 就是没人读的别名，`_status_label` 那种一层转发也算同一种病。


@router.get("/order-status-meta")
def admin_order_status_meta(_admin: AdminAccount) -> dict:
    """下发订单状态词表与两个动作集合（后台下拉、标签、按钮门禁的唯一来源）。

    这份元数据存在的理由是可验证的：后台曾把「哪些状态能履约 / 能退款」手写成
    ``['pending','paid']`` / ``['paid','fulfilled']``，于是 ``fulfillment_failed``
    （概览的待办卡片明确写着「请到订单里重试履约或退款」）在所有按钮的判据里都不在列 ——
    运营按提示点进筛选列表，看到的是一排没有任何操作的订单；``partially_refunded``
    同理（服务端允许退第二次，界面不给按钮）。筛选下拉还漏了 ``partially_refunded``，
    从漏斗图点进来时 ``select.value`` 设不上，静默退化成「全部状态」。

    这类漂移不会有任何报错，只表现为「说好的按钮没有」。状态集合与词表都只有一份，
    需要它们的界面从这里取，不再在模板里抄第二份。
    """
    return {
        "labels": dict(ORDER_STATUS_LABELS),
        "choices": list(ORDER_STATUS_CHOICES),
        "fulfillable": list(ORDER_FULFILLABLE_STATUSES),
        "refundable": list(ORDER_REFUNDABLE_STATUSES),
    }


# orders 资源组第 1 段（include 放在原位置以保持顺序）。
router.include_router(admin_orders.router)


# 激活码
# licenses 资源组在 admin_licenses.py（include 放在原位置以保持路由注册顺序）。
router.include_router(admin_licenses.router)
# bindings 资源组第 1 段（include 放在原位置以保持顺序）。
router.include_router(admin_bindings.router)


# 优惠码
# coupons 资源组在 admin_coupons.py（include 放在原位置以保持路由注册顺序）。
router.include_router(admin_coupons.router)
# withdrawals 资源组第 1 段（include 放在原位置以保持顺序）。
router.include_router(admin_withdrawals.router)


# 站点配置资源组在 admin_settings.py；include 放在这里而不是文件末尾，
# 是为了让路由注册顺序与原文件逐条一致（FastAPI 按注册序匹配）。
router.include_router(admin_settings.router)
# accounts 资源组在 admin_accounts.py（include 放在原位置以保持路由注册顺序）。
router.include_router(admin_accounts.router)


@router.patch("/licenses/{license_id}")
def admin_patch_license(
    license_id: str,
    payload: AdminLicensePatch,
    session: DbSession,
    settings: SettingsDep,
    admin: AdminAccount,
) -> dict:
    """修正授权的有效期 / 备注。
    到期时间的三种给法互斥、避免一次请求里两个字段互相覆盖：``extend_days`` 在现有到期时间上顺延
    （永久授权以当前时刻重新计时）；``access_expires_at`` 指定绝对时间、显式传 null 表示改为永久；
    只给 ``validity_days`` 则按开始时间重算，避免「买的 365 天、实际只到明年」。
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




# entitlements 资源组在 admin_entitlements.py（include 放在原位置以保持路由注册顺序）。
router.include_router(admin_entitlements.router)
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

    #: NaN / Infinity 必须在这里被挡掉：JSON 标准没有这两个字面量，但 Python 的 ``json``
    #: 默认**接受**它们，构造请求体就能把 nan 写进钱包余额——``nan == 0`` 与 ``nan < 0``
    #: 全为假，两道守卫都被绕过且余额永远算不回正常值。``money.to_centi`` 抛 ValueError，翻成 400。
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
        #: 上面那次判断只是**为了给出带数字的文案**，挡不住并发：两个调账请求各自读到同一份
        #: 余额、各自算出「不会为负」再写回，后写覆盖先写，负余额就这么落库（接口还返回 200）。
        #: 真正的守卫传进 ``ledger_entry``，与加法压在同一条 UPDATE 的 WHERE 里，匹配不到即拒。
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




# products 资源组第 2 段（include 放在原位置以保持顺序）。
router.include_router(admin_products.router_extra)


# bindings 资源组第 2 段（include 放在原位置以保持顺序）。
router.include_router(admin_bindings.router_extra)






# 该资源组在 admin_ops.py（include 放在原位置以保持路由注册顺序）。
router.include_router(admin_ops.router)


# 该资源组在 admin_compliance.py（include 放在原位置以保持路由注册顺序）。
router.include_router(admin_compliance.router)
