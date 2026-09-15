"""Home Assistant 媒体与摄像头的反向代理。

浏览器不能直接访问 HA（Token 只存在服务端，HA 又常在私网），因此这里把
/api/camera_proxy/、/api/camera_proxy_stream/、/api/image_proxy/、
/api/media_player_proxy/、/api/hls/ 这几类路径整体中转到 HA，转发过程中：

- 注入服务端持有的 Bearer Token，并剥掉浏览器的 Cookie / Origin / 转发头；
- 只放行上述路径前缀，同时拒绝路径归一化绕过（'.' / '..' / 反斜杠）；
- 快照类请求走带 TTL 的进程内缓存，避免多个看板同时刷新把 HA 打满；
- HLS 播放地址由 /api/camera_hls/{entity_id} 换取，拿到后同样走本代理。

媒体流是长连接，因此流式分支的超时设为 None（不主动掐断），其余请求使用
HA 客户端配置的超时。
"""
from __future__ import annotations

import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from time import monotonic
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse, Response, StreamingResponse

from ..database import Database
from ..dependencies import ShortLivedLicensedViewer, ViewerPrincipal, require_viewer_entity
from ..ha.client import HAClientError
from ..ha.crypto import CredentialCipherError
from .ha import active_connection

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
# 转发给 HA 前要剥掉的请求头：逐跳头（connection / te / trailer / upgrade）、
# 浏览器凭据（cookie / authorization）、以及外层反代的来源信息。
# 不剥这些会把自己的部署拓扑透给 HA，也可能让 HA 误判请求来源。
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
# 回传浏览器前要剥掉的响应头：hop-by-hop 头，以及 content-length / content-encoding —
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
# HA 摄像头实体 supported_features 的 bit 2 表示支持 STREAM（可转 HLS）。
CAMERA_FEATURE_STREAM = 2


@dataclass
class CameraSnapshotCacheEntry:
    """一张已缓存的摄像头快照：字节内容、媒体类型与写入时刻（monotonic）。"""

    content: bytes
    content_type: str
    created_at: float


# 进程内快照缓存：key 为「HA 基址 + 代理路径」，值见 CameraSnapshotCacheEntry。
camera_snapshot_cache: dict[str, CameraSnapshotCacheEntry] = {}
# 正在后台刷新的任务，按同一个 key 去重：同一张图不会同时发起多次回源。
camera_snapshot_refreshes: dict[str, asyncio.Task[None]] = {}


def upstream_path(request: Request) -> str:
    """拼出要转给 HA 的路径（含查询串）；HA 侧路径与本服务完全一致。

    参数:
        request: 浏览器原始请求，查询串原样保留（HLS 片段依赖查询参数）。
    """
    path = request.url.path
    query = request.url.query
    return f'{path}?{query}' if query else path


def upstream_request_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """筛选转给 HA 的请求头，不把外层反代的信息透给 HA。"""
    return {
        name: value
        for name, value in headers.items()
        # 保留 Range / If-None-Match 这类影响媒体响应内容的头，
        # 只丢弃黑名单里的头与全部 x-forwarded-*。
        if name.lower() not in REQUEST_HEADERS_TO_DROP and not name.lower().startswith('x-forwarded-')
    }


def allowed_media_proxy_path(path: str) -> bool:
    """判断路径是否允许代理：既要命中白名单前缀，也不能含路径归一化写法。"""
    if not path.startswith(ALLOWED_MEDIA_PROXY_PREFIXES) or '\\' in path:
        return False
    # 逐段检查：出现 '.' / '..' 时可以用 /api/hls/../xxx 之类的写法
    # 绕过前缀检查打到别的 HA 接口，所以这里必须再拦一道。
    return all(segment not in {'.', '..'} for segment in path.split('/'))


