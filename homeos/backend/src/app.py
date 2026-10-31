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
from fastapi.responses import JSONResponse, Response

from homeos_shared.single_process import assert_single_process

from . import load_app_version
from .bootstrap.exception_handlers import iso_timestamp, register_exception_handlers
from .bootstrap.lifespan import create_lifespan
from .bootstrap.middleware import (
    register_backup_maintenance_middleware,
    register_early_middleware,
    register_outer_middleware,
)
from .bootstrap.router_registry import register_routers
from .bootstrap.spa_static import mount_spa_static, register_page_asset_routes, signed_in
from .bootstrap.studio_shell import install as install_studio_shell
from .config import Settings, load_settings
from .platform.core.db.database import Database
from .platform.core.http.proxy_env import repair_no_proxy_env
from .platform.core.runtime.observability import decide_metrics_access, format_homeos_prometheus_metrics
from .platform.security.client_address import client_ip_from_request

#: 健康检查 DB 探针缓存 TTL：/health 为公开端点，避免高频轮询击穿连接。
DB_PROBE_TTL_SECONDS = 3.0


def _probe_db(app: FastAPI) -> bool:
    """带 TTL 的 DB 探针：``/health`` 为公开端点，避免高频轮询击穿连接。"""
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


def _register_probe_routes(app: FastAPI, app_settings: Settings, version: str) -> None:
    """根路径健康检查 / 指标（无 /api/v1 前缀）。"""

    @app.get("/health", include_in_schema=False)
    async def health(request: Request):
        db_ok = await asyncio.to_thread(_probe_db, request.app)
        ha_connected = bool(getattr(request.app.state, "ha_connected", False))
        ha_registry_available = ha_connected and not bool(
            getattr(request.app.state, "ha_registry_degraded", False)
        )
        # 启动期已建库并核对结构；健康检查只反映数据库可用性。
        return {
            "status": "ok" if db_ok else "degraded",
            "ha_registry_available": ha_registry_available,
            "schema": {"ok": db_ok},
            "timestamp": iso_timestamp(),
        }

    @app.get("/health/live", include_in_schema=False)
    async def health_live():
        return {"status": "ok", "version": version}

    @app.get("/health/ready", include_in_schema=False)
    async def health_ready(request: Request):
        database: Database = request.app.state.database

        def _probe() -> int:
            with database.engine.connect() as connection:
                connection.exec_driver_sql("SELECT 1")
                # 迁移版本进 readiness：镜像启动后若 schema 落后或版本表丢失，立即摘流量。
                applied = connection.exec_driver_sql(
                    "SELECT MAX(version) FROM schema_migrations"
                ).scalar()
            if applied is None:
                raise RuntimeError("schema_migrations 为空，数据库未完成初始化")
            return int(applied)

        # 与 /health 同口径做 TTL 缓存：readiness 也是高频轮询端点。
        cached = getattr(request.app.state, "db_ready_probe", None)
        if cached is not None and time.monotonic() - cached[0] < DB_PROBE_TTL_SECONDS:
            schema_version = cached[1]
        else:
            try:
                schema_version = await asyncio.wait_for(asyncio.to_thread(_probe), timeout=3.0)
            except Exception as error:
                return JSONResponse(
                    status_code=503,
                    content={
                        "status": "degraded",
                        "version": version,
                        "database": "unavailable",
                        "error": type(error).__name__,
                    },
                )
            request.app.state.db_ready_probe = (time.monotonic(), schema_version)
        return {"status": "ready", "version": version, "database": "ok", "schemaVersion": schema_version}

    @app.get("/metrics", include_in_schema=False)
    async def metrics(request: Request):
        decision = decide_metrics_access(
            metrics_token=app_settings.metrics_token,
            is_production=app_settings.is_production,
            remote_address=client_ip_from_request(request),
            authorization_header=request.headers.get("authorization"),
            query_token=request.query_params.get("token"),
        )
        if decision == "not_found":
            raise HTTPException(status_code=404)
        if decision == "unauthorized":
            raise HTTPException(status_code=401)
        loop_lag = getattr(request.app.state, "loop_lag", None)
        body = format_homeos_prometheus_metrics(
            ha_connected=bool(getattr(request.app.state, "ha_connected", False)),
            entity_count=int(getattr(request.app.state, "ha_entity_count", 0)),
            socket_clients=int(getattr(request.app.state, "socket_clients", 0)),
            uptime_seconds=int(
                time.monotonic() - getattr(request.app.state, "started_at", time.monotonic())
            ),
            loop_lag=loop_lag.snapshot() if loop_lag is not None else None,
            startup_duration_ms=float(getattr(request.app.state, "startup_duration_ms", 0.0)),
            startup_phases=list(getattr(request.app.state, "startup_phases", []) or []),
            boot_import_ms=float(getattr(request.app.state, "boot_import_ms", 0.0) or 0.0),
        )
        return Response(
            content=body,
            media_type="text/plain; version=0.0.4; charset=utf-8",
            headers={"Cache-Control": "no-store"},
        )


def create_app(settings: Settings | None = None) -> FastAPI:
    # 限流桶/会话状态都在进程内：多 worker 会静默放大配额，启动即拒绝。
    assert_single_process("HomeOS 后端")
    # 必须在任何 httpx 客户端构造之前完成：lifespan 启动期 WebPush/WeCom
    # 会建立常驻客户端，坏 NO_PROXY（如含 "[::1]"）会让整个进程启动失败。
    repair_no_proxy_env()
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
    _register_probe_routes(app, app_settings, version)
    register_page_asset_routes(app, app_settings)

    # 业务路由（/api/v1）——必须在 SPA catch-all 之前注册
    register_routers(app)

    register_backup_maintenance_middleware(app)
    # 中间件顺序（后注册者在外层）：CSRF 内层、压缩 / 请求体门禁 / CORS 依次在外。
    register_outer_middleware(app, app_settings)

    # 实时网关（Socket.IO + msgpack）：实例挂在 app.state，供 create_asgi_app 包装
    from .realtime.gateway import create_realtime_gateway

    app.state.realtime = create_realtime_gateway(app)

    mount_spa_static(app, app_settings, version)

    # 静态资源门禁 / SPA 外壳安全头
    # 注册在最外层：授权判定要在任何业务中间件之前短路，未登录请求不会触达下游。
    install_studio_shell(
        app,
        app_settings,
        is_authorized=lambda request: asyncio.to_thread(signed_in, request),
    )

    return app


def create_asgi_app(settings: Settings | None = None, *, boot_import_ms: float | None = None):
    """组合 ASGI：Socket.IO（/socket.io）→ 其余请求转发给 FastAPI。

    与 Nest main.ts 一致：Socket.IO 与 HTTP 同端口、同进程，前端零改动。
    boot_import_ms 由入口进程测得，仅为 /metrics 提供「import vs lifespan」拆分，不参与运行。
    """
    import socketio

    fastapi_app = create_app(settings)
    if boot_import_ms is not None:
        fastapi_app.state.boot_import_ms = float(boot_import_ms)
    return socketio.ASGIApp(
        fastapi_app.state.realtime.sio,
        other_asgi_app=fastapi_app,
        socketio_path="socket.io",
    )
