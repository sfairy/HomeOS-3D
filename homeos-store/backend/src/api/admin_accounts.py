"""运营后台的 accounts 资源组（从 api/admin.py 拆出）。
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select

from ..core.deps import AdminAccount, DbSession
from ..core.models import (
    Account,
    Customer,
    License,
    Order,
    ReferralLedger,
)
from ..core.schemas import (
    AdminAccountPatch,
)
from ..security.security import (
    hash_password,
    is_valid_email,
    normalize_email,
    utcnow,
)

logger = logging.getLogger("src.admin")


from .admin_shared import (
    _account_payload,
    _admin_actor,
    _audit,
    _drop_account_sessions,
    _guard_last_active_admin,
    _guard_self_lockout,
    _page,
)

router = APIRouter()


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
    """
    base = select(Account)
    if keyword:
        like = f"%{keyword.strip()}%"
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
        customer = session.scalars(
            select(Customer).where(Customer.account_id == account.id)
        ).first()
        if customer is not None:
            customer.email = email
        _drop_account_sessions(session, account.id)
        changed.append("email")

    if data.get("is_admin") is False and bool(account.is_admin):
        _guard_last_active_admin(session, account)
    if "is_admin" in data and data["is_admin"] is not None:
        account.is_admin = bool(data["is_admin"])
        changed.append("is_admin")

    if "is_active" in data and data["is_active"] is not None:
        if data["is_active"] is False:
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
        _drop_account_sessions(session, account.id)
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


