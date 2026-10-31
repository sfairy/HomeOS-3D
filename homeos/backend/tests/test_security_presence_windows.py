"""安防侧两个「静默不生效」的回归：离家模拟时段窗口、重启后的离家确认。

两处都不报错、不打日志，只是「功能看起来配好了但永远不工作」，所以用单测钉住：

- ``awaySimulation.activeStartHour == activeEndHour``：旧比较是 ``s <= h < s``，恒为
  False —— 用户设 20:00–20:00 等于一次都不会模拟，而离家模拟存在的意义恰恰是
  让空房子看起来有人。
- ``presence`` 的离家确认只在观察到 home→away **跃迁**时记录。进程重启后第一份聚合值
  的 ``was_home`` 是 ``None``，跃迁分支直接返回；若持久化 KV 里的确认也丢了（全新安装 /
  恢复出厂 / KV 被清），``periodic_check`` 永远算不出 ``latest_away``，
  ``presence.everyoneLeft``（自动布防挂在它上面）再也不会触发。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.security.away_simulation import AwaySimulationService
from src.domains.security.presence import PresenceService


class _HourStub:
    """只提供 ``_is_active_hour`` 需要的最小面。"""

    def __init__(self, start: int, end: int, hour: int) -> None:
        self._active_start_hour = start
        self._active_end_hour = end
        self._hour = hour

    def _local_parts(self) -> dict[str, int]:
        return {"hour": self._hour}


def _active(start: int, end: int, hour: int) -> bool:
    return AwaySimulationService._is_active_hour(_HourStub(start, end, hour))


class AwaySimulationWindowTest(unittest.TestCase):
    def test_equal_start_and_end_means_all_day(self) -> None:
        for hour in (0, 6, 12, 20, 23):
            self.assertTrue(_active(20, 20, hour), f"hour={hour} 应视为全天窗口")
            self.assertTrue(_active(0, 0, hour), f"hour={hour} 应视为全天窗口")

    def test_normal_window(self) -> None:
        self.assertFalse(_active(18, 23, 17))
        self.assertTrue(_active(18, 23, 18))
        self.assertTrue(_active(18, 23, 22))
        self.assertFalse(_active(18, 23, 23))

    def test_cross_midnight_window(self) -> None:
        self.assertTrue(_active(20, 6, 23))
        self.assertTrue(_active(20, 6, 0))
        self.assertTrue(_active(20, 6, 5))
        self.assertFalse(_active(20, 6, 6))
        self.assertFalse(_active(20, 6, 12))


class PresenceAwayStartTest(unittest.TestCase):
    """``_track_away_start`` 不依赖事件跃迁，必须能直接记下离家起点。"""

    def _service(self) -> PresenceService:
        service = PresenceService.__new__(PresenceService)
        service._away_confirmations = {}
        return service

    def test_away_is_recorded_without_transition(self) -> None:
        service = self._service()
        service._track_away_start("person:1", at_home=False)
        self.assertIn("person:1", service._away_confirmations)

    def test_existing_start_is_not_refreshed(self) -> None:
        service = self._service()
        service._track_away_start("person:1", at_home=False)
        first = service._away_confirmations["person:1"]
        service._track_away_start("person:1", at_home=False)
        self.assertEqual(service._away_confirmations["person:1"], first)

    def test_home_clears_start(self) -> None:
        service = self._service()
        service._track_away_start("person:1", at_home=False)
        service._track_away_start("person:1", at_home=True)
        self.assertNotIn("person:1", service._away_confirmations)


if __name__ == "__main__":
    unittest.main()
