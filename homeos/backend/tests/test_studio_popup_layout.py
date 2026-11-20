"""3D 控件弹窗布局（`properties.popupLayout`）的写入边界回归。

背景：前端 `bridge/editor.ts` 的「自定义大小与位置」会把
``{scale, maxHeight, custom, x, y}`` 整体写进 ``popupLayout.general`` / ``popupLayout.camera``。
后端此前只收 ``{x, y, scale}``，于是**一勾选就 422**，而当时没有任何用例覆盖这段，
门禁一直绿。这里锁住前后端共同约定的形状：允许的键、``custom`` 必须是真布尔、
``maxHeight`` 必须落在 30–95。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.modules.interaction3d.config import validate_config


def _popup(placement: dict) -> dict:
    """只带一个弹窗放置键的完整 3D 配置。

    ``sceneId`` 是灯光分区的必填项（32 位小写十六进制），其余分区缺省时走各自的
    「未设置」路径 —— 这样用例只测弹窗契约，不会被别的分区干扰。
    """
    return {
        "sceneId": "0123456789abcdef0123456789abcdef",
        "popupLayout": {"general": dict(placement)},
    }


class PopupLayoutContractTest(unittest.TestCase):
    def test_accepts_custom_and_max_height(self) -> None:
        # 前端写出的真实形状：自定义开关 + 最大高度 + 缩放 + 位置。
        validate_config(_popup({"custom": True, "maxHeight": 75, "scale": 1.2, "x": 50, "y": 0}))

    def test_accepts_max_height_edges(self) -> None:
        for value in (30, 95):
            with self.subTest(value=value):
                validate_config(_popup({"maxHeight": value}))

    def test_accepts_float_max_height(self) -> None:
        # 滑杆给的是整数百分比，但 JSON 里 75.0 也合法。
        validate_config(_popup({"maxHeight": 75.0}))

    def test_accepts_custom_false(self) -> None:
        validate_config(_popup({"custom": False}))

    def test_rejects_max_height_out_of_range(self) -> None:
        for value in (29, 96, 0, -1):
            with self.subTest(value=value), self.assertRaises(HTTPException):
                validate_config(_popup({"maxHeight": value}))

    def test_rejects_non_boolean_custom(self) -> None:
        # 1 / "true" 都不是「写出来就是布尔」：`type(...) is bool` 才认。
        for value in (1, 0, "true", "false", None):
            with self.subTest(value=value), self.assertRaises(HTTPException):
                validate_config(_popup({"custom": value}))

    def test_rejects_unknown_placement_key(self) -> None:
        with self.assertRaises(HTTPException):
            validate_config(_popup({"maxWidth": 10}))

    def test_rejects_unknown_popup_kind(self) -> None:
        with self.assertRaises(HTTPException):
            validate_config(
                {
                    "sceneId": "0123456789abcdef0123456789abcdef",
                    "popupLayout": {"dialog": {"scale": 1}},
                }
            )

    def test_rejects_position_out_of_range(self) -> None:
        for value in (-1, 101):
            with self.subTest(value=value), self.assertRaises(HTTPException):
                validate_config(_popup({"x": value}))

    def test_navigation_still_rejects_popup_only_keys(self) -> None:
        # `custom` / `maxHeight` 只属于弹窗：导航放置仍按 {x, y, scale} 判，
        # 否则两种放置的契约会悄悄合并成一份。
        with self.assertRaises(HTTPException):
            validate_config(
                {
                    "sceneId": "0123456789abcdef0123456789abcdef",
                    "navigation": {"floors": {"custom": True}},
                }
            )


if __name__ == "__main__":
    unittest.main()
