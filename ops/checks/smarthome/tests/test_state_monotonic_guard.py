"""S2 回归：状态写入的单调守卫。

1. ``StateStore.apply_state_changed_hot`` 拒绝更旧的 ``last_updated``（L1 热路径用它）；
2. ``StateHub.update`` 拒绝更旧的帧（3D / ``/ws/runtime`` 用它）；
3. 热路径封装 ``_apply_state_change`` 在被拒时返回 ``False``，让调用方跳过副作用与广播。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.bootstrap import ha_state_effects
from src.domains.ha.integration.state_hub import StateHub
from src.realtime.state_store import StateStore


def _run(coro):
    return asyncio.run(coro)


def _state(state: str, updated: str) -> dict[str, Any]:
    return {"entity_id": "sensor.t", "state": state, "attributes": {}, "last_updated": updated}


class StateStoreMonotonicTests(unittest.TestCase):
    def test_stale_frame_rejected(self) -> None:
        store = StateStore()
        self.assertTrue(
            store.apply_state_changed_hot(
                {"entity_id": "sensor.t", "new_state": _state("1", "2026-11-11T10:00:00.000Z")}
            )
        )

        accepted = store.apply_state_changed_hot(
            {"entity_id": "sensor.t", "new_state": _state("0", "2026-11-11T09:00:00.000Z")}
        )

        self.assertFalse(accepted)
        self.assertEqual(store.get("sensor.t")["state"], "1")

    def test_newer_frame_accepted(self) -> None:
        store = StateStore()
        store.apply_state_changed_hot({"entity_id": "sensor.t", "new_state": _state("1", "2026-11-11T10:00:00.000Z")})

        accepted = store.apply_state_changed_hot(
            {"entity_id": "sensor.t", "new_state": _state("2", "2026-11-11T11:00:00.000Z")}
        )

        self.assertTrue(accepted)
        self.assertEqual(store.get("sensor.t")["state"], "2")

    def test_missing_timestamp_does_not_block(self) -> None:
        """时间戳缺失时必须放行：宁可放过一帧，也不要把正常更新永久挡在外面。"""
        store = StateStore()
        store.apply_state_changed_hot({"entity_id": "sensor.t", "new_state": _state("1", "2026-11-11T10:00:00.000Z")})

        accepted = store.apply_state_changed_hot(
            {"entity_id": "sensor.t", "new_state": {"entity_id": "sensor.t", "state": "3"}}
        )

        self.assertTrue(accepted)


class StateHubMonotonicTests(unittest.TestCase):
    def test_stale_frame_rejected(self) -> None:
        hub = StateHub()
        _run(hub.update({"entity_id": "sensor.t", "state": "1", "last_updated": "2026-11-11T10:00:00.000Z"}))

        result = _run(hub.update({"entity_id": "sensor.t", "state": "0", "last_updated": "2026-11-11T09:00:00.000Z"}))

        self.assertIsNone(result)
        self.assertEqual(_run(hub.snapshot())[0]["state"], "1")

    def test_newer_frame_accepted(self) -> None:
        hub = StateHub()
        _run(hub.update({"entity_id": "sensor.t", "state": "1", "last_updated": "2026-11-11T10:00:00.000Z"}))

        result = _run(hub.update({"entity_id": "sensor.t", "state": "2", "last_updated": "2026-11-11T11:00:00.000Z"}))

        self.assertIsNotNone(result)
        self.assertEqual(result["state"], "2")


class HotPathWrapperTests(unittest.TestCase):
    def test_rejected_frame_reports_false(self) -> None:
        store = StateStore()
        app = SimpleNamespace(state=SimpleNamespace())
        store.apply_state_changed_hot({"entity_id": "sensor.t", "new_state": _state("1", "2026-11-11T10:00:00.000Z")})

        accepted = ha_state_effects._apply_state_change(
            app,
            None,
            store,
            {"entity_id": "sensor.t", "new_state": _state("0", "2026-11-11T09:00:00.000Z")},
        )

        self.assertFalse(accepted)
        self.assertEqual(store.get("sensor.t")["state"], "1")

    def test_accepted_frame_backfills_old_state(self) -> None:
        store = StateStore()
        app = SimpleNamespace(state=SimpleNamespace())
        store.apply_change("sensor.t", _state("off", "2026-11-11T09:00:00.000Z"))
        change = {"entity_id": "sensor.t", "new_state": _state("on", "2026-11-11T10:00:00.000Z")}

        accepted = ha_state_effects._apply_state_change(app, None, store, change)

        self.assertTrue(accepted)
        self.assertEqual(change["old_state"]["state"], "off")


if __name__ == "__main__":
    unittest.main()
