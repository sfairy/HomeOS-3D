"""分主题基础光照与「额外公开访问来源」的契约回归。

两条都是 0.8.7 新增的**外部输入**：写错的区间或写错的来源地址不该在运行期悄悄降级，
而应在启动 / 保存时就以中文原因拒绝。这里覆盖边界与拒绝分支。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.studio3d.lighting import (
    BASE_LIGHTING_BOUNDS,
    LIGHTING_THEMES,
    valid_base_lighting,
    valid_base_lighting_by_theme,
)
from src.domains.studio3d.service import validate_base_lighting_by_theme
from src.platform.security.request_origin import parse_origin


class BaseLightingContractTest(unittest.TestCase):
    def test_accepts_single_value_within_bounds(self) -> None:
        self.assertTrue(valid_base_lighting({"exposure": 1.2}))

    def test_accepts_every_bound_edge(self) -> None:
        for key, (low, high) in BASE_LIGHTING_BOUNDS.items():
            with self.subTest(key=key):
                self.assertTrue(valid_base_lighting({key: low}))
                self.assertTrue(valid_base_lighting({key: high}))

    def test_rejects_out_of_range_and_unknown_keys(self) -> None:
        self.assertFalse(valid_base_lighting({"exposure": 9}))
        self.assertFalse(valid_base_lighting({"nope": 1}))
        self.assertFalse(valid_base_lighting({}))
        self.assertFalse(valid_base_lighting(None))

    def test_rejects_bool_as_number(self) -> None:
        # bool 是 int 的子类：True 不能当成 1 混过区间判定。
        self.assertFalse(valid_base_lighting({"exposure": True}))

    def test_by_theme_accepts_known_themes_only(self) -> None:
        self.assertTrue(valid_base_lighting_by_theme({}))
        self.assertTrue(valid_base_lighting_by_theme({"natural-wood": {"exposure": 1}}))
        self.assertFalse(valid_base_lighting_by_theme({"unknown": {"exposure": 1}}))
        self.assertEqual(LIGHTING_THEMES, {"default", "warm-wood", "natural-wood"})

    def test_service_rejects_invalid_scene_lighting(self) -> None:
        validate_base_lighting_by_theme({"settings": {}})  # 无关场景直接放行
        with self.assertRaises(Exception) as caught:
            validate_base_lighting_by_theme({"baseLightingByTheme": {"default": {"exposure": 99}}})
        self.assertEqual(getattr(caught.exception, "status_code", None), 422)


class ParseOriginTest(unittest.TestCase):
    def test_accepts_complete_origin(self) -> None:
        self.assertEqual(parse_origin("https://home.example.com:8443"), ("https", "home.example.com", 8443))
        self.assertEqual(parse_origin("http://192.168.1.20:8801"), ("http", "192.168.1.20", 8801))

    def test_defaults_port_by_scheme(self) -> None:
        self.assertEqual(parse_origin("https://home.example.com"), ("https", "home.example.com", 443))

    def test_rejects_path_query_list_and_credentials(self) -> None:
        for value in (
            "https://home.example.com/path",
            "https://home.example.com?x=1",
            "https://a.example.com,https://b.example.com",
            "https://user:pass@home.example.com",
            "ftp://home.example.com",
            "",
        ):
            with self.subTest(value=value):
                self.assertIsNone(parse_origin(value))

    def test_rejects_out_of_range_port(self) -> None:
        self.assertIsNone(parse_origin("https://home.example.com:99999"))


if __name__ == "__main__":
    unittest.main()
