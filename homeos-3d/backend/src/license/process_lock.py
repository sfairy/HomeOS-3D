"""授权进程锁：同一数据目录只允许一个「凭证写入者」。
"""
from __future__ import annotations

import errno
import os
import sys
from pathlib import Path

# 用 sys.platform 而不是 os.name 判断：os.name 的类型是 str，静态分析无法收窄，
# 条件导入的 msvcrt / fcntl 会被判成「可能未绑定」；sys.platform 是字面量联合，
# 分析器能按平台收窄到唯一分支。
if sys.platform == 'win32':
    import msvcrt
else:
    import fcntl


def _lock(fd: int) -> None:
    """对 ``fd`` 取**非阻塞**排他锁；已被别的进程持有时抛 OSError。
    """
    if sys.platform == 'win32':
        os.lseek(fd, 0, os.SEEK_SET)
        msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
    else:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)


class LicenseProcessLock:
    """以 ``<data_dir>/.license-process.lock`` 为握手点的非阻塞排他锁。"""

    def __init__(self, directory: Path) -> None:
        """参数:
        """
        self.path = directory / '.license-process.lock'
        # 持有中的文件描述符；None 表示当前没有持锁。用 fd 而不是 bool 是为了
        self.fd = None

    def acquire(self) -> None:
        """取锁；已被别的进程占用时抛 RuntimeError。
        """
        if self.fd is not None:
            return
        # 目录 0700、锁文件 0600：授权绑定相关文件不应对其它账号可读。
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            _lock(fd)
        except OSError as error:
            # 抢不到就把刚打开的描述符关掉再抛：漏掉它会让「启动失败」也留下一个
            os.close(fd)
            # 「锁被占用」只是 EAGAIN/EWOULDBLOCK 这一种。原先这里 catch BaseException
            if error.errno in (errno.EAGAIN, errno.EWOULDBLOCK):
                raise RuntimeError(
                    '同一数据目录已有 HA Bridge 进程运行，请通过现有服务管理器重启，勿重复启动。'
                ) from error
            raise RuntimeError(
                f'无法锁定授权数据目录的进程锁（{self.path}）：{error.strerror or error}。'
                '请检查该目录的挂载状态与权限。'
            ) from error
        except BaseException as error:
            # 非 OSError（KeyboardInterrupt 等）同样要先归还描述符，再原样抛出。
            os.close(fd)
            raise error
        # 只有真的锁上了才记录：上面任何一步失败都不该留下「以为自己持锁」的状态。
        self.fd = fd

    def release(self) -> None:
        """释放锁；没持锁时是空操作。
        """
        if self.fd is not None:
            fd = self.fd
            self.fd = None
            os.close(fd)
