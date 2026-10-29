"""``resource_publication`` 的契约测试（0.8.1 新增）。

导图导出是「整个目录同时对外可见」的资源：覆盖发布要先把旧目录改名成 backup，再把
新目录改名成 target。两次改名之间进程被杀，磁盘上就只剩 ``.previous-<token>``，
重启后这个导出包凭空消失且没有线索。所以这里锁死：

- 正常覆盖：新内容可见、backup / staging / 日志全部清干净；
- 崩溃点 A（target 已改名成 backup、staging 还没上位）→ 启动恢复把旧目录换回来；
- 崩溃点 B（staging 已上位、backup 还在）→ 启动恢复保留新一代、删掉残留；
- 日志/暂存目录不合法 → **报错并保留现场**，绝不猜、绝不静默删；
- 符号链接一律拒绝（否则 ``shutil.rmtree`` 会删到别处）。
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.core import resource_publication as publication

TOKEN = "0123456789abcdef0123456789abcdef"
OTHER_TOKEN = "fedcba9876543210fedcba9876543210"


def stage_name(token=TOKEN):
    return f".export-{token}"


def journal_name(token=TOKEN):
    return f".replace-{token}.json"


class PublicationTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.target = self.root / "package-1"

    def write_directory(self, path, files):
        path.mkdir(parents=True)
        for name, content in files.items():
            (path / name).write_text(content, encoding="utf-8")
        return path

    def write_journal(self, target="package-1", staging=None, token=TOKEN, **overrides):
        payload = {
            "version": 1,
            "target": target,
            "staging": staging or stage_name(token),
        }
        payload.update(overrides)
        path = self.root / journal_name(token)
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def leftovers(self):
        return sorted(path.name for path in self.root.iterdir())


class ReplaceExportDirectoryTest(PublicationTestCase):
    def test_first_publish_is_a_plain_rename(self):
        staging = self.write_directory(self.root / stage_name(), {"scene.json": "1"})
        publication.replace_export_directory(staging, self.target)
        self.assertEqual((self.target / "scene.json").read_text(encoding="utf-8"), "1")
        self.assertEqual(self.leftovers(), ["package-1"])

    def test_overwrite_replaces_content_and_cleans_up(self):
        self.write_directory(self.target, {"scene.json": "old"})
        staging = self.write_directory(self.root / stage_name(), {"scene.json": "new"})
        publication.replace_export_directory(staging, self.target)
        self.assertEqual((self.target / "scene.json").read_text(encoding="utf-8"), "new")
        self.assertEqual(self.leftovers(), ["package-1"], "日志 / backup / staging 必须清干净")

    def test_staging_outside_root_is_rejected(self):
        outside = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: publication._remove_owned_directory(outside))
        staging = self.write_directory(outside / stage_name(), {"a": "1"})
        with self.assertRaises(ValueError):
            publication.replace_export_directory(staging, self.target)
        self.assertFalse(self.target.exists(), "校验失败不得留下半份发布")

    def test_staging_name_must_be_owned(self):
        for name in ("staging", ".export-deadbeef", ".export-" + TOKEN.upper()):
            with self.subTest(name=name):
                staging = self.write_directory(self.root / name, {"a": "1"})
                with self.assertRaises(ValueError):
                    publication.replace_export_directory(staging, self.target)
                publication._remove_owned_directory(staging)

    def test_symlinked_staging_is_rejected(self):
        real = self.write_directory(self.root / "real", {"a": "1"})
        link = self.root / stage_name()
        os.symlink(real, link)
        with self.assertRaises(RuntimeError):
            publication.replace_export_directory(link, self.target)

    def test_symlinked_target_is_rejected(self):
        real = self.write_directory(self.root / "real", {"a": "1"})
        os.symlink(real, self.target)
        staging = self.write_directory(self.root / stage_name(), {"a": "2"})
        with self.assertRaises(RuntimeError):
            publication.replace_export_directory(staging, self.target)

    def test_failure_between_renames_rolls_back_immediately(self):
        self.write_directory(self.target, {"scene.json": "old"})
        staging = self.write_directory(self.root / stage_name(), {"scene.json": "new"})
        real_replace = os.replace
        calls = {"count": 0}

        def flaky_replace(source, destination):
            calls["count"] += 1
            # 第三次改名是 staging → target：模拟掉电，改名没发生。
            if calls["count"] == 3:
                raise OSError("磁盘掉了")
            return real_replace(source, destination)

        with (
            mock.patch.object(publication.os, "replace", side_effect=flaky_replace),
            self.assertRaises(OSError),
        ):
            publication.replace_export_directory(staging, self.target)
        self.assertEqual(
            (self.target / "scene.json").read_text(encoding="utf-8"),
            "old",
            "改名失败必须当场把旧版本换回 target，不能留给下次启动",
        )
        self.assertEqual(self.leftovers(), ["package-1"])


class _Settings:
    def __init__(self, root):
        self.studio3d_exports_dir = root / "exports"
        self.user_assets_dir = root / "assets"


class RecoverExportReplacementsTest(PublicationTestCase):
    def test_crash_before_staging_lands(self):
        """target 已改名成 backup、staging 还没上位 → 恢复旧版本，并清掉 staging。"""
        self.write_directory(self.root / f".previous-{TOKEN}", {"scene.json": "old"})
        staging = self.write_directory(self.root / stage_name(), {"scene.json": "new"})
        journal = self.write_journal()

        publication.recover_export_replacements(self.root)

        self.assertEqual((self.target / "scene.json").read_text(encoding="utf-8"), "old")
        self.assertFalse(staging.exists())
        self.assertFalse(journal.exists())

    def test_crash_after_staging_lands(self):
        """target 已经是新一代、backup 还在 → 保留新一代，删 backup。"""
        self.write_directory(self.target, {"scene.json": "new"})
        self.write_directory(self.root / f".previous-{TOKEN}", {"scene.json": "old"})
        journal = self.write_journal()

        publication.recover_export_replacements(self.root)

        self.assertEqual((self.target / "scene.json").read_text(encoding="utf-8"), "new")
        self.assertFalse(journal.exists())
        self.assertEqual(self.leftovers(), ["package-1"])

    def test_no_journal_is_a_noop(self):
        self.write_directory(self.target, {"scene.json": "new"})
        publication.recover_export_replacements(self.root)
        self.assertEqual(self.leftovers(), ["package-1"])

    def test_missing_backup_keeps_the_journal_and_raises(self):
        journal = self.write_journal()
        with self.assertRaises(RuntimeError):
            publication.recover_export_replacements(self.root)
        self.assertTrue(journal.exists(), "证明不了就不许写：现场必须保留")
        self.assertFalse(self.target.exists())

    def test_invalid_journal_payload_is_preserved(self):
        for payload in (
            {"target": "package-1", "staging": stage_name()},
            {"version": 2, "target": "package-1", "staging": stage_name()},
            {"version": 1, "target": "", "staging": stage_name()},
            {"version": 1, "target": ".hidden", "staging": stage_name()},
            {"version": 1, "target": "nested/package", "staging": stage_name()},
            {"version": 1, "target": "package-1", "staging": "staging"},
            {"version": 1, "target": "package-1", "staging": ".export-" + TOKEN.upper()},
            {"version": 1, "target": 1, "staging": stage_name()},
        ):
            with self.subTest(payload=payload):
                journal = self.root / journal_name()
                journal.write_text(json.dumps(payload), encoding="utf-8")
                with self.assertRaises(RuntimeError):
                    publication.recover_export_replacements(self.root)
                self.assertTrue(journal.exists())
                journal.unlink()

    def test_journal_itself_must_match_ownership_pattern(self):
        bad = self.root / ".replace-notatoken.json"
        bad.write_text(json.dumps({"version": 1}), encoding="utf-8")
        with self.assertRaises(RuntimeError):
            publication.recover_export_replacements(self.root)
        self.assertTrue(bad.exists())

    def test_symlinked_target_is_rejected(self):
        real = self.write_directory(self.root / "real", {"scene.json": "new"})
        os.symlink(real, self.target)
        journal = self.write_journal()
        with self.assertRaises(RuntimeError):
            publication.recover_export_replacements(self.root)
        self.assertTrue(journal.exists())

    def test_recovery_is_idempotent(self):
        self.write_directory(self.root / f".previous-{TOKEN}", {"scene.json": "old"})
        self.write_journal()
        publication.recover_export_replacements(self.root)
        publication.recover_export_replacements(self.root)
        self.assertEqual((self.target / "scene.json").read_text(encoding="utf-8"), "old")


class RecoverResourcePublicationsTest(PublicationTestCase):
    def test_startup_cleanup_covers_exports_and_assets(self):
        settings = _Settings(self.root)
        exports = settings.studio3d_exports_dir
        exports.mkdir(parents=True)
        self.write_directory(exports / "package-1", {"scene.json": "1"})
        orphan_stage = self.write_directory(exports / stage_name(), {"scene.json": "orphan"})
        temporary = exports / f".replace-{OTHER_TOKEN}.tmp"
        temporary.write_text("{}", encoding="utf-8")
        unrelated = exports / ".DS_Store"
        unrelated.write_text("x", encoding="utf-8")
        assets = settings.user_assets_dir
        assets.mkdir(parents=True)
        upload = self.write_directory(assets / f".upload-{TOKEN}", {"a": "1"})
        user_file = assets / "avatar.png"
        user_file.write_text("png", encoding="utf-8")

        publication.recover_resource_publications(settings)

        self.assertFalse(orphan_stage.exists())
        self.assertFalse(temporary.exists())
        self.assertFalse(upload.exists())
        self.assertTrue((exports / "package-1" / "scene.json").is_file())
        self.assertTrue(unrelated.exists(), "不属于本模块的文件不得删除")
        self.assertTrue(user_file.exists())

    def test_startup_recovery_runs_journal_first(self):
        settings = _Settings(self.root)
        exports = settings.studio3d_exports_dir
        self.write_directory(exports / f".previous-{TOKEN}", {"scene.json": "old"})
        (exports / journal_name()).write_text(
            json.dumps({"version": 1, "target": "package-1", "staging": stage_name()}),
            encoding="utf-8",
        )
        publication.recover_resource_publications(settings)
        self.assertEqual((exports / "package-1" / "scene.json").read_text(encoding="utf-8"), "old")

    def test_missing_directories_are_tolerated(self):
        publication.recover_resource_publications(_Settings(self.root))


if __name__ == "__main__":
    unittest.main()
