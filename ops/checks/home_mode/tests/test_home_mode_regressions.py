"""Home Mode / 通知投递的语义回归（阶段一「修静默失败」）。

这些分支只在「设备离线 / 推送失败 / 定时检查被阻塞」时才会走到，隔离环境里既没有真 HA，
也不会恰好错过某个整分钟 —— 端到端只能看到正常路径。这里用假的 deps / sio 把四条语义钉住：

1. 快照采集失败的实体必须被记住（并在停用时如实报「无法恢复」），不能从快照里静默消失；
2. 服务调用「没抛异常」不等于生效：``verified=False`` 才算失败，``None`` 只算未确认；
3. 时间触发器按 ``now >= at`` + occurrence 去重判定，错过整分钟也能补触发，且不会重复触发；
4. 站内通知推送抛错时**不得**回写 ``deliveredAt``（保持 pending 供下轮重投）。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.home_mode import actions as home_mode_actions
from src.domains.home_mode import triggers as home_mode_triggers
from src.realtime import gateway_broadcasts


def _run(coro):
    return asyncio.run(coro)


class _FakeDeps:
    """激活编排用到的窄接口（只实现被测分支真正会调的方法）。"""

    def __init__(self, *, states: dict[str, dict[str, Any]] | None = None) -> None:
        self.states = states or {}
        self.warned: list[str] = []
        self.notifications: list[tuple[str, str]] = []
        self.calls: list[tuple[str, str, str]] = []

    def warn(self, message: str) -> None:
        self.warned.append(message)

    def log(self, message: str) -> None:
        pass

    async def fetch_entity_state(self, entity_id: str):
        return self.states.get(entity_id)

    async def get_ha_status(self) -> dict[str, Any]:
        return {"connected": True}

    async def call_service(self, domain: str, service: str, entity_id: str, data: dict[str, Any]):
        self.calls.append((domain, service, entity_id))
        return []

    async def notify(self, level: str, message: str, source: str) -> None:
        self.notifications.append((level, message))

    async def set_security_mode(self, mode: str, source: str) -> bool:
        return True


class SnapshotCollectTests(unittest.TestCase):
    def test_missing_entities_are_reported_not_dropped(self) -> None:
        deps = _FakeDeps(states={"light.a": {"state": "on", "attributes": {}}})
        configs = [{"entity_id": "light.a"}, {"entity_id": "light.offline"}]

        snapshot, missing = _run(home_mode_actions._collect_device_snapshot(deps, configs))

        self.assertEqual(list(snapshot), ["light.a"])
        self.assertEqual(missing, ["light.offline"])

    def test_restore_reports_missing_entities_and_keeps_input_intact(self) -> None:
        deps = _FakeDeps(states={"light.a": {"state": "on", "attributes": {}}})
        raw_snapshot = {
            "light.a": {"state": "off", "attributes": {}},
            home_mode_actions.SNAPSHOT_MISSING_KEY: ["light.offline"],
        }

        outcome = _run(
            home_mode_actions._restore_mode_snapshot(deps, {"deviceSnapshot": raw_snapshot})
        )

        self.assertEqual(outcome["missingEntities"], ["light.offline"])
        self.assertEqual(outcome["restored"], 1)
        # 保留键不能从调用方手里被 pop 掉：失败回滚还要复用它。
        self.assertIn(home_mode_actions.SNAPSHOT_MISSING_KEY, raw_snapshot)


class ActionVerificationTests(unittest.TestCase):
    def _execute(self, deps: _FakeDeps, verification: dict[str, Any]):
        action = {
            "entity_id": "light.a",
            "domain": "light",
            "service": "turn_on",
            "service_data": {},
        }
        with patch.object(
            home_mode_actions, "describe_service_verification", return_value=verification
        ):
            return _run(home_mode_actions._execute_home_mode_action(deps, action))

    def test_confirmed_command_counts_as_success(self) -> None:
        deps = _FakeDeps()
        result = self._execute(
            deps, {"supported": True, "verified": True, "reason": "state_confirmed"}
        )
        self.assertTrue(result["success"])
        self.assertIs(result["verified"], True)

    def test_unavailable_command_is_failure(self) -> None:
        deps = _FakeDeps()
        result = self._execute(
            deps, {"supported": True, "verified": False, "reason": "entity_unavailable"}
        )
        self.assertFalse(result["success"])
        self.assertIn("设备状态未按预期变化", result["error"])

    def test_unconfirmed_command_is_success_but_marked_unverified(self) -> None:
        deps = _FakeDeps()
        result = self._execute(
            deps, {"supported": True, "verified": None, "reason": "entity_not_in_response"}
        )
        self.assertTrue(result["success"])
        self.assertTrue(result.get("unverified"))

    def test_count_verified_ignores_actions_without_verification(self) -> None:
        results = [
            {"success": True, "verified": True},
            {"success": True, "verified": None},
            {"success": True},  # notify / security：不参与三态统计
            {"success": False, "verified": False},
        ]
        self.assertEqual(home_mode_actions.count_verified(results, True), 1)
        self.assertEqual(home_mode_actions.count_verified(results, None), 1)


class _TriggerDeps:
    HOME_TZ = "Asia/Shanghai"

    def __init__(self) -> None:
        self.activated: list[str] = []

    def is_leader(self) -> bool:
        return True

    def get_home_timezone(self) -> str:
        return self.HOME_TZ

    def get_active_mode_id(self) -> str | None:
        return None

    def get_trigger_cooldown_ms(self) -> int:
        return 0

    def log(self, message: str) -> None:
        pass

    def warn(self, message: str) -> None:
        pass

    async def find_mode(self, mode_id: str):
        return {
            "id": mode_id,
            "name": mode_id,
            "exclusiveGroup": "default",
            "priority": 50,
            "config": [],
            "triggers": [],
        }

    async def get_active_mode(self):
        return None

    async def request_activate(self, mode_id: str, meta: dict[str, Any] | None = None):
        self.activated.append(mode_id)
        return {"success": True}

    async def request_deactivate(self):
        return {"success": True}


def _binding(mode_id: str, at: str) -> home_mode_triggers.HomeModeTriggerBinding:
    return home_mode_triggers.HomeModeTriggerBinding(
        mode_id=mode_id,
        mode_name=mode_id,
        trigger={"type": "time", "at": at, "enabled": True},
    )


def _frozen_utc(instant: datetime):
    """把一个 UTC 时刻注入 triggers 模块的 ``datetime.now``。"""
    fake = MagicMock(wraps=datetime)
    fake.now = MagicMock(return_value=instant)
    return fake


# 2026-10-25T23:03Z == 2026-10-26 07:03 Asia/Shanghai
_MORNING_0703 = datetime(2026, 10, 25, 23, 3, tzinfo=UTC)


class TimeTriggerTests(unittest.TestCase):
    def test_fires_when_tick_missed_the_exact_minute(self) -> None:
        """整分钟被阻塞（循环卡住 / 进程重启）后，宽限期内仍要补触发。"""
        deps = _TriggerDeps()
        state = home_mode_triggers.HomeModeTriggersState()
        state.trigger_bindings = [_binding("mode-away", "07:00")]

        with patch.object(home_mode_triggers, "datetime", _frozen_utc(_MORNING_0703)):
            _run(home_mode_triggers.check_home_mode_time_triggers(state, deps))

        self.assertEqual(deps.activated, ["mode-away"])

    def test_stale_occurrence_outside_grace_window_is_ignored(self) -> None:
        """超过宽限窗口就当作「已经错过」，不要几小时后再激活离家模式。"""
        deps = _TriggerDeps()
        state = home_mode_triggers.HomeModeTriggersState()
        state.trigger_bindings = [_binding("mode-away", "06:00")]

        with patch.object(home_mode_triggers, "datetime", _frozen_utc(_MORNING_0703)):
            _run(home_mode_triggers.check_home_mode_time_triggers(state, deps))

        self.assertEqual(deps.activated, [])

    def test_same_occurrence_never_fires_twice(self) -> None:
        deps = _TriggerDeps()
        state = home_mode_triggers.HomeModeTriggersState()
        state.trigger_bindings = [_binding("mode-away", "07:00")]

        with patch.object(home_mode_triggers, "datetime", _frozen_utc(_MORNING_0703)):
            _run(home_mode_triggers.check_home_mode_time_triggers(state, deps))
            # 下一分钟再求值一次：同一 occurrence 不能重复激活。
            state.last_time_trigger_minute = ""
            with patch.object(
                home_mode_triggers,
                "datetime",
                _frozen_utc(_MORNING_0703 + timedelta(minutes=1)),
            ):
                _run(home_mode_triggers.check_home_mode_time_triggers(state, deps))

        self.assertEqual(deps.activated, ["mode-away"])


class _FakeSio:
    def __init__(self, *, fail_all: bool = False, fail_first: int = 0) -> None:
        self.fail_all = fail_all
        self.fail_first = fail_first
        self.sent: list[tuple[str, str | None]] = []

    async def emit(self, event: str, data: Any, to: str | None = None) -> None:
        if self.fail_all or self.fail_first > 0:
            self.fail_first = max(0, self.fail_first - 1)
            raise RuntimeError("socket down")
        self.sent.append((event, to))


class _Gateway(gateway_broadcasts.BroadcastMixin):
    def __init__(self, sio: _FakeSio, connected: set[str]) -> None:
        self.sio = sio
        self.connected = connected
        self.app = None
        self.marked: list[tuple[str, list[str]]] = []

    def _session_for(self, sid: str) -> dict[str, Any]:
        return {"user": {"userId": sid}}

    async def _mark_notification_delivered(self, notification_id: str, channels: list[str]) -> None:
        self.marked.append((notification_id, channels))


class NotificationDeliveryTests(unittest.TestCase):
    def test_broadcast_failure_keeps_notification_pending(self) -> None:
        gateway = _Gateway(_FakeSio(fail_all=True), {"s1", "s2"})

        with patch.object(gateway_broadcasts, "entity_visible", return_value=True):
            _run(gateway.broadcast_notification({"id": "n1", "title": "t"}))

        self.assertEqual(gateway.marked, [])

    def test_partial_room_failure_keeps_notification_pending(self) -> None:
        gateway = _Gateway(_FakeSio(fail_first=1), {"u1", "u2"})

        with patch.object(gateway_broadcasts, "entity_visible", return_value=True):
            _run(gateway.broadcast_notification({"id": "n1", "entityId": "light.a"}))

        # 一个 room 成功、一个失败：失败那侧还要重投，不能标记为已送达。
        self.assertEqual(gateway.marked, [])
        self.assertTrue(gateway.sio.sent)

    def test_all_rooms_success_marks_delivered(self) -> None:
        gateway = _Gateway(_FakeSio(), {"u1"})

        with patch.object(gateway_broadcasts, "entity_visible", return_value=True):
            _run(gateway.broadcast_notification({"id": "n1", "entityId": "light.a"}))

        self.assertEqual(gateway.marked, [("n1", ["socket"])])


if __name__ == "__main__":
    unittest.main()
