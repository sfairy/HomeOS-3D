"""C2/C3 补充回归：慢服务配额、cover_memory 序号、时长封顶。

这三处都属于「并发下的正确性」，端到端只能看到「有时候窗帘动画会倒着跑」这类
偶发现象，所以必须用单测钉住：

1. 慢服务占用独立配额，不挤占普通控制；
2. 同一实体两次下发并发时，先发的那次晚到不能覆盖后发的那次；
3. 远程学习超时有上限（否则一条请求能占住连接池两小时）。
"""

from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.ha.integration.control_pool import SLOW_SERVICE_MAX_CONCURRENCY, HAControlPool
from src.domains.ha.integration.cover_memory import CoverMemory
from src.domains.ha.integration.service_timeouts import (
    REMOTE_LEARNING_MAX_TIMEOUT,
    is_slow_service,
    remote_learning_timeout,
)


def _run(coro):
    return asyncio.run(coro)


class SlowServiceClassificationTests(unittest.TestCase):
    def test_slow_services(self) -> None:
        for domain, service in (
            ("ai_task", "generate_image"),
            ("assist_satellite", "ask_question"),
            ("update", "install"),
            ("remote", "learn_command"),
        ):
            self.assertTrue(is_slow_service(domain, service), f"{domain}.{service}")

    def test_normal_controls_are_not_slow(self) -> None:
        for domain, service in (
            ("light", "turn_on"),
            ("cover", "set_cover_position"),
            ("remote", "send_command"),
            ("lock", "unlock"),
        ):
            self.assertFalse(is_slow_service(domain, service), f"{domain}.{service}")

    def test_remote_learning_is_capped(self) -> None:
        timeout = remote_learning_timeout({"timeout": 60, "command": ["x"] * 64, "command_type": "rf"})
        self.assertEqual(timeout, float(REMOTE_LEARNING_MAX_TIMEOUT))


class SlowSlotTests(unittest.TestCase):
    def _pool(self) -> HAControlPool:
        from src.domains.ha.integration.control_pool import HAControlConfiguration

        config = HAControlConfiguration(connection_id="c1", base_url="http://ha", access_token="test-token")  # noqa: S106
        return HAControlPool(lambda: config, slow_max_concurrency=1)

    def test_slow_slots_are_bounded(self) -> None:
        pool = self._pool()
        self.assertEqual(pool._slow_slots._value, 1)
        self.assertEqual(SLOW_SERVICE_MAX_CONCURRENCY, 3)

    def test_slow_lease_acquires_and_releases(self) -> None:
        """慢服务租约结束后必须归还配额，否则几次学习之后慢服务会永久卡死。"""
        pool = self._pool()

        async def _scenario() -> None:
            async with pool.lease(pool._resolve_configuration(), slow=True):
                self.assertEqual(pool._slow_slots._value, 0)
            self.assertEqual(pool._slow_slots._value, 1)

        _run(_scenario())


class CoverMemorySequenceTests(unittest.TestCase):
    def _memory(self, tmp_path: Path) -> CoverMemory:
        return CoverMemory(tmp_path / "cover.json", now=lambda: 1000.0)

    def test_late_earlier_command_is_discarded(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            memory = self._memory(Path(raw))
            memory.begin("t1", "cover.a", target=30)
            memory.begin("t2", "cover.a", target=90)
            # 后发的 t2 先完成（正常），先发的 t1 晚到 —— t1 必须被丢弃。
            memory.complete("t2", ok=True)
            memory.complete("t1", ok=True)
            entry = memory.entries["cover.a"]
            self.assertEqual(entry["reportAt"], 1000.0 * 1000)
            # 估计值只应来自 t2（目标 90），不应混入 t1 的 30。
            estimates = entry.get("estimates") or []
            self.assertEqual(len(estimates), 1)

    def test_failed_command_still_advances_sequence(self) -> None:
        """失败也推进序号：之后完成的那一次才是「最后生效的目标」。"""
        with tempfile.TemporaryDirectory() as raw:
            memory = self._memory(Path(raw))
            memory.begin("t1", "cover.a", target=30)
            memory.begin("t2", "cover.a", target=90)
            memory.complete("t2", ok=False)
            memory.complete("t1", ok=True)
            # t1 早于已完成的 t2，必须被丢弃 → 不留下任何目标
            self.assertNotIn("estimates", memory.entries.get("cover.a", {}))


if __name__ == "__main__":
    unittest.main()
