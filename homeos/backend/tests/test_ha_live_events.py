"""HA 实时状态合批：事件抽取、同实体合并、溢出丢弃与批量落地语义。"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

from sqlalchemy import func, select
from src.config import Settings
from src.domains.ha.integration.live_events import (
    LiveStateEventQueue,
    live_state_change,
)
from src.domains.ha.integration.service_live import HALiveMixin
from src.domains.ha.integration.service_sync import HASyncMixin
from src.platform.core.database import Database
from src.platform.core.models import (
    HAConnection,
    HAEntity,
    HASyncState,
)
from src.platform.core.schema import prepare_schema

BASE_URL = 'http://homeassistant.local:8123'
# 只用于满足非空约束的占位密文：本测试不碰令牌解密路径。
_PLACEHOLDER_CIPHERTEXT = 'not-a-real-ciphertext'


def _state(entity_id: str, value: str = 'on') -> dict:
    return {
        'entity_id': entity_id,
        'state': value,
        'attributes': {'friendly_name': entity_id},
        'last_changed': '2026-01-01T00:00:00+00:00',
    }


def _event(entity_id: str, value: str = 'on', *, previous: str = 'off') -> dict:
    return {
        'type': 'event',
        'event': {
            'event_type': 'state_changed',
            'time_fired': '2026-01-01T00:00:01+00:00',
            'data': {'entity_id': entity_id, 'old_state': _state(entity_id, previous), 'new_state': _state(entity_id, value)},
        },
    }


def _removed(entity_id: str) -> dict:
    return {
        'type': 'event',
        'event': {
            'event_type': 'state_changed',
            'time_fired': '2026-01-01T00:00:02+00:00',
            'data': {'entity_id': entity_id, 'old_state': _state(entity_id), 'new_state': None},
        },
    }


class StateChangeExtractionTest(unittest.TestCase):
    def test_state_changed_becomes_listener_payload(self) -> None:
        change = live_state_change(_event('light.kitchen', 'on'))
        self.assertIsNotNone(change)
        self.assertEqual(change['entity_id'], 'light.kitchen')
        self.assertEqual(change['new_state']['state'], 'on')
        self.assertEqual(change['old_state']['state'], 'off')
        self.assertIsNone(change['removed_entity_id'])

    def test_removal_keeps_new_state_none(self) -> None:
        change = live_state_change(_removed('light.kitchen'))
        self.assertIsNotNone(change)
        self.assertIsNone(change['entity_id'])
        self.assertIsNone(change['new_state'])
        self.assertEqual(change['removed_entity_id'], 'light.kitchen')

    def test_non_state_messages_are_not_queued(self) -> None:
        self.assertIsNone(live_state_change({'type': 'result', 'success': True}))
        self.assertIsNone(live_state_change({
            'type': 'event',
            'event': {'event_type': 'entity_registry_updated', 'data': {}},
        }))
        self.assertIsNone(live_state_change({'type': 'event', 'event': {'event_type': 'state_changed'}}))
        self.assertIsNone(live_state_change({}))


class LiveStateEventQueueTest(unittest.IsolatedAsyncioTestCase):
    async def test_same_entity_is_merged_keeping_first_old_last_new(self) -> None:
        batches: list[list[dict]] = []
        events = LiveStateEventQueue(batches.append, window_seconds = 0.02)
        events.start()
        try:
            events.enqueue(live_state_change(_event('light.kitchen', 'on')), entity_id = 'light.kitchen')
            events.enqueue(live_state_change(_event('light.kitchen', 'dim', previous = 'on')), entity_id = 'light.kitchen')
            await asyncio.sleep(0.1)
        finally:
            await events.aclose()
        self.assertEqual(len(batches), 1)
        merged = batches[0][0]
        self.assertEqual(merged['old_state']['state'], 'off')
        self.assertEqual(merged['new_state']['state'], 'dim')

    async def test_distinct_entities_share_one_batch(self) -> None:
        batches: list[list[dict]] = []
        events = LiveStateEventQueue(batches.append, window_seconds = 0.02)
        events.start()
        try:
            events.enqueue(live_state_change(_event('light.a')), entity_id = 'light.a')
            events.enqueue(live_state_change(_event('light.b')), entity_id = 'light.b')
            await asyncio.sleep(0.1)
        finally:
            await events.aclose()
        self.assertEqual(len(batches), 1)
        self.assertEqual([change['entity_id'] for change in batches[0]], ['light.a', 'light.b'])

    async def test_pending_changes_are_flushed_on_close(self) -> None:
        batches: list[list[dict]] = []
        events = LiveStateEventQueue(batches.append, window_seconds = 5.0)
        events.start()
        events.enqueue(live_state_change(_event('light.kitchen')), entity_id = 'light.kitchen')
        await events.aclose()
        self.assertEqual(len(batches), 1)
        self.assertEqual(batches[0][0]['entity_id'], 'light.kitchen')

    async def test_overflow_drops_newest_and_counts(self) -> None:
        batches: list[list[dict]] = []
        events = LiveStateEventQueue(batches.append, window_seconds = 5.0, max_pending = 2)
        events.start()
        try:
            for entity_id in ('light.a', 'light.b', 'light.c'):
                events.enqueue(live_state_change(_event(entity_id)), entity_id = entity_id)
            self.assertEqual(events.dropped, 1)
            self.assertEqual(events.pending, 2)
        finally:
            await events.aclose()


class _RecordingHub:
    def __init__(self) -> None:
        self.updated: list[str] = []
        self.removed: list[str] = []
        self.published: list[dict] = []

    async def update(self, state: dict) -> None:
        self.updated.append(state['entity_id'])

    async def remove(self, entity_id: str) -> None:
        self.removed.append(entity_id)

    async def publish(self, payload: dict) -> None:
        self.published.append(payload)


class _FlushProbe(HALiveMixin):
    """只保留合批落地所需成员的宿主替身。"""

    def __init__(self) -> None:
        self.state_hub = _RecordingHub()
        self.notified: list[tuple[str, dict]] = []
        self.applied: list[tuple[str, list[str]]] = []
        self.watched = {'light.kitchen'}

    async def watched_entity_ids(self) -> set[str]:
        return self.watched

    async def _run_database(self, operation, *args, **kwargs):
        return operation(*args, **kwargs)

    def _apply_incremental_states(self, connection_id: str, states: list[dict]) -> bool:
        self.applied.append((connection_id, [state['entity_id'] for state in states]))
        return True

    def catalog_counts(self, connection_id: str) -> dict[str, int]:
        return {'entities': 4, 'devices': 1, 'areas': 1}

    async def _notify_state(self, kind: str, payload: dict) -> None:
        self.notified.append((kind, payload))


class _StubQueue:
    def __init__(self) -> None:
        self.items: list[tuple[dict, str | None]] = []

    def enqueue(self, change: dict, *, entity_id: str | None = None) -> None:
        self.items.append((change, entity_id))


class _DispatchProbe(HALiveMixin):
    def __init__(self) -> None:
        self.handled: list[dict] = []

    async def _handle_live_event(self, connection_id: str, message: dict) -> None:
        self.handled.append(message)


class LiveEventDispatchTest(unittest.IsolatedAsyncioTestCase):
    async def test_state_event_is_queued_and_registry_event_is_immediate(self) -> None:
        probe = _DispatchProbe()
        queue = _StubQueue()
        await probe._dispatch_live_event(queue, 'conn-1', _event('light.kitchen'))
        registry = {'type': 'event', 'event': {'event_type': 'device_registry_updated', 'data': {}}}
        await probe._dispatch_live_event(queue, 'conn-1', registry)
        self.assertEqual(len(queue.items), 1)
        self.assertEqual(queue.items[0][1], 'light.kitchen')
        self.assertEqual(probe.handled, [registry])

    async def test_flush_notifies_each_change_but_writes_once(self) -> None:
        probe = _FlushProbe()
        changes = [
            live_state_change(_event('light.kitchen', 'on')),
            live_state_change(_event('sensor.temperature', '21.5')),
            live_state_change(_removed('light.old')),
        ]
        await probe._flush_live_state_changes('conn-1', changes)
        # 外发逐条：3 条变化各一次，且载荷严格保持监听器契约的四个字段。
        self.assertEqual(len(probe.notified), 3)
        for kind, payload in probe.notified:
            self.assertEqual(kind, 'change')
            self.assertEqual(set(payload), {'entity_id', 'old_state', 'new_state', 'time_fired'})
        # 3D 读模型只收 watched 实体；删除按 event 里的 entity_id 处理。
        self.assertEqual(probe.state_hub.updated, ['light.kitchen'])
        self.assertEqual(probe.state_hub.removed, ['light.old'])
        # 数据库一批一次、目录只刷新一次。
        self.assertEqual(probe.applied, [('conn-1', ['light.kitchen', 'sensor.temperature'])])
        self.assertEqual(probe.state_hub.published, [
            {'type': 'entity_catalog_changed', 'operation': 'added', 'counts': {'entities': 4, 'devices': 1, 'areas': 1}},
        ])


class _SyncProbe(HASyncMixin):
    def __init__(self, database: Database) -> None:
        self.database = database
        self._known_entity_ids: set[tuple[str, str]] = set()
        self._incremental_flushed_at: dict[str, float] = {}


class IncrementalStateBatchTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.settings = Settings(data_dir = Path(self._tmp.name))
        prepare_schema(self.settings)
        self.database = Database(self.settings.database_url)
        with self.database.session_factory() as session:
            session.add(HAConnection(id = 'conn-1', base_url = BASE_URL, encrypted_access_token = _PLACEHOLDER_CIPHERTEXT, is_active = False))
            session.commit()
        self.probe = _SyncProbe(self.database)

    def tearDown(self) -> None:
        self.database.engine.dispose()
        self._tmp.cleanup()

    def _counts(self) -> tuple[int, int, int, int]:
        with self.database.session_factory() as session:
            entities = session.scalar(select(func.count()).select_from(HAEntity).where(HAEntity.connection_id == 'conn-1'))
            state = session.get(HASyncState, 'conn-1')
            return (
                int(entities or 0),
                int(state.entity_count if state is not None else -1),
                int(state.catalog_revision if state is not None else -1),
                int(state.last_incremental_at is not None),
            )

    def test_batch_inserts_entities_in_one_transaction(self) -> None:
        changed = self.probe._apply_incremental_states('conn-1', [
            _state('light.kitchen'),
            _state('sensor.temperature'),
        ])
        self.assertTrue(changed)
        entities, entity_count, catalog_revision, flushed = self._counts()
        self.assertEqual(entities, 2)
        self.assertEqual(entity_count, 2)
        self.assertEqual(catalog_revision, 1)
        self.assertEqual(flushed, 1)

    def test_known_entities_within_flush_window_are_skipped(self) -> None:
        self.probe._apply_incremental_states('conn-1', [_state('light.kitchen')])
        changed = self.probe._apply_incremental_states('conn-1', [
            _state('light.kitchen'),
            _state('sensor.temperature'),
        ])
        # 第二个实体是新实体，因此目录仍然变化；已登记的那条不再写。
        self.assertTrue(changed)
        entities, entity_count, catalog_revision, _ = self._counts()
        self.assertEqual(entities, 2)
        self.assertEqual(entity_count, 2)
        self.assertEqual(catalog_revision, 2)
        self.assertFalse(self.probe._apply_incremental_states('conn-1', [
            _state('light.kitchen'),
            _state('sensor.temperature'),
        ]))

    def test_single_entry_wrapper_delegates_to_batch(self) -> None:
        self.assertTrue(self.probe._apply_incremental_state('conn-1', _state('light.kitchen')))
        self.assertFalse(self.probe._apply_incremental_state('conn-1', _state('light.kitchen')))
        entities, _, _, _ = self._counts()
        self.assertEqual(entities, 1)

    def test_empty_or_invalid_batch_is_noop(self) -> None:
        self.assertFalse(self.probe._apply_incremental_states('conn-1', []))
        self.assertFalse(self.probe._apply_incremental_states('conn-1', [{'state': 'on'}]))
        with self.database.session_factory() as session:
            self.assertEqual(session.scalar(select(func.count()).select_from(HAEntity)), 0)
