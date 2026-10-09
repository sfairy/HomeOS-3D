"""应用中间件注册（纯 ASGI，避免多层 BaseHTTPMiddleware 竞态）。

注册顺序与原先 ``create_app`` 一致：后注册者在外层。
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from .exception_handlers import business_exception_json, nest_error_payload
from ..config import Settings
from ..core.errors import BusinessException, ErrorCode, api_error
from ..core.observability import new_request_id, reset_trace_id, set_trace_id
from ..security.body_limit import BodyLimitMiddleware
from ..security.cookies import is_https_deploy_mode
from ..security.cors import CorsMiddleware
from ..security.csrf import CsrfMiddleware
from ..services.license import features as feature_codes
from ..services.license.guard import is_license_exempt_path


class RequestDiagnosticsMiddleware:
    """写入 trace id / ``X-Request-ID``（对齐原 ``record_request_diagnostics``）。"""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        trace_id = headers.get("x-trace-id") or new_request_id()
        token = set_trace_id(trace_id)
        scope.setdefault("state", {})
        scope["state"]["trace_id"] = trace_id

        async def send_wrapper(message: Any) -> None:
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                response_headers["X-Request-ID"] = trace_id
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            reset_trace_id(token)


class LicenseGuardMiddleware:
    """商业授权门禁（等价 Nest ``LicenseGuard``）：未激活时白名单外直接 401。"""

    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope, receive)
        service = getattr(request.app.state, "license_service", None)
        if service is not None and self.settings.license_required:
            if not is_license_exempt_path(request.url.path, request.method):
                # 用 ``api`` 能力码而不是裸 ``allows()``：按商店的能力目录，``api`` 就是
                # 「登录后读写业务数据的通用接口，其余能力码的前置条件」。
                # 同步 SQLAlchemy 读写放到线程池，避免阻塞事件循环。
                if not await asyncio.to_thread(service.allows, feature_codes.FEATURE_API):
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


class SecurityHeadersMiddleware:
    """对齐 Nest Helmet 的基线安全头（CSP 等由 studio_shell 按页面再收紧）。"""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

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
                if is_https_deploy_mode():
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
    """诊断 / 授权门禁 / 安全头（在业务路由之前注册）。"""
    # 注册顺序：先内后外（add_middleware 每次插到最外）。
    app.add_middleware(RequestDiagnosticsMiddleware)
    app.add_middleware(LicenseGuardMiddleware, settings=settings)
    app.add_middleware(SecurityHeadersMiddleware)


def register_backup_maintenance_middleware(app: FastAPI) -> None:
    """备份维护门禁（须在业务路由注册之后）。"""
    app.add_middleware(BackupMaintenanceASGI, fastapi_app=app)


# 长连接媒体绝不能走 GZip：Starlette GZipMiddleware 会缓冲 body，
# multipart MJPEG / HLS 分片首帧到不了 <img>/<video>，表现为 naturalWidth 一直为 0。
# 0.7.2 发布包没有对 API 开 compression，所以同实体在那边能秒出画面。
_GZIP_SKIP_PREFIXES = (
    "/api/camera_proxy_stream/",
    "/api/camera_proxy/",
    "/api/hls/",
    "/api/media_player_proxy/",
)


class SelectiveGZipMiddleware:
    """对摄像头/HLS 长连接绕过 GZip，其余路径仍走 Starlette GZipMiddleware。"""

    def __init__(self, app: ASGIApp, minimum_size: int = 1024, compresslevel: int = 9) -> None:
        self.app = app
        self.gzip = GZipMiddleware(app, minimum_size=minimum_size, compresslevel=compresslevel)

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
    app.add_middleware(SelectiveGZipMiddleware, minimum_size=1024)
    # 对齐 Nest body-parser limit：公共端点 1MB、其余 50MB。
    app.add_middleware(
        BodyLimitMiddleware,
        public_max_bytes=settings.public_body_limit_bytes,
        authenticated_max_bytes=settings.authenticated_body_limit_bytes,
        build_payload=nest_error_payload,
    )
