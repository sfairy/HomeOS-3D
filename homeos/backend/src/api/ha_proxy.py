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
import traceback
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from time import monotonic
from typing import Any
from urllib.parse import parse_qs, parse_qsl, urlencode

import httpx
from anyio import CancelScope, create_task_group, move_on_after
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse, Response, StreamingResponse
from starlette.requests import ClientDisconnect

from .ha import active_connection
from ..core.database import Database
from ..dependencies import ShortLivedLicensedViewer, ViewerPrincipal, require_viewer_entity
from ..ha.client import HAClientError
from ..ha.crypto import CredentialCipherError
from ..services.license import features as feature_codes

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
    'proxy-authorization',
}
RESPONSE_HEADERS_TO_DROP = {
    'connection',
    'set-cookie',
    'content-length',
    'content-encoding',
    'transfer-encoding',
}
CAMERA_SNAPSHOT_CACHE_TTL_SECONDS = 8
CAMERA_SNAPSHOT_CACHE_MAX_ENTRIES = 64
# 摄像头长连的授权复检间隔（秒）：逐帧复检太贵，但一次授权失效必须尽快掐断，
# 否则一份过期授权能靠一条已建立的流无限看下去。
CAMERA_STREAM_LICENSE_CHECK_SECONDS = 1

# 摄像头授权判定的进程内 TTL 缓存：逐帧 `to_thread(allows)` 会把线程池打满，而授权状态
# 本身允许秒级延迟。TTL 与长连复检间隔一致，因此「授权失效多久掐断」的最坏延迟不变。
_camera_license_cache: dict[int, tuple[float, bool]] = {}


async def _camera_license_allows(request: Request) -> bool:
    """带 TTL 的摄像头授权判定，合并同进程内并发流的复检。"""
    service = getattr(request.app.state, 'license_service', None)
    if service is None:
        # 无许可服务时 fail-closed：摄像头属于安防增量，不能默开放行。
        return False
    cache_key = id(service)
    now = monotonic()
    cached = _camera_license_cache.get(cache_key)
    if cached is not None and now - cached[0] < CAMERA_STREAM_LICENSE_CHECK_SECONDS:
        return cached[1]
    # 摄像头实时流属于安防增量模块，不能只用基础 ``api`` 码放行（否则 base 租约可绕过
    # ``/security*`` 的 ``module.security`` 门禁直接拉 HLS/快照）。
    allowed = bool(await asyncio.to_thread(service.allows, feature_codes.FEATURE_SECURITY))
    _camera_license_cache[cache_key] = (now, allowed)
    return allowed


@dataclass
class CameraSnapshotCacheEntry:
    """一张已缓存的摄像头快照：字节内容、媒体类型与写入时刻（monotonic）。"""

    content: bytes
    content_type: str
    created_at: float


camera_snapshot_cache: dict[str, CameraSnapshotCacheEntry] = {}
camera_snapshot_refreshes: dict[str, asyncio.Task[None]] = {}


