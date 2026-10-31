"""摄像头媒体传输的底层设施：授权 TTL 缓存、快照缓存、共享连接池与流式响应。

从 ``api/ha/proxy.py`` 拆出来的原因很实际：这些设施（尤其 ``LicensedCameraStreamingResponse``
的双任务取消域）必须能被单独读完整，而请求编排（谁在什么条件下拿到缓存、什么条件下
独占 client）是另一件事。两边混在 860 行里，改任何一侧都要先读懂另一侧。

本模块**不**导入 ``proxy``，因此两层之间没有环：

- ``proxy.py``：路由 + 请求编排（入口守卫、缓存优先、上游分发、错误映射）
- 本模块：被编排调用的底层设施
"""

from __future__ import annotations

import asyncio
import hashlib
import traceback
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from time import monotonic
from typing import Any, Protocol, cast

import httpx
from anyio import CancelScope, create_task_group, move_on_after
from fastapi import HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from starlette.requests import ClientDisconnect
from starlette.types import Message, Send

from ...dependencies import ViewerPrincipal, require_viewer_entity
from ...domains.ha.integration.connection_query import active_connection
from ...domains.license import features as feature_codes
from ...platform.core.db.database import Database

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
    service = getattr(request.app.state, "license_service", None)
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

#: 快照 / 短请求共享的连接池。
#:
#: ``hb_live=1`` 时墙屏每秒拉一帧，原来「每请求新建 ``AsyncClient``」等于每秒一次
#: TCP + TLS 握手，HA 侧还会积一堆 TIME_WAIT。这里按 TLS 校验参数复用 keep-alive；
#: 长连接的流式分支（camera_proxy_stream）仍然每请求独立 client —— 一条 MJPEG 流会
#: 长期占住连接，放进共享池只会把池子撑爆。
_SHARED_CLIENT_LIMITS = httpx.Limits(
    max_connections=16,
    max_keepalive_connections=8,
    keepalive_expiry=30.0,
)
_shared_clients: dict[Any, httpx.AsyncClient] = {}


def _shared_media_client(verify_tls: Any) -> httpx.AsyncClient:
    """取（或惰性创建）按 TLS 参数分组的共享 client。

    单事件循环模型：本模块的创建点在协程里，没有跨线程竞争。
    """
    client = _shared_clients.get(verify_tls)
    if client is None or client.is_closed:
        client = httpx.AsyncClient(
            verify=verify_tls,
            # 不设 client 级超时：每条请求各自带 timeout（快照很短、流式要无限）。
            timeout=None,  # noqa: S113 - 逐请求超时，client 级必须为空
            follow_redirects=False,
            limits=_SHARED_CLIENT_LIMITS,
        )
        _shared_clients[verify_tls] = client
    return client


async def close_shared_media_clients() -> None:
    """停机时关闭共享 client（连接池不关会在退出时留下未关闭的传输层警告）。"""
    clients = list(_shared_clients.values())
    _shared_clients.clear()
    for client in clients:
        try:
            await client.aclose()
        except Exception:
            # 停机阶段没有补救动作：继续关下一个。
            pass


def camera_snapshot_cache_key(base_url: str, path: str, access_token: str = "") -> str:
    """快照缓存键：同一路径在**换令牌**后必须失效。

    HA 的访问令牌决定「同一实体看到什么」（不同账号的摄像头权限可能不同），只按 URL
    做键会让换令牌后仍命中旧账号的画面。令牌只以 sha256 形式进入键，不落明文。
    """
    key = f"{base_url.rstrip('/')}{path}"
    if not access_token:
        return key
    return f"{key}|{hashlib.sha256(access_token.encode()).hexdigest()}"


def _remember_camera_snapshot(key: str, content: bytes, content_type: str) -> None:
    """写入快照缓存；超限时按创建时间淘汰最旧一条，防止长期运行把内存吃满。"""
    if key not in camera_snapshot_cache and len(camera_snapshot_cache) >= CAMERA_SNAPSHOT_CACHE_MAX_ENTRIES:
        oldest_key = min(camera_snapshot_cache, key=lambda item: camera_snapshot_cache[item].created_at)
        camera_snapshot_cache.pop(oldest_key, None)
    camera_snapshot_cache[key] = CameraSnapshotCacheEntry(
        content=content, content_type=content_type or "image/jpeg", created_at=monotonic()
    )


def _camera_snapshot_response(entry: CameraSnapshotCacheEntry) -> Response:
    return Response(
        content=entry.content, media_type=entry.content_type, headers={"cache-control": "private, no-store"}
    )


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


async def _refresh_camera_snapshot(
    key: str, target: str, headers: Mapping[str, str], verify_tls: bool, timeout: float
) -> None:
    try:
        # 后台刷新同样走共享池：这是 hb_live 墙屏最频繁的一条路径。
        upstream = await _shared_media_client(verify_tls).get(target, headers=dict(headers), timeout=timeout)
        if 200 <= upstream.status_code < 300 and upstream.content:
            _remember_camera_snapshot(key, upstream.content, upstream.headers.get("content-type", "image/jpeg"))
    except httpx.HTTPError:
        return
    finally:
        camera_snapshot_refreshes.pop(key, None)


