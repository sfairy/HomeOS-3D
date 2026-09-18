"""FastAPI 依赖：身份认证、授权门禁与中控视角的数据可见范围。

三层结构，逐层收紧：
1. 认证层 —— 解析管理员会话 Cookie 或中控设备 Cookie，得出 ViewerPrincipal；
2. 授权层 —— 在认证之上叠加能力码门禁（api / projects.write 等）；
3. 可见范围层 —— 中控设备只能看到自己绑定的实体与图片，由 viewer_entity_ids 收窄。

命名约定：带 `short_lived` 的版本会在返回前把 ORM 对象 detach（expunge），
让数据库连接尽早归还连接池；中控设备长时间挂着展示页，不这样做容易耗尽连接。
"""
from __future__ import annotations

# 导入顺序保持原有分组：标准库 / 第三方 / 本项目，便于对照改动。
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
from .global_popups import hydrate_document_popups
from .http_security import secure_cookies_enabled
from .models import (
    DisplayDevice,
    HAConnection,
    HAEntity,
    ProjectDraft,
    User,
)
from .panel.documents import parse_document
from .panel.entity_refs import document_entity_ids
from .security import set_display_cookie


def get_database_session(request: Request):
    """把应用级会话工厂转成 FastAPI 的请求级依赖。

    用 yield 而不是 return：请求结束时生成器的清理逻辑会关闭会话，
    因此每个请求拿到的是全新会话，不会跨请求串状态。
    """
    yield from request.app.state.database.sessions()


# 路由函数标注 DatabaseSession 即可拿到可用会话，不必感知工厂细节。
DatabaseSession = Annotated[Session, Depends(get_database_session)]


def _aware(value: datetime) -> datetime:
    """把可能缺失时区的时间统一成 UTC aware。

    SQLite 取回的 datetime 常常没有 tzinfo，直接与 aware 时间比较会抛
    TypeError，所以所有落库时间在比较前都要过这一层。
    """
    return (
        value
        if value.tzinfo is not None
        else value.replace(tzinfo=timezone.utc)
    )


def _admin_session(
    request: Request, response: Response, database: DatabaseSession
) -> User | None:
    """解析管理员会话 Cookie，返回当前登录用户；不满足条件返回 None。

    判定口径全部在 ``access.check_admin_session`` 里（含绝对寿命与归属校验），
    这里只负责它需要的副作用：清理失效会话行、滑动续期并重写 Cookie，
    以及把身份写进日志上下文。

    副作用：会话过半程后会滑动续期（更新 last_seen_at / expires_at）并重写
    Cookie，让长时间开着编辑器的用户不会中途掉线。
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
        # 续期回写与 Cookie 重发必须同时发生，否则浏览器侧会比服务端先过期。
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
    """要求管理员已登录，否则 401。

    只认管理员会话，不接受中控设备身份 —— 写操作与后台接口都走这一条。
    """
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

    这样 with 块结束时连接就能归还连接池，路由函数手里只剩一个
    已加载好属性的游离对象，后续不再触发任何查询。
    """
    with request.app.state.database.session_factory() as database:
        user = authenticated_user(request, response, database)
        # expunge 之后 user 仍可读已加载字段，但访问未加载关系会抛错。
        database.expunge(user)
        return user


# 需要「只读当前用户」时用这个别名，连接不会被路由逻辑长期占用。
CurrentUser = Annotated[User, Depends(authenticated_short_lived_user)]


def licensed_user(request: Request, user: CurrentUser) -> User:
    """在已登录基础上要求授权允许 `api` 能力，否则 403。

    403 的 detail 里回带当前授权状态，前端据此引导用户去 /license 处理。
    """
    if not request.app.state.license_service.allows("api"):
        license_status = request.app.state.license_service.status()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "LICENSE_RESTRICTED",
                "message": "当前授权状态不允许执行此操作。",
                "licenseStatus": license_status["status"],
            },
        )
    return user


# 写操作 / 需要授权门禁的接口用这个别名：认证 + api 能力码一次到位。
LicensedUser = Annotated[User, Depends(licensed_user)]


# ViewerPrincipal 的唯一实现在 access 里（与本模块的解析入口同源），
# 这里保留导入名是为了不改动各路由的 `from ..dependencies import ViewerPrincipal`。


