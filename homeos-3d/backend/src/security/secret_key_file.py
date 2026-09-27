"""落盘密钥文件的「读取或原子创建」。
"""
from __future__ import annotations

import os
import time
from collections.abc import Callable
from pathlib import Path
from threading import Lock

from cryptography.fernet import Fernet

#: 抢锁重试上限。真正的竞态只有「两个进程同时首次加密」这一种，赢家写完 44 字节
SECRET_KEY_CREATE_ATTEMPTS = 5
#: 每次重试之间的退避。极短：只是把时间片让给正在写文件的赢家。
SECRET_KEY_CREATE_RETRY_SECONDS = 0.05

#: 已加载的密钥：{路径: Fernet 密钥字节}，见模块开头第 4 条。
_loaded_secret_keys: dict[str, bytes] = {}
_loaded_secret_keys_lock = Lock()


def load_or_create_secret_key(
    path: Path,
    *,
    error_factory: Callable[[str], Exception],
    empty_message: str,
) -> bytes:
    """读取 ``path`` 里的 Fernet 密钥；不存在则原子创建后返回；**每进程只碰一次文件**。
    """
    cache_key = str(path)
    with _loaded_secret_keys_lock:
        cached = _loaded_secret_keys.get(cache_key)
    if cached is not None:
        return cached
    value = _read_or_create_secret_key(
        path, error_factory=error_factory, empty_message=empty_message
    )
    # 并发首次加载时两个线程可能各读了一遍（结果必然相同），先到者为准。
    with _loaded_secret_keys_lock:
        return _loaded_secret_keys.setdefault(cache_key, value)


def _read_or_create_secret_key(
    path: Path,
    *,
    error_factory: Callable[[str], Exception],
    empty_message: str,
) -> bytes:
    """真正去读/创建密钥文件的那一层：每次调用都碰文件系统（重试都在这里）。"""
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    except OSError as error:
        # 目录建不出来（只读挂载 / 磁盘满 / 路径被文件占住）—— 没有可用的落盘位置，
        raise error_factory(
            f'无法准备密钥目录 {path.parent}：{error.strerror or error}'
        ) from error
    try:
        os.chmod(path.parent, 0o700)
    except OSError:
        pass

    for attempt in range(SECRET_KEY_CREATE_ATTEMPTS):
        try:
            if path.exists():
                value = path.read_bytes().strip()
                if not value:
                    raise error_factory(empty_message)
                return value
            key = Fernet.generate_key()
            # O_EXCL：创建即独占。两个进程各生成一份密钥的话，后写的那把会让
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'wb') as key_file:
                # 末尾补换行便于人工 cat 查看；调用方读取时会 strip 掉。
                key_file.write(key + b'\n')
            return key
        except FileExistsError:
            # 并发首次启动的输家：赢家已经把文件创建出来了，重来一次就能读到。
            if attempt == SECRET_KEY_CREATE_ATTEMPTS - 1:
                raise error_factory(
                    f'密钥文件在并发创建中反复被抢占，放弃：{path}'
                ) from None
            time.sleep(SECRET_KEY_CREATE_RETRY_SECONDS)
        except OSError as error:
            raise error_factory(
                f'无法写入密钥文件 {path}：{error.strerror or error}'
            ) from error

