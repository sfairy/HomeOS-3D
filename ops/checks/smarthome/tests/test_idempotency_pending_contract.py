"""幂等 pending 契约：``pending=True`` 不得同时声称 ``skipped=True``。

真实故障（由前端用例抓到）：`CommandProxyService` 在「幂等键命中、首次命令仍在下发」时
返回 ``pending=True`` **且** ``skipped=True``。前端与批量执行器按 ``skipped`` 回滚乐观态，
于是同一个手势连点两次时界面先恢复再跳变。

语义上这两件事互斥：

- ``pending``：这条命令**正在执行**（首次请求还没回来）；
- ``skipped``：这条命令**没有被执行**（重复命令 / 批量取消）。

这里直接驱动 ``CommandProxyService.call_service``，用一个「卡住不返回」的连接器制造
inflight 窗口，验证同键第二次请求的响应形状。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.proxy.command_proxy import CommandProxyService


class _BlockingConnector:
    """第一次调用挂起直到 release()，用于制造 inflight 窗口。"""

    def __init__(self) -> None:
        self.release = asyncio.Event()
        self.calls = 0

    async def get_status(self) -> dict[str, Any]:
        return {"connected": True}

    async def call_service(self, *_args: Any, **_kwargs: Any) -> list[Any]:
        self.calls += 1
        await self.release.wait()
        return [{"entity_id": "light.a", "state": "on"}]


class PendingContractTests(unittest.TestCase):
    def test_pending_is_not_skipped(self) -> None:
        async def _scenario() -> tuple[dict[str, Any], dict[str, Any]]:
            connector = _BlockingConnector()
            proxy = CommandProxyService(session_factory=lambda: None, connector=connector)
            dto = {
                "domain": "light",
                "service": "turn_on",
                "entity_id": "light.a",
                "service_data": {},
                "idempotency_key": "gesture-1",
            }
            first = asyncio.create_task(proxy.call_service(dto))
            # 让第一请求完成幂等键认领并挂起在连接器上。
            while connector.calls == 0:
                await asyncio.sleep(0)
            duplicate = await proxy.call_service(dto)
            connector.release.set()
            real = await first
            return duplicate, real

        duplicate, real = asyncio.run(_scenario())

        self.assertTrue(duplicate["pending"], "同键并发第二次必须是 pending")
        self.assertFalse(
            duplicate["skipped"],
            "pending 不能同时是 skipped：前端据 skipped 回滚乐观态，会造成连点时先恢复再跳变",
        )
        self.assertFalse(duplicate["data"]["skipped"])
        self.assertEqual(duplicate["data"]["reason"], "idempotency_inflight")
        # 首次请求本身照常成功，pending 不影响真实结果。
        self.assertTrue(real["success"])

    def test_replay_returns_first_real_result(self) -> None:
        """首请求已完成后同键再发：复用真实结果并标记 ``replayed``，不是 pending。"""

        async def _scenario() -> dict[str, Any]:
            class _FastConnector:
                async def get_status(self) -> dict[str, Any]:
                    return {"connected": True}

                async def call_service(self, *_a: Any, **_k: Any) -> list[Any]:
                    return [{"entity_id": "light.a", "state": "on"}]

            proxy = CommandProxyService(session_factory=lambda: None, connector=_FastConnector())
            dto = {
                "domain": "light",
                "service": "turn_on",
                "entity_id": "light.a",
                "service_data": {},
                "idempotency_key": "gesture-2",
            }
            await proxy.call_service(dto)
            return await proxy.call_service(dto)

        replay = asyncio.run(_scenario())
        self.assertTrue(replay["replayed"])
        self.assertFalse(replay.get("pending", False))
        self.assertTrue(replay["success"])


if __name__ == "__main__":
    unittest.main()
