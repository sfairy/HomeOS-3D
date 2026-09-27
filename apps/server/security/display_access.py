"""正式展示页的访问控制辅助。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..core.models import DisplayDevice, DisplayPairingCode, Project, ProjectPathAlias
from .security import session_token_hash
from ..core.time_utils import ensure_aware


def display_path(project_name: str) -> str:
    """正式展示地址：路径段用项目名称，特殊字符一律百分号编码。
    """
    return '/display/' + quote(project_name, safe = '')


def resolve_display_project(database: Session, project_name: str) -> tuple[Project | None, str | None]:
    """把展示地址里的路径段解析成项目；返回 ``(项目, 命中的旧名称)``。
    """
    project = database.scalar(select(Project).where(Project.name == project_name))
    if project is not None:
        return (project, None)
    alias = database.scalar(select(ProjectPathAlias).where(ProjectPathAlias.name == project_name))
    if alias is None:
        return (None, None)
    project = database.get(Project, alias.project_id)
    # 项目已被删除（别名会随外键级联消失，这里兜住外键未生效的库）：当作没有这个地址，
    if project is None:
        return (None, None)
    return (project, project_name)


def active_display_device(
    database: Session, settings, token: str, *, now: datetime | None = None
) -> DisplayDevice | None:
    """用中控令牌查找**当前仍然有效**的设备。
    """
    device = _display_device_by_token(database, token)
    if device is None:
        return None
    if display_token_expired(device, settings, now):
        return None
    return device


def _display_device_by_token(database: Session, token: str) -> DisplayDevice | None:
    """按令牌哈希查设备（含吊销与配对码启停判定），不判有效期。"""
    if not token:
        return None
    return database.scalar(
        select(DisplayDevice)
        .outerjoin(
            DisplayPairingCode,
            DisplayPairingCode.id == DisplayDevice.pairing_code_id,
        )
        .where(
            DisplayDevice.token_hash == session_token_hash(token),
            DisplayDevice.revoked_at.is_(None),
            or_(
                DisplayDevice.pairing_code_id.is_(None),
                DisplayPairingCode.is_enabled.is_(True),
            ),
        )
    )


def display_token_expires_at(device: DisplayDevice, settings) -> datetime | None:
    """算出这台设备令牌的失效时刻；不设有效期时返回 None。
    """
    ttl = int(getattr(settings, 'display_token_ttl_seconds', 0) or 0)
    hard_ttl = int(getattr(settings, 'display_token_hard_ttl_seconds', 0) or 0)
    candidates = []
    if ttl > 0:
        candidates.append(ensure_aware(device.last_seen_at) + timedelta(seconds=ttl))
    if hard_ttl > 0:
        candidates.append(ensure_aware(device.created_at) + timedelta(seconds=hard_ttl))
    return min(candidates) if candidates else None


def display_token_expired(device: DisplayDevice, settings, now: datetime | None = None) -> bool:
    """这台设备的令牌是否已过期（含可选的硬上限）。"""
    expires_at = display_token_expires_at(device, settings)
    if expires_at is None:
        return False
    return expires_at <= (now or datetime.now(timezone.utc))
