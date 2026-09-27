"""一次性、有上限的灯光合图缓存（只放 PNG，不保存任何项目或户型数据）。
"""
from __future__ import annotations

import hashlib
import io
import os
import re
import time
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

from ...core.file_lock import file_lock

#: 单条 10 MiB / 单张 2M 像素：纯粹是防滥用的闸门，不是业务上预期的图片大小。
MAX_ENTRY_BYTES = 10485760
MAX_PIXELS = 2097152
# 整目录上限 256 MiB / 2048 条，超出即按 mtime 最老（最久未访问）淘汰。
MAX_CACHE_BYTES = 268435456
MAX_ENTRIES = 2048
# 30 天未访问即视为过期；灯光参数很少回头改，过期主要用于回收磁盘。
MAX_AGE_SECONDS = 2592000


def cache_path(data_dir: Path, scene_id: str, project_id: str, key: str) -> Path:
    """算出某个缓存键对应的磁盘路径。
    """
    if not re.fullmatch('[0-9a-f]{64}', key):
        raise HTTPException(422, detail='缓存标识无效。')
    # 用 \x00 作分隔符：项目 ID 与场景 ID 里都不可能含 NUL，拼接不会产生歧义。
    scope = hashlib.sha256(f'{project_id}\x00{scene_id}'.encode()).hexdigest()
    return data_dir / 'modules' / 'interaction3d' / 'render-cache' / scope / f'{key}.png'


@contextmanager
def cache_lock(root: Path, *, shared: bool = False):
    """对缓存根目录加文件锁，串行化同目录的读、写与淘汰。
    """
    root.mkdir(parents=True, exist_ok=True)
    # 锁文件常驻且用 'a+b'（不截断）：它只作为加锁句柄，不存内容。
    with (root / '.lock').open('a+b') as lock:
        with file_lock(lock, shared=shared):
            # 异常路径也要解锁：file_lock 的 finally 会负责释放。
            yield


def read_cache(path: Path) -> bytes | None:
    """读取缓存内容；未命中、已过期或超限时返回 None。
    """
    root = path.parent.parent
    if not root.exists():
        return None
    with cache_lock(root, shared=True):
        try:
            stat = path.stat()
            # 单条超限（可能被写脏）与整体过期的条目在这里按未命中返回，删除留给写路径。
            if time.time() - stat.st_mtime > MAX_AGE_SECONDS or stat.st_size > MAX_ENTRY_BYTES:
                return None
            content = path.read_bytes()
            # 触摸节流：60 秒内读多次只更新一次 mtime，少写元数据，又保证「经常被读」的条目不被 LRU 误伤。
            if time.time() - stat.st_mtime > 60:
                os.utime(path, None)
            return content
        except FileNotFoundError:
            # 另一进程可能在 stat 与 read 之间把它淘汰掉了，按未命中返回。
            return None


def write_cache(path: Path, content: bytes) -> None:
    """校验并写入一份缓存图层，随后做一轮淘汰。
    """
    if not content or len(content) > MAX_ENTRY_BYTES:
        raise HTTPException(413, detail='缓存图层过大。')
    try:
        with Image.open(io.BytesIO(content)) as image:
            # 只收静态 PNG 并限制像素数：解压炸弹（体积很小、画布极大）会直接吃满内存。
            if image.format != 'PNG' or image.width * image.height > MAX_PIXELS or getattr(image, 'is_animated', False):
                raise ValueError('invalid cache image')
            # verify() 只做结构校验，必须在 open 之后、load 之前调用。
            image.verify()
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise HTTPException(422, detail='缓存图层无效。') from error
    root = path.parent.parent
    with cache_lock(root):
        path.parent.mkdir(parents=True, exist_ok=True)
        # 随机后缀：并发写入同一个缓存键时不会撞上相同的临时文件名。
        temporary = path.with_suffix(f'.{uuid4().hex}.tmp')
        try:
            with temporary.open('xb') as output:
                output.write(content)
            # 384（八进制 600）：缓存画面可能含户型信息，只给属主读写。
            temporary.chmod(384)
            os.replace(temporary, path)
        finally:
            # 无论成功与否都尝试删除临时文件；成功时它已被 rename 走，这里是空操作。
            temporary.unlink(missing_ok=True)
        now = time.time()
        # 写入进程被杀时会留下临时文件，超过 1 小时即回收。
        for candidate in root.glob('*/*.tmp'):
            if now - candidate.stat().st_mtime > 3600:
                candidate.unlink(missing_ok=True)
        entries = []
        for candidate in root.glob('*/*.png'):
            stat = candidate.stat()
            # 先按时间淘汰过期条目，不进入后面的容量统计。
            if now - stat.st_mtime > MAX_AGE_SECONDS:
                candidate.unlink(missing_ok=True)
                continue
            entries.append((stat.st_mtime, stat.st_size, candidate))
        total, count = sum(item[1] for item in entries), len(entries)
        # 排序键显式写成 (mtime, size, 完整路径字符串)：前两个分量可能完全相同（同批写入、或被对齐过时间戳），
        for _, size, candidate in sorted(
            entries, key=lambda item: (item[0], item[1], str(item[2]))
        ):
            if total <= MAX_CACHE_BYTES and count <= MAX_ENTRIES:
                break
            candidate.unlink(missing_ok=True)
            total -= size
            count -= 1
        for directory in root.iterdir():
            if not directory.is_dir():
                continue
            try:
                directory.rmdir()
            except OSError:
                # 目录非空（还有条目）时 rmdir 会失败，属于正常情况，忽略即可。
                continue
