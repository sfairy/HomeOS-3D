"""HA 实时通讯与实体同步的回归网：重连回放 / 重同步广播 / 运行时快照时序 / 订阅口径。

这几条的共同点是「界面显示已连接，数据却永久停在旧值」——没有异常、没有告警，
只能靠单测锁住：

- ``set_all`` 不写环形缓冲 → 重连回放是空的，客户端把「什么都没变」当成「已补齐」；
- 客户端基线之后发生过全量同步、但回放覆盖不到那个时刻 → 同上，必须改判 ``resync``；
- 全量对账算出的差异不广播 → 已连接客户端只能等下一次全量（可能永远等不到）；
- ``/ws/runtime`` 在取快照前不清握手期队列 → 快照之后又被旧帧推回过去；
- ``pinned`` 被放进 ``cold_on_demand`` 分支 → 布局里绑定的实体初态有、之后永不更新。
"""

from __future__ import annotations

import asyncio
import unittest
from datetime import UTC, datetime
from typing import Any
from unittest.mock import patch

from fastapi import FastAPI
from src.api.ha.routes import (
    _diff_runtime_states,
    _drain_runtime_queue_now,
    _runtime_queue_put,
    _RuntimeSubscriptionState,
    _send_runtime_state_frames,
)
from src.bootstrap.ha_state_effects import (
    RESYNC_BROADCAST_MAX_CHANGES,
    _apply_initial_snapshot,
)
from src.bootstrap.lifespan import _make_state_bus_handlers
from src.domains.ha.integration.state_hub import StateHub
from src.realtime.gateway_lifecycle import ConnectionLifecycleMixin
from src.realtime.state_store import StateStore
from src.realtime.subscription import is_entity_visible_to_client


def _entity(entity_id: str, state: str, updated: str) -> dict[str, Any]:
    return {
        "entity_id": entity_id,
        "state": state,
        "attributes": {"friendly_name": entity_id},
        "last_updated": updated,
        "last_changed": updated,
    }


def _iso(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(ms) % 1000:03d}Z"


class _Clock:
    """受控时钟：每次取时 +1s，避免同一毫秒内两次 ``set_all`` 让判据失效。"""

    def __init__(self, start_ms: float = 1_700_000_000_000.0) -> None:
        self.ms = start_ms

    def iso(self) -> str:
        value = self.ms
        self.ms += 1000.0
        return _iso(value)


class SetAllReplayVisibilityTest(unittest.TestCase):
    """``set_all`` 的差异必须进环形缓冲，否则重连回放看不见对账结果。"""

    def setUp(self) -> None:
        self.clock = _Clock()
        self._patch = patch("src.realtime.state_store._iso_now", self.clock.iso)
        self._patch.start()
        self.store = StateStore()

    def tearDown(self) -> None:
        self._patch.stop()

    def test_changed_entities_are_replayable_after_full_sync(self) -> None:
        changes = self.store.set_all([_entity("light.a", "on", "2026-11-01T10:00:05.000Z")])
        full_sync_ms = self.store.get_last_full_sync_ms()
        records = self.store.get_recent_changes_since(0, 0)

        assert len(changes) == 1 and changes[0]["entity_id"] == "light.a"
        assert len(records) == 1
        # 记录的 ``at`` 是「发现变化的时刻」，回放游标必须能对齐到全量同步那一刻。
        assert records[0]["at"] == full_sync_ms
        assert [record["entity_id"] for record in self.store.get_recent_changes_since(full_sync_ms - 1, 0)] == [
            "light.a"
        ]

    def test_unchanged_snapshot_writes_no_change_record(self) -> None:
        snapshot = [
            _entity("light.a", "on", "2026-11-01T10:00:05.000Z"),
            _entity("sensor.b", "1", "2026-11-01T10:00:05.000Z"),
        ]
        self.store.set_all(snapshot)
        before = len(self.store.get_recent_changes_since(0, 0))

        assert self.store.set_all(snapshot) == []
        assert len(self.store.get_recent_changes_since(0, 0)) == before
        # 空差异也要推进「上次全量同步」：回放判据靠它识别「基线之后整体重铺过」。
        assert self.store.get_last_full_sync_ms() > 0

    def test_record_time_tracks_sync_not_entity_timestamp(self) -> None:
        # 实体自带的时间戳可能远早于对账时刻（断连窗口里的旧快照）。环形缓冲的 ``at``
        # 若跟着实体时间戳走就会倒序，``is_replay_truncated`` 拿 ``_recent[0].at``
        # 判起点会误判成「已淘汰」，重连客户端被反复要求重同步。
        self.store.set_all([_entity("light.a", "on", "2020-01-01T00:00:00.000Z")])
        self.store.set_all([_entity("light.b", "on", "2020-01-01T00:00:00.000Z")])

        ats = [record["at"] for record in self.store.get_recent_changes_since(0, 0)]
        assert ats == sorted(ats) and len(set(ats)) == 2
        assert self.store.is_replay_truncated(0, 0) is False

    def test_replay_after_full_sync_includes_deletion(self) -> None:
        self.store.set_all([_entity("light.a", "on", "2026-11-01T10:00:05.000Z")])
        assert self.store.remove("light.a") is not None

        records = self.store.get_recent_changes_since(0, 0)
        assert records[-1]["entity_id"] == "light.a"
        assert records[-1]["new_state"] is None


