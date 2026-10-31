"""``durable_work`` 的契约测试（0.8.1 新增）。

它替换的是 ``await asyncio.to_thread(...)``。两者的差别只在**取消**上：

- ``to_thread``：调用方立刻收到 ``CancelledError``，但线程还在写文件。调用方以
  「没发生」为由重试，两次作业写同一个目录，最终留下半截文件；
- ``durable_work``：先把这次写入等完，再把 ``CancelledError`` 抛给调用方。

所以断言不是「取消要快」，而是「取消后磁盘上的活确实干完了」。
"""
from __future__ import annotations

import asyncio
import sys
import tempfile
import threading
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.core.runtime.async_work import durable_work


class DurableWorkTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_value_and_forwards_arguments(self):
        result = await durable_work(lambda a, b, *, c: (a, b, c), 1, 2, c=3)
        self.assertEqual(result, (1, 2, 3))

    async def test_runs_off_the_event_loop_thread(self):
        loop_thread = threading.get_ident()
        worker_thread = await durable_work(threading.get_ident)
        self.assertNotEqual(worker_thread, loop_thread)

    async def test_worker_exception_propagates(self):
        def explode():
            raise ValueError("写盘失败")

        with self.assertRaises(ValueError):
            await durable_work(explode)

    async def test_cancellation_waits_for_the_write_to_finish(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "written.txt"
            started = threading.Event()

            partial = Path(str(marker) + ".part")

            def slow_write():
                started.set()
                # 模拟真实的落盘耗时：足够长，保证取消先到。
                partial.write_text("half", encoding="utf-8")
                for _ in range(50):
                    threading.Event().wait(0.01)
                # 真实流程的最后一步是原子替换：半截文件不应该留到最后。
                partial.replace(marker)
                return "ok"

            task = asyncio.create_task(durable_work(slow_write))
            while not started.is_set():
                await asyncio.sleep(0.001)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            # 取消已经传给调用方，但线程必须已经把文件写完（而不是半个 .part）。
            self.assertTrue(marker.exists(), "取消后仍必须等写入完成")
            self.assertFalse(partial.exists(), "半截文件必须已被原子替换掉")

    async def test_cancelled_worker_result_is_consumed(self):
        """worker 在取消后抛异常，不得变成「Task exception was never retrieved」。"""
        started = threading.Event()

        def fail_after_cancel():
            started.set()
            threading.Event().wait(0.05)
            raise RuntimeError("线程里炸了")

        loop = asyncio.get_running_loop()
        unhandled = []

        def capture(_loop, context):
            unhandled.append(context)

        loop.set_exception_handler(capture)
        self.addCleanup(loop.set_exception_handler, None)
        task = asyncio.create_task(durable_work(fail_after_cancel))
        while not started.is_set():
            await asyncio.sleep(0.001)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        await asyncio.sleep(0.05)
        self.assertEqual(unhandled, [], f"worker 异常被泄漏到事件循环：{unhandled}")

    async def test_concurrent_calls_do_not_block_each_other(self):
        order = []

        def work(name, delay):
            threading.Event().wait(delay)
            order.append(name)

        await asyncio.gather(
            durable_work(work, "slow", 0.05),
            durable_work(work, "fast", 0.001),
        )
        self.assertEqual(sorted(order), ["fast", "slow"])


if __name__ == "__main__":
    unittest.main()
