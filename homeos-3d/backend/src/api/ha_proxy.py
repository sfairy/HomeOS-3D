# [补充说明] Home Assistant 媒体与摄像头的反向代理。
#
# 浏览器不能直接访问 HA（Token 只在服务端，HA 常在私网），因此把 camera_proxy /
# camera_proxy_stream / image_proxy / media_player_proxy / hls 几类路径中转到 HA：
# 注入服务端 Bearer Token，剥掉浏览器凭据与转发头，只放行这些前缀并拒绝路径绕过。
#
# camera_hls_stream 额外做实体归属校验（它会用服务端令牌向 HA 换取播放地址），
# 快照走带 TTL 的进程内缓存并在后台刷新；媒体流是长连接，流式分支超时设为 None（不主动掐断）。
from __future__ import annotations

import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from time import monotonic
from urllib.parse import parse_qs

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse, Response, StreamingResponse

from .ha import active_connection
from ..database import Database
from ..dependencies import ShortLivedLicensedViewer, ViewerPrincipal, require_viewer_entity
from ..ha.client import HAClientError
from ..ha.crypto import CredentialCipherError

router = APIRouter(include_in_schema=False)
# 允许代理的 HA 媒体路径前缀。代理是通配路由，这份白名单就是唯一的门禁：
# 只有摄像头实时流、图片与 HLS 片段能穿过去，其它 HA 接口一律被拦下。
ALLOWED_MEDIA_PROXY_PREFIXES = (
    '/api/camera_proxy/',
    '/api/camera_proxy_stream/',
    '/api/image_proxy/',
    '/api/media_player_proxy/',
    '/api/hls/',
)
# 转发给 HA 前要剥掉的请求头：逐跳头、浏览器凭据（cookie / authorization）与
# 外层反代的来源信息。不剥这些会把自己的部署拓扑透给 HA，也可能让 HA 误判请求来源。
REQUEST_HEADERS_TO_DROP = {
    'te',
    'via',
    'host',
    'cookie',
    'origin',
    'referer',
    'trailer',
    'upgrade',
    'forwarded',
    'connection',
    'authorization',
    'x-scheme',
    'x-real-ip',
    'x-client-ip',
    'content-length',
    'true-client-ip',
    'cf-connecting-ip',
    'transfer-encoding',
    'proxy-authorization',
}
# 回传浏览器前要剥掉的响应头：hop-by-hop 头，以及 content-length / content-encoding ——
# 这里会改写响应体（流式透传或本地缓存命中），长度与编码必须由本服务重新决定。
RESPONSE_HEADERS_TO_DROP = {
    'connection',
    'set-cookie',
    'content-length',
    'content-encoding',
    'transfer-encoding',
}
# 快照缓存 8 秒：多个面板、多块屏在同一时刻刷新时，HA 只需被请求一次。
CAMERA_SNAPSHOT_CACHE_TTL_SECONDS = 8
# 缓存条目上限，超限按创建时间淘汰最旧一条，防止长期运行把内存吃满。
CAMERA_SNAPSHOT_CACHE_MAX_ENTRIES = 64


@dataclass
class CameraSnapshotCacheEntry:
    # [补充说明] 一张已缓存的摄像头快照：字节内容、媒体类型与写入时刻（monotonic）。

    content: bytes
    content_type: str
    created_at: float


# 快照缓存：键为「HA 基址 + 代理路径」，值为最近一次成功回源的快照。
camera_snapshot_cache: dict[str, CameraSnapshotCacheEntry] = {}
# 正在后台刷新的任务：与缓存同键；同键已有未完成任务时不再重复发起。
camera_snapshot_refreshes: dict[str, asyncio.Task[None]] = {}


def upstream_path(request: Request) -> str:
    # [补充说明] 拼出要转给 HA 的路径（含查询串）；HA 侧路径与本服务完全一致。
    path = request.url.path
    query = request.url.query
    return f'{path}?{query}' if query else path


def upstream_request_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """Keep media request headers without leaking an outer reverse-proxy hop to HA."""
    # 筛选转给 HA 的请求头，不把外层反代的信息透给 HA。
    return {
        name: value
        for name, value in headers.items()
        # 保留 Range / If-None-Match 等影响媒体内容的头，只丢弃黑名单头与全部 x-forwarded-*。
        if name.lower() not in REQUEST_HEADERS_TO_DROP and not name.lower().startswith('x-forwarded-')
    }


