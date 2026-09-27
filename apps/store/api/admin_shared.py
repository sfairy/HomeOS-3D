"""运营后台的共享助手：审计落库、锁定保护、金额窗口、账号与会话清理。

从 api/admin.py 拆出来的第一步（那个文件 4479 行、57 条路由）。这一层是**所有资源组都要用**的
东西 —— 概览、商品、订单、优惠码、提现、账号每一块都要写审计、都要做"不能把自己锁在外面"的
保护、都要按窗口算钱。原来它们挤在路由之间，拆出去之后每个资源组只依赖它，不再互相看见。

这一层刻意不 import 任何路由模块：依赖是单向的（资源组 → 共享助手），不会出现循环导入。
"""
from __future__ import annotations

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from apps.store.commerce import money
from apps.store.ops import site_settings as site_config
from apps.store.core.deps import AdminAccount, SettingsDep
from apps.store.core.models import (
    Account,
    AccountSession,
    AuditLog,
    License,
    Order,
    Product,
    ReferralWallet,
    StoreSetting,
)
from apps.store.security.security import (
    iso,
)  # noqa: F401
from apps.store.commerce.order_status import ORDER_STATUS_LABELS
from apps.store.commerce.order_status import (
    FULFILLABLE_STATUSES as ORDER_FULFILLABLE_STATUSES,
)


logger = logging.getLogger(__name__)


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
#: 营收与订单量按「滚动时间窗」统计，而不是「自然日」：后台没有站点时区配置，服务端
#: 算自然日只能用 UTC 或服务器本地时区（运营眼里都是猜的），滚动窗口与运营时区无关。
_OVERVIEW_WINDOWS: tuple[tuple[str, timedelta], ...] = (
    ("last24h", timedelta(hours=24)),
    ("last7d", timedelta(days=7)),
    ("last30d", timedelta(days=30)),
)

#: 真的收到过钱的状态。``fulfillment_failed`` 的钱已到账（只是没发出去），``partially_refunded``
#: 表示「收到过钱、退了一部分、还有余额没退」，两者都必须计入，否则部分退款订单的营收会算成 0。
#:
#: 与 ``order_status.REFUNDABLE_STATUSES`` 的**唯一差别是多一个 ``refunded``**，这不是疏漏而是
#: 故意的：全额退完的订单已经不能再退（故不在可退集合里），但营收的 gross / refund 两端都发生在
#: 它身上，历史口径必须留着它。改这个集合前先读这句，别把 ``refunded`` 「对齐」掉。
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
    """营收口径的过滤条件：**排除人工补记**。
    后台「标记支付 / 履约」会给还没收到钱的订单盖上 ``paid_at``，而营收按 ``paid_at`` 汇总 ——
    点一下就凭空空出一笔营收，所以人工补记的订单单独打标（``Order.manual_settlement``）、照常发码但
    不计入营收。返回可用在 ``.where()`` 里的子句而非布尔常量，是为了让三处 KPI 都不会各自漏掉它。
    """
    return Order.manual_settlement.is_(False)


def _window_money(session: Session, since: datetime) -> dict:
    """统计 ``[since, now)`` 内的收款、退款与付款订单数（后台三处 KPI 都读它）。
    时间归属按 ``paid_at``（不是 ``created_at``，否则「上周下单今天付款」会算错周）；``grossCents``
    是订单实付（已减优惠码）；``refundCents`` 读 ``refund_amount_cents`` 以支持部分退款；人工补记的
    订单单列成 ``manualCents`` / ``manualOrders``，直接丢掉会让运营看不到人工放行量。
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


# —— 分页助手 ——
# 从 api/admin.py 搬来的：概览、商品、订单、优惠码、提现、账号、账号、授权码每一组都要分页，
# 原先它们散在两组之间，是"跨组共享"的典型；放在这里之后各资源组只依赖共享层，彼此不再看见。
# 只读数据面：登录尝试、验证码、解绑事件等表，出问题时靠「翻旧账」定位
# 分页口径统一为 {items, total, limit, offset}：只给 limit 没有 offset 时，
# 第 501 条之后的记录在界面上永远看不到 —— 看不到旧记录等于白存。
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
    存在的唯一理由是让「先取本页行、再一次性补关联数据」成为顺手写法：逐行 ``session.get`` 每条都是
    一次独立的 SQLite 往返，页大小 500 时是 500~1500 次，而会话/令牌/核销这几张恰恰是越积越多的表。
    约定：``build`` 只能看到本页的行，所需关联对象自己用 :func:`_by_ids` 批量取后按行拼装。
    """
    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = session.scalars(base.order_by(*order_by).limit(size).offset(skip)).all()
    return {"items": build(rows), "total": total, "limit": size, "offset": skip}


