"""地面分区 / 柔光范围的后端校验与兼容保留（0.8.9）。

最重要的一条断言是 :func:`retain_omitted_floor_finishes` 的**省略 vs 清空**语义：

- 旧写入方（旧前端、脚本、备份还原）不认识 ``floorRegions``，导出时会**省略**它；
  省略意味着「我不知道这件事」，必须保留上一版的值。
- 用户在绘制页里真的删光所有分区时，前端会显式发 ``[]``；那才是清空。

把这两者混为一谈的后果是：任何一次「用旧客户端打开并保存」都会静默抹掉用户画好的
地面分区 —— 与 ``windowDesign`` / ``remark`` 那两次事故同一类。
"""

from __future__ import annotations

import unittest

from _support import ensure_repo_on_path

ensure_repo_on_path()

from homeos.backend.src.domains.studio3d.floor_regions import (
    FLOOR_TONE_LIMIT,
    retain_omitted_floor_finishes,
    validate_floor_regions,
)
from homeos.backend.src.domains.studio3d.lighting import (
    STUDIO_RANGE_SCENE_ID,
    valid_light_range_archive,
    valid_light_region_descriptor,
    valid_light_region_overrides,
)
from homeos.backend.src.platform.core.http.errors import BusinessException


def ring(*points: tuple[float, float]) -> list[dict[str, float]]:
    return [{"x": x, "y": y} for x, y in points]


TRIANGLE = ring((0, 0), (4, 0), (4, 3))


def region(ident: str = "region-1", finish: str = "wood") -> dict:
    return {"id": ident, "finish": finish, "outline": TRIANGLE, "holes": []}


class FloorRegionValidationTests(unittest.TestCase):
    def test_accepts_well_formed_document(self) -> None:
        validate_floor_regions(
            {
                "floors": [
                    {"id": "a", "name": "1层", "floorRegions": [region()], "floorFinishTones": {"wood": 2, "tile": -1}}
                ]
            }
        )

    def test_accepts_document_without_new_fields(self) -> None:
        validate_floor_regions({"floors": [{"id": "a", "scene": {}}]})

    def test_rejects_degenerate_outline(self) -> None:
        bad = {
            "floors": [{"id": "a", "floorRegions": [{"id": "r", "finish": "wood", "outline": ring((0, 0), (1, 1))}]}]
        }
        with self.assertRaises(BusinessException) as caught:
            validate_floor_regions(bad)
        self.assertEqual(caught.exception.status_code, 422)

    def test_rejects_duplicate_ids(self) -> None:
        bad = {"floors": [{"id": "a", "floorRegions": [region("dup"), region("dup")]}]}
        with self.assertRaises(BusinessException):
            validate_floor_regions(bad)

    def test_rejects_unknown_finish(self) -> None:
        bad = {"floors": [{"id": "a", "floorRegions": [region(finish="marble")]}]}
        with self.assertRaises(BusinessException):
            validate_floor_regions(bad)

    def test_rejects_out_of_range_tone(self) -> None:
        bad = {"floors": [{"id": "a", "floorFinishTones": {"wood": FLOOR_TONE_LIMIT + 1}}]}
        with self.assertRaises(BusinessException):
            validate_floor_regions(bad)

    def test_rejects_duplicate_consecutive_points(self) -> None:
        bad_ring = ring((0, 0), (0, 0), (4, 0), (4, 3))
        bad = {"floors": [{"id": "a", "floorRegions": [{"id": "r", "finish": "wood", "outline": bad_ring}]}]}
        with self.assertRaises(BusinessException):
            validate_floor_regions(bad)


