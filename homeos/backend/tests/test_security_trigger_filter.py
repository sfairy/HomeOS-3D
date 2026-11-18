"""安防触发候选过滤回归。

区域里的 ``sensors`` 是用户勾选（或房间自动归组）的实体列表。历史版本会把
「燃气热水器 水流状态」「冰箱门」这类**设备自身运行状态**收进来：

- ``binary_sensor.xxx_flowstatus`` 名字含「燃气」→ 判成燃气泄漏探测；
- ``binary_sensor.xxx_refrigeratordoorstatus`` 名字含 ``door`` → 判成门窗磁。

两者在 ``armed_home`` 下都会触发安防告警（实测 11-17 当天 3 次水流误报），
而前端修好分类后，**已保存的区域配置**仍会误报 —— 所以运行时必须再挡一层。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.security.panel_helpers import is_security_trigger_candidate


class SecurityTriggerCandidateTest(unittest.TestCase):
    def test_flow_status_of_gas_water_heater_is_rejected(self) -> None:
        self.assertFalse(
            is_security_trigger_candidate(
                "binary_sensor.60b02bb5b289_flowstatus",
                {"friendly_name": "燃气热水器 水流状态"},
            )
        )

    def test_refrigerator_door_is_rejected(self) -> None:
        for entity_id in (
            "binary_sensor.5c241fd4c92e_refrigeratordoorstatus",
            "binary_sensor.5c241fd4c92e_freezer2doorstatus",
        ):
            self.assertFalse(is_security_trigger_candidate(entity_id, {"friendly_name": "冰箱门"}))

    def test_appliance_without_device_class_is_rejected_by_name(self) -> None:
        self.assertFalse(is_security_trigger_candidate("binary_sensor.water_flow_1", {"friendly_name": "水温异常"}))

    def test_running_device_class_is_rejected(self) -> None:
        self.assertFalse(is_security_trigger_candidate("binary_sensor.boiler_running", {"device_class": "running"}))

    def test_connectivity_is_rejected(self) -> None:
        self.assertFalse(is_security_trigger_candidate("binary_sensor.esp_online", {"device_class": "connectivity"}))

    def test_real_door_sensor_is_accepted(self) -> None:
        self.assertTrue(
            is_security_trigger_candidate(
                "binary_sensor.da_men_contact",
                {"friendly_name": "大门门磁", "device_class": "door"},
            )
        )

    def test_gas_detector_is_accepted(self) -> None:
        self.assertTrue(
            is_security_trigger_candidate(
                "binary_sensor.chu_fang_gas",
                {"friendly_name": "厨房燃气探测器", "device_class": "gas"},
            )
        )

    def test_motion_without_device_class_is_accepted(self) -> None:
        self.assertTrue(is_security_trigger_candidate("binary_sensor.ke_ting_motion", {"friendly_name": "客厅人体"}))

    def test_unknown_device_class_is_accepted(self) -> None:
        # 未知 device_class 不能一律拒绝：白名单会静默废掉正常门磁/玻璃破碎等老实体
        self.assertTrue(
            is_security_trigger_candidate(
                "binary_sensor.window_vibration",
                {"friendly_name": "窗户震动", "device_class": "vibration"},
            )
        )


if __name__ == "__main__":
    unittest.main()
