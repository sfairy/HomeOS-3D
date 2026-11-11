"""C1 回归：三条控制入口的准入判据与成功语义必须等价。

测试对象是**纯函数 + 路由层**，不启动 FastAPI：

1. ``build_control_result``：``ok`` 的唯一判据（受理 / 非 pending / 非 skipped / 未判不一致）；
2. ``_assert_control_allowed``：许可、连接、实体存在性三档拒绝（403 / 409 / 404）；
3. ``CallServiceDto``：实体形态、长度、未知字段收紧；
4. ``execute_service_call``：响应 ``ok`` 不再恒为 True。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import HTTPException
from pydantic import ValidationError
from src.api.proxy import command_proxy as api_command_proxy
from src.api.schemas.command_proxy import CallServiceDto
from src.domains.ha.integration import service_call as ha_service_call
from src.domains.proxy.command_proxy import build_control_result


def _run(coro):
    return asyncio.run(coro)


class ControlResultSemanticsTests(unittest.TestCase):
    def test_accepted_and_verified_is_ok(self) -> None:
        result = build_control_result({"success": True, "verified": True})
        self.assertTrue(result["ok"])
        self.assertFalse(result["pending"])
        self.assertFalse(result["skipped"])

    def test_pending_is_not_ok(self) -> None:
        result = build_control_result({"success": False, "pending": True, "skipped": True})
        self.assertFalse(result["ok"])
        self.assertTrue(result["pending"])

    def test_skipped_is_not_ok(self) -> None:
        self.assertFalse(build_control_result({"success": True, "skipped": True})["ok"])

    def test_verified_false_is_not_ok(self) -> None:
        self.assertFalse(build_control_result({"success": True, "verified": False})["ok"])

    def test_unknown_verification_still_ok(self) -> None:
        # verified=None 是「未确认」（实体不在同步响应里），不等于失败。
        self.assertTrue(build_control_result({"success": True, "verified": None})["ok"])

    def test_non_dict_envelope_is_not_ok(self) -> None:
        self.assertFalse(build_control_result(None)["ok"])


class CallServiceDtoTests(unittest.TestCase):
    def _minimal(self, **overrides: Any) -> dict[str, Any]:
        payload = {"domain": "light", "service": "turn_on", "entity_id": "light.a"}
        payload.update(overrides)
        return payload

    def test_valid_payload_passes(self) -> None:
        dto = CallServiceDto(**self._minimal(service_data={"brightness_pct": 50}))
        self.assertEqual(dto.entity_id, "light.a")

    def test_malformed_entity_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            CallServiceDto(**self._minimal(entity_id="这不是实体"))

    def test_uppercase_domain_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            CallServiceDto(**self._minimal(domain="Light"))

    def test_unknown_field_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            CallServiceDto(**self._minimal(evil="1"))

    def test_data_key_is_normalized(self) -> None:
        dto = CallServiceDto(**{**self._minimal(), "data": {"brightness_pct": 10}})
        self.assertEqual(dto.service_data, {"brightness_pct": 10})


class ControlEntryGuardTests(unittest.TestCase):
    """``/services/call`` 的许可 / 连接 / 实体三档校验。"""

    def _request(self, *, allows: bool = True, connection: Any = "conn", entity_exists: bool = True):
        license_service = SimpleNamespace(allows=lambda feature: allows)
        database = SimpleNamespace()
        return (
            SimpleNamespace(
                app=SimpleNamespace(
                    state=SimpleNamespace(license_service=license_service, database=database),
                )
            ),
            connection,
            entity_exists,
        )

    def test_no_license_is_forbidden(self) -> None:
        request, connection, exists = self._request(allows=False)
        with (
            patch.object(api_command_proxy, "load_ha_entity_context", return_value=(connection, exists)),
            self.assertRaises(HTTPException) as ctx,
        ):
            _run(api_command_proxy._assert_control_allowed(request, {"entity_id": "light.a"}))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_no_connection_is_conflict(self) -> None:
        request, _connection, exists = self._request()
        with (
            patch.object(api_command_proxy, "load_ha_entity_context", return_value=(None, exists)),
            self.assertRaises(HTTPException) as ctx,
        ):
            _run(api_command_proxy._assert_control_allowed(request, {"entity_id": "light.a"}))
        self.assertEqual(ctx.exception.status_code, 409)

    def test_missing_entity_is_not_found(self) -> None:
        request, connection, _exists = self._request()
        with (
            patch.object(api_command_proxy, "load_ha_entity_context", return_value=(connection, False)),
            self.assertRaises(HTTPException) as ctx,
        ):
            _run(api_command_proxy._assert_control_allowed(request, {"entity_id": "light.gone"}))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_all_green_passes(self) -> None:
        request, connection, exists = self._request()
        with patch.object(api_command_proxy, "load_ha_entity_context", return_value=(connection, exists)):
            _run(api_command_proxy._assert_control_allowed(request, {"entity_id": "light.a"}))


class HaServiceCallOkTests(unittest.TestCase):
    """``execute_service_call`` 的 ``ok`` 必须来自统一判据，而不是恒 True。"""

    def _request(self, envelope: dict[str, Any]):
        class _Proxy:
            async def call_service(self, dto, *, policy=None):
                return envelope

        app = SimpleNamespace(
            state=SimpleNamespace(
                license_service=SimpleNamespace(allows=lambda feature: True),
                database=SimpleNamespace(),
                command_proxy=_Proxy(),
                global_log=SimpleNamespace(append=lambda *a, **k: None),
            )
        )
        request = SimpleNamespace(app=app, state=SimpleNamespace())
        return request

    def _payload(self):
        return SimpleNamespace(
            domain="light",
            service="turn_on",
            entity_id="light.a",
            data={},
            idempotency_key="k1",
        )

    def _call(self, envelope: dict[str, Any]) -> dict[str, Any]:
        request = self._request(envelope)
        with (
            patch.object(ha_service_call, "load_ha_entity_context", return_value=(object(), True)),
            patch.object(ha_service_call, "assert_command_proxy_authorized", AsyncMock()),
        ):
            return _run(ha_service_call.execute_service_call(request, self._payload()))

    def test_pending_response_has_ok_false(self) -> None:
        result = self._call({"success": False, "pending": True, "skipped": True, "data": None})
        self.assertFalse(result["ok"])
        self.assertTrue(result["pending"])

    def test_success_response_has_ok_true(self) -> None:
        result = self._call({"success": True, "verified": True, "data": []})
        self.assertTrue(result["ok"])

    def test_verified_false_has_ok_false(self) -> None:
        result = self._call({"success": True, "verified": False, "verification": {"reason": "mismatch"}, "data": []})
        self.assertFalse(result["ok"])
        self.assertFalse(result["verified"])


if __name__ == "__main__":
    unittest.main()
