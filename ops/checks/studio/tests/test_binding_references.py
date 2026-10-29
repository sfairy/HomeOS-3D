"""``new_binding_references`` / ``require_current_binding_references`` 的契约测试（0.8.1）。

这两条守卫拦的是同一类事故：户型里删掉一个模型 → 用户在 3D 配置里撤销/粘贴/复制
一份旧的交互项 → 交互项又绑回那个已经不存在的 modelId。后端照单全收，前端渲染时
拿不到模型，交互项就变成一个「看不见但能点」的幽灵热区。

守卫刻意只校验**新增**的绑定：

- 全部重校验会让任何一次普通保存都失败（历史遗留的失效绑定太多了）；
- 没有场景快照的旧配置没有可对照的数据，跳过而不是误杀；
- 但「户型草稿读不出来」不能当成「没有草稿」放行 —— 证明不了就不许写。
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import HTTPException
from src.domains.studio3d import cleanup

SCENE_ID = "0123456789abcdef0123456789abcdef"

FLOOR_PLAN = {
    "floors": [
        {
            "id": "floor-1",
            "scene": {
                "items": [{"id": "model-1"}],
                "lightGroups": [{"id": "light-group-1"}],
                "doors": [{"id": "door-1"}],
            },
        }
    ]
}


def component(scene_id=SCENE_ID, *, lights=None, locks=None):
    properties = {"sceneId": scene_id}
    if lights is not None:
        properties["lights"] = lights
    if locks is not None:
        properties["security"] = {"locks": locks}
    return {"type": "interaction3d", "properties": properties}


def document(*components):
    return {"pages": [{"id": "page-1", "components": list(components)}]}


def light(**overrides):
    item = {"id": "item-1", "label": "主灯", "floorId": "floor-1", "groupId": "light-group-1"}
    item.update(overrides)
    return item


class NewBindingReferencesTest(unittest.TestCase):
    def test_only_new_keys_are_reported(self):
        previous = document(component(lights=[light()]))
        current = document(
            component(lights=[light(), light(id="item-2", label="次灯", groupId="light-group-2")])
        )
        self.assertEqual(
            cleanup.new_binding_references(current, previous),
            [(SCENE_ID, ("floor-1", "light", "light-group-2"), "次灯")],
        )

    def test_identical_documents_report_nothing(self):
        current = document(component(lights=[light(groupId="light-group-deleted")]))
        self.assertEqual(cleanup.new_binding_references(current, current), [])

    def test_undo_brings_back_a_deleted_reference(self):
        # 撤销前的文档里还有这一项，撤销后没了；再「重做」就属于新出现 → 必须拦。
        with_item = document(component(lights=[light()]))
        without_item = document(component(lights=[]))
        self.assertEqual(cleanup.new_binding_references(without_item, with_item), [])
        self.assertEqual(
            cleanup.new_binding_references(with_item, without_item),
            [(SCENE_ID, ("floor-1", "light", "light-group-1"), "主灯")],
        )

    def test_same_document_without_previous_reports_everything(self):
        self.assertEqual(
            cleanup.new_binding_references(document(component(lights=[light()]))),
            [(SCENE_ID, ("floor-1", "light", "light-group-1"), "主灯")],
        )

    def test_invalid_scene_id_is_ignored(self):
        for scene_id in ("", "not-a-hash", SCENE_ID[:-1], SCENE_ID.upper(), SCENE_ID + "0"):
            with self.subTest(scene_id=scene_id):
                self.assertEqual(
                    cleanup.new_binding_references(document(component(scene_id, lights=[light()]))),
                    [],
                )

    def test_locks_reference_doors_not_models(self):
        # 门锁的 modelId 在入库前已被 lock.py 规范成 ``door:<id>``，因此绑定键天然带前缀，
        # 和 identities() 里门的 ``door:<id>`` 同构（也避免与同层模型 id 撞车）。
        references = cleanup.new_binding_references(
            document(
                component(
                    lights=[],
                    locks=[{"id": "lock-1", "floorId": "floor-1", "modelId": "door:door-1"}],
                )
            )
        )
        self.assertEqual(references, [(SCENE_ID, ("floor-1", "door", "door:door-1"), "lock-1")])

    def test_component_without_bindings_reports_nothing(self):
        self.assertEqual(cleanup.new_binding_references(document(component())), [])


class RequireCurrentBindingReferencesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.snapshot = Path(self.tmp.name) / f"{SCENE_ID}.json"
        self.snapshot.write_text(json.dumps({"floors": [{"id": "floor-1", "scene": {}}]}), encoding="utf-8")
        patcher = mock.patch.object(cleanup, "scene_snapshot_file", return_value=self.snapshot)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _read_snapshot(self, scene=FLOOR_PLAN, *, error=None):
        def read(_database):
            if error is not None:
                raise error
            return None if scene is None else mock.Mock(scene=scene)

        patcher = mock.patch.object(cleanup.draft_repository, "read_snapshot", side_effect=read)
        return patcher.start()

    def assertConflict(self, references, needle):
        with self.assertRaises(HTTPException) as caught:
            cleanup.require_current_binding_references(None, object(), references)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(caught.exception.detail["code"], "STUDIO3D_BINDING_CONFLICT")
        self.assertIn(needle, caught.exception.detail["message"])

    def test_no_references_short_circuits(self):
        reader = mock.patch.object(cleanup.draft_repository, "read_snapshot")
        with reader as read:
            cleanup.require_current_binding_references(None, None, [])
        read.assert_not_called()

    def test_existing_reference_passes(self):
        self._read_snapshot()
        cleanup.require_current_binding_references(
            None, object(), [(SCENE_ID, ("floor-1", "light", "light-group-1"), "主灯")]
        )

    def test_deleted_model_raises_409(self):
        self._read_snapshot()
        self.assertConflict(
            [(SCENE_ID, ("floor-1", "model", "model-deleted"), "吊灯")], "吊灯"
        )

    def test_missing_floor_raises_409(self):
        self._read_snapshot()
        self.assertConflict([(SCENE_ID, ("floor-9", "model", "model-1"), "电视")], "电视")

    def test_door_reference_checked_against_doors(self):
        self._read_snapshot()
        cleanup.require_current_binding_references(
            None, object(), [(SCENE_ID, ("floor-1", "door", "door:door-1"), "门锁")]
        )
        self.assertConflict([(SCENE_ID, ("floor-1", "door", "door:door-2"), "旧门锁")], "旧门锁")

    def test_no_floor_plan_draft_passes(self):
        self._read_snapshot(scene=None)
        cleanup.require_current_binding_references(
            None, object(), [(SCENE_ID, ("floor-1", "model", "model-deleted"), "吊灯")]
        )

    def test_unreadable_draft_fails_closed(self):
        self._read_snapshot(
            error=HTTPException(status_code=500, detail="草稿损坏"),
        )
        self.assertConflict(
            [(SCENE_ID, ("floor-1", "model", "model-1"), "主灯")], "无法核对最新户型"
        )

    def test_component_without_snapshot_is_skipped(self):
        with mock.patch.object(cleanup, "scene_snapshot_file", return_value=None):
            reader = mock.patch.object(cleanup.draft_repository, "read_snapshot")
            with reader as read:
                cleanup.require_current_binding_references(
                    None, object(), [(SCENE_ID, ("floor-1", "model", "model-deleted"), "吊灯")]
                )
        read.assert_not_called()

    def test_unparsable_snapshot_is_skipped(self):
        self.snapshot.write_text("{not json", encoding="utf-8")
        reader = mock.patch.object(cleanup.draft_repository, "read_snapshot")
        with reader as read:
            cleanup.require_current_binding_references(
                None, object(), [(SCENE_ID, ("floor-1", "model", "model-deleted"), "吊灯")]
            )
        read.assert_not_called()

    def test_draft_is_read_at_most_once_per_call(self):
        reader = self._read_snapshot()
        cleanup.require_current_binding_references(
            None,
            object(),
            [
                (SCENE_ID, ("floor-1", "model", "model-1"), "电视"),
                (SCENE_ID, ("floor-1", "light", "light-group-1"), "主灯"),
            ],
        )
        self.assertEqual(reader.call_count, 1)


if __name__ == "__main__":
    unittest.main()