def _schedule_camera_snapshot_refresh(
    key: str, target: str, headers: Mapping[str, str], verify_tls: bool, timeout: float
) -> None:
    existing = camera_snapshot_refreshes.get(key)
    if existing and not existing.done():
        return
    task = asyncio.create_task(_refresh_camera_snapshot(key, target, headers, verify_tls, timeout))
    camera_snapshot_refreshes[key] = task
    return


async def _camera_stream_log(
    request: Request,
    level: str,
    message: str,
    code: str,
    *,
    details: str | None = None,
) -> None:
    """终止性事件只记一次，绝不记录画面、URL 或凭据。"""
    log = getattr(request.app.state, "global_log", None)
    if log is None:
        return
    state = getattr(request, "state", request)
    recorded = getattr(state, "camera_stream_log_codes", None)
    if recorded is None:
        recorded = set()
        # Starlette 的 ``State`` 是动态属性容器：类型系统看不到运行期挂上去的键，
        # 直接 `.attr = …` 会被判成「类上不存在该属性」，因此显式走 setattr。
        setattr(state, "camera_stream_log_codes", recorded)  # noqa: B010 - State 只支持动态属性
    if code in recorded:
        return
    recorded.add(code)
    context: dict[str, Any] = {}
    context.update(getattr(state, "log_context", {}) or {})
    context.update({"phase": "camera-stream", "code": code})
    path = getattr(getattr(request, "url", None), "path", "")
    if path.startswith("/api/camera_proxy_stream/"):
        context.update({"path": path, "entityId": path.rsplit("/", 1)[-1]})
    started = getattr(state, "camera_stream_started_at", None)
    if started is not None:
        context["durationMs"] = round((monotonic() - started) * 1000, 1)
    await log.append_async(level, "Home Assistant", "摄像头", message, context=context, details=details)


async def open_licensed_camera_stream(
    request: Request, client: httpx.AsyncClient, upstream_request: httpx.Request
) -> httpx.Response:
    """许可失效或观看端掉线时，终止一条静默的上游流。"""

    async def wait_for_disconnect() -> None:
        while True:
            message = await request.receive()
            if message["type"] == "http.disconnect":
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
                        "code": "LICENSE_RESTRICTED",
                        "message": "当前授权状态不允许读取摄像头。",
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


class _ClosableAsyncStream(Protocol):
    """比 ``AsyncIterator`` 多一个 ``aclose`` 的异步流。

    ``httpx.Response.aiter_raw()`` 声明返回 ``AsyncIterator[bytes]``，但运行期是异步生成器，
    确实支持 ``aclose()``；本函数依赖这一点来在取消域里提前收干净上游连接，因此把契约写出来。
    """

    def __aiter__(self) -> AsyncIterator[bytes]: ...

    def __anext__(self) -> Any: ...

    async def aclose(self) -> None: ...


async def licensed_camera_stream(request: Request, upstream: httpx.Response) -> AsyncIterator[bytes]:
    """逐帧复检授权；响应侧另外负责取消静默读取与卡住的发送。"""
    iterator = cast(_ClosableAsyncStream, upstream.aiter_raw().__aiter__())
    if not await _camera_license_allows(request):
        await _camera_stream_log(
            request,
            "warning",
            "摄像头传输已停止：授权不可用或已到期，后续画面不再转发",
            "CAMERA_STREAM_LICENSE_RESTRICTED",
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
                await _camera_stream_log(
                    request,
                    "warning",
                    "摄像头传输已停止：授权不可用或已到期，后续画面不再转发",
                    "CAMERA_STREAM_LICENSE_RESTRICTED",
                )
                with CancelScope(shield=True):
                    await iterator.aclose()
                return
            if chunk:
                yield chunk
    except Exception as error:
        await _camera_stream_log(
            request,
            "error",
            f"摄像头持续传输失败：{type(error).__name__} · {error}",
            "CAMERA_STREAM_ERROR",
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
        state = getattr(request, "state", request)
        # 同上：``State`` 的键只能动态挂载。
        setattr(state, "camera_stream_started_at", monotonic())  # noqa: B010 - State 只支持动态属性

    async def stream_response(self, send: Send) -> None:
        failure: BaseException | None = None
        restricted = False
        started = False
        finished = False

        async def track_send(message: Message) -> None:
            nonlocal started, finished
            await send(message)
            if message["type"] == "http.response.start":
                started = True
            elif message["type"] == "http.response.body" and not message.get("more_body", False):
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
                await _camera_stream_log(
                    self.request,
                    "warning",
                    "摄像头传输已停止：授权不可用或已到期，后续画面不再转发",
                    "CAMERA_STREAM_LICENSE_RESTRICTED",
                )
                tasks.cancel_scope.cancel()

            tasks.start_soon(deliver)
            tasks.start_soon(monitor_license)
        if failure is not None:
            raise failure
        if restricted and started and not finished:
            # 授权已失效但画面还没收尾：补一个空 body 结束响应，别把连接吊死。
            with move_on_after(CAMERA_STREAM_LICENSE_CHECK_SECONDS):
                await send({"type": "http.response.body", "body": b"", "more_body": False})

    async def __call__(self, scope, receive, send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            with CancelScope(shield=True):
                # ``body_iterator`` 由基类按 ``AsyncContentStream`` 声明（协议里没有 aclose），
                # 但这里传入的是异步生成器，必须显式关闭才不会留下未收尾的帧读取协程。
                body_stream = cast(_ClosableAsyncStream, self.body_iterator)
                await body_stream.aclose()
                await self.upstream.aclose()
                await self.client.aclose()
