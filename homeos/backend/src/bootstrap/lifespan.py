"""应用 lifespan：服务装配与停机清理。

从 ``app.create_app`` 原样抽出，行为不变。
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from .. import studio3d_plane
from ..config import Settings
from ..core import migrations
from ..core.database import Database
from ..core.distributed_lock import DistributedLockService
from ..core.log import configure_app_logging
from ..core.redis import RedisService
from ..core.runtime_logs import RuntimeLogBuffer, install_runtime_log_handler
from ..realtime.domain_events import DomainEventBridge
from ..services.agent.area_service import AgentAreaService
from ..services.agent.command_cache import CommandCacheService
from ..services.agent.config_service import AgentConfigService
from ..services.agent.fast_path import FastPathService
from ..services.agent.lang_template_service import LangTemplateService
from ..services.agent.mcp.mcp_service import McpGatewayService
from ..services.agent.providers.resolving_llm_provider import ResolvingLlmProvider
from ..services.agent.service import AgentService
from ..services.agent.session_store import AgentSessionStoreService
from ..services.agent.short_term_memory import AgentShortTermMemoryService
from ..services.agent.tools.home_tools_service import HomeToolsService
from ..services.app_config import AppConfigBackupService, AppConfigService
from ..services.awareness import AdvisorUsageService, TtsSpeakService, VoiceService
from ..services.backup import (
    AutoBackupService,
    ServerBackupService,
    SystemBundleBackupService,
    UsersBackupService,
)
from ..services.backup.business_backup import BackupCoordinator
from ..services.channels import (
    ChannelConfigService,
    ChannelsService,
    EmailService,
    WebPushService,
    WecomService,
)
from ..services.client_power import ClientPowerService
from ..services.command_proxy import CommandProxyService
from ..services.earthquake import (
    EarthquakeCatalogNotifyService,
    EarthquakeGlobalService,
    EarthquakeService,
    EewLeaderService,
    EewPollService,
)
from ..services.event_bus_bridge import EventBusBridge
from ..services.event_log import EventLogService
from ..services.ha_config import load_active_ha_endpoints, load_ha_endpoints
from ..services.ha_filters import AlertRuleWatchIndex, HaStateChangeRouter
from ..services.home_mode.service import HomeModeService
from ..services.jobs import JobRegistryService
from ..services.license import LicenseService
from ..services.license import features as feature_codes
from ..services.lifestyle import MediaSceneService
from ..services.notification.service import NotificationService
from ..services.retention.service import DatabaseRetentionService
from ..services.security.away_simulation import AwaySimulationService
from ..services.security.bus import LocalEventBus
from ..services.security.cooldown import NotificationCooldownService
from ..services.security.frigate import FrigateService
from ..services.security.hazard_drill import HazardDrillService
from ..services.security.linkage import SecurityLinkageService
from ..services.security.mmwave import MmWavePresenceService
from ..services.security.panel import SecurityConfigProvider, SecurityPanelService
from ..services.security.presence import PresenceService
from ..services.security.service import SecurityService
from ..services.setup import SetupWizardService
from ..services.state_ingress_coalesce import StateIngressCoalesceService
from ..services.state_store.entity_area import EntityAreaEnrichmentService
from ..services.state_store.entity_references import EntityReferencesService
from ..services.state_store.entity_sync_filter import HaEntitySyncFilterService
from ..services.system import DeviceHealthService, DeviceManagementService, SystemService
from ..services.system.embed_proxy import EmbedProxyService
from ..services.system.ops import ExternalApiService, MoviePilotProxyService
from ..services.ui_config import UiConfigService
from ..services.weather import WeatherAutoLinkageService, WeatherWatchService
from ..updates import STORE_UPDATES_PATH, UpdateChecker

logger = logging.getLogger("homeos.app")


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
    """冷路径副作用：家庭模式触发 / 安防域 / 通知 / 顾问用量 + WS 广播。"""
    entity_id = change.get("entity_id")
    sync_filter = getattr(app.state, "entity_sync_filter", None)
    if sync_filter is not None and not sync_filter.is_entity_syncable(str(entity_id)):
        return
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



def create_lifespan(app_settings: Settings, version: str):
    """构造 FastAPI lifespan 上下文管理器。"""

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

        # 商业授权：并入 homeos-3d 授权服务（Ed25519 验签租约 + X25519 加密传输 +
        # 本地 Fernet 凭证加密 + 进程锁）。构造期即做公钥自检，指纹不符会直接启动失败。
        license_service = LicenseService(app_settings, app.state.database, transport=None)
        app.state.license = license_service
        app.state.license_service = license_service

        # 3D Studio 后端平面：HA 单连接（3D ``HAConnectorService`` + ``StateHub``）+ 数据面服务。
        # 显式注入 database；global_log 由本平面自行创建。必须早于下方 homeos HA 块，
        # 以便把 ``app.state.ha_connector`` 指向 3D HA 连接器本身。
        await studio3d_plane.install(app, app_settings, app.state.database)

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
        # Phase 3+ 会在此装配 license / ha-connector / socketio 网关。
        # 事件日志：订阅 HA 冷批状态变更，内存缓冲后批量落库（socketio 网关在广播时喂入）。
        event_log_service = EventLogService(app.state.database, redis)
        event_log_service.bind_loop(asyncio.get_running_loop())
        app.state.event_log = event_log_service

        # -------------------------------------------------------------- #
        # HA 端点解析：连接器（3D HAConnectorService）为唯一 HA 通道，
        # 这里只保留静态端点读取，供旁路消费者（语音 / 摄像头 WS / 安防）取用。
        # -------------------------------------------------------------- #
        def _endpoint_loader():
            with app.state.database.session_factory() as session:
                # 传 cipher：令牌只以密文存在连接记录里，不传就解不出来，ha_configured 会误判为未配置。
                return load_ha_endpoints(session, cipher=app.state.studio_ha.cipher)


        async def _voice_rest_config() -> dict[str, Any]:
            """HA Assist 对话接口所需的 ``{haUrl, token}``（对齐 ``getConfigForRest``）。

            跟随连接器的活跃端点而不是静态的「内网优先」配置：内网不可达、连接器已切到外网时，
            Assist 若还打内网地址就会整段不可用。地址与令牌都取自连接记录（单源
            ``ha_connections``），令牌在解析时由同一处解密。
            """

            def _load() -> dict[str, Any]:
                with app.state.database.session_factory() as session:
                    endpoints_now = load_active_ha_endpoints(
                        session, cipher=app.state.studio_ha.cipher
                    )
                return {"haUrl": endpoints_now.ha_url_primary, "token": endpoints_now.token}

            return await asyncio.to_thread(_load)

        gateway = app.state.realtime
        state_store = gateway.state_store
        # 实体同步过滤共享视图：由 HaConnector 在注册表加载后 configure（对齐 Nest）。
        entity_sync_filter = HaEntitySyncFilterService()
        app.state.entity_sync_filter = entity_sync_filter

        # 单一 HA 连接：连接与 StateHub 由并入的 3D ``HAConnectorService`` 持有（见上方
        # ``studio3d_plane.install``）。homeos 既有连接器接口已**并入连接器本身**
        # （``ha.homeos_facade.HomeOSFacadeMixin``），因此这里不再包一层适配器：
        # ``app.state.ha_connector`` 与 ``app.state.studio_ha`` 是同一个对象，
        # 业务消费者与 3D 数据面共用同一条连接，调用点无需改写。
        ha_connector = app.state.studio_ha
        ha_connector.attach_state_store(state_store)
        ha_state_listener = _make_state_listener(app, gateway, state_store)
        ha_connector.set_state_listener(ha_state_listener)
        app.state.ha_connector = ha_connector
        app.state.entity_area = EntityAreaEnrichmentService(
            ha_connector, state_store, session_factory=app.state.database.session_factory
        )
        ha_connector.attach_sync_filter(
            entity_sync_filter,
            lambda: bool((app_config.get("haConnector") or {}).get("syncOnlyEnabledEntities", True)),
        )
        app.state.command_proxy = CommandProxyService(app.state.database.session_factory, ha_connector, redis)

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

        # -------------------------------------------------------------- #
        # 唯一 HA 连接的状态出口（融合点）
        # -------------------------------------------------------------- #
        # 连接器（3D ``HAConnectorService``）是唯一 HA 连接，所以它的连接生命周期就是
        # ``app.state.ha_connected`` 与 ``ha.connected`` / ``ha.disconnected`` /
        # ``ha.reconnecting`` 的唯一事实源。缺了这一环，gateway 的 ha_status 快照会
        # 永远报「未连接」，前端横幅就常驻「正在重连 Home Assistant…」。
        # 这里必须晚于上面的处理器注册：事件发出去时订阅方得已经在位。
        studio_connector = getattr(app.state, "studio_ha", None)
        if studio_connector is not None:

            async def _on_connector_connection(status: str, payload: dict[str, Any]) -> None:
                if status == "connected":
                    app.state.ha_connected = True
                    version = payload.get("ha_version")
                    if version:
                        app.state.ha_version = version
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

            # homeos 状态监听接管读模型：本连接器是唯一 HA 连接，所以它的全量快照与
            # 全量增量都直接走这里（``_make_state_listener`` → StateStore 的 set_all /
            # apply_change + ``ha.initial_states`` / ``ha.state_changed.batch`` 事件总线
            # + socket.io 广播）。StateHub 仍只承载 3D 侧 watched 子集，供 /ws/runtime。
            studio_connector.set_state_listener(ha_state_listener)

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
        security_service = SecurityService(
            app.state.database.session_factory, cipher=app.state.studio_ha.cipher
        )
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
        # 生活方式域：影音场景
        # -------------------------------------------------------------- #
        media_scene = MediaSceneService(ha_connector, app_config)
        media_scene.start()
        app.state.media_scene = media_scene

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
        users_backup = UsersBackupService(app.state.database.session_factory)
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

        business_backup = BackupCoordinator(app)
        business_backup.cleanup_startup()
        app.state.business_backup = business_backup

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
            app.state.ha_configured = bool(endpoints_now.ha_url_primary and endpoints_now.token)
            if not app.state.ha_configured:
                return
            try:
                await ha_connector.stop()
                # ``HAConnectorService.start`` 是**同步**方法（内部只建任务，见 ha/service.py）。
                # 适配器时代它是 async 空实现，折进后必须按同步调用：await None 会抛
                # TypeError，而这里恰好被 except 吞掉，结果「已按新地址重连」成为假日志。
                ha_connector.start()
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

        def _set_security_mode(mode: str, source: str) -> bool:
            # 家庭模式驱动安防时仍要求 ``module.security``，避免只买场景模式绕过安防门禁。
            license_service = getattr(app.state, "license_service", None)
            if license_service is not None and not license_service.allows(
                feature_codes.FEATURE_SECURITY
            ):
                return False
            panel = getattr(app.state, "security_panel", None)
            if panel is None:
                return True
            result = panel.set_mode(mode, source)
            if isinstance(result, dict):
                return bool(result.get("success", False))
            return bool(result)

        home_mode = HomeModeService(
            app.state.database.session_factory,
            ha_connector,
            state_store,
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
            cipher=app.state.studio_ha.cipher,
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
        # 连接器在 studio3d_plane.install 阶段已启动：这里必须沿用它的真实状态，否则会把
        # 可能已经置上的「已连接」按回 False（socket.io 首推快照与 /metrics 都读该字段）。
        app.state.ha_connected = bool(getattr(ha_connector, "connected", False))
        if not hasattr(app.state, "ha_version"):
            app.state.ha_version = None
        if app.state.ha_configured:
            try:
                # 同步方法（见 ha/service.py 的 ``def start``）；连接器自身做幂等，
                # 平面已启动过时再调一次是安全的。
                ha_connector.start()
            except Exception as exc:  # noqa: BLE001 - HA 不可用不应阻塞启动
                import logging as _logging

                _logging.getLogger("homeos.app").warning("HA 连接器启动失败: %s", exc)

        # 商业授权：门禁自举（公钥取回 / 状态恢复 / 续租循环）。
        await license_service.start()

        # 版本更新发现（可选）：失败静默降级，不影响其余服务。
        app.state.update_checker = UpdateChecker(
            app_settings.data_dir,
            app_settings.version,
            app_settings.update_channel,
            enabled=app_settings.update_checks_enabled,
            endpoints=app_settings.update_endpoints
            or (
                (f"{app_settings.store_url}{STORE_UPDATES_PATH}",)
                if app_settings.store_url
                else ()
            ),
        )
        app.state.update_checker.start()

        try:
            yield
        finally:
            try:
                await studio3d_plane.shutdown(app)
            except Exception as exc:  # noqa: BLE001 - 停机清理失败不应阻断其余清理
                logger.warning("3D 平面停机失败: %s", exc)
            try:
                await asyncio.wait_for(app.state.update_checker.stop(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            try:
                await asyncio.wait_for(license_service.stop(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            try:
                await asyncio.wait_for(database_retention.stop_schedule(), timeout=5)
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

    return lifespan
