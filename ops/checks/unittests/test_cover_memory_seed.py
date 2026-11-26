"""窗帘姿态记忆的 0.8.9 增量（后端侧）：`assumedState` 与 `knownStart`。

同时钉住一个**既有缺陷**的修复：`lastState` 过去被赋成「上一次的 lastState」而不是
「上一帧的状态」，于是它永远不前进。用它判断 `opening` / `closing` 的跃迁，会让每一帧
都被当成「刚进入」—— 行程起点每帧重记，补间永远从最新位置出发（等于没有起点）。

这个缺陷在只记录 `estimates` 时看不出来（`sample()` 用的是位置差），一旦开始记
「起点」就立刻显形，所以必须有断言拦住它。
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from _support import ensure_repo_on_path

ensure_repo_on_path()

from homeos.backend.src.domains.ha.integration.cover_memory import CoverMemory


class CoverMemorySeedTests(unittest.TestCase):
    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._directory.cleanup)
        self.memory = CoverMemory(Path(self._directory.name) / "history.json")

    def observe(self, state: str, attributes: dict | None = None) -> dict:
        self.memory.observe("cover.living", {"state": state, "attributes": attributes or {}})
        return self.memory.entries["cover.living"]

    def test_assumed_state_is_recorded(self) -> None:
        entry = self.observe("open", {"current_position": 40, "assumed_state": True})
        self.assertTrue(entry["assumedState"])

    def test_assumed_state_defaults_to_false(self) -> None:
        entry = self.observe("open", {"current_position": 40})
        self.assertFalse(entry["assumedState"])

    def test_known_start_recorded_on_entering_opening(self) -> None:
        entry = self.observe("opening", {"current_position": 20})
        self.assertEqual(entry["knownStart"]["from"], 20.0)
        self.assertEqual(entry["knownStart"]["direction"], "opening")

    def test_known_start_stays_fixed_within_one_travel(self) -> None:
        first = self.observe("opening", {"current_position": 20})
        start_at = first["knownStart"]["at"]
        second = self.observe("opening", {"current_position": 65})
        self.assertEqual(second["knownStart"]["from"], 20.0)
        self.assertEqual(second["knownStart"]["at"], start_at)

    def test_known_start_updates_when_direction_flips(self) -> None:
        self.observe("opening", {"current_position": 20})
        entry = self.observe("closing", {"current_position": 70})
        self.assertEqual(entry["knownStart"]["direction"], "closing")
        self.assertEqual(entry["knownStart"]["from"], 70.0)

    def test_no_known_start_for_steady_states(self) -> None:
        self.assertNotIn("knownStart", self.observe("open", {"current_position": 40}))
        self.assertNotIn("knownStart", self.observe("closed", {"current_position": 0}))

    def test_no_known_start_without_a_known_position(self) -> None:
        self.assertNotIn("knownStart", self.observe("opening", {}))
        # 有历史位置时，即使本次不报位置也能起算。
        self.observe("open", {"current_position": 35})
        entry = self.observe("closing", {})
        self.assertEqual(entry["knownStart"]["from"], 35.0)

    def test_last_state_tracks_the_previous_frame(self) -> None:
        first = self.observe("open", {"current_position": 40})
        self.assertIsNone(first["lastState"])
        second = self.observe("opening", {"current_position": 42})
        self.assertEqual(second["lastState"], "open")

    def test_reopening_same_direction_after_stop_records_new_start(self) -> None:
        """开 → 停（open）→ 再开：这是两段行程，起点必须刷新。

        起点取「行程首帧上报的位置」而不是「停下时的位置」：HA 报 `opening` 的那一帧
        往往已经移动了一点，`current_position` 是这一刻唯一的新鲜测量值；停下时的位置
        在稀疏上报下可能已经过时数百毫秒。两者都不是精确物理起点，取新鲜的那个。
        """
        self.observe("opening", {"current_position": 10})
        self.observe("open", {"current_position": 50})
        entry = self.observe("opening", {"current_position": 60})
        self.assertEqual(entry["knownStart"]["from"], 60.0)


if __name__ == "__main__":
    unittest.main()
