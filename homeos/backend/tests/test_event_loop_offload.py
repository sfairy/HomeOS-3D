"""事件循环阻塞修复的回归测试。

备份清理、面板事件查询、紧急求助布局读取原先在异步路由 / 事件循环里同步执行
SQLAlchemy 查询、shutil.rmtree、json.loads，会把实时推送与设备控制一起顶住。
这里锁住两点：阻塞动作确实跨线程（asyncio.to_thread），且异步封装的行为与同步
实现一致（返回值不变，失败回退不变）。
"""

from __future__ import annotations

import asyncio
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.api.backups import _check_same_admin_session, _ensure_same_admin_session
from src.domains.backup.business_backup import BackupCoordinator
from src.domains.security.panel import SecurityPanelService
from src.domains.security.panel_helpers import SecurityEmergencyRunnerHelper

from tests.studio3d_helpers import dispose, new_database

MAIN_THREAD = threading.main_thread().name


def _coordinator(root: Path) -> BackupCoordinator:
    settings = SimpleNamespace(data_dir=root / "data")
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    app = SimpleNamespace(state=SimpleNamespace(settings=settings))
    return BackupCoordinator(app)


class BackupCleanupOffloadTest(unittest.IsolatedAsyncioTestCase):
    """BackupCoordinator 的阻塞清理必须离开事件循环线程。"""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.coordinator = _coordinator(self.root)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _directory(self, name: str) -> Path:
        path = self.root / name
        path.mkdir()
        (path / "payload.bin").write_bytes(b"x" * 32)
        return path

    async def test_expire_jobs_async_pops_tickets_and_removes_directories(self) -> None:
        expired = self._directory("expired")
        kept = self._directory("kept")
        self.coordinator.jobs = {
            "expired": {"directory": expired, "expiresAt": 0.0, "owner": "o"},
            "kept": {"directory": kept, "expiresAt": float("inf"), "owner": "o"},
        }

        await self.coordinator.expire_jobs_async()

        self.assertEqual(list(self.coordinator.jobs), ["kept"])
        self.assertFalse(expired.exists())
        self.assertTrue(kept.exists())

    async def test_expire_jobs_async_removes_directories_in_worker_thread(self) -> None:
        expired = self._directory("expired")
        self.coordinator.jobs = {"expired": {"directory": expired, "expiresAt": 0.0}}
        seen: list[tuple[str, list[Path | None]]] = []

        def record(directories: list[Path | None]) -> None:
            seen.append((threading.current_thread().name, directories))

        with patch.object(self.coordinator, "_remove_directories", side_effect=record):
            await self.coordinator.expire_jobs_async()

        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0][1], [expired])
        self.assertNotEqual(seen[0][0], MAIN_THREAD)

    async def test_expire_jobs_async_skips_thread_hop_when_nothing_expired(self) -> None:
        self.coordinator.jobs = {"alive": {"directory": None, "expiresAt": float("inf")}}

        with patch.object(self.coordinator, "_remove_directories") as remove:
            await self.coordinator.expire_jobs_async()

        remove.assert_not_called()
        self.assertEqual(list(self.coordinator.jobs), ["alive"])

    async def test_cleanup_job_async_removes_workspace_and_offloads(self) -> None:
        directory = self._directory("job")
        seen: list[str] = []

        def record(_: Path | None) -> None:
            seen.append(threading.current_thread().name)

        with patch.object(self.coordinator, "cleanup_job", side_effect=record):
            await self.coordinator.cleanup_job_async(directory)
        self.assertEqual(len(seen), 1)
        self.assertNotEqual(seen[0], MAIN_THREAD)

        await self.coordinator.cleanup_job_async(directory)
        self.assertFalse(directory.exists())

    async def test_cleanup_job_async_ignores_missing_directory(self) -> None:
        with patch.object(self.coordinator, "cleanup_job") as cleanup:
            await self.coordinator.cleanup_job_async(None)
        cleanup.assert_not_called()

    async def test_wait_idle_waits_for_running_exclusive_job(self) -> None:
        release = threading.Event()

        def job() -> str:
            release.wait(2.0)
            return "done"

        running = asyncio.create_task(self.coordinator.run_exclusive(job))
        await asyncio.sleep(0.02)
        waiter = asyncio.create_task(self.coordinator.wait_idle())
        await asyncio.sleep(0)
        self.assertFalse(waiter.done())

        release.set()
        self.assertEqual(await running, "done")
        await asyncio.wait_for(waiter, 1.0)

    async def test_prune_rollbacks_async_dispatches_to_worker_thread(self) -> None:
        seen: list[tuple[str, int]] = []

        def record(keep: int) -> None:
            seen.append((threading.current_thread().name, keep))

        with patch.object(self.coordinator, "prune_rollbacks", side_effect=record):
            await self.coordinator.prune_rollbacks_async()

        self.assertEqual(len(seen), 1)
        self.assertNotEqual(seen[0][0], MAIN_THREAD)
        self.assertGreaterEqual(seen[0][1], 0)


