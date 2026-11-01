"""安全演习回归：失败点击不能白吃冷却窗口。

顺序反了的后果：用户在一个「还没绑定传感器」的房间里连点两次演习，第二次起
``cooldown`` 先把请求挡回，直到 5 秒窗口过去；配好绑定后立刻重试仍然被挡，
表现成「演习按钮点了没反应」。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any
from unittest import mock

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.security import hazard_drill as drill_module
from src.domains.security.hazard_drill import HazardDrillService


class _BusStub:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def emit(self, name: str, payload: dict[str, Any]) -> None:
        self.events.append((name, payload))


def _layout(smoke: bool) -> dict[str, Any]:
    return {
        "haConfig": {
            "hazardSmokeEntityIds": ["binary_sensor.smoke_1"] if smoke else [],
        }
    }


class DrillCooldownTest(unittest.TestCase):
    def _run(self, smoke: bool) -> tuple[dict[str, Any], HazardDrillService, _BusStub]:
        bus = _BusStub()
        service = HazardDrillService(lambda: None, bus, None)  # type: ignore[arg-type]
        with (
            mock.patch.object(drill_module, "load_active_project_layout", return_value=("default", _layout(smoke))),
            mock.patch.object(drill_module, "schedule_security_event", return_value=None),
        ):
            result = asyncio.run(service.run_drill("smoke"))
        return result, service, bus

    def test_unbound_drill_does_not_consume_cooldown(self) -> None:
        result, service, bus = self._run(smoke=False)
        self.assertFalse(result["success"])
        self.assertIn("未绑定", result["message"])
        self.assertEqual(service._last_run_at, {})
        self.assertEqual(bus.events, [])

    def test_second_bound_drill_within_window_is_cooldown(self) -> None:
        bus = _BusStub()
        service = HazardDrillService(lambda: None, bus, None)  # type: ignore[arg-type]
        with (
            mock.patch.object(drill_module, "load_active_project_layout", return_value=("default", _layout(True))),
            mock.patch.object(drill_module, "schedule_security_event", return_value=None),
        ):
            first = asyncio.run(service.run_drill("smoke"))
            second = asyncio.run(service.run_drill("smoke"))
        self.assertTrue(first["success"])
        self.assertFalse(second["success"])
        self.assertEqual(second.get("reason"), "cooldown")


if __name__ == "__main__":
    unittest.main()
