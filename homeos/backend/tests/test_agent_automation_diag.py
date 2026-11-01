"""智能管家自动化单测（续）：看门狗 / 诊断 / 联网搜索 / 工具分发 / 迁移。

与 ``test_agent_automation`` 共用 ``agent_automation_support`` 里的内存库与假工具服务，
拆成两个文件是为了让单个测试模块保持在体量门禁之下。
"""

from __future__ import annotations

import sqlite3
import unittest
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest import mock

from src.domains.agent.policy.watchdog import AgentWatchdogService
from src.domains.agent.runtime.agent_actor import AgentActor
from src.domains.agent.runtime.config_service import AgentProactiveConfig
from src.domains.agent.runtime.diagnostics import (
    KIND_CONNECTIVITY,
    KIND_LOW_BATTERY,
    KIND_OFFLINE,
    KIND_RECOVERED,
    AgentDiagnosticsService,
)
from src.domains.agent.runtime.web_search import AgentWebSearchService, _is_public_address
from src.domains.agent.tools.home_tools_schemas import build_home_tool_schemas
from src.domains.agent.tools.home_tools_service import HomeToolsService
from src.platform.core.db.migrations import _add_agent_automation_actor_columns
from src.platform.core.db.models import AgentPolicyRule

from tests.agent_automation_support import (
    AUTOMATION_TOOLS,
    _bind_engine,
    _FakeTools,
    _session_factory,
)


class _EntityRef:
    def __init__(self, entity_id: str) -> None:
        self.entity_id = entity_id


class _AreaSummary:
    def __init__(self, area_id: str, name: str, entity_ids: list[str]) -> None:
        self.id = area_id
        self.name = name
        self.entities = [_EntityRef(item) for item in entity_ids]


class _FakeAreas:
    def __init__(self, summaries: list[_AreaSummary]) -> None:
        self._summaries = summaries

    async def find_all(self) -> list[_AreaSummary]:
        return self._summaries


class _FakeStateStore:
    def __init__(self, entities: dict[str, dict[str, Any]]) -> None:
        self._entities = entities

    def get(self, entity_id: str) -> dict[str, Any] | None:
        return self._entities.get(entity_id)


class _FakeConfig:
    def __init__(self, cfg: AgentProactiveConfig) -> None:
        self._cfg = cfg

    async def get_proactive_config(self) -> AgentProactiveConfig:
        return self._cfg


class _FakeTimeline:
    def __init__(self, on_since: dict[str, datetime]) -> None:
        self._on_since = on_since

    async def last_on_since(self, entity_ids: list[str]) -> dict[str, datetime]:
        return {key: value for key, value in self._on_since.items() if key in entity_ids}


class _FakePolicy:
    def __init__(self, auto_close: bool = True) -> None:
        self.auto_close = auto_close
        self.touched: list[list[str]] = []

    async def match_watchdog_policy(
        self,
        area_id: str,
        domains: list[str],
        idle_minutes: int = 0,
    ) -> list[dict[str, Any]]:
        del area_id, domains, idle_minutes
        return [{"id": "rule-1", "name": "客厅无人关灯", "autoClose": self.auto_close}]

    async def touch_triggered(self, rule_ids: list[str]) -> None:
        self.touched.append(list(rule_ids))


class _FakeNotification:
    def __init__(self) -> None:
        self.messages: list[str] = []

    def is_dnd_active(self) -> bool:
        return False

    async def notify(self, level: str, message: str, source: str = "") -> bool:
        del level, source
        self.messages.append(message)
        return True


