"""FastAPI 应用工厂：生命周期、Nest 结构错误响应、中间件、健康/指标与 SPA fallback。

设计目标：**前端零改动**。因此本模块严格保持 Nest 侧对外契约：
- 错误响应体 ``{ statusCode, errorCode, apiErrorCode?, error, message, timestamp, path, traceId? }``；
- 路由前缀 ``/api/v1``；根路径 ``GET /health``、``GET /metrics``；
- 静态资源与 SPA fallback 顺序与 Nest ``ServeStaticModule`` + main.ts 一致。
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from http import HTTPStatus
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.gzip import GZipMiddleware

from ._version import load_app_version
from .api.advisor_usage import router as advisor_usage_router
from .api.agent import router as agent_router
from .api.auth import router as auth_router
from .api.channels import router as channels_router
from .api.channels import wecom_router as channels_wecom_router
from .api.client_power import router as client_power_router
from .api.command_proxy import router as command_proxy_router
from .api.earthquake import router as earthquake_router
from .api.embed_proxy import router as embed_proxy_router
from .api.entities import router as entities_router
from .api.events import router as events_router
from .api.home_mode import router as home_mode_router
from .api.license import router as license_router
from .api.mcp import router as mcp_router
from .api.moviepilot_proxy import router as moviepilot_proxy_router
from .api.notification import router as notification_router
from .api.security import router as security_router
from .api.security_panel import router as security_panel_router
from .api.system_access import router as system_access_router
from .api.system_backup import router as system_backup_router
from .api.system_config import router as system_config_router
from .api.system_core import router as system_core_router
from .api.system_lifestyle import router as system_lifestyle_router
from .api.system_ops import router as system_ops_router
from .api.system_setup import router as system_setup_router
from .api.ui_config import router as ui_config_router
from .api.voice import router as voice_router
from .api.ws_proxy import router as ws_proxy_router
from .config import Settings, load_settings
from .core import migrations
from .core.database import Database
from .core.distributed_lock import DistributedLockService
from .core.errors import (
    BusinessException,
    ErrorCode,
    flatten_http_exception_message,
    localize_http_exception_message,
    resolve_api_error_code,
)
from .core.log import configure_app_logging
from .core.observability import (
    decide_metrics_access,
    format_homeos_prometheus_metrics,
    get_trace_id,
    new_request_id,
    reset_trace_id,
    set_trace_id,
)
from .core.redis import RedisService
from .core.runtime_logs import RuntimeLogBuffer, install_runtime_log_handler
from .realtime.domain_events import DomainEventBridge
from .security.body_limit import BodyLimitMiddleware
from .security.cookies import is_https_deploy_mode
from .security.cors import CorsMiddleware
from .security.csrf import CsrfMiddleware
from .security.sessions import SessionRevocation, TokenVersionCache
from .services.agent.area_service import AgentAreaService
from .services.agent.command_cache import CommandCacheService
from .services.agent.config_service import AgentConfigService
from .services.agent.fast_path import FastPathService
from .services.agent.lang_template_service import LangTemplateService
from .services.agent.mcp.mcp_service import McpGatewayService
from .services.agent.providers.resolving_llm_provider import ResolvingLlmProvider
from .services.agent.service import AgentService
from .services.agent.session_store import AgentSessionStoreService
from .services.agent.short_term_memory import AgentShortTermMemoryService
from .services.agent.tools.home_tools_service import HomeToolsService
from .services.app_config import AppConfigBackupService, AppConfigService
from .services.awareness import AdvisorUsageService, TtsSpeakService, VoiceService
from .services.backup import (
    AutoBackupService,
    ServerBackupService,
    SystemBundleBackupService,
    UsersBackupService,
)
from .services.channels import (
    ChannelConfigService,
    ChannelsService,
    EmailService,
    WebPushService,
    WecomService,
)
from .services.child_mode import ChildModeService
from .services.client_power import ClientPowerService
from .services.command_proxy import CommandProxyService
from .services.earthquake import (
    EarthquakeCatalogNotifyService,
    EarthquakeGlobalService,
    EarthquakeService,
    EewLeaderService,
    EewPollService,
)
from .services.event_bus_bridge import EventBusBridge
from .services.event_log import EventLogService
from .services.ha_command_queue import HaCommandQueue
from .services.ha_config import HaEndpointSelector, load_ha_endpoints
from .services.ha_connector import HaConnectorService
from .services.ha_filters import AlertRuleWatchIndex, HaStateChangeRouter
from .services.ha_rest import HaRestClient
from .services.ha_webrtc import HaWebrtcSignalService
from .services.ha_ws import HaWebSocketClient
from .services.home_mode.service import HomeModeService
from .services.jobs import JobRegistryService
from .services.license.service import (
    LICENSE_EXEMPT_EXACT,
    LICENSE_EXEMPT_PREFIX,
    LicenseService,
)
from .services.lifestyle import GuestAccessService, MediaSceneService
from .services.notification.service import NotificationService
from .services.retention.service import DatabaseRetentionService
from .services.security.away_simulation import AwaySimulationService
from .services.security.bus import LocalEventBus
from .services.security.cooldown import NotificationCooldownService
from .services.security.frigate import FrigateService
from .services.security.hazard_drill import HazardDrillService
from .services.security.linkage import SecurityLinkageService
from .services.security.mmwave import MmWavePresenceService
from .services.security.panel import SecurityConfigProvider, SecurityPanelService
from .services.security.presence import PresenceService
from .services.security.service import SecurityService
from .services.setup import SetupWizardService
from .services.state_ingress_coalesce import StateIngressCoalesceService
from .services.state_store.entity_area import EntityAreaEnrichmentService
from .services.state_store.entity_references import EntityReferencesService
from .services.state_store.entity_sync_filter import HaEntitySyncFilterService
from .services.system import DeviceHealthService, DeviceManagementService, SystemService
from .services.system.embed_proxy import EmbedProxyService
from .services.system.ops import ExternalApiService, MoviePilotProxyService
from .services.ui_config import UiConfigService
from .services.weather import WeatherAutoLinkageService, WeatherWatchService

#: 健康检查 DB 探针缓存 TTL：/health 为公开端点，避免高频轮询击穿连接。
DB_PROBE_TTL_SECONDS = 3.0

#: 慢请求阈值（毫秒）。
SLOW_REQUEST_MILLISECONDS = 2000

_SENSITIVE_5XX_MESSAGE = "服务器内部错误"

logger = logging.getLogger("homeos.app")


def _iso_timestamp() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _full_path(request: Request) -> str:
    """等价 Express ``request.url``（路径 + 查询串，不含 scheme/host）。"""
    query = request.url.query
    return f"{request.url.path}?{query}" if query else request.url.path


def _nest_error_payload(
    *,
    status: int,
    error_code: str,
    message: str,
    error: str,
    request: Request,
    trace_id: str | None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "statusCode": status,
        "errorCode": error_code,
        "error": error,
        "message": message,
        "timestamp": _iso_timestamp(),
        "path": _full_path(request),
    }
    api_error_code = resolve_api_error_code(message)
    if api_error_code:
        # 保持与 Nest 一致的字段顺序：apiErrorCode 紧跟在 errorCode 之后。
        payload = {
            "statusCode": status,
            "errorCode": error_code,
            **({"apiErrorCode": api_error_code}),
            "error": error,
            "message": message,
            "timestamp": payload["timestamp"],
            "path": payload["path"],
        }
    if trace_id:
        payload["traceId"] = trace_id
    return payload


def _reason_phrase(status: int) -> str:
    try:
        return HTTPStatus(status).phrase
    except ValueError:
        return "Error"


def _apply_state_change(app: FastAPI, gateway: Any, store: Any, change: dict[str, Any]) -> None:
    """把单条 HA 状态变更落到 L1（同步热路径）。

    旧状态缺失（跨副本瘦负载）时从本地 L1 补全，保证副作用消费者拿到完整变更。
    """
    entity_id = change.get("entity_id")
    if not entity_id:
        return
    if change.get("old_state") is None:
        previous = store.get(str(entity_id))
        if previous is not None:
            change = {**change, "old_state": previous}
    store.apply_change(str(entity_id), change.get("new_state"), change.get("changed_at"))


async def _run_state_change_effects(app: FastAPI, gateway: Any, store: Any, change: dict[str, Any]) -> None:
    """冷路径副作用：儿童模式 / 家庭模式触发 / 安防域 / 通知 / 顾问用量 + WS 广播。"""
    entity_id = change.get("entity_id")
    sync_filter = getattr(app.state, "entity_sync_filter", None)
    if sync_filter is not None and not sync_filter.is_entity_syncable(str(entity_id)):
        return
    _apply_state_change(app, gateway, store, change)
    child_mode = getattr(app.state, "child_mode", None)
    if child_mode is not None:
        try:
            await child_mode.handle_state_change(change)
        except Exception:  # noqa: BLE001 - 儿童模式拦截失败不影响状态广播
            pass
    home_mode = getattr(app.state, "home_mode", None)
    if home_mode is not None:
        try:
            await home_mode.handle_state_trigger(
                {
                    "entity_id": entity_id,
                    "old_state": change.get("old_state"),
                    "new_state": change.get("new_state"),
                }
            )
        except Exception:  # noqa: BLE001 - 家庭模式触发失败不影响状态广播
            pass
    for attr in ("mmwave", "presence", "frigate", "security_panel"):
        service = getattr(app.state, attr, None)
        if service is None:
            continue
        try:
            await service.handle_state_change(change)
        except Exception:  # noqa: BLE001 - 安防域单个服务失败不影响状态广播
            pass
    notification = getattr(app.state, "notification", None)
    if notification is not None:
        # 冷路径副作用：设备健康检查（离线/低电量）与告警规则边沿求值。
        for handler in (
            notification.handle_state_change,
            notification.handle_alert_rule_state_change,
        ):
            try:
                handler(change)
            except Exception:  # noqa: BLE001 - 通知冷路径失败不影响状态广播
                pass
    advisor_usage = getattr(app.state, "advisor_usage", None)
    if advisor_usage is not None:
        try:
            advisor_usage.track_usage(change)
        except Exception:  # noqa: BLE001 - 顾问用量统计失败不影响状态广播
            pass
    await gateway.broadcast_state_changed_batch([change])


def _make_state_listener(app: FastAPI, gateway: Any, store: Any):
    """HA 状态监听：全量快照写入 L1 内存并落 L2；增量变更经事件总线路由（可跨副本）。

    状态变更统一走 ``ha.state_changed.batch`` / ``ha.state_changed`` 事件：
    本进程事件总线负责本地 fan-out，Redis 桥接负责其它副本，二者共用同一处理器，
    避免双写与重复广播。
    """

    async def _listener(kind: str, payload: Any) -> None:
        bus = getattr(app.state, "security_bus", None)
        sync_filter = getattr(app.state, "entity_sync_filter", None)
        redis = getattr(app.state, "redis", None)
        if kind == "initial":
            entities = [
                entity for entity in (payload or []) if isinstance(entity, dict) and entity.get("entity_id")
            ]
            if sync_filter is not None:
                entities = sync_filter.filter_syncable_states(entities)
            store.set_all(entities)
            app.state.ha_entity_count = len(entities)
            # L2 快照：供其它副本 initial_states 引用占位符回拉 / 重启冷恢复
            await store.save_shadow_soon(redis)
            presence = getattr(app.state, "presence", None)
            if presence is not None:
                try:
                    presence.seed_from_state_store()
                except Exception:  # noqa: BLE001 - 在场播种失败不影响状态同步
                    pass
            if bus is not None:
                # 广播全量事件（跨副本超阈值时自动降级为引用占位符）
                await bus.emit("ha.initial_states", {"entities": entities})
            return
        event = payload if isinstance(payload, dict) else {}
        data = event.get("data") if isinstance(event.get("data"), dict) else event
        if not data.get("entity_id"):
            return
        change = {
            "entity_id": data.get("entity_id"),
            "old_state": data.get("old_state"),
            "new_state": data.get("new_state"),
            "changed_at": event.get("time_fired") or data.get("last_changed"),
        }
        if bus is None:
            # 事件总线尚未装配（启动早期）：直接走本地副作用路径
            await _run_state_change_effects(app, gateway, store, change)
            return
        coalesce = getattr(app.state, "state_ingress_coalesce", None)
        if coalesce is not None:
            # 入口微窗口合并（对齐 Nest HaStateIngressCoalesceService）：
            # 同 entity 连续变更在窗口内合并，关键域 / 非合并域立即下发。
            coalesce.enqueue(change)
            return
        await bus.emit("ha.state_changed.batch", {"changes": [change]})

    return _listener


def _make_state_bus_handlers(app: FastAPI, gateway: Any, store: Any) -> dict[str, Any]:
    """构造 HA 事件总线处理器：本进程与 Redis 桥接副本共用同一入口。"""

    async def _handle_state_changed_batch(payload: Any) -> None:
        changes = payload.get("changes") if isinstance(payload, dict) else None
        if not isinstance(changes, list):
            return
        for change in changes:
            if not isinstance(change, dict) or not change.get("entity_id"):
                continue
            await _run_state_change_effects(app, gateway, store, change)

    async def _handle_state_changed(payload: Any) -> None:
        # 单条状态变更（区域补全等本地生产者走这条）→ 复用批量路径
        if isinstance(payload, dict) and payload.get("entity_id"):
            await _run_state_change_effects(app, gateway, store, payload)

    async def _handle_initial_states(payload: Any) -> None:
        # 引用占位符：从 Redis L2 快照冷恢复（对齐 Nest ``loadFromRedisShadowRef``）
        if isinstance(payload, dict) and payload.get("_bridgeType") == "initial_states_ref":
            redis = getattr(app.state, "redis", None)
            sync_filter = getattr(app.state, "entity_sync_filter", None)
            restored = await store.recover_initial_states_if_needed(redis, sync_filter)
            if restored:
                app.state.ha_entity_count = store.get_count()
                presence = getattr(app.state, "presence", None)
                if presence is not None:
                    try:
                        presence.seed_from_state_store()
                    except Exception:  # noqa: BLE001
                        pass
            return
        entities = payload.get("entities") if isinstance(payload, dict) else None
        if not isinstance(entities, list):
            return
        sync_filter = getattr(app.state, "entity_sync_filter", None)
        if sync_filter is not None:
            entities = sync_filter.filter_syncable_states(entities)
        store.set_all(entities)
        app.state.ha_entity_count = len(entities)

    return {
        "ha.state_changed": _handle_state_changed,
        "ha.state_changed.batch": _handle_state_changed_batch,
        "ha.initial_states": _handle_initial_states,
    }


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or load_settings()
    version = load_app_version()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app_settings.data_dir.mkdir(parents=True, exist_ok=True)
        migration_backup = migrations.run_migrations(app_settings)
        app.state.database = Database(app_settings.database_url)
        app.state.settings = app_settings
        app.state.version = version
        app.state.started_at = time.monotonic()
        app.state.db_probe = None  # (at, ok)

        # -------------------------------------------------------------- #
        # 运行日志环形缓冲：镜像 homeos 日志树，供 /system/runtime-logs 查询
        # -------------------------------------------------------------- #
        configure_app_logging()
        app.state.runtime_logs = RuntimeLogBuffer()
        install_runtime_log_handler(app.state.runtime_logs)

        # 调度作业注册中心：/system/jobs 诊断面板数据源
        app.state.jobs = JobRegistryService()

        # -------------------------------------------------------------- #
        # 应用配置（运行参数）：内存缓存 + DB 持久化 + 脱敏 + 审计
        # -------------------------------------------------------------- #
        app_config = AppConfigService(app.state.database.session_factory)
        app_config.start()
        app.state.app_config = app_config
        app.state.app_config_backup = AppConfigBackupService(app_config)

        # 商业授权：联网租约模型（Ed25519 验签 + X25519 加密传输 + 本地凭证加密）。
        license_service = LicenseService(internal_dir=str(app_settings.data_dir / ".internal"))
        app.state.license = license_service

        # 数据保留：策略面板 + 分批清理（首次延迟 + 周期调度在此接入）
        database_retention = DatabaseRetentionService(
            app.state.database.session_factory, app_config, jobs=app.state.jobs
        )
        database_retention.start()
        await database_retention.start_schedule()
        app.state.database_retention = database_retention
        # 基础设施：Redis（可缺省）→ 会话吊销 / tokenVersion 缓存（内存降级）
        redis = RedisService(app_settings.redis_url)
        await redis.connect()
        app.state.redis = redis
        # 分布式锁（保留清理 / 分区维护 / 遗忘检测等跨副本互斥；Redis 不可用降级进程内锁）
        distributed_lock = DistributedLockService(redis)
        app.state.distributed_lock = distributed_lock
        database_retention.lock = distributed_lock
        database_retention.redis = redis
        app.state.session_revocation = SessionRevocation(redis)
        app.state.token_version_cache = TokenVersionCache(redis)
        # Phase 3+ 会在此装配 license / ha-connector / socketio 网关。
        # 事件日志：订阅 HA 冷批状态变更，内存缓冲后批量落库（socketio 网关在广播时喂入）。
        event_log_service = EventLogService(app.state.database, redis)
        event_log_service.bind_loop(asyncio.get_running_loop())
        app.state.event_log = event_log_service

        # -------------------------------------------------------------- #
        # HA 连接器：REST + WebSocket + 断连命令队列 + WebRTC 信令
        # -------------------------------------------------------------- #
        def _endpoint_loader():
            with app.state.database.session_factory() as session:
                return load_ha_endpoints(session)

        # 主/备故障转移选择器：REST 与 WS 共用，保证始终打到当前 active 地址。
        ha_endpoint_selector = HaEndpointSelector(_endpoint_loader)
        app.state.ha_endpoints = ha_endpoint_selector

        async def _voice_rest_config() -> dict[str, Any]:
            """HA Assist 对话接口所需的 ``{haUrl, token}``（对齐 ``getConfigForRest``）。"""
            endpoints_now = ha_endpoint_selector.resolve()
            return {"haUrl": endpoints_now.ha_url_primary, "token": endpoints_now.token}

        ha_rest = HaRestClient(ha_endpoint_selector.resolve)
        gateway = app.state.realtime
        state_store = gateway.state_store
        # 实体同步过滤共享视图：由 HaConnector 在注册表加载后 configure（对齐 Nest）。
        entity_sync_filter = HaEntitySyncFilterService()
        app.state.entity_sync_filter = entity_sync_filter

        async def _send_via_ws(
            domain: str, service: str, entity_id: str, service_data, return_response: bool
        ):
            return await ha_connector._call_service_immediate(  # noqa: SLF001
                domain, service, entity_id, service_data, return_response
            )

        command_queue = HaCommandQueue(sender=_send_via_ws, is_connected=lambda: ha_ws.is_connected())

        async def _bus_emit(name: str, payload: dict[str, Any] | None = None) -> None:
            bus = getattr(app.state, "security_bus", None)
            if bus is not None:
                await bus.emit(name, payload or {})
            else:
                bridge = getattr(app.state, "event_bus_bridge", None)
                if bridge is not None:
                    await bridge.publish(name, payload or {})

        async def _on_ws_connected() -> None:
            app.state.ha_connected = True
            app.state.ha_version = ha_ws.ha_version
            state_store.handle_ha_connected()
            await ha_connector.on_ws_connected()
            await _bus_emit("ha.connected", {"ha_version": ha_ws.ha_version})

        async def _on_ws_disconnected() -> None:
            app.state.ha_connected = False
            state_store.handle_ha_disconnected()
            ha_connector.on_ws_disconnected()
            await _bus_emit("ha.disconnected", {})

        async def _on_ws_reconnecting(attempt: int) -> None:
            app.state.ha_reconnect_attempt = attempt
            await _bus_emit("ha.reconnecting", {"attempt": attempt})

        async def _on_ws_event(event) -> None:
            await ha_connector.dispatch_state_event(event)

        ha_ws = HaWebSocketClient(
            ha_endpoint_selector,
            on_event=_on_ws_event,
            on_connected=_on_ws_connected,
            on_disconnected=_on_ws_disconnected,
            on_reconnecting=_on_ws_reconnecting,
        )
        ha_connector = HaConnectorService(ha_ws, ha_rest, state_store=state_store, command_queue=command_queue)
        ha_connector.set_state_listener(_make_state_listener(app, gateway, state_store))
        app.state.ha_ws = ha_ws
        app.state.ha_rest = ha_rest
        app.state.ha_command_queue = command_queue
        app.state.ha_connector = ha_connector
        app.state.entity_area = EntityAreaEnrichmentService(ha_connector, state_store)
        ha_connector.attach_sync_filter(
            entity_sync_filter,
            lambda: bool((app_config.get("haConnector") or {}).get("syncOnlyEnabledEntities", True)),
        )
        app.state.ha_webrtc = HaWebrtcSignalService(ha_ws, app.state.database.session_factory)
        app.state.command_proxy = CommandProxyService(app.state.database.session_factory, ha_connector, redis)
        child_mode = ChildModeService(app.state.database.session_factory, ha_connector, jobs=app.state.jobs)
        await child_mode.start()
        app.state.child_mode = child_mode
        app.state.child_mode_gate = child_mode

        # -------------------------------------------------------------- #
        # 安防域：事件总线 / 冷却 / 面板 / 在场 / Frigate / 离家模拟 / 演习
        # -------------------------------------------------------------- #
        security_bus = LocalEventBus()
        # 回填事件总线：让 app_config 更新后广播 app.config.updated（各域热更新订阅依赖）
        app_config.set_event_bus(security_bus)
        # HA 入口微窗口合并（对齐 Nest HaStateIngressCoalesceService）
        state_ingress_coalesce = StateIngressCoalesceService(
            app.state.database.session_factory,
            security_bus,
            entity_sync_filter,
        )
        state_ingress_coalesce.bind_loop(asyncio.get_running_loop())
        security_bus.on("app.config.updated", lambda _p=None: state_ingress_coalesce.invalidate_config())
        app.state.state_ingress_coalesce = state_ingress_coalesce
        # HA 连接器 / 实体区域补全：注册表变更与初始状态事件处理器
        ha_connector.attach_event_bus(security_bus)
        app.state.entity_area.attach_event_bus(security_bus)
        # 统一事件总线：Redis Pub/Sub 跨副本桥接（对齐 Nest EventBusService）
        event_bus_bridge = EventBusBridge(security_bus, redis)
        await event_bus_bridge.start()
        app.state.event_bus_bridge = event_bus_bridge

        # HA 状态 / 连接事件处理器：本进程与 Redis 桥接副本共用同一入口
        async def _on_ha_connected(payload: Any) -> None:
            state_store.handle_ha_connected()
            data = payload if isinstance(payload, dict) else {}
            await gateway.broadcast_ha_status("connected", ha_version=data.get("ha_version"))

        async def _on_ha_disconnected(_payload: Any = None) -> None:
            state_store.handle_ha_disconnected()
            await gateway.broadcast_ha_status("disconnected")
            await gateway.broadcast_entities_stale("ha_disconnected")

        async def _on_ha_reconnecting(payload: Any) -> None:
            data = payload if isinstance(payload, dict) else {}
            await gateway.broadcast_ha_status("reconnecting", attempt=data.get("attempt"))

        async def _on_redis_status(_payload: Any = None) -> None:
            redis_service = getattr(app.state, "redis", None)
            await gateway.broadcast_redis_status(
                bool(redis_service and redis_service.is_configured()),
                bool(redis_service and redis_service.is_ready()),
            )

        state_handlers = _make_state_bus_handlers(app, gateway, state_store)
        for event, handler in {
            **state_handlers,
            "ha.connected": _on_ha_connected,
            "ha.disconnected": _on_ha_disconnected,
            "ha.reconnecting": _on_ha_reconnecting,
            "redis.status": _on_redis_status,
        }.items():
            security_bus.on(event, handler)

        # Redis 连接状态就绪后广播一次（对齐 Nest REDIS_STATUS 桥接事件）
        await security_bus.emit("redis.status", {"configured": redis.is_configured(), "ready": redis.is_ready()})

        security_config = SecurityConfigProvider(app.state.database.session_factory)
        cooldown = NotificationCooldownService(security_bus)
        database_retention.cooldown = cooldown
        mmwave = MmWavePresenceService(security_bus)
        presence = PresenceService(
            app.state.database.session_factory,
            security_bus,
            security_config.get,
            state_store,
            mmwave,
            jobs=app.state.jobs,
        )
        security_service = SecurityService(app.state.database.session_factory)
        away_sim = AwaySimulationService(
            app.state.database.session_factory, ha_connector, security_bus, redis, security_config.get
        )
        security_panel = SecurityPanelService(
            app.state.database.session_factory, ha_connector, security_bus, cooldown, security_config
        )
        frigate = FrigateService(
            app.state.database.session_factory, security_bus, security_panel, security_config.get, redis
        )
        hazard_drill = HazardDrillService(app.state.database.session_factory, security_bus, ha_connector)

        app.state.security_bus = security_bus

        # -------------------------------------------------------------- #
        # UI 配置域：布局方案 / 终端绑定 / 静态资源
        # -------------------------------------------------------------- #
        ui_config = UiConfigService(
            app.state.database.session_factory,
            app_config,
            event_bus=security_bus,
        )
        ui_config._static_assets.ensure_dirs()  # noqa: SLF001 - 启动时确保资源目录存在
        app.state.ui_config = ui_config

        # -------------------------------------------------------------- #
        # 系统域：版本 / 健康 / 网络信息 + 设备管理（僵尸绑定扫描与解绑）
        # -------------------------------------------------------------- #
        app.state.system_service = SystemService(app_settings, ui_config)
        app.state.device_health = DeviceHealthService(state_store)
        app.state.device_management = DeviceManagementService(
            app.state.database.session_factory, state_store, ui_config, ha_connector
        )

        # -------------------------------------------------------------- #
        # 生活方式域：访客临时密码 + 影音场景
        # -------------------------------------------------------------- #
        media_scene = MediaSceneService(ha_connector, app_config)
        media_scene.start()
        app.state.media_scene = media_scene

        guest_access = GuestAccessService(
            ha_connector,
            security_bus,
            app_config,
            app.state.database.session_factory,
        )
        guest_access.bind_events()
        await guest_access.start()
        app.state.guest_access = guest_access

        # -------------------------------------------------------------- #
        # 系统运维域：外部数据源（天气/电价/日历）+ MoviePilot 透明代理 + 内嵌反代
        # -------------------------------------------------------------- #
        external_api = ExternalApiService(
            app_config,
            event_bus=security_bus,
            redis=redis,
            jobs=app.state.jobs,
            state_store=state_store,
        )
        external_api.start()
        app.state.external_api = external_api

        app.state.moviepilot_proxy = MoviePilotProxyService(ui_config)
        app.state.embed_proxy = EmbedProxyService(ui_config, app_settings)

        # -------------------------------------------------------------- #
        # 备份与还原：完整备份包 / 服务器备份文件 / 定时自动备份
        # -------------------------------------------------------------- #
        users_backup = UsersBackupService(
            app.state.database.session_factory, app.state.token_version_cache
        )
        bundle_backup = SystemBundleBackupService(
            ui_config,
            app.state.app_config_backup,
            users_backup,
            app.state.database.session_factory,
        )
        server_backup = ServerBackupService(bundle_backup)
        auto_backup = AutoBackupService(app_config, server_backup, redis)
        app.state.users_backup = users_backup
        app.state.bundle_backup = bundle_backup
        app.state.server_backup = server_backup
        app.state.auto_backup = auto_backup
        auto_backup.start()

        # -------------------------------------------------------------- #
        # 首装向导：进度 / 引导清单 / 绑定缺口 / 配置健康评分
        # -------------------------------------------------------------- #
        app.state.setup_wizard = SetupWizardService(
            app_config,
            app.state.database.session_factory,
            ha_connector,
            state_store,
            redis,
        )

        # 布局 HA 配置变更 → 按指纹重连 HA（对齐 Nest SYSTEM_CONFIG_UPDATED 监听）
        _boot_endpoints = _endpoint_loader()
        _ha_fingerprint = {
            "value": "|".join(
                [
                    _boot_endpoints.ha_url_primary,
                    _boot_endpoints.ha_url_fallback,
                    _boot_endpoints.token,
                ]
            )
        }

        async def _on_system_config_updated(_payload: Any = None) -> None:
            endpoints_now = _endpoint_loader()
            fingerprint = "|".join(
                [endpoints_now.ha_url_primary, endpoints_now.ha_url_fallback, endpoints_now.token]
            )
            if fingerprint == _ha_fingerprint["value"]:
                return
            _ha_fingerprint["value"] = fingerprint
            # HA 地址/令牌变更：失效端点缓存并从局域网重新试起（对齐 Nest resetFailover）
            ha_endpoint_selector.invalidate_cache()
            ha_endpoint_selector.reset_failover()
            app.state.ha_configured = bool(endpoints_now.ha_url_primary and endpoints_now.token)
            if not app.state.ha_configured:
                return
            try:
                await ha_connector.stop()
                await ha_connector.start()
                logger.info("HA 连接配置变更，已按新地址重连")
            except Exception as exc:  # noqa: BLE001 - 重连失败不应影响主流程
                logger.warning("HA 重连失败: %s", exc)

        security_bus.on("SYSTEM_CONFIG_UPDATED", _on_system_config_updated)
        app.state.security_config = security_config
        app.state.security_cooldown = cooldown
        app.state.mmwave = mmwave
        app.state.presence = presence
        app.state.security_service = security_service
        app.state.away_sim = away_sim
        app.state.frigate = frigate
        app.state.hazard_drill = hazard_drill
        app.state.security_panel = security_panel

        await security_panel.start()
        await frigate.start()
        await away_sim.start()
        await presence.start()

        # 家庭模式：CRUD / 激活 / 触发器 / 预设 / 运行日志
        async def _emit_home_mode_event(name: str, payload: dict[str, Any]) -> None:
            # 走统一事件总线：本进程分发（WS fan-out）+ Redis 跨副本桥接
            await security_bus.emit(name, payload)

        def _set_security_mode(mode: str, source: str):
            panel = getattr(app.state, "security_panel", None)
            if panel is None:
                return {"success": True, "skipped": True}
            return panel.set_mode(mode, source)

        home_mode = HomeModeService(
            app.state.database.session_factory,
            ha_connector,
            state_store,
            child_mode_gate=child_mode,
            set_security_mode=_set_security_mode,
            emit_event=_emit_home_mode_event,
            is_leader=lambda: True,
            jobs=app.state.jobs,
        )
        await home_mode.start()
        app.state.home_mode = home_mode

        # 跨模块联动：presence / calendar / 安防模式 → 家庭模式 + 离家模拟
        security_linkage = SecurityLinkageService(
            app.state.database.session_factory,
            security_bus,
            security_panel,
            away_sim,
            home_mode,
            child_mode,
            security_config.get,
        )
        app.state.security_linkage = security_linkage

        # -------------------------------------------------------------- #
        # 智能管家域：LLM 工具调用 / 快路径 / 命令缓存 / 会话记忆 + MCP 网关
        # -------------------------------------------------------------- #
        agent_config = AgentConfigService(
            app.state.database.session_factory,
            app_config,
            event_bus=security_bus,
        )
        agent_config.bind_events()
        app.state.agent_config = agent_config

        lang_templates = LangTemplateService(agent_config, event_bus=security_bus)
        await lang_templates.init()
        app.state.agent_lang_templates = lang_templates

        agent_area = AgentAreaService(app.state.entity_area, state_store)

        home_tools = HomeToolsService(
            state_store,
            app.state.command_proxy,
            agent_area,
            ui_config,
            app_config,
            child_mode,
            ha_connector,
            home_mode,
            app.state.database.session_factory,
            external_api,
            agent_config,
        )
        app.state.home_tools = home_tools

        fast_path = FastPathService(
            agent_area,
            state_store,
            lang_templates,
            event_bus=security_bus,
            agent_config=agent_config,
        )
        fast_path.bind_events()
        app.state.agent_fast_path = fast_path

        command_cache = CommandCacheService(redis)
        await command_cache.init()
        app.state.agent_command_cache = command_cache

        # 会话记忆分两层：10 分钟长会话（Redis 持久化）+ 45s 短时滑窗（纯内存）
        agent_sessions = AgentSessionStoreService(redis)
        await agent_sessions.init()
        app.state.agent_sessions = agent_sessions
        app.state.agent_short_term = AgentShortTermMemoryService()

        llm_provider = ResolvingLlmProvider(agent_config, event_bus=security_bus)
        llm_provider.bind_events()
        await llm_provider.refresh()
        app.state.agent_llm_provider = llm_provider

        agent_service = AgentService(
            llm_provider,
            home_tools,
            fast_path,
            command_cache,
            lang_templates,
            agent_config,
            agent_sessions,
            app.state.agent_short_term,
        )
        app.state.agent_service = agent_service

        app.state.mcp_gateway = McpGatewayService(
            agent_service,
            home_tools,
            agent_config,
            app.state.database.session_factory,
            env=os.environ,
            server_version=version,
        )

        # -------------------------------------------------------------- #
        # 消息通道：Email / WebPush / 企业微信（Phase 6）
        # -------------------------------------------------------------- #
        channel_config = ChannelConfigService(ui_config, event_bus=security_bus)
        channel_config.bind_events()
        app.state.channel_config = channel_config

        email_service = EmailService(channel_config, event_bus=security_bus)
        email_service.bind_events()
        await email_service.reload()
        app.state.email_service = email_service

        web_push_service = WebPushService(
            channel_config, app.state.database.session_factory, event_bus=security_bus
        )
        web_push_service.bind_events()
        await web_push_service.start()
        app.state.web_push_service = web_push_service

        wecom_service = WecomService(channel_config, event_bus=security_bus)
        wecom_service.bind_events()
        await wecom_service.start()
        app.state.wecom_service = wecom_service

        channels_service = ChannelsService(
            email_service,
            web_push_service,
            wecom_service,
            agent_service,
            channel_config,
            app.state.database.session_factory,
        )
        channels_service.start()
        app.state.channels_service = channels_service

        # -------------------------------------------------------------- #
        # 客户端电量联动（Phase 6）
        # -------------------------------------------------------------- #
        client_power = ClientPowerService(
            app_config,
            app.state.database.session_factory,
            ha_connector,
            security_bus,
            cooldown,
            jobs=app.state.jobs,
        )
        await client_power.start()
        app.state.client_power = client_power

        # -------------------------------------------------------------- #
        # 通知域：站内通知 / 告警规则 / 偏好 / 领域事件订阅
        # -------------------------------------------------------------- #
        notification = NotificationService(
            app.state.database.session_factory,
            event_bus=security_bus,
            redis=redis,
            cooldown_service=cooldown,
            token_version_cache=app.state.token_version_cache,
            channels_service=channels_service,  # Phase 6：Email / WebPush / 企微 外部通知
            ha_areas_provider=lambda: (app.state.entity_area.get_cached_ha_areas() if hasattr(app.state, "entity_area") else []),
        )
        notification.bind_events()
        await notification.start()
        app.state.notification = notification

        # -------------------------------------------------------------- #
        # 实体反向引用：布局 / 家庭模式 / 告警规则 / 系统配置 的「哪些功能引用了该实体」
        # -------------------------------------------------------------- #
        alert_rule_watch_index = AlertRuleWatchIndex()
        app.state.alert_rule_watch_index = alert_rule_watch_index
        app.state.entity_references = EntityReferencesService(
            app.state.database.session_factory,
            app_config,
            ui_config,
            alert_rule_watch_index,
        )

        # 语音播报服务：领域事件（tts.speak）与语音链路共用，需先于 WS 广播桥创建
        tts_speak = TtsSpeakService(app_config, ha_connector)
        app.state.tts_speak = tts_speak
        security_bus.on("app.config.updated", tts_speak.on_config_updated)
        # 数据保留：ops 变更时热更新清理周期 / 首次延迟
        security_bus.on("app.config.updated", database_retention.on_config_updated)

        # 领域事件 → WS 客户端广播（对齐 ws-push domain-events helper 全量事件集）
        domain_events = DomainEventBridge(security_bus, gateway, tts_speak)
        domain_events.bind()
        app.state.domain_events = domain_events

        # -------------------------------------------------------------- #
        # 语音 / 智能顾问用量（Phase 6：awareness）
        # -------------------------------------------------------------- #
        voice_service = VoiceService(
            app_config=app_config,
            ha_connector=ha_connector,
            command_proxy=app.state.command_proxy,
            child_mode=child_mode,
            home_mode=home_mode,
            state_store=state_store,
            entity_area=app.state.entity_area,
            tts_speak=tts_speak,
            session_factory=app.state.database.session_factory,
            agent_service=agent_service,
            get_ha_rest_config=_voice_rest_config,
            version=version,
        )
        app.state.voice = voice_service

        advisor_usage = AdvisorUsageService(
            app_config=app_config,
            ha_connector=ha_connector,
            state_store=state_store,
            state_router=HaStateChangeRouter(AlertRuleWatchIndex()),
            entity_area=app.state.entity_area,
            session_factory=app.state.database.session_factory,
            event_bus=security_bus,
            jobs=app.state.jobs,
            lock=app.state.distributed_lock,
        )
        await advisor_usage.start()
        app.state.advisor_usage = advisor_usage
        security_bus.on("app.config.updated", advisor_usage.on_app_config_updated)
        # HA 连上后重建房间设备映射：启动期 HA 未就绪会拿到空映射（见 build_room_device_map_from_config）
        security_bus.on("ha.connected", advisor_usage.on_ha_connected)

        # -------------------------------------------------------------- #
        # 天气预警监听 + 极端天气安全联动（Phase 6：weather）
        # -------------------------------------------------------------- #
        weather_watch = WeatherWatchService(
            external_api=external_api,
            notification=notification,
            redis=redis,
            jobs=app.state.jobs,
            app_config=app_config,
            event_bus=security_bus,
        )
        await weather_watch.start()
        app.state.weather_watch = weather_watch

        weather_linkage = WeatherAutoLinkageService(
            app_config=app_config,
            session_factory=app.state.database.session_factory,
            cooldown_service=cooldown,
            ha_connector=ha_connector,
            home_mode=home_mode,
            notification=notification,
        )
        security_bus.on("weather.alert", weather_linkage.on_weather_alert)
        app.state.weather_linkage = weather_linkage

        # -------------------------------------------------------------- #
        # 地震预警（Phase 6）：Wolfx WS + SC/CENC 轮询 + 目录 + 全球目录
        # -------------------------------------------------------------- #
        eew_leader = EewLeaderService(redis)
        await eew_leader.start()
        app.state.eew_leader = eew_leader

        earthquake = EarthquakeService(
            event_bus=security_bus,
            redis=redis,
            session_factory=app.state.database.session_factory,
            leader=eew_leader,
            jobs=app.state.jobs,
            get_ha_rest_config=_voice_rest_config,
        )
        app.state.earthquake = earthquake

        earthquake_global = EarthquakeGlobalService(redis, earthquake)
        app.state.earthquake_global = earthquake_global

        eew_poll = EewPollService(earthquake, eew_leader, app.state.jobs)
        app.state.eew_poll = eew_poll

        catalog_notify = EarthquakeCatalogNotifyService(
            earthquake,
            earthquake_global,
            eew_leader,
            notification,
            cooldown,
            redis,
            app.state.jobs,
        )
        app.state.earthquake_catalog_notify = catalog_notify

        await earthquake.start()
        await eew_poll.start()
        await catalog_notify.start()

        endpoints = _endpoint_loader()
        app.state.ha_configured = bool(endpoints.ha_url_primary and endpoints.token)
        app.state.ha_connected = False
        app.state.ha_version = None
        if app.state.ha_configured:
            try:
                await ha_connector.start()
            except Exception as exc:  # noqa: BLE001 - HA 不可用不应阻塞启动
                import logging as _logging

                _logging.getLogger("homeos.app").warning("HA 连接器启动失败: %s", exc)

        # 商业授权：门禁自举（公钥取回 / 状态恢复 / 续租循环）。
        await license_service.start()

        try:
            yield
        finally:
            try:
                await asyncio.wait_for(license_service.stop(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            try:
                await asyncio.wait_for(database_retention.stop_schedule(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            try:
                await asyncio.wait_for(guest_access.stop(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            try:
                await asyncio.wait_for(external_api.stop(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            for service in (presence, mmwave, away_sim):
                try:
                    await asyncio.wait_for(service.stop(), timeout=5)
                except Exception:  # noqa: BLE001
                    pass
            try:
                await asyncio.wait_for(child_mode.stop(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            try:
                await asyncio.wait_for(home_mode.stop(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            try:
                await asyncio.wait_for(notification.stop(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            try:
                for service in (catalog_notify, eew_poll, earthquake, eew_leader):
                    await asyncio.wait_for(service.stop(), timeout=5)
            except Exception:  # noqa: BLE001 - 启动早期失败时变量可能未定义
                pass
            for service in (weather_watch, advisor_usage):
                try:
                    await asyncio.wait_for(service.stop(), timeout=5)
                except Exception:  # noqa: BLE001
                    pass
            try:
                await asyncio.wait_for(event_bus_bridge.stop(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            try:
                await asyncio.wait_for(ha_connector.stop(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            try:
                await asyncio.wait_for(state_ingress_coalesce.close(), timeout=5)
            except Exception:  # noqa: BLE001 - 关机刷新合并窗口残留事件
                pass
            try:
                await asyncio.wait_for(event_log_service.flush(), timeout=5)
            except Exception:  # noqa: BLE001 - 关机 flush 失败不阻塞退出
                pass
            await redis.close()
            auto_backup.stop()
            database = getattr(app.state, "database", None)
            if database is not None:
                database.dispose()
        _ = migration_backup

    app = FastAPI(
        title="HomeOS",
        version=version,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = app_settings

    # ------------------------------------------------------------------ #
    # 异常处理：统一输出 Nest 结构
    # ------------------------------------------------------------------ #
    def _business_exception_json(request: Request, exc: BusinessException) -> JSONResponse:
        status = exc.status_code
        message = exc.message
        error_code = str(exc.error_code)
        error = _SENSITIVE_5XX_MESSAGE
        message = localize_http_exception_message(message, status, error)
        display = _SENSITIVE_5XX_MESSAGE if status >= 500 and app_settings.is_production else message
        trace_id = get_trace_id() or request.headers.get("x-trace-id")
        return JSONResponse(
            status_code=status,
            content=_nest_error_payload(
                status=status,
                error_code=error_code,
                message=display,
                error=error,
                request=request,
                trace_id=trace_id,
            ),
        )

    @app.exception_handler(BusinessException)
    async def _business_exception(request: Request, exc: BusinessException):
        return _business_exception_json(request, exc)

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception(request: Request, exc: StarletteHTTPException):
        status = exc.status_code
        raw_detail = exc.detail
        if isinstance(raw_detail, (list, tuple)):
            message = flatten_http_exception_message(list(raw_detail), _reason_phrase(status))
        elif isinstance(raw_detail, str):
            message = raw_detail
        else:
            message = str(raw_detail) if raw_detail is not None else _reason_phrase(status)
        error = getattr(exc, "error_name", None) or _reason_phrase(status)
        error_code = str(ErrorCode.UNKNOWN)
        message = localize_http_exception_message(message, status, error)
        display = _SENSITIVE_5XX_MESSAGE if status >= 500 and app_settings.is_production else message
        trace_id = get_trace_id() or request.headers.get("x-trace-id")
        return JSONResponse(
            status_code=status,
            content=_nest_error_payload(
                status=status,
                error_code=error_code,
                message=display,
                error=error,
                request=request,
                trace_id=trace_id,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        # 复刻 Nest ValidationPipe：400 + 展平后的 message 数组。
        status = 400
        parts: list[str] = []
        for item in exc.errors():
            loc = ".".join(str(part) for part in item.get("loc", []) if part != "body")
            msg = str(item.get("msg", "")).replace("Value error, ", "")
            parts.append(f"{loc}: {msg}" if loc else msg)
        message = "；".join(dict.fromkeys(parts)) or "请求无效"
        message = localize_http_exception_message(message, status, "Bad Request")
        trace_id = get_trace_id() or request.headers.get("x-trace-id")
        return JSONResponse(
            status_code=status,
            content=_nest_error_payload(
                status=status,
                error_code=str(ErrorCode.UNKNOWN),
                message=message,
                error="Bad Request",
                request=request,
                trace_id=trace_id,
            ),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, _exc: Exception):
        status = 500
        trace_id = get_trace_id() or request.headers.get("x-trace-id")
        return JSONResponse(
            status_code=status,
            content=_nest_error_payload(
                status=status,
                error_code=str(ErrorCode.UNKNOWN),
                message=_SENSITIVE_5XX_MESSAGE,
                error=_SENSITIVE_5XX_MESSAGE,
                request=request,
                trace_id=trace_id,
            ),
        )

    # ------------------------------------------------------------------ #
    # 中间件（由内到外：先注册的在最内层）
    # ------------------------------------------------------------------ #
    @app.middleware("http")
    async def record_request_diagnostics(request: Request, call_next):
        started = time.monotonic()
        trace_id = request.headers.get("x-trace-id") or new_request_id()
        token = set_trace_id(trace_id)
        request.state.trace_id = trace_id
        try:
            response = await call_next(request)
        finally:
            reset_trace_id(token)
        response.headers["X-Request-ID"] = trace_id
        _ = round((time.monotonic() - started) * 1000, 1)
        return response

    # 商业授权门禁（等价 Nest APP_GUARD LicenseGuard）：LICENSE_REQUIRED=1 时，
    # 除白名单外所有 HTTP 请求必须处于激活有效期；中间件内直接输出 Nest 错误信封。
    @app.middleware("http")
    async def license_guard(request: Request, call_next):
        service = getattr(request.app.state, "license", None)
        if service is not None and service.is_license_required():
            path = request.url.path
            exempt = path in LICENSE_EXEMPT_EXACT or path.startswith(LICENSE_EXEMPT_PREFIX)
            if not exempt:
                try:
                    service.validate_access()
                except BusinessException as exc:
                    return _business_exception_json(request, exc)
        return await call_next(request)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        # 对齐 Nest Helmet 配置（contentSecurityPolicy/crossOriginOpenerPolicy/
        # crossOriginEmbedderPolicy/originAgentCluster 关闭；CSP 关闭；CORP=cross-origin）。
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-DNS-Prefetch-Control", "off")
        response.headers.setdefault("X-Download-Options", "noopen")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
        response.headers.setdefault("X-XSS-Protection", "0")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "cross-origin")
        # HTTPS 反代部署（COOKIE_SECURE=true）时启用 HSTS，与 Nest 一致
        if is_https_deploy_mode():
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=15552000; includeSubDomains"
            )
        return response

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
        except Exception:  # noqa: BLE001 - 探针失败即视为不健康
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
        return {
            "status": "ok" if db_ok and not redis_degraded else "degraded",
            "redis_ok": redis_ready if redis_configured else None,
            "redis": {"configured": redis_configured, "ready": redis_ready},
            "ha_registry_available": ha_registry_available,
            "timestamp": _iso_timestamp(),
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
            uptime_seconds=int(time.monotonic() - getattr(request.app.state, "started_at", time.monotonic())),
        )
        return Response(
            content=body,
            media_type="text/plain; version=0.0.4; charset=utf-8",
            headers={"Cache-Control": "no-store"},
        )

    # ------------------------------------------------------------------ #
    # 业务路由（/api/v1）——必须在 SPA catch-all 之前注册
    # ------------------------------------------------------------------ #
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(agent_router, prefix="/api/v1")
    app.include_router(embed_proxy_router, prefix="/api/v1")
    app.include_router(entities_router, prefix="/api/v1")
    app.include_router(events_router, prefix="/api/v1")
    app.include_router(command_proxy_router, prefix="/api/v1")
    app.include_router(channels_router, prefix="/api/v1")
    app.include_router(channels_wecom_router, prefix="/api/v1")
    app.include_router(client_power_router, prefix="/api/v1")
    app.include_router(earthquake_router, prefix="/api/v1")
    app.include_router(home_mode_router, prefix="/api/v1")
    app.include_router(license_router, prefix="/api/v1")
    app.include_router(mcp_router, prefix="/api/v1")
    app.include_router(moviepilot_proxy_router, prefix="/api/v1")
    app.include_router(notification_router, prefix="/api/v1")
    app.include_router(security_router, prefix="/api/v1")
    app.include_router(security_panel_router, prefix="/api/v1")
    app.include_router(system_access_router, prefix="/api/v1")
    app.include_router(system_backup_router, prefix="/api/v1")
    app.include_router(system_config_router, prefix="/api/v1")
    app.include_router(system_core_router, prefix="/api/v1")
    app.include_router(system_lifestyle_router, prefix="/api/v1")
    app.include_router(system_ops_router, prefix="/api/v1")
    app.include_router(system_setup_router, prefix="/api/v1")
    app.include_router(ui_config_router, prefix="/api/v1")
    app.include_router(voice_router, prefix="/api/v1")
    app.include_router(advisor_usage_router, prefix="/api/v1")
    app.include_router(ws_proxy_router, prefix="/api/v1")

    # 中间件顺序（后注册者在外层）：CSRF 内层、压缩 / 请求体门禁 / CORS 依次在外。
    app.add_middleware(
        CsrfMiddleware,
        cookie_name=app_settings.csrf_cookie_name,
        header_name=app_settings.csrf_header_name,
    )
    app.add_middleware(CorsMiddleware)
    # 对齐 Nest ``compression()``：默认阈值 1KB。
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    # 对齐 Nest body-parser limit：公共端点 1MB、其余 50MB。
    app.add_middleware(
        BodyLimitMiddleware,
        public_max_bytes=app_settings.public_body_limit_bytes,
        authenticated_max_bytes=app_settings.authenticated_body_limit_bytes,
        build_payload=_nest_error_payload,
    )

    # ------------------------------------------------------------------ #
    # 实时网关（Socket.IO + msgpack）：实例挂在 app.state，供 create_asgi_app 包装
    # ------------------------------------------------------------------ #
    from .realtime.gateway import create_realtime_gateway

    app.state.realtime = create_realtime_gateway(app)

    # ------------------------------------------------------------------ #
    # 静态资源 + SPA fallback（顺序与 Nest ServeStaticModule 一致）
    # ------------------------------------------------------------------ #
    static_dir = app_settings.frontend_dir / "static"
    if static_dir.is_dir():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    # 可替换静态资源（平面图 / 图标 / 背景图 / 房间图 / 音效 / Logo）。
    # 与 Nest ServeStaticModule 的 fallthrough:false 一致：文件不存在直接 404，不落入 SPA。
    from .core.asset_paths import (
        get_backgrounds_dir,
        get_floorplans_dir,
        get_icons_dir,
        get_logo_dir,
        get_room_images_dir,
        get_sounds_dir,
    )

    for mount_path, asset_dir in (
        ("/floorplans", get_floorplans_dir()),
        ("/icons", get_icons_dir()),
        ("/backgrounds", get_backgrounds_dir()),
        ("/room_images", get_room_images_dir()),
        ("/sounds", get_sounds_dir()),
        ("/logo", get_logo_dir()),
    ):
        if asset_dir.is_dir():
            app.mount(
                mount_path,
                StaticFiles(directory=str(asset_dir)),
                name=mount_path.strip("/"),
            )

    def _spa_index() -> Path:
        return app_settings.frontend_dir / "index.html"

    @app.get("/", include_in_schema=False)
    async def spa_root():
        index = _spa_index()
        if index.is_file():
            return HTMLResponse(index.read_text(encoding="utf-8"), headers={"Cache-Control": "no-store"})
        return JSONResponse({"status": "ok", "service": "homeos", "version": version})

    #: Nest ``spaFallbackMiddleware`` 对所有方法生效（未匹配的任意方法都回退 index.html）
    _SPA_FALLBACK_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

    @app.api_route("/{spa_path:path}", methods=_SPA_FALLBACK_METHODS, include_in_schema=False)
    async def spa_fallback(spa_path: str, request: Request):
        # API 前缀未命中：与 Nest 一致 —— 抛出无 detail 的 404，
        # 由统一异常处理器产出 { error: "Not Found", message: "请求的资源不存在", errorCode: "UNKNOWN" }。
        if request.url.path.startswith("/api/"):
            raise HTTPException(status_code=404)
        index = _spa_index()
        if index.is_file():
            return HTMLResponse(index.read_text(encoding="utf-8"), headers={"Cache-Control": "no-store"})
        raise HTTPException(status_code=404)

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
