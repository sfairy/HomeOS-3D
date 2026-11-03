"""Stop 服务时那条「ERROR [Web服务器] Traceback ... CancelledError」的降噪。

现象：Ctrl+C 停后端（尤其是需要按两次 —— 常驻 WebSocket 让优雅关闭要走
``Waiting for background tasks to complete``），控制台末尾会多出一整段
``ERROR [Web服务器] Traceback (most recent call last): ... asyncio.exceptions.CancelledError``。
看着像崩溃，其实进程已经正常退出：端口释放了、reloader 也停了。

链路（三方各做对了一件事，凑起来就成了这段噪音）：

1. ``uvicorn.Server.capture_signals`` 在优雅关闭结束后把先前捕获的信号
   ``signal.raise_signal`` 抛回去，还原「用户按了 Ctrl+C」这一事实；
2. Python 3.15 的 ``asyncio.run`` 把 SIGINT 变成注入事件循环的 ``KeyboardInterrupt``，
   而此刻 lifespan 任务还停在 ``await receive()`` 上等最后一条消息；
3. ``asyncio.run`` 收尾时取消剩余任务 → ``CancelledError`` 穿过 starlette
   ``Router.lifespan`` 的 ``except BaseException`` → 它把 ``traceback.format_exc()``
   塞进 ``lifespan.shutdown.failed`` → uvicorn ``LifespanOn.send`` 用
   ``logger.error(message["message"])`` 原样打出来。

判定：**三条同时成立**才丢，宁放过不误杀 ——

- 消息本身以 ``Traceback (most recent call last):`` 开头（uvicorn 这种「把整段堆栈当
  正文打」的写法，我们自己的日志不会这么写）；
- 末尾异常是 ``CancelledError`` / ``KeyboardInterrupt``（关停期的取消，而不是业务异常）；
- 堆栈里没有我们自己 ``backend/src`` 的帧（有帧就说明是应用代码真出事，必须留着）。

真正的关闭失败（lifespan shutdown 抛业务异常）会因第 2/3 条被保留，日志里仍然能看到。
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

#: 应用源码根（``.../homeos/backend/src``）：堆栈里出现它的帧就说明是应用自己的问题
APP_SRC = f"{Path(__file__).resolve().parents[3]}{os.sep}"

#: uvicorn 把整段堆栈当正文打印时的固定开头
_TRACEBACK_HEAD = "Traceback (most recent call last):"

#: 关停期取消的末尾异常（``traceback.format_exc()`` 的最后一行）
_CANCELLATION_TAILS = frozenset(
    {
        "asyncio.exceptions.CancelledError",
        "CancelledError",
        "KeyboardInterrupt",
    }
)

#: 需要挂过滤器的日志器：lifespan 的失败消息走 ``uvicorn.error``
_TARGET_LOGGERS = ("uvicorn", "uvicorn.error")

#: 幂等标记
_FILTER_FLAG = "_homeos_shutdown_noise"


class ShutdownNoiseFilter(logging.Filter):
    """丢掉 uvicorn 在关停期打出的「纯取消」堆栈。"""

    def filter(self, record: logging.LogRecord) -> bool:
        return not is_shutdown_cancellation(record.getMessage())


def is_shutdown_cancellation(message: str) -> bool:
    """这段文本是不是「关停期被取消」的堆栈（是则应折叠）。"""
    text = (message or "").strip()
    if not text.startswith(_TRACEBACK_HEAD):
        return False
    if APP_SRC in text:
        # 应用代码出现在堆栈里：可能是真故障，交给人看
        return False
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return bool(lines) and lines[-1] in _CANCELLATION_TAILS


def install_shutdown_noise_filter() -> int:
    """把降噪过滤器挂到 uvicorn 日志器（幂等）。

    @returns 本次新挂上的日志器个数。
    """
    installed = 0
    for name in _TARGET_LOGGERS:
        logger = logging.getLogger(name)
        if any(getattr(item, _FILTER_FLAG, False) for item in logger.filters):
            continue
        noise = ShutdownNoiseFilter()
        setattr(noise, _FILTER_FLAG, True)
        logger.addFilter(noise)
        installed += 1
    return installed
