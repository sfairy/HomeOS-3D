"""`LicenseService` 0.8.2 移植点的契约测试：`_wake_schedule` / `_credential_snapshot` / `_credential_operation`。

这三个函数是本次从上游 `.das` 还原出来的机制，而 `domains/license/service.py` 在仓库里
**没有任何其它测试**（`rg -l "LicenseService" ops/` 为空）—— 也就是说移植面完全靠人读。
它们的失效方式都很安静：

- `_wake_schedule` 在读盘线程里直接 `asyncio.Event.set()`：不报错、不抛警告，只是偶尔
  错过唤醒，表现为「手动重试后要等满一个心跳周期才生效」；
- `_credential_snapshot` 多次读盘：同一操作里两次读之间被并发激活改掉，决策用的是半新
  半旧的凭据；
- `_credential_operation` 少释放一次进程锁：本机后续所有激活/重试都会被卡住，只能重启。

这里用 `object.__new__` 只装配被测函数需要的属性，绕开 `Settings` / 信任锚 / 密钥文件，
让测试只钉住这三件事本身。
"""

from __future__ import annotations

import asyncio
import sys
import threading
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.license.service import LicenseService


class _FakeProcessLock:
    """只记录 acquire/release 次数；`fd is None` 表示本进程还没持锁。"""

    def __init__(self) -> None:
        self.fd = None
        self.acquires = 0
        self.releases = 0

    def acquire(self) -> None:
        self.acquires += 1
        self.fd = 3

    def release(self) -> None:
        self.releases += 1
        self.fd = None


def _bare_service(**attributes):
    """装配一个只带指定属性的 LicenseService（不跑 __init__）。"""
    service = object.__new__(LicenseService)
    service._heartbeat_lock = asyncio.Lock()
    service._schedule_changed = asyncio.Event()
    service._loop = None
    service._process_lock = _FakeProcessLock()
    for name, value in attributes.items():
        setattr(service, name, value)
    return service


class WakeScheduleTest(unittest.TestCase):
    def test_in_loop_sets_event_directly(self) -> None:
        service = _bare_service()

        async def scenario() -> bool:
            service._loop = asyncio.get_running_loop()
            service._wake_schedule()
            return service._schedule_changed.is_set()

        self.assertTrue(asyncio.run(scenario()))

    def test_without_loop_does_not_raise(self) -> None:
        """调度循环没起来（未配置授权服务器 / 已停机）时必须静默置位。"""
        service = _bare_service()
        service._wake_schedule()
        self.assertTrue(service._schedule_changed.is_set())

    def test_closed_loop_falls_back_to_direct_set(self) -> None:
        service = _bare_service()
        closed = asyncio.new_event_loop()
        closed.close()
        service._loop = closed
        service._wake_schedule()
        self.assertTrue(service._schedule_changed.is_set())

    def test_called_from_another_thread_wakes_running_loop(self) -> None:
        """真正的移植点：读盘线程里调用，必须走 `call_soon_threadsafe` 才能唤醒循环。"""
        service = _bare_service()

        async def scenario() -> bool:
            service._loop = asyncio.get_running_loop()
            worker = threading.Thread(target=service._wake_schedule)
            worker.start()
            worker.join(2.0)
            # 投递的回调要等循环跑一拍才真正执行 set()。
            await asyncio.sleep(0.05)
            return service._schedule_changed.is_set()

        self.assertTrue(asyncio.run(scenario()))

    def test_thread_call_never_touches_event_from_wrong_thread(self) -> None:
        """线程侧不得直接 `set()`：这里用 spy 确认跨线程路径走的是 threadsafe 投递。"""
        service = _bare_service()

        async def scenario() -> None:
            loop = asyncio.get_running_loop()
            service._loop = loop
            delivered: list[bool] = []
            with mock.patch.object(
                loop, "call_soon_threadsafe", side_effect=lambda fn: delivered.append(True)
            ):
                worker = threading.Thread(target=service._wake_schedule)
                worker.start()
                worker.join(2.0)
            assert delivered == [True], delivered
            assert service._schedule_changed.is_set() is False

        asyncio.run(scenario())


class CredentialSnapshotTest(unittest.TestCase):
    def test_reads_credentials_exactly_once(self) -> None:
        service = _bare_service()
        calls: list[int] = []

        def credentials():
            calls.append(1)
            return (True, "ciphertext", "a@b.c")

        service._activation_credentials = credentials

        result = asyncio.run(service._credential_snapshot())

        self.assertEqual(result, (True, "ciphertext", "a@b.c"))
        self.assertEqual(len(calls), 1, "同一操作里读两次盘，会拿到自相矛盾的快照")

    def test_runs_off_the_event_loop(self) -> None:
        """读盘必须在线程里跑：同步实现会让一次 sqlite 读直接占住事件循环。"""
        service = _bare_service()
        seen: dict[str, object] = {}

        def credentials():
            seen["thread"] = threading.get_ident()
            return (False, None, "")

        service._activation_credentials = credentials

        async def scenario() -> int:
            await service._credential_snapshot()
            return threading.get_ident()

        loop_thread = asyncio.run(scenario())
        self.assertNotEqual(seen["thread"], loop_thread)


class CredentialOperationTest(unittest.TestCase):
    def test_serialises_concurrent_operations(self) -> None:
        service = _bare_service()
        order: list[str] = []

        async def enter(label: str) -> None:
            async with service._credential_operation():
                order.append(f"enter:{label}")
                await asyncio.sleep(0.01)
                order.append(f"exit:{label}")

        async def scenario() -> None:
            await asyncio.gather(enter("a"), enter("b"))

        asyncio.run(scenario())
        self.assertEqual(order, ["enter:a", "exit:a", "enter:b", "exit:b"])

    def test_releases_temporary_process_lock_on_success(self) -> None:
        service = _bare_service()

        async def scenario() -> None:
            async with service._credential_operation():
                pass

        asyncio.run(scenario())
        self.assertEqual(service._process_lock.acquires, 1)
        self.assertEqual(service._process_lock.releases, 1)
        self.assertIsNone(service._process_lock.fd)

    def test_releases_temporary_process_lock_on_exception(self) -> None:
        service = _bare_service()

        async def scenario() -> None:
            async with service._credential_operation():
                raise RuntimeError("激活失败")

        with self.assertRaises(RuntimeError):
            asyncio.run(scenario())
        self.assertEqual(service._process_lock.releases, 1)
        self.assertIsNone(service._process_lock.fd, "锁没释放 = 本机以后再也激活不了")

    def test_keeps_preexisting_process_lock(self) -> None:
        """已经持锁（fd 非空）时不该重复 acquire / 提前 release。"""
        service = _bare_service()
        service._process_lock.fd = 7

        async def scenario() -> None:
            async with service._credential_operation():
                pass

        asyncio.run(scenario())
        self.assertEqual(service._process_lock.acquires, 0)
        self.assertEqual(service._process_lock.releases, 0)
        self.assertEqual(service._process_lock.fd, 7)


if __name__ == "__main__":
    unittest.main()
