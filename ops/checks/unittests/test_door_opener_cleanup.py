"""开门器随门级联清理的单测（0.9.0 `studio_cleanup.py`）。

## 为什么这条必须测

`plan_cleanup` 用 `identities()` 求「被删目标」，再用 `binding_key()` 把每个交互项
映射到同一身份空间后求交。两处必须**同时**登记 `environment.doorOpeners`：

- 只加进 `COLLECTIONS` 不加身份映射 → 每次保存都被判成孤儿而**全部删掉**；
- 只加身份映射不加进 `COLLECTIONS` → 根本没有被扫描，删门后**留一个死条目**。

两者都只在用户改户型时才会暴露，所以钉在测试里。
"""

from __future__ import annotations

import unittest

from homeos.backend.src.domains.studio3d.cleanup import (
    COLLECTIONS,
    DOOR_COLLECTIONS,
    binding_key,
    identities,
    remove_bindings,
)


def _scene(door_ids):
    return {
        "floors": [
            {
                "id": "floor-1",
                "scene": {
                    "items": [],
                    "lightGroups": [],
                    "doors": [{"id": door_id} for door_id in door_ids],
                    "walls": [{"id": "wall-1"}],
                    "windows": [],
                },
            }
        ]
    }


def _document(door_openers):
    return {
        "components": [
            {
                "id": "widget-1",
                "type": "interaction3d",
                "properties": {"environment": {"doorOpeners": door_openers}},
            }
        ]
    }


def _remaining(updated, project_id="project-1"):
    """取更新后文档里剩余的开门器 id。

    ``plan_cleanup`` 只返回**真的变了**的项目；未变化时用空 dict 表示，
    此时调用方拿到的是「原样保留」。
    """
    if project_id not in updated:
        return None
    return [item["id"] for item in updated[project_id]["components"][0]["properties"]["environment"]["doorOpeners"]]


def _door_opener(door_id):
    return {
        "id": "door-opener-" + door_id,
        "floorId": "floor-1",
        "modelId": "door:" + door_id,
        "entityId": "switch.motor",
    }


class DoorOpenerRegistrationTests(unittest.TestCase):
    def test_collection_is_registered(self) -> None:
        self.assertIn(("environment", "doorOpeners"), COLLECTIONS)
        self.assertIn(("environment", "doorOpeners"), DOOR_COLLECTIONS)

    def test_binding_key_uses_door_identity_space(self) -> None:
        # 与 identities() 的 `(floorId, 'door', 'door:{id}')` 同构。
        key = binding_key(_door_opener("door-1"), ("environment", "doorOpeners"))
        self.assertEqual(key, ("floor-1", "door", "door:door-1"))

    def test_bare_door_id_is_normalized(self) -> None:
        # 校验层允许裸门 id；若这里不补前缀，身份永远对不上、每次保存都被删。
        bare = {**_door_opener("door-1"), "modelId": "door-1"}
        self.assertEqual(binding_key(bare, ("environment", "doorOpeners")), ("floor-1", "door", "door:door-1"))

    def test_identity_matches_scene_door(self) -> None:
        self.assertIn(
            binding_key(_door_opener("door-1"), ("environment", "doorOpeners")),
            identities(_scene(["door-1"])),
        )


class DoorOpenerCascadeTests(unittest.TestCase):
    """级联清理走 `remove_bindings`。

    `plan_cleanup` 还需要磁盘上的场景快照（缺快照会整段跳过），
    而真正执行「按身份摘除」的是 `remove_bindings` —— 测它更直接。
    """

    def _remove(self, door_openers, surviving_doors):
        properties = {"environment": {"doorOpeners": door_openers}}
        remaining_keys = {("floor-1", "door", "door:" + door_id) for door_id in surviving_doors}

        def missing(item, parts):
            return binding_key(item, parts) not in remaining_keys

        removed = remove_bindings(properties, missing)
        return properties, removed

    def test_survives_when_door_still_exists(self) -> None:
        properties, removed = self._remove([_door_opener("door-1")], ["door-1"])
        self.assertEqual([item["id"] for item in properties["environment"]["doorOpeners"]], ["door-opener-door-1"])
        self.assertEqual(removed, [])

    def test_removed_with_the_door(self) -> None:
        properties, removed = self._remove([_door_opener("door-1"), _door_opener("door-2")], ["door-1"])
        self.assertEqual(
            [item["id"] for item in properties["environment"]["doorOpeners"]],
            ["door-opener-door-1"],
        )
        # 摘掉的条目带身份返回，调用方可据此进归档 / 出影响清单。
        self.assertEqual(len(removed), 1)
        self.assertEqual(removed[0][2], ("floor-1", "door", "door:door-2"))

    def test_removed_with_whole_floor(self) -> None:
        properties = {"environment": {"doorOpeners": [_door_opener("door-1")]}}
        removed = remove_bindings(
            properties,
            lambda item, parts: item.get("floorId") == "floor-1",
            removed_floors={"floor-1"},
        )
        self.assertEqual(properties["environment"]["doorOpeners"], [])
        self.assertEqual(len(removed), 1)

    def test_bare_model_id_also_cascade(self) -> None:
        # 裸 id 也必须能被认出（否则永远当孤儿 / 永远不清理）。
        bare = {**_door_opener("door-1"), "modelId": "door-1"}
        properties, removed = self._remove([bare], [])
        self.assertEqual(properties["environment"]["doorOpeners"], [])
        self.assertEqual(len(removed), 1)


if __name__ == "__main__":
    unittest.main()
