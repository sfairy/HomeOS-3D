"""A1 回归：家庭模式动作不得绕过服务白名单与命令通道。

覆盖两层：

1. **写时**：``validate_mode_actions`` 拒绝任意执行服务（``shell_command`` /
   ``python_script`` / ``automation``）、非法实体形态、白名单外的服务与字段；
2. **运行时**：``_execute_home_mode_action`` 对存量非法动作不下发并记
   ``service_not_allowed``；``HomeModeService._call_service`` 在有命令通道时走它，
   没通道时才退回直连连接器。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.home_mode import actions as home_mode_actions
from src.domains.home_mode import service as home_mode_service
from src.domains.home_mode import validation as home_mode_validation


def _run(coro):
    return asyncio.run(coro)


class WriteTimeValidationTests(unittest.TestCase):
    def assert_rejected(self, action: dict[str, Any], fragment: str) -> None:
        with self.assertRaises(home_mode_validation.ModeActionRejected) as ctx:
            home_mode_validation.validate_mode_action(action)
        self.assertIn(fragment, ctx.exception.detail)

    def test_shell_command_domain_rejected(self) -> None:
        self.assert_rejected(
            {"entity_id": "shell_command.reboot", "domain": "shell_command", "service": "reboot"},
            "不允许执行",
        )

    def test_python_script_domain_rejected(self) -> None:
        self.assert_rejected(
            {"entity_id": "python_script.wipe", "domain": "python_script", "service": "wipe"},
            "不允许执行",
        )

    def test_automation_domain_rejected(self) -> None:
        self.assert_rejected(
            {"entity_id": "automation.x", "domain": "automation", "service": "trigger"},
            "不允许执行",
        )

    def test_unknown_service_rejected(self) -> None:
        with self.assertRaises(home_mode_validation.ModeActionRejected) as ctx:
            home_mode_validation.validate_mode_action({"entity_id": "light.a", "domain": "light", "service": "explode"})
        self.assertIn("不在允许列表", ctx.exception.detail)

    def test_unknown_field_rejected(self) -> None:
        with self.assertRaises(home_mode_validation.ModeActionRejected) as ctx:
            home_mode_validation.validate_mode_action(
                {"entity_id": "light.a", "domain": "light", "service": "turn_on", "service_data": {"evil": 1}}
            )
        self.assertIn("服务参数不允许", ctx.exception.detail)

    def test_malformed_entity_rejected(self) -> None:
        with self.assertRaises(home_mode_validation.ModeActionRejected) as ctx:
            home_mode_validation.validate_mode_action(
                {"entity_id": "这不是实体", "domain": "light", "service": "turn_on"}
            )
        self.assertIn("实体 id 形态不合法", ctx.exception.detail)

    def test_index_reported(self) -> None:
        with self.assertRaises(home_mode_validation.ModeActionRejected) as ctx:
            home_mode_validation.validate_mode_actions(
                [
                    {"entity_id": "light.a", "domain": "light", "service": "turn_on", "service_data": {}},
                    {"entity_id": "shell_command.x", "domain": "shell_command", "service": "x"},
                ]
            )
        self.assertEqual(ctx.exception.index, 1)
        self.assertIn("第 2 个动作", ctx.exception.message())

    def test_notify_and_security_actions_skip_service_rules(self) -> None:
        # notify 的 entity_id 是消息文本、security 是布防档位，都不该被当成设备实体。
        home_mode_validation.validate_mode_actions(
            [
                {"kind": "notify", "entity_id": "该睡觉了", "domain": None, "service": None},
                {"kind": "security", "entity_id": "armed_night", "domain": None, "service": None},
            ]
        )

    def test_valid_device_actions_pass(self) -> None:
        home_mode_validation.validate_mode_actions(
            [
                {
                    "entity_id": "light.a",
                    "domain": "light",
                    "service": "turn_on",
                    "service_data": {"brightness_pct": 60},
                },
                {
                    "entity_id": "cover.b",
                    "domain": "cover",
                    "service": "set_cover_position",
                    "service_data": {"position": 30},
                },
                {"entity_id": "climate.c", "domain": "climate", "service": "turn_on", "service_data": {}},
            ]
        )


class RuntimeFallbackTests(unittest.TestCase):
    def test_legacy_illegal_action_not_dispatched(self) -> None:
        calls: list[tuple[str, str, str]] = []

        class _Deps:
            def warn(self, message: str) -> None:
                pass

            async def call_service(self, domain: str, service: str, entity_id: str, data: dict[str, Any]):
                calls.append((domain, service, entity_id))
                return []

            async def fetch_entity_state(self, entity_id: str):
                return None

        result = _run(
            home_mode_actions._execute_home_mode_action(
                _Deps(),
                {"entity_id": "shell_command.x", "domain": "shell_command", "service": "x"},
            )
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "service_not_allowed")
        self.assertEqual(calls, [])

    def test_legal_action_is_dispatched(self) -> None:
        calls: list[tuple[str, str, str]] = []

        class _Deps:
            def warn(self, message: str) -> None:
                pass

            async def call_service(self, domain: str, service: str, entity_id: str, data: dict[str, Any]):
                calls.append((domain, service, entity_id))
                return []

            async def fetch_entity_state(self, entity_id: str):
                return None

        with patch.object(
            home_mode_actions,
            "describe_service_verification",
            return_value={"supported": True, "verified": True, "reason": "ok"},
        ):
            result = _run(
                home_mode_actions._execute_home_mode_action(
                    _Deps(),
                    {"entity_id": "light.a", "domain": "light", "service": "turn_on", "service_data": {}},
                )
            )

        self.assertTrue(result["success"])
        self.assertEqual(calls, [("light", "turn_on", "light.a")])


class CommandProxyRoutingTests(unittest.TestCase):
    def _service(self, proxy):
        return home_mode_service.HomeModeService(
            session_factory=lambda: None,
            ha_connector=SimpleNamespace(call_service=_direct_call_recorder()),
            state_store=SimpleNamespace(),
            command_proxy=proxy,
        )

    def test_uses_command_proxy_when_available(self) -> None:
        seen: list[dict[str, Any]] = []

        class _Proxy:
            async def call_service(self, dto: dict[str, Any], *, policy: str | None = "http"):
                seen.append(dto)
                return {"success": True, "data": [{"entity_id": dto["entity_id"], "state": "on"}]}

        service = self._service(_Proxy())

        result = _run(service._call_service("light", "turn_on", "light.a", {}))

        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0]["entity_id"], "light.a")
        self.assertEqual(result, [{"entity_id": "light.a", "state": "on"}])

    def test_falls_back_to_connector_without_proxy(self) -> None:
        recorder = _direct_call_recorder()
        service = home_mode_service.HomeModeService(
            session_factory=lambda: None,
            ha_connector=SimpleNamespace(call_service=recorder),
            state_store=SimpleNamespace(),
        )

        _run(service._call_service("light", "turn_on", "light.a", {}))

        self.assertEqual(recorder.calls, [("light", "turn_on", "light.a", {})])


class _direct_call_recorder:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str, dict[str, Any]]] = []

    async def __call__(self, domain: str, service: str, entity_id: str, data: dict[str, Any]):
        self.calls.append((domain, service, entity_id, data))
        return []


if __name__ == "__main__":
    unittest.main()