def allowed_media_proxy_path(path: str) -> bool:
    """Allow only HA media paths and reject path-normalization bypasses."""
    # 判断路径是否允许代理：既要命中白名单前缀，也不能含路径归一化写法。
    if not path.startswith(ALLOWED_MEDIA_PROXY_PREFIXES) or '\\' in path:
        return False
    # 逐段检查：'.' / '..' 可用 /api/hls/../xxx 绕过前缀检查打到别的 HA 接口。
    return all(segment not in {'.', '..'} for segment in path.split('/'))


def rewrite_location(value: str, base_url: str) -> str:
    # [补充说明] 把 HA 返回的绝对地址改写成本服务可代理的相对路径。
    #
    # Location 头与 HLS 播放地址可能是 HA 的绝对 URL，浏览器直接访问打不到，
    # 因此去掉 HA 基址前缀，改成 /api/... 形式；不是同基址的地址原样返回。
    normalized_base = base_url.rstrip('/')
    if value == normalized_base:
        # HA 指向自己的根地址，等价于站点首页。
        return '/'
    if value.startswith(f'{normalized_base}/'):
        # 同基址的绝对路径直接去掉基址，省一次 URL 解析。
        return value[len(normalized_base):]
    return value


def versioned_image_proxy_cache_control(path: str, query: str, status_code: int) -> str | None:
    """Cache state-versioned HA images without changing live camera behavior."""
    # 为「带版本参数」的 HA 图片给出可长期缓存的 Cache-Control：
    # 只对 /api/image_proxy/ 的 2xx 生效（带 hb 参数说明内容变化会反映在 URL 上）。
    if path.startswith('/api/image_proxy/') and 200 <= status_code < 300:
        # hb_live=1 表示前端正在等实时画面，此时一律不可缓存，避免把旧图交出去。
        if parse_qs(query).get('hb_live') == ['1']:
            return 'private, no-store'
        # hb 是前端给「实体状态图」打的版本戳，值为空等同于没有版本信息，不能长缓存。
        versioned = any(
            key == 'hb' and bool(value)
            for part in query.split('&')
            if part
            for key, separator, value in [part.partition('=')]
            if separator
        )
        # 摄像头快照等实时图片没有 hb 参数，返回 None 以免被浏览器缓存住。
        return 'private, max-age=600, immutable' if versioned else None
    return None


def camera_snapshot_cache_key(base_url: str, path: str) -> str:
    # [补充说明] 快照缓存键：HA 基址 + 代理路径。
    #
    # 基址挡「同进程配过多个地址」、路径挡「同一台 HA 上不同摄像头互串」。
    return f'{base_url.rstrip("/")}{path}'


def _remember_camera_snapshot(key: str, content: bytes, content_type: str) -> None:
    # [补充说明] 写入快照缓存；超上限时先按创建时间淘汰最旧的一条。
    if key not in camera_snapshot_cache and len(camera_snapshot_cache) >= CAMERA_SNAPSHOT_CACHE_MAX_ENTRIES:
        oldest_key = min(camera_snapshot_cache, key=lambda item: camera_snapshot_cache[item].created_at)
        camera_snapshot_cache.pop(oldest_key, None)
    camera_snapshot_cache[key] = CameraSnapshotCacheEntry(content=content, content_type=content_type or 'image/jpeg', created_at=monotonic())


def _camera_snapshot_response(entry: CameraSnapshotCacheEntry) -> Response:
    # [补充说明] 把缓存条目转成响应；快照统一按 no-store 下发，缓存策略由服务端掌握。
    return Response(content=entry.content, media_type=entry.content_type, headers={'cache-control': 'private, no-store'})


def load_active_connection(database_manager: Database):
    # [补充说明] 取当前的活跃 HA 连接；没有则返回 None（由调用方转成 409）。
    #
    # 跑在 asyncio.to_thread 的线程里，因此用独立会话并在返回前 expunge，
    # 避免把绑定在事件循环线程上的会话对象带出去。
    with database_manager.session_factory() as database:
        connection = active_connection(database)
        if connection is not None:
            database.expunge(connection)
        return connection


