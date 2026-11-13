"""Socket.IO 传输层的 500 兜底：把 engineio 漏捕获的「会话已关闭」降级成 400。

为什么需要这一层
----------------
``python-engineio`` 4.15.1 的 ``AsyncServer.handle_request`` 里，GET 分支对
``_get_socket(sid)`` 做了 ``try/except KeyError``，**POST 分支没有**::

    elif method == 'POST':
        ...
        socket = self._get_socket(sid)      # ← 未包 try

而 ``_get_socket`` 在会话已关闭时会先 ``del self.sockets[sid]`` 再
``raise KeyError('Session is disconnected')``。这个 KeyError 一路冒泡到 socketio 的
ASGIApp（它只做路径分派、不接异常），最终由 uvicorn 转成 **500 Internal Server Error**。

线上表现（最小复现已固化为回归测试 ``ops/checks/security/tests/test_socketio_transport.py``）：
浏览器断线或心跳超时后，engineio 已把 socket 标成 closed、却还没来得及从 ``sockets``
摘除的那个窗口里，客户端最后一发 polling POST 打进来 → 500；socket.io-client 把它记成
``connect_error: xhr post error``，随后拿着同一个死 sid 做 WebSocket upgrade，于是控制台
再补一句 ``WebSocket is closed``。三条报错其实是同一条故障，根因就是这个未捕获的 KeyError。

为什么是 400 而不是 200 / 500
-----------------------------
400 正是同一份库的 GET 分支对同一情况的答复（``_bad_request(f'{e} {sid}')``）。语义上
「你这个 sid 过期了」：客户端据此丢弃旧会话、重新握手拿新 sid。500 则会被前端当成服务端
故障去重试**同一个**死 sid，还会污染错误率与告警 —— 用一个语义正确的 4xx 换掉一个假的 5xx。
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("homeos.http.socketio")

#: engineio 的挂载前缀（``socketio_path="socket.io"`` 在 ASGIApp 里被补成 ``/socket.io/``）。
SOCKETIO_PATH_PREFIX = "/socket.io"

#: ``_get_socket`` 抛出的两类 KeyError 文案，只有它们代表「会话已失效」。
STALE_SESSION_MESSAGES = ("Session not found", "Session is disconnected")


def is_socketio_path(path: str) -> bool:
    """``path`` 是否属于 Socket.IO 的传输端点（不是业务路由）。"""
    return path == SOCKETIO_PATH_PREFIX or path.startswith(SOCKETIO_PATH_PREFIX + "/")


def is_stale_session_error(error: BaseException) -> bool:
    """``error`` 是否是 engineio「会话已失效」的 KeyError。

    只认那两条固定文案：其它 KeyError 是真正的 bug，必须继续冒泡成 500（不能在这层被
    静默吞掉，否则下一次排障会连 traceback 都看不到）。
    """
    if not isinstance(error, KeyError) or len(error.args) != 1:
        return False
    message = error.args[0]
    return isinstance(message, str) and message in STALE_SESSION_MESSAGES


def _query_sid(query_string: bytes | str) -> str:
    """从查询串里取 ``sid``，只用于日志定位（取不到返回空串）。"""
    from urllib.parse import parse_qs

    raw = query_string.decode("utf-8", "replace") if isinstance(query_string, bytes) else query_string
    values = parse_qs(raw).get("sid")
    return values[0] if values else ""


class SocketIOTransportGuard:
    """ASGI 包装：把 engineio「会话已失效」的 KeyError 变成 400。

    只拦 ``/socket.io`` 下的 HTTP 请求；其余流量（含转发给 FastAPI 的业务请求）原样放行。
    WebSocket 升级不走这条路径（GET 分支本来就有 try/except），因此无需在此处理。
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope.get("type") != "http" or not is_socketio_path(scope.get("path") or ""):
            await self.app(scope, receive, send)
            return

        started = False

        async def guarded_send(message: Any) -> None:
            nonlocal started
            if message.get("type") == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, guarded_send)
        except KeyError as error:
            # 响应已开始发送时不能再写第二个响应头；交回上层（uvicorn 会按连接已污染处理）。
            if started or not is_stale_session_error(error):
                raise
            logger.info(
                "Socket.IO 收到过期会话的 %s 请求，按 400 回收 sid=%s（engineio POST 分支未捕获该 KeyError）",
                scope.get("method"),
                _query_sid(scope.get("query_string") or b"") or "-",
            )
            await send(
                {
                    "type": "http.response.start",
                    "status": 400,
                    "headers": [(b"content-type", b"text/plain; charset=utf-8")],
                }
            )
            await send({"type": "http.response.body", "body": b"Invalid session"})


def guard_socketio_transport(app: Any) -> Any:
    """给 socketio.ASGIApp 套上「会话已失效 → 400」的兜底。"""
    return SocketIOTransportGuard(app)


__all__ = [
    "SOCKETIO_PATH_PREFIX",
    "STALE_SESSION_MESSAGES",
    "SocketIOTransportGuard",
    "guard_socketio_transport",
    "is_socketio_path",
    "is_stale_session_error",
]
