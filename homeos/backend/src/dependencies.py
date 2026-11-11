"""FastAPI 依赖：身份认证与授权门禁。

说明：中控设备配对码机制已移除 —— 展示页（/display、/homeos）与编辑器共用同一登录
会话，因此这里不再有「登录用户 / 已配对中控设备」双身份分支。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status

from .platform.core.db.models import User
from .platform.core.http.errors import unauthorized
from .platform.security.auth_context import get_current_user
from .platform.security.viewer_scope import (
    DatabaseSession,
    ViewerPrincipal,
    authenticated_viewer,
    resolve_session_user,
)


def authenticated_user(
    request: Request, response: Response, database: DatabaseSession
) -> User:
    user = resolve_session_user(request, response, database)
    if user is None:
        # 与 ``security.auth_context.get_current_user`` 走同一个 helper，保证两套鉴权依赖的
        # 未登录响应逐字段一致（``errorCode=UNAUTHORIZED``）。前端按 ``errorCode`` 分派
        # 「未登录 → 跳登录页」，同一个语义给两种码会让部分端点上的跳转悄悄失效。
        unauthorized('登录状态已失效，请重新登录。')
    return user


def authenticated_short_lived_user(
    request: Request, response: Response
) -> User:
    """**兼容入口**：自取一条短会话并把用户 detach 后返回。

    路由请用 ``CurrentUser`` —— 它复用请求级会话（``authenticated_user``），不再为
    每个请求额外开第二条数据库连接；本函数只保留给历史的**直接调用点**
    （``api/backups.py`` 在后台线程里调用它取一份脱离会话的用户快照）。
    """
    with request.app.state.database.session_factory() as database:
        user = authenticated_user(request, response, database)
        database.expunge(user)
        return user


CurrentUser = Annotated[User, Depends(authenticated_user)]


def _license_restricted(request: Request) -> HTTPException:
    """授权门禁统一的 403：``detail.code = LICENSE_RESTRICTED``。

    ``detail`` 是既有协议的一部分（studio 侧 ``home.ts`` / ``display.ts`` /
    ``studio-app.ts`` 读 ``payload.detail.code`` 判断「该跳到激活页」），所以这里保持
    结构不变，只把「什么时候需要 403」的判断收成一处，避免两个门禁依赖各写一份文案与形状。
    """
    license_status = request.app.state.license_service.status()
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            'code': 'LICENSE_RESTRICTED',
            'message': '当前授权状态不允许执行此操作。',
            'licenseStatus': license_status['status'],
        },
    )


def licensed_user(request: Request, user: CurrentUser) -> User:
    if not request.app.state.license_service.allows():
        raise _license_restricted(request)
    return user


LicensedUser = Annotated[User, Depends(licensed_user)]


def licensed_cached_session(
    request: Request, user: Annotated[dict, Depends(get_current_user)]
) -> dict:
    """登录 + 授权门禁的轻量版：会话解析走 ``get_current_user`` 的短 TTL 缓存。

    只给「静态代码资源」这类高并发、不需要 ORM 用户实体的只读路由用：一个 3D 舞台
    冷启动会并发拉上百个运行时模块，逐个开库查 sessions 表会把连接池排满。
    吊销语义与 ``get_current_user`` 相同（登出/改密立即清缓存，其余最多滞后 TTL）。
    """
    if not request.app.state.license_service.allows():
        raise _license_restricted(request)
    return user


LicensedCachedSession = Annotated[dict, Depends(licensed_cached_session)]


def require_license_feature(request: Request, feature: str) -> None:
    """路由级功能码门禁：登录之上再判一次「这张租约有没有开通这个能力」。

    ``LicensedUser`` / ``LicensedViewer`` 只判「授权整体是否可用」，不判具体能力，
    因此素材、展示数据这类路由必须显式调用本依赖，否则只买基础版的租约也能读到。
    判定与 ``LicenseService.allows`` 共用同一份 ``features.granted``（含 ``all`` 展开与蕴含）。

    ``feature`` 一律传 ``domains.license.features`` 里的常量，不要写字面串。
    """
    if not request.app.state.license_service.allows(feature):
        raise _license_restricted(request)


def license_feature(feature: str):
    """把 :func:`require_license_feature` 包成路由级依赖。

    供 ``APIRouter(dependencies=[license_feature(FEATURE_X)])`` 使用 —— 整个模块路由共享
    一个能力码门禁，新增端点默认受保护，不必逐个补 ``require_license_feature``。
    """

    def _dependency(request: Request) -> None:
        require_license_feature(request, feature)

    return Depends(_dependency)


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
        raise _license_restricted(request)
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


def viewer_user_asset_ids(
    database: DatabaseSession,
    viewer: ViewerPrincipal,
    prefixes: tuple[str, ...] = ("user:",),
) -> set[str] | None:
    """返回当前查看者可见的用户素材白名单；``None`` 表示不限制。

    登录会话与编辑器同权限，素材不做收敛；保留函数以维持资产侧调用点不变。
    """
    return None


def viewer_asset_ids(
    database: DatabaseSession,
    viewer: ViewerPrincipal,
    prefixes: tuple[str, ...] = ('user:', 'studio3d:', 'font:'),
) -> set[str] | None:
    """查看者可见的可变素材白名单；``None`` 表示不限制（0.8.1 新增）。

    与 :func:`viewer_user_asset_ids` 同源，区别只在默认前缀包含 ``studio3d:`` / ``font:``。
    删除 / 覆盖侧用它判断「这张图是不是仪表盘自己的」。
    """
    return viewer_user_asset_ids(database, viewer, prefixes=prefixes)


def require_viewer_asset(
    database: DatabaseSession,
    viewer: ViewerPrincipal,
    asset_id: str,
) -> None:
    """校验素材属于当前查看者的仪表盘；``None`` 白名单时恒放行（0.8.1 新增）。"""
    allowed = viewer_asset_ids(database, viewer)
    if allowed is None or asset_id in allowed:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail='该图片不属于当前中控仪表盘。',
    )


def require_viewer_user_asset(
    database: DatabaseSession, viewer: ViewerPrincipal, asset_id: str
) -> None:
    """校验查看者是否有权访问该素材；登录会话不做收敛。"""
    return
