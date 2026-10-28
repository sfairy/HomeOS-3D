"""Home Assistant 连接器服务（宿主类：生命周期、监听器、通知分发）。"""

from __future__ import annotations

import asyncio
import inspect
import random
import time
from collections import (
    Counter,
    OrderedDict,
)
from contextvars import copy_context
from typing import Any

from sqlalchemy import select

from .control_pool import HAControlPool
from .crypto import CredentialCipher
from .endpoints import HAEndpoint
from .homeos_facade import HomeOSFacadeMixin
from .http_pool import HAHttpClientPool
from .service_contract import HAConnectorHost
from .service_endpoint import HAEndpointMixin
from .service_live import HALiveMixin
from .service_registry import HARegistryMixin
from .service_support import (
    _HA_TUNING_TTL_SECONDS,
    HISTORY_FETCH_CONCURRENCY,
    LOGGER,
)
from .service_sync import HASyncMixin
from .state_hub import StateHub
from ...app_config.defaults import DEFAULT_APP_CONFIG
from ...logs.global_log import (
    GlobalLogStore,
    event_context,
)
from ....config import Settings
from ....platform.core.app_config import load_raw_config
from ....platform.core.database import Database
from ....platform.core.models import HAConnection
from ....platform.core.observability import record_ha_counter