# —— 授权码详情 ——
# 被两处用：admin_licenses.py（列表/签发）与仍留在 admin.py 的 PATCH /licenses/{license_id}。
# 拆组时它先跟着 accounts 组被吸收走了，admin.py 那边只剩一个未定义引用（F821）——
# "组内定义被组外用"是抽取器原先漏掉的一整个方向，已记进它的判据。
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

# _license_detail 依赖的两个名字（从 licenses 组的导入块里对齐过来的）。
from apps.store.api.store_catalog import _license_meta
from apps.store.core.serializers import license_payload

# 组内外都要用（entitlements 组与仍留在 admin.py 的 referral-wallets 路由），故放共享层。
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

# _entitlement_payload 依赖的三个名字。
from apps.store.core.models import Entitlement
from apps.store.security.security import utcnow
from apps.store.security.security import iso_z

# —— 批量查询与清理助手 ——
# 从 api/admin.py 搬来：尾部「会话/合规」两块与仍留在 admin.py 的路由都要用它们。
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


#: 批量清理时每批取多少行。
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
    """按给定谓词分批删除。返回删除行数，并写一条审计。
    必须分批是因为这些清理按钮点的正是最容易攒量的表，「清理 0 天前的会话」可能命中几十万行，一次删完
    会让全站写请求被写锁挡住。按 :data:`_PURGE_BATCH` 一批一批删，批间 ``flush()`` 让写锁有机会让出去；
    删不完下一轮继续，端点本身幂等。批内用主键 ``IN`` 而不是把 ``where`` 再跑一遍，语义更硬。
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
    列表接口只下发哈希前 12 位（48 bit），足够做标识又不暴露完整哈希；回查命中多行就要求调用方给更长
    前缀，绝不猜。前缀**必须是纯十六进制**（``id_hash`` 是 sha256 的 hexdigest），这同时堵掉 LIKE 的
    通配符注入 —— 直接把输入拼进 ``like(f"{p}%")`` 时 ``%`` 会匹配任意内容，把一个「按标识定位一行」的
    接口变成批量命中。
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

# 组内外都要用，故放共享层：_FULFILLABLE_STATUS_TEXT, _admin_product_context, _product_admin_payload, _product_delete_refs, _safe_image_target
# —— 被搬来的五个助手依赖的名字（从 api/admin.py 的导入块里对齐过来）——
# 只搬定义不搬依赖的话，这里的 _product_stats / _image_map / product_payload 会变成
# 运行时 NameError（调用商品列表时才炸），Path 则只在类型注解里，连报错都要等 F821 静态检查。
from pathlib import Path
from apps.store.api.store_catalog import _image_map
from apps.store.api.store_catalog import _product_stats
from apps.store.core.serializers import product_payload

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

    ``product_ids`` 只影响 ``stats``：它的聚合条件可以收窄成 ``IN (...)``，
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

# 订单
#: 可履约状态的中文清单（拼 409 文案用）：由 ``ORDER_FULFILLABLE_STATUSES`` 现算，
#: 不再手写「只有待付款或已付款的订单可以履约」—— 那种手写文案在集合加入
#: ``fulfillment_failed`` 之后就与事实相反了，而它只出现在报错路径上，没人会发现。
_FULFILLABLE_STATUS_TEXT = " / ".join(
    ORDER_STATUS_LABELS.get(code, code) for code in ORDER_FULFILLABLE_STATUSES
)

# 商品图片 / 设备绑定：删除与修正
def _safe_image_target(root: Path, raw: str) -> Path | None:
    """把库里的商品图相对路径解析成绝对路径；越界返回 ``None``。
    防目录穿越：``path`` 不排除被改过或历史数据里就有 ``../``，越界路径绝不能落到文件系统调用上
    （等于「能改库就能删任意文件」），删单图与删商品两处必须共用这一份判断。内部对 ``root`` 也做一次
    ``resolve()``：macOS 上 ``/var`` 是指向 ``/private/var`` 的符号链接，一旦传入未解析的 root，
    ``root not in target.parents`` 会对所有路径成立、函数变成永远返回 None。
    """
    base = root.resolve()
    if not raw:
        return None
    target = (base / raw).resolve()
    if target == base or base not in target.parents:
        return None
    return target
