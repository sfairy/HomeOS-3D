"""T1 回归：登录限流/会话审计的来源 IP 必须走可信代理判据。

背景（审计发现 T1-001）：主应用已有一份共享判据 `homeos_shared.client_ip`
（经 `platform.security.client_address` 包装），限流依赖与 MCP 网关都用它；
但登录限流与 `sessions.ip_address` 审计仍直接取 `request.client.host`。

镜像内置反向代理就在同容器回环上，且发行默认 `APP_TRUSTED_PROXIES=127.0.0.1,::1`，
于是所有客户端在登录路径上都是 `127.0.0.1`：

1. 任意来源失败 5 次即打满 `ip:127.0.0.1` 桶，600 秒内所有人（含密码正确者）都只
   拿到 429 —— 零成本全局登录拒绝服务；
2. `sessions.ip_address` 把每条会话都记成代理地址，审计失去意义。

这里把修复后的三条语义钉住：
- 可信对端 + X-Forwarded-For → 采信转发链里最右侧的不可信地址；
- 不可信对端 → 完全忽略转发头（客户端可伪造）；
- 判不出客户端地址 → 不建全局 IP 桶，只保留按账号桶（避免再制造一个全局 DoS 开关）。
"""

from __future__ import annotations

import sys
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"

# 后端是 `python -m src.run` 的 `src` 包；只把 backend 根目录放进 path。
sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import HTTPException
from src.api.auth import _login_limiter_keys, request_metadata
from src.api.global_logs import _limit_client_log
from src.platform.security.session_store import create_login_session
from starlette.requests import Request

TRUSTED_LOOPBACK = ("127.0.0.1", "::1")


def make_request(
    peer: str,
    *,
    forwarded_for: str | None = None,
    real_ip: str | None = None,
    trusted_proxies: tuple[str, ...] = TRUSTED_LOOPBACK,
    user_agent: str = "unit-test-agent",
) -> Request:
    """构造一个只带地址/转发头的最小 Starlette 请求。"""
    headers: list[tuple[bytes, bytes]] = [(b"user-agent", user_agent.encode("latin-1"))]
    if forwarded_for is not None:
        headers.append((b"x-forwarded-for", forwarded_for.encode("latin-1")))
    if real_ip is not None:
        headers.append((b"x-real-ip", real_ip.encode("latin-1")))
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/v1/auth/login",
        "raw_path": b"/api/v1/auth/login",
        "query_string": b"",
        "root_path": "",
        "headers": headers,
        "client": (peer, 42424),
        "server": ("127.0.0.1", 18910),
        "app": SimpleNamespace(
            state=SimpleNamespace(settings=SimpleNamespace(trusted_proxies=trusted_proxies))
        ),
    }
    return Request(scope)


class FakeSession:
    """只实现 `create_login_session` 用到的最小会话接口。"""

    def __init__(self) -> None:
        self.added: list[object] = []

    def add(self, instance: object) -> None:
        self.added.append(instance)


