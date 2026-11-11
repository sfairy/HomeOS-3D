"""C2 / C3 / A4 回归：控制时延与串行化。

1. 远程学习超时按上限封顶（否则一条请求可占住控制池槽位两小时）；
2. 同一实体的命令串行执行，不同实体仍并发；
3. 安防联动重放只包含可逆动作（脚本 / 通知 / shell 不在重放集合内）。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.ha.integration.service_timeouts import (
    REMOTE_LEARNING_MAX_TIMEOUT,
)
from src.domains.ha.integration.service_timeouts import (
    remote_learning_timeout as _remote_learning_timeout,
)
from src.domains.proxy.command_proxy import CommandProxyService
from src.domains.security.linkage_actions import is_replayable_action as _is_replayable_action


def _run(coro):
    return asyncio.run(coro)


class RemoteLearningTimeoutTests(unittest.TestCase):
    def test_capped(self) -> None:
        timeout = _remote_learning_timeout({"timeout": 60, "command": ["a"] * 64, "command_type": "rf"})
        self.assertEqual(timeout, float(REMOTE_LEARNING_MAX_TIMEOUT))

    def test_small_request_still_scaled(self) -> None:
        timeout = _remote_learning_timeout({"timeout": 10, "command": ["a"] * 2})
        self.assertEqual(timeout, 35.0)

    def test_invalid_values_fall_back(self) -> None:
        timeout = _remote_learning_timeout({"timeout": "abc", "command": "not-a-list"})
        self.assertEqual(timeout, 75.0)


class _OrderRecorder:
    def __init__(self) -> None:
        self.events: list[str] = []

    async def call_service(self, domain, service, entity_id, data, return_response, key):
        self.events.append(f"start:{entity_id}:{service}")
        await asyncio.sleep(0.01)
        self.events.append(f"end:{entity_id}:{service}")
        return []


class EntitySerializationTests(unittest.TestCase):
    def _service(self) -> tuple[CommandProxyService, _OrderRecorder]:
        recorder = _OrderRecorder()
        proxy = CommandProxyService(session_factory=lambda: None, connector=recorder)
        return proxy, recorder

    def test_same_entity_is_serialized(self) -> None:
        proxy, recorder = self._service()

        async def _scenario() -> None:
            await asyncio.gather(
                proxy._call_connector_serialized("cover", "open_cover", "cover.a", {}, False, None),
                proxy._call_connector_serialized("cover", "close_cover", "cover.a", {}, False, None),
            )

        _run(_scenario())

        self.assertEqual(
            recorder.events,
            [
                "start:cover.a:open_cover",
                "end:cover.a:open_cover",
                "start:cover.a:close_cover",
                "end:cover.a:close_cover",
            ],
        )

    def test_different_entities_run_concurrently(self) -> None:
        proxy, recorder = self._service()

        async def _scenario() -> None:
            await asyncio.gather(
                proxy._call_connector_serialized("light", "turn_on", "light.a", {}, False, None),
                proxy._call_connector_serialized("light", "turn_on", "light.b", {}, False, None),
            )

        _run(_scenario())

        # 并发：两条 start 都在任一 end 之前。
        starts = [index for index, item in enumerate(recorder.events) if item.startswith("start:")]
        first_end = next(index for index, item in enumerate(recorder.events) if item.startswith("end:"))
        self.assertEqual(len(starts), 2)
        self.assertTrue(all(index < first_end for index in starts))

    def test_lock_table_is_bounded(self) -> None:
        proxy, _recorder = self._service()
        for index in range(600):
            proxy._entity_lock(f"light.{index}")
        self.assertLessEqual(len(proxy._entity_locks), 512)


class ReplayableActionTests(unittest.TestCase):
    def test_state_actions_are_replayable(self) -> None:
        for action in (
            {"domain": "light", "service": "turn_on"},
            {"domain": "lock", "service": "lock"},
            {"domain": "valve", "service": "close_valve"},
            {"domain": "cover", "service": "close_cover"},
        ):
            self.assertTrue(_is_replayable_action(action), action)

    def test_irreversible_actions_are_not_replayed(self) -> None:
        for action in (
            {"domain": "script", "service": "turn_on", "entity_id": "script.x"},
            {"domain": "notify", "service": "send_message", "entity_id": "notify.x"},
            {"domain": "shell_command", "service": "x", "entity_id": "shell_command.x"},
            {"domain": "scene", "service": "turn_on", "entity_id": "scene.x"},
            {"domain": "tts", "service": "speak", "entity_id": "tts.x"},
        ):
            self.assertFalse(_is_replayable_action(action), action)

    def test_domain_inferred_from_entity_id(self) -> None:
        self.assertTrue(_is_replayable_action({"service": "turn_off", "entity_id": "light.a"}))
        self.assertFalse(_is_replayable_action({"service": "turn_on", "entity_id": "automation.a"}))


if __name__ == "__main__":
    unittest.main()
