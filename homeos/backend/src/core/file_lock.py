"""跨进程文件锁：POSIX 走 ``flock``，Windows 走 ``msvcrt.locking``。

与商店 ``homeos-store/backend/src/core/file_lock.py`` 是同一实现的两个副本：两端独立
部署，不可互相 import。改动其中一份时请同步另一份。
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path

if os.name == "nt":
    import msvcrt

    @contextmanager
    def file_lock(handle, *, shared: bool = False):
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
        fcntl.flock(handle, fcntl.LOCK_SH if shared else fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


@contextmanager
def locked_file(path: Path, *, shared: bool = False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as handle, file_lock(handle, shared=shared):
        yield
