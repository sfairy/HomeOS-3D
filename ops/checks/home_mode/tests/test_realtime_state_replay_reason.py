"""``StateStore.replay_truncation_reason`` 的语义测试。

两种「游标不可信」的处置相同（都让客户端整包重拉），但排障含义相反：

- 后端重启后，客户端带着**上一个进程**的 seq 重连 —— 环形缓冲毫发无损；
- 变更真的被环形缓冲挤出 —— 容量/压力问题。

若两者混为一谈，日志里的「起点已淘汰」会把每次重启的必然现象读成缓冲不足。
"""

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.realtime.state_store import (
    REPLAY_TRUNCATION_BUFFER_EVICTED,
    REPLAY_TRUNCATION_CURSOR_STALE,
    StateStore,
)


def _ts(second: int) -> str:
    return f"2026-11-05T22:00:{second:02d}.000Z"


class ReplayTruncationReasonTest(unittest.TestCase):
    def test_cursor_ahead_of_current_process_is_stale_cursor(self) -> None:
        """重启后的新进程 seq=0，客户端还带着上一个进程的 779。"""
        store = StateStore()

        reason = store.replay_truncation_reason(0.0, 779)

        self.assertEqual(reason, REPLAY_TRUNCATION_CURSOR_STALE)

    def test_cursor_rolls_out_of_ring_buffer_is_eviction(self) -> None:
        store = StateStore(max_recent_changes=2)
        store.apply_change("light.a", {"state": "on"}, _ts(1))
        store.apply_change("light.a", {"state": "off"}, _ts(2))
        store.apply_change("light.a", {"state": "on"}, _ts(3))
        store.apply_change("light.a", {"state": "off"}, _ts(4))
        # 容量 2 → 只剩 id=3,4；客户端停在 id=1（中间漏了 id=2）。
        reason = store.replay_truncation_reason(0.0, 1)

        self.assertEqual(reason, REPLAY_TRUNCATION_BUFFER_EVICTED)

    def test_since_before_oldest_record_is_eviction(self) -> None:
        store = StateStore()
        record = store.apply_change("light.a", {"state": "on"}, _ts(10))
        store.apply_change("light.a", {"state": "off"}, _ts(11))
        store.apply_change("light.a", {"state": "on"}, _ts(12))

        reason = store.replay_truncation_reason(float(record["at"]) - 1, 1)

        # 游标本身还落在缓冲里，但时间窗已经滚出去：增量同样会漏。
        self.assertEqual(reason, REPLAY_TRUNCATION_BUFFER_EVICTED)

    def test_covered_cursor_is_still_usable(self) -> None:
        store = StateStore()
        record = store.apply_change("light.a", {"state": "on"}, _ts(10))
        store.apply_change("light.a", {"state": "off"}, _ts(11))

        reason = store.replay_truncation_reason(float(record["at"]), int(record["id"]))

        self.assertIsNone(reason)

    def test_empty_store_without_history_is_not_truncated(self) -> None:
        store = StateStore()

        self.assertIsNone(store.replay_truncation_reason(0.0, 0))

    def test_is_replay_truncated_keeps_boolean_contract(self) -> None:
        store = StateStore()

        self.assertTrue(store.is_replay_truncated(0.0, 1))
        self.assertFalse(store.is_replay_truncated(0.0, 0))


if __name__ == "__main__":
    unittest.main()