def rewrite_location(value: str, base_url: str) -> str:
    """把 HA 返回的绝对地址改写成本服务可代理的相对路径。

    Location 响应头与 HLS 播放列表里的地址可能是 HA 的绝对 URL，浏览器直接
    访问打不到（HA 在私网或仅服务端可达），因此统一改写成 /api/... 形式。
    只改写命中媒体白名单的路径，其余原样返回，避免误改外站链接。
    """
    normalized_base = base_url.rstrip('/')
    if value == normalized_base:
        # HA 指向自己的根地址，等价于站点首页。
        return '/'
    if value.startswith(f'{normalized_base}/'):
        # 同基址的绝对路径直接去掉基址，省一次 URL 解析。
        return value[len(normalized_base):]
    parsed_url = urlparse(value)
    # 绝对 URL 只在路径属于媒体白名单时才改写。
    if parsed_url.scheme in {'http', 'https'} and parsed_url.path:
        rewritten_path = parsed_url.path + (f'?{parsed_url.query}' if parsed_url.query else '')
        if allowed_media_proxy_path(parsed_url.path):
            return rewritten_path
    return value


def camera_supports_hls(entity_state: dict | None) -> bool | None:
    """判断摄像头实体是否能提供 HLS 实时流。

    参数:
        entity_state: HA 返回的实体状态字典；取不到时为 None。

    返回:
        True 能；False 明确不支持（前端应回落到 MJPEG）；None 状态未知，
        此时调用方按「可以试一次」处理，而不是直接回落。
    """
    if not isinstance(entity_state, dict):
        return None
    attributes = entity_state.get('attributes')
    if not isinstance(attributes, dict):
        attributes = {}
    # frontend_stream_type 是 HA 告诉前端该走哪种播放方式的关键字段。
    stream_type = str(attributes.get('frontend_stream_type') or '').strip().lower()
    # 显式声明了非 hls 的流类型，直接判定不支持。
    if stream_type and stream_type != 'hls':
        return False
    try:
        supported_features = int(attributes.get('supported_features') or 0)
    except (TypeError, ValueError):
        supported_features = 0
    # 显式 hls 属于无条件支持，不必再看能力位。
    if stream_type == 'hls':
        return True
    # 没有流类型信息时退回能力位判断：bit 2 即 STREAM。
    return bool(supported_features & CAMERA_FEATURE_STREAM)


def versioned_image_proxy_cache_control(path: str, query: str, status_code: int) -> str | None:
    """为「带版本参数」的 HA 图片给出可长期缓存的 Cache-Control。

    只对 /api/image_proxy/ 的 2xx 生效：带 hb 参数说明这张图的内容变化会反映在
    URL 上，因此可以标记为 immutable 缓存 10 分钟；摄像头快照等实时资源没有该
    参数，返回 None 让它保持 HA 原策略，不被浏览器缓存住。
    """
    if path.startswith('/api/image_proxy/') and 200 <= status_code < 300:
        # hb 是前端给「实体状态图」打的版本戳：内容变了 URL 就会变，
        # 值为空则等同于没有版本信息，不能长缓存。
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
    """快照缓存键：HA 基址 + 代理路径，保证不同实例 / 不同路径不会互相串图。"""
    return f'{base_url.rstrip("/")}{path}'


def _remember_camera_snapshot(key: str, content: bytes, content_type: str) -> None:
    """写入快照缓存；满员时淘汰最旧的一条。

    用「淘汰最旧」而不是 clear()：缓存里都是活跃图片，清空会让紧接着的一轮
    请求全部回源，反过来冲击 HA。
    """
    # 只在新增键时才考虑淘汰，覆盖已有键不会让条目数增长。
    if key not in camera_snapshot_cache and len(camera_snapshot_cache) >= CAMERA_SNAPSHOT_CACHE_MAX_ENTRIES:
        oldest_key = min(camera_snapshot_cache, key=lambda item: camera_snapshot_cache[item].created_at)
        camera_snapshot_cache.pop(oldest_key, None)
    camera_snapshot_cache[key] = CameraSnapshotCacheEntry(
        content=content,
        # HA 偶尔不回 content-type，按最常见的 JPEG 兜底。
        content_type=content_type or 'image/jpeg',
        created_at=monotonic(),
    )
    return None