class _FakeSio:
    def __init__(self) -> None:
        self.emitted: list[tuple[str, dict[str, Any], str | None]] = []

    async def emit(self, event: str, payload: dict[str, Any], to: str | None = None) -> None:
        self.emitted.append((event, payload, to))


class _ReplayHarness(ConnectionLifecycleMixin):
    """只装配 ``_emit_connect_state_replay`` 用到的两件依赖。"""

    def __init__(self, store: StateStore) -> None:
        self.state_store = store
        self.sio = _FakeSio()


def _auth(since_ms: float, last_event_id: int = 0, *, has_baseline: bool = True) -> dict[str, Any]:
    return {
        "hasBaseline": has_baseline,
        "since": str(int(since_ms)) if since_ms else "",
        "lastEventId": str(last_event_id) if last_event_id else "",
    }


class ReplayCoverageTest(unittest.TestCase):
    """``state_replay`` 只有在覆盖到最近一次全量同步时才可信。"""

    def setUp(self) -> None:
        self.clock = _Clock()
        self._patch = patch("src.realtime.state_store._iso_now", self.clock.iso)
        self._patch.start()
        self.store = StateStore()
        self.harness = _ReplayHarness(self.store)

    def tearDown(self) -> None:
        self._patch.stop()

    def _replay(self, auth: dict[str, Any]) -> str:
        return asyncio.run(self.harness._emit_connect_state_replay("sid-1", {}, auth))

    def test_full_sync_after_since_without_coverage_asks_resync(self) -> None:
        self.store.set_all([_entity("light.a", "on", "2026-11-01T10:00:05.000Z")])
        first_sync_ms = self.store.get_last_full_sync_ms()
        # 第二次对账没算出差异 → 环形缓冲里没有任何 ``at >= 第二次同步时刻`` 的记录。
        assert self.store.set_all([_entity("light.a", "on", "2026-11-01T10:00:05.000Z")]) == []

        result = self._replay(_auth(first_sync_ms))

        assert result == "resync"
        assert [event for event, _, _ in self.harness.sio.emitted] == ["resync_suggested"]
        assert self.harness.sio.emitted[0][1]["reason"] == "full_sync_after_since"

    def _baseline_then_full_sync(self) -> float:
        """造一条早于全量同步的回放记录，返回「客户端可信基线」的时刻。

        ``since`` 必须晚于环形缓冲最旧记录，否则 ``is_replay_truncated`` 会（正确）
        判定「起点之前的变更已被淘汰」。真实场景里这也成立：客户端基线来自它上次
        收到的变更，而不是某个凭空的更早时刻。
        """
        self.store.apply_change(
            "sensor.old",
            _entity("sensor.old", "1", "2026-11-01T10:00:00.000Z"),
            self.clock.iso(),
        )
        oldest_at = self.store.get_recent_changes_since(0, 0)[0]["at"]
        self.store.set_all([_entity("light.a", "on", "2026-11-01T10:00:05.000Z")])
        assert self.store.get_last_full_sync_ms() > oldest_at
        return oldest_at + 1

    def test_full_sync_covered_by_diff_still_replays(self) -> None:
        since_ms = self._baseline_then_full_sync()

        result = self._replay(_auth(since_ms))

        assert result == "replayed"
        events = [event for event, _, _ in self.harness.sio.emitted]
        assert events == ["state_replay"]
        payload = self.harness.sio.emitted[0][1]
        # 对账快照里没有 sensor.old → 差异里还带一条删除；两条都必须能回放。
        assert payload["count"] == len(self.store.get_recent_changes_since(since_ms, 0)) == 2
        assert payload["lastEventId"] == self.store.get_latest_change_id()
        assert "light.a" in [change["entity_id"] for change in payload["changes"]]

    def test_replay_marks_removed_entities(self) -> None:
        since_ms = self._baseline_then_full_sync()
        self.store.remove("light.a")

        assert self._replay(_auth(since_ms)) == "replayed"
        changes = self.harness.sio.emitted[0][1]["changes"]
        removed = [change for change in changes if change.get("entity_id") == "light.a" and change.get("removed")]
        assert removed and removed[-1]["new_state"] is None

    def test_cursor_ahead_of_process_forces_resync(self) -> None:
        self.store.apply_change("light.a", _entity("light.a", "on", "2026-11-01T10:00:05.000Z"))

        assert self._replay(_auth(0, 99)) == "resync"
        assert self.harness.sio.emitted[0][1]["reason"] == "replay_truncated"

    def test_client_without_baseline_gets_no_replay(self) -> None:
        self.store.set_all([_entity("light.a", "on", "2026-11-01T10:00:05.000Z")])

        assert self._replay(_auth(self.store.get_last_full_sync_ms(), has_baseline=False)) == "none"
        assert self.harness.sio.emitted == []


