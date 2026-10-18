"""交互侧读取「当前户型草稿」：DB 优先、旧文件只读回退、场景引用收集。"""

import json
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest import mock

from fastapi import HTTPException
from src.domains.studio3d import draft_repository
from src.modules.interaction3d import api as interaction_api
from src.modules.interaction3d.studio_draft_scene import (
    read_current_studio_draft,
    read_current_studio_scene,
)
from src.platform.core.models import StudioDraft

from tests.studio3d_helpers import (
    SCENE_ID_A,
    FakeRequest,
    dispose,
    make_settings,
    new_database,
)

LEGACY_SCENE = {"floors": [{"id": "f1", "scene": {"items": [{"id": "legacy"}]}}]}
DB_SCENE = {
    "floors": [
        {
            "id": "f1",
            "scene": {
                "items": [{"id": "db"}],
                "background": {"assetId": "user:" + "0" * 32},
                "sceneId": SCENE_ID_A,
            },
        }
    ]
}


class StudioDraftReadTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.settings = make_settings(Path(self._tmp.name))
        self.session_factory = new_database()

    def tearDown(self) -> None:
        dispose(self.session_factory)
        self._tmp.cleanup()

    def insert_draft(self, scene: dict, revision: int = 7) -> None:
        with self.session_factory() as database:
            database.add(
                StudioDraft(
                    id=1,
                    revision=revision,
                    schema_version=8,
                    scene_json=json.dumps(scene, ensure_ascii=False),
                    updated_at=datetime.now(UTC),
                    updated_by=None,
                )
            )
            database.commit()

    def write_legacy(self, scene: dict, revision: int = 3) -> None:
        payload = {"revision": revision, "scene": scene, "updatedAt": "2026-01-01T00:00:00+00:00"}
        self.settings.studio3d_draft_path.write_text(json.dumps(payload), encoding="utf-8")

    def test_database_wins_over_stale_legacy_file(self) -> None:
        self.write_legacy(LEGACY_SCENE)
        self.insert_draft(DB_SCENE, revision=7)

        with self.session_factory() as database:
            payload = read_current_studio_draft(database, self.settings)

        self.assertEqual(payload["revision"], 7)
        self.assertEqual(payload["scene"], DB_SCENE)

    def test_legacy_file_is_read_only_fallback(self) -> None:
        self.write_legacy(LEGACY_SCENE)
        before = self.settings.studio3d_draft_path.read_bytes()

        with self.session_factory() as database:
            payload = read_current_studio_draft(database, self.settings)

            self.assertEqual(payload["revision"], 3)
            self.assertEqual(payload["scene"], LEGACY_SCENE)
            self.assertEqual(database.execute(__import__("sqlalchemy").text("SELECT COUNT(*) FROM studio_drafts")).scalar(), 0)
        self.assertEqual(self.settings.studio3d_draft_path.read_bytes(), before)

    def test_no_draft_returns_none(self) -> None:
        with self.session_factory() as database:
            self.assertIsNone(read_current_studio_draft(database, self.settings))
            self.assertIsNone(read_current_studio_scene(database, self.settings))

    def test_corrupt_snapshot_degrades_instead_of_raising(self) -> None:
        self.write_legacy(LEGACY_SCENE)
        with (
            self.session_factory() as database,
            mock.patch.object(draft_repository, "read_snapshot", side_effect=HTTPException(500, "损坏")),
            self.assertLogs("src.modules.interaction3d.studio_draft_scene", "WARNING"),
        ):
            self.assertIsNone(read_current_studio_draft(database, self.settings))

    def test_scene_helper_rejects_non_object_scene(self) -> None:
        self.write_legacy(LEGACY_SCENE)
        self.settings.studio3d_draft_path.write_text(
            json.dumps({"revision": 1, "scene": None}), encoding="utf-8"
        )

        with self.session_factory() as database:
            self.assertIsNone(read_current_studio_scene(database, self.settings))


class InteractionApiReadsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.settings = make_settings(Path(self._tmp.name))
        self.session_factory = new_database()
        self.request = FakeRequest(self.settings)

    def tearDown(self) -> None:
        dispose(self.session_factory)
        self._tmp.cleanup()

    def insert_draft(self, scene: dict, revision: int = 5) -> None:
        with self.session_factory() as database:
            database.add(
                StudioDraft(
                    id=1,
                    revision=revision,
                    schema_version=8,
                    scene_json=json.dumps(scene, ensure_ascii=False),
                    updated_at=datetime.now(UTC),
                    updated_by=None,
                )
            )
            database.commit()

    def test_current_scene_payload_reads_database(self) -> None:
        self.insert_draft(DB_SCENE)
        with self.session_factory() as database:
            payload = interaction_api.current_scene_payload(
                self.request, database, SCENE_ID_A, {"reference": True}
            )
        self.assertEqual(payload["scene"], DB_SCENE)

    def test_current_scene_payload_keeps_since_semantics(self) -> None:
        with self.session_factory() as database:
            with self.assertRaises(ValueError):
                interaction_api.current_scene_payload(self.request, database, SCENE_ID_A, {}, since="1")
            self.assertEqual(
                interaction_api.current_scene_payload(self.request, database, SCENE_ID_A, {"reference": True}),
                {"reference": True},
            )

    def test_referenced_scene_ids_reads_database(self) -> None:
        self.insert_draft(DB_SCENE)
        with self.session_factory() as database:
            referenced = interaction_api.referenced_scene_ids(self.request, database)
        self.assertEqual(referenced, {SCENE_ID_A})

    def test_referenced_scene_ids_falls_back_to_legacy(self) -> None:
        self.settings.studio3d_draft_path.write_text(
            json.dumps({"revision": 2, "scene": DB_SCENE}), encoding="utf-8"
        )
        with self.session_factory() as database:
            referenced = interaction_api.referenced_scene_ids(self.request, database)
        self.assertEqual(referenced, {SCENE_ID_A})


if __name__ == "__main__":
    unittest.main()