class HAConnectorService(
    HAEndpointMixin,
    HALiveMixin,
    HARegistryMixin,
    HASyncMixin,
    HAConnectorHost,
    HomeOSFacadeMixin,
):
    """HA 连接器：同步 / 实时事件 / 状态分发；各族实现见 ``service_*.py``。"""

    def __init__(
        self,
        settings: Settings,
        database: Database,
        event_log: GlobalLogStore | None = None,
    ) -> None:
        self.settings = settings
        self.database = database
        self.event_log = event_log
        self.cipher = CredentialCipher(settings.credential_key_path)
        self.state_hub = StateHub()
        self._runner = None
        # 停/起/重启必须互斥：并发 stop 与 restart 会把子任务与连接池拆成两半。
        self._lifecycle_lock = asyncio.Lock()
        # 设备控制请求的连接池（按连接隔离，见 HAControlPool）。
        # 传方法引用而非实例：池要取「当前活跃连接」的配置，而活跃连接随时可能换。
        self._control_pool = HAControlPool(self._control_configuration)
        # 读取类请求（探测 / 状态 / 历史）的共享 HTTP 池，与上面的控制池同生命周期。
        self._http_pool = HAHttpClientPool()
        # 重连抖动专用随机源：可注入（测试断言上下界），也不与全局 random 抢种子。
        self._jitter_random = random.Random()
        self._sync_lock = asyncio.Lock()
        # 实时链路的后台周期对账任务（见 HASyncMixin.schedule_reconcile）。
        self._reconcile_task: asyncio.Task[Any] | None = None
        # 最近一次全量同步的轻量基线，供 subscribe_entities 解码器抑制重连重复派发。
        self._live_seed: dict[str, tuple[str, float | None]] = {}
        # 最近一次全量同步成功的单调时钟（秒）；重连时用于判定能否跳过全量。
        self._last_full_sync_at: float = 0.0
        self._database_lock = asyncio.Lock()
        self._connected = False
        self._runtime_error = None
        # 重连失败日志状态（见 service_live._log_cycle_failure）：本轮故障归类和上次提示时刻，
        # 用来把「HA 停机时每分钟 6 轮」的同一条失败压成一行。
        self._failure_kind: str | None = None
        self._failure_logged_at = 0.0
        self._offline_since: float | None = None
        # 连接生命周期外发通道：homeos 侧据此维护 app.state.ha_connected 与 ha.* 事件。
        # 融合后本连接器是唯一 HA 连接，因此它也是「HA 是否在线」的唯一事实源。
        self._connection_listener: Any = None
        self._last_connection_status: str | None = None
        # homeos 状态监听：接收全量快照与全量增量。StateHub 只承载 3D 侧 watched
        # 子集，而 homeos 读模型与 socket.io 广播需要全部实体，所以两者分开走。
        self._state_listener: Any = None
        self._known_entity_ids = set()
        self._incremental_flushed_at = { }
        self._persistent_entity_ids = set()
        self._runtime_entity_watch_counts = Counter()
        self._watch_lock = asyncio.Lock()
        self._registry_refresh_tasks = { }
        self._history_semaphore = asyncio.Semaphore(HISTORY_FETCH_CONCURRENCY)
        # 缓存用 OrderedDict 做 O(1) LRU：超限时用 `min(...)` 找最旧键是 O(n) 且持锁执行，
        # 而历史缓存上限 256、翻译缓存 32，清理一旦触发就会阻塞并发请求。
        self._history_cache: OrderedDict[tuple[str, str, int], tuple[float, list[dict[str, Any]]]] = OrderedDict()
        self._history_fetches: dict[tuple[str, str, int], asyncio.Task[list[dict[str, Any]]]] = {}
        self._history_cache_lock = asyncio.Lock()
        # 历史缓存的「代」：每次作废（停连 / 换连接）自增。进行中的查询带着发起时的代，
        # 回来发现代变了就只把结果交给调用方、不写回缓存 —— 否则一次换连接后旧连接的数据
        # 会重新灌进新缓存，图表显示上一台 HA 的历史。
        self._history_generation = 0
        self._translation_cache: OrderedDict[tuple[str, str, tuple[str, ...]], tuple[float, dict[str, str]]] = OrderedDict()
        self._translation_lock = asyncio.Lock()
        self._initial_sync_logged = False
        self._endpoint: HAEndpoint | None = None
        self._endpoint_signature: tuple | None = None
        self._endpoint_probed_at = 0.0
        self._endpoint_lock = asyncio.Lock()
        # haConnector / other 高级参数缓存（5s TTL），供重连退避、心跳、历史缓存读取。
        self._ha_tuning_cache: dict[str, Any] | None = None
        self._ha_tuning_at = 0.0

    # 高级参数（haConnector / other）

    def _ha_tuning(self) -> dict[str, Any]:
        """读取 haConnector / other 分区运行参数（缺省合并 DEFAULT_APP_CONFIG）。

        5s TTL 缓存，避免重连循环与每次历史查询都读库；读写失败一律回退默认值。
        """
        now = time.monotonic()
        if self._ha_tuning_cache is not None and now - self._ha_tuning_at < _HA_TUNING_TTL_SECONDS:
            return self._ha_tuning_cache
        connector = dict(DEFAULT_APP_CONFIG.get('haConnector') or {})
        other = dict(DEFAULT_APP_CONFIG.get('other') or {})
        try:
            with self.database.session_factory() as session:
                raw = load_raw_config(session)
            connector_raw = raw.get('haConnector')
            if isinstance(connector_raw, dict):
                connector.update(connector_raw)
            other_raw = raw.get('other')
            if isinstance(other_raw, dict):
                other.update(other_raw)
        except Exception:  # 本配置节缺失/格式坏则保留默认值，继续解析其余节
            pass
        cfg = {'haConnector': connector, 'other': other}
        self._ha_tuning_cache = cfg
        self._ha_tuning_at = now
        return cfg

    def _log_event(self, level: str, category: str, message: str, *, details: str | None = None) -> None:
        if self.event_log is not None:
            self.event_log.append(level, 'Home Assistant', category, message, details = details)

    @property

    def connected(self) -> bool:
        return self._connected

    @property

    def runtime_error(self) -> str | None:
        return self._runtime_error

    @property

    def endpoint_kind(self) -> str | None:
        return self._endpoint.kind if self._endpoint is not None else None

    @property

    def active_base_url(self) -> str | None:
        return self._endpoint.base_url if self._endpoint is not None else None

    def start(self) -> None:
        if self._runner is not None and not self._runner.done():
            return
        # stop() 关过连接池（aclose 之后不可再用）：重启前换一个新的。
        if self._control_pool.closed:
            self._control_pool = HAControlPool(self._control_configuration)
        if self._http_pool.closed:
            self._http_pool = HAHttpClientPool()
        context = copy_context()
        context.run(event_context.set, { })
        self._runner = asyncio.create_task(self._run(), name = 'ha-connector', context = context)

    async def stop(self) -> None:
        """停掉主循环与所有子任务，等待它们真正结束。

        与 ``start`` / ``restart`` 共用一把生命周期锁：并发的 stop / restart 不能交错执行，
        否则会出现「新连接刚建好就被旧 stop 关掉连接池」这类竞态。
        """
        async with self._lifecycle_lock:
            await self._stop()

    async def _stop(self) -> None:
        """真正执行停机：先让连接池拒绝新租约，再收尾任务与主循环。

        顺序刻意固定：``invalidate`` 放在最前面 —— 之后新来的控制请求会立刻失败，
        而不是排在一个即将关闭的池后面干等。
        """
        pool = self._control_pool
        http_pool = self._http_pool
        pool.invalidate()
        http_pool.invalidate()
        try:
            await self._stop_tasks()
        finally:
            # 无论任务收尾是否正常，连接都必须关掉，字段也要复位。
            self._connected = False
            await pool.aclose()
            await http_pool.aclose()

    async def _stop_tasks(self) -> None:
        """取消并等待所有后台子任务与主循环。

        先取消子任务（防抖中的注册表刷新、进行中的历史查询、周期对账）再取消主循环，
        否则主循环退出后这些任务会变成没人回收的孤儿任务。
        """
        reconcile = self._reconcile_task
        self._reconcile_task = None
        if reconcile is not None:
            reconcile.cancel()
            await asyncio.gather(reconcile, return_exceptions = True)
        endpoint_probe = getattr(self, '_endpoint_probe_task', None)
        self._endpoint_probe_task = None
        if endpoint_probe is not None:
            endpoint_probe.cancel()
            await asyncio.gather(endpoint_probe, return_exceptions = True)
        registry_tasks = list(self._registry_refresh_tasks.values())
        self._registry_refresh_tasks.clear()
        for task in registry_tasks:
            task.cancel()
        if registry_tasks:
            await asyncio.gather(*registry_tasks, return_exceptions = True)
        history_tasks = list(self._history_fetches.values())
        self._history_fetches.clear()
        # 先作废缓存再取消任务：在飞的查询即使没被取消干净，也会因「代」不符而不写回。
        async with self._history_cache_lock:
            self._history_generation += 1
            self._history_cache.clear()
        for task in history_tasks:
            task.cancel()
        if history_tasks:
            await asyncio.gather(*history_tasks, return_exceptions = True)
        if self._runner is None:
            return
        self._runner.cancel()
        try:
            await self._runner
        except asyncio.CancelledError:
            # 主动取消，属预期路径。
            pass
        self._runner = None
        self._connected = False

    async def restart(self) -> None:
        async with self._lifecycle_lock:
            await self._stop()
            self._runtime_error = None
            self.invalidate_endpoint()
            self.start()

    def active_connection(self) -> HAConnection | None:
        with self.database.session_factory() as database:
            return database.scalar(select(HAConnection).where(HAConnection.is_active.is_(True)))

    async def _run_database(self, operation, *args, **kwargs):
        """串行化连接器的数据库操作，同时不阻塞异步服务循环。"""
        async with self._database_lock:
            return await asyncio.to_thread(operation, *args, **kwargs)

    def set_connection_listener(self, listener: Any) -> None:
        """注册连接生命周期监听（``listener(status, payload)``，可为同步或协程）。"""
        self._connection_listener = listener

    def set_state_listener(self, listener: Any) -> None:
        """注册状态监听（``listener(kind, payload)``）：``initial`` 收全量、``change`` 收增量。

        对齐原 homeos ``HaConnectorService`` 的同名契约：homeos 读模型
        （``StateStore``）的 ``set_all`` / ``apply_change``、``ha.initial_states`` /
        ``ha.state_changed.batch`` 事件总线与 socket.io 广播，全部由这条流驱动。
        """
        self._state_listener = listener

    async def _notify_state(self, kind: str, state_update: Any) -> None:
        """外发一次状态（失败不拖垮连接循环：状态外发是旁路，不是主链路）。"""
        listener = self._state_listener
        if listener is None:
            return
        try:
            result = listener(kind, state_update)
            if inspect.isawaitable(result):
                await result
        except Exception:
            LOGGER.debug('HA 状态外发失败: %s', kind, exc_info = True)

    async def _notify_connection(self, status: str, **extra: Any) -> None:
        """外发一次连接状态变化。

        连续相同的状态去重：重连风暴里每个失败周期都会走同一条路径，
        不去重会把前端横幅刷成高频重连提示。

        除了既有的生命周期监听器（socket.io 侧），这里还把状态推进 ``StateHub``：
        ``/ws/runtime``（3D 墙屏）订阅的是 StateHub，拿不到 socket.io 的 ``ha_status``，
        于是 HA 掉线时墙屏只会看到「数值再也不变」，无法区分「设备关着」与「中枢失联」。
        """
        # StateHub 推送不受去重影响：新连上的墙屏需要立刻拿到当前状态（见
        # ``_runtime_subscribe_and_stream`` 的快照）。它按事件类型走同一条队列。
        await self.state_hub.publish({
            'type': 'ha_status',
            'status': status,
            **{key: value for key, value in extra.items() if value is not None},
        })
        listener = self._connection_listener
        if status == 'reconnecting':
            record_ha_counter('reconnect')
        if listener is None or status == self._last_connection_status:
            return
        self._last_connection_status = status
        try:
            result = listener(status, extra)
            if inspect.isawaitable(result):
                await result
        except Exception:
            LOGGER.debug('HA 连接状态外发失败: %s', status, exc_info = True)
