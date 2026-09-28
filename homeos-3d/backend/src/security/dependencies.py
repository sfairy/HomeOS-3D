"""FastAPI 依赖：身份认证、授权门禁与中控视角的数据可见范围。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from .access import (
    ViewerPrincipal,
    admin_token_from,
    check_admin_session,
    discard_expired_session,
    display_token_from,
)
from .display_access import active_display_device
from .http_security import secure_cookies_enabled
from .security import set_display_cookie
from ..core.models import (
    DisplayDevice,
    HAConnection,
    HAEntity,
    ProjectDraft,
    User,
)
from ..core.time_utils import ensure_aware
from ..panel.documents import parse_document
from ..panel.entity_refs import document_entity_ids
from ..panel.global_popups import hydrate_document_popups

#: 中控设备心跳的续期节流窗口（秒）：活跃到这个间隔才回写 ``last_seen_at`` 并续期 Cookie。
DISPLAY_HEARTBEAT_THROTTLE_SECONDS = 300


def get_database_session(request: Request):
    """把应用级会话工厂转成 FastAPI 的请求级依赖。
    """
    yield from request.app.state.database.sessions()


# 路由函数标注 DatabaseSession 即可拿到可用会话，不必感知工厂细节。
DatabaseSession = Annotated[Session, Depends(get_database_session)]


def _admin_session(
    request: Request, response: Response, database: DatabaseSession
) -> User | None:
    """解析管理员会话 Cookie，返回当前登录用户；不满足条件返回 None。
    """
    settings = request.app.state.settings
    token = admin_token_from(request.cookies, settings)
    session = check_admin_session(
        database,
        settings,
        token,
        account_user_id=request.app.state.admin_account.user_id,
        refresh=True,
    )
    if session.expired:
        discard_expired_session(database, session)
        return None
    user = session.user
    if user is None:
        return None
    if session.renewed:
        response.set_cookie(
            key=settings.cookie_name,
            value=token,
            max_age=settings.session_max_age_seconds,
            httponly=True,
            secure=secure_cookies_enabled(request),
            samesite="lax",
            path="/",
        )
    # 写进请求的日志上下文：全局日志里的每条记录都能标出操作人。
    context = getattr(request.state, "log_context", None)
    if context is not None:
        context["actor"] = user.username
    return user


def authenticated_user(
    request: Request, response: Response, database: DatabaseSession
) -> User:
    user = _admin_session(request, response, database)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录状态已失效，请重新登录。",
        )
    return user


def authenticated_short_lived_user(
    request: Request, response: Response
) -> User:
    """同 authenticated_user，但返回前把用户对象从会话上摘下来。
    """
    with request.app.state.database.session_factory() as database:
        user = authenticated_user(request, response, database)
        # expunge 之后 user 仍可读已加载字段，但访问未加载关系会抛错。
        database.expunge(user)
        return user


# 需要「只读当前用户」时用这个别名，连接不会被路由逻辑长期占用。
CurrentUser = Annotated[User, Depends(authenticated_short_lived_user)]


def license_restricted_detail(license_status: str, message: str) -> dict:
    """构造 LICENSE_RESTRICTED 的 403 detail —— 全仓唯一一处组装这三个字段。
    """
    return {
        "code": "LICENSE_RESTRICTED",
        "message": message,
        "licenseStatus": license_status,
    }


def require_capability(request: Request, capability: str, message: str) -> None:
    """能力码门禁：不允许就抛 403 LICENSE_RESTRICTED。
    """
    if not request.app.state.license_service.allows(capability):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=license_restricted_detail(
                request.app.state.license_service.status()["status"], message
            ),
        )


def require_admin(user: User, *, detail: str) -> None:
    """管理员角色门禁：非 admin 一律 403；各业务路由传自己的拒绝文案。
    """
    if user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def licensed_user(request: Request, user: CurrentUser) -> User:
    require_capability(request, "api", "当前授权状态不允许执行此操作。")
    return user


# 写操作 / 需要授权门禁的接口用这个别名：认证 + api 能力码一次到位。
LicensedUser = Annotated[User, Depends(licensed_user)]


# ViewerPrincipal 的唯一实现在 access 里，这里保留导入名是为了不动各路由的 import。


def _display_device(
    request: Request, response: Response, database: DatabaseSession
) -> DisplayDevice | None:
    """解析中控设备 Cookie，返回对应设备；未配对、已失效或已过期返回 None。
    """
    settings = request.app.state.settings
    token = display_token_from(request.cookies, settings)
    if not token:
        return None
    now = datetime.now(timezone.utc)
    device = active_display_device(database, settings, token, now=now)
    if device is None:
        return None
    # 节流窗口：只有设备"冷下来"才回写活跃时间并续期 Cookie（每次心跳都写库会把它变成热点行）。
    if now - ensure_aware(device.last_seen_at) >= timedelta(
        seconds=DISPLAY_HEARTBEAT_THROTTLE_SECONDS
    ):
        device.last_seen_at = now
        database.commit()
        # 重新下发 Cookie 是为了刷新浏览器侧的有效期，值不变。
        set_display_cookie(response, settings, token, secure=secure_cookies_enabled(request))
    # 把设备与项目信息写进日志上下文，接口出错时能直接看出是哪块屏幕。
    context = getattr(request.state, "log_context", None)
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
    if display is not None:
        return ViewerPrincipal(display=display)
    # 两者都没有：既没登录也没配对，交给前端跳 /login 或 /pair。
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="请登录或先完成中控设备配对。",
    )


def authenticated_short_lived_viewer(
    request: Request, response: Response
) -> ViewerPrincipal:
    """同上，但返回前把身份对象 detach，尽早释放数据库连接。
    """
    with request.app.state.database.session_factory() as database:
        viewer = authenticated_viewer(request, response, database)
        if viewer.user is not None:
            database.expunge(viewer.user)
        if viewer.display is not None:
            database.expunge(viewer.display)
        return viewer


# 只读接口（展示页、3D 舞台）优先用这个：认证完就不占连接。
CurrentViewer = Annotated[ViewerPrincipal, Depends(authenticated_short_lived_viewer)]


def licensed_viewer(request: Request, viewer: CurrentViewer) -> ViewerPrincipal:
    require_capability(request, "api", "当前授权状态不允许执行此操作。")
    return viewer


# 正式展示页与 3D 舞台用这一组：认证 + api 门禁，且不长期占用连接。
LicensedViewer = Annotated[ViewerPrincipal, Depends(licensed_viewer)]


def require_viewer_project(viewer: ViewerPrincipal, project_id: str) -> None:
    if viewer.project_id is not None and viewer.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该中控设备未绑定此仪表盘。",
        )


def _display_document(database: DatabaseSession, viewer: ViewerPrincipal) -> dict:
    """取出中控设备所绑定项目的仪表盘文档。
    """
    if viewer.project_id is None:
        return {}
    draft = database.get(ProjectDraft, viewer.project_id)
    if draft is None:
        return {}
    # 草稿损坏时静默降级：展示页宁可空白，也不该整页报错（统一入口）。
    value = parse_document(draft.document_json)
    if value is None:
        return {}
    return hydrate_document_popups(database, value, referenced_only=True)


def _document_bound_values(value, suffix: str) -> set[str]:
    """收集文档里所有以指定后缀结尾的键对应的字符串值。
    """
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
    """算出当前主体可见的实体集合；返回 None 表示不受限（管理员会话）。
    """
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
    # 按 (连接, 设备) 归类「已被显式绑定」的实体，
    for item in bound_sources:
        if not item.device_id:
            continue
        sources_by_device.setdefault(
            (item.connection_id, item.device_id), []
        ).append(item)
    if sources_by_device:
        # 一次查询捞出所有涉及设备下的实体，而不是逐设备查（N+1）。
        device_filter = or_(
            *(
                and_(
                    HAEntity.connection_id == connection_id,
                    HAEntity.device_id == device_id,
                )
                for connection_id, device_id in sources_by_device
            )
        )
        # 只放行同步正常且未被用户禁用的实体，故障实体放出去只会是死按钮。
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
            # identity 把候选实体的所有可读名字折成一个小写串，后面用关键词匹配判断
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
            # 判断候选实体是否属于「同一物」：满足下面任一条规则即自动放行。
            automatic = any(
                (
                    # 小米集成会把一个设备的实体分到不同 platform 名下，
                    source.platform not in {"xiaomi_home", "xiaomi_miot"}
                    or candidate.platform == source.platform
                )
                and (
                    # 风扇 / 空调设备上的指示灯。
                    (source.domain in {"fan", "climate"}
                    and candidate_domain == "light")
                    # 热水器的控制按钮与数值 / 选择项。
                    or (source.domain == "water_heater"
                    and candidate_domain
                    in {"button", "number", "select", "switch"})
                    # 扫地机的清洁模式与电量。
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
                    # 人体传感器：event 域本体是"有人移动"，
                    or (source.domain == "event"
                    and candidate_domain == "sensor"
                    and (
                        "no_motion" in identity
                        or "no motion" in identity
                        or "无移动" in identity
                        or "无人移动" in identity
                    ))
                    # 窗帘电机的反向开关。
                    or (source.domain == "cover"
                    and candidate_domain in {"select", "switch"}
                    and (
                        "motor_reverse" in identity
                        or "电机反向" in identity
                    ))
                    # 晾衣机：本体是 cover，它的照明是 light，
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
                    # 晾衣机的升降设定值与当前位置。
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
                    # 扫地机的工作状态传感器。
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
    # 小米平台额外一层：同一设备同一平台下的实体关联是可靠的，
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
        # 所有组合合成一条 OR 条件，仍然只查一次库。
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
        # 只放开可控域；同样要求同步正常且未被禁用。
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
    database: DatabaseSession, viewer: ViewerPrincipal
) -> set[str] | None:
    """当前主体可见的用户上传图片 ID 集合；None 表示不受限。
    """
    if viewer.project_id is None:
        return None
    return {
        item.removeprefix("user:")
        for item in _document_bound_values(
            _display_document(database, viewer), "assetId"
        )
        if item.startswith("user:")
    }


def viewer_studio3d_asset_ids(
    database: DatabaseSession, viewer: ViewerPrincipal
) -> set[str] | None:
    """当前主体可见的 3D 工作室导出资源 ID 集合；None 表示不受限。
    """
    if viewer.project_id is None:
        return None
    return {
        item
        for item in _document_bound_values(_display_document(database, viewer), "assetId")
        if item.startswith("studio3d:")
    }


def require_viewer_studio3d_asset(
    database: DatabaseSession, viewer: ViewerPrincipal, asset_id: str
) -> None:
    allowed = viewer_studio3d_asset_ids(database, viewer)
    if allowed is not None and asset_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该图片不属于当前中控仪表盘。",
        )


def require_viewer_user_asset(
    database: DatabaseSession, viewer: ViewerPrincipal, asset_id: str
) -> None:
    allowed = viewer_user_asset_ids(database, viewer)
    if allowed is not None and asset_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该图片不属于当前中控仪表盘。",
        )
