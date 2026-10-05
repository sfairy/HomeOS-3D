"""命令审计服务（对齐 CommandProxyAuditService）。"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..core.models import CommandAudit

logger = logging.getLogger("homeos.command_audit")


def log_command_audit(
    session_factory,
    user: dict[str, Any] | None,
    dto: dict[str, Any],
    success: bool,
    error: str | None = None,
) -> None:
    """写入一条命令审计（失败仅告警，不影响主流程）。"""
    try:
        with session_factory() as session:
            session.add(
                CommandAudit(
                    user_id=(user or {}).get("userId"),
                    username=(user or {}).get("username"),
                    role=(user or {}).get("role"),
                    domain=str(dto.get("domain") or ""),
                    service=str(dto.get("service") or ""),
                    entity_id=str(dto.get("entity_id") or ""),
                    success=bool(success),
                    error=error,
                )
            )
            session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("命令审计写入失败: %s", exc)


def _build_where(entity_id: str | None, username: str | None) -> list[Any]:
    conditions: list[Any] = []
    if entity_id and entity_id.strip():
        value = entity_id.strip()
        if "." in value:
            conditions.append(CommandAudit.entity_id == value)
        else:
            conditions.append(CommandAudit.entity_id.contains(value))
    if username and username.strip():
        conditions.append(CommandAudit.username.startswith(username.strip()))
    return conditions


def list_command_audit(
    session: Session,
    *,
    limit: str | None = None,
    skip: str | None = None,
    page: str | None = None,
    entity_id: str | None = None,
    username: str | None = None,
) -> Any:
    take = min(_to_int(limit, 50) or 50, 500)
    conditions = _build_where(entity_id, username)
    page_num = max(_to_int(page, 1) or 1, 1) if page else 0
    skip_n = (page_num - 1) * take if page_num > 0 else max(_to_int(skip, 0) or 0, 0)
    base = (
        select(CommandAudit)
        .where(*conditions)
        .order_by(CommandAudit.created_at.desc())
        .offset(skip_n)
        .limit(take)
    )
    rows = session.execute(base).scalars().all()
    items = [_row_to_dict(row) for row in rows]
    if page_num > 0:
        total = session.execute(
            select(func.count()).select_from(CommandAudit).where(*conditions)
        ).scalar_one()
        return {
            "items": items,
            "total": int(total),
            "page": page_num,
            "totalPages": max(1, -(-int(total) // take)),
        }
    return items


def clear_command_audit(session: Session, entity_id: str | None, username: str | None) -> dict[str, Any]:
    conditions = _build_where(entity_id, username)
    result = session.execute(delete(CommandAudit).where(*conditions))
    session.commit()
    return {"deleted": int(result.rowcount or 0)}


def _row_to_dict(row: CommandAudit) -> dict[str, Any]:
    return {
        "id": row.id,
        "userId": row.user_id,
        "username": row.username,
        "role": row.role,
        "domain": row.domain,
        "service": row.service,
        "entityId": row.entity_id,
        "success": row.success,
        "error": row.error,
        "createdAt": _iso(row.created_at),
    }


def _iso(value) -> str | None:
    if value is None:
        return None
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def _to_int(value: Any, fallback: int) -> int:
    if value is None or value == "":
        return fallback
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback
