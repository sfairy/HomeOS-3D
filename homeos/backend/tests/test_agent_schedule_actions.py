"""计划任务的动作分流：设备 / 场景 / 家庭模式三种目标。

schema 一直宣称 ``schedule_task`` 支持 ``activate_scene`` / ``activate_home_mode``，
实现却把 ``actionTool`` 写死成 ``control_device``，动作白名单也只放 ``control_device``
—— 模型照着 schema 说「每晚十点切到观影场景」，要么被白名单拒掉，要么被当成
「控制某台场景实体」而走错判定。

这里锁住两半：``_scheduled_action`` 的参数分流，以及调度器白名单 / 执行链路真的
认这两个动作。

运行：node ops/lib/py.mjs -m unittest homeos/backend/tests/test_agent_schedule_actions.py -v
"""

from __future__ import annotations

import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.agent.policy.scheduler import (
    ALLOWED_ACTION_TOOLS,
    SYSTEM_NOTIFY_ACTOR,
    AgentSchedulerService,
)
from src.domains.agent.runtime.agent_actor import AgentActor
from src.domains.agent.tools.home_tools_automation import _action_label, _scheduled_action

from tests.agent_automation_support import _bind_engine, _FakeTools, _session_factory


class ScheduledActionTest(unittest.TestCase):
    def test_device_action_keeps_precondition(self) -> None:
        tool, args, precondition, error = _scheduled_action(
            {"entity_id": "light.living", "service": "turn_off", "expected_state": "off"}
        )
        self.assertIsNone(error)
        self.assertEqual(tool, "control_device")
        self.assertEqual(args, {"domain": "light", "service": "turn_off", "entity_id": "light.living"})
        self.assertEqual(precondition, {"entityId": "light.living", "expectedState": "off"})

    def test_device_action_infers_domain(self) -> None:
        _, args, _, _ = _scheduled_action({"entity_id": "cover.kitchen", "service": "close_cover"})
        self.assertEqual(args["domain"], "cover")

    def test_scene_action_needs_no_entity_or_service(self) -> None:
        tool, args, precondition, error = _scheduled_action({"scene": "观影"})
        self.assertIsNone(error)
        self.assertEqual(tool, "activate_scene")
        self.assertEqual(args, {"scene": "观影"})
        self.assertEqual(precondition, {})

    def test_scene_action_carries_entity_id_when_given(self) -> None:
        _, args, _, _ = _scheduled_action({"scene": "观影", "entity_id": "scene.movie"})
        self.assertEqual(args, {"scene": "观影", "entity_id": "scene.movie"})

    def test_mode_action(self) -> None:
        tool, args, precondition, error = _scheduled_action({"mode": "睡眠"})
        self.assertIsNone(error)
        self.assertEqual(tool, "activate_home_mode")
        self.assertEqual(args, {"name": "睡眠"})
        self.assertEqual(precondition, {})

    def test_scene_and_mode_take_priority_over_device(self) -> None:
        """同时给了 entity_id / service 时，场景与模式优先 —— 它们的目标更具体。"""
        tool, _, _, _ = _scheduled_action({"scene": "观影", "entity_id": "light.a", "service": "turn_on"})
        self.assertEqual(tool, "activate_scene")
        tool, _, _, _ = _scheduled_action({"mode": "离家", "entity_id": "light.a", "service": "turn_on"})
        self.assertEqual(tool, "activate_home_mode")

    def test_missing_action_is_an_error(self) -> None:
        tool, args, precondition, error = _scheduled_action({"name": "什么都没有"})
        self.assertIsNotNone(error)
        self.assertEqual((tool, args, precondition), ("", {}, {}))

    def test_device_action_requires_both_entity_and_service(self) -> None:
        _, _, _, error = _scheduled_action({"entity_id": "light.a"})
        self.assertIsNotNone(error)

    def test_default_name_is_readable(self) -> None:
        self.assertEqual(_action_label("activate_scene", {"scene": "观影"}), "场景 观影")
        self.assertEqual(_action_label("activate_home_mode", {"name": "睡眠"}), "家庭模式 睡眠")
        self.assertEqual(
            _action_label("control_device", {"entity_id": "light.a", "service": "turn_off"}),
            "light.a turn_off",
        )

    def test_whitelist_matches_schema(self) -> None:
        """schema 宣称的三种动作都要在白名单里，否则模型照 schema 传参必被拒。"""
        for tool in ("control_device", "activate_scene", "activate_home_mode", "send_notification"):
            self.assertIn(tool, ALLOWED_ACTION_TOOLS)
        self.assertNotIn("web_search", ALLOWED_ACTION_TOOLS)

    def test_message_action_is_a_reminder(self) -> None:
        """「10 分钟后提醒我关火」必须变成通知，而不是控制某台设备。"""
        tool, args, precondition, error = _scheduled_action({"message": "关火", "title": "厨房"})
        self.assertIsNone(error)
        self.assertEqual(tool, "send_notification")
        self.assertEqual(args["message"], "关火")
        self.assertEqual(args["title"], "厨房")
        # 用户明确要求的时间点不能被免打扰吞掉
        self.assertIs(args["bypass_dnd"], True)
        self.assertEqual(precondition, {})

    def test_message_is_mutually_exclusive_with_device_actions(self) -> None:
        _, _, _, error = _scheduled_action(
            {"message": "关火", "entity_id": "switch.stove", "service": "turn_off"}
        )
        self.assertIsNotNone(error)


class SchedulerActionExecutionTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.session_factory = _session_factory()
        self.addCleanup(_bind_engine(self.session_factory).dispose)
        self.tools = _FakeTools({"light.living": "off"})
        self.scheduler = AgentSchedulerService(self.session_factory, tools=self.tools, jobs=None)
        self.actor = AgentActor(user_id="u1", username="alice")

    async def _due_task(self, action_tool: str, action_args: dict) -> dict:
        return await self.scheduler.create_task(
            {
                "name": f"{action_tool} 到期任务",
                "scheduleType": "ONCE",
                "runAt": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
                "actionTool": action_tool,
                "actionArgs": action_args,
            },
            self.actor,
        )

    async def test_scene_task_runs(self) -> None:
        created = await self._due_task("activate_scene", {"scene": "观影"})
        self.assertTrue(created["ok"], created)
        results = await self.scheduler.tick()
        self.assertEqual([item["status"] for item in results], ["success"])
        self.assertEqual(self.tools.control_calls()[0], ("activate_scene", {"scene": "观影"}))

    async def test_home_mode_task_runs(self) -> None:
        created = await self._due_task("activate_home_mode", {"name": "睡眠"})
        self.assertTrue(created["ok"], created)
        results = await self.scheduler.tick()
        self.assertEqual([item["status"] for item in results], ["success"])
        self.assertEqual(self.tools.control_calls()[0][0], "activate_home_mode")

    async def test_unlisted_action_is_still_rejected(self) -> None:
        """白名单放宽到三种动作，不等于任意工具都能挂到定时器上。"""
        created = await self._due_task("web_search", {"query": "天气"})
        self.assertFalse(created["ok"], created)

    async def test_reminder_runs_without_creator_actor(self) -> None:
        """创建者身份解绑后，提醒仍应到点送达：用系统执行体，而不是静默失败。"""
        seen: list[object] = []

        class _ActorTools:
            async def execute(self, name: str, args: dict, actor=None) -> dict:
                seen.append(actor)
                return {"success": True, "message": "已发送"}

        scheduler = AgentSchedulerService(self.session_factory, tools=_ActorTools(), jobs=None)
        created = await scheduler.create_task(
            {
                "name": "关火提醒",
                "scheduleType": "ONCE",
                "runAt": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
                "actionTool": "send_notification",
                "actionArgs": {"message": "关火", "bypass_dnd": True},
            },
            None,
        )
        self.assertTrue(created["ok"], created)
        results = await scheduler.tick()
        self.assertEqual([item["status"] for item in results], ["success"])
        self.assertEqual(seen[0], SYSTEM_NOTIFY_ACTOR)


if __name__ == "__main__":
    unittest.main()
