"""可丢弃、有界的灯光图片缓存。此处不存储任何项目或工作室数据。"""
from __future__ import annotations

import fcntl
import hashlib
import io
import json
import os
import re
import time
from contextlib import contextmanager
from pathlib import Path

from fastapi import HTTPException

from ...platform.core.runtime.atomic_write import atomic_write_bytes

MAX_ENTRY_BYTES = 10485760
MAX_PIXELS = 2097152
MAX_CACHE_BYTES = 268435456
MAX_ENTRIES = 2048
MAX_AGE_SECONDS = 2592000
#: 容量/过期清理需要 glob + stat 整个缓存目录（上千个文件）：写入时最多每这么多秒做一次，
#: 而不是每次写都扫。两次清理之间超额的量以单条上限 × 期间写入数为界。
PRUNE_INTERVAL_SECONDS = 60.0

_last_prune_at: dict[str, float] = {}


def cache_path(data_dir: Path, scene_id: str, project_id: str, key: str, *, principal: str = 'admin') -> Path:
    if not re.fullmatch('[0-9a-f]{64}', key):
        raise HTTPException(422, detail='缓存标识无效。')
    scope = hashlib.sha256(json.dumps(['v2', principal, project_id, scene_id]).encode()).hexdigest()
    return data_dir / 'modules' / 'interaction3d' / 'render-cache' / scope / f'{key}.png'


@contextmanager
def cache_lock(root: Path, *, shared: bool = False):
    root.mkdir(parents=True, exist_ok=True)
    with (root / '.lock').open('a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_SH if shared else fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def read_cache(path: Path) -> bytes | None:
    root = path.parent.parent
    if not root.exists():
        return None
    # 写入是「临时文件 + 原子 replace」，读永远看到完整文件：读之间用共享锁并行，
    # 只和清理（独占锁）互斥。舞台首屏会并发请求多张灯光图层，独占锁会让它们排队。
    with cache_lock(root, shared=True):
        try:
            stat = path.stat()
            if time.time() - stat.st_mtime > MAX_AGE_SECONDS or stat.st_size > MAX_ENTRY_BYTES:
                path.unlink(missing_ok=True)
                return None
            content = path.read_bytes()
            if time.time() - stat.st_mtime > 60:
                os.utime(path, None)
            return content
        except FileNotFoundError:
            return None


def _prune(root: Path, now: float) -> None:
    for candidate in root.glob('*/*.tmp'):
        if now - candidate.stat().st_mtime > 3600:
            candidate.unlink(missing_ok=True)
    entries = []
    for candidate in root.glob('*/*.png'):
        stat = candidate.stat()
        if now - stat.st_mtime > MAX_AGE_SECONDS:
            candidate.unlink(missing_ok=True)
            continue
        entries.append((stat.st_mtime, stat.st_size, candidate))
    total, count = sum(item[1] for item in entries), len(entries)
    for _, size, candidate in sorted(entries):
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
            continue


def write_cache(path: Path, content: bytes) -> None:
    if not content or len(content) > MAX_ENTRY_BYTES:
        raise HTTPException(413, detail='缓存图层过大。')
    # Pillow 只在真正写缓存图层时导入：3D 数据面的模块级 import 不应把 PIL 链路
    # （源码态约 23 ms）算进每次冷启动。
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format != 'PNG' or image.width * image.height > MAX_PIXELS or getattr(image, 'is_animated', False):
                raise ValueError('invalid cache image')
            image.verify()
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise HTTPException(422, detail='缓存图层无效。') from error
    root = path.parent.parent
    with cache_lock(root):
        # 临时文件 + fsync + 0600 + 原子 replace，统一由 atomic_write 负责。
        atomic_write_bytes(path, content)
        now = time.time()
        root_key = str(root)
        if now - _last_prune_at.get(root_key, 0.0) >= PRUNE_INTERVAL_SECONDS:
            _last_prune_at[root_key] = now
            _prune(root, now)
