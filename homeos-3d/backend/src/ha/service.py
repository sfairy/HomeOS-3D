"""Home Assistant 连接器服务：同步、实时事件与状态分发的主循环。

- ``_run`` 常驻后台：取启用连接 → 全量同步 → WebSocket 长连收事件，异常按指数退避重连；
- ``sync_once`` 按 ``ha_reconcile_interval_seconds`` 周期对账，用 HA 权威数据修正漏掉的增量；
- ``_handle_live_event`` 只做「落库 + 推内存」，注册表类事件再触发防抖的元数据刷新；
- 状态分发交给 ``StateHub``，本模块只决定「谁该被关注」。

并发约定：数据库操作经 ``_run_database`` 串行化并放线程池（SQLAlchemy 是同步的），注册表刷新
与全量同步共用 ``_sync_lock``，避免两份快照互相覆盖。

模块常量的口径：``HA_ENDPOINT_RECHECK_SECONDS`` 是在用端点的复用窗口 —— 每隔这么久复探一次，
内网可能已经恢复，不能因为一开始走了外网就永远不再回头看内网（探测本身是并发的，见
``_probe_endpoints``）；``INCREMENTAL_FLUSH_SECONDS``
内已知实体的状态事件不写库（功率/温度类实体可能每秒多条）；``STATE_FETCH_RETRY_DELAYS`` 共尝试
3 次（首次 + 两次重试），兜住 HA 刚启动或集成未就绪时状态暂时不完整的时刻；
``HISTORY_FETCH_CONCURRENCY`` 限并发是因为 HA 侧历史接口要查 recorder 数据库、开销大；
``HISTORY_CACHE_SECONDS`` 让同一图表在页面切换/轮询时复用结果；
``TRANSLATION_CACHE_SECONDS`` 让实体翻译表不再每次页面加载都逐集成重拉。
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

from .client import HAClient, HAClientError, HASnapshot
from .connection_setup import HA_ENDPOINT_PROBE_TIMEOUT_SECONDS
from .crypto import CredentialCipher
from .endpoints import HAEndpoint, connection_endpoints, endpoint_signature
from .state_hub import StateHub
from ..config import Settings
from ..database import Database
from ..global_log import GlobalLogStore, _safe_text, event_context
from ..global_popups import global_popups
from ..models import HAArea, HAConnection, HADevice, HAEntity, HASyncState, ProjectDraft, utc_now
from ..panel.entity_refs import document_entity_ids

LOGGER = logging.getLogger(__name__)
HA_ENDPOINT_RECHECK_SECONDS = 60
LIVE_EVENT_TYPES = ('state_changed', 'entity_registry_updated', 'device_registry_updated', 'area_registry_updated')
INCREMENTAL_FLUSH_SECONDS = 10
REGISTRY_REFRESH_DEBOUNCE_SECONDS = 1.5
STATE_FETCH_RETRY_DELAYS = (0.2, 0.6)
HISTORY_FETCH_CONCURRENCY = 2
HISTORY_CACHE_SECONDS = 30
# 实体翻译表只随 HA 版本变化，编辑器/墙屏每次加载都重拉一遍纯属浪费（实测 12 个集成 ~3s）。
TRANSLATION_CACHE_SECONDS = 600
# 并发探测端点时，先用一个的成功结果之后，再给更高优先级端点留的追赶窗口。
ENDPOINT_PRIORITY_GRACE_SECONDS = 0.25
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

    不在 ``STATE_FETCH_REQUIRED_ATTRIBUTES`` 白名单里的域只要有状态就算完整；sensor 例外：
    unknown / unavailable 是「还没读到值」的占位状态，必须重拉，否则图表永远停在未知。
    """
    domain = entity_id.partition('.')[0]
    required_attributes = STATE_FETCH_REQUIRED_ATTRIBUTES.get(domain)
    if required_attributes is None:
        if state is None:
            return True
        return domain == 'sensor' and str(state.get('state') or '').strip().casefold() in {'unknown', 'unavailable'}
    attributes = state.get('attributes') if isinstance(state, dict) else None
    return not isinstance(attributes, dict) or not required_attributes.intersection(attributes)