class WatchdogIdleTest(unittest.IsolatedAsyncioTestCase):
    def _build(
        self, *, auto_close: bool, quiet: tuple[int, int] | None = None
    ) -> tuple[AgentWatchdogService, _FakeTools, _FakeNotification]:
        now = datetime.now(UTC)
        state_store = _FakeStateStore(
            {
                "light.living": {
                    "entity_id": "light.living",
                    "state": "on",
                    "attributes": {"friendly_name": "客厅灯"},
                },
                "binary_sensor.living_motion": {
                    "entity_id": "binary_sensor.living_motion",
                    "state": "off",
                    "attributes": {"device_class": "motion", "friendly_name": "客厅人体"},
                    "last_updated": (now - timedelta(minutes=90)).isoformat(),
                },
                "lock.front_door": {
                    "entity_id": "lock.front_door",
                    "state": "unlocked",
                    "attributes": {"friendly_name": "门锁"},
                },
            }
        )
        areas = _FakeAreas(
            [
                _AreaSummary(
                    "living",
                    "客厅",
                    ["light.living", "binary_sensor.living_motion", "lock.front_door"],
                )
            ]
        )
        cfg = AgentProactiveConfig(
            watchdog_enabled=True,
            auto_close_enabled=auto_close,
            motion_idle_minutes=20,
            idle_device_minutes=60,
            idle_switch_minutes=120,
            max_auto_close_devices=3,
            # 默认把免打扰时段设成 0-0（start == end 视为不启用），
            # 避免用例在夜间运行时被真实免打扰时段干扰；需要时由用例显式指定。
            quiet_start=quiet[0] if quiet else 0,
            quiet_end=quiet[1] if quiet else 0,
        )
        tools = _FakeTools()
        notification = _FakeNotification()
        watchdog = AgentWatchdogService(
            tools,
            _FakeConfig(cfg),
            areas=areas,
            state_store=state_store,
            timeline=_FakeTimeline({"light.living": now - timedelta(hours=3)}),
            policy=_FakePolicy(),
            presence=None,
            notification=notification,
            session_factory=None,
            jobs=None,
        )
        return watchdog, tools, notification

    async def test_idle_light_triggers_signal(self) -> None:
        watchdog, tools, notification = self._build(auto_close=False)
        result = await watchdog.run_once(actor=AgentActor(user_id="u1"))
        self.assertTrue(result["signals"])
        self.assertIn("客厅灯", result["signals"][0])
        self.assertEqual(result["actions"], [])
        self.assertEqual(tools.control_calls(), [])
        self.assertEqual(len(notification.messages), 1)

    async def test_quiet_hours_suppress_notification_but_keep_signals(self) -> None:
        """免打扰时段内不推送，但手动巡检仍要把信号返回给调用方。"""
        hour = datetime.now().hour
        watchdog, _tools, notification = self._build(auto_close=False, quiet=(hour, (hour + 1) % 24))
        result = await watchdog.run_once(actor=AgentActor(user_id="u1"))
        self.assertTrue(result["signals"])
        self.assertFalse(result["sent"])
        self.assertEqual(notification.messages, [])

    async def test_auto_close_only_touches_low_risk_domains(self) -> None:
        watchdog, tools, _notification = self._build(auto_close=True)
        result = await watchdog.run_once(actor=AgentActor(user_id="u1"))
        self.assertEqual([item["entityId"] for item in result["actions"]], ["light.living"])
        calls = tools.control_calls()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "control_device")
        self.assertEqual(calls[0][1]["service"], "turn_off")

    async def test_disabled_watchdog_does_nothing(self) -> None:
        watchdog, _tools, _notification = self._build(auto_close=True)
        watchdog._agent_config = _FakeConfig(AgentProactiveConfig(watchdog_enabled=False))
        result = await watchdog.run_once(actor=AgentActor(user_id="u1"))
        self.assertEqual(result["skipped"], "disabled")


