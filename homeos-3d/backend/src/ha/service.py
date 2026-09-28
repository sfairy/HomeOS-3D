"""Home Assistant 连接器服务：同步、实时事件与状态分发的主循环。
"""
from __future__ import annotations
import asyncio
import json
import time
import traceback
from collections import Counter
from collections.abc import Callable
from contextvars import copy_context
from typing import Any
from sqlalchemy import func, select
from ..config import Settings
from ..core.database import Database
from ..core.models import HAArea, HAConnection, HADevice, HAEntity, HASyncState, ProjectDraft
from ..core.time_utils import utc_now
from ..panel.global_popups import global_popups
from ..observability.global_log import GlobalLogStore, _safe_text, event_context
from ..panel.documents import parse_document
from ..panel.entity_refs import document_entity_ids
from .client import HAClient, HAClientError
from .crypto import CredentialCipher
from .endpoints import HAEndpoint, connection_endpoints, endpoint_signature
from .state_hub import StateHub
# 当前端点的复用窗口（秒）。在用的这一路每隔这么久复探一次：内网可能已经恢复（回家、
HA_ENDPOINT_RECHECK_SECONDS = 60
# 补拉状态的重试退避（秒）：共尝试 3 次（首次 + 两次重试），
STATE_FETCH_RETRY_DELAYS = (0.2, 0.6)
HISTORY_FETCH_CONCURRENCY = 2
HISTORY_CACHE_SECONDS = 30
# 判断「状态是否不完整、值得再拉一次」的关键属性表。HA 启动初期或集成重载时会先返回
STATE_FETCH_REQUIRED_ATTRIBUTES = {
    'climate': {
        'fan_modes',
        'hvac_modes',
        'swing_modes',
        'temperature',
        'preset_modes',
        'supported_features',
        'current_temperature'} }

def state_requires_fetch_retry(entity_id: str, state: dict | None) -> bool:
    """判断某个实体的状态是否缺失或残缺、需要重新拉取。"""
    domain = entity_id.partition('.')[0]
    required_attributes = STATE_FETCH_REQUIRED_ATTRIBUTES.get(domain)
    if required_attributes is None:
        if state is None:
            return True
        # 不在白名单里的域只要有状态就算完整；sensor 例外：unknown / unavailable 是
        return domain == 'sensor' and str(state.get('state') or '').strip().casefold() in frozenset({'unknown', 'unavailable'})
    attributes = state.get('attributes') if isinstance(state, dict) else None
    # 属性表缺失，或必备属性一个都没有 —— 两种情况都按残缺处理。
    return not isinstance(attributes, dict) or not required_attributes.intersection(attributes)

from .contracts import (
    LOGGER,
)
from .registry import HARegistryMixin
from .live import HALiveMixin