def load_authorized_camera_connection(database_manager: Database, viewer: ViewerPrincipal, entity_id: str):
    # [补充说明] 取摄像头实体所属的活跃连接，同时校验该实体在当前主体可见范围内。
    #
    # 不可见的实体由 require_viewer_entity 直接抛 403；没有活跃连接返回 None，由调用方转成 409。
    with database_manager.session_factory() as database:
        require_viewer_entity(database, viewer, entity_id)
        connection = active_connection(database)
        if connection is not None:
            database.expunge(connection)
        return connection


async def _refresh_camera_snapshot(key: str, target: str, headers: Mapping[str, str], verify_tls: bool, timeout: float) -> None:
    # [补充说明] 后台回源一次快照并写进缓存；失败不打扰请求方，只清理在途标记。
    try:
        async with httpx.AsyncClient(verify=verify_tls, timeout=timeout, follow_redirects=False) as client:
            upstream = await client.get(target, headers=dict(headers))
        if 200 <= upstream.status_code < 300 and upstream.content:
            _remember_camera_snapshot(key, upstream.content, upstream.headers.get('content-type', 'image/jpeg'))
    except httpx.HTTPError:
        return
    finally:
        # 无论成功失败都要摘掉在途标记，否则这个键的刷新会被永久挡住。
        camera_snapshot_refreshes.pop(key, None)


def _schedule_camera_snapshot_refresh(key: str, target: str, headers: Mapping[str, str], verify_tls: bool, timeout: float) -> None:
    # [补充说明] 为一个已过期的缓存键排一次后台刷新；同键已有任务在跑就直接复用。
    existing = camera_snapshot_refreshes.get(key)
    if existing and not existing.done():
        return
    task = asyncio.create_task(_refresh_camera_snapshot(key, target, headers, verify_tls, timeout))
    camera_snapshot_refreshes[key] = task
    return


async def proxy_http(request: Request) -> Response:
    # [补充说明] 媒体代理的核心实现：与身份无关的通用转发。
    #
    # 门禁：只允许 GET / HEAD 且路径命中白名单；未配置 HA 抛 409，凭证解密失败或回源失败
    # 抛 502。查询串原样带给 HA，返回上游响应（流式或一次性），必要时改写缓存与 Location 头。
    if request.method not in {'GET', 'HEAD'} or not allowed_media_proxy_path(request.url.path):
        # 路径不合规统一回 404 而不是 403：不向扫描者暴露哪些前缀存在。
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='媒体资源不存在。')
    connection = await asyncio.to_thread(load_active_connection, request.app.state.database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    try:
        client_config = await request.app.state.ha_connector.client_for(connection)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error
    headers = upstream_request_headers(request.headers)
    # Token 只在这一层注入，浏览器侧永远看不到它。
    access_token = client_config.access_token
    headers['authorization'] = f'Bearer {access_token}'
    headers['accept-encoding'] = 'identity'
    proxy_path = upstream_path(request)
    target = f'{client_config.base_url}{proxy_path}'
    stream_response = request.url.path.startswith('/api/camera_proxy_stream/')
    snapshot_request = request.method == 'GET' and request.url.path.startswith('/api/camera_proxy/')
    snapshot_key = camera_snapshot_cache_key(client_config.base_url, request.url.path) if snapshot_request else ''
    if snapshot_request:
        cached = camera_snapshot_cache.get(snapshot_key)
        if cached is not None:
            # hb_live=1 表示前端在等实时画面：命中缓存时顺便触发后台刷新，并把 TTL 压到 1 秒。
            live_map = parse_qs(request.url.query).get('hb_live') == ['1']
            ttl = 1 if live_map else CAMERA_SNAPSHOT_CACHE_TTL_SECONDS
            if monotonic() - cached.created_at >= ttl:
                # 过期就排一次后台回源：本次仍把旧图还给前端，不阻塞这次请求。
                _schedule_camera_snapshot_refresh(snapshot_key, f'{client_config.base_url}{request.url.path}', headers, client_config.verify_tls, client_config.timeout)
                if live_map:
                    # 实时画面等得起一次刷新：shield 保证等待期间取消不会掐掉后台任务。
                    pending = camera_snapshot_refreshes.get(snapshot_key)
                    if pending is not None:
                        await asyncio.shield(pending)
                    refreshed = camera_snapshot_cache.get(snapshot_key)
                    if refreshed is None or refreshed is cached:
                        raise HTTPException(status_code=502, detail='实时地图暂时无法刷新。')
                    cached = refreshed
            return _camera_snapshot_response(cached)
    client = httpx.AsyncClient(
        verify=client_config.verify_tls,
        # 流式响应不能带整体超时，否则长连接会被 httpx 主动掐断。
        timeout=None if stream_response else client_config.timeout,
        follow_redirects=False,
    )
    try:
        upstream_request = client.build_request(request.method, target, headers=headers)
        upstream = await client.send(upstream_request, stream=stream_response)
        response_headers = {
            name: value
            for name, value in upstream.headers.items()
            if name.lower() not in RESPONSE_HEADERS_TO_DROP
        }
        cache_control = versioned_image_proxy_cache_control(request.url.path, request.url.query, upstream.status_code)
        if cache_control:
            response_headers['cache-control'] = cache_control
        if 'location' in response_headers:
            response_headers['location'] = rewrite_location(response_headers['location'], client_config.base_url)
        if stream_response:
            async def stream_body():
                try:
                    async for chunk in upstream.aiter_raw():
                        if chunk:
                            yield chunk
                finally:
                    # 客户端断开时生成器被关闭，这里保证上游连接与客户端都被回收。
                    await upstream.aclose()
                    await client.aclose()
            return StreamingResponse(
                stream_body(), status_code=upstream.status_code, headers=response_headers
            )
        content = upstream.content
        if snapshot_request and 200 <= upstream.status_code < 300 and content:
            _remember_camera_snapshot(snapshot_key, content, upstream.headers.get('content-type', 'image/jpeg'))
        await upstream.aclose()
        await client.aclose()
        return Response(content=content, status_code=upstream.status_code, headers=response_headers)
    except httpx.HTTPError as error:
        await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f'无法载入 Home Assistant 后台：{error}'
        ) from error


