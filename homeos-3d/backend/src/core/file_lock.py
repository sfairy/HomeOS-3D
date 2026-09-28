"""跨进程文件锁：POSIX 走 ``flock``，Windows 走 ``msvcrt.locking``。
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path

if os.name == 'nt':
    import msvcrt

    @contextmanager
    def file_lock(handle, *, shared: bool = False):
        """Windows 下对句柄首字节加锁。
        """
        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_RLCK if shared else msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
else:
    import fcntl

    @contextmanager
    def file_lock(handle, *, shared: bool = False):
        """POSIX 下加 flock：读共享、写排他（可被 flock(LOCK_SH) 并存）。
        """
        fcntl.flock(handle, fcntl.LOCK_SH if shared else fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


@contextmanager
def locked_file(path: Path, *, shared: bool = False):
    """打开 ``path``（必要时先建父目录）并加锁，退出 with 块时解锁。
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    # 'a+b' 不截断：这个文件只用来加锁，不存内容。用 with 保证句柄一定被关闭。
    with path.open('a+b') as handle, file_lock(handle, shared=shared):
        yield
