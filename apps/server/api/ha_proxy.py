"""Home Assistant 媒体与摄像头的反向代理。

浏览器不能直接访问 HA（Token 只在服务端，HA 常在私网），因此把 camera_proxy /
camera_proxy_stream / image_proxy / media_player_proxy / hls 几类路径中转到 HA：
注入服务端 Bearer Token，剥掉浏览器凭据与转发头，只放行这些前缀并拒绝路径绕过。

每条路径都必须给出属于当前主体的实体归属 —— 代理会注入 HA 令牌，没有这道校验时，
绑在项目 A 的中控只要写下项目 B 的实体 ID 就能拉到别人的摄像头画面。
快照走带 TTL 的进程内缓存；媒体流是长连接，流式分支超时设为 None（不主动掐断）。
"""
from __future__ import annotations

import asyncio
from collections.abc import Mapping
from time import monotonic
from urllib.parse import parse_qs, unquote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, Response, StreamingResponse

from ..core.database import Database
from ..security.dependencies import LicensedViewer, ViewerPrincipal, require_viewer_entity
from ..ha.client import HAClientError
from ..ha.crypto import CredentialCipherError
from ..http.http_cache import PRIVATE_BRIEF_IMMUTABLE_CACHE
from .ha_shared import active_connection, load_active_connection_snapshot

from .media_proxy_support import (
    CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES,
    HLS_SCOPE_RECHECK_SECONDS,
    _camera_snapshot_response,
    allowed_media_proxy_path,
    camera_snapshot_cache_key,
    camera_supports_hls,
    hls_stream_token,
    rewrite_location,
)

router = APIRouter(include_in_schema=False)
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

#: 五条通配媒体前缀里「第一段路径就是实体 ID」的四条。
#: ``/api/hls/`` 不在其中：HA 把 HLS 地址给成 ``/api/hls/<流令牌>/...``，令牌里没有实体信息。
ENTITY_PATH_MEDIA_PREFIXES = (
    '/api/camera_proxy/',
    '/api/camera_proxy_stream/',
    '/api/image_proxy/',
    '/api/media_player_proxy/',
)















def upstream_path(request: Request) -> str:
    """拼出要转给 HA 的路径（含查询串）；HA 侧路径与本服务完全一致。"""
    path = request.url.path
    query = request.url.query
    return f'{path}?{query}' if query else path


def upstream_request_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """筛选转给 HA 的请求头，不把外层反代的信息透给 HA。"""
    return {
        name: value
        for name, value in headers.items()
        # 保留 Range / If-None-Match 等影响媒体内容的头，只丢弃黑名单头与全部 x-forwarded-*。
        if name.lower() not in REQUEST_HEADERS_TO_DROP and not name.lower().startswith('x-forwarded-')
    }




def media_proxy_entity_id(path: str) -> str | None:
    """从「路径里带实体」的媒体前缀取出实体 ID；不是那四条前缀时返回 None。

    路径形态是 ``<前缀>/<实体 ID>[/...]``，实体 ID 由前端 ``encodeURIComponent`` 编码，
    因此要解码一次再比对 —— 否则 ``camera.%78`` 这类写法会绕过校验。
    """
    for prefix in ENTITY_PATH_MEDIA_PREFIXES:
        if path.startswith(prefix):
            segment = path[len(prefix):].split('/', 1)[0]
            entity_id = unquote(segment).strip()
            return entity_id or None
    return None




def _viewer_can_see_entity(database_manager: Database, viewer: ViewerPrincipal, entity_id: str) -> None:
    """在独立会话里做一次实体归属校验；不可见时由 require_viewer_entity 抛 403。

    独立会话是必需的：校验跑在 ``asyncio.to_thread`` 的线程里，而请求级会话绑定在
    事件循环所在线程，跨线程使用会踩 SQLAlchemy 的会话线程约束。
    """
    with database_manager.session_factory() as database:
        require_viewer_entity(database, viewer, entity_id)


