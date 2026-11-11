"""E2 回归：告警的持续判定（``forSeconds``）与回落去抖（``clearDelaySeconds``）。

两列都是「0 = 旧行为」，所以这里同时锁住：

- 抖动（成立/不成立反复切换）不会触发；
- 持续成立满时长后触发一次；
- 回落去抖期内不解除锁存，因此不会重复告警。

时间通过替换 ``rules._monotonic`` 推进 —— **不能**去补丁 ``time.monotonic``：那是全局
模块，asyncio 的事件循环也用它，补丁会让事件循环时钟跟着跳。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.ha.config.ha_filters import AlertRuleWatchIndex
from src.domains.notification import rules as notification_rules
from src.platform.core.runtime.params import non_negative_seconds


def _run(coro):
    return asyncio.run(coro)


class _Clock:
    """可推进的单调时钟替身（只替换 ``rules._monotonic``，不影响 asyncio）。"""

    def __init__(self, start: float = 1000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def _trigger_notifications(helper: Any) -> list[str]:
    """只取「触发」类通知（排除 ``已恢复：`` 的恢复通知）。"""
    out: list[str] = []
    for call in helper._notify.await_args_list:  # type: ignore[attr-defined]
        message = str(call.args[1]) if len(call.args) > 1 else ""
        if not message.startswith("已恢复："):
            out.append(message)
    return out


def _helper() -> Any:
    return notification_rules.NotificationRulesHelper(
        session_factory=lambda: None,
        alert_rule_watch_index=AlertRuleWatchIndex(),
        is_dnd_active=lambda: False,
        is_alert_bypass_dnd=lambda: True,
        is_in_cooldown=lambda key: False,
        set_cooldown=lambda key, minutes: None,
        notify=AsyncMock(),
    )


def _rule(**overrides: Any) -> dict[str, Any]:
    rule = {
        "id": "r1",
        "entityId": "sensor.t",
        "condition": "value > 30",
        "level": "warn",
        "enabled": True,
        "channels": [],
    }
    rule.update(overrides)
    return rule


class ForSecondsTests(unittest.TestCase):
    def test_flapping_never_fires(self) -> None:
        helper = _helper()
        helper.rules_cache = [_rule(forSeconds=60)]
        clock = _Clock()

        with patch.object(notification_rules, "_monotonic", clock):
            _run(helper.evaluate_rules("sensor.t", "31", {}))
            clock.advance(30)
            _run(helper.evaluate_rules("sensor.t", "20", {}))  # 回落：清掉起点
            clock.advance(10)
            _run(helper.evaluate_rules("sensor.t", "31", {}))  # 重新计时
            clock.advance(40)
            _run(helper.evaluate_rules("sensor.t", "31", {}))  # 只累计 40s

        helper._notify.assert_not_awaited()  # type: ignore[attr-defined]

    def test_sustained_match_fires_once(self) -> None:
        helper = _helper()
        helper.rules_cache = [_rule(forSeconds=60)]
        clock = _Clock()

        with patch.object(notification_rules, "_monotonic", clock):
            _run(helper.evaluate_rules("sensor.t", "31", {}))  # 起点
            clock.advance(61)
            _run(helper.evaluate_rules("sensor.t", "31", {}))  # 满 61s → 触发
            clock.advance(30)
            _run(helper.evaluate_rules("sensor.t", "31", {}))  # 电平持续 → 不重复

        helper._notify.assert_awaited_once()  # type: ignore[attr-defined]

    def test_zero_for_seconds_fires_immediately(self) -> None:
        helper = _helper()
        helper.rules_cache = [_rule(forSeconds=0)]

        _run(helper.evaluate_rules("sensor.t", "31", {}))

        helper._notify.assert_awaited_once()  # type: ignore[attr-defined]

    def test_missing_field_defaults_to_immediate(self) -> None:
        helper = _helper()
        helper.rules_cache = [_rule()]

        _run(helper.evaluate_rules("sensor.t", "31", {}))

        helper._notify.assert_awaited_once()  # type: ignore[attr-defined]


class ClearDelayTests(unittest.TestCase):
    def test_short_dip_does_not_rearm(self) -> None:
        helper = _helper()
        helper.rules_cache = [_rule(clearDelaySeconds=120)]
        clock = _Clock()

        with patch.object(notification_rules, "_monotonic", clock):
            _run(helper.evaluate_rules("sensor.t", "31", {}))  # 首次告警
            clock.advance(10)
            _run(helper.evaluate_rules("sensor.t", "20", {}))  # 短暂回落（10s < 120s）
            clock.advance(40)
            _run(helper.evaluate_rules("sensor.t", "31", {}))  # 仍在锁存期 → 不重复

        helper._notify.assert_awaited_once()  # type: ignore[attr-defined]

    def test_long_dip_rearms(self) -> None:
        helper = _helper()
        helper.rules_cache = [_rule(clearDelaySeconds=120)]
        clock = _Clock()

        with patch.object(notification_rules, "_monotonic", clock):
            _run(helper.evaluate_rules("sensor.t", "31", {}))  # 首次告警
            clock.advance(100)
            _run(helper.evaluate_rules("sensor.t", "20", {}))  # 开始回落计时
            clock.advance(200)
            _run(helper.evaluate_rules("sensor.t", "20", {}))  # 满 200s → 解除锁存
            self.assertFalse(helper._match_state["r1:sensor.t"])
            clock.advance(100)
            _run(helper.evaluate_rules("sensor.t", "31", {}))  # 再次成立 → 第二次告警

        # 两次触发 + 一次「已恢复」：恢复通知是新行为，不能把它算成重复告警。
        self.assertEqual(len(_trigger_notifications(helper)), 2)
        self.assertEqual(helper._notify.await_count, 3)  # type: ignore[attr-defined]

    def test_zero_delay_clears_immediately(self) -> None:
        helper = _helper()
        helper.rules_cache = [_rule(clearDelaySeconds=0)]

        _run(helper.evaluate_rules("sensor.t", "31", {}))
        _run(helper.evaluate_rules("sensor.t", "20", {}))
        self.assertFalse(helper._match_state["r1:sensor.t"])
        _run(helper.evaluate_rules("sensor.t", "31", {}))
        self.assertEqual(len(_trigger_notifications(helper)), 2)


class FieldMappingTests(unittest.TestCase):
    """共享的秒数归一（两域曾各写一份，行为已收敛）。"""

    def test_seconds_parser_is_forgiving(self) -> None:
        self.assertEqual(non_negative_seconds(None), 0.0)
        self.assertEqual(non_negative_seconds("abc"), 0.0)
        self.assertEqual(non_negative_seconds(-5), 0.0)
        self.assertEqual(non_negative_seconds("30"), 30.0)


if __name__ == "__main__":
    unittest.main()