class LoginLimiterKeyTests(unittest.TestCase):
    def test_trusted_proxy_uses_forwarded_client(self) -> None:
        request = make_request(
            "127.0.0.1", forwarded_for="198.51.100.9, 203.0.113.7"
        )
        # 最右侧（代理追加的）不可信地址才是真实客户端；左侧是客户端可伪造的。
        self.assertEqual(
            _login_limiter_keys(request, "alice"),
            ("ip:203.0.113.7", "account:203.0.113.7:alice"),
        )
        self.assertEqual(request_metadata(request)[0], "203.0.113.7")

    def test_untrusted_peer_ignores_forwarded_header(self) -> None:
        request = make_request(
            "192.0.2.5",
            forwarded_for="203.0.113.7",
            real_ip="203.0.113.7",
        )
        self.assertEqual(
            _login_limiter_keys(request, "alice"),
            ("ip:192.0.2.5", "account:192.0.2.5:alice"),
        )
        self.assertEqual(request_metadata(request)[0], "192.0.2.5")

    def test_no_trusted_proxies_ignores_forwarded_header(self) -> None:
        request = make_request(
            "127.0.0.1",
            forwarded_for="203.0.113.7",
            trusted_proxies=(),
        )
        self.assertEqual(request_metadata(request)[0], "127.0.0.1")

    def test_unresolvable_client_has_no_global_ip_bucket(self) -> None:
        # 可信对端但没有转发头：判不出客户端地址，绝不能建全局 IP 桶。
        request = make_request("127.0.0.1")
        keys = _login_limiter_keys(request, "alice")
        self.assertEqual(keys, ("account:alice",))
        self.assertFalse(any(key.startswith("ip:") for key in keys))

    def test_x_real_ip_fallback_when_forwarded_for_absent(self) -> None:
        request = make_request("127.0.0.1", real_ip="203.0.113.11")
        self.assertEqual(request_metadata(request)[0], "203.0.113.11")

    def test_different_clients_get_different_ip_buckets(self) -> None:
        first = _login_limiter_keys(
            make_request("127.0.0.1", forwarded_for="203.0.113.10"), "alice"
        )
        second = _login_limiter_keys(
            make_request("127.0.0.1", forwarded_for="203.0.113.99"), "alice"
        )
        self.assertNotEqual(first[0], second[0])
        self.assertNotEqual(first[1], second[1])


class LoginSessionAuditIpTests(unittest.TestCase):
    def test_session_records_forwarded_client_ip(self) -> None:
        request = make_request("127.0.0.1", forwarded_for="203.0.113.7")
        session = FakeSession()
        create_login_session(session, request, "user-1", max_age_seconds=60)
        self.assertEqual(len(session.added), 1)
        record = session.added[0]
        self.assertEqual(record.ip_address, "203.0.113.7")
        self.assertEqual(record.user_agent, "unit-test-agent")

    def test_session_records_untrusted_peer_without_forwarded_header(self) -> None:
        request = make_request(
            "192.0.2.5", forwarded_for="203.0.113.7", trusted_proxies=()
        )
        session = FakeSession()
        create_login_session(session, request, "user-1", max_age_seconds=60)
        self.assertEqual(session.added[0].ip_address, "192.0.2.5")


class _FakeLogStore:
    """只实现 `_limit_client_log` 用到的最小存储接口。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()


class AnonymousLogLimiterPeerTests(unittest.TestCase):
    """T1-003：未登录页面上报的限流也要按可信代理判据分桶。"""

    def _hit(self, store: _FakeLogStore, peer: str, *, forwarded_for: str | None = None) -> None:
        request = make_request(peer, forwarded_for=forwarded_for)
        request.app.state.global_log = store
        _limit_client_log(request, anonymous=True)

    def test_trusted_proxy_clients_get_separate_buckets(self) -> None:
        store = _FakeLogStore()
        for _ in range(30):
            self._hit(store, "127.0.0.1", forwarded_for="203.0.113.10")
        with self.assertRaises(HTTPException) as caught:
            self._hit(store, "127.0.0.1", forwarded_for="203.0.113.10")
        self.assertEqual(caught.exception.status_code, 429)
        # 别的客户端（经同一回环代理）不能被这个桶连坐。
        self._hit(store, "127.0.0.1", forwarded_for="203.0.113.99")

    def test_untrusted_peer_uses_peer_address(self) -> None:
        store = _FakeLogStore()
        for _ in range(30):
            self._hit(store, "192.0.2.5")
        with self.assertRaises(HTTPException):
            self._hit(store, "192.0.2.5")
        # 伪造转发头不能换桶（对端不可信）。
        with self.assertRaises(HTTPException):
            self._hit(store, "192.0.2.5", forwarded_for="198.51.100.1")

    def test_unresolvable_client_falls_back_to_shared_bucket(self) -> None:
        # 可信对端但无转发头：判不出客户端，退化到全局桶（不会抛异常）。
        self._hit(_FakeLogStore(), "127.0.0.1")


if __name__ == "__main__":
    unittest.main()
