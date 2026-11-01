"""命令通道幂等键的两条口径回归。

1. **作用域必须含参数摘要**：调用方复用同一个 ``idempotency_key`` 连调两次
   ``climate.set_temperature``（只改温度）时，旧实现把第二次判成重复、直接返回第一次的
   结果并标 ``replayed`` —— 命令没下发，界面却显示成功。
2. **inflight 条目不能被请求级 TTL 剪掉**：慢服务要跑上百秒，而 ``idempotencyTtlMs``
   默认只有 3s；条目被剪后同键重试会重新认领并再下发一次。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.proxy.command_proxy import (
    _IDEMPOTENCY_INFLIGHT_TTL_MS,
    CommandProxyService,
    _idempotency_scope,
)


class _RecordingConnector:
    """只记录下发次数的最小连接器：够验证「有没有真的再下发一次」。"""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str, dict[str, Any]]] = []

    async def get_status(self) -> dict[str, Any]:
        return {"connected": True}

    async def call_service(
        self,
        domain: str,
        service: str,
        entity_id: str,
        data: dict[str, Any],
        return_response: bool = False,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        self.calls.append((domain, service, entity_id, dict(data or {})))
        return {"entity_id": entity_id, "service": service}


def _build_proxy() -> tuple[CommandProxyService, _RecordingConnector]:
    connector = _RecordingConnector()
    # session_factory=None 会抛在 ``_config()`` 的 try 里，落到默认配置 —— 与本测试无关。
    proxy = CommandProxyService(session_factory=None, connector=connector)
    return proxy, connector


def _dto(temperature: int, key: str = "k-1") -> dict[str, Any]:
    return {
        "domain": "climate",
        "service": "set_temperature",
        "entity_id": "climate.living",
        "service_data": {"temperature": temperature},
        "idempotency_key": key,
    }


class IdempotencyScopeTest(unittest.TestCase):
    def test_scope_includes_service_data_digest(self) -> None:
        first = _idempotency_scope("light.a", "light", "turn_on", "same", {"brightness_pct": 10})
        second = _idempotency_scope("light.a", "light", "turn_on", "same", {"brightness_pct": 90})
        self.assertNotEqual(first, second)
        # 同一个键 + 同一份参数必须仍然命中（这是幂等键的本职）。
        self.assertEqual(first, _idempotency_scope("light.a", "light", "turn_on", "same", {"brightness_pct": 10}))

    def test_key_order_does_not_change_scope(self) -> None:
        left = _idempotency_scope("light.a", "light", "turn_on", "same", {"a": 1, "b": 2})
        right = _idempotency_scope("light.a", "light", "turn_on", "same", {"b": 2, "a": 1})
        self.assertEqual(left, right)

    def test_unserializable_data_falls_back_to_key_only(self) -> None:
        # 宁可多执行一次，也不能因为摘要算不出来就把两次不同参数的下发吞成一次。
        scope = _idempotency_scope("light.a", "light", "turn_on", "same", {"cb": object()})
        self.assertTrue(scope.endswith(":same"))


class IdempotencyDispatchTest(unittest.IsolatedAsyncioTestCase):
    async def test_same_key_different_params_dispatches_twice(self) -> None:
        proxy, connector = _build_proxy()
        first = await proxy.call_service(_dto(20))
        second = await proxy.call_service(_dto(26))
        self.assertIs(first.get("replayed"), None)
        self.assertIs(second.get("replayed"), None)
        self.assertEqual([call[3]["temperature"] for call in connector.calls], [20, 26])

    async def test_same_key_same_params_replays_first_result(self) -> None:
        proxy, connector = _build_proxy()
        await proxy.call_service(_dto(20))
        again = await proxy.call_service(_dto(20))
        self.assertTrue(again.get("replayed"))
        self.assertEqual(len(connector.calls), 1)

    async def test_inflight_entry_survives_request_ttl(self) -> None:
        proxy, _connector = _build_proxy()
        scope = _idempotency_scope("climate.living", "climate", "set_temperature", "k-1", None)
        claimed, existing = await proxy._begin_idempotency(scope)
        self.assertTrue(claimed)
        self.assertIsNone(existing)
        entry = proxy._idempotency[scope]
        # 时间快进到「请求 TTL 早就过了、但仍在下发」的窗口内。
        entry.created_at -= 60_000
        proxy._idempotency_pruned_at = 0.0
        proxy._prune_idempotency(entry.created_at + 60_000)
        self.assertIn(scope, proxy._idempotency)

    async def test_done_entry_is_pruned_after_result_ttl(self) -> None:
        proxy, _connector = _build_proxy()
        scope = _idempotency_scope("climate.living", "climate", "set_temperature", "k-2", None)
        await proxy._begin_idempotency(scope)
        proxy._finish_idempotency(scope, {"success": True})
        entry = proxy._idempotency[scope]
        entry.created_at -= _IDEMPOTENCY_INFLIGHT_TTL_MS + 1_000
        proxy._idempotency_pruned_at = 0.0
        proxy._prune_idempotency(entry.created_at + _IDEMPOTENCY_INFLIGHT_TTL_MS + 1_000)
        self.assertNotIn(scope, proxy._idempotency)


if __name__ == "__main__":
    unittest.main()
