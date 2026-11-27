"""车辆在家/离家与四门两舱绑定的后端校验单测（0.9.0）。

这三条字段是本轮新增的**唯一数据面**：不进白名单 → 前端一保存就 422；
校验口径与前端不一致 → 「前端能填、保存被拒」。两侧必须逐条对齐：

- 两个状态组齐全、各 ≤16 个、单个 ≤255 字符、禁换行、trim 后不重复；
- 只给状态组不给实体 → 拒绝（无法匹配）；
- 车辆实体域受限（person / device_tracker / binary_sensor / input_select …）；
- 开合件只认六个部件名，每件只允许 `openingEntityId` / `states` / `label`。
"""

from __future__ import annotations

import unittest

from fastapi import HTTPException

from homeos.backend.src.modules.interaction3d.config_ctx import ValidationContext
from homeos.backend.src.modules.interaction3d.device import validate_device_bindings


def _car(**overrides):
    car = {
        "id": "car-1",
        "floorId": "floor-1",
        "modelId": "car-model-1",
        "deviceId": "device-1",
    }
    car.update(overrides)
    return car


def _validate(cars):
    validate_device_bindings(ValidationContext(), cars, "smallcar")


class CarPresenceTests(unittest.TestCase):
    def test_presence_is_accepted(self) -> None:
        _validate(
            [
                _car(
                    presenceEntityId="person.owner",
                    presenceStates={"home": ["在家"], "away": ["离家"]},
                )
            ]
        )

    def test_states_without_entity_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            _validate([_car(presenceStates={"home": ["在家"], "away": ["离家"]})])

    def test_entity_without_states_is_automatic(self) -> None:
        # 只给实体 = 自动识别，合法。
        _validate([_car(presenceEntityId="device_tracker.car")])

    def test_entity_domain_is_restricted(self) -> None:
        with self.assertRaises(HTTPException):
            _validate([_car(presenceEntityId="light.not_a_presence_source")])

    def test_missing_group_key_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            _validate([_car(presenceEntityId="person.owner", presenceStates={"home": ["在家"]})])

    def test_extra_group_key_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            _validate(
                [
                    _car(
                        presenceEntityId="person.owner",
                        presenceStates={"home": ["在家"], "away": ["离家"], "other": []},
                    )
                ]
            )

    def test_too_many_states_per_group_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            _validate(
                [
                    _car(
                        presenceEntityId="person.owner",
                        presenceStates={"home": [f"h{index}" for index in range(17)], "away": ["离家"]},
                    )
                ]
            )

    def test_state_too_long_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            _validate(
                [
                    _car(
                        presenceEntityId="person.owner",
                        presenceStates={"home": ["x" * 256], "away": ["离家"]},
                    )
                ]
            )

    def test_newline_in_state_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            _validate([_car(presenceEntityId="person.owner", presenceStates={"home": ["在\n家"], "away": ["离家"]})])

    def test_duplicate_after_trim_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            _validate(
                [
                    _car(
                        presenceEntityId="person.owner",
                        presenceStates={"home": ["在家", " 在家 "], "away": ["离家"]},
                    )
                ]
            )


class CarOpeningTests(unittest.TestCase):
    def test_openings_are_accepted(self) -> None:
        _validate(
            [
                _car(
                    openings={
                        "leftFront": {
                            "openingEntityId": "binary_sensor.lf",
                            "states": {"open": ["on"], "closed": ["off"]},
                        },
                        "tail": {"openingEntityId": "binary_sensor.tail"},
                    }
                )
            ]
        )

    def test_unknown_part_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            _validate([_car(openings={"roof": {"openingEntityId": "binary_sensor.roof"}})])

    def test_unknown_field_in_part_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            _validate([_car(openings={"hood": {"openingEntityId": "binary_sensor.h", "extra": 1}})])

    def test_openings_must_be_a_dict(self) -> None:
        with self.assertRaises(HTTPException):
            _validate([_car(openings=["leftFront"])])

    def test_part_states_without_entity_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            _validate([_car(openings={"hood": {"states": {"open": ["on"], "closed": ["off"]}}})])

    def test_part_state_group_uses_open_closed(self) -> None:
        # 开合件用 open/closed，不是 home/away。
        with self.assertRaises(HTTPException):
            _validate(
                [
                    _car(
                        openings={
                            "hood": {
                                "openingEntityId": "binary_sensor.h",
                                "states": {"home": ["on"], "away": ["off"]},
                            }
                        }
                    )
                ]
            )


class CarFieldWhitelistTests(unittest.TestCase):
    def test_new_fields_are_in_the_whitelist(self) -> None:
        # 回归：这三个字段漏进白名单会让整车配置 422，而前端是能填的。
        _validate(
            [
                _car(
                    presenceEntityId="person.owner",
                    presenceStates={"home": ["在家"], "away": ["离家"]},
                    openings={"hood": {"openingEntityId": "binary_sensor.h"}},
                )
            ]
        )

    def test_unknown_field_still_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            _validate([_car(notARealField=1)])


if __name__ == "__main__":
    unittest.main()
