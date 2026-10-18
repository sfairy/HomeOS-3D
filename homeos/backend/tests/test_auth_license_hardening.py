"""task-1 主应用侧加固回归：注册事务、商店错误映射、会话续期、授权状态监听与 WS 门禁。

这些用例不启动 FastAPI、不联网：直接调用被测的同步函数/ASGI 中间件，用临时
SQLite 文件库与几个最小 fake 覆盖行为契约。每个用例对应任务里的一条缺陷：
商店不可达不得退化成 422、注册不得整表删会话、恢复票据失败不得把有效租约打成终态、
授权终态必须踢掉在线 WS、WS 握手必须过授权门禁。
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import tempfile
import threading
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import cast
from unittest import mock

from fastapi import HTTPException
from socketio import AsyncServer
from sqlalchemy import select
from src.api import auth as auth_api
from src.bootstrap.middleware import LicenseGuardMiddleware
from src.config import Settings
from src.domains.license.crypto import LicenseCryptoError
from src.domains.license.service import (
    DEFAULT_MIN_HEARTBEAT_SECONDS,
    LicenseService,
    min_heartbeat_seconds,
)
from src.domains.store.verification import StoreVerificationError, _parse_retry_after
from src.platform.core.database import Base, Database
from src.platform.core.models import LoginSession, User
from src.platform.security.auth_context import authenticate_session
from src.platform.security.passwords import (
    EXTERNAL_PASSWORD_SENTINEL,
    hash_password,
    verify_password,
)
from src.platform.security.session_store import new_session_token, session_token_hash
from src.realtime.gateway import RealtimeGateway
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import Message, Scope

PASSWORD = "Str0ng-Passw0rd!"
SESSION_MAX_AGE = 30 * 24 * 3600


class _FakeEventLog:
    def __init__(self) -> None:
        self.entries: list[tuple[str, ...]] = []

    def append(self, *args) -> None:
        self.entries.append(args)


def _settings():
    return SimpleNamespace(
        cookie_name="auth_token",
        session_max_age_seconds=SESSION_MAX_AGE,
    )


def _make_request(
    *,
    token: str | None = None,
    client: tuple[str, int] = ("127.0.0.1", 12345),
    user_agent: str = "unittest/1.0",
) -> Request:
    """构造真实 Starlette ``Request``：``request.cookies`` / ``headers`` 等走真实解析。

    只伪造 ``scope["app"].state.settings``（FastAPI 在启动时注入，测试里没有 app 生命周期）。
    """
    headers: list[tuple[bytes, bytes]] = [(b"user-agent", user_agent.encode())]
    if token is not None:
        headers.append((b"cookie", f"auth_token={token}".encode()))
    scope: Scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "root_path": "",
        "query_string": b"",
        "headers": headers,
        "client": client,
        "server": ("testserver", 80),
        "app": SimpleNamespace(state=SimpleNamespace(settings=_settings())),
    }
    return Request(scope)


def _fake_request(token: str) -> Request:
    return _make_request(token=token)


class StoreErrorMappingTest(unittest.TestCase):
    """商店不可达必须映射成 503（可重试），而不是 422（客户端错误）。"""

    def test_connection_error_maps_to_503_store_unavailable(self) -> None:
        error = StoreVerificationError("无法连接商店服务器，请稍后重试。")
        self.assertTrue(error.unavailable)
        exc = auth_api._store_error(error)
        self.assertEqual(503, exc.status_code)
        self.assertEqual(
            {"code": "STORE_UNAVAILABLE", "message": str(error)}, exc.detail
        )

    def test_server_side_error_maps_to_503(self) -> None:
        error = StoreVerificationError("商店内部错误", status_code=502)
        self.assertTrue(error.unavailable)
        self.assertEqual(503, auth_api._store_error(error).status_code)

    def test_429_keeps_retry_after(self) -> None:
        error = StoreVerificationError("发送过于频繁", status_code=429, retry_after=17)
        exc = auth_api._store_error(error)
        self.assertEqual(429, exc.status_code)
        self.assertEqual({"Retry-After": "17"}, exc.headers)
        self.assertEqual("发送过于频繁", exc.detail)

    def test_429_without_header_falls_back_to_60(self) -> None:
        exc = auth_api._store_error(StoreVerificationError("发送过于频繁", status_code=429))
        self.assertEqual({"Retry-After": "60"}, exc.headers)

    def test_client_error_maps_to_422(self) -> None:
        exc = auth_api._store_error(StoreVerificationError("验证码已过期", status_code=422))
        self.assertEqual(422, exc.status_code)
        self.assertEqual("验证码已过期", exc.detail)

    def test_parse_retry_after_only_accepts_positive_seconds(self) -> None:
        self.assertEqual(120, _parse_retry_after("120"))
        self.assertIsNone(_parse_retry_after(None))
        self.assertIsNone(_parse_retry_after(""))
        self.assertIsNone(_parse_retry_after("soon"))
        self.assertIsNone(_parse_retry_after("0"))
        self.assertIsNone(_parse_retry_after("-5"))


class _DatabaseCase(unittest.TestCase):
    def __init__(self, method_name: str = "runTest") -> None:
        # 资源在 __init__ 里建：``reportUninitializedInstanceVariable`` 只认类体与
        # __init__ 中的赋值，放 setUp 会被静态检查判成「从未初始化」。
        super().__init__(method_name)
        self._tmp = tempfile.TemporaryDirectory()
        self.database = Database("sqlite:///" + str(Path(self._tmp.name) / "test.db"))
        # cleanup 是 LIFO：先注册临时目录，保证最后才删（先 dispose 连接再删文件）。
        self.addCleanup(self._tmp.cleanup)
        self.addCleanup(self.database.dispose)

    def setUp(self) -> None:
        Base.metadata.create_all(self.database.engine)

    def _add_user(self, username: str, *, email: str | None, password: str) -> str:
        with self.database.session_factory() as session:
            user = User(username=username, email=email, password=password)
            session.add(user)
            session.commit()
            return user.id


class RegisterTransactionTest(_DatabaseCase):
    """注册写事务：先占写锁再复核，只清目标账号会话。"""

    def _register(self, username: str = "alice", email: str = "alice@example.com"):
        return auth_api._register_in_transaction(
            self.database.session_factory,
            username,
            email,
            PASSWORD,
            "127.0.0.1",
            "unittest/1.0",
            SESSION_MAX_AGE,
        )

    def test_creates_user_and_login_session(self) -> None:
        user, token, note = self._register()
        self.assertEqual("alice", user.username)
        self.assertEqual("alice@example.com", user.email)
        self.assertFalse(auth_api.is_credentialless(user.password))
        self.assertIn("完成注册", note)
        with self.database.session_factory() as session:
            rows = session.scalars(select(LoginSession)).all()
        self.assertEqual(1, len(rows))
        self.assertEqual(session_token_hash(token), rows[0].id_hash)
        self.assertEqual(user.id, rows[0].user_id)
        self.assertEqual("127.0.0.1", rows[0].ip_address)

    def test_rejects_when_local_account_already_exists(self) -> None:
        self._add_user("alice", email="alice@example.com", password=hash_password(PASSWORD))
        with self.assertRaises(HTTPException) as ctx:
            self._register()
        self.assertEqual(409, ctx.exception.status_code)
        self.assertIn("本机已有账号", ctx.exception.detail)

    def test_takes_over_credentialless_account_and_revokes_its_sessions(self) -> None:
        legacy_id = self._add_user(
            "old-name", email=None, password=EXTERNAL_PASSWORD_SENTINEL
        )
        with self.database.session_factory() as session:
            old_token = new_session_token()
            session.add(
                LoginSession(
                    id_hash=session_token_hash(old_token),
                    user_id=legacy_id,
                    expires_at=datetime.now(UTC) + timedelta(hours=1),
                )
            )
            session.commit()
        user, token, note = self._register()
        self.assertEqual(legacy_id, user.id)
        self.assertEqual("alice", user.username)
        self.assertEqual("alice@example.com", user.email)
        self.assertFalse(auth_api.is_credentialless(user.password))
        self.assertIn("接管", note)
        with self.database.session_factory() as session:
            rows = session.scalars(select(LoginSession)).all()
        self.assertEqual(1, len(rows))
        self.assertEqual(session_token_hash(token), rows[0].id_hash)
        self.assertNotEqual(session_token_hash(old_token), rows[0].id_hash)


class SessionAuthenticationTest(_DatabaseCase):
    """会话解析 + 滑动续期：服务端续期后必须回写 Cookie，过期/停用要删记录。"""

    def _create_session(
        self,
        *,
        last_seen: datetime | None = None,
        expires: datetime | None = None,
        is_active: bool = True,
    ) -> str:
        now = datetime.now(UTC)
        with self.database.session_factory() as session:
            user = User(
                username="alice",
                email="alice@example.com",
                password=hash_password(PASSWORD),
                is_active=is_active,
            )
            session.add(user)
            session.flush()
            token = new_session_token()
            session.add(
                LoginSession(
                    id_hash=session_token_hash(token),
                    user_id=user.id,
                    expires_at=expires or now + timedelta(seconds=SESSION_MAX_AGE),
                    last_seen_at=last_seen or now,
                )
            )
            session.commit()
        return token

    def _authenticate(self, token: str) -> tuple[User | None, Response]:
        response = Response()
        with self.database.session_factory() as session:
            user = authenticate_session(_fake_request(token), response, session)
        return user, response

    def test_stale_session_is_renewed_and_cookie_rewritten(self) -> None:
        token = self._create_session(
            last_seen=datetime.now(UTC) - timedelta(minutes=10)
        )
        user, response = self._authenticate(token)
        assert user is not None
        self.assertEqual("alice", user.username)
        set_cookies = response.headers.getlist("set-cookie")
        self.assertEqual(1, len(set_cookies))
        self.assertIn(f"auth_token={token}", set_cookies[0])
        self.assertIn(f"Max-Age={SESSION_MAX_AGE}", set_cookies[0])

    def test_fresh_session_does_not_touch_cookie_or_database(self) -> None:
        token = self._create_session()
        user, response = self._authenticate(token)
        assert user is not None
        self.assertEqual([], response.headers.getlist("set-cookie"))

    def test_expired_session_is_deleted(self) -> None:
        token = self._create_session(expires=datetime.now(UTC) - timedelta(minutes=1))
        user, response = self._authenticate(token)
        self.assertIsNone(user)
        self.assertEqual([], response.headers.getlist("set-cookie"))
        with self.database.session_factory() as session:
            self.assertIsNone(session.scalar(select(LoginSession)))

    def test_inactive_user_session_is_deleted(self) -> None:
        token = self._create_session(is_active=False)
        user, _ = self._authenticate(token)
        self.assertIsNone(user)
        with self.database.session_factory() as session:
            self.assertIsNone(session.scalar(select(LoginSession)))


class LicenseStatusListenerTest(unittest.TestCase):
    """授权状态变化监听器：只在真正变化时触发，单个监听器异常不打断其他监听器。"""

    def _service(self) -> LicenseService:
        service = LicenseService.__new__(LicenseService)
        service._event_lock = threading.RLock()
        service._observed_status = None
        service._status_listeners = []
        service.event_log = _FakeEventLog()
        return service

    def test_listener_called_once_per_transition(self) -> None:
        service = self._service()
        seen: list[str] = []
        service.add_status_listener(seen.append)
        service.add_status_listener(seen.append)  # 重复注册应被去重
        service._record_status("ACTIVE")
        service._record_status("ACTIVE")
        service._record_status("REVOKED")
        self.assertEqual(["ACTIVE", "REVOKED"], seen)

    def test_failing_listener_does_not_block_others(self) -> None:
        service = self._service()
        seen: list[str] = []

        def broken(status: str) -> None:
            raise RuntimeError("listener exploded")

        service.add_status_listener(broken)
        service.add_status_listener(seen.append)
        with self.assertLogs("homeos.license.service", level="WARNING"):
            service._record_status("REVOKED")
        self.assertEqual(["REVOKED"], seen)


class MinHeartbeatTest(unittest.TestCase):
    def test_default_without_environment(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("HOMEOS_LICENSE_HEARTBEAT_SECONDS", None)
            self.assertEqual(DEFAULT_MIN_HEARTBEAT_SECONDS, min_heartbeat_seconds())

    def test_environment_overrides_and_clamps(self) -> None:
        with mock.patch.dict(os.environ, {"HOMEOS_LICENSE_HEARTBEAT_SECONDS": "5"}):
            self.assertEqual(5, min_heartbeat_seconds())
        with mock.patch.dict(os.environ, {"HOMEOS_LICENSE_HEARTBEAT_SECONDS": "0"}):
            self.assertEqual(1, min_heartbeat_seconds())
        with mock.patch.dict(os.environ, {"HOMEOS_LICENSE_HEARTBEAT_SECONDS": "abc"}):
            self.assertEqual(DEFAULT_MIN_HEARTBEAT_SECONDS, min_heartbeat_seconds())


class _FakeDatabaseSession:
    def commit(self) -> None:
        pass


class _FakeVerifier:
    def __init__(self, body: dict | None = None, error: Exception | None = None) -> None:
        self.body = body
        self.error = error
        self.calls: list[tuple[str, str]] = []

    def verify(self, signed_lease: str, instance_id: str) -> dict:
        self.calls.append((signed_lease, instance_id))
        if self.error is not None:
            raise self.error
        return self.body or {}


class _ServiceHarness(LicenseService):
    """绕过真实 __init__（实例指纹 / 网络 / DB 装配），只注入被测方法需要的状态。"""

    def __init__(self, state, *, verifier: _FakeVerifier | None = None) -> None:
        self._fake_state = state
        self.verifier = verifier or _FakeVerifier()
        self.settings = SimpleNamespace(license_clock_skew_seconds=300)
        self.database = SimpleNamespace(
            session_factory=lambda: contextlib.nullcontext(_FakeDatabaseSession())
        )
        self.event_log = _FakeEventLog()
        self._error_code = "BOOT_ERROR"
        self._next_attempt = 123.4
        self._event_lock = threading.RLock()
        self._observed_status = None
        self._status_listeners = []
        self._allow_cache = {}
        self._schedule_changed = threading.Event()
        self._startup_validation_pending = False

    def _state(self, database):
        return self._fake_state


def _state(status: str = "ACTIVE", *, signed_lease: str = "signed-lease"):
    return SimpleNamespace(
        status=status,
        signed_lease=signed_lease,
        instance_id="instance-1",
        encrypted_recovery_token=None,
        lease_sequence=3,
    )


class KeepValidSessionTest(unittest.TestCase):
    """恢复票据不可用但本地签名租约仍有效：状态不得降级成 RECOVERY_REQUIRED。"""

    def _lease_body(
        self,
        *,
        expires_in: timedelta = timedelta(hours=2),
        issued_in: timedelta = timedelta(0),
    ) -> dict:
        now = datetime.now(UTC)
        return {
            "expiresAt": (now + expires_in).isoformat(),
            "issuedAt": (now + issued_in).isoformat(),
        }

    def test_valid_lease_keeps_current_status(self) -> None:
        verifier = _FakeVerifier(self._lease_body())
        service = _ServiceHarness(_state(), verifier=verifier)
        self.assertTrue(service._keep_valid_session("没有可用的租约恢复凭证"))
        self.assertEqual([("signed-lease", "instance-1")], verifier.calls)
        self.assertIsNone(service._error_code)
        self.assertIsNone(service._next_attempt)
        self.assertTrue(service.event_log.entries)
        self.assertEqual("ACTIVE", service._fake_state.status)

    def test_expired_lease_degrades(self) -> None:
        verifier = _FakeVerifier(self._lease_body(expires_in=timedelta(minutes=-1)))
        service = _ServiceHarness(_state(), verifier=verifier)
        self.assertFalse(service._keep_valid_session("恢复失败"))
        self.assertEqual("BOOT_ERROR", service._error_code)
        self.assertEqual(123.4, service._next_attempt)

    def test_lease_issued_in_future_is_rejected(self) -> None:
        verifier = _FakeVerifier(self._lease_body(issued_in=timedelta(hours=1)))
        service = _ServiceHarness(_state(), verifier=verifier)
        self.assertFalse(service._keep_valid_session("恢复失败"))

    def test_terminal_status_is_not_kept(self) -> None:
        verifier = _FakeVerifier(self._lease_body())
        service = _ServiceHarness(_state("REVOKED"), verifier=verifier)
        self.assertFalse(service._keep_valid_session("恢复失败"))
        self.assertEqual([], verifier.calls)

    def test_unverifiable_lease_degrades(self) -> None:
        verifier = _FakeVerifier(error=LicenseCryptoError("租约签名无效"))
        service = _ServiceHarness(_state(), verifier=verifier)
        self.assertFalse(service._keep_valid_session("恢复失败"))
        self.assertEqual("BOOT_ERROR", service._error_code)

    def test_blank_lease_degrades(self) -> None:
        service = _ServiceHarness(_state(signed_lease=""))
        self.assertFalse(service._keep_valid_session("恢复失败"))


class MarkRevokedTest(unittest.TestCase):
    """吊销是终态：必须立刻让 allows() 缓存失效并通知监听器。"""

    def test_revocation_invalidates_allow_cache_and_notifies(self) -> None:
        state = _state()
        service = _ServiceHarness(state)
        service._allow_cache[("lease-1", 3, "*")] = (float("inf"), True)
        seen: list[str] = []
        service.add_status_listener(seen.append)
        service._mark_revoked("商店判定授权已吊销")
        self.assertEqual("REVOKED", state.status)
        self.assertEqual({}, service._allow_cache)
        self.assertEqual("LICENSE_REVOKED", service._error_code)
        self.assertEqual(["REVOKED"], seen)
        self.assertTrue(service._schedule_changed.is_set())


class _FakeSio:
    def __init__(self) -> None:
        self.disconnected: list[str] = []

    async def disconnect(self, sid: str) -> None:
        self.disconnected.append(sid)


class GatewayLicenseKickTest(unittest.IsolatedAsyncioTestCase):
    """授权进入终态时，在线 WS 连接必须被主动断开（握手后不会再查授权）。"""

    def _gateway(self) -> tuple[RealtimeGateway, _FakeSio]:
        sio = _FakeSio()
        gateway = RealtimeGateway.__new__(RealtimeGateway)
        gateway.connected = {"sid-a", "sid-b"}
        # 真实的 AsyncServer 会在连接 socket.io 引擎后才可用；这里只替换掉
        # disconnect 这一个出口，其余状态保持最小。
        gateway.sio = cast("AsyncServer", sio)
        gateway._license_listener_registered = False
        gateway._loop = None
        return gateway, sio

    async def test_watch_license_registers_listener_only_once(self) -> None:
        gateway, _ = self._gateway()
        registered: list = []
        service = SimpleNamespace(add_status_listener=registered.append)
        gateway._watch_license(service)
        gateway._watch_license(service)
        self.assertTrue(gateway._license_listener_registered)
        self.assertEqual(1, len(registered))
        self.assertIs(asyncio.get_running_loop(), gateway._loop)

    async def test_watch_license_tolerates_missing_service(self) -> None:
        gateway, _ = self._gateway()
        gateway._watch_license(None)
        self.assertFalse(gateway._license_listener_registered)

    async def test_disconnect_all_closes_every_connection(self) -> None:
        gateway, sio = self._gateway()
        closed = await gateway.disconnect_all(reason="license_revoked")
        self.assertEqual(2, closed)
        self.assertEqual(["sid-a", "sid-b"], sorted(sio.disconnected))

    async def test_terminal_status_disconnects_connections(self) -> None:
        gateway, sio = self._gateway()
        gateway._loop = asyncio.get_running_loop()
        gateway._on_license_status("REVOKED")
        await asyncio.sleep(0.05)
        self.assertEqual(2, len(sio.disconnected))

    async def test_non_terminal_status_keeps_connections(self) -> None:
        gateway, sio = self._gateway()
        gateway._loop = asyncio.get_running_loop()
        gateway._on_license_status("ACTIVE")
        await asyncio.sleep(0.05)
        self.assertEqual([], sio.disconnected)


class _RecordingApp:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def __call__(self, scope, receive, send) -> None:
        self.calls.append(scope)


class _RecordingService:
    def __init__(self, allowed: bool) -> None:
        self.allowed = allowed
        self.calls: list[str | None] = []

    def allows(self, feature=None) -> bool:
        self.calls.append(feature)
        return self.allowed


async def _noop_receive() -> Message:  # pragma: no cover - 单纯占位
    return {"type": "websocket.connect"}


class WebSocketLicenseGuardTest(unittest.IsolatedAsyncioTestCase):
    """WS 握手不得绕过授权门禁：未授权时按 1008 拒绝，且不进入内层应用。"""

    async def _run(
        self,
        *,
        allowed: bool,
        license_required: bool = True,
        path: str = "/socket.io/",
        scope_type: str = "websocket",
    ) -> tuple[_RecordingApp, _RecordingService, list[Message]]:
        inner = _RecordingApp()
        service = _RecordingService(allowed)
        app = SimpleNamespace(state=SimpleNamespace(license_service=service))
        middleware = LicenseGuardMiddleware(
            inner,
            cast("Settings", SimpleNamespace(license_required=license_required)),
        )
        messages: list[Message] = []

        async def send(message: Message) -> None:
            messages.append(message)

        scope: Scope = {"type": scope_type, "path": path, "app": app}
        await middleware(scope, _noop_receive, send)
        return inner, service, messages

    async def test_unauthorized_websocket_is_closed_with_1008(self) -> None:
        inner, service, messages = await self._run(allowed=False)
        self.assertEqual([{"type": "websocket.close", "code": 1008}], messages)
        self.assertEqual([], inner.calls)
        self.assertEqual(["api"], service.calls)

    async def test_authorized_websocket_reaches_application(self) -> None:
        inner, service, messages = await self._run(allowed=True)
        self.assertEqual([], messages)
        self.assertEqual(1, len(inner.calls))
        self.assertEqual(["api"], service.calls)

    async def test_disabled_license_skips_check(self) -> None:
        inner, service, messages = await self._run(allowed=False, license_required=False)
        self.assertEqual([], messages)
        self.assertEqual(1, len(inner.calls))
        self.assertEqual([], service.calls)

    async def test_exempt_websocket_path_skips_check(self) -> None:
        inner, service, messages = await self._run(allowed=False, path="/static/app.js")
        self.assertEqual([], messages)
        self.assertEqual(1, len(inner.calls))
        self.assertEqual([], service.calls)

    async def test_non_websocket_non_http_scope_passes_through(self) -> None:
        inner, service, messages = await self._run(allowed=False, scope_type="lifespan")
        self.assertEqual([], messages)
        self.assertEqual(1, len(inner.calls))
        self.assertEqual([], service.calls)


class RegistrationLookupTest(_DatabaseCase):
    """``/auth/verification`` 的只读判定助手。"""

    def test_no_account_yet_is_registrable(self) -> None:
        self.assertFalse(auth_api._has_existing_account(self.database.session_factory))

    def test_active_account_is_not_registrable(self) -> None:
        self._add_user("alice", email="alice@example.com", password=hash_password(PASSWORD))
        self.assertTrue(auth_api._has_existing_account(self.database.session_factory))

    def test_single_credentialless_row_stays_registrable(self) -> None:
        self._add_user("legacy", email=None, password=EXTERNAL_PASSWORD_SENTINEL)
        self.assertFalse(auth_api._has_existing_account(self.database.session_factory))

    def test_email_lookup_is_case_insensitive(self) -> None:
        self._add_user("alice", email="alice@example.com", password=hash_password(PASSWORD))
        factory = self.database.session_factory
        self.assertTrue(auth_api._email_registered(factory, "ALICE@Example.COM"))
        self.assertFalse(auth_api._email_registered(factory, "bob@example.com"))


class PasswordAndLogoutHelpersTest(_DatabaseCase):
    """改密 / 重置 / 登出的同步事务体：只动目标账号并正确提交。"""

    def _db_request(self) -> Request:
        return _make_request(client=("10.0.0.5", 23456), user_agent="unittest/1.0")

    def _seed(
        self,
        username: str = "alice",
        email: str | None = "alice@example.com",
        password: str | None = None,
    ) -> tuple[str, str]:
        with self.database.session_factory() as session:
            user = User(
                username=username,
                email=email,
                password=password or hash_password(PASSWORD),
            )
            session.add(user)
            session.flush()
            token = new_session_token()
            session.add(
                LoginSession(
                    id_hash=session_token_hash(token),
                    user_id=user.id,
                    expires_at=datetime.now(UTC) + timedelta(seconds=SESSION_MAX_AGE),
                )
            )
            session.commit()
            return user.id, token

    def _session_user_ids(self) -> list[str]:
        with self.database.session_factory() as session:
            return [row.user_id for row in session.scalars(select(LoginSession)).all()]

    def _stored_hash(self, email: str) -> str:
        with self.database.session_factory() as session:
            stored = session.scalar(
                select(User.password).where(User.email == email)
            )
        assert stored is not None
        return stored

    def test_reset_password_rotates_hash_and_revokes_own_sessions(self) -> None:
        alice_id, alice_token = self._seed()
        bob_id, bob_token = self._seed("bob", "bob@example.com")
        result = auth_api._reset_password_in_db(
            self.database.session_factory, "alice@example.com", "New-Passw0rd!"
        )
        self.assertEqual((alice_id, "alice"), result)
        self.assertTrue(verify_password("New-Passw0rd!", self._stored_hash("alice@example.com")))
        self.assertFalse(verify_password(PASSWORD, self._stored_hash("alice@example.com")))
        remaining = self._session_user_ids()
        self.assertNotIn(alice_id, remaining)
        self.assertIn(bob_id, remaining)
        self.assertNotEqual(alice_token, bob_token)

    def test_reset_password_unknown_email_returns_none(self) -> None:
        self._seed()
        result = auth_api._reset_password_in_db(
            self.database.session_factory, "nobody@example.com", "New-Passw0rd!"
        )
        self.assertIsNone(result)
        self.assertEqual(1, len(self._session_user_ids()))

    def test_change_password_returns_rotated_session(self) -> None:
        alice_id, _old_token = self._seed()
        account_id, username, email, token = auth_api._change_password_in_db(
            self.database.session_factory,
            self._db_request(),
            alice_id,
            PASSWORD,
            "New-Passw0rd!",
            SESSION_MAX_AGE,
        )
        self.assertEqual(alice_id, account_id)
        self.assertEqual("alice", username)
        self.assertEqual("alice@example.com", email)
        self.assertTrue(verify_password("New-Passw0rd!", self._stored_hash("alice@example.com")))
        remaining = self._session_user_ids()
        self.assertEqual([alice_id], remaining)
        with self.database.session_factory() as session:
            row = session.scalar(select(LoginSession))
        assert row is not None
        self.assertEqual(session_token_hash(token), row.id_hash)
        self.assertEqual("10.0.0.5", row.ip_address)

    def test_change_password_rejects_wrong_current(self) -> None:
        alice_id, _token = self._seed()
        with self.assertRaises(HTTPException) as ctx:
            auth_api._change_password_in_db(
                self.database.session_factory,
                self._db_request(),
                alice_id,
                "wrong-password",
                "New-Passw0rd!",
                SESSION_MAX_AGE,
            )
        self.assertEqual(422, ctx.exception.status_code)

    def test_change_password_rejects_same_password(self) -> None:
        alice_id, _token = self._seed()
        with self.assertRaises(HTTPException) as ctx:
            auth_api._change_password_in_db(
                self.database.session_factory,
                self._db_request(),
                alice_id,
                PASSWORD,
                PASSWORD,
                SESSION_MAX_AGE,
            )
        self.assertEqual(409, ctx.exception.status_code)

    def test_change_password_unknown_user_is_401(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            auth_api._change_password_in_db(
                self.database.session_factory,
                self._db_request(),
                "missing-id",
                PASSWORD,
                "New-Passw0rd!",
                SESSION_MAX_AGE,
            )
        self.assertEqual(401, ctx.exception.status_code)

    def test_logout_revokes_current_session_only(self) -> None:
        alice_id, alice_token = self._seed()
        bob_id, _bob_token = self._seed("bob", "bob@example.com")
        username, revoked_user_id = auth_api._logout_in_db(
            self.database.session_factory, alice_token
        )
        self.assertEqual("alice", username)
        self.assertEqual(alice_id, revoked_user_id)
        self.assertEqual([bob_id], self._session_user_ids())

    def test_logout_with_unknown_token_is_noop(self) -> None:
        self._seed()
        username, revoked_user_id = auth_api._logout_in_db(
            self.database.session_factory, new_session_token()
        )
        self.assertEqual("用户", username)
        self.assertIsNone(revoked_user_id)
        self.assertEqual(1, len(self._session_user_ids()))


if __name__ == "__main__":
    unittest.main()