def _camera_snapshot_response(entry: CameraSnapshotCacheEntry) -> Response:
    """把缓存条目转成响应；快照统一按 no-store 下发，缓存策略由服务端掌握。"""
    return Response(content=entry.content, media_type=entry.content_type, headers={'cache-control': 'private, no-store'})


def load_active_connection(database_manager: Database):
    """在独立会话里取当前活跃 HA 连接，并在返回前 detach。

    代理是长连接场景，会话必须随取随还，不能把连接池占在请求生命周期上。
    """
    with database_manager.session_factory() as database:
        connection = active_connection(database)
        if connection is not None:
            database.expunge(connection)
        return connection


def load_authorized_camera_connection(
    database_manager: Database, viewer: ViewerPrincipal, entity_id: str
):
    """取摄像头实体所属的活跃连接，同时校验该实体在当前主体可见范围内。

    不可见的实体由 require_viewer_entity 直接抛 403；没有活跃连接返回 None，
    由调用方转成 409。
    """
    with database_manager.session_factory() as database:
        require_viewer_entity(database, viewer, entity_id)
        connection = active_connection(database)
        if connection is not None:
            database.expunge(connection)
        return connection


async def _refresh_camera_snapshot(
    key: str,
    target: str,
    headers: Mapping[str, str],
    verify_tls: bool,
    timeout: float,
) -> None:
    """后台回源刷新一张快照并写进缓存。

    失败被静默吞掉：调用方此时通常已经把旧图返回给浏览器了，
    为了刷新失败去中断这次看板渲染并不值得。
    """
    try:
        async with httpx.AsyncClient(
            verify=verify_tls, timeout=timeout, follow_redirects=False
        ) as client:
            upstream = await client.get(target, headers=dict(headers))
        # 只有完整成功才覆盖缓存，失败时旧图继续服务。
        if 200 <= upstream.status_code < 300 and upstream.content:
            _remember_camera_snapshot(
                key,
                upstream.content,
                upstream.headers.get('content-type', 'image/jpeg'),
            )
    except httpx.HTTPError:
        pass
    finally:
        # 无论成败都要摘掉任务登记，否则这个 key 再也不会被安排刷新。
        camera_snapshot_refreshes.pop(key, None)


def _schedule_camera_snapshot_refresh(
    key: str,
    target: str,
    headers: Mapping[str, str],
    verify_tls: bool,
    timeout: float,
) -> None:
    """安排一次后台快照刷新（同一个 key 去重）。"""
    existing = camera_snapshot_refreshes.get(key)
    # 已有在跑的任务就不再发起：多个看板在同一时刻请求，HA 只会被回源一次。
    if existing and not existing.done():
        return None
    task = asyncio.create_task(_refresh_camera_snapshot(key, target, headers, verify_tls, timeout))
    camera_snapshot_refreshes[key] = task
    return None