class HAConnectorService(HARegistryMixin, HALiveMixin):
    """HA 连接器的生命周期与同步逻辑。
    """

    def __init__(
        self,
        settings: Settings,
        database: Database,
        event_log: GlobalLogStore | None = None,
        on_reconnect: Callable[[], None] | None = None,
        on_endpoint_switch: Callable[[], None] | None = None,
    ) -> None:
        """参数：
        """
        self.settings = settings
        self.database = database
        self.event_log = event_log
        self._on_reconnect = on_reconnect
        self._on_endpoint_switch = on_endpoint_switch
        # 令牌加解密器：数据库里存的是密文，密钥文件由 crypto 自行管理。
        self.cipher = CredentialCipher(settings.credential_key_path)
        self.state_hub = StateHub()
        # 后台主循环任务；None 表示未启动。
        self._runner = None
        # 保证同一时刻只有一份全量快照在写库（sync_once 与注册表刷新共用）。
        self._sync_lock = asyncio.Lock()
        # 串行化数据库操作，见 _run_database。
        self._database_lock = asyncio.Lock()
        self._connected = False
        self._runtime_error = None
        # 已落库的 (connection_id, entity_id) 集合，用于判断事件是不是新实体。
        self._known_entity_ids = set()
        # connection_id -> 上次增量写库的时间戳（time.monotonic），实现写入节流。
        self._incremental_flushed_at = { }
        # 页面/弹窗里引用到的实体集合，随草稿变化刷新。
        self._persistent_entity_ids = set()
        # 运行期订阅计数：同一实体可能被多个打开中的页面同时订阅，计数到 0 才真正取消关注。
        self._runtime_entity_watch_counts = Counter()
        # 保护上面两个集合/计数的读写（它们会被多个协程并发访问）。
        self._watch_lock = asyncio.Lock()
        # connection_id -> 防抖中的注册表刷新任务。
        self._registry_refresh_tasks = { }
        self._history_semaphore = asyncio.Semaphore(HISTORY_FETCH_CONCURRENCY)
        self._history_cache = { }
        self._history_fetches = { }
        self._history_cache_lock = asyncio.Lock()
        self._initial_sync_logged = False
        # 当前可用端点（内网优先）：所有出网调用都从它取地址与证书校验开关。
        self._endpoint: HAEndpoint | None = None
        self._endpoint_signature: tuple | None = None
        self._endpoint_probed_at = 0.0
        # 单飞：并发请求同时发现缓存过期时只探一轮，不叠加成 N 轮探测。
        self._endpoint_lock = asyncio.Lock()

    def _log_event(self, level: str, category: str, message: str, *, details: str | None = None) -> None:
        """写一条事件日志；event_log 缺失时静默跳过。"""
        if self.event_log is not None:
            self.event_log.append(level, 'Home Assistant', category, message, details = details)

    @property
    def connected(self) -> bool:
        """当前是否处于已连接（WebSocket 已鉴权）状态。"""
        return self._connected

    @property
    def runtime_error(self) -> str | None:
        return self._runtime_error

    @property
    def endpoint_kind(self) -> str | None:
        """当前在用的端点类型（'internal' / 'external'）；还没探过时为 None。
        """
        return self._endpoint.kind if self._endpoint is not None else None

    @property
    def active_base_url(self) -> str | None:
        """当前在用端点的地址；还没探过时为 None。"""
        return self._endpoint.base_url if self._endpoint is not None else None

    def start(self) -> None:
        """启动后台主循环（幂等：已在运行时不重复创建任务）。"""
        if self._runner is not None and not self._runner.done():
            return
        # 复制一份干净的 contextvars：后台任务常驻，不能继承调用方（通常是某个 HTTP
        context = copy_context()
        context.run(event_context.set, { })
        self._runner = asyncio.create_task(self._run(), name = 'ha-connector', context = context)

    async def stop(self) -> None:
        """停掉主循环与所有子任务，等待它们真正结束。
        """
        registry_tasks = list(self._registry_refresh_tasks.values())
        self._registry_refresh_tasks.clear()
        for task in registry_tasks:
            task.cancel()
        # return_exceptions=True：被取消的任务会抛 CancelledError，这里只是等它们收尾。
        if registry_tasks:
            await asyncio.gather(*registry_tasks, return_exceptions = True)
        history_tasks = list(self._history_fetches.values())
        self._history_fetches.clear()
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
        """按新配置重建连接；清掉上一次的错误状态与从连接派生的进程内状态。"""
        await self.stop()
        self._runtime_error = None
        # 地址可能被改过（甚至换了内外网其中一路），端点缓存必须作废后重探。
        self.invalidate_endpoint()
        # 连接换了，媒体代理的两份记账就都作废了：快照缓存里是上一台 HA 的画面，
        if self._on_reconnect is not None:
            self._on_reconnect()
        self.start()

    def active_connection(self) -> HAConnection | None:
        """取当前启用中的 HA 连接（同一时刻只允许一条）。"""
        with self.database.session_factory() as database:
            return database.scalar(select(HAConnection).where(HAConnection.is_active.is_(True)))

    async def _run_database(self, operation, *args, **kwargs):
        '''把连接器的数据库操作串行化，且不阻塞异步服务循环。
        '''
        async with self._database_lock:
            return await asyncio.to_thread(operation, *args, **kwargs)

    def _load_persistent_entity_ids(self) -> set[str]:
        """收集「持久引用」的实体：优先读草稿 entity_ids 索引，缺省再 parse 全文。"""
        result = set()
        with self.database.session_factory() as database:
            drafts = database.execute(
                select(ProjectDraft.document_json, ProjectDraft.entity_ids_json)
            ).all()
            for document_json, entity_ids_json in drafts:
                indexed = self._entity_ids_from_index(entity_ids_json)
                if indexed is not None:
                    result.update(indexed)
                    continue
                document = parse_document(document_json)
                if document is None:
                    continue
                result.update(document_entity_ids(document))
            popup_document = {'customPopups': global_popups(database)}
            result.update(document_entity_ids(popup_document))
        return result

    @staticmethod
    def _entity_ids_from_index(entity_ids_json: str | None) -> set[str] | None:
        """解析草稿上的实体索引；NULL/非法 JSON 返回 None（回退全文扫描）。"""
        if entity_ids_json is None:
            return None
        raw = entity_ids_json.strip()
        if not raw:
            return None
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, list):
            return None
        return {str(item) for item in payload if isinstance(item, str) and item}
    async def watched_entity_ids(self) -> set[str]:
        """当前需要关注的实体：持久引用（草稿/弹窗）+ 运行期订阅。
        """
        async with self._watch_lock:
            return set(self._persistent_entity_ids) | set(self._runtime_entity_watch_counts)

    async def refresh_persistent_entity_ids(self, *, ensure_states: bool = True) -> set[str]:
        """重新扫描草稿与弹窗，刷新持久关注的实体集合。"""
        next_ids = await self._run_database(self._load_persistent_entity_ids)
        async with self._watch_lock:
            added = next_ids - self._persistent_entity_ids
            self._persistent_entity_ids = next_ids
            retained = set(self._persistent_entity_ids) | set(self._runtime_entity_watch_counts)
        await self.state_hub.retain(retained)
        if ensure_states and added:
            await self.ensure_entity_states(added)
        return retained

    async def add_runtime_entity_watch(self, entity_ids: set[str], *, ensure_states: bool = True) -> None:
        """登记运行期关注（某个打开中的页面要实时收这些实体的状态）。
        """
        normalized = {
            str(value) for value in entity_ids if str(value) }
        if not normalized:
            return
        async with self._watch_lock:
            self._runtime_entity_watch_counts.update(normalized)
        if ensure_states:
            await self.ensure_entity_states(normalized)

    async def remove_runtime_entity_watch(self, entity_ids: set[str]) -> None:
        """取消一次运行期关注（引用计数减一，减到 0 才真正不再关注）。"""
        normalized = {
            str(value) for value in entity_ids if str(value) }
        async with self._watch_lock:
            for entity_id in normalized:
                remaining = self._runtime_entity_watch_counts.get(entity_id, 0) - 1
                if remaining > 0:
                    self._runtime_entity_watch_counts[entity_id] = remaining
                    continue
                self._runtime_entity_watch_counts.pop(entity_id, None)
            retained = set(self._persistent_entity_ids) | set(self._runtime_entity_watch_counts)
        await self.state_hub.retain(retained)

    async def ensure_entity_states(self, entity_ids: set[str]) -> None:
        """确保这批实体在内存里有可用状态，缺的/残缺的点名补拉。
        """
        normalized = {
            str(entity_id) for entity_id in entity_ids if str(entity_id) }
        # 注意键名是 entityId：StateHub 里的状态都已归一化成前端协议结构。
        existing = {
            str(state.get('entityId') or ''): state
            for state in await self.state_hub.snapshot(normalized)
            if isinstance(state, dict) }
        pending = {
            entity_id
            for entity_id in normalized
            if state_requires_fetch_retry(entity_id, existing.get(entity_id)) }
        if not pending:
            return
        connection = await self._run_database(self.active_connection)
        if connection is None:
            # 还没配置 HA 连接：静默返回，状态等首次同步后会补齐。
            return
        client = await self.client_for(connection)
        # 共 3 轮（首轮立即 + 两次退避），覆盖「HA 刚启动、状态暂时不完整」的窗口。
        for delay in (0, *STATE_FETCH_RETRY_DELAYS):
            if delay:
                await asyncio.sleep(delay)
            requested = set(pending)
            states = await client.fetch_states(requested)
            pending.clear()
            if states:
                await self.state_hub.merge(states)
                pending.update(
                    entity_id
                    for state in states
                    if isinstance(state, dict) and
                    (entity_id := str(state.get('entity_id') or '')) in requested and
                    state_requires_fetch_retry(entity_id, state))
            if not pending:
                break

    def invalidate_endpoint(self) -> None:
        """作废当前端点的缓存，下次取用时重新探测（内网优先）。
        """
        self._endpoint = None
        self._endpoint_signature = None
        self._endpoint_probed_at = 0.0


    async def active_endpoint(self, connection: HAConnection) -> HAEndpoint:
        """取这条连接**当前可用**的端点，内网优先。
        """
        signature = endpoint_signature(connection)
        switched_from: HAEndpoint | None = None
        async with self._endpoint_lock:
            if (
                self._endpoint is not None
                and self._endpoint_signature == signature
                and time.monotonic() - self._endpoint_probed_at < HA_ENDPOINT_RECHECK_SECONDS
            ):
                return self._endpoint
            token = self.cipher.decrypt(connection.encrypted_access_token)
            failures: list[str] = []
            reachable: HAEndpoint | None = None
            for endpoint in connection_endpoints(connection):
                try:
                    await self._probe_endpoint(connection, endpoint, token)
                except HAClientError as error:
                    failures.append(f'{endpoint.label}（{endpoint.base_url}）：{error}')
                    continue
                reachable = endpoint
                break
            if reachable is None:
                # 不缓存失败结论：下一批请求应当立即重探，而不是在窗口内一直拿旧结论。
                self._endpoint = None
                self._endpoint_signature = signature
                raise HAClientError('Home Assistant 的内网与外网地址都连不上。' + '；'.join(failures))
            previous = self._endpoint
            self._endpoint = reachable
            self._endpoint_signature = signature
            self._endpoint_probed_at = time.monotonic()
            if previous is not None and previous.kind != reachable.kind:
                switched_from = previous
        if switched_from is not None:
            self._log_event(
                'warning', '连接',
                f'Home Assistant 已从{switched_from.label}切到{reachable.label}（{reachable.base_url}）',
            )
            if self._on_endpoint_switch is not None:
                self._on_endpoint_switch()
        if str(connection.active_endpoint or '') != reachable.kind:
            # 只为了让界面刷新后能显示「当前在用哪一路」，权威值始终是内存里的 _endpoint。
            await self._run_database(self._store_active_endpoint, connection.id, reachable.kind)
        return reachable

    def _store_active_endpoint(self, connection_id: str, kind: str) -> None:
        """把「当前在用哪一路」记进连接（展示用，失败不影响连接本身）。"""
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection is None:
                return
            connection.active_endpoint = kind
            database.commit()

    @staticmethod
    def _client_for_endpoint(connection: HAConnection, endpoint: HAEndpoint, token: str, settings: Settings) -> HAClient:
        """用给定端点构造客户端（不发起请求）。"""
        return HAClient(
            endpoint.base_url,
            token,
            verify_tls = endpoint.verify_tls,
            timeout = settings.ha_request_timeout_seconds,
            websocket_max_size_bytes = settings.ha_websocket_max_size_bytes,
        )

    async def client_for(self, connection: HAConnection) -> HAClient:
        """按连接记录构造 HA 客户端（每次解密令牌，不缓存明文）。
        """
        endpoint = await self.active_endpoint(connection)
        token = self.cipher.decrypt(connection.encrypted_access_token)
        return self._client_for_endpoint(connection, endpoint, token, self.settings)

    async def fetch_history(self, connection: HAConnection, entity_id: str, start_time: str, hours: int) -> list[dict[str, Any]]:
        # 缓存键不含 start_time：起始时间由 hours 反推，同一个 hours 就是同一张图。
        cache_key = (str(connection.id), str(entity_id), int(hours))
        now = time.monotonic()
        async with self._history_cache_lock:
            cached = self._history_cache.get(cache_key)
            if cached and now - cached[0] < HISTORY_CACHE_SECONDS:
                return list(cached[1])
            fetch = self._history_fetches.get(cache_key)
            if fetch is None:
                # 单飞：同一 key 的并发请求共用同一个任务，多个中控页打开同一张图也只打 HA 一次。
                fetch = asyncio.create_task(self._fetch_and_cache_history(connection, entity_id, start_time, cache_key), name = f'ha-history-{entity_id}')
                self._history_fetches[cache_key] = fetch
                # 结束后自动摘掉登记项，下一次请求会重新发起（拿到新数据）。
                fetch.add_done_callback(lambda completed, key = cache_key: self._discard_history_fetch(key, completed))
        # shield：当前请求被取消（页面关掉）时不要连带取消共享任务，其它等待者仍需它跑完。
        return list(await asyncio.shield(fetch))

    def _discard_history_fetch(self, cache_key: tuple[str, str, int], fetch: asyncio.Task[list[dict[str, Any]]]) -> None:
        """任务结束后清掉登记项；只清自己那一个，防止误删后登记的新任务。"""
        if self._history_fetches.get(cache_key) is fetch:
            self._history_fetches.pop(cache_key, None)

    async def _fetch_and_cache_history(self, connection: HAConnection, entity_id: str, start_time: str, cache_key: tuple[str, str, int]) -> list[dict[str, Any]]:
        async with self._history_semaphore:
            history = await (await self.client_for(connection)).fetch_history(entity_id, start_time)
        async with self._history_cache_lock:
            self._history_cache[cache_key] = (time.monotonic(), list(history))
            # 上限 256 条，超出就淘汰最旧的那条：缓存只是抗抖，不做长期存储。
            if len(self._history_cache) > 256:
                oldest_key = min(self._history_cache, key = lambda key: self._history_cache[key][0])
                self._history_cache.pop(oldest_key, None)
        return history


    def _load_connection(self, connection_id: str) -> HAConnection:
        """按 id 取出启用中的连接（在数据库线程里执行）。"""
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection is None or not connection.is_active:
                raise HAClientError('Home Assistant 连接不存在或已停用。')
            database.expunge(connection)
            return connection

    async def sync_once(self, connection_id: str | None = None, reconciled: bool = False) -> dict[str, int]:
        """执行一次全量对账，并把结果推给前端。
        """
        # 与防抖的注册表刷新互斥：两份快照若交叉写库，后写的会把先写的结果覆盖。
        async with self._sync_lock:
            if connection_id:
                connection = await self._run_database(self._load_connection, connection_id)
            else:
                connection = await self._run_database(self.active_connection)
            if connection is None:
                raise HAClientError('请先配置 Home Assistant 连接。')
            await self._run_database(self._mark_sync_started, connection.id)
            try:
                snapshot = await (await self.client_for(connection)).fetch_snapshot()
                counts = await self._run_database(self._apply_snapshot, connection.id, snapshot, reconciled = reconciled)
                # 草稿可能在运行期间被改过，先刷新关注集合再决定哪些状态进内存。
                await self.refresh_persistent_entity_ids(ensure_states = False)
                watched = await self.watched_entity_ids()
                # 只把「有人关注」的实体放进内存：HA 常有上千实体，全量常驻既费内存也没人会读。
                await self.state_hub.replace(
                    raw
                    for raw in snapshot.states
                    if str(raw.get('entity_id') or '') in watched)
                # 目录级变更用广播事件通知，前端的实体选择器据此重新拉列表。
                await self.state_hub.publish({
                    'type': 'entity_catalog_changed',
                    'operation': 'refreshed',
                    'counts': counts })
                if not self._initial_sync_logged:
                    # 只记第一次：重连/对账很频繁，每次都记会把日志刷满。
                    self._log_event('success', '实体同步', f'''实体目录同步完成：{counts.get('entities', 0)} 个实体、{counts.get('devices', 0)} 个设备、{counts.get('areas', 0)} 个区域''')
                    self._initial_sync_logged = True
                return counts
            except Exception as error:
                await self._run_database(self._safe_record_error, connection.id, str(error))
                raise



    def _schedule_registry_refresh(self, connection_id: str) -> None:
        """安排一次（防抖后的）注册表元数据刷新。
        """
        current = self._registry_refresh_tasks.get(connection_id)
        if current is not None and not current.done():
            current.cancel()
        self._registry_refresh_tasks[connection_id] = asyncio.create_task(self._debounced_registry_refresh(connection_id), name = f'ha-registry-refresh-{connection_id}')

    def _mark_sync_started(self, connection_id: str) -> None:
        with self.database.session_factory() as database:
            state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            state.status = 'syncing'
            state.phase = 'full_snapshot'
            state.last_started_at = utc_now()
            state.last_error = None
            database.add(state)
            database.commit()


    def _safe_record_error(self, connection_id: str, message: str) -> None:
        """记录错误的兜底版本：连落库都失败时最多留一条进程日志，绝不抛出。
        """
        try:
            self._record_error(connection_id, message)
        except Exception:
            LOGGER.error('Unable to persist HA connector error\n%s', _safe_text(traceback.format_exc(), limit = 12000))



    @staticmethod
    def _status(disabled_by: str | None) -> str:
        return 'disabled' if disabled_by else 'active'



    def catalog_counts(self, connection_id: str) -> dict[str, int]:
        """读取某个连接的目录计数（非 missing 的实体/设备/区域数量）。"""
        with self.database.session_factory() as database:
            return self._active_catalog_counts(database, connection_id)

    @staticmethod
    def _active_catalog_counts(database, connection_id: str) -> dict[str, int]:
        """统计「非 missing」的实体/设备/区域数量。
        """
        return {
            'entities': int(database.scalar(select(func.count()).select_from(HAEntity).where(HAEntity.connection_id == connection_id, HAEntity.sync_status != 'missing')) or 0),
            'devices': int(database.scalar(select(func.count()).select_from(HADevice).where(HADevice.connection_id == connection_id, HADevice.sync_status != 'missing')) or 0),
            'areas': int(database.scalar(select(func.count()).select_from(HAArea).where(HAArea.connection_id == connection_id, HAArea.sync_status != 'missing')) or 0) }
