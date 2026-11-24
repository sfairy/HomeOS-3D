"""燃气 / 水务累计表底必须被认成「可差分能耗表」的回归测试。

## 为什么这条测试值得存在

``is_cumulative_energy_meter`` 原本只认 ``device_class=energy`` 或 ``kWh/Wh/MWh``，
于是燃气与水的累计表底（``m³``）永远判不出来。表现是：

- 日/月聚合表里**从未写过**非电的行（实测 ``energy_usage_daily`` 只有 kWh）；
- 界面上「电力卡有历史曲线、燃气卡与水务卡永远是空的」，而集成明明提供了
  ``current_reading`` 这类单调递增的抄表数。

两类读数语义完全相同（单调递增、差分即用量），没有理由只支持电。
同一条断言也钉住「流量不能被当成累计量」（``m³/h`` 差分毫无意义）。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from homeos.backend.src.platform.core.energy.roles import is_cumulative_energy_meter


def meter(**attrs: object) -> dict[str, object]:
    return dict(attrs)


class CumulativeEnergyMeterTest(unittest.TestCase):
    def test_electricity_still_recognized(self) -> None:
        """原有行为不能退化。"""
        self.assertTrue(is_cumulative_energy_meter(meter(device_class="energy", unit_of_measurement="kWh")))
        self.assertTrue(is_cumulative_energy_meter(meter(unit_of_measurement="Wh")))
        self.assertTrue(is_cumulative_energy_meter(meter(unit_of_measurement="MWh")))

    def test_gas_counter_recognized(self) -> None:
        """燃气累计表底（m³）—— 这是本次修复的核心。"""
        self.assertTrue(is_cumulative_energy_meter(meter(device_class="gas", unit_of_measurement="m³")))
        # 有的集成不给 device_class，只给单位
        self.assertTrue(is_cumulative_energy_meter(meter(unit_of_measurement="m³")))

    def test_water_counter_recognized(self) -> None:
        self.assertTrue(is_cumulative_energy_meter(meter(device_class="water", unit_of_measurement="m³")))
        self.assertTrue(is_cumulative_energy_meter(meter(unit_of_measurement="L")))

    def test_gas_flow_rate_rejected(self) -> None:
        """流量是瞬时量：差分它只会得到无意义的小数。"""
        self.assertFalse(is_cumulative_energy_meter(meter(device_class="gas", unit_of_measurement="m³/h")))
        self.assertFalse(is_cumulative_energy_meter(meter(unit_of_measurement="m³/h")))
        self.assertFalse(is_cumulative_energy_meter(meter(unit_of_measurement="L/min")))
        self.assertFalse(is_cumulative_energy_meter(meter(device_class="volume_flow_rate", unit_of_measurement="m³/h")))

    def test_power_and_voltage_still_rejected(self) -> None:
        self.assertFalse(is_cumulative_energy_meter(meter(device_class="power", unit_of_measurement="W")))
        self.assertFalse(is_cumulative_energy_meter(meter(unit_of_measurement="kW")))
        self.assertFalse(is_cumulative_energy_meter(meter(unit_of_measurement="V")))
        self.assertFalse(is_cumulative_energy_meter(meter(unit_of_measurement="A")))

    def test_non_quantity_rejected(self) -> None:
        """余额 / 单价 / 金额不是用量。"""
        self.assertFalse(is_cumulative_energy_meter(meter(device_class="monetary", unit_of_measurement="CNY")))
        self.assertFalse(is_cumulative_energy_meter(meter(unit_of_measurement="%")))
        self.assertFalse(is_cumulative_energy_meter(meter()))
        self.assertFalse(is_cumulative_energy_meter(None))


if __name__ == "__main__":
    unittest.main()
