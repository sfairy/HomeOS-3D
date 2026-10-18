"""studio3d 导出包：目录名校验、ZIP 内容校验、覆盖写入、被引用时的删除拦截。"""

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from fastapi import HTTPException
from src.domains.studio3d import export_service
from src.platform.core.models import GlobalCustomPopupState, Project, ProjectDraft

from tests.studio3d_helpers import FakeCatalog, FakeRequest, dispose, make_settings, new_database

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 16


def build_zip(path: Path, files: dict[str, bytes]) -> Path:
    with zipfile.ZipFile(path, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return path


class ExportTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.settings = make_settings(self.root)
        self.catalog = FakeCatalog()

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def request(self, folder: str | None = "pkg"):
        headers = {"x-export-folder": folder} if folder is not None else {}
        return FakeRequest(self.settings, headers=headers, catalog=self.catalog)

    def valid_zip(self, name: str = "package.zip") -> Path:
        return build_zip(
            self.root / name,
            {"floor.png": PNG_BYTES, "scene.json": json.dumps({"items": []}).encode("utf-8")},
        )


class FolderNameTest(ExportTestCase):
    def test_valid_names(self) -> None:
        self.assertEqual(export_service.folder_name(self.request("demo")), "demo")
        self.assertEqual(export_service.folder_name(self.request("demo%20pkg")), "demo pkg")

    def test_invalid_names_are_rejected(self) -> None:
        # 注意：实现会先 strip，所以结尾空格会被吞掉（与迁移前一致），不在此列。
        for name in ["", ".", "..", ".hidden", "trail.", "a/b", "a|b", "a:b", "../evil"]:
            with self.subTest(name=name):
                with self.assertRaises(HTTPException) as raised:
                    export_service.folder_name(self.request(name))
                self.assertEqual(raised.exception.status_code, 422)

    def test_missing_header_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            export_service.folder_name(self.request(None))
        self.assertEqual(raised.exception.status_code, 422)


class ArchiveValidationTest(ExportTestCase):
    def test_valid_archive_returns_entries(self) -> None:
        entries = export_service.validate_archive(self.valid_zip())
        self.assertEqual({entry.filename for entry in entries}, {"floor.png", "scene.json"})

    def test_non_image_extension_is_rejected(self) -> None:
        archive = build_zip(self.root / "bad.zip", {"evil.txt": b"x"})
        with self.assertRaises(HTTPException) as raised:
            export_service.validate_archive(archive)
        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("无效文件路径或文件类型", raised.exception.detail)

    def test_nested_path_is_rejected(self) -> None:
        archive = build_zip(self.root / "nested.zip", {"sub/floor.png": PNG_BYTES})
        with self.assertRaises(HTTPException) as raised:
            export_service.validate_archive(archive)
        self.assertEqual(raised.exception.status_code, 422)

    def test_json_must_be_an_object(self) -> None:
        archive = build_zip(
            self.root / "json.zip",
            {"scene.json": b"[1, 2]", "floor.png": PNG_BYTES},
        )
        with self.assertRaises(HTTPException) as raised:
            export_service.validate_archive(archive)
        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("scene.json", raised.exception.detail)

    def test_image_magic_is_checked(self) -> None:
        archive = build_zip(self.root / "png.zip", {"floor.png": b"not-a-png"})
        with self.assertRaises(HTTPException) as raised:
            export_service.validate_archive(archive)
        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("不是有效的 PNG", raised.exception.detail)

    def test_empty_archive_is_rejected(self) -> None:
        archive = build_zip(self.root / "empty.zip", {})
        with self.assertRaises(HTTPException) as raised:
            export_service.validate_archive(archive)
        self.assertEqual(raised.exception.status_code, 422)


class StoreExportTest(ExportTestCase):
    def test_existing_folder_requires_overwrite(self) -> None:
        request = self.request()
        archive = self.valid_zip()
        entries = export_service.validate_archive(archive)
        target = self.settings.studio3d_exports_dir / "pkg"
        target.mkdir()
        (target / "old.png").write_bytes(PNG_BYTES)

        with self.assertRaises(HTTPException) as raised:
            export_service.store_export_package(request, "pkg", False, archive, entries)
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail["code"], "STUDIO3D_EXPORT_EXISTS")
        self.assertTrue((target / "old.png").exists())

        result = export_service.store_export_package(request, "pkg", True, archive, entries)
        self.assertTrue(result["overwritten"])
        self.assertEqual(result["relativePath"], "exports/pkg")
        self.assertEqual(sorted(result["files"]), ["floor.png", "pkg.zip", "scene.json"])
        self.assertTrue((target / "floor.png").is_file())
        self.assertFalse((target / "old.png").exists())
        # 原子交换不留下 staging / previous 目录
        leftovers = [
            path.name
            for path in self.settings.studio3d_exports_dir.iterdir()
            if path.name.startswith((".export-", ".previous-"))
        ]
        self.assertEqual(leftovers, [])
        self.assertEqual([name for name, _path in self.catalog.registered], ["pkg"])
        self.assertEqual(request.app.state.global_log.events[-1][1:3], ("3D户型图编辑器", "导出"))

    def test_fresh_install_reports_not_overwritten(self) -> None:
        """overwritten 取交换前状态：新装目录必须报 False，前端据此显示「已导出」而非「已覆盖」。"""
        request = self.request()
        archive = self.valid_zip()
        entries = export_service.validate_archive(archive)

        result = export_service.store_export_package(request, "fresh", False, archive, entries)

        self.assertFalse(result["overwritten"])
        self.assertEqual(result["files"], ["floor.png", "scene.json", "fresh.zip"])
        self.assertTrue((self.settings.studio3d_exports_dir / "fresh" / "fresh.zip").is_file())


