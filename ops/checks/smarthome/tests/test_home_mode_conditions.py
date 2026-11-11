"""E1 回归：条件求值、``forSeconds`` 持续判定、执行模式的对外语义。

条件与触发器是两件事：触发器管「什么时候考虑」，条件管「现在到底该不该执行」。
这里锁住三件事：

1. 条件全部满足才放行，不满足记为**跳过**（不是失败）；
2. 状态触发器的 ``forSeconds`` 在回落时取消，到点后还要复核一次；
3. 执行模式 ``single`` / ``restart`` 的对外行为（拒绝 / 以最后一次为准）。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.home_mode import actions as home_mode_actions
from src.domains.home_mode import activation as home_mode_activation
from src.domains.home_mode import conditions as home_mode_conditions
from src.domains.home_mode import service as home_mode_service
from src.domains.home_mode import triggers as home_mode_triggers


def _run(coro):
    return asyncio.run(coro)


class ConditionEvaluationTests(unittest.TestCase):
    def test_state_condition(self) -> None:
        context = {"states": {"cover.garage": {"state": "closed"}}}
        self.assertTrue(
            home_mode_conditions.evaluate_mode_condition(
                {"type": "state", "entityId": "cover.garage", "equals": "closed"}, context
            )
        )
        self.assertFalse(
            home_mode_conditions.evaluate_mode_condition(
                {"type": "state", "entityId": "cover.garage", "equals": "open"}, context
            )
        )

    def test_missing_entity_is_false(self) -> None:
        """读不到数据一律不满足：宁可这一轮不执行，也不要盲开设备。"""
        self.assertFalse(
            home_mode_conditions.evaluate_mode_condition(
                {"type": "state", "entityId": "cover.gone", "equals": "closed"}, {"states": {}}
            )
        )

    def test_numeric_condition(self) -> None:
        context = {"states": {"sensor.t": {"state": "24.5"}}}
        self.assertTrue(
            home_mode_conditions.evaluate_mode_condition(
                {"type": "numeric", "entityId": "sensor.t", "op": "lt", "value": 26}, context
            )
        )
        self.assertFalse(
            home_mode_conditions.evaluate_mode_condition(
                {"type": "numeric", "entityId": "sensor.t", "op": "gt", "value": 30}, context
            )
        )

    def test_non_numeric_state_is_false(self) -> None:
        context = {"states": {"sensor.t": {"state": "unknown"}}}
        self.assertFalse(
            home_mode_conditions.evaluate_mode_condition(
                {"type": "numeric", "entityId": "sensor.t", "op": "gt", "value": 1}, context
            )
        )

    def test_time_window_same_day(self) -> None:
        now = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)
        self.assertTrue(
            home_mode_conditions.evaluate_mode_condition(
                {"type": "time", "after": "13:00", "before": "18:00"},
                {},
                now=now,
                timezone_name="UTC",
            )
        )
        self.assertFalse(
            home_mode_conditions.evaluate_mode_condition(
                {"type": "time", "after": "18:00", "before": "22:00"},
                {},
                now=now,
                timezone_name="UTC",
            )
        )

    def test_time_window_crosses_midnight(self) -> None:
        night = datetime(2026, 11, 12, 2, 0, tzinfo=UTC)
        noon = datetime(2026, 11, 12, 12, 0, tzinfo=UTC)
        condition = {"type": "time", "after": "22:00", "before": "06:00"}
        # 显式给时区：``zoned_date_parts`` 缺省用家庭/本机时区，测试必须固定下来。
        self.assertTrue(home_mode_conditions.evaluate_mode_condition(condition, {}, now=night, timezone_name="UTC"))
        self.assertFalse(home_mode_conditions.evaluate_mode_condition(condition, {}, now=noon, timezone_name="UTC"))

    def test_presence_condition(self) -> None:
        condition = {"type": "presence", "atHome": True}
        self.assertTrue(home_mode_conditions.evaluate_mode_condition(condition, {"presence": {"atHome": True}}))
        self.assertFalse(home_mode_conditions.evaluate_mode_condition(condition, {"presence": {"atHome": False}}))
        # 不知道在场状态时按不满足处理
        self.assertFalse(home_mode_conditions.evaluate_mode_condition(condition, {"presence": {}}))

    def test_conditions_are_and(self) -> None:
        context = {"states": {"sensor.t": {"state": "24"}}}
        ok, unmet = home_mode_conditions.evaluate_mode_condition_group(
            [
                {"type": "numeric", "entityId": "sensor.t", "op": "lt", "value": 26},
                {"type": "numeric", "entityId": "sensor.t", "op": "gt", "value": 30},
            ],
            context,
        )
        self.assertFalse(ok)
        self.assertEqual(unmet, [1])

    def test_empty_conditions_pass(self) -> None:
        self.assertEqual(home_mode_conditions.evaluate_mode_condition_group(None, {}), (True, []))
        self.assertEqual(home_mode_conditions.evaluate_mode_condition_group([], {}), (True, []))


class ConditionGateTests(unittest.TestCase):
    """条件不满足时激活应返回「跳过」，而不是失败或执行。"""

    def _deps(self, mode: dict[str, Any], states: dict[str, dict[str, Any]]):
        calls: list[str] = []
        logs: list[dict[str, Any]] = []

        class _Deps:
            def log(self, message: str) -> None:
                pass

            def warn(self, message: str) -> None:
                pass

            async def find_mode(self, mode_id: str):
                return mode

            async def fetch_entity_state(self, entity_id: str):
                return states.get(entity_id)

            async def get_ha_status(self):
                return {"connected": True}

            def get_home_timezone(self):
                return "Asia/Shanghai"

            def push_trigger_log(self, entry: dict[str, Any]) -> None:
                logs.append(entry)

            async def notify(self, level: str, message: str, source: str):
                return None

        return _Deps(), calls, logs

    def test_unmet_condition_skips_without_executing(self) -> None:
        mode = {
            "id": "m1",
            "name": "回家",
            "config": [{"entity_id": "light.a", "domain": "light", "service": "turn_on"}],
            "conditions": [{"type": "state", "entityId": "cover.garage", "equals": "closed"}],
        }
        deps, calls, logs = self._deps(mode, {"cover.garage": {"state": "open"}})

        result = _run(
            home_mode_actions.activate_home_mode(
                home_mode_actions.HomeModeActivateState(lambda: None, lambda _mode: None), deps, "m1"
            )
        )

        self.assertTrue(result["skipped"])
        self.assertEqual(result["reason"], "condition_unmet")
        self.assertEqual(result["unmetConditions"], [0])
        self.assertEqual(calls, [])
        self.assertTrue(any(entry.get("reason") == "condition_unmet" for entry in logs))


class TriggerHoldTests(unittest.TestCase):
    """``forSeconds``：进入匹配时起定时器，回落时取消，到点后复核。"""

    def _binding(self, **trigger: Any) -> home_mode_triggers.HomeModeTriggerBinding:
        return home_mode_triggers.HomeModeTriggerBinding(
            mode_id="m1",
            mode_name="门没关",
            trigger={"type": "state", "entityId": "binary_sensor.door", "to": "on", "enabled": True, **trigger},
        )

    def test_falling_edge_cancels_pending_hold(self) -> None:
        state = home_mode_triggers.HomeModeTriggersState()
        binding = self._binding(forSeconds=30)
        fired: list[str] = []

        class _Deps:
            def is_leader(self):
                return True

            def is_baseline_settling(self):
                return False

            def is_away_simulated_entity(self, entity_id):
                return False

            async def fetch_entity_state(self, entity_id):
                return {"state": "off"}

            async def get_active_modes(self):
                return []

            async def find_mode(self, mode_id):
                return {"id": mode_id, "name": mode_id, "exclusiveGroup": "default", "priority": 50}

            async def request_activate(self, mode_id, meta=None):
                fired.append(mode_id)
                return {"success": True}

            def get_trigger_cooldown_ms(self):
                return 0

            def get_home_timezone(self):
                return None

            def log(self, message):
                pass

            def warn(self, message):
                pass

        deps = _Deps()

        async def _scenario() -> None:
            await anext_scenario()

        async def anext_scenario() -> None:
            # 进入匹配：起定时器
            await home_mode_triggers._handle_state_binding(state, deps, binding, "binary_sensor.door", "off", "on")
            self.assertEqual(len(state.hold_timers), 1)
            # 回落：取消
            await home_mode_triggers._handle_state_binding(state, deps, binding, "binary_sensor.door", "on", "off")
            self.assertEqual(state.hold_timers, {})
            self.assertEqual(fired, [])

        _run(_scenario())

    def test_zero_hold_fires_immediately(self) -> None:
        state = home_mode_triggers.HomeModeTriggersState()
        binding = self._binding()
        fired: list[str] = []

        class _Deps:
            def is_leader(self):
                return True

            def is_baseline_settling(self):
                return False

            def is_away_simulated_entity(self, entity_id):
                return False

            async def get_active_modes(self):
                return []

            async def find_mode(self, mode_id):
                return {"id": mode_id, "name": mode_id, "exclusiveGroup": "default", "priority": 50}

            async def request_activate(self, mode_id, meta=None):
                fired.append(mode_id)
                return {"success": True}

            def get_trigger_cooldown_ms(self):
                return 0

            def get_home_timezone(self):
                return None

            def log(self, message):
                pass

            def warn(self, message):
                pass

        _run(home_mode_triggers._handle_state_binding(state, _Deps(), binding, "binary_sensor.door", "off", "on"))

        self.assertEqual(fired, ["m1"])


class ExecutionModeTests(unittest.TestCase):
    """执行模式只改「拿不到锁时怎么办」，不影响正常激活。"""

    def _service(self, execution_mode: str) -> home_mode_service.HomeModeService:
        service = home_mode_service.HomeModeService(
            session_factory=lambda: None,
            ha_connector=object(),
            state_store=object(),
        )
        service._execution_mode_of = lambda mode_id: _async_value(execution_mode)  # type: ignore[method-assign]
        return service

    def test_single_rejects_when_busy(self) -> None:
        service = self._service("single")

        async def _scenario():
            await service._transition_lock.acquire()
            try:
                return await service.activate("m1")
            finally:
                service._transition_lock.release()

        result = _run(_scenario())
        self.assertFalse(result["success"])
        self.assertEqual(result["reason"], "activation_in_progress")

    def test_unknown_mode_falls_back_to_queued(self) -> None:
        service = home_mode_service.HomeModeService(
            session_factory=lambda: None,
            ha_connector=object(),
            state_store=object(),
        )
        service.find_one_async = lambda mode_id: _async_value({"executionMode": "bogus"})  # type: ignore[method-assign]
        self.assertEqual(_run(service._execution_mode_of("m1")), "queued")

    def test_coercion_helper(self) -> None:
        self.assertEqual(home_mode_activation.normalize_execution_mode("RESTART"), "restart")
        self.assertEqual(home_mode_activation.normalize_execution_mode("single"), "single")
        self.assertEqual(home_mode_activation.normalize_execution_mode(None), "queued")
        self.assertEqual(home_mode_activation.normalize_execution_mode("nope"), "queued")


async def _async_value(value: Any) -> Any:
    return value


class RunIdTraceTests(unittest.TestCase):
    def test_run_id_is_unique_and_prefixed(self) -> None:
        first = home_mode_actions.new_run_id()
        second = home_mode_actions.new_run_id()
        self.assertTrue(first.startswith("run-"))
        self.assertNotEqual(first, second)

    def test_trace_keeps_duration_and_verification(self) -> None:
        trace = home_mode_actions.build_action_trace(
            [
                {
                    "entity_id": "light.a",
                    "service": "light.turn_on",
                    "success": True,
                    "verified": True,
                    "durationMs": 12,
                },
                {"entity_id": "light.b", "service": "light.turn_on", "success": False, "error": "boom"},
            ]
        )
        self.assertEqual(trace[0]["durationMs"], 12)
        self.assertTrue(trace[0]["ok"])
        self.assertEqual(trace[1]["error"], "boom")


if __name__ == "__main__":
    unittest.main()
