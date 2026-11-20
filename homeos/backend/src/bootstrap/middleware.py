"""应用中间件注册（纯 ASGI，避免多层 BaseHTTPMiddleware 竞态）。

注册顺序与原先 ``create_app`` 一致：后注册者在外层。
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.datastructures import Headers, MutableHeaders, QueryParams
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from .exception_handlers import business_exception_json, nest_error_payload
from ..config import Settings
from ..domains.license import features as feature_codes
from ..domains.license.guard import ASSET_SUFFIXES, is_license_exempt_path
from ..platform.core.http.diagnostics import (
    DEFERRED_KEY,
    SLOW_REQUEST_MILLISECONDS,
    STATE_KEY,
    diagnostic_headers,
    operation_name,
    request_entity_context,
    round_ms,
)
from ..platform.core.http.errors import BusinessException, ErrorCode, api_error
from ..platform.core.http.upload_limits import PATH_BODY_LIMIT_OVERRIDES
from ..platform.core.runtime.observability import (
    new_request_id,
    record_http_request,
    reset_trace_id,
    set_trace_id,
)
from ..platform.security.body_limit import BodyLimitMiddleware
from ..platform.security.cookies import is_https_deploy_mode, is_request_secure
from ..platform.security.cors import CorsMiddleware
from ..platform.security.csrf import CsrfMiddleware

logger = logging.getLogger("homeos.app")

#: 程序版本（响应头用）。只读一次：镜像里 `_version` 是烘入的常量，不会运行期变化。
_APP_VERSION_CACHE: list[str] = []


def _app_version() -> str:
    if not _APP_VERSION_CACHE:
        from ..version import load_app_version

        _APP_VERSION_CACHE.append(load_app_version())
    return _APP_VERSION_CACHE[0]


#: 自身日志接口不参与诊断（否则每次查日志都先写一条日志，形成自激）。
_DIAGNOSTIC_SKIP_PREFIXES = ("/api/v1/logs",)

#: 只有接口路径进诊断：静态产物与页面导航不是「操作」，逐条记录只会制造噪声。
_DIAGNOSTIC_PREFIXES = ("/api/", "/render-cache/")


class _HttpPassthroughMiddleware:
    """HTTP 中间件公共骨架：``__init__`` 与「非 HTTP 流量原样放行」只写一份。

    两个中间件（诊断 / 耗时）的这段逻辑原本逐字重复，被重复代码门禁判为新增重复；
    提到基类后既消掉重复，也保证「WS / lifespan 一律不拦」这条约束只有一处实现。
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def _pass_through(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self.app(scope, receive, send)


class RequestDiagnosticsMiddleware(_HttpPassthroughMiddleware):
    """请求诊断：``X-Request-ID``、错误码响应头、慢请求与 4xx/5xx 的中文归因。

    对本项目是「原 ``record_request_diagnostics`` 的等价实现」，但按本项目分层把
    纯函数搬到了 :mod:`platform.core.http.diagnostics`，这里只负责掐表、取状态、
    落一条日志（``append`` 只入内存队列，不阻塞事件循环）与清理上下文。

    注册位置在**最外层**（见 :func:`register_outer_middleware`）：这样 CSRF / CORS /
    请求体门禁 / 授权门禁的拒绝也能被看见，而不只是走到路由之后的响应。
    """

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._pass_through(scope, receive, send)
            return
        started = time.monotonic()
        headers = Headers(scope=scope)
        trace_id = headers.get("x-trace-id") or new_request_id()
        token = set_trace_id(trace_id)
        path = scope.get("path") or ""
        method = scope.get("method") or "GET"
        state = scope.setdefault("state", {})
        state["trace_id"] = trace_id
        state[STATE_KEY] = {
            "requestId": trace_id,
            "method": method,
            "path": path,
            "operation": operation_name(path, method),
            "peer": (scope.get("client") or ("", 0))[0],
            "userAgent": (headers.get("user-agent") or "")[:384],
            **request_entity_context(path, QueryParams(scope=scope)),
        }
        outcome: dict[str, int] = {}

        async def send_wrapper(message: Any) -> None:
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                response_headers.setdefault("X-Request-ID", trace_id)
                # 0.8.7：程序版本放进响应头 —— 报障时前端能直接读出「用户跑的是哪一版」。
                response_headers.setdefault("X-HA-Bridge-Version", _app_version())
                for key, value in diagnostic_headers(Request(scope)).items():
                    response_headers.setdefault(key, value)
                outcome["status"] = int(message.get("status", 0))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            self._finish(scope, started, outcome.get("status", 0))
            reset_trace_id(token)

    @staticmethod
    def _should_log(path: str) -> bool:
        if not path.startswith(_DIAGNOSTIC_PREFIXES):
            return False
        return not path.startswith(_DIAGNOSTIC_SKIP_PREFIXES)

    def _finish(self, scope: Scope, started: float, status: int) -> None:
        """按状态码 / 耗时落一条诊断，并把延后事件一并写出。"""
        request = Request(scope)
        store = getattr(getattr(scope.get("app"), "state", None), "global_log", None)
        if store is None:
            return
        duration = (time.monotonic() - started) * 1000
        context = dict(getattr(request.state, STATE_KEY, None) or {})
        context["status"] = status
        context["durationMs"] = round_ms(duration)
        self._append_summary(store, request.url.path, status, duration, context)
        self._flush_deferred(store, request, context)

    def _append_summary(self, store: Any, path: str, status: int, duration: float, context: dict) -> None:
        if not self._should_log(path):
            return
        operation = str(context.get("operation") or "接口请求")
        if status >= 500:
            store.append("error", "系统后台", "接口", f"接口运行异常：{operation} · HTTP {status}", context=context)
            return
        if status >= 400:
            store.append("warning", "系统后台", "接口", f"接口返回错误：{operation} · HTTP {status}", context=context)
            return
        if duration >= SLOW_REQUEST_MILLISECONDS:
            context["code"] = "HTTP_REQUEST_SLOW"
            context["hint"] = "本次接口已返回；若反复耗时较长，检查服务负载与网络，操作结果以对应状态为准。"
            store.append("warning", "系统后台", "性能", f"接口响应缓慢：{operation} · {round(duration)} 毫秒", context=context)

    @staticmethod
    def _flush_deferred(store: Any, request: Request, context: dict) -> None:
        queued = getattr(request.state, DEFERRED_KEY, None)
        dropped = int(getattr(request.state, "deferred_diagnostics_dropped", 0) or 0)
        for item in queued or []:
            store.append(item["level"], "系统后台", "请求阶段诊断", item["message"], context=item["context"])
        if dropped:
            store.append(
                "warning",
                "系统后台",
                "日志采集",
                f"本请求有 {dropped} 条阶段诊断超过保留上限，信息可能不完整。",
                context={**context, "code": "REQUEST_DIAGNOSTICS_TRUNCATED", "droppedEvents": dropped},
            )


#: 不进入 HTTP 直方图的路径：静态产物与长连接媒体不是「接口」，逐请求记录只会制造噪声。
_HTTP_TIMING_SKIP_PREFIXES = (
    "/metrics",
    "/static/",
    "/fonts/",
    "/favicon",
    "/api/v1/modules/interaction3d/core/",
    "/api/camera_proxy_stream/",
    "/api/hls/",
)


class HttpTimingMiddleware(_HttpPassthroughMiddleware):
    """按路由模板记录 HTTP 耗时（Prometheus 直方图）。

    纯 ASGI：只在 http.response.start 时读 scope['route'].path，不缓存/缓冲 body，
    因此不会改变任何响应语义。路由模板来自 Starlette 的路由匹配结果，天然把
    /projects/{project_id} 这类路径参数收敛成一个标签；匹配失败的请求归 __unmatched__。
    """

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._pass_through(scope, receive, send)
            return
        path = scope.get("path") or ""
        if any(path.startswith(prefix) for prefix in _HTTP_TIMING_SKIP_PREFIXES):
            await self._pass_through(scope, receive, send)
            return
        started = time.perf_counter()
        method = scope.get("method") or "GET"

        async def send_wrapper(message: Any) -> None:
            if message["type"] == "http.response.start":
                route = scope.get("route")
                route_path = getattr(route, "path", None) or "__unmatched__"
                record_http_request(
                    str(route_path),
                    str(method),
                    int(message.get("status", 500)),
                    time.perf_counter() - started,
                )
            await send(message)

        await self.app(scope, receive, send_wrapper)


class LicenseGuardMiddleware:
    """商业授权门禁（等价 Nest ``LicenseGuard``）：未激活时白名单外直接 401。"""

    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        scope_type = scope["type"]
        if scope_type != "http":
            # 非 HTTP 不等于「无需授权」：WebSocket 握手是一条长连接入口，一旦放过去，
            # 之后的推送再也不经过任何 HTTP 门禁。旧实现在这里整体放行，等于把 WS 变成
            # 绕过授权检查的旁路（socket.io 另见 realtime/gateway.py 的握手校验）。
            if scope_type == "websocket":
                await self._guard_websocket(scope, receive, send)
                return
            await self.app(scope, receive, send)
            return
        request = Request(scope, receive)
        service = getattr(request.app.state, "license_service", None)
        if service is not None and self.settings.license_required:
            path = request.url.path
            if not is_license_exempt_path(
                path, request.method, request.headers.get("accept", "")
            ):
                # 用 ``api`` 能力码而不是裸 ``allows()``：按商店的能力目录，``api`` 就是
                # 「登录后读写业务数据的通用接口，其余能力码的前置条件」。
                # 先读纯内存缓存；未命中才把同步 SQLAlchemy 读放到线程池。
                allowed = service.cached_allows(feature_codes.FEATURE_API)
                if allowed is None:
                    allowed = await asyncio.to_thread(
                        service.allows, feature_codes.FEATURE_API
                    )
                if not allowed:
                    _warn_if_asset_blocked(path)
                    response = business_exception_json(
                        request,
                        BusinessException(
                            ErrorCode.UNAUTHORIZED, api_error("LICENSE_INACTIVE"), 401
                        ),
                        is_production=self.settings.is_production,
                    )
                    await response(scope, receive, send)
                    return
        await self.app(scope, receive, send)

    async def _guard_websocket(self, scope: Scope, receive: Receive, send: Send) -> None:
        """WS 握手授权检查：未授权时按 1008（policy violation）关闭连接。

        这里必须就地拒绝、不能先交给路由再判：握手一旦被接受，后续推送就绕过了所有
        HTTP 门禁。ASGI 允许在接受握手前直接发 websocket.close，浏览器会把它当成
        握手失败（uvicorn 回 403），因此不会下发任何业务数据。
        """
        app = scope.get("app")
        service = getattr(getattr(app, "state", None), "license_service", None)
        path = scope.get("path") or ""
        if (
            service is not None
            and self.settings.license_required
            and not is_license_exempt_path(path, "GET")
        ):
            allowed = service.cached_allows(feature_codes.FEATURE_API)
            if allowed is None:
                allowed = await asyncio.to_thread(
                    service.allows, feature_codes.FEATURE_API
                )
            if not allowed:
                await send({"type": "websocket.close", "code": 1008})
                return
        await self.app(scope, receive, send)


def _warn_if_asset_blocked(path: str) -> None:
    """门禁拦下的路径「像是前端产物」时告警一次。

    这是本模块最贵的一种误配，且它的症状**不在后端日志里**：未激活时页面白屏、控制台只有
    一串 401 与「MIME type ('application/json') is not a supported stylesheet」，而激活页
    自己也是用这些产物渲染的 —— 于是用户永远走不到激活那一步（死锁）。豁免名单在
    ``domains/license/guard.py``，漏一个挂载前缀就会重现，所以在拦下的那一刻把线索写进日志。
    """
    lowered = path.lower()
    if not lowered.endswith(tuple(ASSET_SUFFIXES)):
        return
    logger.warning(
        "授权门禁拦下了疑似前端产物：%s —— 未激活时页面会白屏、且激活页自身也渲染不出来。"
        "请核对 domains/license/guard.py 的 LICENSE_EXEMPT_STATIC_PREFIXES 是否覆盖该挂载点。",
        path,
    )


class SecurityHeadersMiddleware:
    """对齐 Nest Helmet 的基线安全头（CSP 等由 studio_shell 按页面再收紧）。"""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # HSTS 只在"浏览器确实走 HTTPS"时下发：除显式 `COOKIE_SECURE=true` 外，
        # 还要认可信代理送来的 `X-Forwarded-Proto: https`（auto 模式的正常部署形态）。
        # 明文 HTTP 下发 HSTS 会让浏览器把该主机钉死，是比漏发更糟的故障。
        secure_transport = is_https_deploy_mode() or is_request_secure(Request(scope))

        async def send_wrapper(message: Any) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("X-DNS-Prefetch-Control", "off")
                headers.setdefault("X-Download-Options", "noopen")
                headers.setdefault("X-Frame-Options", "SAMEORIGIN")
                headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
                headers.setdefault("X-XSS-Protection", "0")
                headers.setdefault("Referrer-Policy", "no-referrer")
                headers.setdefault("Cross-Origin-Resource-Policy", "cross-origin")
                if secure_transport:
                    headers.setdefault(
                        "Strict-Transport-Security",
                        "max-age=15552000; includeSubDomains",
                    )
            await send(message)

        await self.app(scope, receive, send_wrapper)


class BackupMaintenanceASGI:
    """业务备份恢复期间拦其他 API；纯 ASGI，避免 BaseHTTPMiddleware。"""

    def __init__(self, asgi_app: ASGIApp, fastapi_app: FastAPI) -> None:
        self.app = asgi_app
        self.fastapi_app = fastapi_app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path") or ""
        coordinator = getattr(self.fastapi_app.state, "business_backup", None)
        if coordinator is not None:
            if coordinator.maintenance and path.startswith("/api/v1/") and not path.startswith(
                "/api/v1/backups"
            ):
                response = JSONResponse(
                    status_code=503,
                    content={"detail": "正在恢复业务数据，请稍候…"},
                )
                await response(scope, receive, send)
                return
            if coordinator.recovery_required and path.startswith("/api/v1/backups"):
                response = JSONResponse(
                    status_code=503,
                    content={
                        "detail": "恢复回退尚未完成，请重启服务或联系管理员后再试备份操作。"
                    },
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


def register_early_middleware(app: FastAPI, settings: Settings) -> None:
    """授权门禁 / 安全头（在业务路由之前注册）。"""
    # 注册顺序：先内后外（add_middleware 每次插到最外）。
    # 请求诊断放在最外层（见 register_outer_middleware），这样 CSRF / CORS / 请求体门禁
    # 与这里的授权门禁的拒绝都能被归因。
    app.add_middleware(LicenseGuardMiddleware, settings=settings)
    app.add_middleware(SecurityHeadersMiddleware)


def register_backup_maintenance_middleware(app: FastAPI) -> None:
    """备份维护门禁（须在业务路由注册之后）。"""
    app.add_middleware(BackupMaintenanceASGI, fastapi_app=app)


# 长连接媒体绝不能走 GZip：Starlette GZipMiddleware 会缓冲 body，
# multipart MJPEG / HLS 分片首帧到不了 <img>/<video>，表现为 naturalWidth 一直为 0。
_GZIP_SKIP_PREFIXES = (
    "/api/camera_proxy_stream/",
    "/api/camera_proxy/",
    "/api/hls/",
    "/api/media_player_proxy/",
)


class SelectiveGZipMiddleware:
    """对摄像头/HLS 长连接绕过 GZip，其余路径仍走 Starlette GZipMiddleware。"""

    #: 压缩级别：9 对 API JSON 只比 5 小约 1–2%，CPU 却高一个数量级；高 QPS 下
    #: 这是每个响应都要付的阻塞成本，故取 5（对齐 nginx/compression 的常用默认）。
    def __init__(
        self,
        app: ASGIApp,
        minimum_size: int = 1024,
        compresslevel: int = 5,
        thread_minimum_size: int = 0,
    ) -> None:
        self.app = app
        # Starlette 默认只把 >=128KiB 的响应丢进线程池，128KiB 以下在事件循环里同步 zlib。
        # 静态 chunk 常见 30KB–1.3MB，正好落在同步区间；统一 thread_minimum_size=0，
        # 让所有压缩离开事件循环（代价是一次线程切换，远小于 1.3MB 现压的毫秒数）。
        self.gzip = GZipMiddleware(
            app,
            minimum_size=minimum_size,
            compresslevel=compresslevel,
            thread_minimum_size=thread_minimum_size,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            path = scope.get("path") or ""
            if any(path.startswith(prefix) for prefix in _GZIP_SKIP_PREFIXES):
                await self.app(scope, receive, send)
                return
        await self.gzip(scope, receive, send)


def register_outer_middleware(app: FastAPI, settings: Settings) -> None:
    """CSRF / CORS / GZip / 请求体门禁（后注册者在外层）。"""
    app.add_middleware(
        CsrfMiddleware,
        cookie_name=settings.csrf_cookie_name,
        header_name=settings.csrf_header_name,
    )
    app.add_middleware(CorsMiddleware)
    # 对齐 Nest ``compression()``：默认阈值 1KB；媒体流必须排除（见 SelectiveGZipMiddleware）。
    app.add_middleware(
        SelectiveGZipMiddleware,
        minimum_size=1024,
        compresslevel=5,
        thread_minimum_size=0,
    )
    # 对齐 Nest body-parser limit：公共端点 1MB、其余 50MB。
    # 但「其余 50MB」不能一刀切：有些端点的处理器自己就声明了更大的上限（3D 草稿 64MB、
    # 导出包 512MB），门禁不放行的话那些上限永远走不到，用户拿到的是与「文件太大」无关的
    # 413。覆盖表的数值取自平台层单一来源，与处理器用的是同一个数字。
    app.add_middleware(
        BodyLimitMiddleware,
        public_max_bytes=settings.public_body_limit_bytes,
        authenticated_max_bytes=settings.authenticated_body_limit_bytes,
        build_payload=nest_error_payload,
        path_overrides=PATH_BODY_LIMIT_OVERRIDES,
    )
    # 最外层：耗时包含 CORS / GZip / 请求体门禁，才是客户端真正等到的延迟。
    app.add_middleware(HttpTimingMiddleware)
    # 诊断再外一层：既能给上面所有中间件补齐 ``X-Request-ID``，又能看见它们自己的拒绝响应。
    app.add_middleware(RequestDiagnosticsMiddleware)
