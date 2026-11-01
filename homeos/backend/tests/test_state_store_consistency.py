"""L1 状态存储的一致性回归：快照覆盖、删除事件、增量回放游标。

这三条都是「界面毫无异常但数据是错的」类故障，只能靠单测锁住：
- 周期对账用旧快照盖掉窗口内的实时更新（HS-BH-03）；
- HA 删除实体后 L1 / 回放里永久残留（HS-BH-02）；
- 进程重启后客户端拿着上一个进程的游标被判定「已补齐」（HS-BH-04）。
"""

from __future__ import annotations

import unittest

from src.realtime.state_store import StateStore


def _entity(entity_id: str, state: str, updated: str) -> dict:
    return {
        "entity_id": entity_id,
        "state": state,
        "attributes": {},
        "last_updated": updated,
        "last_changed": updated,
    }


class SetAllMonotonicTest(unittest.TestCase):
    """``set_all`` 必须是「快照 + 单调合并」，不能无条件整表替换。"""

    store: StateStore  # pyright: ignore[reportUninitializedInstanceVariable]

    def setUp(self) -> None:
        self.store = StateStore()
        self.store.set_all(
            [
                _entity("light.a", "on", "2026-11-01T10:00:05.000Z"),
                _entity("sensor.b", "1", "2026-11-01T10:00:05.000Z"),
            ]
        )

    def test_snapshot_does_not_revert_newer_in_memory_state(self) -> None:
        # 对账窗口内：灯被打开（10:00:09），随后一份 10:00:05 的快照落地。
        self.store.apply_change("light.a", _entity("light.a", "off", "2026-11-01T10:00:09.000Z"))
        self.store.set_all(
            [
                _entity("light.a", "on", "2026-11-01T10:00:05.000Z"),
                _entity("sensor.b", "1", "2026-11-01T10:00:05.000Z"),
            ]
        )
        state = self.store.get("light.a")
        assert state is not None and state["state"] == "off"

    def test_preserve_keeps_entities_missing_from_snapshot(self) -> None:
        # 窗口内新出现的实体不在快照里：快照是它出现之前的，不能据此删掉它。
        self.store.apply_change("light.new", _entity("light.new", "on", "2026-11-01T10:00:08.000Z"))
        self.store.set_all(
            [_entity("light.a", "on", "2026-11-01T10:00:05.000Z")],
            preserve=["light.new"],
        )
        assert self.store.get("light.new") is not None

    def test_snapshot_is_authoritative_for_unseen_entities(self) -> None:
        # 快照里没有、也没在窗口内更新的实体：按「快照即权威」删除（实体删除的兜底）。
        self.store.set_all([_entity("light.a", "on", "2026-11-01T10:00:05.000Z")])
        assert self.store.get("sensor.b") is None

    def test_missing_timestamp_falls_back_to_snapshot(self) -> None:
        # 缺时间戳时不做「内存更新」推断：拿不到凭据就按快照走，避免永久脏读。
        self.store.set_all([_entity("light.a", "on", "2026-11-01T10:00:05.000Z")])
        self.store.set_all([{"entity_id": "light.a", "state": "off", "attributes": {}}])
        state = self.store.get("light.a")
        assert state is not None and state["state"] == "off"


class RemovalReplayTest(unittest.TestCase):
    """删除必须进环形缓冲，且重复删除不制造空变更。"""

    def test_remove_drops_state_and_records_change(self) -> None:
        store = StateStore()
        store.set_all([_entity("light.a", "on", "2026-11-01T10:00:05.000Z")])
        removed = store.remove("light.a")
        assert removed is not None
        assert store.get("light.a") is None
        changes = store.get_recent_changes_since(0, 0)
        assert changes and changes[-1]["new_state"] is None

    def test_remove_unknown_entity_does_not_append_change(self) -> None:
        store = StateStore()
        assert store.remove("light.ghost") is None
        assert store.get_recent_changes_since(0, 0) == []


class ReplayCursorTest(unittest.TestCase):
    """跨进程重启后，客户端游标会超前于本进程的 id 序列。"""

    def test_cursor_ahead_of_this_process_is_truncated(self) -> None:
        store = StateStore()
        store.apply_change("light.a", _entity("light.a", "on", "2026-11-01T10:00:05.000Z"))
        # 上一个进程用到 1200，本进程只产生 1 条 —— 增量必然有洞。
        assert store.is_replay_truncated(0, 1200) is True

    def test_empty_buffer_with_fresh_cursor_is_neither(self) -> None:
        store = StateStore()
        # 全新进程 + 首个客户端（last_event_id=0）：没有历史，不算截断，
        # 但也拿不到任何增量，调用方仍应走全量。
        assert store.is_replay_truncated(0, 0) is False

    def test_cursor_within_window_is_not_truncated(self) -> None:
        store = StateStore()
        store.apply_change("light.a", _entity("light.a", "on", "2026-11-01T10:00:05.000Z"))
        store.apply_change("light.a", _entity("light.a", "off", "2026-11-01T10:00:06.000Z"))
        assert store.is_replay_truncated(0, 1) is False


if __name__ == "__main__":
    unittest.main()