def _display_device(
    request: Request, response: Response, database: DatabaseSession
) -> DisplayDevice | None:
    """解析中控设备 Cookie，返回对应设备；未配对、已失效或已过期返回 None。

    有效期是「滑动」的：每次活跃（>= 5 分钟节流）就把 last_seen_at 推到当前时间，
    因此有效期按 last_seen_at + display_token_ttl_seconds 判定 ——
    长期不用的平板与只在攻击者手里的令牌会自己过期，而正常挂机的墙面平板
    只要还在轮询就一直有效。另有一个可选的硬上限（默认关闭），见 config。
    两道有效期都由 ``display_access.active_display_device`` 判定（B2），
    这里不再自己查一遍，也不再自己判断有没有查过。

    副作用：同样做了心跳节流 —— 设备超过 5 分钟没活跃才写一次库并刷新
    Cookie，因为展示页会长期挂机、每次请求都写库会拖慢整个看板。
    """
    settings = request.app.state.settings
    token = display_token_from(request.cookies, settings)
    if not token:
        return None
    now = datetime.now(timezone.utc)
    device = active_display_device(database, settings, token, now=now)
    if device is None:
        return None
    # 5 分钟节流窗口：只有设备"冷下来"才回写活跃时间并续期 Cookie。
    if now - _aware(device.last_seen_at) >= timedelta(minutes=5):
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
    """要求「管理员已登录」或「已配对的中控设备」，否则 401。

    优先级：管理员会话优先。这样管理员在已配对的平板上打开页面时，
    看到的仍是完整权限，而不是被降级成单项目视角。

    与页面路由、实时连接共用 access.resolve_principal 这一个入口（B32）：
    三处各写一遍时，其中两处漏查了绝对寿命与中控令牌有效期（B2/B3）。
    """
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

    展示页会长期挂着 WebSocket 与轮询请求，连接不及时归还很快就把池占满。
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
    """在已认证基础上要求授权允许 `api` 能力，否则 403。

    与 licensed_user 的区别只在主体类型，门禁口径完全一致。
    """
    if not request.app.state.license_service.allows("api"):
        license_status = request.app.state.license_service.status()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "LICENSE_RESTRICTED",
                "message": "当前授权状态不允许执行此操作。",
                "licenseStatus": license_status["status"],
            },
        )
    return viewer


# 正式展示页与 3D 舞台用这一组：认证 + api 门禁，且不长期占用连接。
LicensedViewer = Annotated[ViewerPrincipal, Depends(licensed_viewer)]

# 语义同 CurrentViewer，只改名字以在路由签名里表达"还没过授权门禁"。
ShortLivedCurrentViewer = Annotated[
    ViewerPrincipal, Depends(authenticated_short_lived_viewer)
]


def licensed_short_lived_viewer(
    request: Request, viewer: ShortLivedCurrentViewer
) -> ViewerPrincipal:
    """ShortLivedCurrentViewer 版本的授权门禁，直接复用 licensed_viewer 口径。"""
    return licensed_viewer(request, viewer)


ShortLivedLicensedViewer = Annotated[
    ViewerPrincipal, Depends(licensed_short_lived_viewer)
]


def require_viewer_project(viewer: ViewerPrincipal, project_id: str) -> None:
    """确认当前主体有权访问指定项目，否则 403。

    管理员会话的 project_id 为 None，视为不受限直接放行；
    中控设备只能访问自己绑定的那一个项目。
    """
    if viewer.project_id is not None and viewer.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该中控设备未绑定此仪表盘。",
        )
    return None


def _display_document(database: DatabaseSession, viewer: ViewerPrincipal) -> dict:
    """取出中控设备所绑定项目的仪表盘文档。

    任何一环缺失（无绑定项目、无草稿、JSON 损坏）都返回空字典，
    让上层退化成"看不到任何实体"，而不是把异常抛给展示页。
    弹窗按 referenced_only=True 水合：只带出文档真正引用到的组合弹窗，
    不把库里全部弹窗塞进这份文档。
    """
    if viewer.project_id is None:
        return {}
    draft = database.get(ProjectDraft, viewer.project_id)
    if draft is None:
        return {}
    # 草稿损坏时静默降级：展示页宁可空白，也不该整页报错（B54 的统一入口）。
    value = parse_document(draft.document_json)
    if value is None:
        return {}
    return hydrate_document_popups(database, value, referenced_only=True)


