"""运营后台的 compliance 资源组。
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import aliased

from ..core.deps import AdminAccount, DbSession
from ..core.models import (
    AuditLog,
    DeviceBinding,
    DeviceReleaseEvent,
    EmailVerification,
    License,
    LicenseSession,
    RecoveryToken,
)
from ..security.security import (
    iso,
    utcnow,
)

logger = logging.getLogger("src.admin")


from .admin_shared import (
    _admin_actor,
    _audit,
    _by_ids,
    _cutoff_days,
    _page,
    _page_items,
    _purge_rows,
    _resolve_by_hash_hint,
)

router = APIRouter()


@router.get("/email-verifications")
def admin_list_email_verifications(
    session: DbSession,
    _admin: AdminAccount,
    email: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """邮箱验证码记录。``code_hash`` 属敏感字段，一律不下发。
    """
    base = select(EmailVerification)
    if email:
        base = base.where(EmailVerification.email == email.strip().lower())
    moment = utcnow()
    return _page(
        session,
        base,
        (EmailVerification.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=lambda record: {
            "id": record.id,
            "email": record.email,
            "purpose": record.purpose,
            "attempts": int(record.attempts or 0),
            "delivered": record.delivered,
            "deliveryMode": record.delivery_mode or "",
            "deliveryError": record.delivery_error or "",
            "deliveryAttempts": int(record.delivery_attempts or 0),
            "deliveredAt": iso(record.delivered_at),
            "consumedAt": iso(record.consumed_at),
            "expiresAt": iso(record.expires_at),
            "createdAt": iso(record.created_at),
            "settled": bool(record.consumed_at is not None or record.expires_at <= moment),
        },
    )


@router.delete("/email-verifications")
def admin_purge_email_verifications(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早于指定天数的验证码记录。
    """
    cutoff = _cutoff_days(older_than_days)
    where = and_(
        EmailVerification.created_at < cutoff,
        or_(
            EmailVerification.consumed_at.isnot(None),
            EmailVerification.expires_at < utcnow(),
        ),
    )
    return _purge_rows(
        session,
        admin,
        model=EmailVerification,
        pk=EmailVerification.id,
        where=where,
        label="邮箱验证码",
        action="email-verification.purge",
        detail=f"{older_than_days} 天前的已消费/已过期记录",
    )


