"""运营后台的 accounts 资源组（从 api/admin.py 拆出）。

子路由不带前缀（路径本身就是绝对路径），由父路由 admin.py 在**原来的位置**
router.include_router() 套上 /store-admin/v1 —— 位置决定注册顺序，FastAPI 按注册序匹配路由，
所以每拆一组都要用 72 条路由基线逐项比对（含顺序）。
"""
from __future__ import annotations

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select

from apps.store.core.deps import AdminAccount, DbSession
from apps.store.core.models import (
    Account,
    Customer,
    License,
    Order,
    ReferralLedger,
)
from apps.store.core.schemas import (
    AdminAccountPatch,
)
from apps.store.security.security import (
    hash_password,
    is_valid_email,
    normalize_email,
    utcnow,
)  # noqa: F401

logger = logging.getLogger("apps.store.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
# 于是本文件剩下的 57 条路由不用改任何一处调用。
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


