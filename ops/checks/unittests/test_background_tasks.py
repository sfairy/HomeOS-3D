"""受管后台任务的单元测试。

``background_tasks.spawn`` 要解决的问题（异常丢失 / 弱引用被 GC / 停机不等待）都没法靠
「读代码」确认，只能靠这几个用例钉住：漏了异常收集就会有一条 ERROR 没被记录，
漏了取消就会让 ``shutdown`` 卡到超时。
"""

from __future__ import annotations

import asyncio
import unittest
from unittest import mock

from homeos.backend.src.platform.core.runtime.background_tasks import BackgroundTasks


class BackgroundTasksTest(unittest.IsolatedAsyncioTestCase):
    async def test_successful_task_is_untracked_after_completion(self) -> None:
        tasks = BackgroundTasks(name="unit")
        done = asyncio.Event()

        async def work() -> None:
            await asyncio.sleep(0)
            done.set()

        tasks.spawn(work(), label="unit.ok")
        await done.wait()
        await asyncio.sleep(0)
        self.assertEqual(tasks.pending(), 0)

    async def test_exception_is_logged_without_warning_from_loop(self) -> None:
        tasks = BackgroundTasks(name="unit")

        async def boom() -> None:
            raise RuntimeError("boom")

        with mock.patch("homeos.backend.src.platform.core.runtime.background_tasks.LOGGER") as logger:
            tasks.spawn(boom(), label="unit.boom")
            for _ in range(5):
                await asyncio.sleep(0)
        self.assertTrue(logger.error.called)
        self.assertIn("unit.boom", logger.error.call_args.args[1])

    async def test_shutdown_cancels_running_tasks(self) -> None:
        tasks = BackgroundTasks(name="unit")
        started = asyncio.Event()
        cancelled = asyncio.Event()

        async def long_running() -> None:
            started.set()
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                cancelled.set()
                raise

        tasks.spawn(long_running(), label="unit.long")
        await started.wait()
        await tasks.shutdown(timeout=1.0)
        self.assertTrue(cancelled.is_set())
        self.assertEqual(tasks.pending(), 0)

    async def test_shutdown_is_noop_when_idle(self) -> None:
        await BackgroundTasks(name="unit").shutdown(timeout=0.01)

    async def test_shutdown_does_not_hang_on_stubborn_task(self) -> None:
        """停顿超过 timeout 的任务不能拖住停机：``shutdown`` 到点即返回。

        这个任务故意在第一次取消后继续跑（模拟「收尾里又 await 了一次」的代码），
        第二次取消才退出 —— 事件循环收尾时才能正常清掉。
        """
        tasks = BackgroundTasks(name="unit")
        attempts = 0

        async def stubborn() -> None:
            nonlocal attempts
            while attempts < 2:
                try:
                    await asyncio.sleep(0.3)
                except asyncio.CancelledError:
                    attempts += 1
                    if attempts >= 2:
                        raise

        task = tasks.spawn(stubborn(), label="unit.stubborn")
        await asyncio.sleep(0)
        started = asyncio.get_running_loop().time()
        await tasks.shutdown(timeout=0.05)
        self.assertLess(asyncio.get_running_loop().time() - started, 1.0)
        # 事件循环收尾前把它清掉（否则 IsolatedAsyncioTestCase 会等它跑完）。
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        self.assertTrue(task.done())


if __name__ == "__main__":
    unittest.main()