@router.get("/device-release-events")
def admin_list_device_release_events(
    session: DbSession,
    _admin: AdminAccount,
    license_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    base = select(DeviceReleaseEvent)
    if license_id:
        base = base.where(DeviceReleaseEvent.license_id == license_id)

    def build(rows) -> list[dict]:
        licenses = _by_ids(session, License, (event.license_id for event in rows))
        return [
            {
                "id": event.id,
                "licenseId": event.license_id,
                "codeHint": licenses[event.license_id].code_hint
                if event.license_id in licenses
                else "",
                "accountId": event.account_id,
                "instanceId": event.instance_id,
                "source": event.source,
                "createdAt": iso(event.created_at),
            }
            for event in rows
        ]

    return _page_items(
        session,
        base,
        (DeviceReleaseEvent.created_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


@router.delete("/device-release-events")
def admin_purge_device_release_events(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早于指定天数的解绑事件。
    """
    cutoff = _cutoff_days(older_than_days)
    newer = aliased(DeviceReleaseEvent)
    latest_for_license = (
        select(func.max(newer.created_at))
        .where(newer.license_id == DeviceReleaseEvent.license_id)
        .scalar_subquery()
    )
    where = and_(
        DeviceReleaseEvent.created_at < cutoff,
        DeviceReleaseEvent.created_at < latest_for_license,
    )
    return _purge_rows(
        session,
        admin,
        model=DeviceReleaseEvent,
        pk=DeviceReleaseEvent.id,
        where=where,
        label="设备解绑事件",
        action="device-release-event.purge",
        detail=f"{older_than_days} 天前（保留每条授权的最新一次）",
    )


@router.get("/license-sessions")
def admin_list_license_sessions(
    session: DbSession,
    _admin: AdminAccount,
    license_id: str | None = None,
    binding_id: str | None = None,
    active_only: bool = False,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """客户端登录会话。
    """
    base = select(LicenseSession)
    moment = utcnow()
    if license_id:
        base = base.where(LicenseSession.license_id == license_id)
    if binding_id:
        base = base.where(LicenseSession.binding_id == binding_id)
    if active_only:
        base = base.where(LicenseSession.expires_at > moment)

    def build(rows) -> list[dict]:
        bindings = _by_ids(session, DeviceBinding, (record.binding_id for record in rows))
        licenses = _by_ids(session, License, (record.license_id for record in rows))
        return [
            {
                "ref": (record.id_hash or "")[:12],
                "sessionId": record.session_id,
                "licenseId": record.license_id,
                "codeHint": licenses[record.license_id].code_hint
                if record.license_id in licenses
                else "",
                "bindingId": record.binding_id,
                "instanceId": bindings[record.binding_id].instance_id
                if record.binding_id in bindings
                else None,
                "bindingActive": bindings[record.binding_id].is_live
                if record.binding_id in bindings
                else False,
                "createdAt": iso(record.created_at),
                "lastUsedAt": iso(record.last_used_at),
                "expiresAt": iso(record.expires_at),
                "expired": record.expires_at <= moment,
            }
            for record in rows
        ]

    return _page_items(
        session,
        base,
        (LicenseSession.last_used_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


@router.delete("/license-sessions/{ref}")
def admin_revoke_license_session(ref: str, session: DbSession, admin: AdminAccount) -> dict:
    record = _resolve_by_hash_hint(session, LicenseSession, ref, "授权会话")
    license_ = session.get(License, record.license_id)
    hint = (record.id_hash or "")[:12]
    session.delete(record)
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "license-session.revoke",
        license_.code_hint if license_ else record.license_id,
        hint,
    )
    return {"ref": hint, "revoked": True, "codeHint": license_.code_hint if license_ else ""}


@router.delete("/license-sessions")
def admin_purge_license_sessions(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早已过期的客户端会话。
    """
    cutoff = _cutoff_days(older_than_days)
    return _purge_rows(
        session,
        admin,
        model=LicenseSession,
        pk=LicenseSession.id_hash,
        where=LicenseSession.expires_at < cutoff,
        label="授权会话",
        action="license-session.purge",
        detail=f"{older_than_days} 天前就已过期的会话",
    )


@router.get("/recovery-tokens")
def admin_list_recovery_tokens(
    session: DbSession,
    _admin: AdminAccount,
    license_id: str | None = None,
    binding_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """设备找回令牌。只回哈希前 12 位做标识，完整哈希不下发。"""
    base = select(RecoveryToken)
    moment = utcnow()
    if license_id:
        base = base.where(RecoveryToken.license_id == license_id)
    if binding_id:
        base = base.where(RecoveryToken.binding_id == binding_id)

    def build(rows) -> list[dict]:
        bindings = _by_ids(session, DeviceBinding, (record.binding_id for record in rows))
        licenses = _by_ids(session, License, (record.license_id for record in rows))
        return [
            {
                "ref": (record.id_hash or "")[:12],
                "licenseId": record.license_id,
                "codeHint": licenses[record.license_id].code_hint
                if record.license_id in licenses
                else "",
                "bindingId": record.binding_id,
                "instanceId": bindings[record.binding_id].instance_id
                if record.binding_id in bindings
                else None,
                "createdAt": iso(record.created_at),
                "expiresAt": iso(record.expires_at),
                "expired": record.expires_at <= moment,
            }
            for record in rows
        ]

    return _page_items(
        session,
        base,
        (RecoveryToken.created_at.desc(),),
        limit=limit,
        offset=offset,
        build=build,
    )


@router.delete("/recovery-tokens/{ref}")
def admin_revoke_recovery_token(ref: str, session: DbSession, admin: AdminAccount) -> dict:
    """作废一条找回令牌（设备丢了或令牌疑似外泄时用）。"""
    record = _resolve_by_hash_hint(session, RecoveryToken, ref, "找回令牌")
    license_ = session.get(License, record.license_id)
    hint = (record.id_hash or "")[:12]
    session.delete(record)
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "recovery-token.revoke",
        license_.code_hint if license_ else record.license_id,
        hint,
    )
    return {"ref": hint, "revoked": True, "codeHint": license_.code_hint if license_ else ""}


@router.delete("/recovery-tokens")
def admin_purge_recovery_tokens(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """清理早已过期的找回令牌。安全谓词同客户端会话：只清已经失效的。"""
    cutoff = _cutoff_days(older_than_days)
    return _purge_rows(
        session,
        admin,
        model=RecoveryToken,
        pk=RecoveryToken.id_hash,
        where=RecoveryToken.expires_at < cutoff,
        label="找回令牌",
        action="recovery-token.purge",
        detail=f"{older_than_days} 天前就已过期的令牌",
    )


@router.get("/audit-logs")
def admin_audit_logs(
    session: DbSession, _admin: AdminAccount, limit: int = 100, offset: int = 0
) -> dict:
    return _page(
        session,
        select(AuditLog),
        (AuditLog.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=lambda row: {
            "id": row.id,
            "actor": row.actor,
            "action": row.action,
            "target": row.target,
            "detail": row.detail,
            "createdAt": iso(row.created_at),
        },
    )


@router.delete("/audit-logs/{log_id}")
def admin_delete_audit_log(log_id: str, session: DbSession, admin: AdminAccount) -> dict:
    log = session.get(AuditLog, log_id)
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="审计记录不存在。")
    label = f"{log.action} {log.target}".strip()
    session.delete(log)
    session.flush()
    _audit(session, _admin_actor(admin), "audit.delete", log_id, label)
    return {"id": log_id, "deleted": True, "label": label}


@router.delete("/audit-logs")
def admin_purge_audit_logs(
    session: DbSession, admin: AdminAccount, older_than_days: int
) -> dict:
    """按时间批量清理审计日志。
    """
    cutoff = _cutoff_days(older_than_days)
    result = _purge_rows(
        session,
        admin,
        model=AuditLog,
        pk=AuditLog.id,
        where=AuditLog.created_at < cutoff,
        label="审计日志",
        action="audit.purge",
        detail=f"older_than_days={older_than_days}",
    )
    return {
        "deleted": result["deleted"],
        "olderThanDays": older_than_days,
        "cutoff": iso(cutoff),
    }