def _document_bound_values(value, suffix: str) -> set[str]:
    """收集文档里所有以指定后缀结尾的键对应的字符串值。

    键名比较大小写不敏感（assetId / AssetId 都算），
    用于按名字约定捞出引用的资源，不依赖文档结构版本。
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

    三步收窄：
    1. 先取文档里显式绑定的实体（document_entity_ids）；
    2. 再按「同设备」放开这些实体所属设备上、语义上属于同一物的从属实体 ——
       例如空调实体所属设备上的指示灯、热水器的按钮与数值；
    3. 最后对小米平台再放开一层：同设备同平台的可用实体。

    第 2、3 步是必要的：HA 里一个物理设备会拆成多个域上的实体，
    只放开显式绑定的那些，中控面板上的子功能会全部点不动。
    """
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
            # identity 把候选实体的所有可读名字折成一个小写串，
            # 后面用关键词匹配判断"这个实体是不是那个物理设备的某个部件"——
            # HA 里同一个部件的命名在集成之间并不统一，只能靠名字兜底。
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
                    source.domain in {"fan", "climate"}
                    and candidate_domain == "light"
                    # 热水器的控制按钮与数值 / 选择项。
                    or source.domain == "water_heater"
                    and candidate_domain
                    in {"button", "number", "select", "switch"}
                    # 扫地机的清洁模式与电量。
                    or source.domain == "vacuum"
                    and (
                        candidate_domain == "select"
                        and (
                            candidate.translation_key == "cleaning_mode"
                            or "cleaning_mode" in identity
                        )
                        or candidate_domain == "sensor"
                        and (
                            candidate.translation_key == "battery"
                            or "battery" in identity
                            or "电量" in identity
                        )
                    )
                    # 人体传感器：event 域本体是"有人移动"，
                    # 配套的 sensor 才是"无人移动"，两个都要放行。
                    or source.domain == "event"
                    and candidate_domain == "sensor"
                    and (
                        "no_motion" in identity
                        or "no motion" in identity
                        or "无移动" in identity
                        or "无人移动" in identity
                    )
                    # 窗帘电机的反向开关。
                    or source.domain == "cover"
                    and candidate_domain in {"select", "switch"}
                    and (
                        "motor_reverse" in identity
                        or "电机反向" in identity
                    )
                    # 晾衣机：本体是 cover，它的照明是 light，
                    # 名字里带 airer / 晾衣机 / 晾衣架 才算同一物。
                    or source.domain == "cover"
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
                    )
                    # 晾衣机的升降设定值与当前位置。
                    or source.domain == "cover"
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
                    )
                    # 扫地机的工作状态传感器。
                    or source.domain == "sensor"
                    and source.translation_key
                    in {"state", "status", "task_status"}
                    and candidate_domain == "vacuum"
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
    """确认该实体在主体的可见范围内，否则 403。

    可见范围为 None（管理员会话）时直接放行。
    """
    allowed = viewer_entity_ids(database, viewer)
    if allowed is not None and entity_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该实体不属于当前中控仪表盘。",
        )
    return None


def viewer_user_asset_ids(
    database: DatabaseSession, viewer: ViewerPrincipal
) -> set[str] | None:
    """当前主体可见的用户上传图片 ID 集合；None 表示不受限。

    只收 `user:` 前缀的资源 ID —— 内置素材（builtin:）另有资产目录统一把关，
    这里只解决"某块屏不该看到别的屏的图片"。
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

    同一份文档里 `studio3d:<导出目录>/<文件名>` 形式的引用（assetId / effectAssetId
    都算）。3D 导出目录是按项目生成的，但接口只按「目录名 + 文件名」取文件，
    不做归属校验的话，任何一台中控设备都能遍历出别的项目的户型图与图层截图
    （跨项目 IDOR）。这里把可见范围收窄到「本仪表盘文档真正引用到的那些文件」。

    为什么按文件而不是按目录放开：一个导出目录里既有被引用的图层，也有中间产物
    与整包 zip，直接按目录放开等于把该项目的全部导出物都暴露出去。
    """
    if viewer.project_id is None:
        return None
    # 键名后缀匹配是大小写不敏感的（assetId / AssetId / effectAssetId / imageAssetId…
    # 全部命中），因此一次扫描就够，不必逐字段枚举。
    return {
        item
        for item in _document_bound_values(_display_document(database, viewer), "assetId")
        if item.startswith("studio3d:")
    }


def require_viewer_studio3d_asset(
    database: DatabaseSession, viewer: ViewerPrincipal, asset_id: str
) -> None:
    """确认该 3D 导出资源被当前主体的仪表盘引用，否则 403。

    asset_id 形如 `studio3d:<导出目录>/<文件名>`；对不上就拒绝，
    文案与用户图片那条保持一致口径（不区分「不存在」与「无权访问」的细节）。
    """
    allowed = viewer_studio3d_asset_ids(database, viewer)
    if allowed is not None and asset_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该图片不属于当前中控仪表盘。",
        )
    return None


def require_viewer_user_asset(
    database: DatabaseSession, viewer: ViewerPrincipal, asset_id: str
) -> None:
    """确认该用户图片被当前主体的仪表盘引用，否则 403。"""
    allowed = viewer_user_asset_ids(database, viewer)
    if allowed is not None and asset_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该图片不属于当前中控仪表盘。",
        )
    return None
