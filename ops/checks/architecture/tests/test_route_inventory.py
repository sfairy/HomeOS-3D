"""后端路由清单与基线的一致性测试。"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ARCH_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ARCH_DIR))

import route_inventory


class RouteInventoryTest(unittest.TestCase):
    def test_registered_routes_match_baseline(self) -> None:
        baseline = json.loads(
            (ARCH_DIR / "routes-baseline.json").read_text(encoding="utf-8")
        )["operations"]
        actual = route_inventory.collect_operations()
        self.assertEqual([], sorted(set(baseline) - set(actual)), "路由缺失")
        self.assertEqual([], sorted(set(actual) - set(baseline)), "新增路由")
        self.assertGreaterEqual(len(actual), 280)


if __name__ == "__main__":
    unittest.main()
