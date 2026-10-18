"""安防事件 JSONL 解析：纯函数、限长、排序与旧稳定排序一致。"""

from __future__ import annotations

import json
import unittest

from src.domains.security.service import _parse_events_text


class SecurityEventsParseTest(unittest.TestCase):
    def test_returns_newest_events_first_and_rewrites_local_urls(self) -> None:
        rows = [
            {"date": "2026-01-01", "time": "10:00:00", "img": "/local/a.jpg"},
            {"date": "2026-01-02", "time": "10:00:00", "clip": "/local/b.mp4"},
            {"date": "2026-01-03", "time": "10:00:00", "video": "/local/c.mp4"},
            "not-a-dict",
        ]
        text = "\n".join(
            item if isinstance(item, str) else json.dumps(item) for item in rows
        )

        events = _parse_events_text(text, "http://ha.local", 2)

        self.assertEqual(len(events), 2)
        self.assertEqual(events[0]["video"], "http://ha.local/local/c.mp4")
        self.assertEqual(events[1]["video"], "http://ha.local/local/b.mp4")

    def test_ignores_malformed_lines_and_respects_limit(self) -> None:
        text = "garbage\n{}\n" + json.dumps(
            {"date": "2026-02-01", "time": "01:02:03"}
        )
        events = _parse_events_text(text, "http://ha", 1)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["date"], "2026-02-01")


if __name__ == "__main__":
    unittest.main()
