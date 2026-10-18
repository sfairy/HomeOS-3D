"""SPA 外壳路由样式预载：映射口径与注入位置（仅 preload，不激活样式表）。"""

from __future__ import annotations

import unittest

from src.bootstrap.spa_static import (
    _inject_preload_stylesheets,
    page_preload_stylesheets,
)

DISPLAY = (
    "/static/renderer/renderer.css",
    "/static/display.css",
    "/static/display-boot.css",
    "/static/modules/interaction3d/bridge.css",
    "/static/apple-install-guide.css",
)
EDITOR = (
    "/static/global-log.css",
    "/static/app.css",
    "/static/renderer/renderer.css",
    "/static/modules/interaction3d/bridge.css",
    "/static/flow-line-editor.css",
)
STUDIO = ("/static/3d-studio/studio.css",)


class PagePreloadStylesheetsTest(unittest.TestCase):
    def test_display_routes(self) -> None:
        for path in ("/", "/display/abc", "/display/", "/homeos/kitchen"):
            self.assertEqual(page_preload_stylesheets(path), DISPLAY, path)

    def test_editor_and_studio_routes(self) -> None:
        self.assertEqual(page_preload_stylesheets("/studio/editor"), EDITOR)
        self.assertEqual(page_preload_stylesheets("/3d-studio"), STUDIO)

    def test_unmapped_routes_have_no_preload(self) -> None:
        for path in ("/login", "/register", "/settings", "/display", "/3d-studio-x"):
            self.assertEqual(page_preload_stylesheets(path), (), path)

    def test_editor_is_exact_match_only(self) -> None:
        self.assertEqual(page_preload_stylesheets("/studio/editor/extra"), ())


class InjectPreloadTest(unittest.TestCase):
    def test_injects_before_head_close(self) -> None:
        html = "<html><head><title>x</title></head><body></body></html>"
        result = _inject_preload_stylesheets(html, DISPLAY)
        expected = "".join(
            f'<link rel="preload" as="style" href="{url}">' for url in DISPLAY
        )
        self.assertIn(expected + "</head>", result)
        self.assertEqual(result.count("<link "), len(DISPLAY))

    def test_empty_urls_returns_unchanged(self) -> None:
        html = "<html><head></head></html>"
        self.assertEqual(_inject_preload_stylesheets(html, ()), html)

    def test_falls_back_to_head_prefix_without_head_close(self) -> None:
        result = _inject_preload_stylesheets("<html><body></body></html>", STUDIO)
        self.assertTrue(result.startswith('<link rel="preload" as="style" href="/static/3d-studio/studio.css">'))


if __name__ == "__main__":
    unittest.main()
