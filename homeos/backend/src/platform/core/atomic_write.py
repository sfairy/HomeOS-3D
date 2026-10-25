"""原子写入 + 私有权限位。

历史上这些地方直接写 ``chmod(384)`` / ``mkdir(mode=448)`` —— 那是 0600 / 0700 的
**十进制**字面量，读代码时根本看不出权限，而且 384 和 448 只差一位、极容易写错
（写错就是把用户上传的资源放成 0666 或目录放成 0700 之外的权限）。

这里把「临时文件 → fsync → chmod 0600 → 原子 replace」收成一处，调用方只表达
「写这个文件、内容是这些」，权限位不再散落在业务代码里。
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

#: 私有文件权限：仅属主可读写（等价于 ``-rw-------``）。
PRIVATE_FILE_MODE = 0o600
#: 私有目录权限：仅属主可进入（等价于 ``drwx------``）。
PRIVATE_DIR_MODE = 0o700


def ensure_private_dir(path: Path) -> None:
    """创建私有目录（已存在则不动；不追改既有目录权限，避免影响部署时的显式配置）。"""
    path.mkdir(parents=True, exist_ok=True, mode=PRIVATE_DIR_MODE)


def restrict_private_file(path: Path) -> None:
    """把已存在的文件权限收紧到 0600（用于「先由第三方库写出、再收紧」的场景）。"""
    path.chmod(PRIVATE_FILE_MODE)


def atomic_write_bytes(path: Path, content: bytes) -> None:
    """原子写入字节内容：同目录临时文件 + fsync + 0600 + ``os.replace``。

    同目录是硬要求：跨文件系统 ``os.replace`` 会退化成「复制 + 删除」，原子性就没了。
    """
    ensure_private_dir(path.parent)
    descriptor, temp_name = tempfile.mkstemp(prefix=f'.{path.name}.', dir=str(path.parent))
    temp_path = Path(temp_name)
    try:
        with os.fdopen(descriptor, 'wb') as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        temp_path.chmod(PRIVATE_FILE_MODE)
        os.replace(temp_path, path)
    except BaseException:
        temp_path.unlink(missing_ok=True)
        raise


def atomic_write_text(path: Path, text: str, *, encoding: str = 'utf-8') -> None:
    """原子写入文本内容（UTF-8 为默认，与仓库其它 JSON 落盘保持一致）。"""
    atomic_write_bytes(path, text.encode(encoding))
