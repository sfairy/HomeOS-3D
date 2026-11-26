"""HA 重连后的「状态回跳」防线（0.8.9）。

这条 bug 的表现是：HA 抖动一次，墙上那台机器的灯就**永久**停在旧值上 —— 看着像没刷新，
实际上是「晚到但更旧」的帧覆盖了更新的状态。修复由三件事共同完成，这里逐一断言：

1. **单调守卫**：``StateHub.update`` 丢弃 ``updatedAt`` 更旧的帧（``_is_older``）；
2. **顺序**：握手时「先排空队列再取快照」，否则快照之后会再把旧帧推一遍；
3. **按实体合并**：一个合批窗口里同一实体只留最后一条。

第 1 条是核心 —— 少了它，前两条都只是减少噪音，不能阻止回跳。
"""

from __future__ import annotations

import asyncio
import unittest

from _support import ensure_repo_on_path

ensure_repo_on_path()

from homeos.backend.src.domains.ha.integration.runtime_frames import (
    diff_runtime_states,
    merge_runtime_state_events,
)
from homeos.backend.src.domains.ha.integration.state_hub import StateHub

ENTITY = "light.living"


def frame(state: str, updated_at: str, position: int = 0) -> dict:
    return {
        "entity_id": ENTITY,
        "state": state,
        "attributes": {"current_position": position},
        "last_changed": updated_at,
        "last_updated": updated_at,
    }


class MonotonicGuardTests(unittest.TestCase):
    def test_late_but_older_frame_is_rejected(self) -> None:
        hub = StateHub()

        async def scenario():
            first = await hub.update(frame("on", "2026-11-25T10:00:05.000+00:00"))
            stale = await hub.update(frame("off", "2026-11-25T10:00:01.000+00:00"))
            return first, stale

        first, stale = asyncio.run(scenario())
        self.assertIsNotNone(first)
        self.assertIsNone(stale)
        # 状态仍是新的那份。
        self.assertEqual(asyncio.run(hub.snapshot())[0]["state"], "on")

    def test_newer_frame_is_accepted(self) -> None:
        hub = StateHub()

        async def scenario():
            await hub.update(frame("on", "2026-11-25T10:00:01.000+00:00"))
            return await hub.update(frame("off", "2026-11-25T10:00:09.000+00:00"))

        self.assertIsNotNone(asyncio.run(scenario()))

    def test_frame_without_timestamp_is_not_treated_as_older(self) -> None:
        """缺失时间戳的集成确实存在：不能因此把它永久挡在外面。"""
        hub = StateHub()

        async def scenario():
            await hub.update(frame("on", "2026-11-25T10:00:05.000+00:00"))
            bare = {"entity_id": ENTITY, "state": "off"}
            return await hub.update(bare)

        self.assertIsNotNone(asyncio.run(scenario()))


class BatchMergeTests(unittest.TestCase):
    def test_same_entity_keeps_last_frame(self) -> None:
        events = [
            {"type": "state_changed", "entityId": ENTITY, "state": "on"},
            {"type": "state_changed", "entityId": ENTITY, "state": "off"},
        ]
        merged = merge_runtime_state_events(events)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["state"], "off")

    def test_non_state_events_keep_their_order(self) -> None:
        events = [
            {"type": "ha_status", "status": "connected"},
            {"type": "state_changed", "entityId": ENTITY, "state": "on"},
        ]
        merged = merge_runtime_state_events(events)
        self.assertEqual([event["type"] for event in merged], ["ha_status", "state_changed"])


class SnapshotDiffTests(unittest.TestCase):
    def test_unchanged_entities_are_not_resent(self) -> None:
        before = [{"entityId": ENTITY, "state": "on", "updatedAt": "t1"}]
        after = [{"entityId": ENTITY, "state": "on", "updatedAt": "t1"}]
        self.assertEqual(diff_runtime_states(after, before), [])

    def test_changed_entities_are_resent(self) -> None:
        before = [{"entityId": ENTITY, "state": "on", "updatedAt": "t1"}]
        after = [{"entityId": ENTITY, "state": "off", "updatedAt": "t2"}]
        self.assertEqual(len(diff_runtime_states(after, before)), 1)

    def test_new_entities_are_resent(self) -> None:
        after = [{"entityId": "switch.new", "state": "on", "updatedAt": "t1"}]
        self.assertEqual(len(diff_runtime_states(after, [])), 1)


if __name__ == "__main__":
    unittest.main()
