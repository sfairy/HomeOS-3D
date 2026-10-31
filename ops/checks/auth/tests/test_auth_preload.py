"""认证入口预载的纯函数回归。

服务端只给 /login、/register、/reset-password、/activate、/license-recovery 注入
auth-entry.json 里的 modulepreload / stylesheet；/setup 与普通页面不注入。
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.bootstrap.spa_static import (
    _auth_entry_tags,
    _inject_auth_entry,
    _read_auth_entry,
)
from src.platform.core.frontend_static import is_auth_entry_page_path


class AuthEntryPageTests(unittest.TestCase):
    def test_entry_routes(self) -> None:
        for path in (
            "/login",
            "/register",
            "/reset-password",
            "/activate",
            "/license-recovery",
            "/login/",
        ):
            self.assertTrue(is_auth_entry_page_path(path), path)

    def test_non_entry_routes(self) -> None:
        for path in ("/", "/setup", "/setup/welcome", "/display/abc", "/3d-studio"):
            self.assertFalse(is_auth_entry_page_path(path), path)


class AuthEntryManifestTests(unittest.TestCase):
    def test_tags_include_js_and_css(self) -> None:
        tags = _auth_entry_tags(
            {
                "js": ["/static/assets/entry-a.js", "/static/assets/shared-b.js"],
                "css": ["/static/assets/views-auth-c.css"],
            }
        )
        self.assertIn('rel="modulepreload"', tags)
        self.assertIn("/static/assets/entry-a.js", tags)
        self.assertIn("/static/assets/shared-b.js", tags)
        self.assertIn('rel="stylesheet"', tags)
        self.assertIn("/static/assets/views-auth-c.css", tags)

    def test_tags_skip_urls_already_in_html(self) -> None:
        html = '<html><head><link rel="modulepreload" href="/static/assets/shared-b.js"></head></html>'
        tags = _auth_entry_tags(
            {
                "js": ["/static/assets/entry-a.js", "/static/assets/shared-b.js"],
                "css": ["/static/assets/views-auth-c.css"],
            },
            html,
        )
        self.assertIn("/static/assets/entry-a.js", tags)
        self.assertNotIn("/static/assets/shared-b.js", tags)
        self.assertIn("/static/assets/views-auth-c.css", tags)

    def test_inject_before_head(self) -> None:
        html = "<html><head></head><body></body></html>"
        out = _inject_auth_entry(
            html, {"js": ["/static/assets/entry-a.js"], "css": ["/static/assets/auth.css"]}
        )
        self.assertLess(out.index("entry-a.js"), out.index("</head>"))

    def test_missing_manifest_is_none(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(_read_auth_entry(Path(tmp)))

    def test_read_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "auth-entry.json").write_text(
                json.dumps(
                    {
                        "js": ["/static/assets/entry-a.js"],
                        "css": ["/static/assets/auth.css"],
                    }
                ),
                encoding="utf-8",
            )
            payload = _read_auth_entry(root)
            self.assertEqual(payload, {
                "js": ["/static/assets/entry-a.js"],
                "css": ["/static/assets/auth.css"],
            })

    def test_rejects_non_static_urls(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "auth-entry.json").write_text(
                json.dumps({"js": ["https://evil.example/x.js"], "css": []}),
                encoding="utf-8",
            )
            self.assertIsNone(_read_auth_entry(root))


if __name__ == "__main__":
    unittest.main()
