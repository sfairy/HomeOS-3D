"""页面背景四条校验的单测（0.8.9）。

## 为什么这四条必须有测试

它们都是**在保存时拒绝**，而不是渲染时兜底。写错了只会「该拒的没拒」（脏数据进库）
或「不该拒的拒了」（用户存不了），两者都不会在平时暴露 —— 只有真的保存那份文档才会。

四条规则（与上游文案逐字一致）：

1. `页面背景只能添加到主页面或侧边栏的顶层。`
2. `页面背景只支持静态显示。`
3. `页面背景来源无效。`
4. `页面背景布局无效。`
"""

from __future__ import annotations

import unittest

from _support import ensure_repo_on_path

ensure_repo_on_path()

from homeos.backend.src.panel.schema import validate_panel_document


def document_with(components: list[dict], *, shared: list[dict] | None = None) -> dict:
    return {
        "schemaVersion": 1,
        "projectId": "project-1",
        "name": "测试仪表盘",
        "canvas": {"width": 1920, "height": 1080},
        "sharedComponents": shared or [],
        "pages": [
            {
                "id": "page-1",
                "name": "主页",
                "path": "home",
                "components": components,
            }
        ],
    }


def background(component_id: str = "bg-1", **properties) -> dict:
    return {
        "id": component_id,
        "type": "page-background",
        "properties": properties or {},
    }


def position(**overrides) -> dict:
    base = {"x": 10, "y": 10, "width": 80, "height": 80}
    base.update(overrides)
    return base


class PageBackgroundValidationTest(unittest.TestCase):
    def test_accepts_top_level_preset(self) -> None:
        validate_panel_document(document_with([background(source="preset", preset="default/grid", layoutMode="fill")]))

    def test_accepts_free_layout_with_position(self) -> None:
        validate_panel_document(
            document_with(
                [
                    background(
                        source="image",
                        assetId="user:abc",
                        layoutMode="free",
                        position=position(x=20, width=0.1),
                    )
                ]
            )
        )

    def test_rejects_nested_background(self) -> None:
        nested = {
            "id": "card-1",
            "type": "card",
            "properties": {},
            "children": [background("bg-nested")],
        }
        with self.assertRaisesRegex(ValueError, "页面背景只能添加到主页面或侧边栏的顶层。"):
            validate_panel_document(document_with([nested]))

    def test_rejects_background_in_shared_components(self) -> None:
        with self.assertRaisesRegex(ValueError, "页面背景只能添加到主页面或侧边栏的顶层。"):
            validate_panel_document(document_with([], shared=[background("bg-shared")]))

    def test_rejects_dynamic_background(self) -> None:
        for dynamic_key in ("animation", "video", "transition", "autoplay"):
            with self.subTest(dynamic_key=dynamic_key), self.assertRaisesRegex(ValueError, "页面背景只支持静态显示。"):
                validate_panel_document(document_with([background(**{dynamic_key: "x"})]))

    def test_rejects_unknown_source(self) -> None:
        with self.assertRaisesRegex(ValueError, "页面背景来源无效。"):
            validate_panel_document(document_with([background(source="url")]))

    def test_rejects_unknown_layout(self) -> None:
        with self.assertRaisesRegex(ValueError, "页面背景布局无效。"):
            validate_panel_document(document_with([background(layoutMode="centered")]))

    def test_defaults_when_omitted(self) -> None:
        # 缺省 source/layoutMode 视为 preset + fill（与前端归一化同口径）。
        validate_panel_document(document_with([background()]))

    def test_rejects_opacity_out_of_range(self) -> None:
        for bad in (-1, 101, "50"):
            with self.subTest(opacity=bad), self.assertRaisesRegex(ValueError, "页面背景透明度"):
                validate_panel_document(document_with([background(opacity=bad)]))

    def test_rejects_over_long_label(self) -> None:
        with self.assertRaisesRegex(ValueError, "页面背景备注"):
            validate_panel_document(document_with([background(label="字" * 129)]))

    def test_fill_layout_ignores_position(self) -> None:
        # 铺满模式忽略 position：写坏也不该拒绝（与前端同口径）。
        validate_panel_document(document_with([background(layoutMode="fill", position=position(width=0))]))

    def test_rejects_zero_size_in_free_layout(self) -> None:
        for axis in ("width", "height"):
            with self.subTest(axis=axis), self.assertRaisesRegex(ValueError, "页面背景位置无效。"):
                validate_panel_document(document_with([background(layoutMode="free", position=position(**{axis: 0}))]))


if __name__ == "__main__":
    unittest.main()
