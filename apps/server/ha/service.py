"""Home Assistant 连接器服务：同步、实时事件与状态分发的主循环。

- ``_run`` 常驻后台：取启用连接 → 全量同步 → WebSocket 长连收事件，异常按指数退避重连；
- ``sync_once`` 按 ``ha_reconcile_interval_seconds`` 周期对账，用 HA 权威数据修正漏掉的增量；
- ``_handle_live_event`` 只做「落库 + 推内存」，注册表类事件再触发防抖的元数据刷新；
- 状态分发交给 ``StateHub``，本模块只决定「谁该被关注」。

并发约定：数据库操作经 ``_run_database`` 串行化并放线程池（SQLAlchemy 是同步的），
注册表刷新与全量同步共用 ``_sync_lock``，避免两份快照互相覆盖。
"""
from __future__ import annotations
import asyncio
import time
import traceback
from collections import Counter
from collections.abc import Callable
from contextvars import copy_context
from typing import Any
from sqlalchemy import func, select
from ..config import Settings
from ..core.database import Database
from ..core.models import HAArea, HAConnection, HADevice, HAEntity, HASyncState, ProjectDraft, utc_now
from ..panel.global_popups import global_popups
from ..observability.global_log import GlobalLogStore, _safe_text, event_context
from ..panel.documents import parse_document
from ..panel.entity_refs import document_entity_ids
from .client import HAClient, HAClientError
from .crypto import CredentialCipher
from .endpoints import HAEndpoint, connection_endpoints, endpoint_signature
from .state_hub import StateHub
# 当前端点的复用窗口（秒）。在用的这一路每隔这么久复探一次：内网可能已经恢复（回家、
# 连回 Wi-Fi），外网也可能已经失效。代价是一次 /api/config，换来 60 秒内自动归位。
HA_ENDPOINT_RECHECK_SECONDS = 60
# 补拉状态的重试退避（秒）：共尝试 3 次（首次 + 两次重试），
# 用来兜住 HA 刚启动或集成还没就绪、状态暂时不完整的时刻。
STATE_FETCH_RETRY_DELAYS = (0.2, 0.6)
# 历史查询并发上限：HA 侧的历史接口要查 recorder 数据库，开销大。
HISTORY_FETCH_CONCURRENCY = 2
# 历史结果短缓存（秒）：同一图表在页面切换/轮询时会重复请求，30 秒内直接复用。
HISTORY_CACHE_SECONDS = 30
# 判断「状态是否不完整、值得再拉一次」的关键属性表。HA 启动初期或集成重载时会先返回
# 带 entity_id 但属性缺失的占位状态，climate 这类控件的可用性全靠这几个属性，缺一个就重拉。
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
        # 「还没读到值」的占位状态，必须重拉，否则图表永远停在未知。
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

    一个进程只保有一个实例（挂在 app.state.ha_connector），由它持有后台任务、内存状态
    与各类锁；配置变更（地址、令牌、TLS）走 `restart` 重建连接。
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

        on_reconnect: 连接被重建 / 删除时的回调，用于作废从连接派生的进程内状态
            （媒体代理快照缓存与 HLS 归属记账）；用回调避免连接器与派生状态互相依赖。
        on_endpoint_switch: 内网 / 外网端点发生切换时的回调。与 on_reconnect 分开：
            切换端点时从连接派生的缓存要作废（HLS 令牌是旧端点发的），但**保温池不能一起
            停掉** —— 它会自己按新端点重新起流，停了就再也没人把它叫回来。
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
        # 历史查询并发闸门与短缓存，见 fetch_history。
        self._history_semaphore = asyncio.Semaphore(HISTORY_FETCH_CONCURRENCY)
        self._history_cache = { }
        # 同一 key 的并发历史查询合并成一个任务，避免同时打 HA 多份。
        self._history_fetches = { }
        self._history_cache_lock = asyncio.Lock()
        # 首次同步成功只在日志里记一次，避免每次重连都刷屏。
        self._initial_sync_logged = False
        # 当前可用端点（内网优先）：所有出网调用都从它取地址与证书校验开关。
        # 缓存窗口内共用同一个结果，避免每个媒体请求都探一次。
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
        """最近一次连接失败的原因，成功后清空。"""
        return self._runtime_error

    @property
    def endpoint_kind(self) -> str | None:
        """当前在用的端点类型（'internal' / 'external'）；还没探过时为 None。

        内存里的值才是权威的（库里那份只是上一次的快照），界面优先拿这个。
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
        # 请求）的日志上下文，否则日志会一直挂在那次请求上。
        context = copy_context()
        context.run(event_context.set, { })
        self._runner = asyncio.create_task(self._run(), name = 'ha-connector', context = context)

    async def stop(self) -> None:
        """停掉主循环与所有子任务，等待它们真正结束。

        先取消子任务（防抖中的注册表刷新、进行中的历史查询）再取消主循环，
        否则主循环退出后这些任务会变成没人回收的孤儿任务。
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
        # HLS 归属记的是上一台 HA 的令牌。同一地址也可能换了另一套系统，缓存无法自行发现。
        if self._on_reconnect is not None:
            self._on_reconnect()
        self.start()

    def active_connection(self) -> HAConnection | None:
        """取当前启用中的 HA 连接（同一时刻只允许一条）。"""
        with self.database.session_factory() as database:
            return database.scalar(select(HAConnection).where(HAConnection.is_active.is_(True)))

    async def _run_database(self, operation, *args, **kwargs):
        '''把连接器的数据库操作串行化，且不阻塞异步服务循环。

        SQLAlchemy 是同步 API，直接在协程里跑会卡住事件循环，因此丢进线程池；
        加锁是因为本项目用 SQLite，同一时刻只允许一个写入者，并发写会报 database is locked。
        '''
        async with self._database_lock:
            return await asyncio.to_thread(operation, *args, **kwargs)

    def _load_persistent_entity_ids(self) -> set[str]:
        """收集「持久引用」的实体：所有项目草稿与全局弹窗里用到的实体。"""
        result = set()
        with self.database.session_factory() as database:
            documents = database.scalars(select(ProjectDraft.document_json)).all()
            # 全局弹窗不是草稿文档，这里包成同样形状的字典以复用同一个抽取函数。
            popup_document = {
                'customPopups': global_popups(database) }
            for document_json in documents:
                # 单份草稿 JSON 损坏不该拖垮整次同步，跳过它继续收集。
                document = parse_document(document_json)
                if document is None:
                    continue
                result.update(document_entity_ids(document))
            result.update(document_entity_ids(popup_document))
        return result

    async def watched_entity_ids(self) -> set[str]:
        """当前需要关注的实体：持久引用（草稿/弹窗）+ 运行期订阅。

        每次状态事件都会调用它，所以这里只做集合运算，不查库。
        """
        async with self._watch_lock:
            return set(self._persistent_entity_ids) | set(self._runtime_entity_watch_counts)

    async def refresh_persistent_entity_ids(self, *, ensure_states: bool = True) -> set[str]:
        """重新扫描草稿与弹窗，刷新持久关注的实体集合。"""
        next_ids = await self._run_database(self._load_persistent_entity_ids)
        async with self._watch_lock:
            # 先算出新增项再赋值，否则拿不到差异（只补拉新出现的实体）。
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

        补拉结果只 `merge` 进内存，不主动推送：调用方随后自己读快照初始化界面，
        这里再推一遍只会造成重复渲染。
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
                    # 只对本轮请求过、且拿回来仍残缺的实体继续重试，避免把调用方没要的实体卷进来。
                    state_requires_fetch_retry(entity_id, state))
            if not pending:
                break

    def invalidate_endpoint(self) -> None:
        """作废当前端点的缓存，下次取用时重新探测（内网优先）。

        调用点有两处，理由相同 —— 「现在用的这一路已经不通了」：连接主循环失败（多半是
        离开家 / 回到家的那一刻），以及连接配置被改写（地址换了，缓存的端点已经不对）。
        """
        self._endpoint = None
        self._endpoint_signature = None
        self._endpoint_probed_at = 0.0


    async def active_endpoint(self, connection: HAConnection) -> HAEndpoint:
        """取这条连接**当前可用**的端点，内网优先。

        只要内网连得上就一直用内网，内网不通才退到外网；内网恢复后（下一次复探）自动切回。
        结果按 ``HA_ENDPOINT_RECHECK_SECONDS`` 缓存：窗口内所有调用（同步、媒体代理、服务
        调用、历史查询）共用同一个端点，不会每个请求都探一次。

        异常: HAClientError —— 两路都连不上，错误里带上两路各自的原因。
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

        地址取 ``active_endpoint`` 的解析结果而不是连接上的某一个字段 —— 内网与外网两套
        地址由它决定用哪一套，调用方不必关心。
        """
        endpoint = await self.active_endpoint(connection)
        token = self.cipher.decrypt(connection.encrypted_access_token)
        return self._client_for_endpoint(connection, endpoint, token, self.settings)

    async def fetch_history(self, connection: HAConnection, entity_id: str, start_time: str, hours: int) -> list[dict[str, Any]]:
        '''限制并发并做短缓存的历史读取，避免图表请求把 HA 打爆。

        参数: start_time 为 ISO8601 起始时间；hours 为时间跨度（小时），一并进缓存键。
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
        """真正执行历史查询并写入缓存（由 fetch_history 的单飞任务调用）。"""
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
            # expunge：否则 session 关闭后读属性会抛 DetachedInstanceError（本函数跑在线程池里）。
            database.expunge(connection)
            return connection

    async def sync_once(self, connection_id: str | None = None, reconciled: bool = False) -> dict[str, int]:
        """执行一次全量对账，并把结果推给前端。

        ``connection_id`` 缺省取当前启用连接；``reconciled`` 为真表示周期性对账（由长连空闲
        超时或定时触发），会额外记录 last_reconciled_at。返回实体 / 设备 / 区域的数量统计。
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

        每来一条注册表事件就取消上一个未执行的任务并重开计时器，静默
        REGISTRY_REFRESH_DEBOUNCE_SECONDS 后才真正刷新，把连发的多条事件合并成一次拉取。
        """
        current = self._registry_refresh_tasks.get(connection_id)
        if current is not None and not current.done():
            current.cancel()
        self._registry_refresh_tasks[connection_id] = asyncio.create_task(self._debounced_registry_refresh(connection_id), name = f'ha-registry-refresh-{connection_id}')




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


    def _safe_record_error(self, connection_id: str, message: str) -> None:
        """记录错误的兜底版本：连落库都失败时最多留一条进程日志，绝不抛出。

        它是在错误处理路径上被调用的，若在这里再抛异常会掩盖最初的错误原因，
        甚至让主循环来不及走退避。
        """
        try:
            self._record_error(connection_id, message)
        except Exception:
            LOGGER.error('Unable to persist HA connector error\n%s', _safe_text(traceback.format_exc(), limit = 12000))



    @staticmethod
    def _status(disabled_by: str | None) -> str:
        """由 disabled_by 推出 sync_status：有值即 disabled，否则 active。"""
        return 'disabled' if disabled_by else 'active'



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
