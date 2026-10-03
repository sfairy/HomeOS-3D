"""FastAPI 依赖：身份认证、授权门禁与中控视角的数据可见范围。"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from .display_access import active_display_device
from .embedding import COOKIE_PREFIX, embedded_devices, set_embedded_cookie
from .global_popups import hydrate_document_popups
from .models import (
    DisplayDevice,
    HAConnection,
    HAEntity,
    LoginSession,
    ProjectDraft,
    User,
)
from .panel.entity_refs import document_entity_ids
from .security import session_token_hash, set_display_cookie


def get_database_session(request: Request):
    yield from request.app.state.database.sessions()


DatabaseSession = Annotated[Session, Depends(get_database_session)]


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _admin_session(
    request: Request, response: Response, database: DatabaseSession
) -> User | None:
    account_user_id = request.app.state.admin_account.user_id
    if account_user_id is None:
        return None
    token = request.cookies.get(request.app.state.settings.cookie_name, '')
    if not token:
        return None
    record = database.scalar(
        select(LoginSession).where(LoginSession.id_hash == session_token_hash(token))
    )
    now = datetime.now(UTC)
    if record is None or _aware(record.expires_at) <= now:
        if record is not None:
            database.delete(record)
            database.commit()
        return None
    if record.user_id != account_user_id:
        return None
    user = database.get(User, record.user_id)
    if user is None or not user.is_active:
        return None
    max_age = request.app.state.settings.session_max_age_seconds
    refresh_interval = min(300, max(1, max_age // 2))
    if now - _aware(record.last_seen_at) >= timedelta(seconds=refresh_interval):
        record.last_seen_at = now
        record.expires_at = now + timedelta(seconds=max_age)
        database.commit()
        response.set_cookie(
            key=request.app.state.settings.cookie_name,
            value=token,
            max_age=max_age,
            httponly=True,
            secure=request.app.state.settings.cookie_secure,
            samesite='lax',
            path='/',
        )
    context = getattr(request.state, 'log_context', None)
    if context is not None:
        context['actor'] = user.username
    return user


def authenticated_user(
    request: Request, response: Response, database: DatabaseSession
) -> User:
    user = _admin_session(request, response, database)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='登录状态已失效，请重新登录。',
        )
    return user


def authenticated_short_lived_user(
    request: Request, response: Response
) -> User:
    with request.app.state.database.session_factory() as database:
        user = authenticated_user(request, response, database)
        database.expunge(user)
        return user


CurrentUser = Annotated[User, Depends(authenticated_short_lived_user)]


def licensed_user(request: Request, user: CurrentUser) -> User:
    if not request.app.state.license_service.allows('api'):
        license_status = request.app.state.license_service.status()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                'code': 'LICENSE_RESTRICTED',
                'message': '当前授权状态不允许执行此操作。',
                'licenseStatus': license_status['status'],
            },
        )
    return user


LicensedUser = Annotated[User, Depends(licensed_user)]


@dataclass(frozen=True)
class ViewerPrincipal:

    user: User | None = None
    display: DisplayDevice | None = None
    additional_displays: tuple[DisplayDevice, ...] = ()

    @property
    def displays(self) -> tuple[DisplayDevice, ...]:
        return ((self.display,) if self.display is not None else ()) + self.additional_displays

    @property
    def project_ids(self) -> frozenset[str]:
        return frozenset(item.project_id for item in self.displays)

    @property
    def project_id(self) -> str | None:
        return self.display.project_id if self.display is not None else None

    @property
    def is_admin_session(self) -> bool:
        return self.user is not None


def _display_device(
    request: Request, response: Response, database: DatabaseSession
) -> DisplayDevice | None:
    settings = request.app.state.settings
    token = request.cookies.get(settings.display_cookie_name, '')
    if not token:
        return None
    device = active_display_device(database, token)
    if device is None:
        return None
    now = datetime.now(UTC)
    if now - _aware(device.last_seen_at) >= timedelta(minutes=5):
        device.last_seen_at = now
        database.commit()
        set_display_cookie(response, settings, token)
    context = getattr(request.state, 'log_context', None)
    if context is not None:
        context.update(
            displayId=device.id,
            displayName=device.name,
            projectId=device.project_id,
        )
    return device


def authenticated_viewer(
    request: Request, response: Response, database: DatabaseSession
) -> ViewerPrincipal:
    user = _admin_session(request, response, database)
    if user is not None:
        return ViewerPrincipal(user=user)
    display = _display_device(request, response, database)
    devices = list(embedded_devices(request, database))
    now = datetime.now(UTC)
    refreshed = False
    for device in devices:
        if now - _aware(device.last_seen_at) >= timedelta(minutes=5):
            device.last_seen_at = now
            refreshed = True
            set_embedded_cookie(
                request,
                response,
                device.project_id,
                request.cookies[COOKIE_PREFIX + device.project_id],
            )
    if refreshed:
        database.commit()
    if display is not None:
        devices = [display] + [item for item in devices if item.id != display.id]
    if devices:
        return ViewerPrincipal(display=devices[0], additional_displays=tuple(devices[1:]))
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='请登录或先完成中控设备配对。',
    )


def authenticated_short_lived_viewer(
    request: Request, response: Response
) -> ViewerPrincipal:
    "Return detached identity data, releasing authentication's DB connection."
    with request.app.state.database.session_factory() as database:
        viewer = authenticated_viewer(request, response, database)
        if viewer.user is not None:
            database.expunge(viewer.user)
        for device in viewer.displays:
            database.expunge(device)
        return viewer


CurrentViewer = Annotated[ViewerPrincipal, Depends(authenticated_short_lived_viewer)]


def licensed_viewer(request: Request, viewer: CurrentViewer) -> ViewerPrincipal:
    if not request.app.state.license_service.allows('api'):
        license_status = request.app.state.license_service.status()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                'code': 'LICENSE_RESTRICTED',
                'message': '当前授权状态不允许执行此操作。',
                'licenseStatus': license_status['status'],
            },
        )
    return viewer


LicensedViewer = Annotated[ViewerPrincipal, Depends(licensed_viewer)]
ShortLivedCurrentViewer = Annotated[ViewerPrincipal, Depends(authenticated_short_lived_viewer)]


def licensed_short_lived_viewer(
    request: Request, viewer: ShortLivedCurrentViewer
) -> ViewerPrincipal:
    return licensed_viewer(request, viewer)


ShortLivedLicensedViewer = Annotated[ViewerPrincipal, Depends(licensed_short_lived_viewer)]


def require_viewer_project(viewer: ViewerPrincipal, project_id: str) -> None:
    if not viewer.is_admin_session and project_id not in viewer.project_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                'code': 'DISPLAY_PROJECT_UNPAIRED',
                'message': '该中控设备未绑定此仪表盘，请重新配对。',
            },
        )


def _display_document(database: DatabaseSession, viewer: ViewerPrincipal) -> dict:
    if viewer.project_id is None:
        return {}
    documents = []
    for project_id in viewer.project_ids:
        draft = database.get(ProjectDraft, project_id)
        if draft is None:
            continue
        try:
            value = json.loads(draft.document_json)
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(value, dict):
            continue
        documents.append(hydrate_document_popups(database, value, referenced_only=True))
    return documents[0] if len(documents) == 1 else {'pairedDocuments': documents}

def _document_bound_values(value, suffix: str) -> set[str]:
    result = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(item, str) and key.casefold().endswith(
                suffix.casefold()
            ):
                result.add(item)
                continue
            result.update(_document_bound_values(item, suffix))
    elif isinstance(value, list):
        for item in value:
            result.update(_document_bound_values(item, suffix))
    return result


def viewer_entity_ids(
    database: DatabaseSession, viewer: ViewerPrincipal
) -> set[str] | None:
    if viewer.project_id is None:
        return None
    allowed = document_entity_ids(_display_document(database, viewer))
    if not allowed:
        return allowed
    active_connection_id = database.scalar(
        select(HAConnection.id).where(HAConnection.is_active.is_(True))
    )
    if active_connection_id is None:
        return allowed
    bound_sources = database.scalars(
        select(HAEntity).where(
            HAEntity.connection_id == active_connection_id,
            HAEntity.entity_id.in_(allowed),
        )
    ).all()
    sources_by_device = {}
    for item in bound_sources:
        if not item.device_id:
            continue
        sources_by_device.setdefault(
            (item.connection_id, item.device_id), []
        ).append(item)
    if sources_by_device:
        device_filter = or_(
            *(
                and_(
                    HAEntity.connection_id == connection_id,
                    HAEntity.device_id == device_id,
                )
                for connection_id, device_id in sources_by_device
            )
        )
        candidates = database.scalars(
            select(HAEntity).where(
                device_filter,
                HAEntity.sync_status == "active",
                HAEntity.disabled_by.is_(None),
            )
        ).all()
        for candidate in candidates:
            sources = sources_by_device.get(
                (candidate.connection_id, candidate.device_id), []
            )
            if not sources:
                continue
            if any(
                candidate.entity_id == source.entity_id for source in sources
            ):
                continue
            candidate_domain = candidate.domain
            identity = " ".join(
                filter(
                    None,
                    (
                        candidate.entity_id,
                        candidate.name,
                        candidate.original_name,
                        candidate.translation_key,
                        candidate.icon,
                    ),
                )
            ).casefold()
            automatic = any(
                (
                    source.platform not in {"xiaomi_home", "xiaomi_miot"}
                    or candidate.platform == source.platform
                )
                and (
                    (source.domain in {"fan", "climate"}
                    and candidate_domain == "light")
                    or (source.domain == "water_heater"
                    and candidate_domain
                    in {"button", "number", "select", "switch"})
                    or (source.domain == "vacuum"
                    and (
                        (candidate_domain == "select"
                        and (
                            candidate.translation_key == "cleaning_mode"
                            or "cleaning_mode" in identity
                        ))
                        or (candidate_domain == "sensor"
                        and (
                            candidate.translation_key == "battery"
                            or "battery" in identity
                            or "电量" in identity
                        ))
                    ))
                    or (source.domain == "event"
                    and candidate_domain == "sensor"
                    and (
                        "no_motion" in identity
                        or "no motion" in identity
                        or "无移动" in identity
                        or "无人移动" in identity
                    ))
                    or (source.domain == "cover"
                    and candidate_domain in {"select", "switch"}
                    and (
                        "motor_reverse" in identity
                        or "电机反向" in identity
                    ))
                    or (source.domain == "cover"
                    and candidate_domain in {"light", "switch"}
                    and any(
                        marker
                        in " ".join(
                            filter(
                                None,
                                (
                                    source.entity_id,
                                    source.name,
                                    source.original_name,
                                    source.translation_key,
                                ),
                            )
                        ).casefold()
                        for marker in (
                            "airer",
                            "clothes rack",
                            "laundry rack",
                            "晾衣机",
                            "晾衣架",
                        )
                    )
                    and (
                        candidate_domain == "light"
                        or any(
                            marker in identity
                            for marker in (
                                "light",
                                "lamp",
                                "灯光",
                                "照明",
                                "晾衣机 灯",
                                "晾衣架 灯",
                            )
                        )
                    ))
                    or (source.domain == "cover"
                    and candidate_domain in {"number", "sensor"}
                    and any(
                        marker
                        in " ".join(
                            filter(
                                None,
                                (
                                    source.entity_id,
                                    source.name,
                                    source.original_name,
                                    source.translation_key,
                                ),
                            )
                        ).casefold()
                        for marker in (
                            "airer",
                            "clothes rack",
                            "laundry rack",
                            "晾衣机",
                            "晾衣架",
                        )
                    )
                    and any(
                        marker in identity
                        for marker in (
                            "set_position",
                            "set position",
                            "target_position",
                            "target position",
                            "设定位置",
                            "设置位置",
                            "目标位置",
                            "current_position",
                            "current position",
                            "当前位置",
                            "当前高度",
                        )
                    ))
                    or (source.domain == "sensor"
                    and source.translation_key
                    in {"state", "status", "task_status"}
                    and candidate_domain == "vacuum")
                )
                for source in sources
            )
            if not automatic:
                continue
            allowed.add(candidate.entity_id)
    xiaomi_sources = database.scalars(
        select(HAEntity).where(
            HAEntity.connection_id == active_connection_id,
            HAEntity.entity_id.in_(allowed),
            HAEntity.platform.in_(("xiaomi_home", "xiaomi_miot")),
            HAEntity.device_id.is_not(None),
        )
    ).all()
    xiaomi_pairs = {
        (item.device_id, item.platform)
        for item in xiaomi_sources
        if item.device_id and item.platform
    }
    if xiaomi_pairs:
        related_filter = or_(
            *(
                and_(
                    HAEntity.connection_id == active_connection_id,
                    HAEntity.device_id == device_id,
                    HAEntity.platform == platform,
                )
                for device_id, platform in xiaomi_pairs
            )
        )
        allowed.update(
            database.scalars(
                select(HAEntity.entity_id).where(
                    related_filter,
                    HAEntity.domain.in_(
                        (
                            "climate",
                            "cover",
                            "fan",
                            "light",
                            "switch",
                            "select",
                            "number",
                            "sensor",
                        )
                    ),
                    HAEntity.sync_status == "active",
                    HAEntity.disabled_by.is_(None),
                )
            ).all()
        )
    return allowed


def require_viewer_entity(
    database: DatabaseSession, viewer: ViewerPrincipal, entity_id: str
) -> None:
    allowed = viewer_entity_ids(database, viewer)
    if allowed is not None and entity_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该实体不属于当前中控仪表盘。",
        )


def viewer_user_asset_ids(
    database: DatabaseSession,
    viewer: ViewerPrincipal,
    prefixes: tuple[str, ...] = ("user:",),
) -> set[str] | None:
    if viewer.project_id is None:
        return None
    return {
        item.removeprefix(prefix)
        for prefix in prefixes
        for item in _document_bound_values(
            _display_document(database, viewer), "assetId"
        )
        if item.startswith(prefix)
    }


def require_viewer_user_asset(
    database: DatabaseSession, viewer: ViewerPrincipal, asset_id: str
) -> None:
    allowed = viewer_user_asset_ids(database, viewer)
    if allowed is not None and asset_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该图片不属于当前中控仪表盘。",
        )
