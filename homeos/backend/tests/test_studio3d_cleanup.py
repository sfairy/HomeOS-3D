"""studio3d 删除级联：快照缺失告警、窗帘组整组移除、归档恢复、确认令牌稳定性。"""

import copy
import tempfile
import unittest
from pathlib import Path

from src.domains.studio3d import cleanup

from tests.studio3d_helpers import (
    SCENE_ID_A,
    SCENE_ID_B,
    draft_scene,
    interaction_component,
    make_settings,
    write_scene_snapshot,
)


class StudioCleanupTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.settings = make_settings(self.root)
        self.old_scene = draft_scene(light_ids=["g1"])
        self.new_scene = draft_scene()

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _document(self, component) -> dict:
        return {"type": "page", "components": [component]}

    def test_identities_ignore_property_changes(self) -> None:
        renamed = copy.deepcopy(self.old_scene)
        renamed["floors"][0]["scene"]["lightGroups"][0]["label"] = "改名"
        renamed["floors"][0]["scene"]["lightGroups"][0]["lightBrightness"] = 80
        self.assertEqual(cleanup.identities(self.old_scene), cleanup.identities(renamed))

        output, _saved, impacts = cleanup.plan_cleanup(
            {}, self.old_scene, renamed, [], self.settings
        )
        self.assertEqual(output, {})
        self.assertEqual(impacts, [])

    def test_missing_snapshot_logs_warning_and_keeps_binding(self) -> None:
        write_scene_snapshot(self.settings, SCENE_ID_A)
        missing = interaction_component(
            "c-missing",
            SCENE_ID_B,
            lights=[{"floorId": "f1", "groupId": "g1", "label": "缺失快照的灯"}],
        )
        valid = interaction_component(
            "c-valid",
            SCENE_ID_A,
            lights=[{"floorId": "f1", "groupId": "g1", "label": "主灯"}],
        )
        document = self._document(missing)
        document["components"].append(valid)
        snapshot = copy.deepcopy(document)

        with self.assertLogs("src.domains.studio3d.cleanup", level="WARNING") as logs:
            output, saved, impacts = cleanup.plan_cleanup(
                {"p1": document}, self.old_scene, self.new_scene, [], self.settings
            )

        # 缺失快照的组件不动（宁可留不可达绑定，也不凭缺失文件误删）……
        kept = output["p1"]["components"][0]["properties"]["lights"]
        self.assertEqual(kept, [{"floorId": "f1", "groupId": "g1", "label": "缺失快照的灯"}])
        # ……其余组件照旧清理，不会被一个坏组件拖住。
        cleaned = output["p1"]["components"][1]["properties"]["lights"]
        self.assertEqual(cleaned, [])
        self.assertEqual(len(impacts), 1)
        self.assertEqual(impacts[0]["componentId"], "c-valid")
        self.assertEqual(len(saved), 1)
        # 入参不被就地修改
        self.assertEqual(document, snapshot)
        self.assertIn("快照缺失", logs.output[0])
        self.assertIn("c-missing", logs.output[0])
        self.assertIn(SCENE_ID_B, logs.output[0])

    def test_curtain_group_is_removed_when_member_deleted(self) -> None:
        write_scene_snapshot(self.settings, SCENE_ID_A)
        component = interaction_component(
            "c1",
            SCENE_ID_A,
            environment={
                "curtains": [
                    {"id": "c1", "floorId": "f1", "modelId": "m1", "coverKind": "normal", "label": "纱帘"},
                    {"id": "c2", "floorId": "f1", "modelId": "m2", "coverKind": "normal", "label": "布帘"},
                ],
                "curtainGroups": [{"id": "g1", "floorId": "f1", "memberIds": ["c1", "c2"]}],
            },
        )
        old_scene = draft_scene(item_ids=["m1", "m2"])
        new_scene = draft_scene(item_ids=["m2"])

        output, saved, impacts = cleanup.plan_cleanup(
            {"p1": self._document(component)}, old_scene, new_scene, [], self.settings
        )

        properties = output["p1"]["components"][0]["properties"]
        self.assertEqual([item["id"] for item in properties["environment"]["curtains"]], ["c2"])
        self.assertEqual(properties["environment"]["curtainGroups"], [])
        self.assertEqual(len(impacts), 1)
        paths = {tuple(entry["path"]) for entry in saved}
        self.assertEqual(paths, {("environment", "curtains"), ("environment", "curtainGroups")})

    def test_added_binding_is_restored_from_archive(self) -> None:
        write_scene_snapshot(self.settings, SCENE_ID_A)
        component = interaction_component("c1", SCENE_ID_A, lights=[])
        archive = [
            {
                "scope": ["p1", "c1", SCENE_ID_A],
                "path": ["lights"],
                "item": {"floorId": "f1", "groupId": "g1", "label": "主灯"},
                "key": ["f1", "light", "g1"],
            }
        ]
        old_scene = draft_scene()
        new_scene = draft_scene(light_ids=["g1"])

        output, saved, impacts = cleanup.plan_cleanup(
            {"p1": self._document(component)}, old_scene, new_scene, archive, self.settings
        )

        restored = output["p1"]["components"][0]["properties"]["lights"]
        self.assertEqual([item["groupId"] for item in restored], ["g1"])
        self.assertEqual(saved, [])
        self.assertEqual(impacts, [])

    def test_confirmation_token_is_deterministic_and_content_sensitive(self) -> None:
        impacts = [{"projectId": "p1", "componentId": "c1", "label": "主灯"}]
        first = cleanup.confirmation_token(1, self.old_scene, {"p1": {}}, impacts)
        second = cleanup.confirmation_token(1, self.old_scene, {"p1": {}}, impacts)
        other_revision = cleanup.confirmation_token(2, self.old_scene, {"p1": {}}, impacts)
        other_impacts = cleanup.confirmation_token(1, self.old_scene, {"p1": {}}, [])
        self.assertEqual(first, second)
        self.assertNotEqual(first, other_revision)
        self.assertNotEqual(first, other_impacts)
        self.assertEqual(len(first), 64)


if __name__ == "__main__":
    unittest.main()
