"""Home Assistant 连接器服务：同步、实时事件与状态分发的主循环。

整体结构：
- `_run` 是常驻后台任务：取当前启用的连接 → 全量同步 → 建立 WebSocket
  长连并处理实时事件，异常时按指数退避重连；
- 全量对账（`sync_once`）按 `ha_reconcile_interval_seconds` 周期执行，
  用 HA 的权威数据修正漏掉的增量事件；
- 增量事件（`_handle_live_event`）只做「落库 + 推内存」，注册表类事件再
  触发一次防抖的元数据刷新；
- 状态分发交给 `StateHub`，本模块只负责决定「谁该被关注」。

并发约定：数据库操作都经 `_run_database` 串行化并放到线程池，避免阻塞
事件循环（SQLAlchemy 是同步的）；注册表刷新与全量同步共用 `_sync_lock`，
避免两份快照互相覆盖。
"""
from __future__ import annotations
import asyncio
import json
import logging
import time
import traceback
from collections import Counter
from contextvars import copy_context
from typing import Any
from sqlalchemy import func, select
from ..config import Settings
from ..database import Database
from ..models import HAArea, HAConnection, HADevice, HAEntity, HASyncState, ProjectDraft, utc_now
from ..global_popups import global_popups
from ..global_log import GlobalLogStore, _safe_text, event_context
from ..panel.entity_refs import document_entity_ids
from .client import HAClient, HAClientError, HASnapshot
from .crypto import CredentialCipher
from .state_hub import StateHub
LOGGER = logging.getLogger(__name__)
# 需要订阅的实时事件：state_changed 是必需的；三个 *_registry_updated
# 用于增量维护实体/设备/区域的元数据（改名、换区、禁用），缺失只影响元数据时效。
LIVE_EVENT_TYPES = ('state_changed', 'entity_registry_updated', 'device_registry_updated', 'area_registry_updated')
# 已知实体的状态事件在这段时间内不写库：HA 的 state_changed 在功率/温度类实体上
# 可能每秒多条，逐条落库会打爆数据库，因此只按固定节奏刷新一次同步心跳。
INCREMENTAL_FLUSH_SECONDS = 10
# 注册表变更事件的防抖窗口：一次改名/换区往往连发多条事件，合并成一次全量注册表刷新。
REGISTRY_REFRESH_DEBOUNCE_SECONDS = 1.5
# 补拉状态的重试退避（秒）：共尝试 3 次（首次 + 两次重试），
# 用来兜住 HA 刚启动或集成还没就绪、状态暂时不完整的时刻。
STATE_FETCH_RETRY_DELAYS = (0.2, 0.6)
# 历史查询并发上限：HA 侧的历史接口要查 recorder 数据库，开销大。
HISTORY_FETCH_CONCURRENCY = 2
# 历史结果短缓存（秒）：同一图表在页面切换/轮询时会重复请求，30 秒内直接复用。
HISTORY_CACHE_SECONDS = 30
# 判断「状态是否不完整、值得再拉一次」的关键属性表。
# 原因：HA 在启动初期或集成重载时，会先返回一个带 entity_id 但属性缺失的占位状态，
# 只用实体是否存在判断会把这些残缺状态当成最新值；climate 这类控件的可用性
# 全靠这几个属性，缺一个就该重拉。
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
    """判断某个实体的状态是否缺失或残缺、需要重新拉取。

    参数:
        entity_id: 实体 ID，用来推断域。
        state: 已有的状态字典；None 表示内存里还没有这个实体。

    返回:
        True 表示需要（重）拉。
    """
    domain = entity_id.partition('.')[0]
    required_attributes = STATE_FETCH_REQUIRED_ATTRIBUTES.get(domain)
    if required_attributes is None:
        if state is None:
            return True
        # 不在属性白名单里的域（除 sensor）只要有状态就算完整；
        # sensor 例外：HA 会用 unknown / unavailable 表示「还没读到值」，
        # 这种占位状态必须重拉，否则图表永远停在未知。
        return domain == 'sensor' and str(state.get('state') or '').strip().casefold() in frozenset({'unknown', 'unavailable'})
    attributes = state.get('attributes') if isinstance(state, dict) else None
    # 属性表缺失，或必备属性一个都没有 —— 两种情况都按残缺处理。
    return not isinstance(attributes, dict) or not required_attributes.intersection(attributes)

