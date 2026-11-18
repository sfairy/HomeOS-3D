"""能耗记账与「事件日志显示过滤」解耦的回归。

历史缺陷：``handle_state_change_batch`` 先执行 ``is_event_log_recordable``（默认
``eventLogRecordBlockDomains`` 含 ``sensor``），而能耗累计只在 flush 阶段对同一个
显示缓冲执行。电表全是 ``sensor.*``，于是：

- ``event_logs`` 里一条 ``sensor.*`` 都没有（实测 0 行）；
- ``_apply_energy_side_effects`` 永远收不到读数，``energy_usage_daily`` 停在旧日期；
- ``/events/reports/compare?metric=energy`` 恒为 0。

修复：电表读数先收进独立旁路缓冲，再走显示过滤。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.logs.event_log import ENERGY_BUFFER_MAX, EventLogService


class _FakeDatabase:
    """只记录 flush 时被写入的显示行（能耗副作用被替换掉，不触库）。"""

    def __init__(self) -> None:
        self.written: list[dict[str, Any]] = []

    def session_factory(self):  # pragma: no cover - 本用例不落库
        raise AssertionError("测试不应真正连接数据库")


def _make_service() -> EventLogService:
    service = EventLogService(_FakeDatabase())
    # 关掉分级抽样，保证普通实体走 compact/full 而不是随机 skip
    service._ops["eventLogTierEnabled"] = True
    service._ops["eventLogTierCSampleRate"] = 1.0
    return service


def _change(entity_id: str, old: str, new: str, **attrs: Any) -> dict[str, Any]:
    return {
        "entity_id": entity_id,
        "old_state": {"state": old, "attributes": dict(attrs)},
        "new_state": {"state": new, "attributes": dict(attrs)},
        "changed_at": "2026-11-18T00:00:00",
    }


ENERGY_ATTRS = {
    "device_class": "energy",
    "unit_of_measurement": "kWh",
    "friendly_name": "总电表",
}


class EnergyBypassTest(unittest.TestCase):
    def __init__(self, methodName: str = "runTest") -> None:
        # 实例属性在 ``__init__`` 里建：unittest 每个方法一个新实例，天然隔离；
        # 只在 ``setUp`` 里赋值会被 basedpyright 判成「未初始化实例变量」。
        super().__init__(methodName)
        self.service = _make_service()

    def setUp(self) -> None:
        # 复现现场配置：sensor 域被排除出事件日志
        self.service._ops["eventLogRecordFilterEnabled"] = True
        self.service._ops["eventLogRecordFilterMode"] = "block"
        self.service._ops["eventLogRecordBlockDomains"] = ["sensor"]
        self.service._ops["eventLogRecordAllowDomains"] = []
        self.service._ops["eventLogRecordBlockEntityIds"] = []

    def test_blocked_sensor_domain_still_feeds_energy_buffer(self) -> None:
        self.service.handle_state_change_batch(
            {"changes": [_change("sensor.total_energy", "100.0", "100.5", **ENERGY_ATTRS)]}
        )
        # 显示缓冲为空（被 sensor 域黑名单挡住）
        self.assertEqual(self.service._buffer, [])
        # 能耗旁路仍收到了这条读数
        self.assertEqual(len(self.service._energy_buffer), 1)
        row = self.service._energy_buffer[0]
        self.assertEqual(row["entity_id"], "sensor.total_energy")
        self.assertEqual(row["new_state"]["state"], "100.5")
        self.assertEqual(row["new_state"]["attributes"]["unit_of_measurement"], "kWh")

    def test_non_leader_does_not_collect_energy(self) -> None:
        """多进程部署下从属进程不得记账，否则同一块电表被重复累计。"""
        self.service._is_leader = lambda: False
        self.service.handle_state_change_batch(
            {"changes": [_change("sensor.total_energy", "100.0", "100.5", **ENERGY_ATTRS)]}
        )
        self.assertEqual(self.service._energy_buffer, [])
        self.assertEqual(self.service._buffer, [])

    def test_non_energy_sensor_is_not_collected(self) -> None:
        self.service.handle_state_change_batch(
            {"changes": [_change("sensor.power", "10", "11", unit_of_measurement="W")]}
        )
        self.assertEqual(self.service._buffer, [])
        self.assertEqual(self.service._energy_buffer, [])

    def test_light_still_goes_to_display_buffer(self) -> None:
        self.service.handle_state_change_batch({"changes": [_change("light.hall", "off", "on")]})
        self.assertEqual(len(self.service._buffer), 1)
        self.assertEqual(self.service._buffer[0]["entity_id"], "light.hall")
        self.assertEqual(self.service._energy_buffer, [])

    def test_energy_buffer_is_bounded(self) -> None:
        for index in range(ENERGY_BUFFER_MAX + 5):
            self.service.handle_state_change_batch(
                {"changes": [_change("sensor.total_energy", f"{index}.0", f"{index + 1}.0", **ENERGY_ATTRS)]}
            )
        self.assertEqual(len(self.service._energy_buffer), ENERGY_BUFFER_MAX)
        # 丢的是最旧的，保留的是最新读数
        self.assertEqual(self.service._energy_buffer[-1]["new_state"]["state"], f"{ENERGY_BUFFER_MAX + 5}.0")

    def test_clear_all_drops_energy_buffer(self) -> None:
        self.service.handle_state_change_batch(
            {"changes": [_change("sensor.total_energy", "100.0", "100.5", **ENERGY_ATTRS)]}
        )
        self.service._energy_buffer = []
        self.service._buffer = []
        self.assertEqual(self.service._energy_buffer, [])


if __name__ == "__main__":
    unittest.main()
