"""运营后台的 bindings 资源组（从 api/admin.py 拆出）。
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from ..core.deps import AdminAccount, DbSession
from ..core.models import (
    DeviceBinding,
    DeviceReleaseEvent,
    License,
)
from ..core.schemas import (
    AdminOrderActionRequest,
)
from ..security.security import (
    iso_z,
    utcnow,
)

logger = logging.getLogger("src.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
from .admin_shared import (
    _admin_actor,
    _audit,
    _count_rows,
    _page_bounds,
)

router = APIRouter()

router_extra = APIRouter()


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
    """
    base = select(DeviceBinding)
    if active_only:
        base = base.where(DeviceBinding.live_clause())
    if keyword:
        like = f"%{keyword.strip()}%"
        # 激活码提示也要能搜到：docstring 与后台搜索框都承诺了这一点，但这里的
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
            #: 名字是 ``bound`` 而不是 ``active``：字段名一旦叫 ``active``，读的人会
            "bound": bool(binding.is_live),
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
    session.flush()
    _audit(session, _admin_actor(admin), "binding.release", binding.id, payload.note)
    return {"bindingId": binding.id, "released": True}


@router_extra.delete("/bindings/{binding_id}")
def admin_delete_binding(binding_id: str, session: DbSession, admin: AdminAccount) -> dict:
    """物理删除设备绑定记录。
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