@router.get('/api/camera_hls/{entity_id}')
async def camera_hls_stream(
    entity_id: str, request: Request, viewer: ShortLivedLicensedViewer
) -> JSONResponse:
    # [补充说明] 为摄像头换取 HLS 播放地址（需已认证、授权允许 api，且实体对当前主体可见）。
    #
    # 路径参数 entity_id 必须是当前主体可见的实体，否则 403。返回 {"url": ...}。
    # 409 未配置 HA；502 启动流失败或 HA 返回的地址不可代理。
    connection = await asyncio.to_thread(
        load_authorized_camera_connection, request.app.state.database, viewer, entity_id
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    try:
        client = await request.app.state.ha_connector.client_for(connection)
        websocket = await client.connect_websocket()
        try:
            result = await client.command(
                websocket, 1, 'camera/stream', entity_id=entity_id, format='hls'
            )
        finally:
            # camera/stream 是一次性命令，拿到结果就关掉 WebSocket。
            await websocket.close()
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f'无法启动摄像头实时流：{error}',
        ) from error
    # HA 各版本返回结构不一致，这里兼容 dict 与裸字符串两种形态。
    stream_url = str(
        result.get('url') if isinstance(result, dict) else result or ''
    ).strip()
    if not stream_url:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='Home Assistant 未返回摄像头流地址。')
    # HA 给的是绝对 URL，改写成前端可直接请求的代理路径。
    stream_url = rewrite_location(stream_url, client.base_url)
    # 改写后的地址必须仍落在媒体白名单内，防止被诱导到其它 HA 接口。
    if not allowed_media_proxy_path(stream_url.split('?', 1)[0]):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='Home Assistant 返回了无效的摄像头流地址。')
    return JSONResponse({'url': stream_url})


@router.api_route('/api/camera_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/camera_proxy_stream/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/image_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/media_player_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/hls/{path:path}', methods=['GET', 'HEAD'])
async def proxy_home_assistant_media(
    request: Request, _viewer: ShortLivedLicensedViewer
) -> Response:
    # [补充说明] 五条媒体路径共用的代理入口（需已认证且授权允许 api；实体归属在 camera_hls_stream 里校验）。
    #
    # 路由用通配路径覆盖 HA 的几种媒体前缀，具体的白名单判定在 proxy_http 里做，
    # 认证与授权由 _viewer 依赖完成，本函数只负责转发。
    return await proxy_http(request)
