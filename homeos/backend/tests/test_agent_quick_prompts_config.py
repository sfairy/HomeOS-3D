"""``ui.agentQuickPrompts``（智能管家快捷指令）的默认值与校验回归。

快捷指令以前是前端编译期常量，两处面板各写一套文案；下沉到 ``ui`` 分区后它变成
**可被导入 / 手改接口绕过的用户数据**，因此这里锁三件事：

1. 默认值与前端内置清单同口径（6 条、各支柱一条、标签短到塞得进窄栏）；
2. 合法输入不被拦（含 ``[]`` —— 它是「关掉这排入口」，不是「没配置」）；
3. 脏数据在入口处就被拦下，而不是存进库、到渲染时才崩。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.app_config.defaults import DEFAULT_APP_CONFIG
from src.domains.app_config.validate import AppConfigValidationError, validate_app_config_section

#: 与 ``sections_ui.AGENT_QUICK_PROMPT_*`` / 前端 ``AGENT_QUICK_PROMPT_LIMITS`` 同值
_MAX_ITEMS = 12
_MAX_LABEL = 12
_MAX_PROMPT = 120


def _valid_item(label: str = "全关所有灯", prompt: str = "把家里所有开着的灯都关掉") -> dict[str, str]:
    return {"label": label, "prompt": prompt, "hint": "灯光：一键关闭全屋照明"}


class DefaultAgentQuickPromptsTest(unittest.TestCase):
    def test_default_list_covers_every_pillar(self) -> None:
        prompts = DEFAULT_APP_CONFIG["ui"]["agentQuickPrompts"]
        self.assertEqual(len(prompts), 6, "默认清单应为 6 条，正好覆盖一个智能家居支柱")
        self.assertEqual(
            len({item["prompt"] for item in prompts}),
            len(prompts),
            "默认清单里不能有重复指令",
        )
        for item in prompts:
            with self.subTest(label=item["label"]):
                self.assertTrue(item["label"].strip())
                self.assertTrue(item["prompt"].strip())
                self.assertLessEqual(len(item["label"]), _MAX_LABEL)
                self.assertLessEqual(len(item["prompt"]), _MAX_PROMPT)
                self.assertTrue(item.get("hint", "").strip(), "缺少悬浮说明")

    def test_default_list_passes_its_own_validator(self) -> None:
        validate_app_config_section("ui", {"agentQuickPrompts": DEFAULT_APP_CONFIG["ui"]["agentQuickPrompts"]})


class AgentQuickPromptsValidationTest(unittest.TestCase):
    def _assert_rejected(self, value: object) -> None:
        with self.assertRaises(AppConfigValidationError):
            validate_app_config_section("ui", {"agentQuickPrompts": value})

    def test_accepts_custom_list(self) -> None:
        validate_app_config_section(
            "ui",
            {"agentQuickPrompts": [_valid_item("开客厅灯", "打开客厅的灯")]},
        )

    def test_empty_list_is_valid_not_missing(self) -> None:
        # 用户清空清单是明确操作：存空数组 = 不要这排按钮，必须能存下去
        validate_app_config_section("ui", {"agentQuickPrompts": []})

    def test_rejects_non_list(self) -> None:
        for value in (None, {}, "全关所有灯", 3):
            with self.subTest(value=value):
                self._assert_rejected(value)

    def test_rejects_non_object_item(self) -> None:
        self._assert_rejected(["全关所有灯"])

    def test_rejects_blank_label_or_prompt(self) -> None:
        self._assert_rejected([{**_valid_item(), "label": "  "}])
        self._assert_rejected([{**_valid_item(), "prompt": ""}])

    def test_rejects_overlong_label_and_prompt(self) -> None:
        self._assert_rejected([_valid_item(label="开" * (_MAX_LABEL + 1))])
        self._assert_rejected([_valid_item(prompt="关" * (_MAX_PROMPT + 1))])

    def test_rejects_duplicate_prompt(self) -> None:
        # 两条一样的指令只是占位，用户点了也分不清
        self._assert_rejected([_valid_item(), _valid_item(label="关所有灯")])

    def test_rejects_too_many_items(self) -> None:
        items = [_valid_item(label=f"指令{i}", prompt=f"第{i}条指令") for i in range(_MAX_ITEMS)]
        validate_app_config_section("ui", {"agentQuickPrompts": items})
        self._assert_rejected([*items, _valid_item(label="额外", prompt="额外指令")])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
