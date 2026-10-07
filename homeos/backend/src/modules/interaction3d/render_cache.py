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
from uuid import uuid4

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

MAX_ENTRY_BYTES = 10485760
MAX_PIXELS = 2097152
MAX_CACHE_BYTES = 268435456
MAX_ENTRIES = 2048
MAX_AGE_SECONDS = 2592000


def cache_path(data_dir: Path, scene_id: str, project_id: str, key: str, *, principal: str = 'admin') -> Path:
    if not re.fullmatch('[0-9a-f]{64}', key):
        raise HTTPException(422, detail='缓存标识无效。')
    scope = hashlib.sha256(json.dumps(['v2', principal, project_id, scene_id]).encode()).hexdigest()
    return data_dir / 'modules' / 'interaction3d' / 'render-cache' / scope / f'{key}.png'


@contextmanager
def cache_lock(root: Path):
    root.mkdir(parents=True, exist_ok=True)
    with (root / '.lock').open('a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def read_cache(path: Path) -> bytes | None:
    root = path.parent.parent
    if not root.exists():
        return None
    with cache_lock(root):
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


def write_cache(path: Path, content: bytes) -> None:
    if not content or len(content) > MAX_ENTRY_BYTES:
        raise HTTPException(413, detail='缓存图层过大。')
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format != 'PNG' or image.width * image.height > MAX_PIXELS or getattr(image, 'is_animated', False):
                raise ValueError('invalid cache image')
            image.verify()
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise HTTPException(422, detail='缓存图层无效。') from error
    root = path.parent.parent
    with cache_lock(root):
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(f'.{uuid4().hex}.tmp')
        try:
            with temporary.open('xb') as output:
                output.write(content)
            temporary.chmod(384)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
        now = time.time()
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
