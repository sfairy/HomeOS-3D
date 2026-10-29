"""在事件循环之外跑文件系统工作，并且**取消时也不丢状态**。

背景：备份、导出、素材落盘这类活儿都是同步文件 IO，必须丢到线程里跑，否则会卡住
事件循环。历史上这里只有一句 ``await asyncio.to_thread(...)``，问题出在取消语义上：
``to_thread`` 在任务被取消时会立刻抛 ``CancelledError``，但**线程还在跑**。

对「先写临时目录、再原子替换」的流程，后果是：调用方看到取消、以为没发生，
转头又发起一次；而第一次的线程仍在写同一个目录 —— 两次作业互相覆盖，最终留下半截
文件。所以取消不能是「放弃等待」，必须是「先把这次的活儿等完，再让取消生效」。

``durable_work`` 的做法：把线程包装成独立的 task，正常路径 ``shield`` 它；收到取消时
用 ``anyio.CancelScope(shield=True)`` 开一个屏蔽取消的作用域，等 worker 真正结束后
重新抛出 ``CancelledError``。这样「取消」只影响调用方的后续流程，不影响已经提交的写入。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from anyio import CancelScope, get_cancelled_exc_class

LOGGER = logging.getLogger(__name__)


async def durable_work(function: Any, *args: Any, **kwargs: Any) -> Any:
    """在线程里执行 ``function(*args)``；被取消时等它跑完再把取消抛出去。"""

    worker = asyncio.create_task(asyncio.to_thread(function, *args, **kwargs))
    try:
        return await asyncio.shield(worker)
    except get_cancelled_exc_class():
        # 关键：屏蔽取消的作用域里再等一次。这里必须循环等，因为 ``shield`` 只是
        # 「本次 await 不被取消打断」，worker 可能还要跑很久。
        with CancelScope(shield=True):
            while not worker.done():
                try:
                    await asyncio.shield(worker)
                except asyncio.CancelledError:
                    # 屏蔽作用域里理论上不会到这里；真到了就继续等，绝不放走线程。
                    LOGGER.debug('屏蔽取消的作用域里再次收到取消，继续等待 worker 结束')
                    continue
                except Exception:
                    # worker 自己失败了：``shield`` 会把它的异常直接抛出来。跳出循环，
                    # 交给下面统一消费 —— 这里抛出去会把取消换成写入异常。
                    LOGGER.warning('已提交的后台写入在取消后失败', exc_info=True)
                    break
            # 取出结果：worker 里抛的异常在这里被消费掉，避免
            # 「Task exception was never retrieved」掩盖真正的取消原因，也避免把
            # ``CancelledError`` 换成写入异常（调用方是主动取消的，它需要看到取消）。
            # 但失败不能丢：记日志，排查半截文件时还有线索。
            try:
                worker.result()
            except Exception:
                LOGGER.warning('已提交的后台写入在取消后失败', exc_info=True)
        raise
