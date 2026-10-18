"""应用 lifespan：服务装配与停机清理。"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from . import studio3d_plane
from ..config import Settings
from ..domains.agent.area_service import AgentAreaService
from ..domains.agent.command_cache import CommandCacheService
from ..domains.agent.config_service import AgentConfigService
from ..domains.agent.fast_path import FastPathService
from ..domains.agent.lang_template_service import LangTemplateService
from ..domains.agent.mcp.mcp_service import McpGatewayService
from ..domains.agent.providers.resolving_llm_provider import ResolvingLlmProvider
from ..domains.agent.service import AgentService
from ..domains.agent.session_store import AgentSessionStoreService
from ..domains.agent.short_term_memory import AgentShortTermMemoryService
from ..domains.agent.tools.home_tools_service import HomeToolsService
from ..domains.app_config import AppConfigBackupService, AppConfigService
from ..domains.awareness import AdvisorUsageService, TtsSpeakService, VoiceService
from ..domains.backup import AutoBackupService, ServerBackupService
from ..domains.backup.business_backup import BackupCoordinator, recover_interrupted_restore
from ..domains.channels import (
    ChannelConfigService,
    ChannelsService,
    EmailService,
    WebPushService,
    WecomService,
)
from ..domains.client_power import ClientPowerService
from ..domains.earthquake import (
    EarthquakeCatalogNotifyService,
    EarthquakeGlobalService,
    EarthquakeService,
    EewLeaderService,
    EewPollService,
)
from ..domains.ha.config.ha_config import load_active_ha_endpoints, load_ha_endpoints
from ..domains.ha.config.ha_filters import AlertRuleWatchIndex, HaStateChangeRouter
from ..domains.ha.config.state_ingress_coalesce import StateIngressCoalesceService
from ..domains.ha.integration.service import HAConnectorService
from ..domains.home_mode.service import HomeModeService
from ..domains.license import LicenseService
from ..domains.license import features as feature_codes
from ..domains.lifestyle import MediaSceneService
from ..domains.logs.event_log import EventLogService
from ..domains.notification.service import NotificationService
from ..domains.proxy.command_proxy import CommandProxyService
from ..domains.retention.service import DatabaseRetentionService
from ..domains.security.away_simulation import AwaySimulationService
from ..domains.security.bus import LocalEventBus
from ..domains.security.cooldown import NotificationCooldownService
from ..domains.security.frigate import FrigateService
from ..domains.security.hazard_drill import HazardDrillService
from ..domains.security.linkage import SecurityLinkageService
from ..domains.security.mmwave import MmWavePresenceService
from ..domains.security.panel import SecurityConfigProvider, SecurityPanelService
from ..domains.security.presence import PresenceService
from ..domains.security.service import SecurityService
from ..domains.setup import SetupWizardService
from ..domains.state_store.entity_area import EntityAreaEnrichmentService
from ..domains.state_store.entity_references import EntityReferencesService
from ..domains.state_store.entity_sync_filter import HaEntitySyncFilterService
from ..domains.store.discovery import StoreBaseUrlResolver
from ..domains.system import DeviceHealthService, DeviceManagementService, SystemService
from ..domains.system.embed_proxy import EmbedProxyService
from ..domains.system.jobs import JobRegistryService
from ..domains.system.ops import ExternalApiService, MoviePilotProxyService
from ..domains.system.updates import STORE_UPDATES_PATH, UpdateChecker
from ..domains.ui_config import UiConfigService
from ..domains.weather import WeatherAutoLinkageService, WeatherWatchService
from ..platform.core import schema
from ..platform.core.database import Database
from ..platform.core.distributed_lock import DistributedLockService
from ..platform.core.log import configure_app_logging
from ..platform.core.runtime_logs import RuntimeLogBuffer, install_runtime_log_handler
from ..realtime.domain_events import DomainEventBridge
from ..realtime.gateway import RealtimeGateway
from ..realtime.state_store import StateStore

logger = logging.getLogger("homeos.app")


def _apply_state_change(app: FastAPI, gateway: Any, store: Any, change: dict[str, Any]) -> None:
    """把单条 HA 状态变更落到 L1（同步热路径）。

    旧状态缺失时从本地 L1 补全，保证副作用消费者拿到完整变更。
    """
    entity_id = change.get("entity_id")
    if not entity_id:
        return
    if change.get("old_state") is None:
        previous = store.get(str(entity_id))
        if previous is not None:
            # 就地补全：下游（安防边沿判定、通知规则、家庭模式触发）都在同一个 dict 上做
            # 「旧态 → 新态」比较，只改局部变量会让它们全部看到 old_state=None。
            change["old_state"] = previous
    store.apply_change(str(entity_id), change.get("new_state"), change.get("changed_at"))


async def _run_state_change_effects(
    app: FastAPI,
    gateway: Any,
    store: Any,
    change: dict[str, Any],
    *,
    broadcast: bool = True,
) -> dict[str, Any] | None:
    """冷路径副作用：家庭模式触发 / 安防域 / 通知 / 顾问用量 + WS 广播。

    批量调用时传 ``broadcast=False``，由调用方把整批变更一次性交给网关，
    避免每个实体各开一轮广播（每轮都会重算订阅与可见性并逐连接 emit）。
    """
    entity_id = change.get("entity_id")
    if not entity_id:
        return None
    sync_filter = getattr(app.state, "entity_sync_filter", None)
    if sync_filter is not None and not sync_filter.is_entity_syncable(str(entity_id)):
        return None
    _apply_state_change(app, gateway, store, change)
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
        except Exception:  # 冷路径副作用互不隔离：单个失败不能带塌其余副作用
            logger.warning("家庭模式状态触发失败: entity=%s", entity_id, exc_info=True)
    for attr in ("mmwave", "presence", "frigate", "security_panel"):
        service = getattr(app.state, attr, None)
        if service is None:
            continue
        try:
            await service.handle_state_change(change)
        except Exception:  # 同上：安防域各自独立，失败只影响自身判定
            logger.warning("%s 状态变更处理失败: entity=%s", attr, entity_id, exc_info=True)
    notification = getattr(app.state, "notification", None)
    if notification is not None:
        # 冷路径副作用：设备健康检查（离线/低电量）与告警规则边沿求值。
        for handler in (
            notification.handle_state_change,
            notification.handle_alert_rule_state_change,
        ):
            try:
                handler(change)
            except Exception:  # 同上：两个 handler 相互独立
                logger.warning(
                    "通知 %s 处理状态变更失败: entity=%s", handler.__name__, entity_id, exc_info=True
                )
    advisor_usage = getattr(app.state, "advisor_usage", None)
    if advisor_usage is not None:
        try:
            advisor_usage.track_usage(change)
        except Exception:  # 用量统计属旁路观测，失败不得阻断状态广播
            logger.debug("顾问用量统计失败: entity=%s", entity_id, exc_info=True)
    if broadcast:
        await gateway.broadcast_state_changed_batch([change])
    return change


def _make_state_listener(app: FastAPI, gateway: Any, store: Any):
    """HA 状态监听：全量快照写入 L1 内存；增量变更经事件总线路由。

    状态变更统一走 ``ha.state_changed.batch`` / ``ha.state_changed`` 事件：
    本进程事件总线负责 fan-out，避免双写与重复广播。
    """

    async def _listener(kind: str, payload: Any) -> None:
        bus = getattr(app.state, "security_bus", None)
        sync_filter = getattr(app.state, "entity_sync_filter", None)
        if kind == "initial":
            entities = [
                entity for entity in (payload or []) if isinstance(entity, dict) and entity.get("entity_id")
            ]
            if sync_filter is not None:
                entities = sync_filter.filter_syncable_states(entities)
            store.set_all(entities)
            app.state.ha_entity_count = len(entities)
            presence = getattr(app.state, "presence", None)
            if presence is not None:
                try:
                    presence.seed_from_state_store()
                except Exception:  # 在场推断预热属 best-effort，失败不阻断初始快照
                    logger.warning("在场推断初始播种失败", exc_info=True)
            if bus is not None:
                # 广播全量事件
                await bus.emit("ha.initial_states", {"entities": entities})
            return
        event = payload if isinstance(payload, dict) else {}
        raw_data = event.get("data")
        data = raw_data if isinstance(raw_data, dict) else event
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
            # 入口微窗口合并：同 entity 连续变更在窗口内合并，关键/非合并域立即下发。
            coalesce.enqueue(change)
            return
        await bus.emit("ha.state_changed.batch", {"changes": [change]})

    return _listener


def _make_state_bus_handlers(app: FastAPI, gateway: Any, store: Any) -> dict[str, Any]:
    """构造 HA 事件总线处理器。"""

    async def _handle_state_changed_batch(payload: Any) -> None:
        changes = payload.get("changes") if isinstance(payload, dict) else None
        if not isinstance(changes, list):
            return
        applied: list[dict[str, Any]] = []
        for change in changes:
            if not isinstance(change, dict) or not change.get("entity_id"):
                continue
            result = await _run_state_change_effects(app, gateway, store, change, broadcast=False)
            if result is not None:
                applied.append(result)
        if applied:
            await gateway.broadcast_state_changed_batch(applied)

    async def _handle_state_changed(payload: Any) -> None:
        # 单条状态变更（区域补全等本地生产者走这条）→ 复用批量路径
        if isinstance(payload, dict) and payload.get("entity_id"):
            await _run_state_change_effects(app, gateway, store, payload)

    async def _handle_initial_states(payload: Any) -> None:
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



SHUTDOWN_TIMEOUT = 5.0


async def _shutdown(what: str, stopper: Callable[[], Awaitable[Any]]) -> None:
    """停机一个组件：超时/异常只记日志，绝不打断停机流程。

    旧写法是十几段复制粘贴的 `try: await asyncio.wait_for(x.stop(), timeout=5) except
    Exception: pass`，两个问题：

    1. `pass` 把失败彻底吞掉 —— 停机为什么慢、哪个组件卡住，日志里一点痕迹都没有；
    2. 地震那组把四个组件塞进同一个 `try`，第一个失败会让后面三个**根本不执行**。
    """
    try:
        await asyncio.wait_for(stopper(), SHUTDOWN_TIMEOUT)
    except TimeoutError:
        logger.warning("%s停机超时（%ss），已放弃等待", what, SHUTDOWN_TIMEOUT)
    except Exception as exc:
        logger.warning("%s停机失败: %s", what, exc)


def _pending() -> Any:
    """给「声明在类体、由启动阶段填入」的字段一个编译期占位值。

    这些字段在声明期只能是 `None`（真正的构造发生在后面的装配阶段），但把类型标成
    `X | None` 会让**每一处**读取都要额外收窄 —— 而那正是本次要清掉的噪声。类体上
    的注解才是字段的真实类型（读取侧拿到的是它，不是 `Any`），这里的 `None` 只是
    让 pyright 的 `reportUninitializedInstanceVariable`（CI 硬失败规则）不再触发。
    """
    return None


class _StartupContext:
    """启动装配期的跨阶段上下文。

    仅在构造时播种必需字段（应用设置 / 版本），其余服务对象由各装配阶段按需挂载，
    避免用可变模块全局在阶段之间传递。

    字段**必须**全部在上面声明类型：此前这些属性是各阶段直接 `setattr` 出来的，
    于是「阶段 A 拼错字段名、阶段 C 读到 `None`」这类错配在整个启动路径上都没有
    任何人能看见 —— pyright 只报了 150 余条 `属性未知`，却掩盖了它们本可拦下的
    真错字。声明之后，写错的名字在启动路径外就被拦下。
    """

    app_settings: Settings
    version: str
    recovery_required: bool
    app_config: AppConfigService = _pending()
    license_service: LicenseService = _pending()
    database_retention: DatabaseRetentionService = _pending()
    event_log_service: EventLogService = _pending()
    voice_rest_config: Callable[[], Awaitable[dict[str, Any]]] = _pending()
    gateway: RealtimeGateway = _pending()
    state_store: StateStore = _pending()
    ha_connector: HAConnectorService = _pending()
    ha_state_listener: Callable[[str, Any], Awaitable[None]] = _pending()
    security_bus: LocalEventBus = _pending()
    state_ingress_coalesce: StateIngressCoalesceService = _pending()
    security_config: SecurityConfigProvider = _pending()
    cooldown: NotificationCooldownService = _pending()
    mmwave: MmWavePresenceService = _pending()
    presence: PresenceService = _pending()
    security_service: SecurityService = _pending()
    away_sim: AwaySimulationService = _pending()
    security_panel: SecurityPanelService = _pending()
    frigate: FrigateService = _pending()
    hazard_drill: HazardDrillService = _pending()
    ui_config: UiConfigService = _pending()
    external_api: ExternalApiService = _pending()
    auto_backup: AutoBackupService = _pending()
    home_mode: HomeModeService = _pending()
    agent_service: AgentService = _pending()
    notification: NotificationService = _pending()
    advisor_usage: AdvisorUsageService = _pending()
    weather_watch: WeatherWatchService = _pending()
    eew_leader: EewLeaderService = _pending()
    earthquake: EarthquakeService = _pending()
    eew_poll: EewPollService = _pending()
    catalog_notify: EarthquakeCatalogNotifyService = _pending()

    def __init__(self, app_settings: Settings, version: str) -> None:
        self.app_settings = app_settings
        self.version = version
        self.recovery_required = False


def _endpoint_loader(app: FastAPI) -> Any:
    """读取连接器静态 HA 端点，供旁路消费者（语音 / 摄像头 WS / 安防）取用。"""
    with app.state.database.session_factory() as session:
        # 传 cipher：令牌只以密文存在连接记录里，不传就解不出来，ha_configured 会误判为未配置。
        return load_ha_endpoints(session, cipher=app.state.studio_ha.cipher)


def _make_voice_rest_config(app: FastAPI) -> Callable[[], Awaitable[dict[str, Any]]]:
    """构造 HA Assist 所需的 ``{haUrl, token}`` 取数回调。"""

    async def _voice_rest_config() -> dict[str, Any]:
        """取连接器活跃端点，避免内网不可达时打错地址。"""

        def _load() -> dict[str, Any]:
            with app.state.database.session_factory() as session:
                endpoints_now = load_active_ha_endpoints(
                    session, cipher=app.state.studio_ha.cipher
                )
            return {"haUrl": endpoints_now.ha_url_primary, "token": endpoints_now.token}

        return await asyncio.to_thread(_load)

    return _voice_rest_config


async def _init_core_services(app: FastAPI, startup: _StartupContext) -> None:
    """启动第一阶段：数据目录 / 建库 / 数据库 / 日志 / 作业 / 授权 / 保留 / 事件日志。"""
    app_settings = startup.app_settings
    app_settings.data_dir.mkdir(parents=True, exist_ok=True)
    # 必须早于建库：先回滚中断的还原，避免在半还原的结构上继续建表。
    startup.recovery_required = recover_interrupted_restore(app_settings)
    schema.prepare_schema(app_settings)
    app.state.database = Database(app_settings.database_url)
    app.state.settings = app_settings
    app.state.version = startup.version
    app.state.started_at = time.monotonic()
    app.state.db_probe = None  # (at, ok)

    # 运行日志环形缓冲：镜像 homeos 日志树，供 /system/runtime-logs 查询
    configure_app_logging()
    app.state.runtime_logs = RuntimeLogBuffer()
    install_runtime_log_handler(app.state.runtime_logs)

    # 调度作业注册中心：/system/jobs 诊断面板数据源
    app.state.jobs = JobRegistryService()

    # 应用配置（运行参数）：内存缓存 + DB 持久化 + 脱敏 + 审计
    app_config = AppConfigService(app.state.database.session_factory)
    app_config.start()
    app.state.app_config = app_config
    app.state.app_config_backup = AppConfigBackupService(app_config)
    startup.app_config = app_config

    # 授权服务：构造期即做公钥自检，指纹不符直接启动失败。
    license_service = LicenseService(app_settings, app.state.database, transport=None)
    app.state.license = license_service
    app.state.license_service = license_service
    startup.license_service = license_service

    # 3D Studio 后端平面：必须早于下方 HA 块，以把 ``app.state.ha_connector``
    # 指向 3D HA 连接器本身。
    await studio3d_plane.install(app, app_settings, app.state.database)

    # 数据保留：策略面板 + 分批清理（首次延迟 + 周期调度在此接入）
    database_retention = DatabaseRetentionService(
        app.state.database.session_factory, app_config, jobs=app.state.jobs
    )
    database_retention.start()
    await database_retention.start_schedule()
    app.state.database_retention = database_retention
    startup.database_retention = database_retention
    # 基础设施：进程内互斥锁（保留清理 / 分区维护 / 遗忘检测等）
    distributed_lock = DistributedLockService()
    app.state.distributed_lock = distributed_lock
    database_retention.lock = distributed_lock
    # 事件日志：订阅 HA 冷批状态变更，内存缓冲后批量落库。
    event_log_service = EventLogService(app.state.database)
    event_log_service.bind_loop(asyncio.get_running_loop())
    app.state.event_log = event_log_service
    startup.event_log_service = event_log_service
    # HA 端点解析 / 语音 REST 配置：供旁路消费者与 HA Assist 复用的取数回调。
    startup.voice_rest_config = _make_voice_rest_config(app)


def _install_realtime_state_pipeline(app: FastAPI, startup: _StartupContext) -> None:
    """装配实时网关 / 状态仓库 / HA 连接器 / 安防事件总线与入口合并。"""
    gateway = app.state.realtime
    startup.gateway = gateway
    state_store = gateway.state_store
    startup.state_store = state_store
    # 实体同步过滤共享视图：由 HaConnector 在注册表加载后 configure。
    entity_sync_filter = HaEntitySyncFilterService()
    app.state.entity_sync_filter = entity_sync_filter

    # 单条 HA 连接：``ha_connector`` 与 ``studio_ha`` 是同一对象，业务与 3D 数据面共用。
    ha_connector = app.state.studio_ha
    startup.ha_connector = ha_connector
    ha_connector.attach_state_store(state_store)
    ha_state_listener = _make_state_listener(app, gateway, state_store)
    startup.ha_state_listener = ha_state_listener
    ha_connector.set_state_listener(ha_state_listener)
    app.state.ha_connector = ha_connector
    app.state.entity_area = EntityAreaEnrichmentService(
        ha_connector, state_store, session_factory=app.state.database.session_factory
    )
    ha_connector.attach_sync_filter(
        entity_sync_filter,
        lambda: bool((startup.app_config.get("haConnector") or {}).get("syncOnlyEnabledEntities", True)),
    )
    app.state.command_proxy = CommandProxyService(app.state.database.session_factory, ha_connector)

    # 安防域：事件总线 / 冷却 / 面板 / 在场 / Frigate / 离家模拟 / 演习
    security_bus = LocalEventBus()
    startup.security_bus = security_bus
    # 回填事件总线：让 app_config 更新后广播 app.config.updated（各域热更新订阅依赖）
    startup.app_config.set_event_bus(security_bus)
    # HA 入口微窗口合并
    state_ingress_coalesce = StateIngressCoalesceService(
        app.state.database.session_factory,
        security_bus,
        entity_sync_filter,
    )
    state_ingress_coalesce.bind_loop(asyncio.get_running_loop())
    security_bus.on("app.config.updated", lambda _p=None: state_ingress_coalesce.invalidate_config())
    app.state.state_ingress_coalesce = state_ingress_coalesce
    startup.state_ingress_coalesce = state_ingress_coalesce
    # HA 连接器 / 实体区域补全：注册表变更与初始状态事件处理器
    ha_connector.attach_event_bus(security_bus)
    app.state.entity_area.attach_event_bus(security_bus)


def _register_ha_event_handlers(app: FastAPI, startup: _StartupContext) -> None:
    """注册 HA 状态 / 连接事件处理器与连接器生命周期监听。"""
    gateway = startup.gateway
    state_store = startup.state_store
    security_bus = startup.security_bus

    # HA 状态 / 连接事件处理器
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

    state_handlers = _make_state_bus_handlers(app, gateway, state_store)
    for event, handler in {
        **state_handlers,
        "ha.connected": _on_ha_connected,
        "ha.disconnected": _on_ha_disconnected,
        "ha.reconnecting": _on_ha_reconnecting,
    }.items():
        security_bus.on(event, handler)

    # 连接器是唯一 HA 连接，其生命周期即 ``ha_connected`` 与 ha.connected / disconnected /
    # reconnecting 的唯一事实源。必须晚于上面的处理器注册，事件发出时订阅方已在位。
    studio_connector = getattr(app.state, "studio_ha", None)
    if studio_connector is not None:

        async def _on_connector_connection(status: str, payload: dict[str, Any]) -> None:
            if status == "connected":
                app.state.ha_connected = True
                ha_version = payload.get("ha_version")
                if ha_version:
                    app.state.ha_version = ha_version
                await security_bus.emit("ha.connected", {"ha_version": app.state.ha_version})
            elif status == "disconnected":
                app.state.ha_connected = False
                await security_bus.emit("ha.disconnected", {})
            elif status == "reconnecting":
                app.state.ha_reconnect_attempt = payload.get("attempt")
                await security_bus.emit(
                    "ha.reconnecting", {"attempt": payload.get("attempt")}
                )

        studio_connector.set_connection_listener(_on_connector_connection)

        # 全量快照与增量直接走状态监听；StateHub 只承载 3D 侧 watched 子集，供 /ws/runtime。
        studio_connector.set_state_listener(startup.ha_state_listener)


def _build_security_services(app: FastAPI, startup: _StartupContext) -> None:
    """构造安防域服务：配置提供者 / 冷却 / 毫米波 / 在场 / 面板 / Frigate / 离家 / 演习。"""
    security_bus = startup.security_bus

    security_config = SecurityConfigProvider(app.state.database.session_factory)
    startup.security_config = security_config
    cooldown = NotificationCooldownService(security_bus)
    startup.cooldown = cooldown
    startup.database_retention.cooldown = cooldown
    mmwave = MmWavePresenceService(security_bus)
    startup.mmwave = mmwave
    presence = PresenceService(
        app.state.database.session_factory,
        security_bus,
        security_config.get,
        startup.state_store,
        mmwave,
        jobs=app.state.jobs,
    )
    startup.presence = presence
    security_service = SecurityService(
        app.state.database.session_factory, cipher=app.state.studio_ha.cipher
    )
    startup.security_service = security_service
    away_sim = AwaySimulationService(
        app.state.database.session_factory, startup.ha_connector, security_bus, security_config.get
    )
    startup.away_sim = away_sim
    security_panel = SecurityPanelService(
        app.state.database.session_factory,
        startup.ha_connector,
        security_bus,
        cooldown,
        security_config,
    )
    startup.security_panel = security_panel
    frigate = FrigateService(
        app.state.database.session_factory, security_bus, security_panel, security_config.get
    )
    startup.frigate = frigate
    hazard_drill = HazardDrillService(
        app.state.database.session_factory, security_bus, startup.ha_connector
    )
    startup.hazard_drill = hazard_drill

    app.state.security_bus = security_bus


def _build_ui_and_system_services(app: FastAPI, startup: _StartupContext) -> None:
    """构造 UI 配置 / 系统 / 影音 / 运维 / 备份 / 首装向导等基础域。"""
    app_settings = startup.app_settings
    app_config = startup.app_config

    # UI 配置域：布局方案 / 终端绑定 / 静态资源
    ui_config = UiConfigService(
        app.state.database.session_factory,
        app_config,
        event_bus=startup.security_bus,
        ui_assets_root=app_settings.ui_assets_dir,
    )
    ui_config._static_assets.ensure_dirs()
    app.state.ui_config = ui_config
    startup.ui_config = ui_config

    # 系统域：版本 / 健康 / 网络信息 + 设备管理（僵尸绑定扫描与解绑）
    app.state.system_service = SystemService(app_settings, ui_config)
    app.state.device_health = DeviceHealthService(startup.state_store)
    app.state.device_management = DeviceManagementService(
        app.state.database.session_factory, startup.state_store, ui_config, startup.ha_connector
    )

    # 生活方式域：影音场景
    media_scene = MediaSceneService(startup.ha_connector, app_config)
    media_scene.start()
    app.state.media_scene = media_scene

    # 系统运维域：外部数据源（天气/电价/日历）+ MoviePilot 透明代理 + 内嵌反代
    external_api = ExternalApiService(
        app_config,
        event_bus=startup.security_bus,
        jobs=app.state.jobs,
        state_store=startup.state_store,
    )
    external_api.start()
    app.state.external_api = external_api
    startup.external_api = external_api

    app.state.moviepilot_proxy = MoviePilotProxyService(ui_config)
    app.state.embed_proxy = EmbedProxyService(ui_config, app_settings)

    # 备份与还原：统一全量备份（含数据库）/ 服务器备份文件 / 定时自动备份
    server_backup = ServerBackupService(app_settings)
    # 协调器先于自动备份作业构造：定时作业要能与手动恢复互斥（维护期跳过 + 共用一把锁）。
    business_backup = BackupCoordinator(app)
    auto_backup = AutoBackupService(app_config, server_backup, business_backup)
    app.state.server_backup = server_backup
    app.state.auto_backup = auto_backup
    auto_backup.start()
    startup.auto_backup = auto_backup

    business_backup.cleanup_startup()
    if startup.recovery_required:
        business_backup.recovery_required = True
    app.state.business_backup = business_backup

    # 首装向导：进度 / 引导清单 / 绑定缺口 / 配置健康评分
    app.state.setup_wizard = SetupWizardService(
        app_config,
        app.state.database.session_factory,
        startup.ha_connector,
        startup.state_store,
    )


def _install_ha_reconnect_handlers(app: FastAPI, startup: _StartupContext) -> None:
    """布局 HA 配置变更 → 按指纹比对后重连 HA。"""
    ha_connector = startup.ha_connector
    boot_endpoints = _endpoint_loader(app)
    fingerprint_state = {
        "value": "|".join(
            [
                boot_endpoints.ha_url_primary,
                boot_endpoints.ha_url_fallback,
                boot_endpoints.token,
            ]
        )
    }

    async def _on_system_config_updated(_payload: Any = None) -> None:
        endpoints_now = _endpoint_loader(app)
        fingerprint = "|".join(
            [endpoints_now.ha_url_primary, endpoints_now.ha_url_fallback, endpoints_now.token]
        )
        if fingerprint == fingerprint_state["value"]:
            return
        fingerprint_state["value"] = fingerprint
        app.state.ha_configured = bool(endpoints_now.ha_url_primary and endpoints_now.token)
        if not app.state.ha_configured:
            return
        try:
            await ha_connector.stop()
            # ``HAConnectorService.start`` 是同步方法：await None 会抛 TypeError 并被吞掉。
            ha_connector.start()
            logger.info("HA 连接配置变更，已按新地址重连")
        except Exception as exc:
            logger.warning("HA 重连失败: %s", exc)

    startup.security_bus.on("SYSTEM_CONFIG_UPDATED", _on_system_config_updated)


def _publish_security_services(app: FastAPI, startup: _StartupContext) -> None:
    """把安防域服务挂到 ``app.state``，供冷路径副作用与运行时读取。"""
    app.state.security_config = startup.security_config
    app.state.security_cooldown = startup.cooldown
    app.state.mmwave = startup.mmwave
    app.state.presence = startup.presence
    app.state.security_service = startup.security_service
    app.state.away_sim = startup.away_sim
    app.state.frigate = startup.frigate
    app.state.hazard_drill = startup.hazard_drill
    app.state.security_panel = startup.security_panel


async def _start_security_services(app: FastAPI, startup: _StartupContext) -> None:
    """启动安防域需要异步首启的服务。"""
    await startup.security_panel.start()
    await startup.frigate.start()
    await startup.away_sim.start()
    await startup.presence.start()


async def _build_home_mode(app: FastAPI, startup: _StartupContext) -> None:
    """构造并启动家庭模式服务，以及跨模块安全联动。"""
    security_bus = startup.security_bus

    # 家庭模式：CRUD / 激活 / 触发器 / 预设 / 运行日志
    async def _emit_home_mode_event(name: str, payload: dict[str, Any]) -> None:
        # 走统一事件总线：本进程分发（WS fan-out）
        await security_bus.emit(name, payload)

    async def _set_security_mode(mode: str, source: str) -> bool:
        # 家庭模式驱动安防时仍要求 ``module.security``，避免只买场景模式绕过安防门禁。
        license_service = getattr(app.state, "license_service", None)
        if license_service is not None and not license_service.allows(
            feature_codes.FEATURE_SECURITY
        ):
            return False
        panel = getattr(app.state, "security_panel", None)
        if panel is None:
            # 面板未挂载时安防动作**没有发生**：此前返回 True 会让家庭模式把「安防已切换」
            # 记成成功，实际警报状态一动不动。宁可如实报失败（安防服务总是随启动发布，
            # 这条分支只在安防域被裁掉时才会走到）。
            logger.warning("家庭模式请求切换安防，但安防面板未启动：mode=%s", mode)
            return False
        # set_mode 是 async，必须 await：bool(coroutine) 恒为 True，会让安防动作看似成功。
        result = await panel.set_mode(mode, source)
        if isinstance(result, dict):
            if result.get("success"):
                return True
            # 撤防 fail-open：联动降级时 success 可能为 False，但 mode 已提交。
            return mode == "disarmed" and result.get("mode") == "disarmed"
        return bool(result)

    home_mode = HomeModeService(
        app.state.database.session_factory,
        startup.ha_connector,
        startup.state_store,
        set_security_mode=_set_security_mode,
        emit_event=_emit_home_mode_event,
        is_leader=lambda: True,
        jobs=app.state.jobs,
    )
    await home_mode.start()
    app.state.home_mode = home_mode
    startup.home_mode = home_mode

    # 跨模块联动：presence / calendar / 安防模式 → 家庭模式 + 离家模拟
    security_linkage = SecurityLinkageService(
        app.state.database.session_factory,
        security_bus,
        startup.security_panel,
        startup.away_sim,
        home_mode,
        startup.security_config.get,
    )
    app.state.security_linkage = security_linkage


async def _build_agent_domain(app: FastAPI, startup: _StartupContext) -> None:
    """构造智能管家域：LLM 工具调用 / 快路径 / 命令缓存 / 会话记忆 + MCP 网关。"""
    app_config = startup.app_config

    # 智能管家域：LLM 工具调用 / 快路径 / 命令缓存 / 会话记忆 + MCP 网关
    agent_config = AgentConfigService(
        app.state.database.session_factory,
        app_config,
        event_bus=startup.security_bus,
    )
    agent_config.bind_events()
    app.state.agent_config = agent_config

    lang_templates = LangTemplateService(agent_config, event_bus=startup.security_bus)
    await lang_templates.init()
    app.state.agent_lang_templates = lang_templates

    agent_area = AgentAreaService(app.state.entity_area, startup.state_store)

    home_tools = HomeToolsService(
        startup.state_store,
        app.state.command_proxy,
        agent_area,
        startup.ui_config,
        app_config,
        startup.ha_connector,
        startup.home_mode,
        app.state.database.session_factory,
        startup.external_api,
        agent_config,
    )
    app.state.home_tools = home_tools

    fast_path = FastPathService(
        agent_area,
        startup.state_store,
        lang_templates,
        event_bus=startup.security_bus,
        agent_config=agent_config,
    )
    fast_path.bind_events()
    app.state.agent_fast_path = fast_path

    command_cache = CommandCacheService()
    app.state.agent_command_cache = command_cache

    # 会话记忆分两层：10 分钟长会话（内存 LRU）+ 45s 短时滑窗（纯内存）
    agent_sessions = AgentSessionStoreService()
    app.state.agent_sessions = agent_sessions
    app.state.agent_short_term = AgentShortTermMemoryService()

    llm_provider = ResolvingLlmProvider(agent_config, event_bus=startup.security_bus)
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
    startup.agent_service = agent_service

    app.state.mcp_gateway = McpGatewayService(
        agent_service,
        home_tools,
        agent_config,
        app.state.database.session_factory,
        env=os.environ,
        server_version=startup.version,
        is_production=startup.app_settings.is_production,
    )


async def _build_channels_and_notification(app: FastAPI, startup: _StartupContext) -> None:
    """构造消息通道域、客户端电量联动、通知域与实体反向引用。"""
    app_config = startup.app_config

    # 消息通道：Email / WebPush / 企业微信（Phase 6）
    channel_config = ChannelConfigService(startup.ui_config, event_bus=startup.security_bus)
    channel_config.bind_events()
    app.state.channel_config = channel_config

    email_service = EmailService(channel_config, event_bus=startup.security_bus)
    email_service.bind_events()
    await email_service.reload()
    app.state.email_service = email_service

    web_push_service = WebPushService(
        channel_config, app.state.database.session_factory, event_bus=startup.security_bus
    )
    web_push_service.bind_events()
    await web_push_service.start()
    app.state.web_push_service = web_push_service

    wecom_service = WecomService(channel_config, event_bus=startup.security_bus)
    wecom_service.bind_events()
    await wecom_service.start()
    app.state.wecom_service = wecom_service

    channels_service = ChannelsService(
        email_service,
        web_push_service,
        wecom_service,
        startup.agent_service,
        channel_config,
        app.state.database.session_factory,
    )
    channels_service.start()
    app.state.channels_service = channels_service

    # 客户端电量联动（Phase 6）
    client_power = ClientPowerService(
        app_config,
        app.state.database.session_factory,
        startup.ha_connector,
        startup.security_bus,
        startup.cooldown,
        jobs=app.state.jobs,
    )
    await client_power.start()
    app.state.client_power = client_power

    # 通知域：站内通知 / 告警规则 / 偏好 / 领域事件订阅
    notification = NotificationService(
        app.state.database.session_factory,
        event_bus=startup.security_bus,
        cooldown_service=startup.cooldown,
        channels_service=channels_service,  # Phase 6：Email / WebPush / 企微 外部通知
        ha_areas_provider=lambda: (app.state.entity_area.get_cached_ha_areas() if hasattr(app.state, "entity_area") else []),
        state_store=startup.state_store,  # 设备离线告警需复查实体状态 / HA 连接
    )
    notification.bind_events()
    await notification.start()
    app.state.notification = notification
    startup.notification = notification

    # 实体反向引用：布局 / 家庭模式 / 告警规则 / 系统配置 的「哪些功能引用了该实体」
    alert_rule_watch_index = AlertRuleWatchIndex()
    app.state.alert_rule_watch_index = alert_rule_watch_index
    app.state.entity_references = EntityReferencesService(
        app.state.database.session_factory,
        app_config,
        startup.ui_config,
        alert_rule_watch_index,
    )


async def _build_awareness_and_events(app: FastAPI, startup: _StartupContext) -> None:
    """构造语音播报 / 领域事件广播桥 / 语音与顾问用量服务。"""
    app_config = startup.app_config

    # 语音播报服务：领域事件（tts.speak）与语音链路共用，需先于 WS 广播桥创建
    tts_speak = TtsSpeakService(app_config, startup.ha_connector)
    app.state.tts_speak = tts_speak
    startup.security_bus.on("app.config.updated", tts_speak.on_config_updated)
    # 数据保留：ops 变更时热更新清理周期 / 首次延迟
    startup.security_bus.on(
        "app.config.updated", startup.database_retention.on_config_updated
    )

    # 领域事件 → WS 客户端广播（对齐 ws-push domain-events helper 全量事件集）
    domain_events = DomainEventBridge(startup.security_bus, startup.gateway, tts_speak)
    domain_events.bind()
    app.state.domain_events = domain_events

    # 语音 / 智能顾问用量（Phase 6：awareness）
    voice_service = VoiceService(
        app_config=app_config,
        ha_connector=startup.ha_connector,
        command_proxy=app.state.command_proxy,
        home_mode=startup.home_mode,
        state_store=startup.state_store,
        entity_area=app.state.entity_area,
        tts_speak=tts_speak,
        session_factory=app.state.database.session_factory,
        agent_service=startup.agent_service,
        get_ha_rest_config=startup.voice_rest_config,
        version=startup.version,
    )
    app.state.voice = voice_service

    advisor_usage = AdvisorUsageService(
        app_config=app_config,
        ha_connector=startup.ha_connector,
        state_store=startup.state_store,
        state_router=HaStateChangeRouter(AlertRuleWatchIndex()),
        entity_area=app.state.entity_area,
        session_factory=app.state.database.session_factory,
        event_bus=startup.security_bus,
        jobs=app.state.jobs,
        lock=app.state.distributed_lock,
    )
    await advisor_usage.start()
    app.state.advisor_usage = advisor_usage
    startup.advisor_usage = advisor_usage
    startup.security_bus.on("app.config.updated", advisor_usage.on_app_config_updated)
    # HA 连上后重建房间设备映射：启动期 HA 未就绪会拿到空映射（见 build_room_device_map_from_config）
    startup.security_bus.on("ha.connected", advisor_usage.on_ha_connected)


async def _build_weather_and_earthquake(app: FastAPI, startup: _StartupContext) -> None:
    """构造天气预警监听 / 极端天气联动与地震预警（轮询 / 目录 / 全球目录）。"""
    app_config = startup.app_config

    # 天气预警监听 + 极端天气安全联动（Phase 6：weather）
    weather_watch = WeatherWatchService(
        external_api=startup.external_api,
        notification=startup.notification,
        jobs=app.state.jobs,
        app_config=app_config,
        event_bus=startup.security_bus,
    )
    await weather_watch.start()
    app.state.weather_watch = weather_watch
    startup.weather_watch = weather_watch

    weather_linkage = WeatherAutoLinkageService(
        app_config=app_config,
        session_factory=app.state.database.session_factory,
        cooldown_service=startup.cooldown,
        ha_connector=startup.ha_connector,
        home_mode=startup.home_mode,
        notification=startup.notification,
    )
    startup.security_bus.on("weather.alert", weather_linkage.on_weather_alert)
    app.state.weather_linkage = weather_linkage

    # 地震预警（Phase 6）：Wolfx WS + SC/CENC 轮询 + 目录 + 全球目录
    eew_leader = EewLeaderService()
    await eew_leader.start()
    app.state.eew_leader = eew_leader
    startup.eew_leader = eew_leader

    earthquake = EarthquakeService(
        event_bus=startup.security_bus,
        session_factory=app.state.database.session_factory,
        leader=eew_leader,
        jobs=app.state.jobs,
        get_ha_rest_config=startup.voice_rest_config,
        cipher=app.state.studio_ha.cipher,
    )
    app.state.earthquake = earthquake
    startup.earthquake = earthquake

    earthquake_global = EarthquakeGlobalService(earthquake)
    app.state.earthquake_global = earthquake_global

    eew_poll = EewPollService(earthquake, eew_leader, app.state.jobs)
    app.state.eew_poll = eew_poll
    startup.eew_poll = eew_poll

    catalog_notify = EarthquakeCatalogNotifyService(
        earthquake,
        earthquake_global,
        eew_leader,
        startup.notification,
        startup.cooldown,
        app.state.jobs,
    )
    app.state.earthquake_catalog_notify = catalog_notify
    startup.catalog_notify = catalog_notify

    await earthquake.start()
    await eew_poll.start()
    await catalog_notify.start()


async def _start_ha_and_license(app: FastAPI, startup: _StartupContext) -> None:
    """收尾启动：HA 连接器状态对齐 / 授权门禁自举 / 版本更新发现。"""
    app_settings = startup.app_settings

    endpoints = _endpoint_loader(app)
    app.state.ha_configured = bool(endpoints.ha_url_primary and endpoints.token)
    # 连接器在 studio3d_plane.install 阶段已启动：这里必须沿用它的真实状态，否则会把
    # 可能已经置上的「已连接」按回 False（socket.io 首推快照与 /metrics 都读该字段）。
    app.state.ha_connected = bool(getattr(startup.ha_connector, "connected", False))
    if not hasattr(app.state, "ha_version"):
        app.state.ha_version = None
    if app.state.ha_configured:
        try:
            # 同步方法（见 domains/ha/integration/service.py 的 ``def start``）；连接器自身做幂等，
            # 平面已启动过时再调一次是安全的。
            startup.ha_connector.start()
        except Exception as exc:
            import logging as _logging

            _logging.getLogger("homeos.app").warning("HA 连接器启动失败: %s", exc)

    # 商业授权：门禁自举（公钥取回 / 状态恢复 / 续租循环）。
    await startup.license_service.start()

    # 商店对外地址的解析器（登录页的「忘记密码 / 商店」链接要用）。**启动时不联网** ——
    # 真正取回发生在登录页请求 /public/config 时；这里只把状态挂上（见 domains/store/
    # discovery.py）。显式 APP_STORE_URL 时它一次网络请求都不会发。
    app.state.store_base_url_resolver = StoreBaseUrlResolver(app_settings)

    # 版本更新发现（可选）：失败静默降级，不影响其余服务。
    # 端点是**容器自己出站**去问的，所以用授权服务器地址（同机部署 = 服务名，分机部署 =
    # 厂商那台的地址），而不是给浏览器用的那个 —— 两者在很多部署里不是同一个值。
    # APP_UPDATE_ENDPOINTS 显式给出时优先；都没有就留空 = 不检查，不回落到写死的回环。
    app.state.update_checker = UpdateChecker(
        app_settings.data_dir,
        app_settings.version,
        app_settings.update_channel,
        enabled=app_settings.update_checks_enabled,
        endpoints=app_settings.update_endpoints
        or (
            (f"{app_settings.license_server_url}{STORE_UPDATES_PATH}",)
            if app_settings.license_server_url
            else ()
        ),
    )
    app.state.update_checker.start()


async def _shutdown_all(app: FastAPI, startup: _StartupContext) -> None:
    """停机全部组件：逐个隔离超时 / 异常，最后释放数据库。"""
    await _shutdown("3D 平面", lambda: studio3d_plane.shutdown(app))
    await _shutdown("更新检查器", app.state.update_checker.stop)
    await _shutdown("授权服务", startup.license_service.stop)
    await _shutdown("数据库保留调度", startup.database_retention.stop_schedule)
    await _shutdown("外部 API", startup.external_api.stop)
    for service, label in (
        (startup.presence, "在场检测"),
        (startup.mmwave, "毫米波"),
        (startup.away_sim, "离家模拟"),
    ):
        await _shutdown(label, service.stop)
    await _shutdown("家庭模式", startup.home_mode.stop)
    await _shutdown("通知", startup.notification.stop)
    for service, label in (
        (startup.catalog_notify, "目录通知"),
        (startup.eew_poll, "地震预警轮询"),
        (startup.earthquake, "地震服务"),
        (startup.eew_leader, "地震预警主节点"),
    ):
        await _shutdown(label, service.stop)
    for service, label in (
        (startup.weather_watch, "天气监视"),
        (startup.advisor_usage, "顾问用量"),
    ):
        await _shutdown(label, service.stop)
    await _shutdown("HA 连接器", startup.ha_connector.stop)
    await _shutdown("状态汇聚", startup.state_ingress_coalesce.close)
    await _shutdown("事件日志刷盘", startup.event_log_service.flush)
    startup.auto_backup.stop()
    database = getattr(app.state, "database", None)
    if database is not None:
        database.dispose()


def create_lifespan(app_settings: Settings, version: str):
    """构造 FastAPI lifespan 上下文管理器。"""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        startup = _StartupContext(app_settings=app_settings, version=version)
        await _init_core_services(app, startup)
        _install_realtime_state_pipeline(app, startup)
        _register_ha_event_handlers(app, startup)
        _build_security_services(app, startup)
        _build_ui_and_system_services(app, startup)
        _install_ha_reconnect_handlers(app, startup)
        _publish_security_services(app, startup)
        await _start_security_services(app, startup)
        await _build_home_mode(app, startup)
        await _build_agent_domain(app, startup)
        await _build_channels_and_notification(app, startup)
        await _build_awareness_and_events(app, startup)
        await _build_weather_and_earthquake(app, startup)
        await _start_ha_and_license(app, startup)

        try:
            yield
        finally:
            await _shutdown_all(app, startup)

    return lifespan
