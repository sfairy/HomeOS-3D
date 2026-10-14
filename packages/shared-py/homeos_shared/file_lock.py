"""跨进程文件锁：POSIX 走 ``flock``，Windows 走 ``msvcrt.locking``。

两个后端共用本实现（真源 ``packages/shared-py``）。为何必须共享而不是各存一份：两个服务
可以各自独立部署（拆库部署时甚至不在同一台机器上），锁语义一旦两边漂移，表现是
「同机上两个进程同时拿到写锁」这类极难复现的数据损坏 —— 而它不会在任何单测里露头。

为什么不做成运行期依赖对方的包：两端**运行期互不 import**（由
``ops/check/check_deploy_independence.py`` 钉死），构建期各自把这一个文件内联编译进自己的
``.so`` 才是允许的形态（见 ``packages/shared-py/README.md``）。
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path

if os.name == "nt":
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
    with path.open("a+b") as handle, file_lock(handle, shared=shared):
        yield
