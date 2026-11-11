"""S1 / A2 回归：冷启动与重连不得把「全量快照」当成自动化边沿。

覆盖四层防御与冷却语义：

1. 批处理载荷 ``baseline=False``（冷启动首次填充）只广播、不跑副作用；
2. ``lock_unlock`` 必须有 ``locked → unlocked`` 的真实旧态才触发；
3. HA 连接静置期内触发链整体跳过（可配置，0 关闭）；
4. 激活返回 ``success=False`` 时不消费冷却、不记 occurrence，允许宽限期内重试。
"""

from __future__ import annotations

import asyncio
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.bootstrap import ha_state_effects as ha_effects
from src.bootstrap import lifespan as lifespan_module
from src.domains.home_mode import policy as home_mode_policy
from src.domains.home_mode import service as home_mode_service
from src.domains.home_mode import triggers as home_mode_triggers


def _run(coro):
    return asyncio.run(coro)


class _FakeTriggerDeps:
    """触发器编排的窄接口（只实现被测分支真正会读的部分）。"""

    def __init__(self, *, activate_result: Any = None, settling: bool = False) -> None:
        self.activated: list[str] = []
        self.warned: list[str] = []
        self.activate_result = activate_result if activate_result is not None else {"success": True}
        self.settling = settling

    def is_leader(self) -> bool:
        return True

    def get_home_timezone(self) -> str:
        return "Asia/Shanghai"

    def get_trigger_cooldown_ms(self) -> int:
        return 60_000

    def is_baseline_settling(self) -> bool:
        return self.settling

    def is_away_simulated_entity(self, entity_id: str) -> bool:
        return False

    def log(self, message: str) -> None:
        pass

    def warn(self, message: str) -> None:
        self.warned.append(message)

    async def find_mode(self, mode_id: str):
        return {"id": mode_id, "name": mode_id, "exclusiveGroup": "default", "priority": 50}

    async def get_active_modes(self):
        return []

    async def request_activate(self, mode_id: str, meta: dict[str, Any] | None = None):
        self.activated.append(mode_id)
        return self.activate_result

    async def request_deactivate(self, mode_id: str | None = None):
        return {"success": True}


def _lock_binding(mode_id: str = "mode-home") -> home_mode_triggers.HomeModeTriggerBinding:
    return home_mode_triggers.HomeModeTriggerBinding(
        mode_id=mode_id,
        mode_name=mode_id,
        trigger={"type": "lock_unlock", "entityId": "lock.da_men", "enabled": True},
    )


def _trigger_state(*bindings) -> home_mode_triggers.HomeModeTriggersState:
    state = home_mode_triggers.HomeModeTriggersState()
    state.trigger_bindings = list(bindings or [_lock_binding()])
    return state


class LockEdgeTests(unittest.TestCase):
    def test_unlocked_without_old_state_does_not_fire(self) -> None:
        """冷启动/重连补齐没有旧态：门锁当前 unlocked 不是一次「刚开锁」。"""
        deps = _FakeTriggerDeps()
        state = _trigger_state()

        _run(
            home_mode_triggers.handle_home_mode_state_trigger(
                state,
                deps,
                {"entity_id": "lock.da_men", "old_state": None, "new_state": {"state": "unlocked"}},
            )
        )

        self.assertEqual(deps.activated, [])

    def test_locked_to_unlocked_fires(self) -> None:
        deps = _FakeTriggerDeps()
        state = _trigger_state()

        _run(
            home_mode_triggers.handle_home_mode_state_trigger(
                state,
                deps,
                {
                    "entity_id": "lock.da_men",
                    "old_state": {"state": "locked"},
                    "new_state": {"state": "unlocked"},
                },
            )
        )

        self.assertEqual(deps.activated, ["mode-home"])

    def test_settling_window_suppresses_everything(self) -> None:
        deps = _FakeTriggerDeps(settling=True)
        state = _trigger_state()

        _run(
            home_mode_triggers.handle_home_mode_state_trigger(
                state,
                deps,
                {
                    "entity_id": "lock.da_men",
                    "old_state": {"state": "locked"},
                    "new_state": {"state": "unlocked"},
                },
            )
        )

        self.assertEqual(deps.activated, [])

    def test_state_trigger_requires_old_state_when_only_to_given(self) -> None:
        deps = _FakeTriggerDeps()
        state = _trigger_state(
            home_mode_triggers.HomeModeTriggerBinding(
                mode_id="mode-x",
                mode_name="mode-x",
                trigger={"type": "state", "entityId": "binary_sensor.p", "to": "on", "enabled": True},
            )
        )

        _run(
            home_mode_triggers.handle_home_mode_state_trigger(
                state,
                deps,
                {"entity_id": "binary_sensor.p", "old_state": None, "new_state": {"state": "on"}},
            )
        )

        self.assertEqual(deps.activated, [])


