"""FastAPI 应用工厂：生命周期、Nest 结构错误响应、中间件、健康/指标与 SPA fallback。

设计目标：**前端零改动**。因此本模块严格保持 Nest 侧对外契约：
- 错误响应体 ``{ statusCode, errorCode, apiErrorCode?, error, message, timestamp, path, traceId? }``；
- 路由前缀 ``/api/v1``；根路径 ``GET /health``、``GET /metrics``；
- 静态资源与 SPA fallback 顺序与 Nest ``ServeStaticModule`` + main.ts 一致。

装配细节见 ``bootstrap`` 包；本文件只做薄工厂编排。
"""

from __future__ import annotations

import asyncio
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response

from . import load_app_version, studio_shell
from .bootstrap.exception_handlers import iso_timestamp, register_exception_handlers
from .bootstrap.lifespan import create_lifespan
from .bootstrap.middleware import (
    register_backup_maintenance_middleware,
    register_early_middleware,
    register_outer_middleware,
)
from .bootstrap.router_registry import register_routers
from .bootstrap.spa_static import mount_spa_static, register_page_asset_routes, signed_in
from .config import Settings, load_settings
from .core.database import Database
from .core.observability import decide_metrics_access, format_homeos_prometheus_metrics

#: 健康检查 DB 探针缓存 TTL：/health 为公开端点，避免高频轮询击穿连接。
DB_PROBE_TTL_SECONDS = 3.0

#: 慢请求阈值（毫秒）。
SLOW_REQUEST_MILLISECONDS = 2000


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or load_settings()
    version = load_app_version()

    app = FastAPI(
        title="HomeOS",
        version=version,
        lifespan=create_lifespan(app_settings, version),
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = app_settings

    register_exception_handlers(app, app_settings)
    register_early_middleware(app, app_settings)

    # ------------------------------------------------------------------ #
    # 根路径健康检查 / 指标（无 /api/v1 前缀）
    # ------------------------------------------------------------------ #
    def _probe_db(app: FastAPI) -> bool:
        now = time.monotonic()
        cached = getattr(app.state, "db_probe", None)
        if cached is not None and now - cached[0] < DB_PROBE_TTL_SECONDS:
            return cached[1]
        ok = True
        try:
            database: Database = app.state.database
            with database.engine.connect() as connection:
                connection.exec_driver_sql("SELECT 1")
        except Exception:
            ok = False
        app.state.db_probe = (now, ok)
        return ok

    @app.get("/health", include_in_schema=False)
    async def health(request: Request):
        db_ok = await asyncio.to_thread(_probe_db, request.app)
        redis_configured = app_settings.redis_configured
        redis_ready = False
        redis_degraded = redis_configured and not redis_ready
        ha_connected = bool(getattr(request.app.state, "ha_connected", False))
        ha_registry_available = ha_connected and not bool(
            getattr(request.app.state, "ha_registry_degraded", False)
        )
        # 启动期已跑迁移 + drift 守卫；此处只暴露期望 revision，不扫库列明细。
        from .core.migrations import SCHEMA_REVISION

        return {
            "status": "ok" if db_ok and not redis_degraded else "degraded",
            "redis_ok": redis_ready if redis_configured else None,
            "redis": {"configured": redis_configured, "ready": redis_ready},
            "ha_registry_available": ha_registry_available,
            "schema": {
                "ok": db_ok,
                "revision": SCHEMA_REVISION,
            },
            "timestamp": iso_timestamp(),
        }

    @app.get("/health/live", include_in_schema=False)
    async def health_live():
        return {"status": "ok", "version": version}

    @app.get("/health/ready", include_in_schema=False)
    async def health_ready(request: Request):
        database: Database = request.app.state.database
        with database.engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
        return {"status": "ready", "version": version}

    @app.get("/metrics", include_in_schema=False)
    async def metrics(request: Request):
        decision = decide_metrics_access(
            metrics_token=app_settings.metrics_token,
            is_production=app_settings.is_production,
            remote_address=request.client.host if request.client else None,
            authorization_header=request.headers.get("authorization"),
            query_token=request.query_params.get("token"),
        )
        if decision == "not_found":
            raise HTTPException(status_code=404)
        if decision == "unauthorized":
            raise HTTPException(status_code=401)
        body = format_homeos_prometheus_metrics(
            ha_connected=bool(getattr(request.app.state, "ha_connected", False)),
            entity_count=int(getattr(request.app.state, "ha_entity_count", 0)),
            socket_clients=int(getattr(request.app.state, "socket_clients", 0)),
            uptime_seconds=int(
                time.monotonic() - getattr(request.app.state, "started_at", time.monotonic())
            ),
        )
        return Response(
            content=body,
            media_type="text/plain; version=0.0.4; charset=utf-8",
            headers={"Cache-Control": "no-store"},
        )

    register_page_asset_routes(app, app_settings)

    # 业务路由（/api/v1）——必须在 SPA catch-all 之前注册
    register_routers(app)

    register_backup_maintenance_middleware(app)
    # 中间件顺序（后注册者在外层）：CSRF 内层、压缩 / 请求体门禁 / CORS 依次在外。
    register_outer_middleware(app, app_settings)

    # ------------------------------------------------------------------ #
    # 实时网关（Socket.IO + msgpack）：实例挂在 app.state，供 create_asgi_app 包装
    # ------------------------------------------------------------------ #
    from .realtime.gateway import create_realtime_gateway

    app.state.realtime = create_realtime_gateway(app)

    mount_spa_static(app, app_settings, version)

    # ------------------------------------------------------------------ #
    # 静态资源门禁 / SPA 外壳安全头（并入 homeos-3d main.py 的保护层）
    # ------------------------------------------------------------------ #
    # 注册在最外层：授权判定要在任何业务中间件之前短路，未登录请求不会触达下游。
    studio_shell.install(
        app,
        app_settings,
        is_authorized=lambda request: asyncio.to_thread(signed_in, request),
    )

    return app


def create_asgi_app(settings: Settings | None = None):
    """组合 ASGI：Socket.IO（``/socket.io``）→ 其余请求转发给 FastAPI。

    与 Nest ``main.ts`` 一致：Socket.IO 与 HTTP 同端口、同进程，前端零改动。
    """
    import socketio

    fastapi_app = create_app(settings)
    return socketio.ASGIApp(
        fastapi_app.state.realtime.sio,
        other_asgi_app=fastapi_app,
        socketio_path="socket.io",
    )
