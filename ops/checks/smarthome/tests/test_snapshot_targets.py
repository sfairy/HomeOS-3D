"""A3 回归：快照只采集「设备类」动作，不被通知/安防伪实体污染。

``notify`` 的 ``entity_id`` 是消息文本、``security`` 的是布防档位，都不是实体。
以前对每个动作都去查状态，于是几乎每次激活都会误报「N 个设备未采集到快照」。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.home_mode import actions as home_mode_actions
from src.domains.home_mode import snapshot as home_mode_snapshot


def _run(coro):
    return asyncio.run(coro)


class _Deps:
    def __init__(self, states: dict[str, dict[str, Any]]) -> None:
        self.states = states
        self.warned: list[str] = []

    def warn(self, message: str) -> None:
        self.warned.append(message)

    async def fetch_entity_state(self, entity_id: str):
        return self.states.get(entity_id)


class SnapshotTargetTests(unittest.TestCase):
    def test_notify_and_security_are_not_snapshot_targets(self) -> None:
        self.assertFalse(home_mode_snapshot.is_snapshot_target({"kind": "notify", "entity_id": "该睡觉了"}))
        self.assertFalse(home_mode_snapshot.is_snapshot_target({"kind": "security", "entity_id": "armed_night"}))
        self.assertFalse(home_mode_snapshot.is_snapshot_target({"kind": "scene", "entity_id": "scene.movie"}))

    def test_device_action_is_snapshot_target(self) -> None:
        self.assertTrue(home_mode_snapshot.is_snapshot_target({"entity_id": "light.a", "domain": "light"}))

    def test_snapshot_ignores_pseudo_entities(self) -> None:
        deps = _Deps({"light.a": {"state": "on", "attributes": {}}})
        configs = [
            {"entity_id": "light.a", "domain": "light", "service": "turn_off"},
            {"kind": "notify", "entity_id": "晚安，已关灯", "service": "send_message"},
            {"kind": "security", "entity_id": "armed_night"},
        ]

        snapshot, missing = _run(home_mode_actions.collect_device_snapshot(deps, configs))

        self.assertEqual(list(snapshot), ["light.a"])
        # 关键：伪实体不得进入 missing —— 它们本来就没有可恢复的「设备状态」。
        self.assertEqual(missing, [])

    def test_real_missing_device_still_reported(self) -> None:
        deps = _Deps({"light.a": {"state": "on", "attributes": {}}})
        configs = [
            {"entity_id": "light.a", "domain": "light"},
            {"entity_id": "light.offline", "domain": "light"},
            {"kind": "notify", "entity_id": "提示文本"},
        ]

        _snapshot, missing = _run(home_mode_actions.collect_device_snapshot(deps, configs))

        self.assertEqual(missing, ["light.offline"])


if __name__ == "__main__":
    unittest.main()