async def require_media_proxy_scope(
    request: Request, viewer: LicensedViewer
) -> None:
    """媒体代理的归属门禁：请求路径必须能定位到一个当前主体可见的实体。

    只有「已认证 + 允许 api」不够：实体 ID 是可读名字，绑在项目 A 的中控只要写下项目 B
    的实体就能拉到别人的画面（跨项目 IDOR）。做成路由级依赖，新路由漏掉它一眼能看出来。
    """
    path = request.url.path
    if not allowed_media_proxy_path(path):
        # 路径不合规的请求交给处理器统一回 404（不在这里回答「这个前缀存不存在」）。
        return
    caches = request.app.state.media_proxy
    entity_id = media_proxy_entity_id(path)
    if entity_id is None:
        # HLS 分支：令牌查不到归属就拒绝（fail closed）。令牌只可能由本服务的
        # /api/camera_hls 在实体校验后记账，查不到即不是本服务发的；前端会回落到 MJPEG。
        token = hls_stream_token(path)
        scope = caches.hls_scope(token)
        entity_id = caches.hls_entity_id(path) if scope is not None else None
        if entity_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='这段媒体流不属于当前中控仪表盘。',
            )
        # 管理员不受限（project_id 为 None），中控则在一个短窗口内复用上次结论，避免每分片查库。
        project_key = viewer.project_id or ''
        if (
            project_key
            and scope is not None
            and scope.verified_project == project_key
            and monotonic() - scope.verified_at < HLS_SCOPE_RECHECK_SECONDS
        ):
            return
        await asyncio.to_thread(
            _viewer_can_see_entity, request.app.state.database, viewer, entity_id
        )
        if scope is not None:
            scope.verified_project = project_key
            scope.verified_at = monotonic()
        return
    if viewer.project_id is None:
        # 管理员可见全部实体，这里省掉一次跨线程建会话的开销（快照请求是热路径）。
        return
    await asyncio.to_thread(
        _viewer_can_see_entity, request.app.state.database, viewer, entity_id
    )






def versioned_image_proxy_cache_control(path: str, query: str, status_code: int) -> str | None:
    """为「带版本参数」的 HA 图片给出可长期缓存的 Cache-Control。

    只对 /api/image_proxy/ 的 2xx 生效：带 hb 参数说明内容变化会反映在 URL 上，
    因此可标记为 immutable 缓存 10 分钟；其余资源返回 None，不被浏览器缓存住。
    """
    if path.startswith('/api/image_proxy/') and 200 <= status_code < 300:
        # hb 是前端给「实体状态图」打的版本戳，值为空等同于没有版本信息，不能长缓存。
        versioned = any(
            key == 'hb' and bool(value)
            for part in query.split('&')
            if part
            for key, separator, value in [part.partition('=')]
            if separator
        )
        # 摄像头快照等实时图片没有 hb 参数，返回 None 以免被浏览器缓存住。
        return PRIVATE_BRIEF_IMMUTABLE_CACHE if versioned else None
    return None






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