async def proxy_http(request: Request) -> Response:
    """媒体代理的核心实现：与身份无关的通用转发。

    门禁：只允许 GET / HEAD，且路径必须命中媒体白名单；未配置 HA 抛 409；
    凭证解密失败或回源失败抛 502。

    参数:
        request: 浏览器原始请求，查询串会原样带给 HA。

    返回:
        上游响应（流式或一次性），必要时带上改写后的缓存与 Location 头。
    """
    if request.method not in {'GET', 'HEAD'} or not allowed_media_proxy_path(request.url.path):
        # 路径不合规统一回 404 而不是 403：不向扫描者暴露哪些前缀存在。
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='媒体资源不存在。')
    connection = await asyncio.to_thread(load_active_connection, request.app.state.database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    try:
        client_config = request.app.state.ha_connector.client_for(connection)
    except CredentialCipherError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error
    headers = upstream_request_headers(request.headers)
    # Token 只在这一层注入，浏览器侧永远看不到它。
    headers['authorization'] = f'Bearer {client_config.access_token}'
    # 要求上游不做压缩：快照要按原始字节缓存，压缩内容也不适合逐段透传。
    headers['accept-encoding'] = 'identity'
    proxy_path = upstream_path(request)
    target = f'{client_config.base_url}{proxy_path}'
    # 实时流走流式透传，不落地也不进缓存。
    stream_response = request.url.path.startswith('/api/camera_proxy_stream/')
    # 静态快照才进缓存；HEAD 没有响应体可存，因此不算快照请求。
    snapshot_request = request.method == 'GET' and request.url.path.startswith('/api/camera_proxy/')
    snapshot_key = (
        camera_snapshot_cache_key(client_config.base_url, request.url.path)
        if snapshot_request
        else ''
    )
    if snapshot_request:
        cached = camera_snapshot_cache.get(snapshot_key)
        if cached is not None:
            # hb_live=1 是前端「立即刷新」的语义：TTL 压到 1 秒，并等待刷新完成。
            live_map = parse_qs(request.url.query).get('hb_live') == ['1']
            ttl = 1 if live_map else CAMERA_SNAPSHOT_CACHE_TTL_SECONDS
            if monotonic() - cached.created_at >= ttl:
                _schedule_camera_snapshot_refresh(
                    snapshot_key,
                    f'{client_config.base_url}{request.url.path}',
                    headers,
                    client_config.verify_tls,
                    client_config.timeout,
                )
                if live_map:
                    pending = camera_snapshot_refreshes.get(snapshot_key)
                    if pending is not None:
                        # shield：外层被取消时刷新任务照常跑完，缓存不会留空洞。
                        await asyncio.shield(pending)
                    cached = camera_snapshot_cache.get(snapshot_key, cached)
            # 过期时也先把旧图给出去，不让看板等一次完整的 HA 往返。
            return _camera_snapshot_response(cached)
    client = httpx.AsyncClient(
        verify=client_config.verify_tls,
        # 流是长连接，超时交给客户端断开；普通请求用 HA 客户端配置的超时。
        timeout=None if stream_response else client_config.timeout,
        # 重定向原样回给浏览器：跟随会丢掉 HA 的认证上下文，也可能被导向非白名单路径。
        follow_redirects=False,
    )
    try:
        upstream_request = client.build_request(request.method, target, headers=headers)
        upstream = await client.send(upstream_request, stream=stream_response)
    except httpx.HTTPError as error:
        # 失败路径同样要关掉客户端，否则连接池会随失败次数泄漏。
        await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f'无法载入 Home Assistant 后台：{error}',
        ) from error
    response_headers = {
        name: value
        for name, value in upstream.headers.items()
        # 剥掉逐跳头与长度 / 编码头：响应体由本服务重新生成。
        if name.lower() not in RESPONSE_HEADERS_TO_DROP
    }
    cache_control = versioned_image_proxy_cache_control(
        request.url.path, request.url.query, upstream.status_code
    )
    # 带版本参数的图片覆写成长缓存，其余保持 HA 原本的策略。
    if cache_control:
        response_headers['cache-control'] = cache_control
    if 'location' in response_headers:
        # 把 HA 的绝对地址改写成浏览器可访问的代理路径。
        response_headers['location'] = rewrite_location(
            response_headers['location'], client_config.base_url
        )
    if stream_response:
        async def stream_body():
            try:
                async for chunk in upstream.aiter_raw():
                    if chunk:
                        yield chunk
            finally:
                # 客户端断开时把上游响应与客户端一起关掉，不留悬挂连接。
                await upstream.aclose()
                await client.aclose()

        return StreamingResponse(
            stream_body(), status_code=upstream.status_code, headers=response_headers
        )
    content = upstream.content
    # 回源成功就顺手更新缓存，下一次请求直接命中。
    if snapshot_request and 200 <= upstream.status_code < 300 and content:
        _remember_camera_snapshot(
            snapshot_key,
            content,
            upstream.headers.get('content-type', 'image/jpeg'),
        )
    # 非流式分支内容已读全，显式关闭两个客户端。
    await upstream.aclose()
    await client.aclose()
    return Response(content=content, status_code=upstream.status_code, headers=response_headers)