class _FakeLogStore:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    def append(
        self,
        level: str,
        source: str,
        category: str,
        message: str,
        context: dict[str, Any] | None = None,
    ) -> None:
        self.events.append(
            {
                "id": f"evt-{len(self.events)}",
                "level": level,
                "source": source,
                "category": category,
                "message": message,
                "context": dict(context or {}),
            }
        )

    def list_events(
        self,
        level: str | None = None,
        category: str | None = None,
        search: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        items = [
            item
            for item in self.events
            if (level is None or item["level"] == level) and (category is None or item["category"] == category)
        ]
        return items if limit is None else items[:limit]


class DiagnosticsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.store = _FakeLogStore()
        self.diagnostics = AgentDiagnosticsService(self.store)

    def _change(self, entity_id: str, state: str, **attributes: Any) -> None:
        self.diagnostics._handle_change(
            {
                "entity_id": entity_id,
                "new_state": {"state": state, "attributes": attributes},
            }
        )

    def test_offline_and_recovered_are_deduplicated(self) -> None:
        self._change("light.living", "unavailable", friendly_name="客厅灯")
        self._change("light.living", "unavailable", friendly_name="客厅灯")
        self.assertEqual([item["context"]["kind"] for item in self.store.events], [KIND_OFFLINE])
        self._change("light.living", "on", friendly_name="客厅灯")
        self.assertEqual(
            [item["context"]["kind"] for item in self.store.events],
            [KIND_OFFLINE, KIND_RECOVERED],
        )

    def test_low_battery_reported_once_per_day(self) -> None:
        self._change("sensor.button", "on", friendly_name="按钮", battery_level=10)
        self._change("sensor.button", "on", friendly_name="按钮", battery_level=9)
        self._change("sensor.plug", "on", friendly_name="插座", battery_level=80)
        kinds = [item["context"]["kind"] for item in self.store.events]
        self.assertEqual(kinds, [KIND_LOW_BATTERY])

    def test_connectivity_events(self) -> None:
        self.diagnostics._on_disconnected({"reason": "timeout"})
        self.diagnostics._on_connected()
        self.assertEqual(
            [item["context"]["kind"] for item in self.store.events],
            [KIND_CONNECTIVITY, KIND_CONNECTIVITY],
        )

    def test_query_filters_by_kind_and_visibility(self) -> None:
        self._change("light.living", "unavailable", friendly_name="客厅灯")
        self._change("sensor.button", "on", friendly_name="按钮", battery_level=5)
        low = self.diagnostics.query(kind=KIND_LOW_BATTERY)
        self.assertEqual(len(low), 1)
        hidden = self.diagnostics.query(may_read=lambda entity_id: False)
        self.assertEqual(hidden, [])
        visible = self.diagnostics.query(may_read=lambda entity_id: entity_id == "sensor.button")
        self.assertEqual([item["entityId"] for item in visible], ["sensor.button"])


class WebSearchTest(unittest.IsolatedAsyncioTestCase):
    def _service(self, results: list[dict[str, Any]] | None = None) -> AgentWebSearchService:
        service = AgentWebSearchService(env={})

        async def _fetch(host: str, path: str, **kwargs: Any) -> Any:
            del host, path, kwargs
            raise AssertionError("测试不应真的发请求")

        service._http_fetch = _fetch
        if results is not None:

            async def _duckduckgo(query: str, limit: int) -> list[dict[str, Any]]:
                del query, limit
                return results

            service._search_duckduckgo = _duckduckgo  # type: ignore[method-assign]
        return service

    async def test_falls_back_to_next_provider(self) -> None:
        service = self._service([{"title": "天气", "url": "https://example.com", "snippet": "晴"}])

        async def _wikipedia(query: str, limit: int) -> list[dict[str, Any]]:
            del query, limit
            raise RuntimeError("上游超时")

        service._search_wikipedia = _wikipedia  # type: ignore[method-assign]
        result = await service.search("今天天气", 3)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["provider"], "duckduckgo")

    async def test_all_providers_failing_returns_message(self) -> None:
        service = self._service([])
        result = await service.search("今天天气", 3)
        self.assertFalse(result["ok"])
        self.assertTrue(result["message"])

    async def test_disabled_search_short_circuits(self) -> None:
        service = self._service([{"title": "x", "url": "https://example.com", "snippet": ""}])
        service.set_enabled(False)
        result = await service.search("天气")
        self.assertFalse(result["ok"])
        self.assertIn("关闭", result["message"])

    def test_private_addresses_are_rejected(self) -> None:
        def _resolver(address: str) -> Any:
            return lambda *_args, **_kwargs: [(2, 1, 6, "", (address, 443))]

        for address in ("127.0.0.1", "10.1.2.3", "192.168.1.10", "169.254.169.254", "::1"):
            with mock.patch("socket.getaddrinfo", _resolver(address)):
                self.assertFalse(_is_public_address("example.com"), address)
        with mock.patch("socket.getaddrinfo", _resolver("93.184.216.34")):
            self.assertTrue(_is_public_address("example.com"))

    async def test_request_rejects_unlisted_host(self) -> None:
        service = self._service()
        with self.assertRaises(ValueError):
            await service._request("evil.example.com", "/")

    async def test_request_rejects_private_dns(self) -> None:
        service = self._service()
        service._host_checker = lambda host: False
        with self.assertRaises(ValueError):
            await service._request("duckduckgo.com", "/html/")


