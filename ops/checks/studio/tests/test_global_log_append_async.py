"""``GlobalLogStore.append_async`` 的契约测试（0.8.2）。

异步写入是为了让事件循环不再被 ``open/write/fsync`` 卡住，但它有两条容易被后续改动破坏的性质：

1. **contextvars 要跟着过去**：请求 id / 会话写在 ``event_context`` 里，日志线程拿不到就等于
   丢了关联字段。这依赖 ``asyncio.to_thread``（会复制当前 context），换成
   ``loop.run_in_executor`` 就悄悄失效，而日志外表看不出任何异常。
2. **取消不能把写线程顶死**：写入已经持锁时被取消，锁不能留在半空 —— 否则下一次写入永久等待，
   表现为「服务还在跑，但日志再也不落盘」。
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.logs.global_log import GlobalLogStore, event_context


def _read_persisted_events(store: GlobalLogStore) -> list[dict]:
    store.flush()
    if not store.path.exists():
        return []
    return [
        json.loads(line)
        for line in store.path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


class AppendAsyncTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.store = GlobalLogStore(Path(self._tmp.name))

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def test_writes_event_and_persists_it(self) -> None:
        event = asyncio.run(
            self.store.append_async("warning", "系统后台", "授权", "异步写入测试")
        )

        self.assertEqual(event["message"], "异步写入测试")
        self.assertEqual(event["level"], "warning")
        messages = [item["message"] for item in _read_persisted_events(self.store)]
        self.assertIn("异步写入测试", messages)

    def test_keeps_event_context_from_calling_task(self) -> None:
        async def scenario() -> dict:
            event_context.set({"requestId": "req-async-1", "componentId": "cmp-9"})
            return await self.store.append_async("info", "系统后台", "测试", "带上下文")

        event = asyncio.run(scenario())

        self.assertEqual(event["context"]["requestId"], "req-async-1")
        self.assertEqual(event["context"]["componentId"], "cmp-9")

    def test_cancelling_a_write_does_not_wedge_later_writes(self) -> None:
        async def scenario() -> dict:
            pending = asyncio.create_task(
                self.store.append_async("info", "系统后台", "测试", "会被取消")
            )
            await asyncio.sleep(0)
            pending.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await pending
            return await self.store.append_async("info", "系统后台", "测试", "取消之后")

        # 卡死的话这里会一直等下去（unittest 的超时由外层 gate 兜底）。
        event = asyncio.run(scenario())

        self.assertEqual(event["message"], "取消之后")

    def test_does_not_block_the_event_loop(self) -> None:
        """写入期间循环必须还能跑别的任务（同步实现会在这里串行掉）。"""

        async def scenario() -> bool:
            ticks = 0

            async def ticker() -> None:
                nonlocal ticks
                for _ in range(20):
                    ticks += 1
                    await asyncio.sleep(0)

            await asyncio.gather(
                ticker(),
                self.store.append_async("info", "系统后台", "测试", "并发写入"),
            )
            return ticks == 20

        self.assertTrue(asyncio.run(scenario()))


if __name__ == "__main__":
    unittest.main()
