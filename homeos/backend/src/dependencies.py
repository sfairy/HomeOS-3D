"""FastAPI 依赖：身份认证与授权门禁。

说明：中控设备配对码机制已移除 —— 展示页（/display、/homeos）与编辑器共用同一登录
会话，因此这里不再有「登录用户 / 已配对中控设备」双身份分支。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .core.models import LoginSession, User
from .security.session_store import session_token_hash


def get_database_session(request: Request):
    yield from request.app.state.database.sessions()


DatabaseSession = Annotated[Session, Depends(get_database_session)]


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _admin_session(
    request: Request, response: Response, database: DatabaseSession
) -> User | None:
    """解析当前用户（ORM 实体）：homeos-3d 的 DB 会话（``sessions`` 表）。

    Cookie ``settings.cookie_name`` 携带不透明令牌，可服务端吊销并滑动续期。
    """
    settings = request.app.state.settings
    token = request.cookies.get(settings.cookie_name, '')
    if token:
        record = database.scalar(
            select(LoginSession).where(LoginSession.id_hash == session_token_hash(token))
        )
        now = datetime.now(UTC)
        if record is None or _aware(record.expires_at) <= now:
            if record is not None:
                database.delete(record)
                database.commit()
        else:
            user = database.get(User, record.user_id)
            if user is not None and getattr(user, 'is_active', True):
                max_age = settings.jwt_expires_in_seconds
                refresh_interval = min(300, max(1, max_age // 2))
                if now - _aware(record.last_seen_at) >= timedelta(seconds=refresh_interval):
                    record.last_seen_at = now
                    record.expires_at = now + timedelta(seconds=max_age)
                    database.commit()
                    response.set_cookie(
                        key=settings.cookie_name,
                        value=token,
                        max_age=max_age,
                        httponly=True,
                        secure=settings.cookie_secure,
                        samesite='lax',
                        path='/',
                    )
                context = getattr(request.state, 'log_context', None)
                if context is not None:
                    context['actor'] = user.username
                return user
    return None


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
    if not request.app.state.license_service.allows():
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
    """当前查看者身份。

    配对码机制移除后，展示页（`/display/*`、`/homeos/*`）与编辑器共用同一登录会话，
    因此这里只承载登录用户，不再是「用户 / 已配对中控设备」二选一。
    """

    user: User

    @property
    def is_session(self) -> bool:
        """恒为 True：所有查看者都是登录会话（保留此属性以表达「可读写视角」）。"""
        return True


def authenticated_viewer(
    request: Request, response: Response, database: DatabaseSession
) -> ViewerPrincipal:
    user = _admin_session(request, response, database)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='请先登录。',
        )
    return ViewerPrincipal(user=user)


def authenticated_short_lived_viewer(
    request: Request, response: Response
) -> ViewerPrincipal:
    "返回已脱离会话的身份数据，以释放身份验证持有的数据库连接。"
    with request.app.state.database.session_factory() as database:
        viewer = authenticated_viewer(request, response, database)
        database.expunge(viewer.user)
        return viewer


CurrentViewer = Annotated[ViewerPrincipal, Depends(authenticated_short_lived_viewer)]


def licensed_viewer(request: Request, viewer: CurrentViewer) -> ViewerPrincipal:
    if not request.app.state.license_service.allows():
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
    """校验查看者是否能访问指定仪表盘。

    配对码机制移除后查看者恒为登录会话（总览与展示同源），可访问任意仪表盘，
    因此这里不做限制；保留函数以维持调用点不变。
    """
    return


def viewer_entity_ids(
    database: DatabaseSession, viewer: ViewerPrincipal
) -> set[str] | None:
    """返回当前查看者可见的实体白名单。

    返回 ``None`` 表示不限制：登录会话与编辑器同权限，实体不做收敛。
    保留函数以维持 HA 侧调用点不变。
    """
    return None


def require_viewer_entity(
    database: DatabaseSession, viewer: ViewerPrincipal, entity_id: str
) -> None:
    """校验查看者是否有权访问该实体。

    登录会话与编辑器同权限，不做实体级收敛；保留函数以维持 HA 侧调用点不变。
    """
    return


def viewer_user_asset_ids(
    database: DatabaseSession,
    viewer: ViewerPrincipal,
    prefixes: tuple[str, ...] = ("user:",),
) -> set[str] | None:
    """返回当前查看者可见的用户素材白名单；``None`` 表示不限制。

    登录会话与编辑器同权限，素材不做收敛；保留函数以维持资产侧调用点不变。
    """
    return None


def require_viewer_user_asset(
    database: DatabaseSession, viewer: ViewerPrincipal, asset_id: str
) -> None:
    """校验查看者是否有权访问该素材；登录会话不做收敛。"""
    return
