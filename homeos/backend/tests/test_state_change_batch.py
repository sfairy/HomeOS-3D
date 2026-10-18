"""状态变更批处理：同一批只广播一次，过滤/无效条目不得产生广播。"""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from src.bootstrap.lifespan import _make_state_bus_handlers


class _FakeStore:
    def __init__(self) -> None:
        self.applied: list[tuple[str, object, object]] = []

    def get(self, entity_id: str):
        return {"entity_id": entity_id, "state": "old"}

    def apply_change(self, entity_id, new_state, changed_at) -> None:
        self.applied.append((entity_id, new_state, changed_at))


class _FakeGateway:
    def __init__(self) -> None:
        self.batches: list[list[dict]] = []

    async def broadcast_state_changed_batch(self, changes) -> None:
        self.batches.append(list(changes))


class StateChangeBatchTest(unittest.IsolatedAsyncioTestCase):
    def _handlers(self, state=None):
        app = SimpleNamespace(state=state if state is not None else SimpleNamespace())
        gateway = _FakeGateway()
        store = _FakeStore()
        return _make_state_bus_handlers(app, gateway, store), gateway, store

    async def test_batch_broadcasts_exactly_once(self) -> None:
        handlers, gateway, store = self._handlers()
        await handlers["ha.state_changed.batch"](
            {
                "changes": [
                    {"entity_id": "light.a", "new_state": "on"},
                    {"entity_id": "light.b", "new_state": "off"},
                ]
            }
        )
        self.assertEqual(len(gateway.batches), 1)
        self.assertEqual([item["entity_id"] for item in gateway.batches[0]], ["light.a", "light.b"])
        self.assertEqual(len(store.applied), 2)

    async def test_invalid_entries_are_skipped_without_broadcast(self) -> None:
        handlers, gateway, _store = self._handlers()
        await handlers["ha.state_changed.batch"]({"changes": [{"new_state": "on"}, "junk"]})
        self.assertEqual(gateway.batches, [])

    async def test_sync_filter_excludes_entity_from_broadcast(self) -> None:
        class _Filter:
            def is_entity_syncable(self, entity_id: str) -> bool:
                return entity_id != "light.hidden"

        handlers, gateway, _store = self._handlers(
            SimpleNamespace(entity_sync_filter=_Filter())
        )
        await handlers["ha.state_changed.batch"](
            {
                "changes": [
                    {"entity_id": "light.visible", "new_state": "on"},
                    {"entity_id": "light.hidden", "new_state": "off"},
                ]
            }
        )
        self.assertEqual(len(gateway.batches), 1)
        self.assertEqual([item["entity_id"] for item in gateway.batches[0]], ["light.visible"])

    async def test_single_change_handler_broadcasts_once(self) -> None:
        handlers, gateway, _store = self._handlers()
        await handlers["ha.state_changed"]({"entity_id": "sensor.temp", "new_state": "21"})
        self.assertEqual(len(gateway.batches), 1)
        self.assertEqual(gateway.batches[0][0]["entity_id"], "sensor.temp")


if __name__ == "__main__":
    unittest.main()
