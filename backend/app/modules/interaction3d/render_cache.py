"""一次性、有上限的灯光合图缓存（只放 PNG，不保存任何项目或户型数据）。

舞台页把多盏灯的照明效果合成为一张 PNG 回传到这里，下次打开直接取图，
省掉一轮 WebGL 渲染。文件按 (projectId, sceneId) 的 sha256 分目录、
以 cache_key 命名；缓存键由前端按「场景 + 灯光参数 + RENDER_CACHE_VERSION」算出，
参数或版本一变键就变（后端只校验它是 64 位十六进制，不解释其内容）。

失效与回收在读、写两条路径上完成，靠 .lock 文件锁串行化：
- 读：超过 MAX_AGE_SECONDS 或单条超限即删除，并视为未命中；
- 写：先校验图片，再清掉超过 1 小时的 .tmp 残留，并按 mtime 升序
  淘汰到总量与条数上限以内。

这里的数据随时可以丢：清空目录只会让舞台页多渲染一次，不影响正确性。
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

if os.name == 'nt':
    import msvcrt

    @contextmanager
    def _locked_region(handle, *, shared: bool = False):
        """Windows 下对锁文件首字节加锁。

        LK_RLCK 是**共享**读锁（可被多个持有者同时拿到），LK_LOCK 才是排他
        （抢不到时每 1 秒重试一次，约 10 次后抛 OSError）。原先无论读写都用
        LK_RLCK —— 那等于 Windows 上从来没有排他，淘汰与写入可以同时动同一批文件，
        与 POSIX 分支的口径不一致（B26 的一半）。
        """
        handle.seek(0)
        # 文件为空也没关系：Windows 允许锁定越过 EOF 的字节区间。
        msvcrt.locking(handle.fileno(), msvcrt.LK_RLCK if shared else msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
else:
    import fcntl

    @contextmanager
    def _locked_region(handle, *, shared: bool = False):
        """POSIX 下加 flock：读共享、写排他（可被 flock(LOCK_SH) 并存）。"""
        fcntl.flock(handle, fcntl.LOCK_SH if shared else fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)

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
def cache_lock(root: Path, *, shared: bool = False):
    """对缓存根目录加文件锁，串行化同目录的读、写与淘汰。

    ``shared=True`` 加共享锁：多个读者可以同时持有，只有写路径（含淘汰）会与它们
    互斥。读缓存是高频路径，写缓存只在舞台页重新渲染后发生一次，因此读不该被读挡住
    （B26）。

    参数:
        root: 缓存根目录。
        shared: 读路径传 True；写入与淘汰必须用排他（默认）。
    """
    root.mkdir(parents=True, exist_ok=True)
    # 锁文件常驻且用 'a+b'（不截断）：它只作为加锁句柄，不存内容。
    with (root / '.lock').open('a+b') as lock:
        with _locked_region(lock, shared=shared):
            # 异常路径也要解锁：_locked_region 的 finally 会负责释放。
            yield


def read_cache(path: Path) -> bytes | None:
    """读取缓存内容；未命中、已过期或超限时返回 None。

    返回 None 而不抛异常：调用方只关心「有没有可用缓存」，
    统一按未命中处理（HTTP 204）即可。

    读路径只持共享锁，且**只碰这一个文件**（B26）：命中时是「stat + 读」，不扫
    全目录、不算淘汰、也不删任何东西。原先读也抢整目录排他锁，于是每一张缓存图
    命中都要把它之后的所有读与写排成一队，而它同时还做了一次全量 glob + stat。
    过期与超限的条目在这里只判不删 —— 删除是写操作，交给下一次 ``write_cache``
    的淘汰顺带完成（它本来就先清过期条目），代价是过期条目可能多留一格时间，
    而缓存随时可以丢。
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
            # 触摸节流：60 秒内读多次只更新一次 mtime，既少写元数据，
            # 又保证「经常被读」的条目不会在 LRU 淘汰时被误伤。
            # 在共享锁里写元数据是安全的：淘汰持排他锁，与共享锁互斥，
            # 因此不会出现「刚 stat 到、正要 utime，文件已被删」。
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
        # 排序键显式写成 (mtime, size, 完整路径字符串)（B59）。mtime 与 size 都可能完全
        # 相同（同一批写进来的条目，或被对齐过时间戳的文件），那时「淘汰谁」就完全由
        # 第三个分量决定，它因此必须**一定唯一**：同一个 glob 出来的路径天然唯一，按
        # 路径字符串比也就一定排得出确定顺序，不会掉进「所有分量都相等」的稳定排序里
        # 听凭目录顺序。审计原文说这里「退化成比较 Path 对象会抛 TypeError」——实测
        # 不成立（CPython 给 PurePath 定义了全序，旧写法在这台机器上排得好好的），
        # 改成显式 key 图的是把判据写在明面上、不依赖语言实现细节。
        for _, size, candidate in sorted(
            entries, key=lambda item: (item[0], item[1], str(item[2]))
        ):
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
