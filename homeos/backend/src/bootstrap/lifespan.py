"""应用 lifespan：服务装配与停机清理。"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

from fastapi import FastAPI

from . import studio3d_plane
from ..config import Settings

if TYPE_CHECKING:
    # 仅用于 `_StartupContext.agent_service` 的注解：智能管家域的 14 个服务模块
    # 是 import diet 里最重的一串（`src.api.agent` 累计约 40 ms），改为在
    # `_build_agent_domain` 内部导入，让 `import src.app` 不再替启动期付这份钱。
    from ..domains.agent.runtime.service import AgentService

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
from ..domains.ui_config import UiConfigService
from ..domains.weather import WeatherAutoLinkageService, WeatherWatchService
from ..platform.core.db import schema
from ..platform.core.db.database import Database
from ..platform.core.http.resource_publication import recover_resource_publications
from ..platform.core.runtime.distributed_lock import DistributedLockService
from ..platform.core.runtime.log import configure_app_logging
from ..platform.core.runtime.observability import EventLoopLagMonitor
from ..platform.core.runtime.runtime_logs import RuntimeLogBuffer, install_runtime_log_handler
from ..realtime.domain_events import DomainEventBridge
from ..realtime.gateway import RealtimeGateway
from ..realtime.state_store import StateStore

logger = logging.getLogger("homeos.app")


def _parallel_startup_enabled() -> bool:
    """启动期叶子服务是否并发拉起；`HOMEOS_PARALLEL_STARTUP=0` 可一键回退串行。"""
    raw = os.environ.get("HOMEOS_PARALLEL_STARTUP", "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


async def _start_services(*starts: Awaitable[Any]) -> None:
    """按顺序或并发执行一组叶子服务的 start()。

    并发只用于彼此不读对方启动产物的服务；依赖顺序仍由调用点显式分成多批。
    回退开关走环境变量，便于线上出问题时不需要改代码/重建产物。
    """
    if _parallel_startup_enabled():
        await asyncio.gather(*starts)
        return
    for start in starts:
        await start


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
        sync_filter = getattr(app.state, "entity_sync_filter", None)
        if sync_filter is None or sync_filter.is_entity_syncable(str(entity_id)):
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
            broadcast_entities = entities
            if sync_filter is not None:
                broadcast_entities = sync_filter.filter_syncable_states(entities)
            # L1 必须收全量：隐藏/禁用只是展示策略，安全实体仍需要基线来做边沿判定。
            store.set_all(entities)
            app.state.ha_entity_count = len(broadcast_entities)
            presence = getattr(app.state, "presence", None)
            if presence is not None:
                try:
                    presence.seed_from_state_store()
                except Exception:  # 在场推断预热属 best-effort，失败不阻断初始快照
                    logger.warning("在场推断初始播种失败", exc_info=True)
            if bus is not None:
                # 广播全量事件
                await bus.emit("ha.initial_states", {"entities": broadcast_entities})
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
        sync_filter = getattr(app.state, "entity_sync_filter", None)
        applied: list[dict[str, Any]] = []
        for change in changes:
            if not isinstance(change, dict) or not change.get("entity_id"):
                continue
            result = await _run_state_change_effects(app, gateway, store, change, broadcast=False)
            if result is None:
                continue
            if sync_filter is not None and not sync_filter.is_entity_syncable(
                str(change.get("entity_id"))
            ):
                # 隐藏实体照样走安防/自动化副作用，只是不推给客户端。
                continue
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
        broadcast_entities = entities
        if sync_filter is not None:
            broadcast_entities = sync_filter.filter_syncable_states(entities)
        # 同 _listener：L1 收全量，仅广播按展示过滤。
        store.set_all(entities)
        app.state.ha_entity_count = len(broadcast_entities)

    return {
        "ha.state_changed": _handle_state_changed,
        "ha.state_changed.batch": _handle_state_changed_batch,
        "ha.initial_states": _handle_initial_states,
    }



SHUTDOWN_TIMEOUT = 5.0


async def _shutdown(
    what: str,
    stopper: Callable[[], Awaitable[Any]],
    *,
    event_log: Any = None,
) -> None:
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
        await _record_lifecycle_failure(
            event_log, what, f"{what}停机超时（{SHUTDOWN_TIMEOUT}s），已放弃等待"
        )
    except Exception as exc:
        logger.warning("%s停机失败：%s", what, exc)
        await _record_lifecycle_failure(event_log, what, f"{what}停机失败: {exc}")


async def _record_lifecycle_failure(event_log: Any, what: str, message: str) -> None:
    """生命周期故障留痕：进程日志 + 全局日志（用户能在「系统后台」里看到）。

    走 ``append_async``：停机路径上写日志不能同步占住事件循环（此时其它组件正在等
    超时，主循环被拖住会把 5s 的预算变成更长的假死）。写失败只降级成进程日志 ——
    停机阶段的收尾日志永远不能反过来打断停机。
    """
    logger.warning("%s", message)
    if event_log is None:
        return
    try:
        await event_log.append_async("warning", "系统后台", "生命周期", message, context={"phase": what})
    except Exception:
        logger.debug("生命周期故障写入全局日志失败: %s", what, exc_info=True)


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


async def _prepare_database_schema(app: FastAPI, startup: _StartupContext) -> None:
    """启动第零阶段：数据目录 / 中断还原回滚 / 建库与迁移。

    单独成 phase 有两个目的：``startup_phases`` 里能把「建库 + 迁移」的耗时与
    后面的服务装配分开看；并让这段纯同步 IO 走线程池，不再阻塞事件循环。
    """
    app_settings = startup.app_settings
    app_settings.data_dir.mkdir(parents=True, exist_ok=True)
    # 必须早于建库：先回滚中断的还原，避免在半还原的结构上继续建表。
    startup.recovery_required = await asyncio.to_thread(
        recover_interrupted_restore, app_settings
    )
    # 目录级发布（导图 / 用户素材）的崩溃收尾：改名死在两次 os.replace 之间时，日志文件
    # 还在磁盘上。必须早于建库（数据库可能引用这些目录）与素材目录扫描。
    await asyncio.to_thread(recover_resource_publications, app_settings)
    # 建库 + 迁移是纯同步 IO（SQLite 建表、执行迁移脚本、完整性校验），旧实现直接在
    # 事件循环里跑：迁移条数多的版本会把整个 loop 卡住，此时连 /health 都读不到，
    # 前端看到的「后端未就绪」窗口被无谓拉长。下放线程池后 loop 仍可响应。
    await asyncio.to_thread(schema.prepare_schema, app_settings)


async def _init_core_services(app: FastAPI, startup: _StartupContext) -> None:
    """启动第一阶段：数据库 / 日志 / 作业 / 授权 / 保留 / 事件日志。"""
    app_settings = startup.app_settings
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

    async def _on_ha_queue_dropped(payload: Any) -> None:
        """实时状态积压丢弃：广播给前端，触发重同步与乐观更新回滚。"""
        data = payload if isinstance(payload, dict) else {}
        await gateway.broadcast_ha_queue_dropped(data)

    state_handlers = _make_state_bus_handlers(app, gateway, state_store)
    for event, handler in {
        **state_handlers,
        "ha.connected": _on_ha_connected,
        "ha.disconnected": _on_ha_disconnected,
        "ha.reconnecting": _on_ha_reconnecting,
        "ha.queue_dropped": _on_ha_queue_dropped,
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


async def _build_ui_and_system_services(app: FastAPI, startup: _StartupContext) -> None:
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

    # 上次恢复中断时这里可能要复制/替换数据库并清理回退目录；放到线程池，
    # 避免启动阶段卡住事件循环（启动耗时与日志时间线都受影响）。
    await asyncio.to_thread(business_backup.cleanup_startup)
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
            logger.warning("HA 重连失败：%s", exc)
            await _record_lifecycle_failure(
                getattr(app.state, "global_log", None), "HA 连接器", f"HA 重连失败: {exc}"
            )

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
    """启动安防域需要异步首启的服务（四个服务互不读取对方的启动产物）。"""
    await _start_services(
        startup.security_panel.start(),
        startup.frigate.start(),
        startup.away_sim.start(),
        startup.presence.start(),
    )


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

    def _get_security_mode() -> str | None:
        panel = getattr(app.state, "security_panel", None)
        if panel is None:
            return None
        return panel.get_mode()

    home_mode = HomeModeService(
        app.state.database.session_factory,
        startup.ha_connector,
        startup.state_store,
        set_security_mode=_set_security_mode,
        get_security_mode=_get_security_mode,
        is_away_simulated_entity=startup.away_sim.contains_entity,
        emit_event=_emit_home_mode_event,
        is_leader=lambda: True,
        jobs=app.state.jobs,
    )
    await home_mode.start()
    app.state.home_mode = home_mode
    startup.home_mode = home_mode
    # 配置热更新：homeMode / security / ops 三段都影响家庭模式（定时触发器要用
    # ``ops.homeTimezone``，联动去重要用 ``security``）。不订阅的话这些值只在
    # ``start()`` 读一次，改完时区 / 开关必须重启才生效。
    security_bus.on("app.config.updated", home_mode.on_config_updated)
    # presence 的成员跟踪同样吃 ``security`` 段（person 实体、阈值），一并订阅。
    security_bus.on("app.config.updated", startup.presence.on_config_updated)

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
    # 智能管家域的服务模块在此按需导入：它们是启动期最重的一串 import，
    # 放在阶段内导入可让 `import src.app` 只付「应用骨架」的钱。
    from ..domains.agent.mcp.mcp_service import McpGatewayService
    from ..domains.agent.memory.command_cache import CommandCacheService
    from ..domains.agent.memory.memory_store import AgentMemoryService
    from ..domains.agent.memory.session_store import AgentSessionStoreService
    from ..domains.agent.memory.short_term_memory import AgentShortTermMemoryService
    from ..domains.agent.policy.budget import AgentBudgetService
    from ..domains.agent.providers.resolving_llm_provider import ResolvingLlmProvider
    from ..domains.agent.runtime.area_service import AgentAreaService
    from ..domains.agent.runtime.config_service import AgentConfigService
    from ..domains.agent.runtime.fast_path import FastPathService
    from ..domains.agent.runtime.lang_template_service import LangTemplateService
    from ..domains.agent.runtime.service import AgentService
    from ..domains.agent.tools.home_tools_service import HomeToolsService

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

    # 自动化族（时序 / 诊断 / 家规 / 联网搜索 / 计划任务 / 看门狗）单独装配：
    # 服务多、依赖交叉，拆出去避免把本函数撑成「什么都装」的长函数。
    env_context = _build_agent_automation(app, startup, app_config, agent_config, home_tools)

    fast_path = FastPathService(
        agent_area,
        startup.state_store,
        lang_templates,
        event_bus=startup.security_bus,
        agent_config=agent_config,
    )
    fast_path.bind_events()
    app.state.agent_fast_path = fast_path

    command_cache = CommandCacheService(app.state.database.session_factory)
    app.state.agent_command_cache = command_cache

    # 会话记忆分两层：10 分钟长会话（内存 LRU + DB 持久化）+ 45s 短时滑窗（纯内存）
    agent_sessions = AgentSessionStoreService(app.state.database.session_factory)
    app.state.agent_sessions = agent_sessions
    app.state.agent_short_term = AgentShortTermMemoryService()
    # 长期记忆：设备 / 房间别名与用户偏好
    agent_memory = AgentMemoryService(app.state.database.session_factory)
    app.state.agent_memory = agent_memory
    # 每日用量预算（token / 成本，按登录用户累计；环境变量可调）
    app.state.agent_budget = AgentBudgetService()

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
        app.state.agent_budget,
        app.state.global_log,
        memory=agent_memory,
        env_context=env_context,
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
        lang_templates=lang_templates,
    )


def _build_agent_automation(
    app: FastAPI,
    startup: _StartupContext,
    app_config: Any,
    agent_config: Any,
    home_tools: Any,
) -> Any:
    """装配智能管家自动化族，返回环境上下文服务（供系统提示注入）。

    时序与诊断订阅状态变更总线，写库全在后台任务里；调度器 / 看门狗只先拿工具服务，
    通知服务在下一阶段就绪后再 ``bind_notification`` 并 ``start``。
    """
    from ..domains.agent.memory.timeline import AgentTimelineService
    from ..domains.agent.policy.policy import AgentPolicyService
    from ..domains.agent.policy.scheduler import AgentSchedulerService
    from ..domains.agent.policy.watchdog import AgentWatchdogService
    from ..domains.agent.runtime.diagnostics import AgentDiagnosticsService
    from ..domains.agent.runtime.env_context import HomeEnvironmentContextService
    from ..domains.agent.runtime.web_search import AgentWebSearchService

    session_factory = app.state.database.session_factory

    agent_timeline = AgentTimelineService(
        session_factory,
        startup.state_store,
        enrichment=app.state.entity_area,
        event_bus=startup.security_bus,
    )
    agent_timeline.bind_events()
    app.state.agent_timeline = agent_timeline

    agent_diagnostics = AgentDiagnosticsService(
        app.state.global_log,
        startup.state_store,
        event_bus=startup.security_bus,
    )
    agent_diagnostics.bind_events()
    app.state.agent_diagnostics = agent_diagnostics

    agent_policy = AgentPolicyService(session_factory)
    app.state.agent_policy = agent_policy

    # 家庭时区 / 天气 / 日出日落：注入系统提示，也给 cron 任务用作默认时区
    env_context = HomeEnvironmentContextService(startup.state_store, app_config)
    app.state.agent_env_context = env_context

    agent_web_search = AgentWebSearchService(env=os.environ)
    app.state.agent_web_search = agent_web_search

    agent_scheduler = AgentSchedulerService(
        session_factory,
        tools=home_tools,
        jobs=app.state.jobs,
        timezone_provider=env_context.timezone_name,
    )
    app.state.agent_scheduler = agent_scheduler

    agent_watchdog = AgentWatchdogService(
        home_tools,
        agent_config,
        areas=app.state.entity_area,
        state_store=startup.state_store,
        timeline=agent_timeline,
        policy=agent_policy,
        presence=startup.presence,
        session_factory=session_factory,
        jobs=app.state.jobs,
    )
    app.state.agent_watchdog = agent_watchdog

    home_tools.bind_automation(
        scheduler=agent_scheduler,
        policy=agent_policy,
        timeline=agent_timeline,
        diagnostics=agent_diagnostics,
        web_search=agent_web_search,
        watchdog=agent_watchdog,
    )
    return env_context


async def _build_channels_and_notification(app: FastAPI, startup: _StartupContext) -> None:
    """构造消息通道域、客户端电量联动、通知域与实体反向引用。"""
    # 主动管家依赖智能管家域的 home_tools / agent_config，故在本阶段内导入。
    from ..domains.agent.policy.proactive import AgentProactiveService

    app_config = startup.app_config

    # 消息通道：Email / WebPush / 企业微信（Phase 6）
    channel_config = ChannelConfigService(startup.ui_config, event_bus=startup.security_bus)
    channel_config.bind_events()
    app.state.channel_config = channel_config

    email_service = EmailService(channel_config, event_bus=startup.security_bus)
    email_service.bind_events()
    app.state.email_service = email_service

    web_push_service = WebPushService(
        channel_config, app.state.database.session_factory, event_bus=startup.security_bus
    )
    web_push_service.bind_events()
    app.state.web_push_service = web_push_service

    wecom_service = WecomService(channel_config, event_bus=startup.security_bus)
    wecom_service.bind_events()
    app.state.wecom_service = wecom_service

    # 三个通道各自只读配置/自检；先全部构造完再并发启动，避免启动顺序改变装配结果。
    await _start_services(
        email_service.reload(),
        web_push_service.start(),
        wecom_service.start(),
    )

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

    # 主动管家：定时巡检 + 简报（只读工具 → 通知中心；默认关闭，配置见 agentConfig.proactive）
    proactive = AgentProactiveService(
        app.state.home_tools,
        app.state.agent_config,
        notification=notification,
        jobs=app.state.jobs,
    )
    await proactive.start()
    app.state.agent_proactive = proactive

    # 计划任务 / 看门狗：依赖通知服务（失败告警 / 空转提醒），在通知就绪后才启动
    agent_scheduler = getattr(app.state, "agent_scheduler", None)
    if agent_scheduler is not None:
        agent_scheduler.bind_notification(notification)
        await _start_services(agent_scheduler.start())
    agent_watchdog = getattr(app.state, "agent_watchdog", None)
    if agent_watchdog is not None:
        agent_watchdog.bind_notification(notification)
        presence_service = getattr(app.state, "presence", None)
        if presence_service is not None:
            agent_watchdog.bind_presence(presence_service)
        await _start_services(agent_watchdog.start())

    # 实体反向引用：布局 / 家庭模式 / 告警规则 / 系统配置 的「哪些功能引用了该实体」
    alert_rule_watch_index = AlertRuleWatchIndex()
    app.state.alert_rule_watch_index = alert_rule_watch_index
    app.state.entity_references = EntityReferencesService(
        app.state.database.session_factory,
        app_config,
        startup.ui_config,
        alert_rule_watch_index,
        update_home_mode=startup.home_mode.update_sync,
        reload_home_mode_triggers=startup.home_mode.reload_trigger_bindings,
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
    app.state.eew_leader = eew_leader
    startup.eew_leader = eew_leader

    # 两个叶子服务不互相依赖；earthquake/eew_poll/catalog_notify 依赖 eew_leader 已就绪，
    # 因此仍放在下一批串行启动。
    await _start_services(weather_watch.start(), eew_leader.start())

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
            logger.warning("HA 连接器启动失败：%s", exc)
            await _record_lifecycle_failure(
                getattr(app.state, "global_log", None), "HA 连接器", f"HA 连接器启动失败: {exc}"
            )

    # 商业授权：门禁自举（公钥取回 / 状态恢复 / 续租循环）。
    await startup.license_service.start()

    # 商店对外地址的解析器（登录页的「忘记密码 / 商店」链接要用）。**启动时不联网** ——
    # 真正取回发生在登录页请求 /public/config 时；这里只把状态挂上（见 domains/store/
    # discovery.py）。显式 APP_STORE_URL 时它一次网络请求都不会发。
    app.state.store_base_url_resolver = StoreBaseUrlResolver(app_settings)


async def _shutdown_agent_automation(app: FastAPI, shutdown: Callable[..., Awaitable[Any]]) -> None:
    """停止看门狗与计划任务（先停巡检，避免停机过程中再触发设备控制）。"""
    for service, label in (
        (getattr(app.state, "agent_watchdog", None), "看门狗"),
        (getattr(app.state, "agent_scheduler", None), "计划任务"),
    ):
        if service is not None:
            await shutdown(label, service.stop)


async def _shutdown_all(app: FastAPI, startup: _StartupContext) -> None:
    """停机全部组件：逐个隔离超时 / 异常，最后释放数据库。"""
    loop_lag = getattr(app.state, "loop_lag", None)
    event_log = getattr(app.state, "global_log", None)

    async def shutdown(what: str, stopper: Callable[[], Awaitable[Any]]) -> None:
        # 统一带上全局日志：停机失败既要进进程日志，也要让用户在「系统后台」看得到。
        await _shutdown(what, stopper, event_log=event_log)

    if loop_lag is not None:
        await shutdown("事件循环延迟采样", loop_lag.stop)
    await shutdown("3D 平面", lambda: studio3d_plane.shutdown(app))
    await shutdown("授权服务", startup.license_service.stop)
    await shutdown("数据库保留调度", startup.database_retention.stop_schedule)
    await shutdown("外部 API", startup.external_api.stop)
    for service, label in (
        (startup.presence, "在场检测"),
        (startup.mmwave, "毫米波"),
        (startup.away_sim, "离家模拟"),
    ):
        await shutdown(label, service.stop)
    await shutdown("家庭模式", startup.home_mode.stop)
    proactive = getattr(app.state, "agent_proactive", None)
    if proactive is not None:
        await shutdown("主动管家", proactive.stop)
    await _shutdown_agent_automation(app, shutdown)
    await shutdown("通知", startup.notification.stop)
    channels_service = getattr(app.state, "channels_service", None)
    if channels_service is not None:
        await shutdown("消息通道", channels_service.stop)
    for service, label in (
        (startup.catalog_notify, "目录通知"),
        (startup.eew_poll, "地震预警轮询"),
        (startup.earthquake, "地震服务"),
        (startup.eew_leader, "地震预警主节点"),
    ):
        await shutdown(label, service.stop)
    for service, label in (
        (startup.weather_watch, "天气监视"),
        (startup.advisor_usage, "顾问用量"),
    ):
        await shutdown(label, service.stop)
    await shutdown("HA 连接器", startup.ha_connector.stop)
    await shutdown("状态汇聚", startup.state_ingress_coalesce.close)
    # 媒体代理的共享连接池：延迟导入，避免 lifespan 在模块级拉进整条 API 依赖链。
    from ..api.ha.proxy import close_shared_media_clients
    await shutdown("媒体代理连接池", close_shared_media_clients)
    await shutdown("事件日志刷盘", startup.event_log_service.flush)
    # 全局日志最后刷盘：必须等所有组件停止后再关写线程，否则停机期间产生的诊断日志
    # 会滞留在内存队列里丢掉。
    if event_log is not None:
        await shutdown("全局日志刷盘", lambda: asyncio.to_thread(event_log.close, 5.0))
    startup.auto_backup.stop()
    # 调度器停掉不代表正在跑的备份线程已经结束；先等协调器锁空闲再释放数据库，
    # 否则备份线程可能在 VACUUM/zip 时撞上已 dispose 的连接。等待有上界，
    # 超时则不 dispose（进程即将退出，交给 OS 回收），避免制造 use-after-dispose。
    dispose_database = True
    coordinator = getattr(app.state, "business_backup", None)
    if coordinator is not None:
        try:
            await asyncio.wait_for(coordinator.wait_idle(), 10.0)
        except TimeoutError:
            dispose_database = False
            logger.warning("备份作业仍在执行，跳过数据库 dispose 以免中途释放连接")
    database = getattr(app.state, "database", None)
    if database is not None and dispose_database:
        database.dispose()


@asynccontextmanager
async def _startup_phase(app: FastAPI, name: str):
    """记录一个顶层启动阶段的耗时；不改变阶段内的调用顺序与异常语义。"""
    started = time.perf_counter()
    try:
        yield
    finally:
        phases = getattr(app.state, "startup_phases", None)
        if phases is None:
            phases = []
            app.state.startup_phases = phases
        phases.append((name, round((time.perf_counter() - started) * 1000.0, 2)))


def create_lifespan(app_settings: Settings, version: str):
    """构造 FastAPI lifespan 上下文管理器。"""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        startup_started = time.perf_counter()
        app.state.startup_phases = []
        startup = _StartupContext(app_settings=app_settings, version=version)
        async with _startup_phase(app, "schema"):
            await _prepare_database_schema(app, startup)
        async with _startup_phase(app, "core_services"):
            await _init_core_services(app, startup)
        loop_lag = EventLoopLagMonitor()
        app.state.loop_lag = loop_lag
        async with _startup_phase(app, "loop_lag_start"):
            await loop_lag.start()
        async with _startup_phase(app, "realtime_pipeline"):
            _install_realtime_state_pipeline(app, startup)
            _register_ha_event_handlers(app, startup)
        async with _startup_phase(app, "security_services_build"):
            _build_security_services(app, startup)
        async with _startup_phase(app, "ui_system_services"):
            await _build_ui_and_system_services(app, startup)
        async with _startup_phase(app, "security_services_publish"):
            _install_ha_reconnect_handlers(app, startup)
            _publish_security_services(app, startup)
        async with _startup_phase(app, "security_services_start"):
            await _start_security_services(app, startup)
        async with _startup_phase(app, "home_mode"):
            await _build_home_mode(app, startup)
        async with _startup_phase(app, "agent_domain"):
            await _build_agent_domain(app, startup)
        async with _startup_phase(app, "channels_notification"):
            await _build_channels_and_notification(app, startup)
        async with _startup_phase(app, "awareness_events"):
            await _build_awareness_and_events(app, startup)
        async with _startup_phase(app, "weather_earthquake"):
            await _build_weather_and_earthquake(app, startup)
        async with _startup_phase(app, "ha_license"):
            await _start_ha_and_license(app, startup)
        app.state.startup_duration_ms = round((time.perf_counter() - startup_started) * 1000.0, 2)
        logger.info(
            "应用启动完成: %.1f ms phases=%s",
            app.state.startup_duration_ms,
            app.state.startup_phases,
        )

        try:
            yield
        finally:
            await _shutdown_all(app, startup)

    return lifespan
