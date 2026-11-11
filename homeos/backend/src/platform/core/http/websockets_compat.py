"""websockets 17.x 在「HTTP 代理 + TLS 握手失败」时 ``connection_lost`` 崩溃的兜底。

上游缺陷（17.0 ~ 17.4 均未修复）：``websockets.asyncio.client`` 走 HTTP 代理时，
先 ``transport.set_protocol(connection)``，再 ``loop.start_tls(...)``；
``connection_made()`` 是 TLS 握手**成功之后**才由 websockets 手动调用的。
而 uvloop（uvicorn 默认档）的 TLS 实现在握手失败 / 超时被取消时会直接回调
app protocol 的 ``connection_lost()``，那里无条件访问 ``self.recv_messages``
（只在 ``connection_made()`` 里创建）：

    AttributeError: 'ClientConnection' object has no attribute 'recv_messages'

真实错误（``ConnectionResetError`` / ``TimeoutError``）已经正确抛给调用方，
调用侧的重试 / 放弃逻辑不受影响；这里只把「连接从未建立」这条路径补成合法状态：
塞一个空 ``Assembler`` 进去，上游原有收尾逻辑（协议置 CLOSED、唤醒
``connection_lost_waiter``、取消 keepalive）照常跑完，日志里不再多一坨 traceback。

安装点跟着各处既有的延迟导入走（HA 连接器 / edge-tts），而不是在启动期统一装 ——
websockets 那条约 20 ms 的导入链不该被算进冷启动。重复安装是幂等的；上游哪天自己
加了 ``hasattr`` 判断，这层包装退化成直通，不会与修复冲突。
"""

from __future__ import annotations

import logging

logger = logging.getLogger("homeos.bootstrap")

#: 挂在替换后的方法上，用于幂等判断
_GUARD_MARK = "_homeos_connection_lost_guard"


def _guard_connection_lost(connection_lost):
    """把 ``Connection.connection_lost`` 包一层「连接未建立」防御分支。"""

    def connection_lost_guarded(self, exc):
        if not hasattr(self, "recv_messages"):
            # 连接从未建立：既没有待完成的 recv，也没有在途 ping；
            # 空队列交给上游 `.close()`，之后任何 recv 都会得到 ConnectionClosed。
            from websockets.asyncio.messages import Assembler

            self.recv_messages = Assembler(self.max_queue_high, self.max_queue_low)
        connection_lost(self, exc)

    setattr(connection_lost_guarded, _GUARD_MARK, True)
    connection_lost_guarded.__doc__ = connection_lost.__doc__
    connection_lost_guarded.__wrapped__ = connection_lost
    return connection_lost_guarded


def guarded_websockets():
    """延迟导入 ``websockets`` 并确保连接丢失兜底已安装，返回模块本身。

    给「只有用到才导入」的调用点（HA 连接器 / edge-tts）一个 choke point：导入与装补丁
    写在一处，新增调用方不会再漏装。导入链只在首次真正调用时付出。
    """
    import websockets

    install_connection_lost_guard()
    return websockets


def install_connection_lost_guard() -> bool:
    """给 ``websockets`` 的 ``Connection.connection_lost`` 装上防御分支。

    @returns 本次是否真的打了补丁；已装过（或 websockets 不可用）返回 ``False``。
    """
    try:
        from websockets.asyncio import connection as ws_connection
    except ImportError:  # pragma: no cover - 缺依赖时业务侧的报错更明确，这里不该抢戏
        logger.debug("websockets 未安装，跳过 connection_lost 兜底")
        return False
    current = ws_connection.Connection.connection_lost
    if getattr(current, _GUARD_MARK, False):
        return False
    ws_connection.Connection.connection_lost = _guard_connection_lost(current)
    logger.debug("已为 websockets connection_lost 装上代理握手失败兜底")
    return True
