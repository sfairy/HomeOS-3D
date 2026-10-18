"""删除用户素材时的「户型图是否在用」判定：读 studio_drafts，旧文件只读回退。"""

import json
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from src.api import assets
from src.platform.core.models import StudioDraft

from tests.studio3d_helpers import dispose, new_database

ASSET_ID = "0" * 32


class DeleteUserAssetStudioRefTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.user_assets_dir = root / "user-assets"
        asset_dir = self.user_assets_dir / ASSET_ID
        asset_dir.mkdir(parents = True)
        self.asset_path = asset_dir / f"{ASSET_ID}.png"
        self.asset_path.write_bytes(b"\x89PNG\r\n\x1a\n")
        self.removed: list[str] = []
        self.catalog = SimpleNamespace(
            mutation_lock = RLock(),
            remove_user = self.removed.append,
        )
        self.settings = SimpleNamespace(
            user_assets_dir = self.user_assets_dir,
            studio3d_draft_path = root / "studio3d" / "draft.json",
            data_dir = root,
        )
        self.request = SimpleNamespace(
            app = SimpleNamespace(
                state = SimpleNamespace(settings = self.settings, asset_catalog = self.catalog)
            )
        )
        self.session_factory = new_database()

    def tearDown(self) -> None:
        dispose(self.session_factory)
        self._tmp.cleanup()

    def insert_draft(self, scene: dict) -> None:
        with self.session_factory() as database:
            database.add(
                StudioDraft(
                    id=1,
                    revision=3,
                    schema_version=8,
                    scene_json=json.dumps(scene, ensure_ascii=False),
                    updated_at=datetime.now(UTC),
                    updated_by=None,
                )
            )
            database.commit()

    def delete_asset(self) -> None:
        with mock.patch.object(assets, "require_license_feature"), self.session_factory() as database:
            assets.delete_user_asset(ASSET_ID, self.request, database, None)

    def test_asset_referenced_by_database_draft_is_rejected(self) -> None:
        self.insert_draft({"floors": [{"id": "f1", "scene": {"background": {"assetId": f"user:{ASSET_ID}"}}}]})

        with self.assertRaises(HTTPException) as caught:
            self.delete_asset()

        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(caught.exception.detail["code"], "ASSET_IN_USE")
        self.assertIn("户型图", caught.exception.detail["message"])
        self.assertTrue(self.asset_path.is_file())
        self.assertEqual(self.removed, [])

    def test_asset_referenced_by_legacy_draft_file_is_rejected(self) -> None:
        self.settings.studio3d_draft_path.parent.mkdir(parents = True, exist_ok = True)
        self.settings.studio3d_draft_path.write_text(
            json.dumps(
                {
                    "revision": 1,
                    "scene": {"floors": [{"id": "f1", "scene": {"items": [{"screenImage": {"assetId": ASSET_ID}}]}}]},
                }
            ),
            encoding = "utf-8",
        )

        with self.assertRaises(HTTPException) as caught:
            self.delete_asset()

        self.assertEqual(caught.exception.status_code, 409)
        self.assertTrue(self.asset_path.is_file())

    def test_unreferenced_asset_is_deleted(self) -> None:
        self.insert_draft({"floors": [{"id": "f1", "scene": {"background": {"assetId": "builtin:bg.png"}}}]})

        self.delete_asset()

        self.assertFalse(self.asset_path.exists())
        self.assertEqual(self.removed, [f"user:{ASSET_ID}"])


if __name__ == "__main__":
    unittest.main()
