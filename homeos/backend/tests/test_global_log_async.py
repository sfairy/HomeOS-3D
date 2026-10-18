"""全局日志异步落盘：append 不阻塞、查询立即可见、flush/close 保证顺序与完整。"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from src.domains.logs.global_log import GlobalLogStore


def _read_lines(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


class GlobalLogAsyncTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.store = GlobalLogStore(Path(self._tmp.name))
        self.path = Path(self._tmp.name) / "logs" / "global-events.jsonl"

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def test_append_is_visible_before_disk_flush(self) -> None:
        self.store.append("info", "单元测试", "系统", "查询立即可见")
        events = self.store.list_events(limit=10)
        self.assertEqual([item["message"] for item in events], ["查询立即可见"])

    def test_flush_persists_events_in_order(self) -> None:
        for index in range(5):
            self.store.append("info", "单元测试", "系统", f"顺序-{index}")
        self.store.flush()
        self.assertEqual(
            [item["message"] for item in _read_lines(self.path)],
            [f"顺序-{index}" for index in range(5)],
        )
        status = self.store.storage_status()
        self.assertTrue(status["healthy"])
        self.assertEqual(status["pendingEvents"], 0)

    def test_duplicate_events_merge_before_flush(self) -> None:
        for _ in range(2):
            self.store.append("warning", "单元测试", "系统", "同一条重复日志")
        self.store.flush()
        events = self.store.list_events(limit=10)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["repeatCount"], 2)
        self.assertIn("lastTimestamp", events[0])

    def test_close_flushes_and_is_idempotent(self) -> None:
        self.store.append("error", "单元测试", "系统", "停机前最后一条")
        self.store.close()
        self.assertEqual(
            [item["message"] for item in _read_lines(self.path)], ["停机前最后一条"]
        )
        self.store.close()
        self.assertEqual(self.store.storage_status()["pendingEvents"], 0)


if __name__ == "__main__":
    unittest.main()
