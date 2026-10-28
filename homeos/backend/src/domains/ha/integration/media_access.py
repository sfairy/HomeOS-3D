"""HA 媒体代理的实体作用域与有界 HLS 能力（对齐 0.8.1 的 ``ha/media_access.py``）。

媒体代理是通配路由：一旦放行，后续每一帧都不再经过 FastAPI 依赖链。所以 0.8.1 把
「这条流属于谁」这件事拆成两段：

- **入口授权**（:func:`authorize_media`）：解析媒体实体 → 校验查看者能看到它 → 记下
  ``(principal, connection, entity, 作用域版本)`` 四元组，作为本次请求的访问凭证；
- **持续复检**（:func:`check_media_access`）：回复头写出前（以及长连接的复检点）重新
  校验 Cookie 与作用域版本，变了就 403「媒体访问权限已变更」。复检**不续期会话**，
  否则一条一直开着的摄像头流就能把登录态无限延长。

HLS 是特例：``camera/stream`` 返回的播放地址由 HA 签发，浏览器随后会拿这个地址来
拉片段，而片段路径里没有实体 id。:func:`remember_hls` 把「令牌 → 实体」记进一份
**有界**的能力表（``MAX_GRANTS`` / ``GRANT_IDLE_SECONDS``），片段请求靠它反查实体；
表满时淘汰最久没被碰过的条目，闲置超过 5 分钟自动失效。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from threading import RLock
from time import monotonic
from urllib.parse import urlsplit

from fastapi import HTTPException, status
from sqlalchemy import text

from ....dependencies import (
    ViewerPrincipal,
    require_viewer_entity,
    revalidate_viewer,
    viewer_scope_revision,
)
from ....platform.core.models import HAConnection

#: 复检被拒只留一条可查的线索：不记 URL / 令牌，只记拒绝原因。
LOGGER = logging.getLogger(__name__)

#: HLS 能力闲置多久算失效（秒）。
GRANT_IDLE_SECONDS = 300

#: HLS 能力表条目上限：媒体代理是公开路由，不能让它变成无界内存。
MAX_GRANTS = 256

#: 持续响应的复检间隔（秒）：逐帧复检太贵，但授权变化必须在秒级生效。
ACCESS_CHECK_SECONDS = 1

_grant_lock = RLock()


def connection_identity(connection: HAConnection) -> tuple:
    """连接的「同一性」：换地址 / 换令牌即视为另一条连接，旧凭证作废。"""
    return (connection.id, connection.base_url, connection.encrypted_access_token)


def principal_identity(viewer: ViewerPrincipal) -> tuple:
    """查看者的「同一性」：登录会话取用户 id（本项目没有展示设备维度）。"""
    return ('admin', viewer.user.id)


def hls_token(path: str) -> str | None:
    """从 HLS 片段路径里取能力令牌：``/api/hls/<token>/<segment>``。"""
    parts = urlsplit(path).path.split('/')
    if len(parts) >= 5 and parts[1:3] == ['api', 'hls'] and parts[3]:
        return parts[3]
    return None


def _grants(request) -> dict[tuple, tuple[str, float]]:
    grants = getattr(request.app.state, 'ha_media_grants', None)
    if grants is None:
        grants = {}
        request.app.state.ha_media_grants = grants
    return grants


def remember_hls(request, connection: HAConnection, entity_id: str, path: str) -> None:
    """记下「HLS 令牌 → 实体」，供后续片段请求反查。"""
    token = hls_token(path)
    if not token:
        return
    with _grant_lock:
        grants = _grants(request)
        now = monotonic()
        for key, (_entity, touched) in list(grants.items()):
            if now - touched >= GRANT_IDLE_SECONDS:
                grants.pop(key, None)
        key = (connection_identity(connection), token)
        if key not in grants and len(grants) >= MAX_GRANTS:
            grants.pop(min(grants, key=lambda item: grants[item][1]), None)
        grants[key] = (entity_id, now)


def media_entity(request, connection: HAConnection, viewer: ViewerPrincipal) -> str | None:
    """解析本次请求指向的媒体实体。

    代理路由自己带实体（``/api/camera_proxy/camera.<id>``）；HLS 片段没有，只能查
    能力表。查不到时：登录会话直接放行（``None``），展示设备必须已经有有效凭证 ——
    否则任何人拼一个 ``/api/hls/xxx`` 就能穿过实体校验。
    """
    path = request.url.path
    domains = {
        'camera_proxy': 'camera',
        'camera_proxy_stream': 'camera',
        'image_proxy': 'image',
        'media_player_proxy': 'media_player',
    }
    parts = path.split('/')
    if len(parts) >= 4 and parts[2] in domains:
        entity = parts[3]
        # HA 的媒体路径形如 ``camera.kitchen``：域名必须一致，且必须带对象名。
        if entity.partition('.')[0] != domains[parts[2]] or not entity.partition('.')[2]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='媒体实体不存在。')
        return entity
    token = hls_token(path)
    key = (connection_identity(connection), token)
    with _grant_lock:
        grant = _grants(request).get(key) if token else None
        if grant is not None and monotonic() - grant[1] < GRANT_IDLE_SECONDS:
            _grants(request)[key] = (grant[0], monotonic())
            return grant[0]
    if not viewer.is_session:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='摄像头流授权已失效，请重新打开摄像头。',
        )
    return None


@dataclass
class MediaAccess:
    """一次媒体请求的访问凭证（入口授权写入，持续复检读取后原地更新）。"""

    principal: tuple
    connection: tuple
    entity_id: str | None
    scope_revision: tuple | None
    checked_at: float


def authorize_media(request, connection: HAConnection, viewer: ViewerPrincipal) -> None:
    """入口授权：校验实体归属，并把访问凭证挂到 ``request.state``。

    凭证是**逐请求**的：挂到 ``app.state`` 会被并发请求互相覆盖（一个请求的凭证被另
    一个顶掉，复检就永远看不到自己那份）。
    """
    entity = media_entity(request, connection, viewer)
    with request.app.state.database.session_factory() as database:
        database.execute(text('BEGIN'))
        if entity is not None:
            require_viewer_entity(database, viewer, entity)
        revision = viewer_scope_revision(database, viewer)
    request.state.ha_media_access = MediaAccess(
        principal=principal_identity(viewer),
        connection=connection_identity(connection),
        entity_id=entity,
        scope_revision=revision,
        checked_at=monotonic(),
    )


def check_media_access(request, load_connection) -> bool:
    """持续响应的复检：身份 / 连接换了，或作用域版本变了且实体不再可见 → ``False``。

    ``load_connection`` 由调用方注入（代理模块自己的 ``load_active_connection``），
    避免这里反向依赖 API 层。上一次复检在 ``ACCESS_CHECK_SECONDS`` 内的直接放行。
    """
    access = getattr(getattr(request, 'state', None), 'ha_media_access', None)
    if access is None:
        # 入口未建立凭证（无查看者身份的调用路径）：没有可复检的作用域。
        return True
    if monotonic() - access.checked_at < ACCESS_CHECK_SECONDS:
        return True
    viewer = revalidate_viewer(request)
    connection = load_connection(request.app.state.database)
    if (
        principal_identity(viewer) != access.principal
        or connection is None
        or connection_identity(connection) != access.connection
    ):
        return False
    try:
        with request.app.state.database.session_factory() as database:
            revision = viewer_scope_revision(database, viewer)
            if revision != access.scope_revision and access.entity_id is not None:
                require_viewer_entity(database, viewer, access.entity_id)
            access.scope_revision = revision
        access.checked_at = monotonic()
    except HTTPException as error:
        LOGGER.warning('媒体访问复检被拒绝：%s', error.detail)
        return False
    return True
