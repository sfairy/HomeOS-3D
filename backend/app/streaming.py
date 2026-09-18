"""请求体落盘的共用工具。

两个上传端点（3D 导出 ZIP、用户素材图片）的形状是一样的：``async for chunk in
request.stream()`` 边收边写，同时逐块累计一个字节上限。共同的风险也一样 ——
写盘、flush、fsync 都是同步调用，直接写在 ``async def`` 路由里，一次大上传就会
让所有 HTTP 与 WebSocket 一起等（B5 / B6）。

这里不引入异步文件库，只做两件事：

1. 把「收流 → 攒批 → 写盘」收敛成一处，顺便给待写数据一个明确的内存上界；
2. 把必须同步完成的 fsync 单独包一层，让调用方一眼看出「这段要放进线程池」。

上限判定不在这里做：两个端点的状态码与中文文案都不同（413 的文案要带各自的
MB 数），因此以 ``before_write`` 回调交回调用方，抛异常即中断。
"""
from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator, Callable
from typing import BinaryIO

#: 攒够这么多字节才落盘一次。取 1 MiB：ASGI 分块通常是 64 KiB 上下，攒批把
#: write 的系统调用从「每块一次」压到「每 MiB 一次」；同时给待写数据一个上界，
#: 不把整个上传体读进内存（那是这套「边收边写」刻意避开的做法）。
BATCH_BYTES = 1 << 20


def flush_and_sync(descriptor: BinaryIO) -> None:
    """把缓冲刷进内核并 fsync 到磁盘。

    同步调用，调用方负责放进线程池：
    ``await asyncio.to_thread(flush_and_sync, handle)``。
    fsync 真的会等存储设备回应，在网络盘（NAS）上可能到秒级，不能留在事件循环里。
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

    参数:
        stream: 请求体异步流（``Request.stream()``）。
        descriptor: 已经以 ``xb`` 打开的目标文件。
        before_write: 每一批落盘前以「累计收到的字节数」调用一次；抛异常即中断上传。
            判定放在落盘之前，超限的那一批不会写进文件。

    返回:
        收到的总字节数；因超限中断时不会走到这里（异常直接往上抛）。
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