class CooldownTests(unittest.TestCase):
    def test_failed_activation_keeps_cooldown_window(self) -> None:
        """success=False 是失败（HA 离线 / 回滚），不能把冷却消费掉。"""
        deps = _FakeTriggerDeps(activate_result={"success": False})
        state = _trigger_state()

        fired = _run(
            home_mode_triggers._fire_triggered_home_mode(state, deps, _lock_binding(), "lock_unlock:lock.da_men")
        )

        self.assertFalse(fired)
        self.assertEqual(state.trigger_cooldown, {})
        self.assertTrue(deps.warned)

    def test_successful_activation_consumes_cooldown(self) -> None:
        deps = _FakeTriggerDeps(activate_result={"success": True})
        state = _trigger_state()

        fired = _run(
            home_mode_triggers._fire_triggered_home_mode(state, deps, _lock_binding(), "lock_unlock:lock.da_men")
        )

        self.assertTrue(fired)
        self.assertEqual(len(state.trigger_cooldown), 1)

    def test_one_failing_time_binding_does_not_block_others(self) -> None:
        """同分钟多条时间触发：前一条被仲裁拒绝，后一条仍要评估。"""
        state = home_mode_triggers.HomeModeTriggersState()
        state.trigger_bindings = [
            home_mode_triggers.HomeModeTriggerBinding(
                mode_id=f"mode-{index}",
                mode_name=f"mode-{index}",
                trigger={"type": "time", "at": "00:00", "enabled": True},
            )
            for index in range(3)
        ]
        deps = _FakeTriggerDeps()

        original = home_mode_triggers._fire_triggered_home_mode
        calls: list[str] = []

        async def _flaky(_state, _deps, binding, reason, meta=None):
            calls.append(binding.mode_id)
            if len(calls) == 1:
                raise RuntimeError("linkage blocked")
            return await original(_state, _deps, binding, reason, meta)

        # 固定「刚过 00:00」的时刻，落在 10 分钟宽限期内。
        fixed_now = home_mode_triggers.datetime(2026, 11, 11, 16, 0, 30, tzinfo=home_mode_triggers.UTC)

        class _FixedDatetime(home_mode_triggers.datetime):
            @classmethod
            def now(cls, tz=None):
                return fixed_now

        with (
            patch.object(home_mode_triggers, "_fire_triggered_home_mode", _flaky),
            patch.object(home_mode_triggers, "datetime", _FixedDatetime),
        ):
            _run(home_mode_triggers.check_home_mode_time_triggers(state, deps))

        self.assertEqual(calls, ["mode-0", "mode-1", "mode-2"])


class SettleWindowConfigTests(unittest.TestCase):
    def test_env_zero_disables_window(self) -> None:
        with patch.dict(os.environ, {home_mode_policy.BASELINE_SETTLE_ENV: "0"}):
            self.assertEqual(home_mode_policy.resolve_baseline_settle_ms(), 0)

    def test_default_window_is_positive(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(home_mode_policy.BASELINE_SETTLE_ENV, None)
            self.assertGreater(home_mode_policy.resolve_baseline_settle_ms(), 0)

    def test_service_uses_store_link_age(self) -> None:
        service = home_mode_service.HomeModeService(
            session_factory=lambda: None,
            ha_connector=SimpleNamespace(),
            state_store=SimpleNamespace(get_ha_link_age_ms=lambda: 1000),
        )
        self.assertTrue(service.is_baseline_settling())

        service._state_store = SimpleNamespace(get_ha_link_age_ms=lambda: 10 * 60 * 1000)
        self.assertFalse(service.is_baseline_settling())

    def test_service_without_store_is_not_settling(self) -> None:
        service = home_mode_service.HomeModeService(
            session_factory=lambda: None,
            ha_connector=SimpleNamespace(),
            state_store=SimpleNamespace(),
        )
        self.assertFalse(service.is_baseline_settling())


class ColdStartBatchTests(unittest.TestCase):
    """批处理载荷的 baseline 标记决定是否跑副作用。"""

    def _handlers(self, recorded: list[dict[str, Any]]):
        app = SimpleNamespace(
            state=SimpleNamespace(entity_sync_filter=None),
        )

        async def _fake_effects(_app, change):
            recorded.append(change)

        class _Gateway:
            async def broadcast_state_changed_batch(self, changes):
                return None

        # 补丁必须活到 handler 真正被调用为止：用 start()/addCleanup 而不是 with 块，
        # 否则工厂函数返回时补丁已被撤销，副作用仍然走真实实现。
        patcher = patch.object(ha_effects, "_run_reconciled_change_effects", _fake_effects)
        patcher.start()
        self.addCleanup(patcher.stop)
        return lifespan_module._make_state_bus_handlers(app, _Gateway(), SimpleNamespace())

    def test_cold_start_fill_skips_side_effects(self) -> None:
        recorded: list[dict[str, Any]] = []
        handlers = self._handlers(recorded)
        payload = {
            "changes": [{"entity_id": "lock.da_men", "old_state": None, "new_state": {"state": "unlocked"}}],
            "applied": True,
            "reason": "resync",
            "baseline": False,
        }

        _run(handlers["ha.state_changed.batch"](payload))

        self.assertEqual(recorded, [])

    def test_reconcile_diff_runs_side_effects(self) -> None:
        recorded: list[dict[str, Any]] = []
        handlers = self._handlers(recorded)
        payload = {
            "changes": [
                {"entity_id": "lock.da_men", "old_state": {"state": "locked"}, "new_state": {"state": "unlocked"}}
            ],
            "applied": True,
            "reason": "resync",
            "baseline": True,
        }

        _run(handlers["ha.state_changed.batch"](payload))

        self.assertEqual(len(recorded), 1)


if __name__ == "__main__":
    unittest.main()
