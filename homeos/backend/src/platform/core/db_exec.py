"""把同步数据库操作移出事件循环的统一入口。

SQLAlchemy 的同步 Session 只能在普通线程里跑；FastAPI 的 async 路由如果直接
调用 session.execute()，会把整个事件循环卡在磁盘 I/O 或 SQLite 写锁上。

本模块只做一件事：把同步操作交给线程池。调用点保持同步闭包的写法，避免在
await 点之间共享 Session（Session 不是线程安全的，必须在线程内部创建和关闭）。
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import ParamSpec, TypeVar

_P = ParamSpec("_P")
_R = TypeVar("_R")


async def run_db(operation: Callable[_P, _R], *args: _P.args, **kwargs: _P.kwargs) -> _R:
    """在线程池执行一次同步数据库操作，不阻塞事件循环。"""
    return await asyncio.to_thread(operation, *args, **kwargs)
