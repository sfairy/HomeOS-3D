"""开门器（``door-opener``）绑定校验的单测。

这些判定的目的都是「在落库前把配错的门机拒掉」，而不是事后在 3D 里看到门不听使唤：

- 实体必须是 ``switch.*`` 或 ``cover.*``（``binary_sensor`` 是门磁，不是控制实体）；
- 点动型不允许带 ``switchOpenState``（复位语义下「开门对应状态」不成立）；
- 同一扇门只能有一个开门器（两个会同时发指令）；
- ``frame-only`` 纯门框与「墙已删除」的门都不算可绑定目标。
"""

from __future__ import annotations

import unittest

from fastapi import HTTPException

from homeos.backend.src.modules.interaction3d.door_opener import (
    DOOR_OPENER_BINDING_FIELDS,
    MAX_DOOR_OPENERS,
    door_opener_targets,
    require_door_opener_model,
    validate_door_opener_bindings,
)


def _binding(**overrides):
    binding = {
        "id": "door-opener-1",
        "floorId": "floor-1",
        "modelId": "door:door-1",
        "entityId": "switch.garage_motor",
    }
    binding.update(overrides)
    return binding


def _scene(**scene_overrides):
    scene = {
        "walls": [{"id": "wall-1"}],
        "doors": [
            {"id": "door-1", "wallId": "wall-1", "doorType": "entry"},
            {"id": "frame-1", "wallId": "wall-1", "doorType": "frame-only"},
            {"id": "orphan-1", "wallId": "missing-wall", "doorType": "entry"},
        ],
    }
    scene.update(scene_overrides)
    return scene


class DoorOpenerTargetTests(unittest.TestCase):
    def test_only_movable_doors_with_existing_wall(self) -> None:
        self.assertEqual(door_opener_targets(_scene()), {"door:door-1"})

    def test_non_dict_scene(self) -> None:
        self.assertEqual(door_opener_targets(None), set())


class RequireDoorOpenerModelTests(unittest.TestCase):
    def _document(self):
        return {"floors": [{"id": "floor-1", "scene": _scene()}]}

    def test_existing_door_passes(self) -> None:
        require_door_opener_model(_binding(), self._document())

    def test_frame_only_door_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as caught:
            require_door_opener_model(_binding(modelId="door:frame-1"), self._document())
        self.assertEqual(caught.exception.status_code, 409)

    def test_removed_wall_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            require_door_opener_model(_binding(modelId="door:orphan-1"), self._document())

    def test_unknown_floor_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            require_door_opener_model(_binding(floorId="floor-9"), self._document())


class ValidateDoorOpenerBindingsTests(unittest.TestCase):
    def test_minimal_binding_passes(self) -> None:
        validate_door_opener_bindings([_binding()])

    def test_empty_list_passes(self) -> None:
        validate_door_opener_bindings([])

    def test_default_switch_mode_is_maintained(self) -> None:
        validate_door_opener_bindings([_binding(switchMode="maintained")])

    def test_unknown_field_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings([_binding(notAField=1)])

    def test_cover_entity_accepted(self) -> None:
        # 上游文案「绑定 cover 或 switch 实体」：cover 是合法的门机形态。
        validate_door_opener_bindings([_binding(entityId="cover.garage")])

    def test_cover_rejects_momentary(self) -> None:
        # cover 按行程开合，没有脉冲复位语义。
        with self.assertRaises(HTTPException) as caught:
            validate_door_opener_bindings([_binding(entityId="cover.garage", switchMode="momentary")])
        self.assertIn("cover", str(caught.exception.detail))

    def test_light_entity_rejected(self) -> None:
        with self.assertRaises(HTTPException) as caught:
            validate_door_opener_bindings([_binding(entityId="light.not_a_door_motor")])
        self.assertIn("switch 或 cover", str(caught.exception.detail))

    def test_missing_entity_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings([_binding(entityId="")])

    def test_momentary_with_open_state_rejected(self) -> None:
        with self.assertRaises(HTTPException) as caught:
            validate_door_opener_bindings([_binding(switchMode="momentary", switchOpenState="on")])
        self.assertIn("点动", str(caught.exception.detail))

    def test_momentary_without_open_state_passes(self) -> None:
        validate_door_opener_bindings([_binding(switchMode="momentary")])

    def test_invalid_switch_mode_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings([_binding(switchMode="toggle")])

    def test_invalid_switch_open_state_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings([_binding(switchOpenState="open")])

    def test_open_percent_out_of_range_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings([_binding(openPercent=101)])
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings([_binding(openPercent=-1)])

    def test_bool_is_not_a_number(self) -> None:
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings([_binding(openPercent=True)])

    def test_estimate_motion_must_be_bool(self) -> None:
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings([_binding(estimateMotion="false")])
        validate_door_opener_bindings([_binding(estimateMotion=False)])

    def test_all_not_a_valid_floor(self) -> None:
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings([_binding(floorId="all")])

    def test_duplicate_door_rejected(self) -> None:
        with self.assertRaises(HTTPException) as caught:
            validate_door_opener_bindings([_binding(), _binding(id="door-opener-2")])
        self.assertIn("同一扇门", str(caught.exception.detail))

    def test_duplicate_id_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings([_binding(), _binding(modelId="door:door-2")])

    def test_bad_model_id_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings([_binding(modelId="wall:wall-1")])

    def test_bare_door_id_accepted(self) -> None:
        # 与 lock.py 的写入路径一致：裸 id 由上层补前缀。
        validate_door_opener_bindings([_binding(modelId="door-1")])

    def test_too_many_bindings_rejected(self) -> None:
        many = [
            _binding(id=f"door-opener-{index}", modelId=f"door:door-{index}") for index in range(MAX_DOOR_OPENERS + 1)
        ]
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings(many)

    def test_not_a_list_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            validate_door_opener_bindings({"id": "x"})

    def test_fields_constant_covers_switch_contract(self) -> None:
        for key in ("switchMode", "switchOpenState", "entityId"):
            self.assertIn(key, DOOR_OPENER_BINDING_FIELDS)


if __name__ == "__main__":
    unittest.main()
