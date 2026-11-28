#!/usr/bin/env python3
"""Socket.IO 来源自检：跨站且不带 Origin 的握手必须被拒，同源握手不能受影响。

## 为什么需要它

``engineio`` 只在**Origin 存在时**才调用我们的来源判定（``server.py`` 的 ``if origin:``
分支），所以「没带 Origin」等于完全不做校验。而浏览器的**同源 XHR GET** 握手本来就不带
Origin（只有 POST 才带），因此不能简单拒绝缺 Origin 的请求 —— 那会把面板的实时通道
整个打断（表现为「连上又掉、状态不刷新」）。

正确判据是浏览器自己设置、页面脚本无法伪造的 ``Sec-Fetch-Site``：

- ``same-origin`` / ``none`` → 放行（同源页面 / 用户直接打开）；
- ``cross-site`` / ``same-site`` → 拒绝（Cookie 不按端口隔离，同主机不同端口也是另一个源）；
- **没有** ``Sec-Fetch-*`` 头 → 非浏览器客户端，维持放行（兼容 curl / 原生壳）。
"""

from __future__ import annotations

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.platform.core.http.socketio_transport import (
    ALLOWED_SEC_FETCH_SITE_WITHOUT_ORIGIN,
    SocketIOTransportGuard,
    is_cross_site_without_origin,
    is_socketio_path,
)


def scope(headers: list[tuple[bytes, bytes]], *, path: str = "/socket.io/", kind: str = "http") -> dict:
    return {"type": kind, "path": path, "headers": headers, "method": "GET", "query_string": b""}


def test_same_origin_handshake_allowed() -> None:
    """浏览器同源 XHR GET 握手：无 Origin + Sec-Fetch-Site: same-origin。"""
    request = scope([(b"sec-fetch-site", b"same-origin"), (b"host", b"homeos.local:8801")])
    check("同源握手不被判为跨站", is_cross_site_without_origin(request) is False)


def test_direct_navigation_allowed() -> None:
    request = scope([(b"sec-fetch-site", b"none")])
    check("直接打开（none）放行", is_cross_site_without_origin(request) is False)


def test_cross_site_without_origin_rejected() -> None:
    request = scope([(b"sec-fetch-site", b"cross-site"), (b"host", b"homeos.local:8801")])
    check("跨站且无 Origin 被拒", is_cross_site_without_origin(request) is True)


def test_same_site_without_origin_rejected() -> None:
    """同主机不同端口：Cookie 不按端口隔离，必须按跨源处理。"""
    request = scope([(b"sec-fetch-site", b"same-site")])
    check("同站不同源且无 Origin 被拒", is_cross_site_without_origin(request) is True)


def test_non_browser_client_allowed() -> None:
    request = scope([(b"host", b"homeos.local:8801")])
    check("无 Sec-Fetch 头（脚本客户端）维持放行", is_cross_site_without_origin(request) is False)


def test_origin_present_is_not_our_business() -> None:
    """有 Origin 时由 engine.io 的白名单 + 同源兜底判定，这里不重复拦。"""
    request = scope([(b"origin", b"http://evil.example"), (b"sec-fetch-site", b"cross-site")])
    check("有 Origin 时本函数不介入", is_cross_site_without_origin(request) is False)


def test_allowed_set_contents() -> None:
    check("放行集合只含 same-origin / none", set(ALLOWED_SEC_FETCH_SITE_WITHOUT_ORIGIN) == {"same-origin", "none"})


def test_path_matching() -> None:
    check("socket.io 根路径命中", is_socketio_path("/socket.io") is True)
    check("socket.io 子路径命中", is_socketio_path("/socket.io/") is True)
    check("业务路径不命中", is_socketio_path("/api/v1/entities") is False)
    check("前缀相似路径不命中", is_socketio_path("/socket.ioxxx") is False)


class _Recorder:
    """记录 ASGI 响应的最小 send。"""

    def __init__(self) -> None:
        self.messages: list[dict] = []

    async def __call__(self, message: dict) -> None:
        self.messages.append(message)


async def _never_called(_scope, _receive, _send) -> None:
    raise AssertionError("跨站请求不应转发给 engine.io")


def test_guard_rejects_cross_site_http() -> None:
    import asyncio

    async def scenario() -> None:
        guard = SocketIOTransportGuard(_never_called)
        recorder = _Recorder()
        await guard(
            scope([(b"sec-fetch-site", b"cross-site")]),
            None,
            recorder,
        )
        statuses = [m.get("status") for m in recorder.messages if m.get("type") == "http.response.start"]
        check("跨站 HTTP 握手返回 403", statuses == [403], str(recorder.messages))

    asyncio.run(scenario())


def test_guard_rejects_cross_site_websocket() -> None:
    import asyncio

    async def scenario() -> None:
        guard = SocketIOTransportGuard(_never_called)
        recorder = _Recorder()
        await guard(scope([(b"sec-fetch-site", b"cross-site")], kind="websocket"), None, recorder)
        closes = [m for m in recorder.messages if m.get("type") == "websocket.close"]
        check("跨站 WS 升级被关闭", closes and closes[0]["code"] == 1008, str(recorder.messages))

    asyncio.run(scenario())


def main() -> int:
    test_same_origin_handshake_allowed()
    test_direct_navigation_allowed()
    test_cross_site_without_origin_rejected()
    test_same_site_without_origin_rejected()
    test_non_browser_client_allowed()
    test_origin_present_is_not_our_business()
    test_allowed_set_contents()
    test_path_matching()
    test_guard_rejects_cross_site_http()
    test_guard_rejects_cross_site_websocket()
    report("Socket.IO 来源")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
