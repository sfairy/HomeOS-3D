"""智能管家自动化能力单测：家规 / 计划任务 / 时序 / 看门狗 / 诊断 / 联网搜索 / 工具分发。

用内存 SQLite + 假对象（房间 / 状态库 / 通知）覆盖各服务的判定分支，
不触碰真实 HA、数据库文件与网络。
"""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select as sa_select
from src.domains.agent.memory.timeline import (
    SOURCE_AUTOMATION,
    SOURCE_EXTERNAL,
    SOURCE_MANUAL,
    AgentTimelineService,
)
from src.domains.agent.policy.policy import AgentPolicyService
from src.domains.agent.policy.scheduler import AgentSchedulerService
from src.domains.agent.runtime.agent_actor import AgentActor
from src.platform.core.db.models import (
    AgentScheduledTask,
    AgentTaskExecutionLog,
)

from tests.agent_automation_support import (
    _bind_engine,
    _FakeTools,
    _session_factory,
)


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

    async def test_update_rejects_unsatisfiable_cron(self) -> None:
        """``0 0 31 2 *`` 语法合法但永不成立：更新必须报错，不能静默写成 nextRunAt=None。"""
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
        task_id = str(created["task"]["id"])
        rejected = await self.scheduler.update_task(task_id, {"cron": "0 0 31 2 *"})
        self.assertFalse(rejected["ok"], rejected)
        # 原任务保持可用：cron 与下次执行时间都不能被写坏
        tasks = await self.scheduler.list_tasks()
        self.assertEqual(tasks[0]["cron"], "0 22 * * *")
        self.assertIsNotNone(tasks[0]["nextRunAt"])

    async def test_switch_to_once_without_time_is_rejected(self) -> None:
        """RECURRING → ONCE 却没给 runAt/delayMinutes，不能落成没有时间的一次性任务。"""
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
        rejected = await self.scheduler.update_task(str(created["task"]["id"]), {"scheduleType": "ONCE"})
        self.assertFalse(rejected["ok"], rejected)

    async def test_disabled_task_after_snapshot_is_not_executed(self) -> None:
        """tick 快照之后被停用的任务不能继续执行（HS-BC-06）。"""
        task_id = await self._create_due_task({})
        # 模拟「快照已取、用户随后停用」：直接改库，再走 tick 的执行路径
        with self.session_factory() as session:
            row = (
                session.execute(sa_select(AgentScheduledTask).where(AgentScheduledTask.id == task_id)).scalars().first()
            )
            self.assertIsNotNone(row)
            assert row is not None
            row.enabled = False
            row.next_run_at = None
            session.commit()
        results = await self.scheduler.tick()
        self.assertEqual(results, [])
        self.assertEqual(self.tools.control_calls(), [])
        logs = await self.scheduler.list_logs(task_id)
        self.assertEqual(logs, [])

    async def test_execute_uses_fresh_params_after_update(self) -> None:
        """快照之后改了动作参数：执行必须用新参数，而不是快照里的旧参数。"""
        task_id = await self._create_due_task({})
        stale = {
            "id": task_id,
            "name": "旧快照",
            "scheduleType": "ONCE",
            "cron": "",
            "timezone": "",
            "runAt": None,
            "actionTool": "control_device",
            "actionArgs": {"domain": "light", "service": "turn_off", "entity_id": "light.living"},
            "precondition": {},
            "actor": {},
        }
        updated = await self.scheduler.update_task(
            task_id,
            {
                "actionArgs": {"domain": "switch", "service": "turn_on", "entity_id": "switch.desk"},
                "delayMinutes": 0,
            },
        )
        self.assertTrue(updated["ok"], updated)
        result = await self.scheduler._execute_task(stale)
        self.assertEqual(result["status"], "success", result)
        calls = self.tools.control_calls()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1]["entity_id"], "switch.desk")

    async def test_enable_without_computable_next_run_is_rejected(self) -> None:
        """启用一个算不出下次触发的任务要报错，而不是留一个永远不跑的「已启用」任务。"""
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
        task_id = str(created["task"]["id"])
        # 直接构造一条「启用后也算不出下次触发」的任务（历史脏数据：cron 被清空）
        with self.session_factory() as session:
            row = (
                session.execute(sa_select(AgentScheduledTask).where(AgentScheduledTask.id == task_id)).scalars().first()
            )
            assert row is not None
            row.enabled = False
            row.next_run_at = None
            row.cron = ""
            session.commit()
        rejected = await self.scheduler.toggle_task(task_id, True)
        self.assertFalse(rejected["ok"], rejected)
        tasks = await self.scheduler.list_tasks()
        self.assertFalse(tasks[0]["enabled"])


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
