"""请求体落盘的共用工具。
"""
from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator, Callable
from typing import BinaryIO

#: 攒够这么多字节才落盘一次。取 1 MiB：ASGI 分块通常是 64 KiB 上下，攒批把
BATCH_BYTES = 1 << 20


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
