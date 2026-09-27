"""运营后台的 licenses 资源组（从 api/admin.py 拆出）。

子路由不带前缀（路径本身就是绝对路径），由父路由 admin.py 在**原来的位置**
router.include_router() 套上 /store-admin/v1 —— 位置决定注册顺序，FastAPI 按注册序匹配路由，
所以每拆一组都要用 72 条路由基线逐项比对（含顺序）。
"""
from __future__ import annotations

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select

from apps.store.commerce import fulfill
from apps.store.ops import site_settings as site_config
from apps.store.api.store_catalog import (
    _license_meta,
)
from apps.store.core.deps import AdminAccount, DbSession, SettingsDep
from apps.store.core.models import (
    Account,
    Customer,
    DeviceBinding,
    License,
)
from apps.store.core.schemas import (
    AdminLicenseRequest,
    AdminOrderActionRequest,
)
from apps.store.security.security import (
    activation_code_hint,
    iso_z,
    utcnow,
)  # noqa: F401
from apps.store.core.serializers import (
    license_payload,
)

logger = logging.getLogger("apps.store.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
# 于是本文件剩下的 57 条路由不用改任何一处调用。
from .admin_shared import (
    _admin_actor,
    _audit,
    _cooldown,
    _count_rows,
    _page_bounds,
    _product_or_404,
)


router = APIRouter()


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

    # 与订单履约走同一条「撞码重试」路径，否则同一种冲突在这里是 500、
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
    不可恢复，所以两道守卫：必须**先停用**（强制「停用 → 再删」两步），且不允许存在仍活跃的设备绑定。
    ``orders.license_id`` / ``orders.target_license_id`` 是 ON DELETE SET NULL，订单会保留、只是不再指向它。
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
            DeviceBinding.license_id == license.id, DeviceBinding.live_clause()
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
