"""``frontend_resource_url`` 的契约测试（0.8.2 单一资源版本）。

这个函数是「后端拼出来的稳定 URL」与「构建期 revision」之间唯一的连接点，出错方式都很安静：

- 少补一个 ``?v=`` → 升级后旧缓存顶回来，页面「新外壳 + 旧资源」混跑（没有报错）；
- 旧 ``v`` 参数没删干净 → 同一条 URL 出现两种组合，等于**制造**缓存碎片；
- 清单读到坏内容还降级 → 缓存混用重现且无人发现。

所以这里逐条钉死语义，包括「代码里写死的正则必须还是 16 位小写十六进制」。
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.core import frontend_resources as resources

REVISION = "0123456789abcdef"


class FrontendResourceUrlTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.frontend_dir = Path(self._tmp.name)
        resources._revision_cache.clear()

    def tearDown(self) -> None:
        self._tmp.cleanup()
        resources._revision_cache.clear()

    def _write_manifest(self, payload: object) -> None:
        (self.frontend_dir / resources.RESOURCE_VERSION_FILE).write_text(
            json.dumps(payload), encoding="utf-8"
        )

    def _url(self, url: str) -> str:
        return resources.frontend_resource_url(self.frontend_dir, url)

    # --- 正常路径 -------------------------------------------------------

    def test_appends_revision_to_bare_url(self) -> None:
        self._write_manifest({"revision": REVISION})
        self.assertEqual(
            self._url("/static/3d-studio/core/stage.css"),
            f"/static/3d-studio/core/stage.css?v={REVISION}",
        )

    def test_keeps_other_query_parameters(self) -> None:
        self._write_manifest({"revision": REVISION})
        self.assertEqual(
            self._url("/static/a.css?theme=dark&lang=zh"),
            f"/static/a.css?theme=dark&lang=zh&v={REVISION}",
        )

    def test_drops_every_existing_v_parameter(self) -> None:
        """上游 0.8.1 的 tag 链（``v=2026…-2026…``）必须整条丢掉，只留新 revision。"""
        self._write_manifest({"revision": REVISION})
        self.assertEqual(
            self._url("/static/a.css?v=old&theme=dark&v=older"),
            f"/static/a.css?theme=dark&v={REVISION}",
        )

    def test_keeps_blank_query_values(self) -> None:
        self._write_manifest({"revision": REVISION})
        self.assertEqual(
            self._url("/static/a.css?flag=&v=old"),
            f"/static/a.css?flag=&v={REVISION}",
        )

    def test_preserves_fragment(self) -> None:
        self._write_manifest({"revision": REVISION})
        self.assertEqual(
            self._url("/static/a.css?v=old#panel"),
            f"/static/a.css?v={REVISION}#panel",
        )

    # --- 降级：没有构建产物 ---------------------------------------------

    def test_missing_manifest_returns_url_unchanged(self) -> None:
        self.assertEqual(self._url("/static/a.css?v=old"), "/static/a.css?v=old")

    # --- 清单存在但内容不可信：一律抛，不静默降级 -----------------------

    def test_rejects_short_revision(self) -> None:
        self._write_manifest({"revision": "abc"})
        with self.assertRaisesRegex(ValueError, "Invalid frontend resource revision"):
            self._url("/static/a.css")

    def test_rejects_uppercase_revision(self) -> None:
        self._write_manifest({"revision": REVISION.upper()})
        with self.assertRaisesRegex(ValueError, "Invalid frontend resource revision"):
            self._url("/static/a.css")

    def test_rejects_non_string_revision(self) -> None:
        self._write_manifest({"revision": 16})
        with self.assertRaisesRegex(ValueError, "Invalid frontend resource revision"):
            self._url("/static/a.css")

    def test_missing_revision_key_raises(self) -> None:
        self._write_manifest({"note": "no revision"})
        with self.assertRaises(KeyError):
            self._url("/static/a.css")

    def test_malformed_json_raises(self) -> None:
        (self.frontend_dir / resources.RESOURCE_VERSION_FILE).write_text(
            "{not json", encoding="utf-8"
        )
        with self.assertRaises(json.JSONDecodeError):
            self._url("/static/a.css")

    # --- 记忆化：重建产物必须被看见 -------------------------------------

    def test_cache_invalidated_when_manifest_changes(self) -> None:
        self._write_manifest({"revision": REVISION})
        self.assertEqual(self._url("/static/a.css"), f"/static/a.css?v={REVISION}")

        newer = "fedcba9876543210"
        self._write_manifest({"revision": newer})
        # 同一纳秒内重写时 mtime 可能不变，显式把时间推后，模拟「重新构建」。
        manifest = self.frontend_dir / resources.RESOURCE_VERSION_FILE
        stat = manifest.stat()
        os.utime(manifest, ns=(stat.st_atime_ns + 1, stat.st_mtime_ns + 1))

        self.assertEqual(self._url("/static/a.css"), f"/static/a.css?v={newer}")

    def test_code_contract_is_16_lowercase_hex(self) -> None:
        self.assertEqual(resources._REVISION_PATTERN.pattern, "[0-9a-f]{16}")
        self.assertEqual(resources.RESOURCE_VERSION_FILE, "resource-version.json")

    def test_manifest_file_name_matches_build_output(self) -> None:
        """构建脚本写出的文件名必须与后端读的文件名一致。"""
        vite_config = (REPO_ROOT / "homeos" / "frontend" / "vite.config.ts").read_text(
            encoding="utf-8"
        )
        self.assertIn(
            f"const RESOURCE_VERSION_FILE = '{resources.RESOURCE_VERSION_FILE}'",
            vite_config,
        )


if __name__ == "__main__":
    unittest.main()
