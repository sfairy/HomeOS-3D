"""studio3d 草稿服务：GET 只读、首次 PUT、CAS 冲突、并发唯一赢家、428 确认链路。

这些用例锁的是「行为契约」：拆 domain 之前后端把这些语义埋在 396 行路由里，
任何一条回归都会直接表现为用户丢一次保存或删错项目交互配置。
"""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import text
from src.domains.studio3d import draft_repository, service
from src.platform.core.models import Project, ProjectDraft
from src.schemas import Studio3DDraftUpdate

from tests.studio3d_helpers import (
    SCENE_ID_A,
    dispose,
    draft_scene,
    interaction_component,
    make_settings,
    new_database,
    write_scene_snapshot,
)

USER = SimpleNamespace(id=None)


def payload(revision: int, scene: dict, confirmation: str = "") -> Studio3DDraftUpdate:
    return Studio3DDraftUpdate(revision=revision, scene=scene, interactionConfirmation=confirmation)


class StudioDraftServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.settings = make_settings(self.root)
        # 文件库：两个 Session 各自一条连接，CAS 才是真的 CAS。
        self.session_factory = new_database(self.root / "app.db")
        self.scene = draft_scene(light_ids=["g1"])

    def tearDown(self) -> None:
        dispose(self.session_factory)
        self._tmp.cleanup()

    # ---- 读取面 -------------------------------------------------------

    def test_get_empty_draft_has_no_side_effects(self) -> None:
        with self.session_factory() as database:
            self.assertEqual(
                service.get_draft(database, self.settings),
                {"revision": 0, "scene": None, "updatedAt": None},
            )
            self.assertEqual(database.execute(text("SELECT COUNT(*) FROM studio_drafts")).scalar(), 0)

    def test_get_reads_legacy_file_without_writing(self) -> None:
        legacy = {"revision": 7, "scene": self.scene, "updatedAt": "2026-01-01T00:00:00+00:00"}
        self.settings.studio3d_draft_path.write_text(json.dumps(legacy), encoding="utf-8")
        before = self.settings.studio3d_draft_path.read_bytes()

        with self.session_factory() as database:
            draft = service.get_draft(database, self.settings)
            self.assertEqual(draft["revision"], 7)
            self.assertEqual(draft["scene"], self.scene)
            # 只读回退：绝不能在读路径上把旧文件「顺手迁移」进库或改写它。
            self.assertEqual(self.settings.studio3d_draft_path.read_bytes(), before)
            self.assertEqual(database.execute(text("SELECT COUNT(*) FROM studio_drafts")).scalar(), 0)

    def test_migrated_row_revision_is_readable_and_writable(self) -> None:
        with self.session_factory() as database:
            database.execute(
                text(
                    "INSERT INTO studio_drafts (id, revision, schema_version, scene_json, updated_at, updated_by) "
                    "VALUES (1, 5, 8, :scene_json, :updated_at, NULL)"
                ),
                {"scene_json": json.dumps(self.scene), "updated_at": draft_repository.now_sqlite()},
            )
            database.commit()
            self.assertEqual(service.get_draft(database, self.settings)["revision"], 5)

        with self.session_factory() as database:
            updated = service.save_draft(database, self.settings, USER, payload(5, self.scene))
            self.assertEqual(updated["revision"], 6)

    # ---- 写入面 -------------------------------------------------------

    def test_first_put_inserts_single_row(self) -> None:
        with self.session_factory() as database:
            updated = service.save_draft(database, self.settings, USER, payload(0, self.scene))
            self.assertEqual(updated["revision"], 1)
            self.assertEqual(updated["scene"], self.scene)
            self.assertTrue(updated["updatedAt"].endswith("+00:00"))

        with self.session_factory() as database:
            row = database.execute(
                text("SELECT id, revision, schema_version, scene_json FROM studio_drafts")
            ).one()
            self.assertEqual((row[0], row[1]), (1, 1))
            self.assertEqual(json.loads(row[3]), self.scene)
            self.assertEqual(service.get_draft(database, self.settings)["revision"], 1)

    def test_stale_revision_returns_conflict_with_current_revision(self) -> None:
        with self.session_factory() as database:
            service.save_draft(database, self.settings, USER, payload(0, self.scene))

        with self.session_factory() as database:
            with self.assertRaises(HTTPException) as raised:
                service.save_draft(database, self.settings, USER, payload(0, self.scene))
            self.assertEqual(raised.exception.status_code, 409)
            self.assertEqual(raised.exception.detail["code"], "STUDIO3D_REVISION_CONFLICT")
            self.assertEqual(raised.exception.detail["currentRevision"], 1)
            self.assertEqual(service.get_draft(database, self.settings)["revision"], 1)

    def test_concurrent_writers_only_one_wins(self) -> None:
        with self.session_factory() as database:
            service.save_draft(database, self.settings, USER, payload(0, self.scene))

        first = self.session_factory()
        second = self.session_factory()
        try:
            winner_scene = draft_scene(light_ids=["g1", "g2"])
            self.assertEqual(
                service.save_draft(first, self.settings, USER, payload(1, winner_scene))["revision"], 2
            )
            with self.assertRaises(HTTPException) as raised:
                service.save_draft(second, self.settings, USER, payload(1, self.scene))
            self.assertEqual(raised.exception.status_code, 409)
            self.assertEqual(raised.exception.detail["currentRevision"], 2)
        finally:
            first.close()
            second.close()

        with self.session_factory() as database:
            draft = service.get_draft(database, self.settings)
            self.assertEqual(draft["revision"], 2)
            self.assertEqual(draft["scene"], draft_scene(light_ids=["g1", "g2"]))

    def test_oversized_scene_is_rejected_before_touching_storage(self) -> None:
        with (
            mock.patch.object(draft_repository, "MAX_STUDIO3D_DRAFT_BYTES", 32),
            self.session_factory() as database,self.assertRaises(HTTPException) as raised
        ):
            service.save_draft(database, self.settings, USER, payload(0, {"big": "x" * 512}))
            self.assertEqual(raised.exception.status_code, 413)
            self.assertEqual(raised.exception.detail, "户型图数据过大，无法保存。")
            self.assertEqual(
                database.execute(text("SELECT COUNT(*) FROM studio_drafts")).scalar(), 0
            )

    # ---- 删除级联确认 -------------------------------------------------

    def _seed_project_binding(self, database) -> None:
        write_scene_snapshot(self.settings, SCENE_ID_A)
        document = {
            "type": "page",
            "components": [
                interaction_component(
                    "c1",
                    SCENE_ID_A,
                    lights=[{"floorId": "f1", "groupId": "g1", "label": "客厅主灯"}],
                )
            ],
        }
        database.add(Project(id="p1", name="项目一", slug="p1", description="", created_by="u1"))
        database.add(
            ProjectDraft(
                project_id="p1",
                schema_version=8,
                revision=1,
                document_json=json.dumps(document),
                updated_by="u1",
            )
        )
        database.commit()

    def test_interaction_cleanup_requires_confirmation_token(self) -> None:
        with self.session_factory() as database:
            self._seed_project_binding(database)

        # 先落一版「删除前」的草稿：服务端只比较库里的上一版与本次 scene。
        with self.session_factory() as database:
            self.assertEqual(
                service.save_draft(database, self.settings, USER, payload(0, self.scene))["revision"],
                1,
            )

        with self.session_factory() as database:
            with self.assertRaises(HTTPException) as raised:
                service.save_draft(database, self.settings, USER, payload(1, draft_scene()))
            detail = raised.exception.detail
            self.assertEqual(raised.exception.status_code, 428)
            self.assertEqual(detail["code"], "STUDIO3D_INTERACTION_CONFIRMATION")
            self.assertEqual(detail["projects"], ["项目一"])
            self.assertEqual(len(detail["impacts"]), 1)
            self.assertEqual(detail["impacts"][0]["label"], "客厅主灯")
            token = detail["token"]

        # 拒绝确认时什么都没写：草稿 revision 仍停在 1。
        with self.session_factory() as database:
            self.assertEqual(service.get_draft(database, self.settings)["revision"], 1)

        with self.session_factory() as database:
            updated = service.save_draft(database, self.settings, USER, payload(1, draft_scene(), token))
            self.assertEqual(updated["revision"], 2)

        with self.session_factory() as database:
            draft = database.get(ProjectDraft, "p1")
            document = json.loads(draft.document_json)
            component = document["components"][0]
            self.assertEqual(component["properties"]["lights"], [])
            self.assertEqual(draft.revision, 2)
            archive = draft_repository.read_archive(database)
            self.assertEqual(len(archive), 1)
            self.assertEqual(archive[0]["path"], ["lights"])
            self.assertEqual(archive[0]["scope"], ["p1", "c1", SCENE_ID_A])

    def test_cleanup_is_skipped_when_identities_are_unchanged(self) -> None:
        with self.session_factory() as database:
            self._seed_project_binding(database)

        # 只改灯光属性（label），身份集合没变：不该触发级联删除，也不该 428。
        new_scene = draft_scene(light_ids=["g1"])
        new_scene["floors"][0]["scene"]["lightGroups"][0]["label"] = "改名后"
        with self.session_factory() as database:
            service.save_draft(database, self.settings, USER, payload(0, self.scene))
        with self.session_factory() as database:
            updated = service.save_draft(database, self.settings, USER, payload(1, new_scene))
            self.assertEqual(updated["revision"], 2)

        with self.session_factory() as database:
            self.assertEqual(database.get(ProjectDraft, "p1").revision, 1)


if __name__ == "__main__":
    unittest.main()
