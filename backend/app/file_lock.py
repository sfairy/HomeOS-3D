"""跨进程文件锁：POSIX 走 ``flock``，Windows 走 ``msvcrt.locking``。

抽出来是因为「两个进程不许同时做同一件事」在后端出现了两处 —— 渲染缓存的读/写/淘汰
（``modules/interaction3d/render_cache.py``）与启动时的数据库迁移（``migrations.py``）。
平台分支一字不差地写两份，就是两个地方各可能漏掉一个平台：B26 里 Windows 那半原先
无论读写都用共享锁，等于从来没有排他，正是「一份实现被抄两遍、只改对了一处」的形状。

锁的语义取文件锁而不是「创建锁文件 + 用完删除」，是因为**内核会在进程结束（含被
kill）时自动释放**，于是不存在「陈旧锁」这种要人来清理的状态：运维删掉半途崩掉的
进程之后，下一次启动就能照常拿锁。
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

        参数:
            handle: 已打开的二进制句柄（``'a+b'`` 之类，不截断）。锁的是首字节，
                文件内容无关；文件为空也没关系，Windows 允许锁定越过 EOF 的区间。
            shared: True 用 ``LK_RLCK``（共享读锁，可被多个持有者同时拿到）；
                False 用 ``LK_LOCK``（排他，抢不到时每 1 秒重试一次，约 10 次后抛
                ``OSError``）。
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

        参数:
            handle: 已打开的二进制句柄。
            shared: True 用 ``LOCK_SH``，False（默认）用 ``LOCK_EX``。

        等待行为：抢不到就阻塞等待。**不设超时**是有意的 —— 拿不到锁意味着确实有
        另一个进程在做同一件事，而持锁者要么很快做完，要么已经死了（内核随即释放），
        因此等待一定会结束；超时返回只会让调用方在「其实能成功」的时候失败。
        """
        fcntl.flock(handle, fcntl.LOCK_SH if shared else fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


@contextmanager
def locked_file(path: Path, *, shared: bool = False):
    """打开 ``path``（必要时先建父目录）并加锁，退出 with 块时解锁。

    参数:
        path: 锁文件路径。它只作为加锁的握手点，内容一直是空的，可以长期留在盘上。
        shared: 同 :func:`file_lock`。
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    # 'a+b' 不截断：这个文件只用来加锁，不存内容。用 with 保证句柄一定被关闭。
    with path.open('a+b') as handle:
        with file_lock(handle, shared=shared):
            yield