class ToolDispatchTest(unittest.IsolatedAsyncioTestCase):
    async def test_schemas_expose_automation_tools(self) -> None:
        names = {schema.name for schema in build_home_tool_schemas()}
        for name in AUTOMATION_TOOLS:
            self.assertIn(name, names)

    def _bare_tools(self) -> HomeToolsService:
        tools = HomeToolsService.__new__(HomeToolsService)
        for attribute in (
            "_scheduler",
            "_policy",
            "_timeline",
            "_diagnostics",
            "_web_search_service",
            "_watchdog",
        ):
            setattr(tools, attribute, None)
        return tools

    async def test_disabled_service_returns_error(self) -> None:
        tools = self._bare_tools()
        self.assertEqual(await tools.execute("list_scheduled_tasks", {}), {"error": "计划任务未启用"})
        self.assertEqual(await tools.execute("run_proactive_patrol", {}), {"error": "看门狗未启用"})
        self.assertEqual(await tools.execute("query_system_logs", {}), {"error": "诊断日志未启用"})

    async def test_policy_list_dispatch(self) -> None:
        tools = self._bare_tools()

        class _Policy:
            async def list_rules(self) -> list[dict[str, Any]]:
                return [{"id": "rule-1", "name": "客厅无人关灯"}]

        tools._policy = _Policy()
        result = await tools.execute("manage_user_policy", {"action": "list"})
        self.assertEqual(result["rules"][0]["id"], "rule-1")

    async def test_unknown_tool_still_errors(self) -> None:
        tools = self._bare_tools()
        self.assertIn("未知工具", (await tools.execute("not_a_tool", {}))["error"])

    async def test_policy_rule_model_created(self) -> None:
        session_factory = _session_factory()
        self.addCleanup(_bind_engine(session_factory).dispose)
        with session_factory() as session:
            self.assertEqual(list(session.query(AgentPolicyRule).all()), [])


if __name__ == "__main__":
    unittest.main()


class AgentActorColumnMigrationTest(unittest.TestCase):
    """``updatedBy`` 迁移必须幂等，且对「表还没建出来」的全新库静默跳过。"""

    def _columns(self, connection: sqlite3.Connection, table: str) -> set[str]:
        return {str(row[1]) for row in connection.execute(f"PRAGMA table_info({table})")}

    def test_adds_missing_column_idempotently(self) -> None:
        connection = sqlite3.connect(":memory:")
        self.addCleanup(connection.close)
        connection.execute("CREATE TABLE agent_policy_rules (id TEXT PRIMARY KEY)")
        connection.execute("CREATE TABLE agent_scheduled_tasks (id TEXT PRIMARY KEY)")

        _add_agent_automation_actor_columns(connection, None)  # type: ignore[arg-type]
        self.assertIn("updatedBy", self._columns(connection, "agent_policy_rules"))
        self.assertIn("updatedBy", self._columns(connection, "agent_scheduled_tasks"))

        # 幂等：再跑一次不应重复加列
        _add_agent_automation_actor_columns(connection, None)  # type: ignore[arg-type]
        self.assertIn("updatedBy", self._columns(connection, "agent_policy_rules"))

    def test_missing_table_is_skipped(self) -> None:
        connection = sqlite3.connect(":memory:")
        self.addCleanup(connection.close)
        _add_agent_automation_actor_columns(connection, None)  # type: ignore[arg-type]
        self.assertEqual(self._columns(connection, "agent_policy_rules"), set())
