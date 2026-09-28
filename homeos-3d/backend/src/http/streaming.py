"""请求体落盘的共用工具。
"""
from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator, Callable
from typing import BinaryIO

from fastapi import HTTPException

#: 攒够这么多字节才落盘一次。取 1 MiB：ASGI 分块通常是 64 KiB 上下，攒批把
BATCH_BYTES = 1 << 20


def size_limit_guard(*limits: tuple[int, str]) -> Callable[[int], None]:
    """构造 ``write_stream_in_batches`` 的 before_write 回调。

    按声明顺序逐档比对「截至当前实收字节数」，超过任一档（``received > ceiling``）
    即抛 413 并回传该档文案；多档用于「单文件上限 + 账号总配额」这类串联判定。
    """

    def _reject_oversized(received: int) -> None:
        for ceiling, detail in limits:
            if received > ceiling:
                raise HTTPException(status_code=413, detail=detail)

    return _reject_oversized


def flush_and_sync(descriptor: BinaryIO) -> None:
    """把缓冲刷进内核并 fsync 到磁盘。
    """
    descriptor.flush()
    os.fsync(descriptor.fileno())


async def write_stream_in_batches(
    stream: AsyncIterator[bytes],
    descriptor: BinaryIO,
    *,
    before_write: Callable[[int], None] | None = None,
) -> int:
    """把请求体写进已打开的目标文件，返回收到的总字节数。
    """
    received = 0
    pending = bytearray()
    async for chunk in stream:
        if not chunk:
            continue
        received += len(chunk)
        if before_write is not None:
            before_write(received)
        pending += chunk
        if len(pending) >= BATCH_BYTES:
            # bytes(...) 拷一份再交出去：pending 下一轮会被清空复用。
            await asyncio.to_thread(descriptor.write, bytes(pending))
            pending.clear()
    if pending:
        await asyncio.to_thread(descriptor.write, bytes(pending))
    return received
