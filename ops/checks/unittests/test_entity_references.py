"""``document_entity_references`` 分组口径的单测（0.9.0）。

分组必须与 ``document_entity_ids`` **条目集合完全一致**，只改变归属：
漏一条会让只读账户看不到数据显示，多一条会让只读账户拿到控制权限。
"""

from __future__ import annotations

import unittest

from homeos.backend.src.platform.core.entity.entity_refs import (
    document_entity_ids,
    document_entity_references,
)


def _car_doc():
    return {
        "components": [
            {
                "type": "interaction3d",
                "properties": {
                    "devices": {
                        "cars": [
                            {
                                "id": "car-1",
                                "entityId": "switch.car_power",
                                "presenceEntityId": "person.owner",
                                "openings": {"hood": {"openingEntityId": "binary_sensor.hood"}},
                                "tirePressure": {"enabled": True, "wheels": {"fl": "sensor.tire_fl"}},
                            }
                        ]
                    }
                },
            }
        ]
    }


class DocumentEntityReferencesTests(unittest.TestCase):
    def test_car_bindings_split_by_purpose(self) -> None:
        read_only, for_control = document_entity_references(_car_doc())
        self.assertEqual(read_only, {"person.owner", "binary_sensor.hood", "sensor.tire_fl"})
        self.assertEqual(for_control, {"switch.car_power"})

    def test_entry_set_matches_legacy_function(self) -> None:
        document = _car_doc()
        read_only, for_control = document_entity_references(document)
        self.assertEqual(read_only | for_control, document_entity_ids(document))

    def test_control_wins_on_overlap(self) -> None:
        # 同一实体既做显示又做控制 → 归控制，避免授权歧义。
        document = {
            "components": [
                {
                    "type": "interaction3d",
                    "properties": {
                        "devices": {"cars": [{"presenceEntityId": "switch.both", "entityId": "switch.both"}]}
                    },
                }
            ]
        }
        read_only, for_control = document_entity_references(document)
        self.assertIn("switch.both", for_control)
        self.assertNotIn("switch.both", read_only)

    def test_tire_pressure_disabled_is_ignored(self) -> None:
        document = {
            "components": [
                {
                    "type": "interaction3d",
                    "properties": {
                        "devices": {"cars": [{"tirePressure": {"enabled": False, "wheels": {"fl": "sensor.tire_fl"}}}]}
                    },
                }
            ]
        }
        read_only, for_control = document_entity_references(document)
        self.assertNotIn("sensor.tire_fl", read_only | for_control)

    def test_virtual_entities_are_excluded(self) -> None:
        document = {"components": [{"entityId": "virtual.demo", "primaryEntityId": "switch.real"}]}
        read_only, for_control = document_entity_references(document)
        self.assertNotIn("virtual.demo", read_only | for_control)
        self.assertIn("switch.real", for_control)

    def test_weather_defaults_to_sun(self) -> None:
        read_only, _for_control = document_entity_references({"components": [{"type": "weather"}]})
        self.assertIn("sun.sun", read_only)

    def test_nested_entity_ids_list(self) -> None:
        document = {"extraSources": {"entityIds": ["sensor.a", "binary_sensor.b"]}}
        read_only, for_control = document_entity_references(document)
        # 键名是复数 entityIds 且不在只读表里 → 归控制。
        self.assertEqual(for_control, {"sensor.a", "binary_sensor.b"})
        self.assertEqual(read_only, set())

    def test_empty_document(self) -> None:
        self.assertEqual(document_entity_references({}), (set(), set()))


if __name__ == "__main__":
    unittest.main()
