# [补充说明] FastAPI 依赖：身份认证、授权门禁与中控视角的数据可见范围。
#
# 三层结构，逐层收紧：
# 1. 认证层 —— 解析管理员会话 Cookie 或中控设备 Cookie，得出 ViewerPrincipal；
# 2. 授权层 —— 在认证之上叠加能力码门禁（api）；
# 3. 可见范围层 —— 中控设备只能看到自己绑定的实体与图片，由 viewer_entity_ids 收窄。
#
# 命名约定：带 `short_lived` 的版本会在返回前把 ORM 对象 detach（expunge），让数据库连接
# 尽早归还连接池；中控设备长时间挂着展示页，不这样做容易耗尽连接。
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
    # [补充说明] 把应用级会话工厂转成 FastAPI 的请求级依赖。
    #
    # 用 yield 而不是 return：请求结束时生成器的清理逻辑会关闭会话，
    # 因此每个请求拿到的是全新会话，不会跨请求串状态。
    yield from request.app.state.database.sessions()


# 路由函数标注 DatabaseSession 即可拿到可用会话，不必感知工厂细节。
DatabaseSession = Annotated[Session, Depends(get_database_session)]


def _aware(value: datetime) -> datetime:
    # [补充说明] 把可能是 naive 的时间戳补成 UTC aware，便于与 datetime.now(timezone.utc) 比较。
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _admin_session(
    request: Request, response: Response, database: DatabaseSession
) -> User | None:
    # [补充说明] 解析管理员会话 Cookie，返回当前登录用户；不满足条件返回 None。
    #
    # 判定口径：Cookie 里的令牌按 session_token_hash 找到 LoginSession 行，行必须未过期、
    # 属于当前管理员账号，且对应的 User 仍处于启用状态。失效的行顺手删掉；会话过半程后
    # 滑动续期（更新 last_seen_at / expires_at）并重写 Cookie，让长时间开着编辑器的用户不掉线。
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
    # 续期节流：活跃满半个有效期（每秒下限 1、上限 300）才回写，避免每次请求都写库。
    refresh_interval = min(300, max(1, max_age // 2))
    if now - _aware(record.last_seen_at) >= timedelta(seconds=refresh_interval):
        record.last_seen_at = now
        record.expires_at = now + timedelta(seconds=max_age)
        database.commit()
        # 续期回写与 Cookie 重发必须同时发生，否则浏览器侧会比服务端先过期。
        response.set_cookie(
            key=request.app.state.settings.cookie_name,
            value=token,
            max_age=max_age,
            httponly=True,
            secure=request.app.state.settings.cookie_secure,
            samesite='lax',
            path='/',
        )
    # 写进请求的日志上下文：全局日志里的每条记录都能标出操作人。
    context = getattr(request.state, 'log_context', None)
    if context is not None:
        context['actor'] = user.username
    return user


def authenticated_user(
    request: Request, response: Response, database: DatabaseSession
) -> User:
    # [补充说明] 要求管理员已登录，否则 401。
    #
    # 只认管理员会话，不接受中控设备身份 —— 写操作与后台接口都走这一条。
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
    # [补充说明] 同 authenticated_user，但返回前把用户对象从会话上摘下来。
    #
    # 这样 with 块结束时连接就能归还连接池，路由函数手里只剩一个
    # 已加载好属性的游离对象，后续不再触发任何查询。
    with request.app.state.database.session_factory() as database:
        user = authenticated_user(request, response, database)
        # expunge 之后 user 仍可读已加载字段，但访问未加载关系会抛错。
        database.expunge(user)
        return user


# 需要「只读当前用户」时用这个别名，连接不会被路由逻辑长期占用。
CurrentUser = Annotated[User, Depends(authenticated_short_lived_user)]


def licensed_user(request: Request, user: CurrentUser) -> User:
    # [补充说明] 在已登录基础上要求授权允许 `api` 能力，否则 403。
    #
    # 403 的 detail 里回带当前授权状态，前端据此引导用户去 /license 处理。
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


# 写操作 / 需要授权门禁的接口用这个别名：认证 + api 能力码一次到位。
LicensedUser = Annotated[User, Depends(licensed_user)]


@dataclass(frozen=True)
class ViewerPrincipal:
    # [补充说明] 一次请求的身份主体：管理员会话（user）或已配对的中控设备（display）。

    user: User | None = None
    display: DisplayDevice | None = None
    additional_displays: tuple[DisplayDevice, ...] = ()

    @property
    def displays(self) -> tuple[DisplayDevice, ...]:
        # [补充说明] 全部已配对的中控设备：展示设备在前，嵌入会话追加在后。
        return ((self.display,) if self.display is not None else ()) + self.additional_displays

    @property
    def project_ids(self) -> frozenset[str]:
        # [补充说明] 全部已配对设备绑定的项目 id 集合。
        return frozenset(item.project_id for item in self.displays)

    @property
    def project_id(self) -> str | None:
        # [补充说明] 中控设备绑定的项目；管理员会话返回 None（不受限）。
        return self.display.project_id if self.display is not None else None

    @property
    def is_admin_session(self) -> bool:
        # [补充说明] 是否来自管理员会话 —— 决定查看者是全权还是单项目视角。
        return self.user is not None


def _display_device(
    request: Request, response: Response, database: DatabaseSession
) -> DisplayDevice | None:
    # [补充说明] 解析中控设备 Cookie，返回对应设备；未配对、已失效或已过期返回 None。
    #
    # 有效期是「滑动」的：每次活跃（>= 5 分钟节流）就把 last_seen_at 推到当前时间，
    # 长期不用的平板与只在攻击者手里的令牌会自己过期，正常挂机的墙面平板只要还在轮询就一直有效。
    settings = request.app.state.settings
    token = request.cookies.get(settings.display_cookie_name, '')
    if not token:
        return None
    device = active_display_device(database, token)
    if device is None:
        return None
    now = datetime.now(UTC)
    # 节流窗口：只有设备"冷下来"才回写活跃时间并续期 Cookie（每次心跳都写库会把它变成热点行）。
    if now - _aware(device.last_seen_at) >= timedelta(minutes=5):
        device.last_seen_at = now
        database.commit()
        # 重新下发 Cookie 是为了刷新浏览器侧的有效期，值不变。
        set_display_cookie(response, settings, token)
    # 把设备与项目信息写进日志上下文，接口出错时能直接看出是哪块屏幕。
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
    # [补充说明] 要求「管理员已登录」或「已配对的中控设备」，否则 401。
    #
    # 优先级：管理员会话优先 —— 管理员在已配对的平板上打开页面时看到的仍是完整权限，
    # 而不是被降级成单项目视角。
    user = _admin_session(request, response, database)
    if user is not None:
        return ViewerPrincipal(user=user)
    display = _display_device(request, response, database)
    # 嵌入会话（跨站 iframe）不落在展示设备 Cookie 上，单独列出来。
    devices = list(embedded_devices(request, database))
    now = datetime.now(UTC)
    refreshed = False
    for device in devices:
        # 与展示设备同样的滑动续期节流：只有设备"冷下来"才回写并续发 Cookie。
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
    # 展示设备优先排在第一位：它才是这块屏幕的主身份，嵌入会话追加在后面。
    if display is not None:
        devices = [display] + [item for item in devices if item.id != display.id]
    if devices:
        return ViewerPrincipal(display=devices[0], additional_displays=tuple(devices[1:]))
    # 两者都没有：既没登录也没配对，交给前端跳 /login 或 /pair。
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


# 只读接口（展示页、3D 舞台）优先用这个：认证完就不占连接。
CurrentViewer = Annotated[ViewerPrincipal, Depends(authenticated_short_lived_viewer)]


def licensed_viewer(request: Request, viewer: CurrentViewer) -> ViewerPrincipal:
    # [补充说明] 在已认证基础上要求授权允许 `api` 能力，否则 403。
    #
    # 与 licensed_user 的区别只在主体类型，门禁口径完全一致。
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


# 正式展示页与 3D 舞台用这一组：认证 + api 门禁，且不长期占用连接。
LicensedViewer = Annotated[ViewerPrincipal, Depends(licensed_viewer)]
ShortLivedCurrentViewer = Annotated[ViewerPrincipal, Depends(authenticated_short_lived_viewer)]


def licensed_short_lived_viewer(
    request: Request, viewer: ShortLivedCurrentViewer
) -> ViewerPrincipal:
    # [补充说明] ShortLivedCurrentViewer 之上的 `api` 能力码门禁。
    return licensed_viewer(request, viewer)


ShortLivedLicensedViewer = Annotated[ViewerPrincipal, Depends(licensed_short_lived_viewer)]


def require_viewer_project(viewer: ViewerPrincipal, project_id: str) -> None:
    # [补充说明] 确认当前主体有权访问指定项目，否则 403。
    #
    # 管理员会话的 project_id 为 None，视为不受限直接放行；中控设备只能访问自己绑定的项目。
    if not viewer.is_admin_session and project_id not in viewer.project_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                'code': 'DISPLAY_PROJECT_UNPAIRED',
                'message': '该中控设备未绑定此仪表盘，请重新配对。',
            },
        )


