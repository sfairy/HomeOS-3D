"""一次性、有上限的灯光合图缓存（只放 PNG，不保存任何项目或户型数据）。

舞台页把多盏灯的照明效果合成为一张 PNG 回传到这里，下次打开直接取图，
省掉一轮 WebGL 渲染。文件按 (projectId, sceneId) 的 sha256 分目录、
以 cache_key 命名；缓存键由前端按「场景 + 灯光参数」算出，参数一变键就变。

失效与回收在读、写两条路径上完成，靠 .lock 文件锁串行化：
- 读：超过 MAX_AGE_SECONDS 或单条超限即删除，并视为未命中；
- 写：先校验图片，再清掉超过 1 小时的 .tmp 残留，并按 mtime 升序
  淘汰到总量与条数上限以内。

这里的数据随时可以丢：清空目录只会让舞台页多渲染一次，不影响正确性。
"""
from __future__ import annotations

import fcntl
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

# 单条 10 MiB / 单张 2M 像素：纯粹是防滥用的闸门，不是业务上预期的图片大小。
MAX_ENTRY_BYTES = 10485760
MAX_PIXELS = 2097152
# 整目录上限 256 MiB / 2048 条，超出即按 mtime 最老（最久未访问）淘汰。
MAX_CACHE_BYTES = 268435456
MAX_ENTRIES = 2048
# 30 天未访问即视为过期；灯光参数很少回头改，过期主要用于回收磁盘。
MAX_AGE_SECONDS = 2592000


def cache_path(data_dir: Path, scene_id: str, project_id: str, key: str) -> Path:
    """算出某个缓存键对应的磁盘路径。

    key 必须是 64 位十六进制（前端算出的 sha256）：既是文件名安全的，
    也杜绝了用 .. 之类字符串拼出目录穿越的可能。
    目录名再对 projectId + sceneId 做一次 sha256：不同项目里同名的缓存键
    不会互相覆盖，目录名里也不会出现项目与场景的真实 ID。

    异常:
        HTTPException: 422，缓存键格式非法。
    """
    if not re.fullmatch('[0-9a-f]{64}', key):
        raise HTTPException(422, detail='缓存标识无效。')
    # 用 \x00 作分隔符：项目 ID 与场景 ID 里都不可能含 NUL，拼接不会产生歧义。
    scope = hashlib.sha256(f'{project_id}\x00{scene_id}'.encode()).hexdigest()
    return data_dir / 'modules' / 'interaction3d' / 'render-cache' / scope / f'{key}.png'


@contextmanager
def cache_lock(root: Path):
    """对缓存根目录加排他文件锁，串行化读、写与淘汰。

    多个进程或线程同时写缓存时，清理逻辑可能删掉别人正在读的文件，
    因此三件事都在同一把锁内完成。锁粒度取整目录，因为淘汰要看全量条目，
    按子目录分锁无法保证计数与总量准确。
    """
    root.mkdir(parents=True, exist_ok=True)
    # 锁文件常驻且用 'a+b'（不截断）：它只作为加锁句柄，不存内容。
    with (root / '.lock').open('a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            # 异常路径也要解锁：with 块抛错时若漏了这一步，进程会一直持着锁。
            fcntl.flock(lock, fcntl.LOCK_UN)


def read_cache(path: Path) -> bytes | None:
    """读取缓存内容；未命中、已过期或超限时返回 None。

    返回 None 而不抛异常：调用方只关心「有没有可用缓存」，
    统一按未命中处理（HTTP 204）即可。
    """
    root = path.parent.parent
    if not root.exists():
        return None
    with cache_lock(root):
        try:
            stat = path.stat()
            # 单条超限（可能被写脏）与整体过期的条目在这里顺手删掉，按未命中返回。
            if time.time() - stat.st_mtime > MAX_AGE_SECONDS or stat.st_size > MAX_ENTRY_BYTES:
                path.unlink(missing_ok=True)
                return None
            content = path.read_bytes()
            # 触摸节流：60 秒内读多次只更新一次 mtime，既少写元数据，
            # 又保证「经常被读」的条目不会在 LRU 淘汰时被误伤。
            if time.time() - stat.st_mtime > 60:
                os.utime(path, None)
            return content
        except FileNotFoundError:
            # 另一进程可能在 stat 与 read 之间把它淘汰掉了，按未命中返回。
            return None


def write_cache(path: Path, content: bytes) -> None:
    """校验并写入一份缓存图层，随后做一轮淘汰。

    写入用「临时文件 + rename」：rename 在同一文件系统内是原子的，
    读侧永远看不到写了一半的 PNG。写完后顺手清理残留临时文件与超限条目，
    这样不需要额外的后台任务（缓存可丢弃，及时性要求不高）。

    异常:
        HTTPException: 413 内容为空或超出单条体积上限；422 不是合法 PNG。
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
        # sorted 默认按元组首项（mtime）升序，最久未访问的排在最前，先删它们。
        for _, size, candidate in sorted(entries):
            if total <= MAX_CACHE_BYTES and count <= MAX_ENTRIES:
                break
            candidate.unlink(missing_ok=True)
            total -= size
            count -= 1
        # 淘汰后可能留下空目录，顺手删掉，避免 scope 目录无限累积。
        for directory in root.iterdir():
            if not directory.is_dir():
                continue
            try:
                directory.rmdir()
            except OSError:
                # 目录非空（还有条目）时 rmdir 会失败，属于正常情况，忽略即可。
                continue
