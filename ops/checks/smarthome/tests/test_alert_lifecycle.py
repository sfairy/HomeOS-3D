"""E2 生命周期回归：未确认抑制、恢复通知、升级、确认。

这三件事都不属于「冷却」：冷却只管「多久内别再发」，而这里管的是
「发出去之后这条告警处于什么状态」。

时间通过替换 ``alerts.lifecycle._now`` 推进（不影响 asyncio 时钟）。
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

from src.domains.alerts import lifecycle as lifecycle_module
from src.domains.alerts.lifecycle import AlertLifecycle
from src.domains.ha.config.ha_filters import AlertRuleWatchIndex
from src.domains.notification import rules as notification_rules


def _run(coro):
    return asyncio.run(coro)


class _Clock:
    def __init__(self, start: float = 1000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now


class LifecycleStateTests(unittest.TestCase):
    def test_open_then_suppress_until_acknowledged(self) -> None:
        book = AlertLifecycle()
        book.open_alert(rule_key="r1", entity_id="s.t", level="warn", message="m", channels=["in_app"])

        self.assertTrue(book.is_open_unacked("r1:s.t"))
        self.assertTrue(book.acknowledge("r1", "s.t"))
        self.assertFalse(book.is_open_unacked("r1:s.t"))

    def test_reopen_keeps_original_trigger_time(self) -> None:
        clock = _Clock()
        with patch.object(lifecycle_module, "_now", clock):
            book = AlertLifecycle()
            first = book.open_alert(rule_key="r1", entity_id="s.t", level="warn", message="m", channels=[])
            clock.now += 300
            again = book.open_alert(rule_key="r1", entity_id="s.t", level="danger", message="m2", channels=[])
        self.assertIs(first, again)
        # 升级计时不能被「重复报一次」重置，否则永远升不上去。
        self.assertEqual(again.triggered_at, 1000.0)
        self.assertEqual(again.level, "danger")

    def test_resolve_removes(self) -> None:
        book = AlertLifecycle()
        book.open_alert(rule_key="r1", entity_id="s.t", level="warn", message="m", channels=[])
        alert = book.resolve("r1:s.t")
        self.assertIsNotNone(alert)
        self.assertEqual(len(book), 0)

    def test_acknowledged_alert_is_not_due(self) -> None:
        clock = _Clock()
        with patch.object(lifecycle_module, "_now", clock):
            book = AlertLifecycle()
            book.open_alert(rule_key="r1", entity_id="s.t", level="warn", message="m", channels=[])
            book.acknowledge("r1", "s.t")
            clock.now += 3600
            self.assertEqual(book.due_escalations({"r1": 10}), [])


class EscalationTests(unittest.TestCase):
    def test_due_after_threshold_and_only_once(self) -> None:
        clock = _Clock()
        with patch.object(lifecycle_module, "_now", clock):
            book = AlertLifecycle()
            book.open_alert(rule_key="r1", entity_id="s.t", level="warn", message="m", channels=[])
            clock.now += 5 * 60
            self.assertEqual(book.due_escalations({"r1": 10}), [])
            clock.now += 6 * 60
            due = book.due_escalations({"r1": 10})
            self.assertEqual(len(due), 1)
            # 再查不会重复升级
            clock.now += 60
            self.assertEqual(book.due_escalations({"r1": 10}), [])

    def test_zero_threshold_never_escalates(self) -> None:
        clock = _Clock()
        with patch.object(lifecycle_module, "_now", clock):
            book = AlertLifecycle()
            book.open_alert(rule_key="r1", entity_id="s.t", level="warn", message="m", channels=[])
            clock.now += 10_000
            self.assertEqual(book.due_escalations({"r1": 0}), [])


class RuleIntegrationTests(unittest.TestCase):
    """规则求值 → 生命周期 → 恢复通知 的整链。"""

    def _helper(self) -> Any:
        helper = notification_rules.NotificationRulesHelper(
            session_factory=lambda: None,
            alert_rule_watch_index=AlertRuleWatchIndex(),
            is_dnd_active=lambda: False,
            is_alert_bypass_dnd=lambda: True,
            is_in_cooldown=lambda key: False,
            set_cooldown=lambda key, minutes: None,
            notify=AsyncMock(return_value={"id": "n1"}),
        )
        helper.rules_cache = [
            {
                "id": "r1",
                "entityId": "sensor.t",
                "condition": "value > 30",
                "level": "warn",
                "enabled": True,
                "channels": [],
            }
        ]
        return helper

    def test_open_alert_is_registered_after_successful_notify(self) -> None:
        helper = self._helper()
        _run(helper.evaluate_rules("sensor.t", "31", {}))
        self.assertTrue(helper.lifecycle.is_open_unacked("r1:sensor.t"))

    def test_repeat_match_is_suppressed_even_without_cooldown(self) -> None:
        """冷却被设成 0（等价「无冷却」）时，未确认抑制仍然挡住重复推送。"""
        helper = self._helper()
        _run(helper.evaluate_rules("sensor.t", "31", {}))
        # 手动清掉边沿锁存，模拟「状态又跳到 31」（例如 31→29→31 且去抖为 0）
        helper._match_state["r1:sensor.t"] = False
        _run(helper.evaluate_rules("sensor.t", "31", {}))
        # 只有第一次触发过
        messages = [str(call.args[1]) for call in helper._notify.await_args_list]
        self.assertEqual(len([m for m in messages if not m.startswith("已恢复：")]), 1)

    def test_resolve_sends_recovery_notice(self) -> None:
        helper = self._helper()
        _run(helper.evaluate_rules("sensor.t", "31", {}))
        _run(helper.evaluate_rules("sensor.t", "20", {}))
        messages = [str(call.args[1]) for call in helper._notify.await_args_list]
        self.assertTrue(any(m.startswith("已恢复：") for m in messages))

    def test_acknowledged_alert_skips_recovery_notice(self) -> None:
        helper = self._helper()
        _run(helper.evaluate_rules("sensor.t", "31", {}))
        helper.acknowledge("r1", "sensor.t")
        _run(helper.evaluate_rules("sensor.t", "20", {}))
        messages = [str(call.args[1]) for call in helper._notify.await_args_list]
        self.assertFalse(any(m.startswith("已恢复：") for m in messages))

    def test_escalation_notifies_with_danger_level(self) -> None:
        clock = _Clock()
        helper = self._helper()
        helper.rules_cache[0]["escalationMinutes"] = 10
        with patch.object(lifecycle_module, "_now", clock):
            _run(helper.evaluate_rules("sensor.t", "31", {}))
            clock.now += 11 * 60
            escalated = _run(helper.run_escalations())
        self.assertEqual(escalated, 1)
        last = helper._notify.await_args_list[-1]
        self.assertEqual(last.args[0], "danger")
        self.assertTrue(str(last.args[1]).startswith("仍未处理："))
        # 升级需要穿透免打扰（否则「用户没看到」这条补救手段自己会被静音）
        self.assertTrue(last.args[4].get("bypassDnd"))


if __name__ == "__main__":
    unittest.main()
