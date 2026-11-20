"""逐灯「长按打开弹窗」的字段契约（0.8.8）。

上游 `config.py` 的灯光白名单同时加了 `longPressOpensPanel` 与 `longPressSeconds`，
其中后者还进了 `flag_fields` 与数值区间。三处必须同时生效：

- 只加白名单不加 `flag_fields` → 布尔值不校验，字符串 `"yes"` 能混进文档；
- 只加白名单不加区间 → `longPressSeconds: 999` 会被接受，运行时永远不触发；
- 只加前端不改后端 → 保存时整份配置 422（本项目 `has_only` 严格拒未知键）。

所以这里直接锁声明表，任何一处被删都会红。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.modules.interaction3d.config_sections_lights import (
    LIGHT_FIELDS,
    LIGHT_NUMBER_BOUNDS,
    LIGHT_RULES,
)


class LightLongPressContractTest(unittest.TestCase):
    def test_allowed_fields_include_long_press(self) -> None:
        self.assertIn("longPressOpensPanel", LIGHT_FIELDS)
        self.assertIn("longPressSeconds", LIGHT_FIELDS)

    def test_seconds_bounds_match_frontend(self) -> None:
        bounds = {key: (low, high) for key, low, high in LIGHT_NUMBER_BOUNDS}
        self.assertEqual(bounds.get("longPressSeconds"), (0.3, 1.5))
        # 既有字段不能被顺手删掉。
        self.assertEqual(bounds.get("fadeDuration"), (0, 10))

    def test_toggle_is_a_flag_field(self) -> None:
        # flag_fields 决定「出现时必须是布尔」；漏了它 `longPressOpensPanel: "yes"` 会通过。
        self.assertIn("longPressOpensPanel", LIGHT_RULES.flag_fields)
        self.assertIn("hiddenClickable", LIGHT_RULES.flag_fields)

    def test_unknown_keys_still_rejected(self) -> None:
        # 白名单扩了两个键，但整体仍是白名单语义：别的未知键照样拒。
        self.assertNotIn("longPressSecondsExtra", LIGHT_FIELDS)


if __name__ == "__main__":
    unittest.main()
