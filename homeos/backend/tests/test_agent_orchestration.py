"""编排层 P0 修复的回归：预算口径、混合批量确认、控制名单、场景三态、整轮超时。

这些点单看都是「一行判断」，但错了就会直接造成错误控制或错误扣费，而且不会有异常
栈提示。这里把它们锁成可执行的契约，避免后续重构又改回去。

运行：node ops/lib/py.mjs -m unittest homeos/backend/tests/test_agent_orchestration.py -v
"""

from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.agent.runtime.agent_actor import AgentActor
from src.domains.agent.runtime.audit import CONTROL_TOOL_NAMES
from src.domains.agent.runtime.batch_ops import BatchOperationService
from src.domains.agent.runtime.service import (
    MAX_PROMPT_TOKENS_PER_REQUEST,
    MAX_SESSION_PROMPT_TOKENS,
    AgentService,
    _ChatRunContext,
    _needs_batch_confirmation,
)
from src.domains.agent.tools.home_tools_automation import HomeToolsAutomationMixin
from src.domains.agent.tools.home_tools_scenes import HomeToolsScenesMixin


class _FakeStateStore:
    def __init__(self, entities: list[dict]) -> None:
        self._entities = entities

    def get_all(self) -> list[dict]:
        return self._entities


def _call(name: str, **arguments: object) -> SimpleNamespace:
    return SimpleNamespace(name=name, arguments=arguments)


class TokenBudgetTest(unittest.TestCase):
    def test_per_request_budget_is_separate_from_turn_budget(self) -> None:
        """单请求上限必须远小于整轮累计上限，且两者都不能是旧的 30k。"""
        self.assertEqual(MAX_PROMPT_TOKENS_PER_REQUEST, 48_000)
        self.assertEqual(MAX_SESSION_PROMPT_TOKENS, 240_000)
        self.assertGreater(MAX_SESSION_PROMPT_TOKENS, MAX_PROMPT_TOKENS_PER_REQUEST)


class MixedBatchConfirmationTest(unittest.TestCase):
    def test_two_controls_plus_a_query_needs_confirmation(self) -> None:
        calls = [
            _call("control_device", entity_id="light.a", service="turn_off"),
            _call("control_device", entity_id="light.b", service="turn_off"),
            _call("get_entity_state", entity_id="sensor.humidity"),
        ]
        control_calls = [call for call in calls if call.name in CONTROL_TOOL_NAMES]
        self.assertTrue(_needs_batch_confirmation(control_calls))

    def test_single_control_with_query_runs_directly(self) -> None:
        """一控制 + 一查询是日常用法，确认会把正常请求变成两步操作。"""
        control_calls = [_call("control_device", entity_id="light.a")]
        self.assertFalse(_needs_batch_confirmation(control_calls))

    def test_control_room_always_confirms(self) -> None:
        self.assertTrue(_needs_batch_confirmation([_call("control_room", room="客厅")]))

    def test_query_only_batch_never_confirms(self) -> None:
        self.assertFalse(_needs_batch_confirmation([]))


class ControlToolSetTest(unittest.TestCase):
    def test_fine_grained_controls_are_in_the_set(self) -> None:
        for name in (
            "set_light_brightness",
            "set_cover_position",
            "media_control",
            "activate_home_mode",
        ):
            self.assertIn(name, CONTROL_TOOL_NAMES)

    def test_queries_are_not_controls(self) -> None:
        for name in ("get_entity_state", "get_home_status", "query_camera"):
            self.assertNotIn(name, CONTROL_TOOL_NAMES)


class _BatchHost:
    """只为 ``_stage_batch`` 提供最小依赖（不需要真实设备 / 状态库）。"""

    def __init__(self) -> None:
        self._batch_ops = BatchOperationService()
        self._lang_templates = None

    @property
    def _L(self):
        return SimpleNamespace(lang="en", cache_confirm_prompt="confirm {tool}")


def _stage(host: _BatchHost, summary: str, lang: str = "en") -> dict:
    service = object.__new__(AgentService)
    service._batch_ops = host._batch_ops
    # ``_L`` 是生产属性，这里换成固定语言的模板替身
    service._lang_templates = SimpleNamespace(current=SimpleNamespace(lang=lang))
    ctx = SimpleNamespace(start_ms=0, session_id="s1", actor=None)
    response = AgentService._stage_batch(service, ctx, [("control_device", {"entity_id": "light.a"})], summary)
    return response.to_dict()


