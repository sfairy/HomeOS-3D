"""运营后台的 coupons 资源组（从 api/admin.py 拆出）。

子路由不带前缀（路径本身就是绝对路径），由父路由 admin.py 在**原来的位置**
router.include_router() 套上 /store-admin/v1 —— 位置决定注册顺序，FastAPI 按注册序匹配路由，
所以每拆一组都要用 72 条路由基线逐项比对（含顺序）。
"""
from __future__ import annotations

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select

from apps.store.commerce import coupons
from apps.store.core.deps import AdminAccount, DbSession
from apps.store.core.models import (
    Coupon,
    CouponRedemption,
)
from apps.store.core.schemas import (
    AdminCouponPatch,
    AdminCouponRequest,
)
from apps.store.security.security import (
    iso,
    utcnow,
)  # noqa: F401
from apps.store.core.serializers import (
    json_list,
    list_json,
)

logger = logging.getLogger("apps.store.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
# 于是本文件剩下的 57 条路由不用改任何一处调用。
from .admin_shared import (
    _admin_actor,
    _audit,
    _count_rows,
    _naive_utc,
    _page_bounds,
)


router = APIRouter()


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
    刻意不用 ``Coupon.redeemed_count`` 计数列：它是快照，一旦与核销记录漂移，删除守卫（数记录）与
    界面提示（读计数列）就会各说各话。``coupon_ids`` 给出时只统计这些码（列表页把全表 group by 降成
    本页 ``in_``），为 None 时统计全部。
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
    两个「用量」字段刻意分开：``redeemedCount`` 读计数列，表示**此刻还被占用多少名额**（参与
    ``max_redemptions`` 校验，取消/退款会让它回落）；``redemptionCount`` 数控销记录，表示**历史上被
    占用过多少次**（作为对账凭证永久保留，也是删除守卫的判据）。混成一个字段就会出现「确认弹窗写着
    没人用过、点下去却只停用」。
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
    核销记录不会被删除（作废只是打标记，见 ``admin_void_redemption``），所以 ``redeemed_count``
    在任何时刻都能由记录**重算**出来（``_recount_coupon_usage``）—— 它是「此刻还被占用多少名额」的
    唯一权威；而「历史上被占用过多少次」是另一个字段 ``redemptionCount``，两者不可互相替代。
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
