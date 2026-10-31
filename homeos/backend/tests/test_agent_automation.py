"""智能管家自动化能力单测：家规 / 计划任务 / 时序 / 看门狗 / 诊断 / 联网搜索 / 工具分发。

用内存 SQLite + 假对象（房间 / 状态库 / 通知）覆盖各服务的判定分支，
不触碰真实 HA、数据库文件与网络。
"""

from __future__ import annotations

import sqlite3
import unittest
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest import mock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from src.domains.agent.runtime.agent_actor import AgentActor
from src.domains.agent.runtime.config_service import AgentProactiveConfig
from src.domains.agent.runtime.diagnostics import (
    KIND_CONNECTIVITY,
    KIND_LOW_BATTERY,
    KIND_OFFLINE,
    KIND_RECOVERED,
    AgentDiagnosticsService,
)
from src.domains.agent.policy.policy import AgentPolicyService
from src.domains.agent.policy.scheduler import AgentSchedulerService
from src.domains.agent.memory.timeline import (
    SOURCE_AUTOMATION,
    SOURCE_EXTERNAL,
    SOURCE_MANUAL,
    AgentTimelineService,
)
from src.domains.agent.tools.home_tools_schemas import build_home_tool_schemas
from src.domains.agent.tools.home_tools_service import HomeToolsService
from src.domains.agent.policy.watchdog import AgentWatchdogService
from src.domains.agent.runtime.web_search import AgentWebSearchService, _is_public_address
from src.platform.core.database import Base
from src.platform.core.migrations import _add_agent_automation_actor_columns
from src.platform.core.models import AgentPolicyRule, AgentTaskExecutionLog

AUTOMATION_TOOLS = [
    "query_device_timeline",
    "run_proactive_patrol",
    "query_system_logs",
    "manage_user_policy",
    "schedule_task",
    "list_scheduled_tasks",
    "cancel_scheduled_task",
    "web_search",
]


def _session_factory() -> Any:
    """内存 SQLite：线程池里的 run_db 与新连接共享同一份库。"""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


def _bind_engine(factory: Any) -> Any:
    """取出 sessionmaker 绑定的引擎，便于用例结束时 dispose（避免 ResourceWarning）。"""
    return factory.kw["bind"]


class _FakeTools:
    """工具服务替身：记录调用，按工具名返回预设结果。"""

    def __init__(self, states: dict[str, str] | None = None) -> None:
        self.states = states or {}
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, name: str, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        self.calls.append((name, dict(args)))
        if name == "get_entity_state":
            entity_id = str(args.get("entity_id") or "")
            return {"state": self.states.get(entity_id, "")}
        return {"success": True}

    def control_calls(self) -> list[tuple[str, dict[str, Any]]]:
        return [call for call in self.calls if call[0] != "get_entity_state"]


class PolicyConflictTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.session_factory = _session_factory()
        self.addCleanup(_bind_engine(self.session_factory).dispose)
        self.policy = AgentPolicyService(self.session_factory)
        self.actor = AgentActor(user_id="u1", username="alice")

    async def test_conflict_then_force_override(self) -> None:
        payload = {
            "name": "客厅无人关灯",
            "areaId": "living",
            "areaName": "客厅",
            "targetDomains": ["light", "switch"],
            "idleMinutes": 30,
        }
        first = await self.policy.create_rule(payload, self.actor)
        self.assertTrue(first["ok"], first)

        second = await self.policy.create_rule({**payload, "name": "客厅再关灯"}, self.actor)
        self.assertFalse(second["ok"])
        self.assertEqual(len(second["conflicts"]), 1)
        self.assertEqual(second["conflicts"][0]["overlapDomains"], ["light", "switch"])

        forced = await self.policy.create_rule({**payload, "name": "客厅强制关灯"}, self.actor, force_override=True)
        self.assertTrue(forced["ok"], forced)
        self.assertEqual(len(await self.policy.list_rules()), 2)

    async def test_different_area_is_not_a_conflict(self) -> None:
        base = {"targetDomains": ["light"], "idleMinutes": 15}
        await self.policy.create_rule({**base, "name": "客厅", "areaId": "living"}, self.actor)
        other = await self.policy.create_rule({**base, "name": "卧室", "areaId": "bedroom"}, self.actor)
        self.assertTrue(other["ok"], other)

    async def test_match_watchdog_policy_respects_threshold(self) -> None:
        await self.policy.create_rule(
            {"name": "客厅 30 分钟", "areaId": "living", "targetDomains": ["light"], "idleMinutes": 30},
            self.actor,
        )
        await self.policy.create_rule(
            {"name": "全屋 90 分钟", "areaId": "", "targetDomains": ["switch"], "idleMinutes": 90},
            self.actor,
        )
        matched = await self.policy.match_watchdog_policy("living", ["light", "switch"], 45)
        self.assertEqual([rule["name"] for rule in matched], ["客厅 30 分钟"])
        # 无人的时长不够长时，阈值更高的规则不命中
        self.assertEqual(await self.policy.match_watchdog_policy("living", ["switch"], 10), [])

    async def test_update_and_toggle_record_editor(self) -> None:
        """update / toggle 要把操作者写进 ``updatedBy``，创建者仍保留在 ``actor``。"""
        created = await self.policy.create_rule(
            {"name": "客厅无人关灯", "areaId": "living", "targetDomains": ["light"]},
            self.actor,
        )
        self.assertTrue(created["ok"], created)
        rule_id = str(created["rule"]["id"])
        self.assertEqual(created["rule"]["updatedBy"], {})

        editor = AgentActor(user_id="u2", username="bob")
        updated = await self.policy.update_rule(rule_id, {"idleMinutes": 45}, actor=editor)
        self.assertTrue(updated["ok"], updated)
        self.assertEqual(updated["rule"]["updatedBy"]["username"], "bob")

        toggled = await self.policy.toggle_rule(rule_id, False, actor=editor)
        self.assertTrue(toggled["ok"], toggled)
        self.assertEqual(toggled["rule"]["updatedBy"]["userId"], "u2")

    async def test_auto_close_only_for_low_risk_domains(self) -> None:
        created = await self.policy.create_rule(
            {
                "name": "含门锁的规则",
                "areaId": "living",
                "targetDomains": ["light", "lock"],
                "idleMinutes": 30,
                "autoClose": True,
            },
            self.actor,
        )
        self.assertEqual(created["rule"]["targetDomains"], ["light"])


class SchedulerPreconditionTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.session_factory = _session_factory()
        self.addCleanup(_bind_engine(self.session_factory).dispose)
        self.tools = _FakeTools({"light.living": "off"})
        self.scheduler = AgentSchedulerService(self.session_factory, tools=self.tools, jobs=None)
        self.actor = AgentActor(user_id="u1", username="alice")

    async def _create_due_task(self, precondition: dict[str, Any]) -> str:
        created = await self.scheduler.create_task(
            {
                "name": "睡前关客厅灯",
                "scheduleType": "ONCE",
                "runAt": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
                "actionTool": "control_device",
                "actionArgs": {"domain": "light", "service": "turn_off", "entity_id": "light.living"},
                "precondition": precondition,
            },
            self.actor,
        )
        self.assertTrue(created["ok"], created)
        return str(created["task"]["id"])

    async def test_precondition_met_skips_action(self) -> None:
        task_id = await self._create_due_task({"entityId": "light.living", "expectedState": "off"})
        results = await self.scheduler.tick()
        self.assertEqual([item["status"] for item in results], ["skipped"])
        self.assertEqual(self.tools.control_calls(), [])
        logs = await self.scheduler.list_logs(task_id)
        self.assertEqual(logs[0]["status"], "skipped")

    async def test_precondition_not_met_runs_action(self) -> None:
        task_id = await self._create_due_task({"entityId": "light.living", "expectedState": "on"})
        results = await self.scheduler.tick()
        self.assertEqual([item["status"] for item in results], ["success"])
        self.assertEqual(self.tools.control_calls()[0][0], "control_device")
        tasks = await self.scheduler.list_tasks()
        self.assertEqual(tasks[0]["runCount"], 1)
        self.assertEqual(len(await self.scheduler.list_logs(task_id)), 1)

    async def test_recurring_cron_computes_next_run(self) -> None:
        created = await self.scheduler.create_task(
            {
                "name": "每天 22:00 关灯",
                "scheduleType": "RECURRING",
                "time": "22:00",
                "actionTool": "control_device",
                "actionArgs": {"domain": "light", "service": "turn_off", "entity_id": "light.living"},
            },
            self.actor,
        )
        self.assertTrue(created["ok"], created)
        self.assertEqual(created["task"]["cron"], "0 22 * * *")
        self.assertIsNotNone(created["task"]["nextRunAt"])

    async def test_delay_minutes_rejects_none_and_bool(self) -> None:
        """``delayMinutes`` 缺省或为 bool 时不能悄悄变成「1 分钟后执行」。"""
        payload = {
            "name": "10 分钟后关灯",
            "scheduleType": "ONCE",
            "actionTool": "control_device",
            "actionArgs": {"domain": "light", "service": "turn_off", "entity_id": "light.living"},
        }
        missing = await self.scheduler.create_task(dict(payload), self.actor)
        self.assertFalse(missing["ok"], missing)
        flagged = await self.scheduler.create_task({**payload, "delayMinutes": True}, self.actor)
        self.assertFalse(flagged["ok"], flagged)
        created = await self.scheduler.create_task({**payload, "delayMinutes": 10}, self.actor)
        self.assertTrue(created["ok"], created)
        self.assertIsNotNone(created["task"]["runAt"])

    async def test_expired_execution_logs_are_pruned(self) -> None:
        """执行日志超过保留期要被清掉，避免表无限增长。"""
        old = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=120)
        with self.session_factory() as session:
            session.add(
                AgentTaskExecutionLog(
                    task_id="gone",
                    started_at=old,
                    finished_at=old,
                    status="success",
                    message="",
                    result="{}",
                )
            )
            session.commit()
        cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=90)
        self.assertEqual(self.scheduler._prune_logs_sync(cutoff), 1)
        self.assertEqual(self.scheduler._prune_logs_sync(cutoff), 0)

    async def test_update_recomputes_once_task_from_delay_minutes(self) -> None:
        """PUT 只传 delayMinutes 时必须重算 runAt，而不是静默忽略。"""
        created = await self.scheduler.create_task(
            {
                "name": "稍后关灯",
                "scheduleType": "ONCE",
                "delayMinutes": 5,
                "actionTool": "control_device",
                "actionArgs": {"domain": "light", "service": "turn_off", "entity_id": "light.living"},
            },
            self.actor,
        )
        self.assertTrue(created["ok"], created)
        before = created["task"]["runAt"]
        updated = await self.scheduler.update_task(str(created["task"]["id"]), {"delayMinutes": 120})
        self.assertTrue(updated["ok"], updated)
        self.assertNotEqual(updated["task"]["runAt"], before)
        self.assertEqual(updated["task"]["nextRunAt"], updated["task"]["runAt"])


class TimelineAttributionTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.session_factory = _session_factory()
        self.addCleanup(_bind_engine(self.session_factory).dispose)
        self.timeline = AgentTimelineService(self.session_factory)

    def test_trigger_source_attribution(self) -> None:
        self.timeline.mark_local_control("light.living", "alice")
        self.assertEqual(self.timeline._resolve_source("light.living", {}), (SOURCE_MANUAL, "alice"))
        self.assertEqual(self.timeline._resolve_source("light.kitchen", {"user_id": "u9"}), (SOURCE_MANUAL, "u9"))
        self.assertEqual(self.timeline._resolve_source("light.study", {"parent_id": "p1"}), (SOURCE_AUTOMATION, ""))
        self.assertEqual(self.timeline._resolve_source("light.hall", {}), (SOURCE_EXTERNAL, ""))

    async def test_duration_is_settled_on_next_flip(self) -> None:
        now = datetime.now(UTC).replace(tzinfo=None)
        for minutes, new_state in ((120, "on"), (60, "off")):
            await self.timeline._record(
                {
                    "entity_id": "light.living",
                    "old_state": "off" if new_state == "on" else "on",
                    "new_state": new_state,
                    "changed_at": (now - timedelta(minutes=minutes)).isoformat(),
                    "context": {},
                }
            )
        rows = await self.timeline.query(entity_id="light.living", hours=24)
        self.assertEqual(rows[0]["newState"], "off")
        self.assertEqual(rows[1]["durationSeconds"], 3600)
        self.assertEqual(rows[1]["triggerSource"], SOURCE_EXTERNAL)


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