class StructuredConfirmationTest(unittest.TestCase):
    def test_confirmation_contract_has_all_frontend_fields(self) -> None:
        payload = _stage(_BatchHost(), "关掉客厅的两盏灯", lang="zh")
        confirmation = payload["confirmation"]
        self.assertEqual(confirmation["kind"], "batch")
        self.assertEqual(confirmation["confirmText"], "确认")
        self.assertEqual(confirmation["cancelText"], "取消")
        self.assertEqual(confirmation["expiresInSeconds"], 60)
        self.assertEqual(payload["earcon"], "confirm")

    def test_english_confirmation_uses_english_words(self) -> None:
        payload = _stage(_BatchHost(), "turn off two lights", lang="en")
        self.assertEqual(payload["confirmation"]["confirmText"], "confirm")
        self.assertEqual(payload["confirmation"]["cancelText"], "cancel")
        self.assertIn("Reply", payload["reply"])


class TurnDeadlineTest(unittest.TestCase):
    def _ctx(self, deadline_at: float) -> _ChatRunContext:
        return _ChatRunContext(
            user_message="开灯",
            history=[],
            options=None,
            state={},
            actor=None,
            start_ms=0,
            deadline_at=deadline_at,
        )

    def test_unset_deadline_never_expires(self) -> None:
        ctx = self._ctx(0.0)
        self.assertIsNone(ctx.remaining_seconds())
        self.assertFalse(ctx.turn_expired())

    def test_past_deadline_expires(self) -> None:
        ctx = self._ctx(time.monotonic() - 1)
        self.assertTrue(ctx.turn_expired())

    def test_future_deadline_has_remaining_budget(self) -> None:
        ctx = self._ctx(time.monotonic() + 30)
        remaining = ctx.remaining_seconds()
        self.assertIsNotNone(remaining)
        assert remaining is not None
        self.assertGreater(remaining, 25)
        self.assertFalse(ctx.turn_expired())


class SceneResultPassthroughTest(unittest.TestCase):
    class _Host(HomeToolsScenesMixin):
        def __init__(self, result: dict) -> None:
            self._result = result
            self._state_store = _FakeStateStore([{"entity_id": "scene.movie", "attributes": {"friendly_name": "观影"}}])
            self._command_proxy = self

        async def _scene_voice_gate(self) -> SimpleNamespace:
            return SimpleNamespace(enabled=True, allow=["scene.movie"])

        async def _assert_actor_may_control(self, actor, args) -> dict:
            return {"ok": True}

        async def call_service(self, args: dict) -> dict:
            return self._result

    async def _run(self, result: dict) -> dict:
        return await self._Host(result)._activate_scene({"scene": "观影"}, AgentActor(user_id="u1"))

    def _run_sync(self, result: dict) -> dict:
        import asyncio

        return asyncio.run(self._run(result))

    def test_unverified_scene_bubbles_verification(self) -> None:
        """HA 收下但无法校验时，顶层仍算下发成功，但必须透传 verified=None 供审计记三态。"""
        payload = self._run_sync(
            {"success": True, "verified": None, "verification": {"supported": True, "verified": None}}
        )
        self.assertIs(payload["success"], True)
        self.assertIn("verification", payload)
        self.assertIsNone(payload["verified"])

    def test_blocked_scene_bubbles_up(self) -> None:
        payload = self._run_sync({"success": False, "blocked": True, "message": "被家规拦截"})
        self.assertIs(payload["success"], False)
        self.assertIs(payload["blocked"], True)
        self.assertEqual(payload["message"], "被家规拦截")

    def test_confirmed_scene_is_success(self) -> None:
        payload = self._run_sync({"success": True, "verified": True})
        self.assertIs(payload["success"], True)


class _CancelHost:
    _scheduler = None

    def _requires_actor(self, actor):
        if actor is None:
            return {"success": False, "blocked": True, "message": "未绑定执行身份"}
        return None


class CancelScheduledTaskAuthTest(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_without_actor_is_blocked(self) -> None:
        result = await HomeToolsAutomationMixin._cancel_scheduled_task(_CancelHost(), {"task_id": "t1"}, None)
        self.assertIs(result["blocked"], True)
        self.assertIs(result["success"], False)

    async def test_cancel_with_actor_reaches_scheduler(self) -> None:
        calls: list[str] = []

        class _Scheduler:
            async def delete_task(self, task_id: str, actor=None) -> dict:
                calls.append(task_id)
                return {"ok": True}

        host = _CancelHost()
        host._scheduler = _Scheduler()
        result = await HomeToolsAutomationMixin._cancel_scheduled_task(
            host, {"task_id": "t1"}, AgentActor(user_id="u1")
        )
        self.assertIs(result["ok"], True)
        self.assertEqual(calls, ["t1"])


if __name__ == "__main__":
    unittest.main()