class _RecordingBus:
    def __init__(self) -> None:
        self.events: list[tuple[str, Any]] = []

    async def emit(self, event: str, payload: Any) -> None:
        self.events.append((event, payload))

    def names(self) -> list[str]:
        return [name for name, _ in self.events]

    def payload(self, name: str) -> Any:
        return next(payload for event, payload in self.events if event == name)


class _SyncFilter:
    """展示过滤：``__hidden`` 结尾的实体只留 L1、不推给客户端。"""

    @staticmethod
    def is_entity_syncable(entity_id: str) -> bool:
        return not entity_id.endswith("__hidden")

    @classmethod
    def filter_syncable_states(cls, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [entity for entity in entities if cls.is_entity_syncable(str(entity.get("entity_id")))]


class ResyncBroadcastTest(unittest.TestCase):
    """全量对账算出的差异既要广播，又不能把 L1 的「全量口径」带偏。"""

    def setUp(self) -> None:
        self.app = FastAPI()
        self.app.state.ha_entity_count = 0
        self.store = StateStore()
        self.bus = _RecordingBus()

    def _snapshot(self, states: list[dict[str, Any]], preserve: list[str] | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"states": states}
        if preserve is not None:
            payload["preserve"] = preserve
        return payload

    def test_diff_batch_is_broadcast_before_full_states(self) -> None:
        self.store.set_all([_entity("light.a", "on", "2026-11-01T10:00:00.000Z")])

        asyncio.run(
            _apply_initial_snapshot(
                self.app,
                self.store,
                self._snapshot(
                    [
                        _entity("light.a", "off", "2026-11-01T10:00:09.000Z"),
                        _entity("sensor.b", "1", "2026-11-01T10:00:09.000Z"),
                    ]
                ),
                self.bus,
                None,
            )
        )

        assert self.bus.names() == ["ha.state_changed.batch", "ha.initial_states"]
        batch = self.bus.payload("ha.state_changed.batch")
        assert batch["applied"] is True and batch["reason"] == "resync"
        assert sorted(change["entity_id"] for change in batch["changes"]) == ["light.a", "sensor.b"]
        assert self.app.state.ha_entity_count == 2

    def test_unchanged_snapshot_only_broadcasts_full_states(self) -> None:
        snapshot = [_entity("light.a", "on", "2026-11-01T10:00:00.000Z")]
        self.store.set_all(snapshot)

        asyncio.run(_apply_initial_snapshot(self.app, self.store, self._snapshot(snapshot), self.bus, None))

        # 没有差异就不该补推：每个实体一条广播会把「后台对账」变成事件风暴。
        assert self.bus.names() == ["ha.initial_states"]

    def test_oversized_diff_degrades_to_resync_suggestion(self) -> None:
        entities = [
            _entity(f"light.l{index}", "on", "2026-11-01T10:00:00.000Z")
            for index in range(RESYNC_BROADCAST_MAX_CHANGES + 5)
        ]

        asyncio.run(_apply_initial_snapshot(self.app, self.store, self._snapshot(entities), self.bus, None))

        assert self.bus.names() == ["ha.resync_suggested", "ha.initial_states"]
        suggestion = self.bus.payload("ha.resync_suggested")
        assert suggestion["reason"] == "resync_too_large"
        assert suggestion["count"] == RESYNC_BROADCAST_MAX_CHANGES + 5

    def test_hidden_entities_stay_in_l1_but_not_in_broadcast(self) -> None:
        asyncio.run(
            _apply_initial_snapshot(
                self.app,
                self.store,
                self._snapshot(
                    [
                        _entity("light.a", "on", "2026-11-01T10:00:00.000Z"),
                        _entity("sensor.secret__hidden", "1", "2026-11-01T10:00:00.000Z"),
                    ]
                ),
                self.bus,
                _SyncFilter(),
            )
        )

        assert self.store.get("sensor.secret__hidden") is not None
        assert self.app.state.ha_entity_count == 1
        assert [entity["entity_id"] for entity in self.bus.payload("ha.initial_states")["entities"]] == ["light.a"]
        batch = self.bus.payload("ha.state_changed.batch")
        assert [change["entity_id"] for change in batch["changes"]] == ["light.a"]


class _RecordingGateway:
    def __init__(self) -> None:
        self.batches: list[list[dict[str, Any]]] = []
        self.resyncs: list[str] = []
        self.catalogs: list[dict[str, Any]] = []

    async def broadcast_state_changed_batch(self, changes: list[dict[str, Any]]) -> None:
        self.batches.append(changes)

    async def broadcast_resync_suggested(self, reason: str = "resync") -> None:
        self.resyncs.append(reason)

    async def broadcast_entity_catalog_changed(self, payload: dict[str, Any]) -> None:
        self.catalogs.append(payload)


class AppliedBatchDedupeTest(unittest.TestCase):
    """对账差异已经由 ``set_all`` 写过 L1，事件总线不能再写一遍回放记录。"""

    def setUp(self) -> None:
        self.app = FastAPI()
        self.app.state.ha_entity_count = 0
        self.store = StateStore()
        self.gateway = _RecordingGateway()
        self.handlers = _make_state_bus_handlers(self.app, self.gateway, self.store)

    def test_applied_batch_broadcasts_without_duplicating_replay_records(self) -> None:
        diff = self.store.set_all([_entity("light.a", "on", "2026-11-01T10:00:00.000Z")])
        before = len(self.store.get_recent_changes_since(0, 0))

        asyncio.run(self.handlers["ha.state_changed.batch"]({"changes": diff, "applied": True}))

        assert len(self.store.get_recent_changes_since(0, 0)) == before
        assert len(self.gateway.batches) == 1
        assert [change["entity_id"] for change in self.gateway.batches[0]] == ["light.a"]

    def test_live_batch_updates_l1_and_broadcasts(self) -> None:
        self.store.set_all([_entity("light.a", "on", "2026-11-01T10:00:00.000Z")])

        asyncio.run(
            self.handlers["ha.state_changed.batch"](
                {
                    "changes": [
                        {
                            "entity_id": "light.a",
                            "old_state": _entity("light.a", "on", "2026-11-01T10:00:00.000Z"),
                            "new_state": _entity("light.a", "off", "2026-11-01T10:00:09.000Z"),
                            "changed_at": "2026-11-01T10:00:09.000Z",
                        }
                    ]
                }
            )
        )

        state = self.store.get("light.a")
        assert state is not None and state["state"] == "off"
        assert len(self.gateway.batches) == 1
        assert len(self.store.get_recent_changes_since(0, 0)) == 2


class RuntimeHandshakeOrderTest(unittest.TestCase):
    """``/ws/runtime``：先清握手期队列、再取快照，补全只推差异。"""

    def test_drain_runtime_queue_drops_handshake_frames(self) -> None:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        queue.put_nowait({"type": "state_changed", "entityId": "light.a"})
        queue.put_nowait({"type": "state_changed", "entityId": "light.b"})

        assert _drain_runtime_queue_now(queue) == 2
        assert queue.empty()

    def test_subscription_setup_clears_stale_frames_and_filters(self) -> None:
        hub = StateHub()
        queue = hub.subscribe()
        queue.put_nowait({"type": "state_changed", "entityId": "light.a"})

        hub.set_subscription_entities(queue, {"light.b"})

        assert queue.empty(), "握手期排队的帧必须丢弃，快照才是权威数据"
        asyncio.run(hub.publish({"type": "state_changed", "entityId": "light.a"}))
        assert queue.empty(), "未订阅实体的增量不能投递"
        asyncio.run(hub.publish({"type": "state_changed", "entityId": "light.b"}))
        assert not queue.empty()

    def test_diff_runtime_states_only_returns_changed_entities(self) -> None:
        previous = [
            {"entityId": "light.a", "state": "on", "updatedAt": "2026-11-01T10:00:00.000Z"},
            {"entityId": "light.b", "state": "off", "updatedAt": "2026-11-01T10:00:00.000Z"},
        ]
        current = [
            {"entityId": "light.a", "state": "on", "updatedAt": "2026-11-01T10:00:00.000Z"},
            {"entityId": "light.b", "state": "on", "updatedAt": "2026-11-01T10:00:09.000Z"},
            {"entityId": "sensor.new", "state": "1", "updatedAt": "2026-11-01T10:00:09.000Z"},
        ]

        changed = _diff_runtime_states(current, previous)

        assert [item["entityId"] for item in changed] == ["light.b", "sensor.new"]

    def test_queue_put_never_loses_the_newest_frame(self) -> None:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=2)
        _runtime_queue_put(queue, {"type": "state_changed", "entityId": "light.a"})
        _runtime_queue_put(queue, {"type": "state_changed", "entityId": "light.b"})
        _runtime_queue_put(queue, {"type": "state_changed", "entityId": "light.c"})

        frames = [queue.get_nowait() for _ in range(queue.qsize())]
        # 队列满时丢旧的保新的：最新一帧（订阅变更后的快照）绝不能被挤掉。
        assert frames[-1]["entityId"] == "light.c"
        assert all(frame.get("type") != "resync_required" for frame in frames)

    def test_state_frames_batch_only_when_negotiated(self) -> None:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        subscription = _RuntimeSubscriptionState(queue)
        states = [
            {"type": "state_changed", "entityId": "light.a", "state": "on"},
            {"type": "state_changed", "entityId": "light.b", "state": "off"},
        ]

        async def send_all(supports_batch: bool) -> list[dict[str, Any]]:
            frames: list[dict[str, Any]] = []

            async def send(frame: dict[str, Any]) -> bool:
                frames.append(frame)
                return True

            subscription.supports_state_batch = supports_batch
            assert await _send_runtime_state_frames(states, subscription, send) is True
            return frames

        batched = asyncio.run(send_all(True))
        assert len(batched) == 1 and batched[0]["type"] == "state_changed_batch"
        assert [event["entityId"] for event in batched[0]["events"]] == ["light.a", "light.b"]

        per_frame = asyncio.run(send_all(False))
        assert [frame["entityId"] for frame in per_frame] == ["light.a", "light.b"]

        empty: list[dict[str, Any]] = []

        async def send_empty(frame: dict[str, Any]) -> bool:
            empty.append(frame)
            return True

        assert asyncio.run(_send_runtime_state_frames([], subscription, send_empty)) is True
        assert empty == []


class SubscriptionParityTest(unittest.TestCase):
    """增量与初态必须同一口径：pinned 无条件可见，``coldEntityOnDemand=False`` 不收窄。"""

    def test_pinned_is_visible_even_outside_subscribed_domains(self) -> None:
        assert is_entity_visible_to_client("cover.garage", {"light"}, {"cover.garage"}, set(), True) is True

    def test_cold_on_demand_off_pushes_everything(self) -> None:
        assert is_entity_visible_to_client("switch.heater", {"light"}, set(), set(), False) is True

    def test_subscribed_domain_and_critical_domains_are_visible(self) -> None:
        assert is_entity_visible_to_client("light.kitchen", {"light"}, set(), {"sensor"}, True) is True
        assert is_entity_visible_to_client("binary_sensor.door", {"light"}, set(), {"binary_sensor"}, True) is True

    def test_unsubscribed_unpinned_entity_is_hidden(self) -> None:
        assert is_entity_visible_to_client("switch.heater", {"light"}, {"light.kitchen"}, {"sensor"}, True) is False


if __name__ == "__main__":
    unittest.main()
