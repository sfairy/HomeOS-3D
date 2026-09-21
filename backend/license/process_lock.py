"""授权进程锁：同一数据目录只允许一个「凭证写入者」。

租约是「单调递增序号 + 签名」的，两个进程同时续租会产生两份并行的租约，序号
互相追不上，先写的那份会被判成重放而作废 —— 表现为两个实例交替把自己锁死。
所以这里不是「加个互斥避免偶发竞态」，而是**同一份 data/ 根本不该被两个进程一起用**。

锁用文件锁而不是「建锁文件 + 退出删除」，是因为内核会在进程结束（含被 kill）时
自动释放，于是不存在「陈旧锁」这种要人来清理的状态。

``acquire()`` 取**非阻塞**语义是有意的：拿到锁失败意味着确实已经有一个实例在跑，
此时正确的行为是让本次启动**立刻失败并说清原因**，而不是默默排队等一个永远不会
结束的对方。

平台分支与 ``backend/core/file_lock.py`` 取同一套写法（POSIX ``flock`` / Windows
``msvcrt``），但**不能直接复用那个模块**：它的语义是「阻塞等待直到拿到锁」，与这里
要的「抢不到就立刻失败」正好相反。分支也不能省：本模块在 ``service.py`` 的**导入期**
被引入，无条件 ``import fcntl`` 在 Windows 上不是「锁失效」，而是整个应用起不来。
"""
from __future__ import annotations

import errno
import os
from pathlib import Path

if os.name == 'nt':
    import msvcrt
else:
    import fcntl


def _lock(fd: int) -> None:
    """对 ``fd`` 取**非阻塞**排他锁；已被别的进程持有时抛 OSError。

    参数:
        fd: 已打开的描述符。锁的是文件本身（POSIX 整文件 / Windows 首字节区间），
            文件内容无关，空文件也可以锁。
    """
    if os.name == 'nt':
        # msvcrt 锁的是「从当前文件位置起的 1 字节」，所以每次都要显式回到 0：
        # 位置漂移会让「加锁的区间」和「解锁的区间」不是同一段。
        os.lseek(fd, 0, os.SEEK_SET)
        msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
    else:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)


class LicenseProcessLock:
    """以 ``<data_dir>/.license-process.lock`` 为握手点的非阻塞排他锁。"""

    def __init__(self, directory: Path) -> None:
        """参数:
            directory: 数据目录；锁文件就放在它下面，随数据卷一起走。
        """
        self.path = directory / '.license-process.lock'
        # 持有中的文件描述符；None 表示当前没有持锁。用 fd 而不是 bool 是为了
        # 让「是否持锁」和「拿什么去释放」是同一个事实，不会各说各话。
        self.fd = None

    def acquire(self) -> None:
        """取锁；已被别的进程占用时抛 RuntimeError。

        可重复调用：已经持锁时直接返回，因此调用方不必自己记住持锁状态。
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
            # 悬空句柄，反复重试启动就会一路泄漏下去。
            os.close(fd)
            # 「锁被占用」只是 EAGAIN/EWOULDBLOCK 这一种。原先这里 catch BaseException
            # 并把一切失败都说成「已有进程运行」，于是只读卷（EROFS）、配额满（ENOSPC）、
            # 权限不足（EACCES）全被误诊成重复启动 —— 运维会照着这句话去杀一个并不存在的
            # 进程，真实的挂载问题反而被盖住。所以要按 errno 分流，并且必须 from error：
            # 链上原始 OSError，日志里才看得到到底是哪一个失败。
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

        先取出 fd 再置 None：关闭过程中如果抛错，对象也不会停在一个指向已关闭
        描述符的「伪持锁」状态上。只关描述符不解锁是有意的 —— 两个平台都会在
        句柄关闭时释放锁，多一次显式解锁只会多一个「解锁区间对不上」的失败面。
        """
        if self.fd is not None:
            fd = self.fd
            self.fd = None
            os.close(fd)