async def proxy_http(request: Request) -> Response:
    """媒体代理的核心实现：与身份无关的通用转发。

    门禁：只允许 GET / HEAD 且路径命中白名单；未配置 HA 抛 409，凭证解密失败或回源失败
    抛 502。查询串原样带给 HA，返回上游响应（流式或一次性），必要时改写缓存与 Location 头。
    """
    if request.method not in {'GET', 'HEAD'} or not allowed_media_proxy_path(request.url.path):
        # 路径不合规统一回 404 而不是 403：不向扫描者暴露哪些前缀存在。
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='媒体资源不存在。')
    connection = await asyncio.to_thread(load_active_connection_snapshot, request.app.state.database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    try:
        client_config = await request.app.state.ha_connector.client_for(connection)
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
    caches = request.app.state.media_proxy
    snapshot_key = (
        camera_snapshot_cache_key(connection.id, client_config.base_url, request.url.path)
        if snapshot_request
        else ''
    )
    if snapshot_request:
        cached = caches.snapshot(snapshot_key)
        if cached is not None:
            # hb_live=1 是前端「立即刷新」的语义：TTL 压到 1 秒，并等待刷新完成。
            live_map = parse_qs(request.url.query).get('hb_live') == ['1']
            ttl = 1 if live_map else CAMERA_SNAPSHOT_CACHE_TTL_SECONDS
            if monotonic() - cached.created_at >= ttl:
                caches.schedule_refresh(
                    snapshot_key,
                    f'{client_config.base_url}{request.url.path}',
                    headers,
                    client_config.verify_tls,
                    client_config.timeout,
                )
                if live_map:
                    pending = caches.pending_refresh(snapshot_key)
                    if pending is not None:
                        # shield：外层被取消时刷新任务照常跑完，缓存不会留空洞。
                        await asyncio.shield(pending)
                    cached = caches.snapshot(snapshot_key) or cached
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
        # 必须始终以流式方式取回上游：stream=False 会让 httpx 先把整包读完，
        # 之后 aiter_raw() 直接抛 StreamConsumed，而整包内存并未省下。
        upstream = await client.send(upstream_request, stream=True)
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
            """把上游字节流原样转发给客户端。

            用 aiter_raw() 而不是 aiter_bytes()：这里只做管道不做解码，避免压缩响应被再解压一次。
            """
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

    async def pass_through_body():
        """非流式分支：同样逐块透传，只在「够小且要缓存」时攒一份副本。

        不能写 ``upstream.content``（上游给多大就占多大内存）；只有快照请求才攒，
        超过 ``CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES`` 就丢弃已攒部分并停止累积。

        必须用 ``aiter_bytes()`` 而不是 ``aiter_raw()``：响应头里会删掉
        ``content-encoding``（见 RESPONSE_HEADERS_TO_DROP），因此这里发出的字节必须是**已解码**的。
        HA 即使在 ``accept-encoding: identity`` 下也会 gzip HLS 播放列表，用 ``aiter_raw()``
        会把裸 gzip 当成明文下发 —— hls.js 解不开清单，直接报 manifestParsingError。
        """
        buffered = bytearray()
        cacheable = snapshot_request
        try:
            async for chunk in upstream.aiter_bytes():
                if not chunk:
                    continue
                if cacheable:
                    buffered.extend(chunk)
                    if len(buffered) > CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES:
                        # 超限就放弃缓存：清掉已攒的，避免「大图照样钉在内存里」。
                        cacheable = False
                        buffered = bytearray()
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()
        # 走到这里说明上游已经读完（提前关闭时不会执行到这里，半截内容绝不能进缓存）。
        # 回源成功就顺手更新缓存，下一次请求直接命中。
        if cacheable and buffered and 200 <= upstream.status_code < 300:
            caches.remember_snapshot(
                snapshot_key,
                bytes(buffered),
                upstream.headers.get('content-type', 'image/jpeg'),
            )

    return StreamingResponse(
        pass_through_body(), status_code=upstream.status_code, headers=response_headers
    )


@router.get('/api/camera_hls/{entity_id}')
async def camera_hls_stream(
    entity_id: str, request: Request, viewer: LicensedViewer
) -> JSONResponse:
    """为摄像头换取 HLS 播放地址（需已认证且授权允许 api）。

    路径参数 entity_id 必须是当前主体可见的实体，否则 403。返回 ``{'url': ...}``，或
    ``{'url': None, 'fallback': 'mjpeg'}``（不支持时回落 MJPEG）。409 未配置 HA；502 启动流失败。
    """
    connection = await asyncio.to_thread(
        load_authorized_camera_connection, request.app.state.database, viewer, entity_id
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    # 回落响应复用同一个对象：两条路径语义完全相同。
    mjpeg_fallback = JSONResponse({'url': None, 'fallback': 'mjpeg'})
    try:
        client = await request.app.state.ha_connector.client_for(connection)
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
        # 连接与鉴权问题是配置错误，必须让用户看到（502）；其余（如摄像头不响应）降级成 MJPEG。
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
    # 记账归属：HLS 令牌里没有实体信息，片段请求的校验只能靠这里记下的「令牌 → 实体」。
    request.app.state.media_proxy.remember_hls_stream(stream_url, entity_id)
    # 登记保温：go2rtc 在没人消费时约 10 秒就回收整条管道，下一次播放要为「连摄像头 +
    # 起转码 + 生成初始分片」重新买单（实测首个清单 9.2 秒）。登记后由保温池持续消费，
    # 后续每次打开（含刷新、切页、离开一会儿再回来）拿到的都是那条活流，挂上即播。
    request.app.state.camera_warmer.want(entity_id)
    return JSONResponse({'url': stream_url})


@router.api_route('/api/camera_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/camera_proxy_stream/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/image_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/media_player_proxy/{path:path}', methods=['GET', 'HEAD'])
@router.api_route('/api/hls/{path:path}', methods=['GET', 'HEAD'])
async def proxy_home_assistant_media(
    request: Request,
    _viewer: LicensedViewer,
    _scope: None = Depends(require_media_proxy_scope),
) -> Response:
    """五条媒体路径共用的代理入口（需已认证、授权允许 api、且实体对当前主体可见）。

    路由用通配路径覆盖 HA 的几种媒体前缀，具体的白名单判定在 proxy_http 里做；
    认证与授权由 _viewer 依赖完成，实体归属由 _scope 依赖完成，本函数只负责转发。
    """
    return await proxy_http(request)
