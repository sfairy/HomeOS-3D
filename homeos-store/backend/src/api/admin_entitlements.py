"""运营后台的 entitlements 资源组（从 api/admin.py 拆出）。
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import and_, or_, select

from ..core.deps import AdminAccount, DbSession
from ..core.models import (
    Entitlement,
    License,
)
from ..core.schemas import (
    AdminEntitlementPatch,
    AdminEntitlementRequest,
)
from ..ops import features
from ..security.security import (
    utcnow,
)

logger = logging.getLogger("src.admin")


from .admin_shared import (
    _admin_actor,
    _audit,
    _entitlement_payload,
    _naive_utc,
    _page,
)

router = APIRouter()


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
    """
    license = session.get(License, payload.license_id)
    if license is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="授权不存在。")
    feature_code = payload.feature_code.strip()
    if feature_code not in features.FEATURE_CODES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
        if feature_code not in features.FEATURE_CODES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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


