"""授权心跳间隔解析回归。

``heartbeatIn`` 来自商店的远端 JSON；裸 ``int()`` 遇到 ``None`` / ``"5m"`` 会抛
``TypeError``/``ValueError``，而激活路径的调用方只捕获 ``LicenseClientError`` —— 一次
畸形响应就会在「已写入激活状态」之后给用户一个 500。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.license.service import _heartbeat_seconds


class HeartbeatSecondsTest(unittest.TestCase):
    def test_integer_passthrough(self) -> None:
        self.assertEqual(_heartbeat_seconds(120), 120)

    def test_numeric_string(self) -> None:
        self.assertEqual(_heartbeat_seconds("300"), 300)
        self.assertEqual(_heartbeat_seconds("300.0"), 300)

    def test_invalid_values_fall_back(self) -> None:
        self.assertEqual(_heartbeat_seconds(None), 300)
        self.assertEqual(_heartbeat_seconds("5m"), 300)
        self.assertEqual(_heartbeat_seconds([]), 300)
        self.assertEqual(_heartbeat_seconds(True), 300)

    def test_non_positive_falls_back(self) -> None:
        self.assertEqual(_heartbeat_seconds(0), 300)
        self.assertEqual(_heartbeat_seconds(-10), 300)


if __name__ == "__main__":
    unittest.main()