def upstream_path(request: Request) -> str:
    """拼出要转给 HA 的路径（含查询串）；HA 侧路径与本服务完全一致。

    摄像头快照/流代理一律用服务端 Bearer，丢弃浏览器附带的实体 ``token``：
    过期或错误的 access_token 转发给 HA 会 500，而无 token 的同源请求正常。

    ``camera_proxy_stream`` 额外丢弃 ``hb``：0.7.2 前端从不给 MJPEG 流加 query，
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


def camera_snapshot_cache_key(base_url: str, path: str) -> str:
    return f'{base_url.rstrip("/")}{path}'


def _remember_camera_snapshot(key: str, content: bytes, content_type: str) -> None:
    """写入快照缓存；超限时按创建时间淘汰最旧一条，防止长期运行把内存吃满。"""
    if key not in camera_snapshot_cache and len(camera_snapshot_cache) >= CAMERA_SNAPSHOT_CACHE_MAX_ENTRIES:
        oldest_key = min(camera_snapshot_cache, key=lambda item: camera_snapshot_cache[item].created_at)
        camera_snapshot_cache.pop(oldest_key, None)
    camera_snapshot_cache[key] = CameraSnapshotCacheEntry(content=content, content_type=content_type or 'image/jpeg', created_at=monotonic())


def _camera_snapshot_response(entry: CameraSnapshotCacheEntry) -> Response:
    return Response(content=entry.content, media_type=entry.content_type, headers={'cache-control': 'private, no-store'})


def load_active_connection(database_manager: Database):
    with database_manager.session_factory() as database:
        connection = active_connection(database)
        if connection is not None:
            database.expunge(connection)
        return connection


def load_authorized_camera_connection(database_manager: Database, viewer: ViewerPrincipal, entity_id: str):
    with database_manager.session_factory() as database:
        require_viewer_entity(database, viewer, entity_id)
        connection = active_connection(database)
        if connection is not None:
            database.expunge(connection)
        return connection


async def _refresh_camera_snapshot(key: str, target: str, headers: Mapping[str, str], verify_tls: bool, timeout: float) -> None:
    try:
        async with httpx.AsyncClient(verify=verify_tls, timeout=timeout, follow_redirects=False) as client:
            upstream = await client.get(target, headers=dict(headers))
        if 200 <= upstream.status_code < 300 and upstream.content:
            _remember_camera_snapshot(key, upstream.content, upstream.headers.get('content-type', 'image/jpeg'))
    except httpx.HTTPError:
        return
    finally:
        camera_snapshot_refreshes.pop(key, None)


def _schedule_camera_snapshot_refresh(key: str, target: str, headers: Mapping[str, str], verify_tls: bool, timeout: float) -> None:
    existing = camera_snapshot_refreshes.get(key)
    if existing and not existing.done():
        return
    task = asyncio.create_task(_refresh_camera_snapshot(key, target, headers, verify_tls, timeout))
    camera_snapshot_refreshes[key] = task
    return


def _camera_stream_log(
    request: Request,
    level: str,
    message: str,
    code: str,
    *,
    details: str | None = None,
) -> None:
    """终止性事件只记一次，绝不记录画面、URL 或凭据。"""
    log = getattr(request.app.state, 'global_log', None)
    if log is None:
        return
    state = getattr(request, 'state', request)
    recorded = getattr(state, 'camera_stream_log_codes', None)
    if recorded is None:
        recorded = set()
        state.camera_stream_log_codes = recorded
    if code in recorded:
        return
    recorded.add(code)
    context: dict[str, Any] = {}
    context.update(getattr(state, 'log_context', {}) or {})
    context.update({'phase': 'camera-stream', 'code': code})
    path = getattr(getattr(request, 'url', None), 'path', '')
    if path.startswith('/api/camera_proxy_stream/'):
        context.update({'path': path, 'entityId': path.rsplit('/', 1)[-1]})
    started = getattr(state, 'camera_stream_started_at', None)
    if started is not None:
        context['durationMs'] = round((monotonic() - started) * 1000, 1)
    log.append(level, 'Home Assistant', '摄像头', message, context=context, details=details)


async def open_licensed_camera_stream(
    request: Request, client: httpx.AsyncClient, upstream_request: httpx.Request
) -> httpx.Response:
    """许可失效或观看端掉线时，终止一条静默的上游流。"""

    async def wait_for_disconnect() -> None:
        while True:
            message = await request.receive()
            if message['type'] == 'http.disconnect':
                return

    pending = asyncio.create_task(client.send(upstream_request, stream=True))
    disconnected = asyncio.create_task(wait_for_disconnect())
    try:
        while True:
            if pending.done():
                break
            if disconnected.done():
                disconnected.result()
                raise ClientDisconnect()
            if not await _camera_license_allows(request):
                raise HTTPException(
                    status_code=403,
                    detail={
                        'code': 'LICENSE_RESTRICTED',
                        'message': '当前授权状态不允许读取摄像头。',
                    },
                )
            await asyncio.wait(
                {pending, disconnected},
                timeout=CAMERA_STREAM_LICENSE_CHECK_SECONDS,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if pending.done():
                break
        result = pending.result()
    except BaseException:
        # 上游可能已经建连：shield 住取消域，把连接收干净再往上抛。
        with CancelScope(shield=True):
            pending.cancel()
            settled = (await asyncio.gather(pending, return_exceptions=True))[0]
            if not isinstance(settled, BaseException):
                await settled.aclose()
        raise
    with CancelScope(shield=True):
        disconnected.cancel()
        await asyncio.gather(disconnected, return_exceptions=True)
    return result


async def licensed_camera_stream(request: Request, upstream: httpx.Response) -> AsyncIterator[bytes]:
    """逐帧复检授权；响应侧另外负责取消静默读取与卡住的发送。"""
    iterator = upstream.aiter_raw().__aiter__()
    if not await _camera_license_allows(request):
        _camera_stream_log(
            request,
            'warning',
            '摄像头传输已停止：授权不可用或已到期，后续画面不再转发',
            'CAMERA_STREAM_LICENSE_RESTRICTED',
        )
        with CancelScope(shield=True):
            await iterator.aclose()
        return
    try:
        while True:
            try:
                chunk = await anext(iterator)
            except StopAsyncIteration:
                with CancelScope(shield=True):
                    await iterator.aclose()
                break
            if not await _camera_license_allows(request):
                _camera_stream_log(
                    request,
                    'warning',
                    '摄像头传输已停止：授权不可用或已到期，后续画面不再转发',
                    'CAMERA_STREAM_LICENSE_RESTRICTED',
                )
                with CancelScope(shield=True):
                    await iterator.aclose()
                return
            if chunk:
                yield chunk
    except Exception as error:
        _camera_stream_log(
            request,
            'error',
            f'摄像头持续传输失败：{type(error).__name__} · {error}',
            'CAMERA_STREAM_ERROR',
            details=traceback.format_exc(),
        )
        raise
    finally:
        with CancelScope(shield=True):
            await iterator.aclose()


class LicensedCameraStreamingResponse(StreamingResponse):
    """在开始迭代之前、以及下游发送卡住期间，都持有上游连接的所有权。"""

    def __init__(
        self,
        request: Request,
        upstream: httpx.Response,
        client: httpx.AsyncClient,
        **kwargs: Any,
    ) -> None:
        super().__init__(licensed_camera_stream(request, upstream), **kwargs)
        self.request = request
        self.upstream = upstream
        self.client = client
        state = getattr(request, 'state', request)
        state.camera_stream_started_at = monotonic()

    async def stream_response(self, send) -> None:
        failure: BaseException | None = None
        restricted = False
        started = False
        finished = False

        async def track_send(message: dict[str, Any]) -> None:
            nonlocal started, finished
            await send(message)
            if message['type'] == 'http.response.start':
                started = True
            elif message['type'] == 'http.response.body' and not message.get('more_body', False):
                finished = True

        async with create_task_group() as tasks:

            async def deliver() -> None:
                nonlocal failure
                try:
                    await super(LicensedCameraStreamingResponse, self).stream_response(track_send)
                except Exception as error:
                    failure = error
                tasks.cancel_scope.cancel()

            async def monitor_license() -> None:
                nonlocal restricted
                # 复用 `_camera_license_allows` 的进程内 TTL 缓存：原先这里每轮直接
                # `to_thread(allows)` 两次（线程池跳 + license_state 查询），N 路摄像头
                # 就是每秒 2N 次；现在多路流共享同一份判定，检查次数与流数解耦。
                while await _camera_license_allows(self.request):
                    await asyncio.sleep(CAMERA_STREAM_LICENSE_CHECK_SECONDS)
                restricted = True
                _camera_stream_log(
                    self.request,
                    'warning',
                    '摄像头传输已停止：授权不可用或已到期，后续画面不再转发',
                    'CAMERA_STREAM_LICENSE_RESTRICTED',
                )
                tasks.cancel_scope.cancel()

            tasks.start_soon(deliver)
            tasks.start_soon(monitor_license)
        if failure is not None:
            raise failure
        if restricted and started and not finished:
            # 授权已失效但画面还没收尾：补一个空 body 结束响应，别把连接吊死。
            with move_on_after(CAMERA_STREAM_LICENSE_CHECK_SECONDS):
                await send({'type': 'http.response.body', 'body': b'', 'more_body': False})

    async def __call__(self, scope, receive, send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            with CancelScope(shield=True):
                await self.body_iterator.aclose()
                await self.upstream.aclose()
                await self.client.aclose()


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


async def proxy_http(request: Request) -> Response:
    if request.method not in {'GET', 'HEAD'} or not allowed_media_proxy_path(request.url.path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='媒体资源不存在。')
    if _path_requires_camera_license(request.url.path):
        if not await _camera_license_allows(request):
            raise HTTPException(
                status_code=403,
                detail={
                    'code': 'LICENSE_RESTRICTED',
                    'message': '当前授权状态不允许读取摄像头。',
                },
            )
    connection = await asyncio.to_thread(load_active_connection, request.app.state.database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    try:
        client_config = await request.app.state.studio_ha.client_for(connection)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error
    headers = upstream_request_headers(request.headers)
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
            live_map = parse_qs(request.url.query).get('hb_live') == ['1']
            ttl = 1 if live_map else CAMERA_SNAPSHOT_CACHE_TTL_SECONDS
            if monotonic() - cached.created_at >= ttl:
                _schedule_camera_snapshot_refresh(snapshot_key, f'{client_config.base_url}{request.url.path}', headers, client_config.verify_tls, client_config.timeout)
                if live_map:
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
        timeout=None if stream_response else client_config.timeout,
        follow_redirects=False,
    )
    try:
        upstream_request = client.build_request(request.method, target, headers=headers)
        upstream = (
            await open_licensed_camera_stream(request, client, upstream_request)
            if stream_response
            else await client.send(upstream_request, stream=False)
        )
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
            return LicensedCameraStreamingResponse(
                request, upstream, client, status_code=upstream.status_code, headers=response_headers
            )
        content = upstream.content
        if snapshot_request and 200 <= upstream.status_code < 300 and content:
            _remember_camera_snapshot(snapshot_key, content, upstream.headers.get('content-type', 'image/jpeg'))
        await upstream.aclose()
        await client.aclose()
        return Response(content=content, status_code=upstream.status_code, headers=response_headers)
    except ClientDisconnect:
        # 观看端已经走了：上游不能因为没人接收而一直挂着。
        with CancelScope(shield=True):
            await client.aclose()
        return Response(status_code=204)
    except httpx.HTTPError as error:
        await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f'无法载入 Home Assistant 后台：{error}'
        ) from error
    except BaseException:
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
    return JSONResponse({'url': stream_url})


@router.api_route('/api/camera_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/camera_proxy_stream/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/image_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/media_player_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/hls/{path:path}', methods=['GET', 'HEAD'])
async def proxy_home_assistant_media(
    request: Request, _viewer: ShortLivedLicensedViewer
) -> Response:
    return await proxy_http(request)
