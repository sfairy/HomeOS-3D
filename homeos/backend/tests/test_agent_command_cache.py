"""指令缓存（学习式 ``原话 → 工具``）的正确性回归。

背景：缓存命中会**直接执行工具、跳过 LLM**，所以一条错的学习结果等于「用户说了 A，
系统去动 B」。这里锁住四条口径：

1. 规范化只剔语气词，作用域 / 幅度词必须留在 key 里（``关掉全部灯`` ≠ ``关掉灯``）；
2. 同一句话学到两组不同参数时丢缓存并短期封禁，绝不后写覆盖先写；
3. 参数里的绝对数字若不在原话里（从设备当前值推出来的），不学习；
4. 命中是热路径：命中计数按间隔抽样落库，不是每次命中都写一次库。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.agent.memory.command_cache import (
    HIT_PERSIST_EVERY,
    CommandCacheService,
)


class NormalizeTest(unittest.TestCase):
    def test_scope_words_survive_normalization(self) -> None:
        cache = CommandCacheService()
        pairs = [
            ("关掉全部灯", "关掉灯"),
            ("关掉所有灯", "关掉灯"),
            ("把灯都关掉", "把灯关掉"),
            ("调亮一点", "调亮"),
            ("打开整个房间的灯", "打开房间的灯"),
        ]
        for left, right in pairs:
            with self.subTest(left=left, right=right):
                self.assertNotEqual(cache.normalize(left), cache.normalize(right))

    def test_filler_words_still_collapse(self) -> None:
        cache = CommandCacheService()
        self.assertEqual(cache.normalize("帮我把客厅的灯打开一下"), cache.normalize("帮我把客厅灯打开"))

    def test_scope_variants_get_independent_entries(self) -> None:
        cache = CommandCacheService()
        cache.set("关掉全部灯", "turn_off", {"all": True}, True)
        cache.set("关掉灯", "turn_off", {"entity": "light.living"}, True)
        self.assertEqual(cache.get("关掉全部灯").tool_args, {"all": True})
        self.assertEqual(cache.get("关掉灯").tool_args, {"entity": "light.living"})


class ReplayabilityTest(unittest.TestCase):
    def test_inferred_absolute_number_is_not_learned(self) -> None:
        """``调亮一点`` → brightness=70 是「当前 60 + 10」，重放会把灯硬拉回 70。"""
        cache = CommandCacheService()
        cache.set("调亮一点", "set_brightness", {"brightness": 70}, True)
        self.assertIsNone(cache.get("调亮一点"))
        self.assertEqual(cache.size, 0)

    def test_explicit_number_is_learned(self) -> None:
        cache = CommandCacheService()
        cache.set("把亮度调到70", "set_brightness", {"brightness": 70}, True)
        self.assertIsNotNone(cache.get("把亮度调到70"))

    def test_relative_delta_is_learnable(self) -> None:
        cache = CommandCacheService()
        cache.set("调亮一点", "set_brightness", {"brightnessDelta": 10}, True)
        self.assertIsNotNone(cache.get("调亮一点"))

    def test_non_numeric_args_are_learnable(self) -> None:
        cache = CommandCacheService()
        cache.set("打开客厅灯", "turn_on", {"entity": "light.living"}, True)
        self.assertIsNotNone(cache.get("打开客厅灯"))


class ConflictTest(unittest.TestCase):
    def test_same_utterance_with_different_args_is_banned_not_overwritten(self) -> None:
        cache = CommandCacheService()
        cache.set("开灯", "turn_on", {"entity": "light.a"}, True)
        cache.set("开灯", "turn_on", {"entity": "light.b"}, True)
        # 两组参数都不可信：既不能保留旧的，也不能采纳新的
        self.assertIsNone(cache.get("开灯"))
        self.assertEqual(cache.size, 0)

    def test_ban_is_lifted_by_delete(self) -> None:
        cache = CommandCacheService()
        cache.set("开灯", "turn_on", {"entity": "light.a"}, True)
        cache.set("开灯", "turn_on", {"entity": "light.b"}, True)
        cache.delete("开灯")
        cache.set("开灯", "turn_on", {"entity": "light.c"}, True)
        self.assertEqual(cache.get("开灯").tool_args, {"entity": "light.c"})

    def test_same_utterance_same_args_is_confirmed_not_banned(self) -> None:
        cache = CommandCacheService()
        cache.set("开灯", "turn_on", {"entity": "light.a"}, False)
        cache.set("开灯", "turn_on", {"entity": "light.a"}, False)
        entry = cache.get("开灯")
        self.assertTrue(entry.confirmed)
        self.assertEqual(entry.tool_args, {"entity": "light.a"})


class HitPersistTest(unittest.TestCase):
    def test_hits_are_persisted_on_interval_not_per_hit(self) -> None:
        cache = CommandCacheService()
        cache.set("开灯", "turn_on", {"entity": "light.a"}, True)
        with patch.object(cache, "_persist") as persist:
            for _ in range(HIT_PERSIST_EVERY):
                cache.get("开灯")
        # 恰好每 HIT_PERSIST_EVERY 次命中写一次库（0 次或 1 次都算失败）
        self.assertEqual(persist.call_count, 1)


if __name__ == "__main__":
    unittest.main()