@router.get('/api/camera_hls/{entity_id}')
async def camera_hls_stream(
    entity_id: str, request: Request, viewer: ShortLivedLicensedViewer
) -> JSONResponse:
    """为摄像头换取 HLS 播放地址（需已认证且授权允许 api）。

    路径参数 entity_id 必须是当前主体可见的实体，否则 403。

    返回:
        {'url': ...} —— 可直接请求的代理播放地址；
        {'url': None, 'fallback': 'mjpeg'} —— 该摄像头明确不支持 HLS，回落 MJPEG；
        {'url': None, 'fallback': 'mjpeg', 'detail': ...} —— HA 侧可回落的错误。

    异常:
        409 未配置 HA；502 凭证解密失败、WebSocket 无法建立或 Token 鉴权失败。
    """
    connection = await asyncio.to_thread(
        load_authorized_camera_connection, request.app.state.database, viewer, entity_id
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    # 回落响应复用同一个对象：两条路径语义完全相同。
    mjpeg_fallback = JSONResponse({'url': None, 'fallback': 'mjpeg'})
    try:
        client = request.app.state.ha_connector.client_for(connection)
        entity_states = await client.fetch_states({entity_id})
        # 只有明确不支持才回落；状态未知时继续尝试启动流。
        if camera_supports_hls(entity_states[0] if entity_states else None) is False:
            return mjpeg_fallback
        websocket = await client.connect_websocket()
        try:
            result = await client.command(
                websocket, 1, 'camera/stream', entity_id=entity_id, format='hls'
            )
        finally:
            # camera/stream 是一次性命令，拿到结果就关掉 WebSocket。
            await websocket.close()
    except CredentialCipherError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f'无法启动摄像头实时流：{error}',
        ) from error
    except HAClientError as error:
        error_text = str(error)
        # 按错误文案分流：连接与鉴权问题属于配置错误，必须让用户看到（502）；
        # 其余（例如摄像头本身不响应）降级成 MJPEG，不打断看板。
        if any(
            marker in error_text
            for marker in ('无法建立 Home Assistant WebSocket', '鉴权失败', '无法连接 Home Assistant', 'Token')
        ):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f'无法启动摄像头实时流：{error}',
            ) from error
        return JSONResponse({'url': None, 'fallback': 'mjpeg', 'detail': error_text})
    # HA 各版本返回结构不一致，这里兼容 dict 与裸字符串两种形态。
    stream_url = str(
        result.get('url') if isinstance(result, dict) else result or ''
    ).strip()
    if not stream_url:
        return mjpeg_fallback
    # HA 给的是绝对 URL，改写成前端可直接请求的代理路径。
    stream_url = rewrite_location(stream_url, client.base_url)
    # 改写后的地址必须仍落在媒体白名单内，防止被诱导到其它 HA 接口。
    if not allowed_media_proxy_path(stream_url.split('?', 1)[0]):
        return mjpeg_fallback
    return JSONResponse({'url': stream_url})


@router.api_route('/api/camera_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/camera_proxy_stream/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/image_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/media_player_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/hls/{path:path}', methods=['GET', 'HEAD'])
async def proxy_home_assistant_media(
    request: Request, _viewer: ShortLivedLicensedViewer
) -> Response:
    """五条媒体路径共用的代理入口（需已认证且授权允许 api）。

    路由用通配路径覆盖 HA 的几种媒体前缀，具体的白名单判定在 proxy_http 里做；
    身份与授权由 _viewer 依赖完成，本函数只负责转发。
    """
    return await proxy_http(request)