class SameAdminSessionOffloadTest(unittest.IsolatedAsyncioTestCase):
    async def test_whole_session_check_dispatches_to_thread_pool(self) -> None:
        request = SimpleNamespace()
        user = {"userId": "user-1"}
        with patch(
            "src.api.backups.asyncio.to_thread", new=AsyncMock(return_value=None)
        ) as run:
            outcome = await _ensure_same_admin_session(request, user)

        self.assertIsNone(outcome)
        run.assert_awaited_once()
        self.assertIs(run.call_args.args[0], _check_same_admin_session)
        self.assertIs(run.call_args.args[1], request)
        self.assertIs(run.call_args.args[2], user)


class SecurityPanelQueryOffloadTest(unittest.IsolatedAsyncioTestCase):
    """SecurityPanelService.get_events 的同步查询在 worker 线程执行。"""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.factory = new_database(Path(self._tmp.name) / "security.db")
        self.service = object.__new__(SecurityPanelService)
        self.service._session_factory = self.factory

    def tearDown(self) -> None:
        dispose(self.factory)
        self._tmp.cleanup()

    async def test_get_events_empty_database_returns_empty_list(self) -> None:
        self.assertEqual(await self.service.get_events(), [])

    async def test_get_events_dispatches_query_to_thread_pool(self) -> None:
        with patch(
            "src.domains.security.panel.asyncio.to_thread",
            new=AsyncMock(return_value=[]),
        ) as run:
            events = await self.service.get_events("motion", 10)

        self.assertEqual(events, [])
        run.assert_awaited_once()
        self.assertIs(
            run.call_args.args[0].__func__, SecurityPanelService._get_events_blocking
        )
        self.assertEqual(run.call_args.args[1:], ("motion", 10))


class EmergencyLayoutOffloadTest(unittest.IsolatedAsyncioTestCase):
    """load_emergency_layout 的同步 DB 读取 + json.loads 在 worker 线程执行。"""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.factory = new_database(Path(self._tmp.name) / "security.db")
        self.helper = object.__new__(SecurityEmergencyRunnerHelper)
        self.helper._session_factory = self.factory

    def tearDown(self) -> None:
        dispose(self.factory)
        self._tmp.cleanup()

    async def test_load_emergency_layout_empty_database_falls_back_to_defaults(self) -> None:
        cfg, pool = await self.helper.load_emergency_layout()

        self.assertIsInstance(cfg, dict)
        self.assertEqual(pool, [])

    async def test_load_emergency_layout_dispatches_read_to_thread_pool(self) -> None:
        sentinel = ({"mode": "full_home"}, [])
        with patch(
            "src.domains.security.panel_helpers.asyncio.to_thread",
            new=AsyncMock(return_value=sentinel),
        ) as run:
            outcome = await self.helper.load_emergency_layout()

        self.assertIs(outcome, sentinel)
        run.assert_awaited_once()
        self.assertIs(
            run.call_args.args[0].__func__,
            SecurityEmergencyRunnerHelper._load_emergency_layout_blocking,
        )