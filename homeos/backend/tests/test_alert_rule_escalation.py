"""告警规则 escalationMinutes 单位回归。

历史缺陷：``escalation_minutes`` 是「分钟」，但更新路径按「秒」解析后除以 60、
运行侧又除一次 60，创建路径干脆不写这一列。后果是「60 分钟」存成 1 并在约 1 秒后
以 danger 级升级，「30 分钟」存成 0（等于永不升级）。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.alerts import lifecycle as lifecycle_module
from src.domains.alerts.lifecycle import AlertLifecycle
from src.domains.notification.rules import (
    _RULE_FIELD_APPLIERS,
    _escalation_minutes,
    _rule_row,
)


class EscalationMinutesUnitTest(unittest.TestCase):
    def test_helper_keeps_minutes_untouched(self) -> None:
        self.assertEqual(_escalation_minutes(60), 60)
        self.assertEqual(_escalation_minutes(30), 30)
        self.assertEqual(_escalation_minutes("15"), 15)
        self.assertEqual(_escalation_minutes(None), 0)
        self.assertEqual(_escalation_minutes(-5), 0)
        self.assertEqual(_escalation_minutes(True), 0)

    def test_update_applier_does_not_divide(self) -> None:
        class Row:
            escalation_minutes = 0

        _RULE_FIELD_APPLIERS["escalationMinutes"](Row, 60)
        self.assertEqual(Row.escalation_minutes, 60)
        _RULE_FIELD_APPLIERS["escalationMinutes"](Row, 90)
        self.assertEqual(Row.escalation_minutes, 90)

    def test_row_view_returns_minutes(self) -> None:
        class Record:
            id = "r1"
            name = "大门未关"
            entity_id = "binary_sensor.door"
            condition = "== on"
            level = "warn"
            channels = "[]"
            cooldown_minutes = 5
            enabled = True
            message_template = None
            title = None
            for_seconds = 0
            clear_delay_seconds = 0
            escalation_minutes = 60

        self.assertEqual(_rule_row(Record())["escalationMinutes"], 60)  # type: ignore[arg-type]


class EscalationTimingTest(unittest.TestCase):
    def __init__(self, methodName: str = "runTest") -> None:
        # 实例属性在 ``__init__`` 里建：unittest 每个方法一个新实例，天然隔离；
        # 只在 ``setUp`` 里赋值会被 basedpyright 判成「未初始化实例变量」。
        super().__init__(methodName)
        self.lifecycle = AlertLifecycle()

    def setUp(self) -> None:
        self.lifecycle.open_alert(
            rule_key="r1",
            entity_id="binary_sensor.door",
            level="warn",
            message="大门未关",
            channels=["in_app"],
            title="",
        )

    def test_sixty_minutes_does_not_escalate_immediately(self) -> None:
        self.assertEqual(self.lifecycle.due_escalations({"r1": 60}), [])

    def test_zero_minutes_never_escalates(self) -> None:
        self.assertEqual(self.lifecycle.due_escalations({"r1": 0}), [])

    def test_due_after_window_and_only_once(self) -> None:
        original = lifecycle_module._now
        base = original()
        lifecycle_module._now = lambda: base + 61 * 60
        try:
            first = self.lifecycle.due_escalations({"r1": 60})
            self.assertEqual(len(first), 1)
            # 已升级不再重复
            self.assertEqual(self.lifecycle.due_escalations({"r1": 60}), [])
        finally:
            lifecycle_module._now = original


if __name__ == "__main__":
    unittest.main()
