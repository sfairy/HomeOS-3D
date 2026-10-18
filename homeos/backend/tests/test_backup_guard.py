"""备份恢复的管理员密码门：DB + argon2 在线程池执行，401/429 语义不变。"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.api.backup_guard import (
    BACKUP_PASSWORD_SCOPE,
    _verify_admin_password_blocking,
    owner_session_key,
    verify_admin_password,
)
from src.platform.core.models import User
from src.platform.security.login_limiter import LoginAttemptLimiter
from src.platform.security.passwords import hash_password

from tests.studio3d_helpers import dispose, new_database

PASSWORD = "Passw0rd!2026"
WRONG_PASSWORD = "wrong-pass-1"
USER_ID = "user-1"
COOKIE_NAME = "homeos_session"
COOKIE = "session-token-abc"


def _request(factory, limiter=None, *, cookie=COOKIE, database=True):
    state = SimpleNamespace(
        database=SimpleNamespace(session_factory=factory) if database else None,
        business_backup=SimpleNamespace(backup_password_limiter=limiter),
        settings=SimpleNamespace(cookie_name=COOKIE_NAME),
    )
    return SimpleNamespace(cookies={COOKIE_NAME: cookie}, app=SimpleNamespace(state=state))


def _limiter_key(request) -> str:
    return f"{BACKUP_PASSWORD_SCOPE}:{owner_session_key(request, {'userId': USER_ID})}"


def _make_limiter(*, max_failures=2):
    return LoginAttemptLimiter(max_failures=max_failures, window_seconds=300, block_seconds=600)


class BackupPasswordGateTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.factory = new_database(Path(self._tmp.name) / "backup.db")
        with self.factory() as session:
            session.add(User(id=USER_ID, username="admin", password=hash_password(PASSWORD)))
            session.commit()

    def tearDown(self) -> None:
        dispose(self.factory)
        self._tmp.cleanup()

    async def test_correct_password_passes(self) -> None:
        limiter = _make_limiter()
        outcome = await verify_admin_password(
            _request(self.factory, limiter), {"userId": USER_ID}, PASSWORD
        )
        self.assertIsNone(outcome)
        self.assertFalse(limiter.blocked(_limiter_key(_request(self.factory, limiter))))

    async def test_wrong_password_returns_401_and_counts_failure(self) -> None:
        limiter = _make_limiter(max_failures=2)
        request = _request(self.factory, limiter)
        response = await verify_admin_password(request, {"userId": USER_ID}, WRONG_PASSWORD)
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(json.loads(response.body)["detail"], "当前管理员密码不正确。")
        key = _limiter_key(request)
        self.assertFalse(limiter.blocked(key))
        await verify_admin_password(request, {"userId": USER_ID}, WRONG_PASSWORD)
        self.assertTrue(limiter.blocked(key))

    async def test_blocked_short_circuits_before_database(self) -> None:
        limiter = _make_limiter(max_failures=1)
        request = _request(self.factory, limiter)
        first = await verify_admin_password(request, {"userId": USER_ID}, WRONG_PASSWORD)
        self.assertEqual(first.status_code, 401)
        response = await verify_admin_password(request, {"userId": USER_ID}, PASSWORD)
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, 429)
        self.assertGreaterEqual(int(response.headers["Retry-After"]), 1)

    async def test_success_resets_failure_window(self) -> None:
        limiter = _make_limiter(max_failures=2)
        request = _request(self.factory, limiter)
        await verify_admin_password(request, {"userId": USER_ID}, WRONG_PASSWORD)
        key = _limiter_key(request)
        self.assertFalse(limiter.blocked(key))
        self.assertIsNone(await verify_admin_password(request, {"userId": USER_ID}, PASSWORD))
        self.assertFalse(limiter.blocked(key))

    async def test_unknown_user_returns_401(self) -> None:
        response = await verify_admin_password(
            _request(self.factory), {"userId": "missing-user"}, PASSWORD
        )
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, 401)

    async def test_missing_database_returns_401(self) -> None:
        response = await verify_admin_password(
            _request(self.factory, database=False), {"userId": USER_ID}, PASSWORD
        )
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, 401)

    async def test_gate_dispatches_whole_check_to_thread_pool(self) -> None:
        request = _request(self.factory)
        with patch("src.api.backup_guard.asyncio.to_thread", new=AsyncMock(return_value=None)) as run:
            outcome = await verify_admin_password(request, {"userId": USER_ID}, PASSWORD)
        self.assertIsNone(outcome)
        run.assert_awaited_once()
        args, kwargs = run.call_args
        self.assertIs(args[0], _verify_admin_password_blocking)
        self.assertEqual(kwargs["scope"], BACKUP_PASSWORD_SCOPE)

    def test_owner_session_key_scopes_by_user_and_session(self) -> None:
        request = _request(self.factory)
        key = owner_session_key(request, {"userId": USER_ID})
        self.assertNotEqual(key, owner_session_key(request, {"userId": "user-2"}))
        other = _request(self.factory, cookie="another-token")
        self.assertNotEqual(key, owner_session_key(other, {"userId": USER_ID}))
