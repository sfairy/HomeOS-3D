"""运营后台的 licenses 资源组（从 api/admin.py 拆出）。
"""
from __future__ import annotations

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select

from src.commerce import fulfill
from src.ops import site_settings as site_config
from src.api.store_catalog import (
    _license_meta,
)
from src.core.deps import AdminAccount, DbSession, SettingsDep
from src.core.models import (
    Account,
    Customer,
    DeviceBinding,
    License,
)
from src.core.schemas import (
    AdminLicenseRequest,
    AdminOrderActionRequest,
)
from src.security.security import (
    activation_code_hint,
    iso_z,
    utcnow,
)  # noqa: F401
from src.core.serializers import (
    license_payload,
)

logger = logging.getLogger("src.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
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

    license = fulfill.insert_license_with_unique_code(session, build)
    # 审计只记 id + 提示码，**绝不落激活码明文**：激活码就是这张授权的凭证，
    _audit(
        session,
        _admin_actor(admin),
        "license.issue",
        license.id,
        f"{license.code_hint}（人工签发）",
    )
    return {
        "activationCodeId": license.id,
        # 明文取自这一行本身（``activation_code`` 列存的就是明文，激活要按它查；
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