class HAConnectorService:

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
        self._sync_lock = asyncio.Lock()
        self._database_lock = asyncio.Lock()
        self._connected = False
        self._runtime_error = None
        self._known_entity_ids = set()
        self._incremental_flushed_at = { }
        self._persistent_entity_ids = set()
        self._runtime_entity_watch_counts = Counter()
        self._watch_lock = asyncio.Lock()
        self._registry_refresh_tasks = { }
        self._history_semaphore = asyncio.Semaphore(HISTORY_FETCH_CONCURRENCY)
        self._history_cache = { }
        self._history_fetches = { }
        self._history_cache_lock = asyncio.Lock()
        self._translation_cache = { }
        self._translation_lock = asyncio.Lock()
        self._initial_sync_logged = False
        self._endpoint: HAEndpoint | None = None
        self._endpoint_signature: tuple | None = None
        self._endpoint_probed_at = 0.0
        self._endpoint_lock = asyncio.Lock()

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
        context = copy_context()
        context.run(event_context.set, { })
        self._runner = asyncio.create_task(self._run(), name = 'ha-connector', context = context)

    async def stop(self) -> None:
        registry_tasks = list(self._registry_refresh_tasks.values())
        self._registry_refresh_tasks.clear()
        for task in registry_tasks:
            task.cancel()
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
            pass
        self._runner = None
        self._connected = False

    async def restart(self) -> None:
        await self.stop()
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

    def _load_persistent_entity_ids(self) -> set[str]:
        result = set()
        with self.database.session_factory() as database:
            documents = database.scalars(select(ProjectDraft.document_json)).all()
            popup_document = {
                'customPopups': global_popups(database) }
            for document_json in documents:
                try:
                    document = json.loads(document_json)
                except (TypeError, ValueError):
                    continue
                result.update(document_entity_ids(document))
            result.update(document_entity_ids(popup_document))
        return result

    async def watched_entity_ids(self) -> set[str]:
        async with self._watch_lock:
            return set(self._persistent_entity_ids) | set(self._runtime_entity_watch_counts)

    async def refresh_persistent_entity_ids(self, *, ensure_states: bool = True) -> set[str]:
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
        normalized = {
            str(value) for value in entity_ids if str(value) }
        if not normalized:
            return
        async with self._watch_lock:
            self._runtime_entity_watch_counts.update(normalized)
        if ensure_states:
            await self.ensure_entity_states(normalized)

    async def remove_runtime_entity_watch(self, entity_ids: set[str]) -> None:
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
        normalized = {
            str(entity_id) for entity_id in entity_ids if str(entity_id) }
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
            return
        client = await self.client_for(connection)
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
        self._endpoint = None
        self._endpoint_signature = None
        self._endpoint_probed_at = 0.0

    async def _probe_endpoint(self, connection: HAConnection, endpoint: HAEndpoint, token: str) -> None:
        await HAClient(endpoint.base_url, token, verify_tls = endpoint.verify_tls, timeout = HA_ENDPOINT_PROBE_TIMEOUT_SECONDS, websocket_max_size_bytes = self.settings.ha_websocket_max_size_bytes).test_connection()

    async def _probe_endpoints(self, connection: HAConnection, token: str) -> tuple[HAEndpoint | None, list[str]]:
        """并发探测所有候选端点，按配置顺序（内网优先）挑第一个可达的。

        顺序探测时，挂掉的内网端点必须把 HA_ENDPOINT_PROBE_TIMEOUT_SECONDS 等满才轮到外网，
        每次复探都白付一整个超时（实测内网不可达时 2.5s）；并发之后只需等「第一个成功」。
        命中之后仍留一个很短的追赶窗口，避免外网先答完就把本该优先的内网挤掉。
        """
        endpoints = connection_endpoints(connection)
        order = {endpoint: index for index, endpoint in enumerate(endpoints)}
        tasks = {
            asyncio.create_task(
                self._probe_endpoint(connection, endpoint, token),
                name = f'ha-probe-{endpoint.kind}',
            ): endpoint
            for endpoint in endpoints
        }
        pending = set(tasks)
        reachable: list[HAEndpoint] = []
        failures: dict[HAEndpoint, str] = {}
        deadline: float | None = None
        loop = asyncio.get_running_loop()
        try:
            while pending:
                timeout = None if deadline is None else max(0.0, deadline - loop.time())
                done, pending = await asyncio.wait(
                    pending, timeout = timeout, return_when = asyncio.FIRST_COMPLETED,
                )
                for task in done:
                    endpoint = tasks[task]
                    error = task.exception()
                    if error is None:
                        reachable.append(endpoint)
                    else:
                        failures[endpoint] = str(error)
                if not reachable:
                    continue
                # 最优候选已经确认可达，或者追赶窗口已用掉，就不用再等了。
                if min(order[endpoint] for endpoint in reachable) == 0 or deadline is not None:
                    break
                deadline = loop.time() + ENDPOINT_PRIORITY_GRACE_SECONDS
        finally:
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions = True)
        if reachable:
            return min(reachable, key = lambda endpoint: order[endpoint]), []
        return None, [
            f'{endpoint.label}（{endpoint.base_url}）：{failures[endpoint]}'
            for endpoint in endpoints
            if endpoint in failures
        ]

    async def active_endpoint(self, connection: HAConnection) -> HAEndpoint:
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
            reachable, failures = await self._probe_endpoints(connection, token)
            if reachable is None:
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
        if str(connection.active_endpoint or '') != reachable.kind:
            await self._run_database(self._store_active_endpoint, connection.id, reachable.kind)
        return reachable

    def _store_active_endpoint(self, connection_id: str, kind: str) -> None:
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection is None:
                return
            connection.active_endpoint = kind
            database.commit()

    async def client_for(self, connection: HAConnection) -> HAClient:
        endpoint = await self.active_endpoint(connection)
        token = self.cipher.decrypt(connection.encrypted_access_token)
        return HAClient(endpoint.base_url, token, verify_tls = endpoint.verify_tls, timeout = self.settings.ha_request_timeout_seconds, websocket_max_size_bytes = self.settings.ha_websocket_max_size_bytes)

    async def entity_translations(
        self,
        connection: HAConnection,
        integrations: set[str] | list[str] | tuple[str, ...],
        language: str = 'zh-Hans',
    ) -> dict[str, str]:
        """带 TTL 缓存的实体翻译表。

        HA 侧翻译要逐个集成各发一次 ``frontend/get_translations``（实测每次约 140ms，且是串行），
        而内容只在 HA 升级后才变，所以按「连接 + 语言 + 集成集合」缓存，页面加载之间直接复用。
        """
        requested = tuple(sorted({str(item).strip() for item in integrations if str(item).strip()}))
        cache_key = (str(connection.id), language, requested)
        async with self._translation_lock:
            cached = self._translation_cache.get(cache_key)
            if cached is not None and time.monotonic() - cached[0] < TRANSLATION_CACHE_SECONDS:
                return dict(cached[1])
        resources = await (await self.client_for(connection)).fetch_entity_translations(
            requested, language = language,
        )
        async with self._translation_lock:
            self._translation_cache[cache_key] = (time.monotonic(), dict(resources))
            if len(self._translation_cache) > 32:
                oldest_key = min(self._translation_cache, key = lambda key: self._translation_cache[key][0])
                self._translation_cache.pop(oldest_key, None)
        return resources

    async def fetch_history(self, connection: HAConnection, entity_id: str, start_time: str, hours: int) -> list[dict[str, Any]]:
        """限制并短暂缓存历史数据读取，避免图表大量并发请求 HA。"""
        cache_key = (str(connection.id), str(entity_id), int(hours))
        now = time.monotonic()
        async with self._history_cache_lock:
            cached = self._history_cache.get(cache_key)
            if cached and now - cached[0] < HISTORY_CACHE_SECONDS:
                return list(cached[1])
            fetch = self._history_fetches.get(cache_key)
            if fetch is None:
                fetch = asyncio.create_task(self._fetch_and_cache_history(connection, entity_id, start_time, cache_key), name = f'ha-history-{entity_id}')
                self._history_fetches[cache_key] = fetch
                fetch.add_done_callback(lambda completed, key = cache_key: self._discard_history_fetch(key, completed))
        return list(await asyncio.shield(fetch))

    def _discard_history_fetch(self, cache_key: tuple[str, str, int], fetch: asyncio.Task[list[dict[str, Any]]]) -> None:
        if self._history_fetches.get(cache_key) is fetch:
            self._history_fetches.pop(cache_key, None)

    async def _fetch_and_cache_history(self, connection: HAConnection, entity_id: str, start_time: str, cache_key: tuple[str, str, int]) -> list[dict[str, Any]]:
        async with self._history_semaphore:
            history = await (await self.client_for(connection)).fetch_history(entity_id, start_time)
        async with self._history_cache_lock:
            self._history_cache[cache_key] = (time.monotonic(), list(history))
            if len(self._history_cache) > 256:
                oldest_key = min(self._history_cache, key = lambda key: self._history_cache[key][0])
                self._history_cache.pop(oldest_key, None)
        return history

    async def _run(self) -> None:
        backoff = 1
        while True:
            connection_id = None
            try:
                connection = await self._run_database(self.active_connection)
                if connection is None:
                    self._connected = False
                    await asyncio.sleep(3)
                    continue
                connection_id = connection.id
                await self.refresh_persistent_entity_ids(ensure_states = False)
                await self.sync_once(connection_id)
                await self._live_connection(connection_id)
                backoff = 1
            except asyncio.CancelledError:
                raise
            except Exception as error:
                self._connected = False
                self._runtime_error = str(error)
                self.invalidate_endpoint()
                self._log_event('error', '连接', f'Home Assistant 连接异常：{error}', details = traceback.format_exc())
                LOGGER.error('HA connector cycle failed\n%s', _safe_text(traceback.format_exc(), limit = 12000))
                if connection_id:
                    await self._run_database(self._safe_record_error, connection_id, str(error))
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)

    def _load_connection(self, connection_id: str) -> HAConnection:
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection is None or not connection.is_active:
                raise HAClientError('Home Assistant 连接不存在或已停用。')
            database.expunge(connection)
            return connection

    async def sync_once(self, connection_id: str | None = None, reconciled: bool = False) -> dict[str, int]:
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
                await self.refresh_persistent_entity_ids(ensure_states = False)
                watched = await self.watched_entity_ids()
                await self.state_hub.replace(
                    raw
                    for raw in snapshot.states
                    if str(raw.get('entity_id') or '') in watched)
                await self.state_hub.publish({
                    'type': 'entity_catalog_changed',
                    'operation': 'refreshed',
                    'counts': counts })
                if not self._initial_sync_logged:
                    self._log_event('success', '实体同步', f'''实体目录同步完成：{counts.get('entities', 0)} 个实体、{counts.get('devices', 0)} 个设备、{counts.get('areas', 0)} 个区域''')
                    self._initial_sync_logged = True
                return counts
            except Exception as error:
                await self._run_database(self._safe_record_error, connection.id, str(error))
                raise

    async def _live_connection(self, connection_id: str) -> None:
        connection = await self._run_database(self._load_connection, connection_id)
        client = await self.client_for(connection)
        websocket = await client.connect_websocket()
        try:
            buffered_events = await client.subscribe_events(websocket, LIVE_EVENT_TYPES, required_event_types={'state_changed'})
            await self._run_database(self._mark_connected, connection_id)
            self._connected = True
            self._runtime_error = None
            self._log_event('success', '连接', '已连接 Home Assistant，实时状态同步正常')
            for message in buffered_events:
                await self._handle_live_event(connection_id, message)
            reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
            while True:
                wait_seconds = max(0.1, reconcile_at - time.monotonic())
                try:
                    raw_message = await asyncio.wait_for(websocket.recv(), timeout = wait_seconds)
                except TimeoutError:
                    await self.sync_once(connection_id, reconciled = True)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
                    continue
                await self._handle_live_event(connection_id, json.loads(raw_message))
                if time.monotonic() >= reconcile_at:
                    await self.sync_once(connection_id, reconciled = True)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
        finally:
            self._connected = False
            await websocket.close()

    async def _handle_live_event(self, connection_id: str, message: dict[str, Any]) -> None:
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
                    await self.state_hub.publish({
                        'type': 'entity_catalog_changed',
                        'operation': 'added',
                        'counts': await self._run_database(self.catalog_counts, connection_id) })
            else:
                entity_id = str(event_data.get('entity_id') or '')
                if entity_id:
                    await self.state_hub.remove(entity_id)
        elif event_type in {'entity_registry_updated', 'device_registry_updated', 'area_registry_updated'}:
            operation = await self._run_database(self._apply_registry_event, connection_id, event_type, event_data)
            if operation:
                if event_type == 'entity_registry_updated':
                    action = str(event_data.get('action') or 'update')
                    entity_id = str(event_data.get('entity_id') or '')
                    changes_value = event_data.get('changes')
                    changes = changes_value if isinstance(changes_value, dict) else { }
                    old_entity_id = str(changes.get('entity_id') or '')
                    removed_entity_ids = set()
                    if old_entity_id and old_entity_id != entity_id:
                        removed_entity_ids.add(old_entity_id)
                    if action == 'remove':
                        removed_entity_ids.add(entity_id)
                    elif 'disabled_by' in event_data:
                        if event_data.get('disabled_by'):
                            removed_entity_ids.add(entity_id)
                    elif 'disabled_by' in changes and changes.get('disabled_by') is None:
                        removed_entity_ids.add(entity_id)
                    for removed_entity_id in sorted(removed_entity_ids - {''}):
                        await self.state_hub.remove(removed_entity_id)
                await self.state_hub.publish({
                    'type': 'entity_catalog_changed',
                    'operation': operation,
                    'counts': await self._run_database(self.catalog_counts, connection_id) })
                self._schedule_registry_refresh(connection_id)

    def _schedule_registry_refresh(self, connection_id: str) -> None:
        current = self._registry_refresh_tasks.get(connection_id)
        if current is not None and not current.done():
            current.cancel()
        self._registry_refresh_tasks[connection_id] = asyncio.create_task(self._debounced_registry_refresh(connection_id), name = f'ha-registry-refresh-{connection_id}')

    async def _debounced_registry_refresh(self, connection_id: str) -> None:
        try:
            await asyncio.sleep(REGISTRY_REFRESH_DEBOUNCE_SECONDS)
            async with self._sync_lock:
                connection = await self._run_database(self._load_connection, connection_id)
                entities, devices, areas = await (await self.client_for(connection)).fetch_registries()
                counts = await self._run_database(self._apply_registry_snapshot, connection_id, entities, devices, areas)
            if counts is not None:
                await self.state_hub.publish({
                    'type': 'entity_catalog_changed',
                    'operation': 'metadata_refreshed',
                    'counts': counts })
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self._log_event('error', '实体同步', f'Home Assistant 实体目录刷新失败：{error}', details = traceback.format_exc())
            LOGGER.error('HA registry metadata refresh failed\n%s', _safe_text(traceback.format_exc(), limit = 12000))
        finally:
            current = self._registry_refresh_tasks.get(connection_id)
            if current is asyncio.current_task():
                self._registry_refresh_tasks.pop(connection_id, None)

    def _apply_registry_event(self, connection_id: str, event_type: str, event_data: dict[str, Any]) -> str | None:
        action = str(event_data.get('action') or 'update')
        if action not in {'create', 'remove', 'update'}:
            return None
        now = utc_now()
        changes_value = event_data.get('changes')
        changes = changes_value if isinstance(changes_value, dict) else { }
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
                        old_record.entity_id = entity_id
                        old_record.domain = entity_id.partition('.')[0]
                        record = old_record
                    elif old_record is not None:
                        old_record.sync_status = 'missing'
                        old_record.missing_since = now
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
                        record.disabled_by = event_data.get('disabled_by')
                    elif 'disabled_by' in changes:
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
                    record = HAArea(connection_id = connection_id, area_id = area_id, name = str(event_data.get('name') or area_id))
                    database.add(record)
                if action == 'remove':
                    record.sync_status = 'missing'
                    record.missing_since = now
                else:
                    if 'name' in event_data:
                        record.name = str(event_data.get('name') or area_id)
                    if 'aliases' in event_data:
                        record.aliases_json = json.dumps(event_data.get('aliases') or [], ensure_ascii = False)
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
        return action

    def _apply_registry_snapshot(self, connection_id: str, entities: list[dict[str, Any]] | None, devices: list[dict[str, Any]] | None, areas: list[dict[str, Any]] | None) -> dict[str, int] | None:
        if entities is None and devices is None and areas is None:
            return None
        now = utc_now()
        with self.database.session_factory() as database:
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
        with self.database.session_factory() as database:
            state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            state.status = 'syncing'
            state.phase = 'full_snapshot'
            state.last_started_at = utc_now()
            state.last_error = None
            database.add(state)
            database.commit()

    def _record_error(self, connection_id: str, message: str) -> None:
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
        try:
            self._record_error(connection_id, message)
        except Exception:
            LOGGER.error('Unable to persist HA connector error\n%s', _safe_text(traceback.format_exc(), limit = 12000))

    def _mark_connected(self, connection_id: str) -> None:
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection:
                connection.last_connected_at = utc_now()
                connection.last_error = None
            state = database.get(HASyncState, connection_id)
            if state:
                state.status = 'connected'
                state.phase = None
                state.last_error = None
            database.commit()
        self._runtime_error = None

    @staticmethod
    def _device_registry_metadata(item: dict) -> str:
        return json.dumps({
            'integrations': sorted({
                value[0] for value in item.get('identifiers') or []
                if isinstance(value, (list, tuple)) and len(value) == 2 and isinstance(value[0], str)}),
            'configEntryIds': sorted({
                value for value in item.get('config_entries') or []
                if isinstance(value, str)}),
            'viaDeviceId': item.get('via_device_id'),
            'entryType': item.get('entry_type') }, ensure_ascii = False)

    @staticmethod
    def _status(disabled_by: str | None) -> str:
        return 'disabled' if disabled_by else 'active'

    def _apply_snapshot(self, connection_id: str, snapshot: HASnapshot, reconciled: bool) -> dict[str, int]:
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
                    record.name = record.name or attributes.get('friendly_name')
                    record.icon = attributes.get('icon') or record.icon
                record.sync_status = self._status(record.disabled_by)
                record.last_seen_at = now
                record.missing_since = None
            for entity_id, record in existing_entities.items():
                if entity_id not in seen_entities:
                    if record.sync_status != 'missing':
                        record.sync_status = 'missing'
                        record.missing_since = now
            existing_devices = {
                item.device_id: item for item in database.scalars(select(HADevice).where(HADevice.connection_id == connection_id))}
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
                    if device_id not in seen_devices:
                        if record.sync_status != 'missing':
                            record.sync_status = 'missing'
                            record.missing_since = now
            existing_areas = {
                item.area_id: item for item in database.scalars(select(HAArea).where(HAArea.connection_id == connection_id))}
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
                    if area_id not in seen_areas:
                        if record.sync_status != 'missing':
                            record.sync_status = 'missing'
                            record.missing_since = now
            connection = database.get(HAConnection, connection_id)
            if connection:
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
            sync_state.entity_count = len(seen_entities)
            sync_state.device_count = len(seen_devices)
            sync_state.area_count = len(seen_areas)
            sync_state.last_error = None
            database.add(sync_state)
            database.commit()
        self._known_entity_ids = {
            key for key in self._known_entity_ids if key[0] != connection_id}
        self._known_entity_ids.update((connection_id, entity_id) for entity_id in seen_entities)
        return {
            'entities': len(seen_entities),
            'devices': len(seen_devices),
            'areas': len(seen_areas) }

    def _apply_incremental_state(self, connection_id: str, raw_state: dict[str, Any]) -> bool:
        entity_id = str(raw_state.get('entity_id') or '')
        if not entity_id:
            return False
        key = (connection_id, entity_id)
        known = key in self._known_entity_ids
        monotonic_now = time.monotonic()
        flush_incremental = monotonic_now - self._incremental_flushed_at.get(connection_id, 0) >= INCREMENTAL_FLUSH_SECONDS
        if known and not flush_incremental:
            return False
        attributes = raw_state.get('attributes') or { }
        catalog_changed = False
        with self.database.session_factory() as database:
            if not known:
                record = database.scalar(select(HAEntity).where(HAEntity.connection_id == connection_id, HAEntity.entity_id == entity_id))
                if record is None:
                    record = HAEntity(connection_id = connection_id, entity_id = entity_id, domain = entity_id.partition('.')[0], name = attributes.get('friendly_name'), icon = attributes.get('icon'))
                    database.add(record)
                    catalog_changed = True
                elif record.sync_status == 'missing':
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
                    state.last_incremental_at = utc_now()
                if catalog_changed:
                    state.catalog_revision = (state.catalog_revision or 0) + 1
                    state.entity_count += 1
                database.add(state)
            if flush_incremental:
                self._incremental_flushed_at[connection_id] = monotonic_now
            database.commit()
        return catalog_changed

    def catalog_counts(self, connection_id: str) -> dict[str, int]:
        with self.database.session_factory() as database:
            return self._active_catalog_counts(database, connection_id)

    @staticmethod
    def _active_catalog_counts(database, connection_id: str) -> dict[str, int]:
        return {
            'entities': int(database.scalar(select(func.count()).select_from(HAEntity).where(HAEntity.connection_id == connection_id, HAEntity.sync_status != 'missing')) or 0),
            'devices': int(database.scalar(select(func.count()).select_from(HADevice).where(HADevice.connection_id == connection_id, HADevice.sync_status != 'missing')) or 0),
            'areas': int(database.scalar(select(func.count()).select_from(HAArea).where(HAArea.connection_id == connection_id, HAArea.sync_status != 'missing')) or 0) }
