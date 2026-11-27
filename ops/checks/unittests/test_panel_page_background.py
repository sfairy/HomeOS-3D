"""页面背景四条校验的单测（0.9.0）。

## 为什么这四条必须有测试

它们都是**在保存时拒绝**，而不是渲染时兜底。写错了只会「该拒的没拒」（脏数据进库）
或「不该拒的拒了」（用户存不了），两者都不会在平时暴露 —— 只有真的保存那份文档才会。

四条规则（与 0.9.0 `.das` 文案逐字一致）：

1. `页面背景只能添加到主页面或侧边栏的顶层。`
2. `页面背景只支持静态显示。`
3. `页面背景来源无效。`
4. `页面背景布局无效。`

0.9.0 **没有**透明度 / 备注 / 位置范围校验：本测试同时钉住「这些值不该被拒」。
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
        validate_panel_document(
            document_with(
                [background(backgroundSource="preset", preset="default/grid", layoutMode="fill")]
            )
        )

    def test_accepts_free_layout_with_position(self) -> None:
        validate_panel_document(
            document_with(
                [
                    background(
                        backgroundSource="image",
                        assetId="user:abc",
                        layoutMode="free",
                        position=position(x=20, width=0.1),
                    )
                ]
            )
        )

    def test_accepts_top_level_shared_background(self) -> None:
        # 0.9.0：模板 scopes 含 shared，共享组件顶层是合法落点。
        validate_panel_document(document_with([], shared=[background("bg-shared")]))

    def test_rejects_nested_background(self) -> None:
        nested = {
            "id": "card-1",
            "type": "card",
            "properties": {},
            "children": [background("bg-nested")],
        }
        with self.assertRaisesRegex(ValueError, "页面背景只能添加到主页面或侧边栏的顶层。"):
            validate_panel_document(document_with([nested]))

    def test_rejects_nested_background_in_shared_component(self) -> None:
        nested = {
            "id": "shared-group-1",
            "type": "card",
            "properties": {},
            "children": [background("bg-shared-nested")],
        }
        with self.assertRaisesRegex(ValueError, "页面背景只能添加到主页面或侧边栏的顶层。"):
            validate_panel_document(document_with([], shared=[nested]))

    def test_rejects_bound_background(self) -> None:
        component = background()
        component["bindings"] = {"entity": {"entityId": "light.a"}}
        with self.assertRaisesRegex(ValueError, "页面背景只支持静态显示。"):
            validate_panel_document(document_with([component]))

    def test_rejects_background_with_children(self) -> None:
        component = background()
        component["children"] = [{"id": "child-1", "type": "text", "properties": {}}]
        with self.assertRaisesRegex(ValueError, "页面背景只支持静态显示。"):
            validate_panel_document(document_with([component]))

    def test_rejects_non_none_action(self) -> None:
        component = background()
        component["actions"] = {"tap": {"type": "toggle", "data": {}}}
        with self.assertRaisesRegex(ValueError, "页面背景只支持静态显示。"):
            validate_panel_document(document_with([component]))

    def test_accepts_none_action(self) -> None:
        component = background()
        component["actions"] = {"tap": {"type": "none", "data": {}}}
        validate_panel_document(document_with([component]))

    def test_rejects_unknown_source(self) -> None:
        with self.assertRaisesRegex(ValueError, "页面背景来源无效。"):
            validate_panel_document(document_with([background(backgroundSource="url")]))

    def test_rejects_unknown_layout(self) -> None:
        with self.assertRaisesRegex(ValueError, "页面背景布局无效。"):
            validate_panel_document(document_with([background(layoutMode="centered")]))

    def test_defaults_when_omitted(self) -> None:
        # 缺省 backgroundSource/layoutMode 写回 preset + fill（0.9.0 setdefault 同口径）。
        result = validate_panel_document(document_with([background()]))
        properties = result["pages"][0]["components"][0]["properties"]
        assert properties["backgroundSource"] == "preset"
        assert properties["layoutMode"] == "fill"

    def test_migrates_legacy_source_key(self) -> None:
        result = validate_panel_document(document_with([background(source="image", assetId="user:abc")]))
        properties = result["pages"][0]["components"][0]["properties"]
        assert properties["backgroundSource"] == "image"

    def test_accepts_any_opacity_label_and_position(self) -> None:
        # 0.9.0 没有这三类范围校验：这些值都应能保存。
        validate_panel_document(
            document_with(
                [
                    background(
                        opacity=101,
                        label="字" * 200,
                        layoutMode="free",
                        position=position(width=0, height=-5),
                    )
                ]
            )
        )


if __name__ == "__main__":
    unittest.main()
