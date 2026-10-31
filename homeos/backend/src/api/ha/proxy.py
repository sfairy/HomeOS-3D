"""Home Assistant 媒体与摄像头的反向代理。

浏览器不能直接访问 HA（Token 只在服务端，HA 常在私网），因此把 camera_proxy /
camera_proxy_stream / image_proxy / media_player_proxy / hls 几类路径中转到 HA：注入服务端
Bearer Token，剥掉浏览器凭据与转发头，只放行这些前缀并拒绝路径绕过。

``camera_hls_stream`` 额外做实体归属校验（它会用服务端令牌向 HA 换取播放地址），快照走带 TTL
的进程内缓存并在后台刷新；媒体流是长连接，流式分支超时设为 None（不主动掐断）。

安全口径：代理是通配路由，``ALLOWED_MEDIA_PROXY_PREFIXES`` 这份白名单就是唯一的门禁 ——
只有摄像头实时流、图片与 HLS 片段能穿过去，其它 HA 接口一律拦下。``REQUEST_HEADERS_TO_DROP``
剥掉逐跳头、浏览器凭据（cookie / authorization）与外层反代的来源信息（不剥会把自己的部署拓扑
透给 HA，也可能让 HA 误判请求来源）；``RESPONSE_HEADERS_TO_DROP`` 剥掉 hop-by-hop 头以及
content-length / content-encoding —— 这里会改写响应体（流式透传或本地缓存命中），长度与编码
必须由本服务重新决定。
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from time import monotonic
from urllib.parse import parse_qs, parse_qsl, urlencode

import httpx
from anyio import CancelScope
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse, Response
from starlette.requests import ClientDisconnect

from .media_stream import (
    CAMERA_SNAPSHOT_CACHE_TTL_SECONDS,
    LicensedCameraStreamingResponse,
    _camera_license_allows,
    _camera_snapshot_response,
    _remember_camera_snapshot,
    _schedule_camera_snapshot_refresh,
    _shared_media_client,
    camera_snapshot_cache,
    camera_snapshot_cache_key,
    camera_snapshot_refreshes,
    close_shared_media_clients,
    load_active_connection,
    load_authorized_camera_connection,
    open_licensed_camera_stream,
)
from ...dependencies import ShortLivedLicensedViewer, ViewerPrincipal
from ...domains.ha.integration.client import HAClientError
from ...domains.ha.integration.crypto import CredentialCipherError
from ...domains.ha.integration.media_access import (
    authorize_media,
    check_media_access,
    remember_hls,
)

__all__ = ['close_shared_media_clients', 'router']

router = APIRouter(include_in_schema=False)
ALLOWED_MEDIA_PROXY_PREFIXES = (
    '/api/camera_proxy/',
    '/api/camera_proxy_stream/',
    '/api/image_proxy/',
    '/api/media_player_proxy/',
    '/api/hls/',
)
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
    # 前端用它声明「这条 MJPEG 要按帧透传」：属于本服务与浏览器之间的协议头，
    # 不能转给 HA（HA 不认识，某些反代还会因未知头拒绝请求）。
    'x-hb-camera-stream',
    'proxy-authorization',
}
RESPONSE_HEADERS_TO_DROP = {
    'connection',
    'set-cookie',
    'content-length',
    'content-encoding',
    'transfer-encoding',
}
def upstream_path(request: Request) -> str:
    """拼出要转给 HA 的路径（含查询串）；HA 侧路径与本服务完全一致。

    摄像头快照/流代理一律用服务端 Bearer，丢弃浏览器附带的实体 ``token``：
    过期或错误的 access_token 转发给 HA 会 500，而无 token 的同源请求正常。

    ``camera_proxy_stream`` 额外丢弃 ``hb``：前端从不给 MJPEG 流加 query，
    把缓存破坏参数原样转给 HA 会打断 multipart 流。
    """
    path = request.url.path
    query = request.url.query
    if query and path.startswith(('/api/camera_proxy/', '/api/camera_proxy_stream/')):
        drop = {'token', 'hb'} if path.startswith('/api/camera_proxy_stream/') else {'token'}
        pairs = [(k, v) for k, v in parse_qsl(query, keep_blank_values=True) if k not in drop]
        query = urlencode(pairs)
    return f'{path}?{query}' if query else path


def upstream_request_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """保留媒体请求头，同时不把外层反向代理的信息泄漏给 HA。"""
    return {
        name: value
        for name, value in headers.items()
        if name.lower() not in REQUEST_HEADERS_TO_DROP and not name.lower().startswith('x-forwarded-')
    }


def allowed_media_proxy_path(path: str) -> bool:
    """只允许 HA 媒体路径，并拒绝路径规范化绕过。"""
    if not path.startswith(ALLOWED_MEDIA_PROXY_PREFIXES) or '\\' in path:
        return False
    return all(segment not in {'.', '..'} for segment in path.split('/'))


def rewrite_location(value: str, base_url: str) -> str:
    normalized_base = base_url.rstrip('/')
    if value == normalized_base:
        return '/'
    if value.startswith(f'{normalized_base}/'):
        return value[len(normalized_base):]
    return value


def versioned_image_proxy_cache_control(path: str, query: str, status_code: int) -> str | None:
    """缓存带状态版本号的 HA 图像，同时不改变实时摄像头行为。"""
    if path.startswith('/api/image_proxy/') and 200 <= status_code < 300:
        if parse_qs(query).get('hb_live') == ['1']:
            return 'private, no-store'
        versioned = any(
            key == 'hb' and bool(value)
            for part in query.split('&')
            if part
            for key, separator, value in [part.partition('=')]
            if separator
        )
        return 'private, max-age=600, immutable' if versioned else None
    return None


def _path_requires_camera_license(path: str) -> bool:
    """摄像头相关媒体代理一律要求 ``module.security``（含快照 / HLS / image）。"""
    return path.startswith(
        (
            '/api/camera_proxy/',
            '/api/camera_proxy_stream/',
            '/api/hls/',
            '/api/image_proxy/',
        )
    )


@dataclass(frozen=True)
class _MediaRequestKind:
    """一次媒体代理请求的三种形态：事件流 / 快照 / 普通资源。"""

    stream: bool
    snapshot: bool
    snapshot_key: str


async def _guard_media_request(request: Request) -> None:
    """入口守卫：只放行白名单路径，摄像头类路径额外要求 ``module.security``。"""
    if request.method not in {'GET', 'HEAD'} or not allowed_media_proxy_path(request.url.path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='媒体资源不存在。')
    if _path_requires_camera_license(request.url.path) and not await _camera_license_allows(request):
        raise HTTPException(
            status_code=403,
            detail={
                'code': 'LICENSE_RESTRICTED',
                'message': '当前授权状态不允许读取摄像头。',
            },
        )


async def _proxy_connection(request: Request, viewer: ViewerPrincipal | None):
    """取活动连接并做入口授权（解析实体 + 校验查看者可见性）。

    SQLite 查询放线程池，别卡事件循环。
    """
    connection = await asyncio.to_thread(load_active_connection, request.app.state.database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    if viewer is not None:
        await asyncio.to_thread(authorize_media, request, connection, viewer)
    return connection


async def _proxy_client_config(request: Request, connection):
    """取 HA 客户端配置；凭据解不开 / 客户端不可用统一映射成 502。"""
    try:
        return await request.app.state.studio_ha.client_for(connection)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


def _proxy_headers(request: Request, client_config) -> dict[str, str]:
    """转发给 HA 的请求头：沿用白名单头，再用连接凭据覆盖授权与编码。"""
    headers = upstream_request_headers(request.headers)
    headers['authorization'] = f'Bearer {client_config.access_token}'
    headers['accept-encoding'] = 'identity'
    return headers


def _classify_media_request(request: Request, client_config) -> _MediaRequestKind:
    """按路径区分事件流、快照与普通资源，并算出快照缓存键。"""
    path = request.url.path
    stream = path.startswith('/api/camera_proxy_stream/')
    snapshot = request.method == 'GET' and path.startswith('/api/camera_proxy/')
    return _MediaRequestKind(
        stream=stream,
        snapshot=snapshot,
        snapshot_key=(
            camera_snapshot_cache_key(
                client_config.base_url, path, client_config.access_token
            )
            if snapshot
            else ''
        ),
    )


async def _cached_snapshot(
    request: Request,
    client_config,
    kind: _MediaRequestKind,
    headers: dict[str, str],
) -> Response | None:
    """命中快照缓存时直接返回；过期则触发后台刷新，``hb_live`` 额外等待刷新结果。

    ``hb_live`` 是「实时地图」用的口径：它不能拿一张 30 秒前的图充数，所以过期后
    必须等这一次刷新真的落地；等不到就 502，而不是把旧图当新图返回。
    """
    cached = camera_snapshot_cache.get(kind.snapshot_key)
    if cached is None:
        return None
    live_map = parse_qs(request.url.query).get('hb_live') == ['1']
    ttl = 1 if live_map else CAMERA_SNAPSHOT_CACHE_TTL_SECONDS
    if monotonic() - cached.created_at < ttl:
        return _camera_snapshot_response(cached)

    _schedule_camera_snapshot_refresh(
        kind.snapshot_key,
        f'{client_config.base_url}{request.url.path}',
        headers,
        client_config.verify_tls,
        client_config.timeout,
    )
    if not live_map:
        # 普通快照可以先把旧图给出去，刷新在后台完成。
        return _camera_snapshot_response(cached)

    pending = camera_snapshot_refreshes.get(kind.snapshot_key)
    if pending is not None:
        await asyncio.shield(pending)
    refreshed = camera_snapshot_cache.get(kind.snapshot_key)
    if refreshed is None or refreshed is cached:
        raise HTTPException(status_code=502, detail='实时地图暂时无法刷新。')
    return _camera_snapshot_response(refreshed)


def _media_client(client_config, stream: bool) -> tuple[httpx.AsyncClient, bool]:
    """流式分支必须独占 client：一条 MJPEG 流会长期占住连接，不能塞进共享池。

    快照 / 图片 / HLS 片段都是短请求，复用 keep-alive 省掉每秒一次的握手。
    返回 ``(client, owns_client)``，由调用方决定谁负责关闭。
    """
    if stream:
        return (
            httpx.AsyncClient(
                verify=client_config.verify_tls,
                # MJPEG 流本来就不该被总时长掐断：超时由观看端断开/任务取消来收尾。
                timeout=None,  # noqa: S113 - 流式分支，见上
                follow_redirects=False,
            ),
            True,
        )
    return _shared_media_client(client_config.verify_tls), False


async def _dispatch_upstream(
    request: Request,
    client: httpx.AsyncClient,
    target: str,
    headers: dict[str, str],
    client_config,
    stream: bool,
) -> httpx.Response:
    """把请求发给 HA。流式分支走带授权的专用开口，其余直接 send。"""
    upstream_request = client.build_request(
        request.method,
        target,
        headers=headers,
        timeout=None if stream else client_config.timeout,
    )
    if stream:
        return await open_licensed_camera_stream(request, client, upstream_request)
    return await client.send(upstream_request, stream=False)


async def _ensure_media_access(
    request: Request,
    upstream: httpx.Response,
    client: httpx.AsyncClient,
    owns_client: bool,
) -> None:
    """持续复检：Cookie 失效 / 换账号 / 换连接都在这里拦下，且**不续期会话**。

    拦下时必须先把上游与独占 client 关掉再抛 403 —— 否则一条已经打开的 MJPEG 流
    会永远挂在 HA 侧。
    """
    if await asyncio.to_thread(check_media_access, request, load_active_connection):
        return
    with CancelScope(shield=True):
        await upstream.aclose()
        if owns_client:
            await client.aclose()
    raise HTTPException(status_code=403, detail='媒体访问权限已变更。')


def _response_headers(request: Request, upstream: httpx.Response, client_config) -> dict[str, str]:
    """过滤上游响应头，并补上缓存策略与重写后的 ``location``。"""
    response_headers = {
        name: value
        for name, value in upstream.headers.items()
        if name.lower() not in RESPONSE_HEADERS_TO_DROP
    }
    cache_control = versioned_image_proxy_cache_control(
        request.url.path, request.url.query, upstream.status_code
    )
    if cache_control:
        response_headers['cache-control'] = cache_control
    if 'location' in response_headers:
        response_headers['location'] = rewrite_location(
            response_headers['location'], client_config.base_url
        )
    return response_headers


def _apply_frame_passthrough(request: Request, response_headers: dict[str, str]) -> None:
    """按帧透传时改写 content-type 并禁用缓存。

    浏览器 / 反代对 multipart 的解析差异很大：按帧透传时把真实类型放进
    自定义头，响应体改成不透明字节流，由前端自己切帧。缓存也必须关掉，
    否则中间层会缓存「第一帧之后就没内容」的截断响应。
    """
    content_type = response_headers.get('content-type', '')
    if request.headers.get('x-hb-camera-stream') != 'frames':
        return
    if not content_type.lower().startswith('multipart/x-mixed-replace'):
        return
    response_headers['x-hb-camera-content-type'] = content_type
    response_headers['content-type'] = 'application/octet-stream'
    response_headers['cache-control'] = 'no-store'


async def _buffered_media_response(
    request: Request,
    upstream: httpx.Response,
    client: httpx.AsyncClient,
    owns_client: bool,
    kind: _MediaRequestKind,
    response_headers: dict[str, str],
) -> Response:
    """非流式收尾：必要时把快照写进缓存，关闭上游与独占 client，返回完整响应体。"""
    content = upstream.content
    if kind.snapshot and 200 <= upstream.status_code < 300 and content:
        _remember_camera_snapshot(
            kind.snapshot_key, content, upstream.headers.get('content-type', 'image/jpeg')
        )
    await upstream.aclose()
    if owns_client:
        await client.aclose()
    return Response(content=content, status_code=upstream.status_code, headers=response_headers)


async def proxy_http(request: Request, viewer: ViewerPrincipal | None) -> Response:
    await _guard_media_request(request)
    connection = await _proxy_connection(request, viewer)
    client_config = await _proxy_client_config(request, connection)
    headers = _proxy_headers(request, client_config)
    kind = _classify_media_request(request, client_config)
    if kind.snapshot:
        cached_response = await _cached_snapshot(request, client_config, kind, headers)
        if cached_response is not None:
            return cached_response

    target = f'{client_config.base_url}{upstream_path(request)}'
    client, owns_client = _media_client(client_config, kind.stream)
    try:
        upstream = await _dispatch_upstream(
            request, client, target, headers, client_config, kind.stream
        )
        await _ensure_media_access(request, upstream, client, owns_client)
        response_headers = _response_headers(request, upstream, client_config)
        if kind.stream:
            _apply_frame_passthrough(request, response_headers)
            return LicensedCameraStreamingResponse(
                request,
                upstream,
                client,
                status_code=upstream.status_code,
                headers=response_headers,
            )
        return await _buffered_media_response(
            request, upstream, client, owns_client, kind, response_headers
        )
    except ClientDisconnect:
        # 观看端已经走了：上游不能因为没人接收而一直挂着。
        if owns_client:
            with CancelScope(shield=True):
                await client.aclose()
        return Response(status_code=204)
    except httpx.HTTPError as error:
        if owns_client:
            await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f'无法载入 Home Assistant 后台：{error}'
        ) from error
    except BaseException:
        if owns_client:
            with CancelScope(shield=True):
                await client.aclose()
        raise


@router.get('/api/camera_hls/{entity_id}')
async def camera_hls_stream(
    entity_id: str, request: Request, viewer: ShortLivedLicensedViewer
) -> JSONResponse:
    if not await _camera_license_allows(request):
        raise HTTPException(
            status_code=403,
            detail={
                'code': 'LICENSE_RESTRICTED',
                'message': '当前授权状态不允许读取摄像头。',
            },
        )
    connection = await asyncio.to_thread(
        load_authorized_camera_connection, request.app.state.database, viewer, entity_id
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    try:
        client = await request.app.state.studio_ha.client_for(connection)
        websocket = await client.connect_websocket()
        try:
            result = await client.command(
                websocket, 1, 'camera/stream', entity_id=entity_id, format='hls'
            )
        finally:
            await websocket.close()
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f'无法启动摄像头实时流：{error}',
        ) from error
    stream_url = str(
        result.get('url') if isinstance(result, dict) else result or ''
    ).strip()
    if not stream_url:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='Home Assistant 未返回摄像头流地址。')
    stream_url = rewrite_location(stream_url, client.base_url)
    if not allowed_media_proxy_path(stream_url.split('?', 1)[0]):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='Home Assistant 返回了无效的摄像头流地址。')
    # 片段路径里没有实体 id：把「令牌 → 实体」记进有界能力表，后续片段请求靠它校验。
    remember_hls(request, connection, entity_id, stream_url)
    return JSONResponse({'url': stream_url})


@router.api_route('/api/camera_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/camera_proxy_stream/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/image_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/media_player_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/hls/{path:path}', methods=['GET', 'HEAD'])
async def proxy_home_assistant_media(
    request: Request, viewer: ShortLivedLicensedViewer
) -> Response:
    return await proxy_http(request, viewer)