class RetainOmittedTests(unittest.TestCase):
    PREVIOUS = {
        "floors": [
            {
                "id": "floor-a",
                "floorRegions": [region()],
                "floorFinishTones": {"wood": 2, "tile": 0},
            }
        ]
    }

    def test_omitted_fields_are_retained(self) -> None:
        incoming = {"floors": [{"id": "floor-a", "scene": {}}]}
        merged = retain_omitted_floor_finishes(self.PREVIOUS, incoming)
        self.assertEqual(len(merged["floors"][0]["floorRegions"]), 1)
        self.assertEqual(merged["floors"][0]["floorFinishTones"], {"wood": 2, "tile": 0})

    def test_explicit_empty_list_clears(self) -> None:
        incoming = {"floors": [{"id": "floor-a", "floorRegions": [], "floorFinishTones": {}}]}
        merged = retain_omitted_floor_finishes(self.PREVIOUS, incoming)
        self.assertEqual(merged["floors"][0]["floorRegions"], [])
        self.assertEqual(merged["floors"][0]["floorFinishTones"], {})

    def test_new_floor_is_not_populated(self) -> None:
        incoming = {"floors": [{"id": "floor-b"}]}
        merged = retain_omitted_floor_finishes(self.PREVIOUS, incoming)
        self.assertNotIn("floorRegions", merged["floors"][0])

    def test_previous_without_fields_is_noop(self) -> None:
        previous = {"floors": [{"id": "floor-a"}]}
        incoming = {"floors": [{"id": "floor-a"}]}
        self.assertIs(retain_omitted_floor_finishes(previous, incoming), incoming)

    def test_does_not_mutate_inputs(self) -> None:
        incoming = {"floors": [{"id": "floor-a"}]}
        retain_omitted_floor_finishes(self.PREVIOUS, incoming)
        self.assertNotIn("floorRegions", incoming["floors"][0])

    def test_single_floor_document_is_untouched(self) -> None:
        incoming = {"scene": {}, "walls": []}
        self.assertIs(retain_omitted_floor_finishes(self.PREVIOUS, incoming), incoming)


class LightRangeValidationTests(unittest.TestCase):
    def test_accepts_descriptor(self) -> None:
        self.assertTrue(valid_light_region_descriptor({"shape": "circle", "width": 3, "heightMin": 0.5}))

    def test_rejects_empty_descriptor(self) -> None:
        self.assertFalse(valid_light_region_descriptor({}))

    def test_rejects_unknown_shape(self) -> None:
        self.assertFalse(valid_light_region_descriptor({"shape": "hexagon"}))

    def test_rejects_out_of_range_softness(self) -> None:
        self.assertFalse(valid_light_region_descriptor({"softness": 500}))

    def test_overrides_accepts_nested_store(self) -> None:
        store = {STUDIO_RANGE_SCENE_ID: {"floor:item": {"width": 2}}}
        self.assertTrue(valid_light_region_overrides(store))

    def test_overrides_can_forbid_reserved_scene(self) -> None:
        store = {STUDIO_RANGE_SCENE_ID: {"floor:item": {"width": 2}}}
        self.assertFalse(valid_light_region_overrides(store, allow_default=False))

    def test_archive_accepts_null_previous(self) -> None:
        archive = {"scene": [{"floorId": "f", "itemId": "i", "previous": None, "at": 1}]}
        self.assertTrue(valid_light_range_archive(archive))

    def test_archive_rejects_entry_without_item(self) -> None:
        archive = {"scene": [{"floorId": "f", "at": 1}]}
        self.assertFalse(valid_light_range_archive(archive))

    def test_archive_rejects_invalid_previous(self) -> None:
        archive = {"scene": [{"floorId": "f", "itemId": "i", "previous": {"width": 999}, "at": 1}]}
        self.assertFalse(valid_light_range_archive(archive))


class UnderfloorHeatingToggleTests(unittest.TestCase):
    """0.8.9 楼层级「显示地暖盘管」开关。

    它必须是布尔：前端用 `=== true` 判定，写入字符串 `"yes"` 会静默变成「关闭」，
    用户看到的是「勾上了但盘管不出现」。
    """

    def _scene(self, **floor_fields: object) -> dict:
        return {"floors": [{"name": "1层", **floor_fields}]}

    def test_accepts_true_and_false(self) -> None:
        validate_floor_regions(self._scene(underfloorHeating=True))
        validate_floor_regions(self._scene(underfloorHeating=False))

    def test_accepts_absent_field(self) -> None:
        validate_floor_regions(self._scene())

    def test_rejects_string(self) -> None:
        with self.assertRaises(BusinessException):
            validate_floor_regions(self._scene(underfloorHeating="yes"))

    def test_rejects_number(self) -> None:
        with self.assertRaises(BusinessException):
            validate_floor_regions(self._scene(underfloorHeating=1))


if __name__ == "__main__":
    unittest.main()