class HAConnectorService:
    """HA 连接器的生命周期与同步逻辑。

    一个进程只保有一个实例（挂在 app.state.ha_connector），由它持有后台任务、
    内存状态与各类锁；配置变更（地址、令牌、TLS）走 `restart` 重建连接。
    """

    def __init__(self, settings: Settings, database: Database, event_log: GlobalLogStore | None = None) -> None:
        """参数：

        settings: 全局配置，取 HA 相关超时、对账间隔与凭证密钥路径。
        database: 数据库封装，所有落库操作都经它开 session。
        event_log: 可选的事件日志（界面「全局日志」面板），为 None 时只写进程日志。
        """
        self.settings = settings
        self.database = database
        self.event_log = event_log
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
        # 历史查询并发闸门与短缓存，见 fetch_history。
        self._history_semaphore = asyncio.Semaphore(HISTORY_FETCH_CONCURRENCY)
        self._history_cache = { }
        # 同一 key 的并发历史查询合并成一个任务，避免同时打 HA 多份。
        self._history_fetches = { }
        self._history_cache_lock = asyncio.Lock()
        # 首次同步成功只在日志里记一次，避免每次重连都刷屏。
        self._initial_sync_logged = False

    def _log_event(self, level: str, category: str, message: str, *, details: str | None = None) -> None:
        """写一条事件日志；event_log 缺失时静默跳过。

        分类固定为 'Home Assistant'，界面上按来源过滤时用得到。
        """
        if self.event_log is not None:
            self.event_log.append(level, 'Home Assistant', category, message, details = details)

    @property
    def connected(self) -> bool:
        """当前是否处于已连接（WebSocket 已鉴权）状态。"""
        return self._connected

    @property
    def runtime_error(self) -> str | None:
        """最近一次连接失败的原因，成功后清空。"""
        return self._runtime_error

    def start(self) -> None:
        """启动后台主循环（幂等：已在运行时不重复创建任务）。"""
        if self._runner is not None and not self._runner.done():
            return
        # 复制一份干净的 contextvars：后台任务是常驻的，不能继承调用方
        # （通常是某个 HTTP 请求）的日志上下文，否则日志会一直挂在那次请求上。
        context = copy_context()
        context.run(event_context.set, { })
        self._runner = asyncio.create_task(self._run(), name = 'ha-connector', context = context)

    async def stop(self) -> None:
        """停掉主循环与所有子任务，等待它们真正结束。

        顺序是先取消子任务（防抖中的注册表刷新、进行中的历史查询）再取消主循环，
        否则主循环退出后这些任务会变成没人回收的孤儿任务。
        """
        registry_tasks = list(self._registry_refresh_tasks.values())
        self._registry_refresh_tasks.clear()
        for task in registry_tasks:
            task.cancel()
        # return_exceptions=True：任务被取消会抛 CancelledError，这里只是等它们收尾，
        # 不想让关闭流程本身再抛异常。
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
        """按新配置重建连接；清掉上一次的错误状态。"""
        await self.stop()
        self._runtime_error = None
        self.start()

    def active_connection(self) -> HAConnection | None:
        """取当前启用中的 HA 连接（同一时刻只允许一条）。"""
        with self.database.session_factory() as database:
            return database.scalar(select(HAConnection).where(HAConnection.is_active.is_(True)))

    async def _run_database(self, operation, *args, **kwargs):
        '''把连接器的数据库操作串行化，且不阻塞异步服务循环。

        SQLAlchemy 是同步 API，直接在协程里跑会卡住事件循环，因此丢进线程池；
        再加一把锁，是因为本项目用 SQLite，同一时刻只允许一个写入者，
        并发写会直接报 database is locked。
        '''
        async with self._database_lock:
            return await asyncio.to_thread(operation, *args, **kwargs)

    def _load_persistent_entity_ids(self) -> set[str]:
        """收集「持久引用」的实体：所有项目草稿与全局弹窗里用到的实体。

        这些实体不随页面关闭而取消关注，是 `retain` 与补拉的基准集合。
        """
        result = set()
        with self.database.session_factory() as database:
            documents = database.scalars(select(ProjectDraft.document_json)).all()
            # 全局弹窗不是草稿文档，这里包成同样形状的字典以复用同一个抽取函数。
            popup_document = {
                'customPopups': global_popups(database) }
            for document_json in documents:
                try:
                    result.update(document_entity_ids(json.loads(document_json)))
                except (TypeError, ValueError):
                    # 单份草稿 JSON 损坏不该拖垮整次同步，跳过它继续收集。
                    continue
            result.update(document_entity_ids(popup_document))
        return result

    async def watched_entity_ids(self) -> set[str]:
        """当前需要关注的实体：持久引用（草稿/弹窗）+ 运行期订阅。

        每次状态事件都会调用它，所以这里只做集合运算，不查库。
        """
        async with self._watch_lock:
            return set(self._persistent_entity_ids) | set(self._runtime_entity_watch_counts)

    async def refresh_persistent_entity_ids(self, *, ensure_states: bool = True) -> set[str]:
        """重新扫描草稿与弹窗，刷新持久关注的实体集合。

        参数:
            ensure_states: 是否为新出现的实体主动补拉状态；
                全量同步过程中传 False，因为快照马上就会带来它们的状态。

        返回:
            刷新后仍需关注的实体集合（含运行期订阅）。
        """
        next_ids = await self._run_database(self._load_persistent_entity_ids)
        async with self._watch_lock:
            # 先算出新增项，否则赋值之后就拿不到差异了（只补拉新出现的实体，
            # 已在关注列表里的实体没必要重复求值）。
            added = next_ids - self._persistent_entity_ids
            self._persistent_entity_ids = next_ids
            retained = set(self._persistent_entity_ids) | set(self._runtime_entity_watch_counts)
        # retain 内部要拿 StateHub 的锁，放在自己的锁外调用，避免两把锁嵌套。
        await self.state_hub.retain(retained)
        if ensure_states and added:
            await self.ensure_entity_states(added)
        return retained

    async def add_runtime_entity_watch(self, entity_ids: set[str], *, ensure_states: bool = True) -> None:
        """登记运行期关注（某个打开中的页面要实时收这些实体的状态）。

        用计数而非集合：同一实体可能被多个前端连接同时订阅，只有全部退订
        之后才该停止关注。ensure_states 打开时会立刻补拉，避免页面出现空白。
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

        补拉结果只 `merge` 进内存，不主动推送：调用方（页面订阅）随后自己
        读快照初始化界面，这里再推一遍只会造成重复渲染。

        参数:
            entity_ids: 需要确保状态的实体 ID。
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
        client = self.client_for(connection)
        # (0, 0.2, 0.6) 共 3 轮：首轮立即打，之后两轮带退避，
        # 用来覆盖「HA 刚启动、状态暂时不完整」的窗口。
        for delay in (0, *STATE_FETCH_RETRY_DELAYS):
            if delay:
                await asyncio.sleep(delay)
            # 固定本轮要请求的集合：期间被并发修改的 pending 不影响本次语义。
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
                    # 只对「本轮请求过、且拿回来仍然残缺」的实体继续重试，
                    # 避免把调用方没要的实体卷进来。
                    state_requires_fetch_retry(entity_id, state))
            if not pending:
                break

    def client_for(self, connection: HAConnection) -> HAClient:
        """按连接记录构造 HA 客户端（每次解密令牌，不缓存明文）。"""
        token = self.cipher.decrypt(connection.encrypted_access_token)
        return HAClient(connection.base_url, token, verify_tls = connection.verify_tls, timeout = self.settings.ha_request_timeout_seconds, websocket_max_size_bytes = self.settings.ha_websocket_max_size_bytes)

    async def fetch_history(self, connection: HAConnection, entity_id: str, start_time: str, hours: int) -> list[dict[str, Any]]:
        '''限制并发并做短缓存的历史读取，避免图表请求把 HA 打爆。

        参数:
            connection: 目标 HA 连接（用于解密令牌与拼请求）。
            entity_id: 实体 ID。
            start_time: 起始时间（ISO8601 字符串）。
            hours: 时间跨度（小时），一并进缓存键。

        返回:
            历史状态列表（深拷贝副本，调用方可随意改写）。
        '''
        # 缓存键不含 start_time：起始时间由 hours 反推，同一个 hours 就是同一张图。
        # 用 time.monotonic 而非挂钟时间，系统对时/改时间不会让缓存判断失真。
        cache_key = (str(connection.id), str(entity_id), int(hours))
        now = time.monotonic()
        async with self._history_cache_lock:
            cached = self._history_cache.get(cache_key)
            if cached and now - cached[0] < HISTORY_CACHE_SECONDS:
                return list(cached[1])
            fetch = self._history_fetches.get(cache_key)
            if fetch is None:
                # 单飞（single-flight）：同一 key 的并发请求共用同一个任务，
                # 多个中控页同时打开同一张图也只打 HA 一次。
                fetch = asyncio.create_task(self._fetch_and_cache_history(connection, entity_id, start_time, cache_key), name = f'ha-history-{entity_id}')
                self._history_fetches[cache_key] = fetch
                # 结束后自动摘掉登记项，下一次请求会重新发起（拿到新数据）。
                fetch.add_done_callback(lambda completed, key = cache_key: self._discard_history_fetch(key, completed))
        # shield：当前请求被取消（页面关掉）时不要连带取消共享任务，
        # 其它等待者仍然需要它跑完。
        return list(await asyncio.shield(fetch))

    def _discard_history_fetch(self, cache_key: tuple[str, str, int], fetch: asyncio.Task[list[dict[str, Any]]]) -> None:
        """任务结束后清掉登记项；只清自己那一个，防止误删后登记的新任务。"""
        if self._history_fetches.get(cache_key) is fetch:
            self._history_fetches.pop(cache_key, None)

    async def _fetch_and_cache_history(self, connection: HAConnection, entity_id: str, start_time: str, cache_key: tuple[str, str, int]) -> list[dict[str, Any]]:
        """真正执行历史查询并写入缓存（由 fetch_history 的单飞任务调用）。"""
        async with self._history_semaphore:
            history = await self.client_for(connection).fetch_history(entity_id, start_time)
        async with self._history_cache_lock:
            self._history_cache[cache_key] = (time.monotonic(), list(history))
            # 上限 256 条，超出就淘汰最旧的那条：缓存只是抗抖，不做长期存储。
            if len(self._history_cache) > 256:
                oldest_key = min(self._history_cache, key = lambda key: self._history_cache[key][0])
                self._history_cache.pop(oldest_key, None)
        return history

    async def _run(self) -> None:
        """连接器主循环：连接 → 全量同步 → 长连收事件 → 断开后重连。

        失败退避为 1→2→4→…→60 秒（封顶），一旦成功建立长连就重置回 1，
        避免 HA 长时间不可用时把日志和 CPU 打满。
        """
        backoff = 1
        while True:
            connection_id = None
            try:
                connection = await self._run_database(self.active_connection)
                if connection is None:
                    # 还没配置/已停用连接：固定 3 秒轮询一次，
                    # 这样用户在设置页保存后不用重启服务也能自动接上。
                    self._connected = False
                    await asyncio.sleep(3)
                    continue
                connection_id = connection.id
                # 先按草稿刷新关注列表（ensure_states=False：随后的快照会带上状态）。
                await self.refresh_persistent_entity_ids(ensure_states = False)
                await self.sync_once(connection_id)
                await self._live_connection(connection_id)
                # 长连正常结束（对端关闭）也算一次成功周期，重置退避。
                backoff = 1
            except asyncio.CancelledError:
                # 必须原样抛出：stop() 依赖它来结束这个任务。
                raise
            except Exception as error:
                self._connected = False
                self._runtime_error = str(error)
                self._log_event('error', '连接', f'Home Assistant 连接异常：{error}', details = traceback.format_exc())
                LOGGER.error('HA connector cycle failed\n%s', _safe_text(traceback.format_exc(), limit = 12000))
                if connection_id:
                    # 记录失败原因供界面展示；_safe_record_error 内部再兜一层，
                    # 落库失败也不会把主循环带崩。
                    await self._run_database(self._safe_record_error, connection_id, str(error))
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)

    def _load_connection(self, connection_id: str) -> HAConnection:
        """按 id 取出启用中的连接（在数据库线程里执行）。"""
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection is None or not connection.is_active:
                raise HAClientError('Home Assistant 连接不存在或已停用。')
            # expunge：session 关闭后对象仍可访问属性，否则后续读取会抛
            # DetachedInstanceError（本函数是在线程池里跑的，必须自己保证这点）。
            database.expunge(connection)
            return connection

    async def sync_once(self, connection_id: str | None = None, reconciled: bool = False) -> dict[str, int]:
        """执行一次全量对账，并把结果推给前端。

        参数:
            connection_id: 目标连接；缺省取当前启用连接。
            reconciled: 是否为周期性对账（由长连空闲超时或定时触发），
                为真时额外记录 last_reconciled_at，便于排查「对账是否在跑」。

        返回:
            实体/设备/区域的数量统计。

        异常:
            HAClientError: 未配置连接或拉取失败；其它异常记录后原样抛出，
                由 `_run` 决定退避重连。
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
                snapshot = await self.client_for(connection).fetch_snapshot()
                counts = await self._run_database(self._apply_snapshot, connection.id, snapshot, reconciled = reconciled)
                # 草稿可能在运行期间被改过，先刷新关注集合再决定哪些状态进内存。
                await self.refresh_persistent_entity_ids(ensure_states = False)
                watched = await self.watched_entity_ids()
                # 只把「有人关注」的实体放进内存：HA 实例常有上千实体，
                # 全量常驻既费内存也没人会读。
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

    async def _live_connection(self, connection_id: str) -> None:
        """建立实时连接并持续处理事件，直到连接断开。

        内部逻辑：先补订阅并确认，再把订阅确认期间缓冲的事件按顺序处理掉
        （它们比快照新），然后循环 recv；recv 用「距下次对账的剩余时间」做超时，
        空闲到点就主动做一次全量对账 —— 增量事件可能丢，定期对账是兜底。
        """
        connection = await self._run_database(self._load_connection, connection_id)
        client = self.client_for(connection)
        websocket = await client.connect_websocket()
        try:
            # 只有 state_changed 是必需的；注册表事件在老版本 HA 或权限不足时
            # 订阅失败，不应该因此断掉整条实时链路。
            buffered_events = await client.subscribe_events(websocket, LIVE_EVENT_TYPES, required_event_types={'state_changed'})
            await self._run_database(self._mark_connected, connection_id)
            self._connected = True
            self._runtime_error = None
            self._log_event('success', '连接', '已连接 Home Assistant，实时状态同步正常')
            # 订阅确认期间到达的事件按到达顺序先处理，早于随后的循环处理。
            for message in buffered_events:
                await self._handle_live_event(connection_id, message)
            reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
            while True:
                # 下限 0.1 秒，防止已过对账时刻时 wait_for 收到 0/负数而忙循环。
                wait_seconds = max(0.1, reconcile_at - time.monotonic())
                try:
                    raw_message = await asyncio.wait_for(websocket.recv(), timeout = wait_seconds)
                except TimeoutError:
                    # 空闲超时即对账时刻：没有事件也要做一次全量核对。
                    await self.sync_once(connection_id, reconciled = True)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
                    continue
                await self._handle_live_event(connection_id, json.loads(raw_message))
                # 事件密集时 recv 每次都成功、TimeoutError 永不触发，
                # 因此每条消息处理后都要补一次「是否已到对账时刻」的检查。
                if time.monotonic() >= reconcile_at:
                    await self.sync_once(connection_id, reconciled = True)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
        finally:
            # 无论正常断开还是抛异常，都先标记为未连接，让接口立刻反映状态。
            self._connected = False
            await websocket.close()

    async def _handle_live_event(self, connection_id: str, message: dict[str, Any]) -> None:
        """处理一条 HA 实时事件。

        分两类：
        - `state_changed`：只把「被关注」的实体推进内存并广播；同时用
          `_known_entity_ids` 判断是否为新实体，新实体要落库并广播目录变更。
          已知实体的状态不在这里逐条写库（节流交给 `_apply_incremental_state`），
          否则高频实体（功率、温度）会把数据库写满。
        - 三个 `*_registry_updated`：更新元数据、处理改名/禁用带来的实体消失，
          再触发一次防抖的注册表刷新。
        """
        if message.get('type') != 'event':
            return
        event = message.get('event') or { }
        event_type = event.get('event_type')
        event_data = event.get('data') or { }
        if event_type == 'state_changed':
            new_state = event_data.get('new_state')
            if isinstance(new_state, dict):
                entity_id = str(new_state.get('entity_id') or '')
                watched = await self.watched_entity_ids()
                if entity_id in watched:
                    await self.state_hub.update(new_state)
                known = (connection_id, entity_id) in self._known_entity_ids
                if not known and await self._run_database(self._apply_incremental_state, connection_id, new_state):
                    # 首次见到的实体才会改变目录计数，前端据此刷新实体选择器。
                    await self.state_hub.publish({
                        'type': 'entity_catalog_changed',
                        'operation': 'added',
                        'counts': await self._run_database(self.catalog_counts, connection_id) })
            else:
                # new_state 为 None 表示实体已被移除；此时 event_data 里只剩 entity_id。
                entity_id = str(event_data.get('entity_id') or '')
                if entity_id:
                    await self.state_hub.remove(entity_id)
        elif event_type in frozenset({'entity_registry_updated', 'device_registry_updated', 'area_registry_updated'}):
            operation = await self._run_database(self._apply_registry_event, connection_id, event_type, event_data)
            # operation 为 None 表示这条事件无需处理（例如 action 非法）。
            if operation:
                if event_type == 'entity_registry_updated':
                    action = str(event_data.get('action') or 'update')
                    entity_id = str(event_data.get('entity_id') or '')
                    changes = event_data.get('changes') if isinstance(event_data.get('changes'), dict) else { }
                    # HA 的 changes 放的是「变更前的旧值」，因此 entity_id 出现在这里
                    # 说明实体被改过名，旧 ID 必须从内存里清掉，否则前端会留着一个
                    # 永远不再更新的幽灵实体。
                    old_entity_id = str(changes.get('entity_id') or '')
                    removed_entity_ids = set()
                    if old_entity_id and old_entity_id != entity_id:
                        removed_entity_ids.add(old_entity_id)
                    if action == 'remove':
                        removed_entity_ids.add(entity_id)
                    elif 'disabled_by' in event_data:
                        # 兼容把新值内联在事件顶层的载荷。
                        if event_data.get('disabled_by'):
                            removed_entity_ids.add(entity_id)
                    elif 'disabled_by' in changes and changes.get('disabled_by') is None:
                        # changes 里 disabled_by 旧值为 None：原来是启用，现在被禁用，同样要移除。
                        removed_entity_ids.add(entity_id)
                    for removed_entity_id in sorted(removed_entity_ids - {''}):
                        await self.state_hub.remove(removed_entity_id)
                await self.state_hub.publish({
                    'type': 'entity_catalog_changed',
                    'operation': operation,
                    'counts': await self._run_database(self.catalog_counts, connection_id) })
                self._schedule_registry_refresh(connection_id)

    def _schedule_registry_refresh(self, connection_id: str) -> None:
        """安排一次（防抖后的）注册表元数据刷新。

        每来一条注册表事件就取消上一个尚未执行的任务并重开计时器，
        即「静默 REGISTRY_REFRESH_DEBOUNCE_SECONDS 后才真正刷新」；
        一次改名/换区常连发多条事件，这样能合并成一次全量注册表拉取。
        """
        current = self._registry_refresh_tasks.get(connection_id)
        if current is not None and not current.done():
            current.cancel()
        self._registry_refresh_tasks[connection_id] = asyncio.create_task(self._debounced_registry_refresh(connection_id), name = f'ha-registry-refresh-{connection_id}')

    async def _debounced_registry_refresh(self, connection_id: str) -> None:
        """防抖计时结束后真正拉取三份注册表并落库。

        失败只记日志：元数据不是实时性的关键路径，等下一次事件或全量对账
        自然会纠正，没必要让整条实时连接因此断开。
        """
        try:
            # 睡在最前面：睡眠期间排队的同类事件会取消本任务并重新计时。
            await asyncio.sleep(REGISTRY_REFRESH_DEBOUNCE_SECONDS)
            # 与 sync_once 共用同一把锁：注册表快照和全量快照不能交叉写库。
            async with self._sync_lock:
                connection = await self._run_database(self._load_connection, connection_id)
                entities, devices, areas = await self.client_for(connection).fetch_registries()
                counts = await self._run_database(self._apply_registry_snapshot, connection_id, entities, devices, areas)
            # counts 为 None 表示三份注册表一个都没取到，这种「无信息」结果不通知前端。
            if counts is not None:
                await self.state_hub.publish({
                    'type': 'entity_catalog_changed',
                    'operation': 'metadata_refreshed',
                    'counts': counts })
        except asyncio.CancelledError:
            # 被新一轮防抖取消属于正常流程，必须原样抛出。
            raise
        except Exception as error:
            self._log_event('error', '实体同步', f'Home Assistant 实体目录刷新失败：{error}', details = traceback.format_exc())
            LOGGER.error('HA registry metadata refresh failed\n%s', _safe_text(traceback.format_exc(), limit = 12000))
        finally:
            # 只有在「自己仍是登记项」时才摘除：否则会把休眠期间新排上的任务误删，
            # 导致下一轮注册表刷新再也不执行。
            current = self._registry_refresh_tasks.get(connection_id)
            if current is asyncio.current_task():
                self._registry_refresh_tasks.pop(connection_id, None)

    def _apply_registry_event(self, connection_id: str, event_type: str, event_data: dict[str, Any]) -> str | None:
        """把一条注册表变更事件增量写库。

        参数:
            connection_id: 连接 ID。
            event_type: `entity_registry_updated` / `device_registry_updated` /
                `area_registry_updated`。
            event_data: HA 事件 payload，含 action、实体/设备/区域 ID 与 changes。

        返回:
            实际执行的操作名（create/remove/update），供调用方广播目录变更；
            事件无效或无需处理时返回 None（调用方据此不再广播）。

        说明:
            changes 里放的是「变更前的旧值」，因此判断禁用/启用时看的是旧值；
            实体被移除只把 sync_status 置 missing 并记 missing_since，不删行，
            这样仪表盘上的绑定关系不会因为 HA 抖动而丢失。
        """
        action = str(event_data.get('action') or 'update')
        # 白名单外的 action 一律忽略：HA 未来新增的语义在这里没有对应处理，
        # 与其猜着写，不如等一次全量对账来兜底。
        if action not in frozenset({'create', 'remove', 'update'}):
            return None
        now = utc_now()
        changes = event_data.get('changes') if isinstance(event_data.get('changes'), dict) else { }
        with self.database.session_factory() as database:
            if event_type == 'entity_registry_updated':
                entity_id = str(event_data.get('entity_id') or '')
                if not entity_id:
                    return None
                old_entity_id = str(changes.get('entity_id') or '')
                record = database.scalar(select(HAEntity).where(HAEntity.connection_id == connection_id, HAEntity.entity_id == entity_id))
                if old_entity_id and old_entity_id != entity_id:
                    old_record = database.scalar(select(HAEntity).where(HAEntity.connection_id == connection_id, HAEntity.entity_id == old_entity_id))
                    if old_record is not None and record is None:
                        # 改名：复用旧行（保留 first_seen_at 与仪表盘绑定），只换 ID 与域。
                        old_record.entity_id = entity_id
                        old_record.domain = entity_id.partition('.')[0]
                        record = old_record
                    elif old_record is not None:
                        # 新旧 ID 同时存在（重复行）：新的已经是权威记录，把旧的标缺失。
                        old_record.sync_status = 'missing'
                        old_record.missing_since = now
                    # 旧 ID 已不再是有效实体，从内存中的「已知实体」里摘掉。
                    self._known_entity_ids.discard((connection_id, old_entity_id))
                if record is None:
                    record = HAEntity(connection_id = connection_id, entity_id = entity_id, domain = entity_id.partition('.')[0])
                    database.add(record)
                if action == 'remove':
                    record.sync_status = 'missing'
                    record.missing_since = now
                    self._known_entity_ids.discard((connection_id, entity_id))
                else:
                    if 'disabled_by' in event_data:
                        # 顶层直接给了新值的载荷，直接用。
                        record.disabled_by = event_data.get('disabled_by')
                    elif 'disabled_by' in changes:
                        # changes 里是旧值：旧值为 None 表示原来是启用，现在就是被禁用；
                        # 具体禁用来源这里推不出来，统一写 'registry' 作为「已禁用」标记。
                        record.disabled_by = 'registry' if changes.get('disabled_by') is None else None
                    for field in ('platform', 'translation_key', 'unique_id', 'device_id', 'area_id', 'name', 'original_name', 'icon'):
                        if field in event_data:
                            setattr(record, field, event_data.get(field))
                    if 'has_entity_name' in event_data:
                        record.has_entity_name = event_data.get('has_entity_name')
                    record.domain = entity_id.partition('.')[0]
                    record.sync_status = self._status(record.disabled_by)
                    record.last_seen_at = now
                    record.missing_since = None
                    self._known_entity_ids.add((connection_id, entity_id))
            elif event_type == 'device_registry_updated':
                # 设备事件里 id 可能叫 device_id，也可能叫 id（不同事件来源写法不同）。
                device_id = str(event_data.get('device_id') or event_data.get('id') or '')
                if not device_id:
                    return None
                record = database.scalar(select(HADevice).where(HADevice.connection_id == connection_id, HADevice.device_id == device_id))
                if record is None:
                    record = HADevice(connection_id = connection_id, device_id = device_id)
                    database.add(record)
                if action == 'remove':
                    record.sync_status = 'missing'
                    record.missing_since = now
                else:
                    for field in ('name', 'name_by_user', 'manufacturer', 'model', 'area_id', 'disabled_by'):
                        if field in event_data:
                            setattr(record, field, event_data.get(field))
                    record.sync_status = self._status(record.disabled_by)
                    record.last_seen_at = now
                    record.missing_since = None
            else:
                area_id = str(event_data.get('area_id') or event_data.get('id') or '')
                if not area_id:
                    return None
                record = database.scalar(select(HAArea).where(HAArea.connection_id == connection_id, HAArea.area_id == area_id))
                if record is None:
                    # 区域没有注册表事件时可能只带 area_id，名称先用 ID 顶上，等下次刷新覆盖。
                    record = HAArea(connection_id = connection_id, area_id = area_id, name = str(event_data.get('name') or area_id))
                    database.add(record)
                if action == 'remove':
                    record.sync_status = 'missing'
                    record.missing_since = now
                else:
                    if 'name' in event_data:
                        record.name = str(event_data.get('name') or area_id)
                    if 'aliases' in event_data:
                        # ensure_ascii=False：别名是中文，落库保持可读，方便直接查库排查。
                        record.aliases_json = json.dumps(event_data.get('aliases') or [], ensure_ascii = False)
                    record.sync_status = 'active'
                    record.last_seen_at = now
                    record.missing_since = None
            database.flush()
            # 计数统一按「非 missing」统计，与目录接口的口径保持一致。
            counts = self._active_catalog_counts(database, connection_id)
            state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            state.status = 'connected'
            state.phase = None
            state.last_incremental_at = now
            # 目录确实变了才自增 revision，前端据此判断要不要重新拉实体列表。
            state.catalog_revision = (state.catalog_revision or 0) + 1
            state.entity_count = counts['entities']
            state.device_count = counts['devices']
            state.area_count = counts['areas']
            state.last_error = None
            database.add(state)
            database.commit()
        return action

    def _apply_registry_snapshot(self, connection_id: str, entities: list[dict[str, Any]] | None, devices: list[dict[str, Any]] | None, areas: list[dict[str, Any]] | None) -> dict[str, int] | None:
        """用三份注册表快照刷新元数据（新增 + 更新，不做缺失标记）。

        参数:
            connection_id: 连接 ID。
            entities / devices / areas: 各自注册表的最新内容；None 表示该份没取到。

        返回:
            刷新后的目录计数；三份都没取到时返回 None（调用方据此不广播）。

        说明:
            这里刻意不把未出现的记录标记为 missing：注册表快照可能只成功了一部分，
            缺失判定交给全量对账（`_apply_snapshot`）更安全，免得误清目录。
        """
        if entities is None and devices is None and areas is None:
            return None
        now = utc_now()
        with self.database.session_factory() as database:
            # 先把已有记录整表读进字典，避免逐条 select 造成 N+1 查询。
            existing_entities = {
                record.entity_id: record
                for record in database.scalars(select(HAEntity).where(HAEntity.connection_id == connection_id))} if entities else { }
            for item in entities or []:
                entity_id = str(item.get('entity_id') or '')
                if not entity_id:
                    continue
                record = existing_entities.get(entity_id)
                if record is None:
                    record = HAEntity(connection_id = connection_id, entity_id = entity_id, domain = entity_id.partition('.')[0])
                    database.add(record)
                    existing_entities[entity_id] = record
                record.domain = entity_id.partition('.')[0]
                record.platform = item.get('platform')
                record.translation_key = item.get('translation_key')
                record.has_entity_name = item.get('has_entity_name')
                record.unique_id = item.get('unique_id')
                record.device_id = item.get('device_id')
                record.area_id = item.get('area_id')
                # 名称/图标用 or 兜底：HA 返回 None 时保留库里已有的值，
                # 否则会把之前同步到的名字清空，界面上一片空白。
                record.name = item.get('name') or item.get('original_name') or record.name
                record.original_name = item.get('original_name')
                record.icon = item.get('icon') or record.icon
                record.disabled_by = item.get('disabled_by')
                record.sync_status = self._status(record.disabled_by)
                record.last_seen_at = now
                record.missing_since = None
                self._known_entity_ids.add((connection_id, entity_id))
            existing_devices = {
                record.device_id: record
                for record in database.scalars(select(HADevice).where(HADevice.connection_id == connection_id))} if devices else { }
            for item in devices or []:
                device_id = str(item.get('id') or '')
                if not device_id:
                    continue
                record = existing_devices.get(device_id)
                if record is None:
                    record = HADevice(connection_id = connection_id, device_id = device_id)
                    database.add(record)
                    existing_devices[device_id] = record
                record.name = item.get('name')
                record.name_by_user = item.get('name_by_user')
                # 原始元数据整份存 JSON：前端以后要用到新字段时不必加列、也不必重跑同步。
                record.registry_metadata_json = self._device_registry_metadata(item)
                record.manufacturer = item.get('manufacturer')
                record.model = item.get('model')
                record.area_id = item.get('area_id')
                record.disabled_by = item.get('disabled_by')
                record.sync_status = self._status(record.disabled_by)
                record.last_seen_at = now
                record.missing_since = None
            existing_areas = {
                record.area_id: record
                for record in database.scalars(select(HAArea).where(HAArea.connection_id == connection_id))} if areas else { }
            for item in areas or []:
                area_id = str(item.get('area_id') or item.get('id') or '')
                if not area_id:
                    continue
                record = existing_areas.get(area_id)
                if record is None:
                    record = HAArea(connection_id = connection_id, area_id = area_id, name = str(item.get('name') or area_id))
                    database.add(record)
                    existing_areas[area_id] = record
                record.name = str(item.get('name') or area_id)
                record.aliases_json = json.dumps(item.get('aliases') or [], ensure_ascii = False)
                # 区域没有 disabled 概念，凡是出现在注册表里的都算启用。
                record.sync_status = 'active'
                record.last_seen_at = now
                record.missing_since = None
            database.flush()
            counts = self._active_catalog_counts(database, connection_id)
            state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            state.status = 'connected'
            state.phase = None
            state.last_incremental_at = now
            state.catalog_revision = (state.catalog_revision or 0) + 1
            state.entity_count = counts['entities']
            state.device_count = counts['devices']
            state.area_count = counts['areas']
            state.last_error = None
            database.add(state)
            database.commit()
        return counts

    def _mark_sync_started(self, connection_id: str) -> None:
        """记录「全量同步开始」，供界面显示同步中状态（status=syncing / phase=full_snapshot）。"""
        with self.database.session_factory() as database:
            state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            state.status = 'syncing'
            state.phase = 'full_snapshot'
            state.last_started_at = utc_now()
            state.last_error = None
            database.add(state)
            database.commit()

    def _record_error(self, connection_id: str, message: str) -> None:
        """把错误写进连接与同步状态（供界面展示）。"""
        # 截断到 2000 字符：错误里常带整段响应/堆栈，无上限会把状态表撑大，
        # 界面也放不下。
        safe_message = message[:2000]
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection:
                connection.last_error = safe_message
            state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            state.status = 'error'
            state.phase = None
            state.last_error = safe_message
            database.add(state)
            database.commit()

    def _safe_record_error(self, connection_id: str, message: str) -> None:
        """记录错误的兜底版本：连落库都失败时最多留一条进程日志，绝不抛出。

        它是在错误处理路径上被调用的，若在这里再抛异常会掩盖最初的错误原因，
        甚至让主循环来不及走退避。
        """
        try:
            self._record_error(connection_id, message)
        except Exception:
            LOGGER.error('Unable to persist HA connector error\n%s', _safe_text(traceback.format_exc(), limit = 12000))

    def _mark_connected(self, connection_id: str) -> None:
        """记录一次成功连接：刷新 last_connected_at 并清掉错误信息。"""
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection:
                connection.last_connected_at = utc_now()
                connection.last_error = None
            state = database.get(HASyncState, connection_id)
            # 注意这里不用「不存在就新建」：同步状态由同步流程负责创建，
            # 连接成功本身不该凭空写出一行状态记录。
            if state:
                state.status = 'connected'
                state.phase = None
                state.last_error = None
            database.commit()
        self._runtime_error = None

    @staticmethod
    def _device_registry_metadata(item: dict) -> str:
        """把设备注册表条目压成一份精简 JSON，供前端按集成/入口筛选设备。

        只挑出稳定且有筛选价值的字段：
        - integrations：从 identifiers 里取集成名（每项形如 [集成名, 唯一 ID]）；
        - configEntryIds：关联的配置条目；
        - viaDeviceId：上游设备（例如通过网关接入的设备）；
        - entryType：条目类型。
        """
        return json.dumps({
            'integrations': sorted({
                value[0] for value in item.get('identifiers') or []
                # 只认 [集成名, 唯一 ID] 这种两元组，且首元素是字符串；
                # HA 的各集成写法不完全一致，不校验会写出脏数据。
                if isinstance(value, (list, tuple)) and len(value) == 2 and isinstance(value[0], str)}),
            'configEntryIds': sorted({
                value for value in item.get('config_entries') or []
                if isinstance(value, str)}),
            'viaDeviceId': item.get('via_device_id'),
            'entryType': item.get('entry_type') }, ensure_ascii = False)

    @staticmethod
    def _status(disabled_by: str | None) -> str:
        """由 disabled_by 推出 sync_status：有值即 disabled，否则 active。"""
        return 'disabled' if disabled_by else 'active'

    def _apply_snapshot(self, connection_id: str, snapshot: HASnapshot, reconciled: bool) -> dict[str, int]:
        """把一次全量快照写库，并标记「本次没出现的」实体/设备/区域为缺失。

        参数:
            connection_id: 连接 ID。
            snapshot: `HAClient.fetch_snapshot` 的结果。
            reconciled: 是否为周期性对账，为真时记录 last_reconciled_at。

        返回:
            实体/设备/区域的数量统计。

        说明:
            - 实体集合取「状态表 ∪ 注册表」：被禁用的实体只出现在注册表里，
              没有注册表条目的实体（部分集成）只出现在状态里，两边都要认；
            - 缺失只用 sync_status=missing 表达，不删行，避免 HA 抖动导致
              仪表盘绑定关系丢失；
            - 设备/区域在本次快照为 None（命令不可用）时跳过缺失标记。
        """
        now = utc_now()
        state_by_id = {
            str(item.get('entity_id')): item
            for item in snapshot.states
            if item.get('entity_id') }
        registry_by_id = {
            str(item.get('entity_id')): item
            for item in snapshot.entities or []
            if item.get('entity_id') }
        seen_entities = set(state_by_id) | set(registry_by_id)
        with self.database.session_factory() as database:
            existing_entities = {
                item.entity_id: item for item in database.scalars(select(HAEntity).where(HAEntity.connection_id == connection_id))}
            for entity_id in seen_entities:
                registry = registry_by_id.get(entity_id, { })
                state = state_by_id.get(entity_id, { })
                attributes = state.get('attributes') or { }
                record = existing_entities.get(entity_id)
                if record is None:
                    record = HAEntity(connection_id = connection_id, entity_id = entity_id, domain = entity_id.partition('.')[0])
                    database.add(record)
                record.domain = entity_id.partition('.')[0]
                if registry:
                    # 注册表是权威元数据来源：名称、图标、所属设备/区域都优先取它。
                    record.platform = registry.get('platform')
                    record.translation_key = registry.get('translation_key')
                    record.has_entity_name = registry.get('has_entity_name')
                    record.unique_id = registry.get('unique_id')
                    record.device_id = registry.get('device_id')
                    record.area_id = registry.get('area_id')
                    record.name = registry.get('name') or attributes.get('friendly_name') or registry.get('original_name')
                    record.original_name = registry.get('original_name')
                    record.icon = registry.get('icon') or attributes.get('icon')
                    record.disabled_by = registry.get('disabled_by')
                else:
                    # 没有注册表条目时只能退而取状态里的运行时字段，
                    # 且只在库里还没有名字时才写入（不覆盖用户改过的名字）。
                    record.name = record.name or attributes.get('friendly_name')
                    record.icon = attributes.get('icon') or record.icon
                record.sync_status = self._status(record.disabled_by)
                record.last_seen_at = now
                record.missing_since = None
            for entity_id, record in existing_entities.items():
                if entity_id in seen_entities:
                    continue
                if record.sync_status == 'missing':
                    # 已经是 missing 就不刷新时间，让 missing_since 保持「首次发现消失」
                    # 的语义（界面用它展示消失了多久）。
                    continue
                record.sync_status = 'missing'
                record.missing_since = now
            existing_devices = {
                item.device_id: item for item in database.scalars(select(HADevice).where(HADevice.connection_id == connection_id))}
            # 本次没取到设备注册表（None）时，把已有记录全部视为「已见过」，
            # 于是下面的标记循环什么都不做 —— 一次接口失败不会清空设备目录。
            seen_devices = {
                device_id for device_id, item in existing_devices.items() if item.sync_status != 'missing'} if snapshot.devices is None else set()
            for item in snapshot.devices or []:
                device_id = str(item.get('id') or '')
                if not device_id:
                    continue
                seen_devices.add(device_id)
                record = existing_devices.get(device_id)
                if record is None:
                    record = HADevice(connection_id = connection_id, device_id = device_id)
                    database.add(record)
                record.name = item.get('name')
                record.name_by_user = item.get('name_by_user')
                record.registry_metadata_json = self._device_registry_metadata(item)
                record.manufacturer = item.get('manufacturer')
                record.model = item.get('model')
                record.area_id = item.get('area_id')
                record.disabled_by = item.get('disabled_by')
                record.sync_status = self._status(record.disabled_by)
                record.last_seen_at = now
                record.missing_since = None
            if snapshot.devices is not None:
                for device_id, record in existing_devices.items():
                    if device_id in seen_devices:
                        continue
                    if record.sync_status == 'missing':
                        continue
                    record.sync_status = 'missing'
                    record.missing_since = now
            existing_areas = {
                item.area_id: item for item in database.scalars(select(HAArea).where(HAArea.connection_id == connection_id))}
            # 与设备同样处理：areas 为 None 表示本轮没取到，不做缺失标记。
            seen_areas = {
                area_id for area_id, item in existing_areas.items() if item.sync_status != 'missing'} if snapshot.areas is None else set()
            for item in snapshot.areas or []:
                area_id = str(item.get('area_id') or item.get('id') or '')
                if not area_id:
                    continue
                seen_areas.add(area_id)
                record = existing_areas.get(area_id)
                if record is None:
                    record = HAArea(connection_id = connection_id, area_id = area_id, name = str(item.get('name') or area_id))
                    database.add(record)
                record.name = str(item.get('name') or area_id)
                record.aliases_json = json.dumps(item.get('aliases') or [], ensure_ascii = False)
                record.sync_status = 'active'
                record.last_seen_at = now
                record.missing_since = None
            if snapshot.areas is not None:
                for area_id, record in existing_areas.items():
                    if area_id in seen_areas:
                        continue
                    if record.sync_status == 'missing':
                        continue
                    record.sync_status = 'missing'
                    record.missing_since = now
            connection = database.get(HAConnection, connection_id)
            if connection:
                # ha_version 只在 HA 给出了新值时才覆盖，重连时取不到配置也不会清空。
                connection.ha_version = snapshot.config.get('version') or connection.ha_version
                connection.last_connected_at = now
                connection.last_error = None
            sync_state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            sync_state.status = 'connected'
            sync_state.phase = None
            sync_state.last_completed_at = now
            sync_state.last_full_sync_at = now
            sync_state.catalog_revision = (sync_state.catalog_revision or 0) + 1
            if reconciled:
                sync_state.last_reconciled_at = now
            # 这里用「本次看见的」数量，而不是库里的 active 计数：
            # 快照刚写入，两者一致，但前者不必再查一次库。
            sync_state.entity_count = len(seen_entities)
            sync_state.device_count = len(seen_devices)
            sync_state.area_count = len(seen_areas)
            sync_state.last_error = None
            database.add(sync_state)
            database.commit()
        # 内存中的「已知实体」按本连接整体重建：先摘掉本连接旧记录，再写入本次快照的
        # 实体集合，保证它与数据库里刚提交的状态完全一致。
        self._known_entity_ids = {
            key for key in self._known_entity_ids if key[0] != connection_id}
        self._known_entity_ids.update((connection_id, entity_id) for entity_id in seen_entities)
        return {
            'entities': len(seen_entities),
            'devices': len(seen_devices),
            'areas': len(seen_areas) }

    def _apply_incremental_state(self, connection_id: str, raw_state: dict[str, Any]) -> bool:
        """把一条实时状态事件增量落库。

        参数:
            connection_id: 连接 ID。
            raw_state: HA 的 `new_state` 原始字典。

        返回:
            目录是否发生变化（新实体出现、或原本 missing 的实体复活）；
            调用方据此决定要不要广播目录变更。

        说明:
            这是高频路径，必须便宜：已知实体在 INCREMENTAL_FLUSH_SECONDS 内
            直接返回，不碰数据库 —— 否则功率/温度这类秒级上报的实体会把库写爆。
        """
        entity_id = str(raw_state.get('entity_id') or '')
        if not entity_id:
            return False
        key = (connection_id, entity_id)
        known = key in self._known_entity_ids
        # 用 monotonic 计时，避免系统对时导致节流窗口被跳过或卡死。
        monotonic_now = time.monotonic()
        flush_incremental = monotonic_now - self._incremental_flushed_at.get(connection_id, 0) >= INCREMENTAL_FLUSH_SECONDS
        if known and not flush_incremental:
            # 已知实体的高频状态更新：本窗口内只更新内存，不写库。
            return False
        attributes = raw_state.get('attributes') or { }
        catalog_changed = False
        with self.database.session_factory() as database:
            if not known:
                record = database.scalar(select(HAEntity).where(HAEntity.connection_id == connection_id, HAEntity.entity_id == entity_id))
                if record is None:
                    # 全新实体：注册表还没同步到它，先用状态里的运行时字段顶上。
                    record = HAEntity(connection_id = connection_id, entity_id = entity_id, domain = entity_id.partition('.')[0], name = attributes.get('friendly_name'), icon = attributes.get('icon'))
                    database.add(record)
                    catalog_changed = True
                elif record.sync_status == 'missing':
                    # 之前判为消失、现在又回来了，也算目录变化。
                    catalog_changed = True
                record.sync_status = 'active'
                record.name = attributes.get('friendly_name') or record.name
                record.icon = attributes.get('icon') or record.icon
                record.last_seen_at = utc_now()
                record.missing_since = None
                self._known_entity_ids.add(key)
            if flush_incremental or catalog_changed:
                state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id, status = 'connected')
                if flush_incremental:
                    # 这个时间戳是「增量通道还活着」的心跳，供界面判断同步是否正常。
                    state.last_incremental_at = utc_now()
                if catalog_changed:
                    state.catalog_revision = (state.catalog_revision or 0) + 1
                    # 只做 +1 的近似计数，精确值由下一次全量对账覆盖。
                    state.entity_count += 1
                database.add(state)
            if flush_incremental:
                self._incremental_flushed_at[connection_id] = monotonic_now
            database.commit()
        return catalog_changed

    def catalog_counts(self, connection_id: str) -> dict[str, int]:
        """读取某个连接的目录计数（非 missing 的实体/设备/区域数量）。"""
        with self.database.session_factory() as database:
            return self._active_catalog_counts(database, connection_id)

    @staticmethod
    def _active_catalog_counts(database, connection_id: str) -> dict[str, int]:
        """统计「非 missing」的实体/设备/区域数量。

        口径与目录接口一致：missing 的记录仍在库里（为了保住绑定关系），
        但不应出现在任何计数里。
        """
        return {
            'entities': int(database.scalar(select(func.count()).select_from(HAEntity).where(HAEntity.connection_id == connection_id, HAEntity.sync_status != 'missing')) or 0),
            'devices': int(database.scalar(select(func.count()).select_from(HADevice).where(HADevice.connection_id == connection_id, HADevice.sync_status != 'missing')) or 0),
            'areas': int(database.scalar(select(func.count()).select_from(HAArea).where(HAArea.connection_id == connection_id, HAArea.sync_status != 'missing')) or 0) }