def _display_document(database: DatabaseSession, viewer: ViewerPrincipal) -> dict:
    # [补充说明] 取出中控设备所绑定项目的仪表盘文档。
    #
    # 任何一环缺失（无绑定项目、无草稿、JSON 损坏）都返回空字典，让上层退化成「看不到任何
    # 实体」，而不是把异常抛给展示页。弹窗按 referenced_only=True 水合，不把库里全部弹窗
    # 塞进这份文档。
    if viewer.project_id is None:
        return {}
    documents = []
    for project_id in viewer.project_ids:
        draft = database.get(ProjectDraft, project_id)
        if draft is None:
            continue
        # 草稿损坏时静默降级：展示页宁可空白，也不该整页报错。
        try:
            value = json.loads(draft.document_json)
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(value, dict):
            continue
        documents.append(hydrate_document_popups(database, value, referenced_only=True))
    # 单项目会话仍返回文档本身，多项目（一台浏览器配了多块屏）改返回 pairedDocuments 供展示页分发。
    return documents[0] if len(documents) == 1 else {'pairedDocuments': documents}

def _document_bound_values(value, suffix: str) -> set[str]:
    # [补充说明] 收集文档里所有以指定后缀结尾的键对应的字符串值。
    #
    # 键名比较大小写不敏感（assetId / AssetId 都算），用于按名字约定捞出引用的资源，
    # 不依赖文档结构版本。
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
    # [补充说明] 算出当前主体可见的实体集合；返回 None 表示不受限（管理员会话）。
    #
    # 三步收窄：1) 文档里显式绑定的实体；2) 按「同设备」放开同一物理设备的从属实体
    # （如空调所属设备上的指示灯、热水器的按钮与数值）；3) 小米平台再放开同设备同平台的可用实体。
    # 第 2、3 步是必要的：HA 里一个物理设备会拆成多个域上的实体，只放开显式绑定的那些，
    # 中控面板上的子功能会全部点不动。
    if viewer.project_id is None:
        return None
    allowed = document_entity_ids(_display_document(database, viewer))
    if not allowed:
        return allowed
    # 只认当前活跃的 HA 连接，避免旧连接的实体污染可见范围。
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
    # 后面要按设备去找同设备的其它实体，先建好索引避免每次重查。
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
            # 「这个实体是不是那个物理设备的某个部件」—— 同一部件的命名在集成之间并不统一。
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
            # sources 是该设备上已被显式绑定的实体，规则都以它们为参照。
            automatic = any(
                (
                    # 小米集成会把一个设备的实体分到不同 platform 名下，
                    # 其它集成没有这个情况，因此非小米的只要求平台一致。
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
                    # 配套的 sensor 才是"无人移动"，两个都要放行。
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
                    # 名字里带 airer / 晾衣机 / 晾衣架 才算同一物。
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
    # 因此按 (设备, 平台) 再放开一批可控域，覆盖名字里猜不出来的部件。
    xiaomi_sources = database.scalars(
        select(HAEntity).where(
            HAEntity.connection_id == active_connection_id,
            HAEntity.entity_id.in_(allowed),
            HAEntity.platform.in_(("xiaomi_home", "xiaomi_miot")),
            HAEntity.device_id.is_not(None),
        )
    ).all()
    # 去重出 (设备, 平台) 组合，一个设备一块条件，避免条件数随实体数膨胀。
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
    # [补充说明] 确认该实体在主体的可见范围内，否则 403。
    #
    # 可见范围为 None（管理员会话）时直接放行。
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
    # [补充说明] 当前主体可见的图片资源 ID 集合（去掉前缀）；None 表示不受限。
    #
    # 默认只收 `user:` 前缀 —— 内置素材（builtin:）另有资产目录统一把关，
    # 这里只解决「某块屏不该看到别的屏的图片」。3D 工作室导出图登记成
    # `studio3d:<文件夹>/<文件名>`，用的是同一条「草稿引用过才可见」的规则，
    # 因此调用方可以传自己的前缀复用这套判断，而不必另写一份可见性逻辑。
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
    # [补充说明] 确认该用户图片被当前主体的仪表盘引用，否则 403。
    allowed = viewer_user_asset_ids(database, viewer)
    if allowed is not None and asset_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该图片不属于当前中控仪表盘。",
        )
