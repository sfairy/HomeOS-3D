"""每个数据目录只允许一个运行中的服务 / 凭证写入者（macOS/Linux）。"""
from __future__ import annotations

import fcntl
import os
from pathlib import Path


class LicenseProcessLock:

    def __init__(self, directory: Path) -> None:
        self.path = directory / '.license-process.lock'
        self.fd = None

    def acquire(self) -> None:
        if self.fd is not None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.fd = fd
        except BaseException:
            os.close(fd)
            raise RuntimeError(
                '同一数据目录已有 HomeOS 进程运行，请通过现有服务管理器重启，勿重复启动。'
            ) from None
        return

    def release(self) -> None:
        if self.fd is not None:
            fd = self.fd
            self.fd = None
            os.close(fd)
