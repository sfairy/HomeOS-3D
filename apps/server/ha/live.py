"""实时连接与快照：WebSocket 生命周期、事件分派与整表快照

从 license/service.py 的 LicenseService 里搬出来的方法组（mixin）：只移动方法本身，
私有属性仍由 LicenseService.__init__ 建立 —— 因此这里只依赖 self 上的协议，不反向依赖那个模块。
"""
from __future__ import annotations
import asyncio
import json
import time
import traceback
from typing import Any
from sqlalchemy import select
from ..core.models import HAArea, HAConnection, HADevice, HAEntity, HASyncState, utc_now
from ..observability.global_log import _safe_text
from .client import HAClient, HASnapshot, is_transient_disconnect
from .endpoints import HAEndpoint
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
    HA_ENDPOINT_PROBE_TIMEOUT_SECONDS,
    LIVE_EVENT_TYPES,
    LOGGER,
)


class HALiveMixin:
    """实时连接与快照：WebSocket 生命周期、事件分派与整表快照"""

    async def _probe_endpoint(self, connection: HAConnection, endpoint: HAEndpoint, token: str) -> None:
        """探一次端点是否可用（REST /api/config，带令牌）。不可用则抛 HAClientError。

        用 REST 而不是 WebSocket：探测只回答「这一路能不能连上、令牌认不认」，一次普通请求
        最便宜。真正的长连由主循环的 _live_connection 负责。
        """
        await HAClient(
            endpoint.base_url,
            token,
            verify_tls = endpoint.verify_tls,
            timeout = HA_ENDPOINT_PROBE_TIMEOUT_SECONDS,
            websocket_max_size_bytes = self.settings.ha_websocket_max_size_bytes,
        ).test_connection()
    async def _run(self) -> None:
        """连接器主循环：连接 → 全量同步 → 长连收事件 → 断开后重连。

        失败退避为 1→2→4→…→60 秒（封顶），成功建立长连就重置回 1，
        避免 HA 长时间不可用时把日志和 CPU 打满。
        """
        backoff = 1
        while True:
            connection_id = None
            # 本轮是否已经成功对账过一次。只有「连上之后掉线」才按例行掉线降噪；
            # 压根没连上（地址错 / 令牌失效 / HA 没起来）仍然按 error 记 —— 那才是要人看的。
            established = False
            try:
                connection = await self._run_database(self.active_connection)
                if connection is None:
                    # 还没配置 / 已停用连接：固定 3 秒轮询，用户在设置页保存后不用重启也能自动接上。
                    self._connected = False
                    await asyncio.sleep(3)
                    continue
                connection_id = connection.id
                # 先按草稿刷新关注列表（ensure_states=False：随后的快照会带上状态）。
                await self.refresh_persistent_entity_ids(ensure_states = False)
                await self.sync_once(connection_id)
                established = True
                await self._live_connection(connection_id)
                # 长连正常结束（对端关闭）也算一次成功周期，重置退避。
                backoff = 1
            except asyncio.CancelledError:
                # 必须原样抛出：stop() 依赖它来结束这个任务。
                raise
            except Exception as error:
                self._connected = False
                self._runtime_error = str(error)
                # 失败就丢掉端点结论：内网不通要能退到外网、外网不通要能回到内网，
                # 全靠这里让下一次循环重新按「内网优先」探一遍。
                self.invalidate_endpoint()
                # 已经连上之后才断的链路（心跳超时 / 对端重启 / TCP 被掐）按 warning 记：
                # 这是家用网络里的常态，连接器下一轮就会自己接上，而每次记一条 error 加一整份
                # traceback 会把真正需要人看的失败淹掉。判据与依据见 client.is_transient_disconnect。
                transient = established and is_transient_disconnect(error)
                if transient:
                    self._log_event('warning', '连接', f'Home Assistant 连接已断开，正在重连：{error}')
                    LOGGER.warning(
                        'HA connector link dropped, reconnecting: %s',
                        _safe_text(str(error), limit = 2000),
                    )
                else:
                    self._log_event('error', '连接', f'Home Assistant 连接异常：{error}', details = traceback.format_exc())
                    LOGGER.error('HA connector cycle failed\n%s', _safe_text(traceback.format_exc(), limit = 12000))
                if connection_id:
                    # 记录失败原因供界面展示；_safe_record_error 内部再兜一层，落库失败也不会带崩主循环。
                    await self._run_database(self._safe_record_error, connection_id, str(error))
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)
    async def _live_connection(self, connection_id: str) -> None:
        """建立实时连接并持续处理事件，直到连接断开。

        先补订阅并确认，再把订阅确认期间缓冲的事件按顺序处理掉（它们比快照新），
        然后循环 recv；recv 以「距下次对账的剩余时间」为超时，空闲到点就主动全量对账。
        """
        connection = await self._run_database(self._load_connection, connection_id)
        client = await self.client_for(connection)
        websocket = await client.connect_websocket()
        try:
            # 只有 state_changed 必需；注册表事件订阅失败不应因此断掉整条实时链路。
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
                # 事件密集时 TimeoutError 永不触发，每条消息后都要补一次对账时刻检查。
                if time.monotonic() >= reconcile_at:
                    await self.sync_once(connection_id, reconciled = True)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
        finally:
            # 无论正常断开还是抛异常，都先标记为未连接，让接口立刻反映状态。
            self._connected = False
            await websocket.close()
    async def _handle_live_event(self, connection_id: str, message: dict[str, Any]) -> None:
        """处理一条 HA 实时事件。

        `state_changed` 只把被关注的实体推进内存并广播，新实体才落库，已知实体靠
        `_apply_incremental_state` 节流（高频实体否则会把库写满）；三个
        `*_registry_updated` 更新元数据并触发一次防抖的注册表刷新。
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
                    # 说明实体被改过名，旧 ID 必须从内存清掉，否则前端会留着一个幽灵实体。
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
    def _apply_snapshot(self, connection_id: str, snapshot: HASnapshot, reconciled: bool) -> dict[str, int]:
        """把一次全量快照写库，并标记「本次没出现的」实体 / 设备 / 区域为缺失。

        ``reconciled`` 为真时记 last_reconciled_at。实体集合取「状态表 ∪ 注册表」（被禁用
        的只在注册表，部分集成的只在状态）；缺失只置 missing 不删行；快照为 None 时跳过标记。
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
                    # 没有注册表条目时退回状态里的运行时字段，只在库里还没名字时才写入（不覆盖用户改过的）。
                    record.name = record.name or attributes.get('friendly_name')
                    record.icon = attributes.get('icon') or record.icon
                record.sync_status = self._status(record.disabled_by)
                record.last_seen_at = now
                record.missing_since = None
            for entity_id, record in existing_entities.items():
                if entity_id in seen_entities:
                    continue
                if record.sync_status == 'missing':
                    # 已是 missing 就不刷新时间，让 missing_since 保持「首次发现消失」的语义。
                    continue
                record.sync_status = 'missing'
                record.missing_since = now
            existing_devices = {
                item.device_id: item for item in database.scalars(select(HADevice).where(HADevice.connection_id == connection_id))}
            # 快照为 None 时把已有记录全部视为「已见过」，一次接口失败不会清空设备目录。
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
            # 用「本次看见的」数量而非库里的 active 计数：快照刚写入，两者一致且不必再查库。
            sync_state.entity_count = len(seen_entities)
            sync_state.device_count = len(seen_devices)
            sync_state.area_count = len(seen_areas)
            sync_state.last_error = None
            database.add(sync_state)
            database.commit()
        # 内存中的「已知实体」按本连接整体重建，保证与刚提交的数据库状态一致。
        self._known_entity_ids = {
            key for key in self._known_entity_ids if key[0] != connection_id}
        self._known_entity_ids.update((connection_id, entity_id) for entity_id in seen_entities)
        return {
            'entities': len(seen_entities),
            'devices': len(seen_devices),
            'areas': len(seen_areas) }