class DeleteExportTest(ExportTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.session_factory = new_database()
        self.folder = self.settings.studio3d_exports_dir / "pkg"
        self.folder.mkdir()
        (self.folder / "a.png").write_bytes(PNG_BYTES)

    def tearDown(self) -> None:
        dispose(self.session_factory)
        super().tearDown()

    def add_project_draft(self, document: dict) -> None:
        with self.session_factory() as database:
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

    def test_reference_in_project_draft_blocks_deletion(self) -> None:
        self.add_project_draft({"pages": [{"background": "studio3d:pkg/a.png"}]})
        request = self.request()
        with self.session_factory() as database, self.assertRaises(HTTPException) as raised:
            export_service.delete_export_folder(request, database, "pkg")
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail["code"], "STUDIO3D_EXPORT_IN_USE")
        self.assertEqual(raised.exception.detail["projects"], ["项目一"])
        self.assertTrue(self.folder.is_dir())

    def test_reference_in_global_popups_blocks_deletion(self) -> None:
        request = self.request()
        with self.session_factory() as database:
            database.add(
                GlobalCustomPopupState(
                    id=1,
                    revision=1,
                    popups_json=json.dumps([{"image": "studio3d:pkg/a.png"}]),
                )
            )
            database.commit()
            with self.assertRaises(HTTPException) as raised:
                export_service.delete_export_folder(request, database, "pkg")
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail["projects"], ["全局组合弹窗"])

    def test_delete_without_references_removes_folder(self) -> None:
        request = self.request()
        with self.session_factory() as database:
            export_service.delete_export_folder(request, database, "pkg")
        self.assertFalse(self.folder.exists())
        self.assertEqual(self.catalog.removed, ["pkg"])
        self.assertEqual(request.app.state.global_log.events[-1][1:3], ("图片管理", "删除"))

    def test_missing_folder_is_404(self) -> None:
        request = self.request()
        with self.session_factory() as database, self.assertRaises(HTTPException) as raised:
            export_service.delete_export_folder(request, database, "nope")
        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
