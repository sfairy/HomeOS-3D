"""L1 / L2 回归：告警规则的删除即时生效、启动锁存预热、编辑复位边沿。

1. **单一 watch 索引**：``NotificationService.alert_rule_watch_index`` 必须就是求值用的
   那一份；实体解绑删除规则后走 ``refresh_alert_rules_sync`` 刷新它，而不是刷另一份。
2. **启动静默锁存**：条件已成立的规则在启动时只记基线，不补发通知。
3. **编辑复位**：条件变了要清掉该规则的边沿锁存，否则同电平永远不会再触发。

依赖注入的形状由 ``EntityReferencesDeps``（TypedDict）声明，用例里按它构造 ``deps``；
``unlink_alert_rule`` 只要求其中的子集 ``AlertWatchIndexDeps``，所以两者都能直接传。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.ha.config.ha_filters import AlertRuleWatchIndex
from src.domains.notification import rules as notification_rules
from src.domains.notification.service import NotificationService
from src.domains.state_store import alert_watch_index
from src.domains.state_store.entity_references import EntityReferencesDeps


def _run(coro):
    return asyncio.run(coro)


def _service(state_store: Any = None) -> NotificationService:
    service = NotificationService(
        session_factory=lambda: None,
        event_bus=None,
        cooldown_service=MagicMock(),
        channels_service=None,
        state_store=state_store,
    )
    return service


class SingleWatchIndexTests(unittest.TestCase):
    def test_service_exposes_the_index_used_for_evaluation(self) -> None:
        service = _service()
        # 求值侧持有的就是暴露出来的这一个对象（同一性，而不是「等值」）。
        self.assertIs(service.alert_rule_watch_index, service._rules_helper._watch_index)

    def test_refresh_sync_updates_cache_and_index(self) -> None:
        service = _service()
        rules = [{"id": "r1", "entityId": "sensor.t", "condition": "value > 30", "enabled": True}]
        with patch.object(service._rules_helper, "_fetch_rules_from_db", return_value=rules):
            service.refresh_alert_rules_sync()

        self.assertEqual([rule["id"] for rule in service._rules_helper.rules_cache], ["r1"])
        self.assertTrue(service.alert_rule_watch_index.should_process_entity("sensor.t"))
        self.assertFalse(service.alert_rule_watch_index.should_process_entity("sensor.other"))

    def test_stale_flag_exposed_and_reset_on_success(self) -> None:
        service = _service()
        service._rules_helper.rules_cache_stale = True
        self.assertTrue(service.alert_rules_stale)
        with patch.object(service._rules_helper, "_fetch_rules_from_db", return_value=[]):
            service.refresh_alert_rules_sync()
        self.assertFalse(service.alert_rules_stale)


class DeletePathRefreshTests(unittest.TestCase):
    """实体解绑删除规则时，必须刷新「求值侧」而不是另一份索引。"""

    def _deps(self, refresh) -> EntityReferencesDeps:
        return {
            "session_factory": MagicMock(),
            "app_config": MagicMock(),
            "ui_config": MagicMock(),
            "alert_rule_watch_index": AlertRuleWatchIndex(),
            "delete_alert_rule": lambda rule_id: {"success": True},
            "refresh_alert_rules": refresh,
            "load_layout": dict,
            "save_layout": lambda layout: None,
        }

    def test_refresh_callback_is_invoked(self) -> None:
        calls: list[str] = []
        ok, message = alert_watch_index.unlink_alert_rule(self._deps(lambda: calls.append("refresh")), "rule-1")

        self.assertTrue(ok)
        self.assertEqual(message, "已删除告警规则")
        self.assertEqual(calls, ["refresh"])

    def test_fallback_to_local_index_when_no_callback(self) -> None:
        deps = self._deps(None)
        deps["refresh_alert_rules"] = None

        with patch.object(alert_watch_index, "refresh_alert_rule_watch_index") as fallback:
            ok, _message = alert_watch_index.unlink_alert_rule(deps, "rule-1")

        self.assertTrue(ok)
        fallback.assert_called_once()


class PrimeLatchTests(unittest.TestCase):
    def _helper(self) -> notification_rules.NotificationRulesHelper:
        return notification_rules.NotificationRulesHelper(
            session_factory=lambda: None,
            alert_rule_watch_index=AlertRuleWatchIndex(),
            is_dnd_active=lambda: False,
            is_alert_bypass_dnd=lambda: True,
            is_in_cooldown=lambda key: False,
            set_cooldown=lambda key, minutes: None,
            notify=AsyncMock(),
        )

    def test_already_true_condition_is_latched_without_notifying(self) -> None:
        helper = self._helper()
        helper.rules_cache = [{"id": "r1", "entityId": "sensor.t", "condition": "value > 30", "enabled": True}]

        helper.prime_latches({"sensor.t": ("31", {})})

        self.assertTrue(helper._match_state["r1:sensor.t"])
        helper._notify.assert_not_called()  # type: ignore[attr-defined]

    def test_primed_latch_blocks_duplicate_edge(self) -> None:
        helper = self._helper()
        helper.rules_cache = [{"id": "r1", "entityId": "sensor.t", "condition": "value > 30", "enabled": True}]
        helper.prime_latches({"sensor.t": ("31", {})})

        _run(helper.evaluate_rules("sensor.t", "32", {}))

        helper._notify.assert_not_called()  # type: ignore[attr-defined]

    def test_false_condition_primes_false_then_edge_notifies(self) -> None:
        helper = self._helper()
        helper.rules_cache = [{"id": "r1", "entityId": "sensor.t", "condition": "value > 30", "enabled": True}]
        helper.prime_latches({"sensor.t": ("20", {})})

        self.assertFalse(helper._match_state["r1:sensor.t"])
        _run(helper.evaluate_rules("sensor.t", "31", {}))
        helper._notify.assert_awaited()  # type: ignore[attr-defined]

    def test_latch_reset_on_condition_edit(self) -> None:
        helper = self._helper()
        helper._match_state["r1:sensor.t"] = True
        helper._match_state["r2:sensor.t"] = True

        helper._reset_rule_edge("r1")

        self.assertNotIn("r1:sensor.t", helper._match_state)
        self.assertIn("r2:sensor.t", helper._match_state)

    def test_cache_refresh_drops_deleted_rule_latches(self) -> None:
        helper = self._helper()
        helper._match_state["gone:sensor.t"] = True
        with patch.object(helper, "_fetch_rules_from_db", return_value=[]):
            helper.refresh_rules_cache_sync()
        self.assertEqual(helper._match_state, {})


if __name__ == "__main__":
    unittest.main()
