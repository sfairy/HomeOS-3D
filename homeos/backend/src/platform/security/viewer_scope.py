"""会话身份与查看者范围：请求级数据库会话、登录用户解析与查看者授权钩子。

路由层的 FastAPI 依赖（``dependencies.py``）与领域层的长连接复检（媒体代理 / 摄像头流）
共用这里的实现；放在 platform 是为了让领域层不必反向依赖请求面模块。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth_context import authenticate_session
from ..core.db.models import GlobalCustomPopupState, ProjectDraft, User
from ..core.http.errors import unauthorized


def get_database_session(request: Request):
    yield from request.app.state.database.sessions()


DatabaseSession = Annotated[Session, Depends(get_database_session)]


def resolve_session_user(
    request: Request,
    response: Response,
    database: DatabaseSession,
    *,
    refresh: bool = True,
) -> User | None:
    """解析当前用户（ORM 实体）：homeos-3d 的 DB 会话（``sessions`` 表）。

    解析 / 续期 / 回写 Cookie 的唯一实现在 ``security.auth_context.authenticate_session``
    —— 与 ``get_current_user`` 共用同一份逻辑与同一个会话生存期配置。

    ``refresh=False`` 表示**只校验、不续期**：长连接（摄像头流、媒体代理）逐帧复检时
    如果每次都续期，一条开着不动的流就能把会话永远吊活。调用方通常在 worker 线程里用
    临时 ``Response`` 承接 Cookie 写入，续期结果本来也回不到浏览器。
    """
    user = authenticate_session(request, response, database, refresh=refresh)
    if user is not None:
        context = getattr(request.state, "log_context", None)
        if context is not None:
            context["actor"] = user.username
    return user


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
    request: Request,
    response: Response,
    database: DatabaseSession,
    *,
    refresh: bool = True,
) -> ViewerPrincipal:
    user = resolve_session_user(request, response, database, refresh=refresh)
    if user is None:
        # 与 ``authenticated_user`` / ``auth_context.get_current_user`` 同一口径。
        unauthorized("请先登录。")
    return ViewerPrincipal(user=user)


def revalidate_viewer(request: Request) -> ViewerPrincipal:
    """长连接的会话复检：**只校验原始 Cookie，不续期**（0.8.1 新增）。

    媒体代理 / 摄像头流是持续响应，浏览器不会再收到 ``Set-Cookie``；如果这里照常续期，
    一条一直开着的流就能无限延长会话，吊销账号要等到流断开才生效。因此用临时
    ``Response`` 承接（续期写进去也回不到浏览器），并显式 ``refresh=False``。

    同步实现：调用点在 worker 线程（``asyncio.to_thread``）里，SQLite 查询不占事件循环。
    """
    with request.app.state.database.session_factory() as database:
        viewer = authenticated_viewer(request, Response(), database, refresh=False)
        database.expunge(viewer.user)
        return viewer


def viewer_scope_revision(database: DatabaseSession, viewer: ViewerPrincipal) -> tuple | None:
    """查看者可见范围的廉价版本戳（0.8.1 新增）。

    提交式响应靠它判断「授权范围变了吗」，只在真的变了时才重新展开实体 / 素材白名单。
    现行模型没有 per-viewer 的项目收敛（``viewer.project_ids`` 不存在 → 恒 ``None``），
    因此这里与上游「无仪表盘作用域时返回 ``None``」的分支同义；接入展示设备作用域后
    只需让 ``ViewerPrincipal`` 暴露 ``project_ids``，本函数无需改动。
    """
    project_ids = getattr(viewer, "project_ids", None)
    if not project_ids:
        return None
    drafts = database.execute(
        select(ProjectDraft.project_id, ProjectDraft.revision)
        .where(ProjectDraft.project_id.in_(project_ids))
        .order_by(ProjectDraft.project_id)
    ).all()
    popups = database.scalar(select(GlobalCustomPopupState.revision).where(GlobalCustomPopupState.id == 1))
    return (tuple(tuple(row) for row in drafts), popups)


def require_viewer_entity(database: DatabaseSession, viewer: ViewerPrincipal, entity_id: str) -> None:
    """实体级 ACL 校验占位：现行模型不做 per-entity 收敛（恒放行）。

    调用点（HA 代理等）保留以便将来接白名单时无需改路由签名。
    """
    return
