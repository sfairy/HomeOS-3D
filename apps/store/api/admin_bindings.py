"""运营后台的 bindings 资源组（从 api/admin.py 拆出）。

路由在原文件里是分散的（2 段），因此本模块有两个子路由：
第一段用 router、其余段用 router_extra —— 父路由在各自原来的位置分别 include，
以此保持路由注册顺序（FastAPI 按注册序匹配）。
"""
from __future__ import annotations

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from apps.store.core.deps import AdminAccount, DbSession
from apps.store.core.models import (
    DeviceBinding,
    DeviceReleaseEvent,
    License,
)
from apps.store.core.schemas import (
    AdminOrderActionRequest,
)
from apps.store.security.security import (
    iso_z,
    utcnow,
)  # noqa: F401

logger = logging.getLogger("apps.store.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
# 于是本文件剩下的 57 条路由不用改任何一处调用。
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

    ``keyword`` 命中实例号 / 客户端版本 / IP / 激活码提示，排障时按客户端上报的
    实例号或 IP 直接搜比翻页快得多。``serializers`` 里没有绑定载荷，所以这里的
    render 自己拼；激活码提示走本页预取的 License 映射，避免逐行 session.get。

    **本接口里的「绑定中」一律指 ``DeviceBinding.is_live``（active 且未 released）**，
    不是裸 ``active``：``active_only`` 这个入参与返回行的 ``bound`` 字段都按它判。
    两者只在「active 但已 released」的行上分叉，那时按存活判据它已经不算绑着。
    """
    base = select(DeviceBinding)
    if active_only:
        base = base.where(DeviceBinding.live_clause())
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
            #: 名字是 ``bound`` 而不是 ``active``：字段名一旦叫 ``active``，读的人会
            #: 以为它等于那一列，于是判据再收紧时这里就成了第二套口径。它答的是
            #: 「这台设备现在绑着吗」，即 ``DeviceBinding.is_live``。
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

    与「释放绑定」的区别：释放只是把绑定置为失效、保留历史，删除会把记录整条抹掉
    （会话与找回令牌挂在 ``binding_id`` 上，按外键级联清理）。

    **解绑事件不跟着走。** ``DeviceReleaseEvent`` 的外键是 ``license_id``（不是
    ``binding_id``），所以这里删掉绑定行之后，该授权的解绑历史与**解绑冷却都原样
    保留** —— 别拿「删了就没冷却了」当这个操作的理由（上一版文案就是这么写的，
    是错的；再上一版写「删了可以立刻重新激活」也不对，因为解绑之后本来就能立刻激活）。

    **两者都不改变「能否重新激活」** —— 冷却约束的是「下一次解绑」，见
    ``apps.store.api.store.release_device``。所以差别只剩：留不留绑定行、要不要顺手清掉
    这个实例的会话与找回令牌。只用于清理测试机、重复绑定这类脏数据，故强制审计。
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
