"""户型快照的落盘、归属与回收。
"""
from __future__ import annotations

import json
import logging
from collections import OrderedDict
from collections.abc import Iterable
from pathlib import Path
from time import time
from typing import Any

from sqlalchemy import select

from ...core.models import ProjectDraft
from ...panel.entity_refs import document_scene_ids

logger = logging.getLogger(__name__)

#: 未被任何仪表盘引用的快照保留多久。被引用的快照不受这个值影响。
SCENE_TTL_SECONDS = 30 * 24 * 3600
#: 目录总量超过这个值就记一条警告（不自动删被引用的快照，只提示有人该来看一眼）。
SCENE_WARN_BYTES = 512 * 1024 * 1024
SCENE_ID_LENGTH = 32
SCENE_ID_ALPHABET = frozenset('0123456789abcdef')


#: 实时草稿的解析缓存保留几份。跨项目切换是主要场景（编辑器挨个打开仪表盘），
LIVE_SCENE_CACHE_ENTRIES = 4


class LiveSceneCache:
    """按 ``(路径, st_mtime_ns, st_size)`` 缓存**已解析**的实时草稿。
    """

    def __init__(self, max_entries: int = LIVE_SCENE_CACHE_ENTRIES) -> None:
        self.max_entries = max_entries
        self._entries: OrderedDict[tuple[str, int, int], dict] = OrderedDict()

    def load(self, path: Path) -> dict:
        """读并解析一份 JSON 文档（通常是 ``draft.json``）；命中缓存直接返回。
        """
        stat = path.stat()
        cache_key = (str(path), stat.st_mtime_ns, stat.st_size)
        cached = self._entries.get(cache_key)
        if cached is not None:
            self._entries.move_to_end(cache_key)
            return cached
        payload = json.loads(path.read_text(encoding='utf-8'))
        self._entries[cache_key] = payload
        self._entries.move_to_end(cache_key)
        while len(self._entries) > self.max_entries:
            self._entries.popitem(last = False)
        return payload


def scenes_dir(settings) -> Path:
    """户型快照目录（``data/modules/interaction3d/scenes``）。"""
    return settings.data_dir / 'modules' / 'interaction3d' / 'scenes'


def is_scene_id(value: str) -> bool:
    """是否是本模块生成的 sceneId 形态（32 位小写十六进制）。"""
    return len(value) == SCENE_ID_LENGTH and all(
        character in SCENE_ID_ALPHABET for character in value
    )


def scene_files(folder: Path, scene_id: str) -> list[Path]:
    """一个快照占用的全部文件：scene JSON 与随它冻结的底图副本。
    """
    return [folder / f'{scene_id}.json', *sorted(folder.glob(f'{scene_id}-*'))]


def delete_scene_files(folder: Path, scene_id: str) -> int:
    """删除一个快照的全部文件，返回真正释放的字节数。
    """
    released = 0
    for path in scene_files(folder, scene_id):
        try:
            size = path.stat().st_size
        except OSError:
            continue
        try:
            path.unlink()
        except OSError as error:
            logger.warning('户型快照文件删除失败，跳过：%s（%s）', path, error)
            continue
        released += size
    return released


def scene_folder_bytes(folder: Path) -> int:
    """目录当前占用的总字节数。"""
    if not folder.is_dir():
        return 0
    total = 0
    for path in folder.iterdir():
        # 单个条目 stat 失败不影响目录总量统计，继续下一个。
        try:
            if path.is_file():
                total += path.stat().st_size
        except OSError:
            continue
    return total


def existing_scene_ids(folder: Path) -> list[str]:
    """列出目录里现存的快照 ID（按 scene JSON 文件名，底图副本不算独立快照）。"""
    if not folder.is_dir():
        return []
    return sorted(path.stem for path in folder.glob('*.json') if is_scene_id(path.stem))


def orphan_scene_copies(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    orphans = []
    for path in folder.iterdir():
        name = path.name
        # 形如 <32 位十六进制>-<任意>`：短横线不在十六进制字符集里，切分是确定的。
        scene_id, separator, _rest = name.partition('-')
        if not separator or not is_scene_id(scene_id):
            continue
        if not (folder / f'{scene_id}.json').exists():
            orphans.append(path)
    return sorted(orphans)


def scene_ids_in_documents(documents: Iterable[str]) -> set[str]:
    """从一批草稿 JSON 文本里收集被引用的 sceneId。
    """
    found: set[str] = set()
    for raw in documents:
        # 文档不是合法 JSON：跳过这一条，其余文档继续参与引用扫描。
        try:
            value = json.loads(raw)
        except (TypeError, ValueError):
            continue
        found |= document_scene_ids(value)
    return found


def referenced_scene_ids(database) -> set[str]:
    """扫全部项目草稿，算出此刻仍被引用的 sceneId 集合。"""
    return scene_ids_in_documents(
        database.scalars(select(ProjectDraft.document_json)).all()
    )


def sweep_scenes(
    folder: Path,
    referenced: set[str],
    *,
    now: float | None = None,
    ttl_seconds: int = SCENE_TTL_SECONDS,
) -> dict[str, int]:
    moment = time() if now is None else now
    deleted = 0
    released = 0
    kept = 0
    for scene_id in existing_scene_ids(folder):
        if scene_id in referenced:
            # 还有人引用：无论多老都不动。
            kept += 1
            continue
        payload = folder / f'{scene_id}.json'
        try:
            modified = payload.stat().st_mtime
        except OSError:
            # 文件刚被别的进程回收掉，不算异常。
            continue
        if moment - modified <= ttl_seconds:
            # 还没过保留期：可能是「刚冻结、还没保存进仪表盘」的快照，留着。
            kept += 1
            continue
        released += delete_scene_files(folder, scene_id)
        # 以「scene JSON 是否真的不在了」判定删除成功：删不掉（权限/占用）时
        if payload.exists():
            kept += 1
        else:
            deleted += 1
    for orphan in orphan_scene_copies(folder):
        # 被引用的场景即使 JSON 缺了也不动它的副本：先让人去看清楚，别顺手清掉证据。
        if orphan.name.partition('-')[0] in referenced:
            kept += 1
            continue
        # 取不到修改时间：这条孤儿记录不参与按时间清理，继续下一个。
        try:
            modified = orphan.stat().st_mtime
        except OSError:
            continue
        if moment - modified <= ttl_seconds:
            kept += 1
            continue
        try:
            size = orphan.stat().st_size
            orphan.unlink()
        except OSError as error:
            logger.warning('户型快照残渣删除失败，跳过：%s（%s）', orphan, error)
            kept += 1
            continue
        released += size
        deleted += 1
    return {'deleted': deleted, 'released': released, 'kept': kept}


def sweep_scenes_for_app(app: Any) -> dict[str, int]:
    """请求路径用的薄封装：自己开一个短会话算引用关系，再巡检。
    """
    folder = scenes_dir(app.state.settings)
    with app.state.database.session_factory() as database:
        referenced = referenced_scene_ids(database)
    stats = sweep_scenes(folder, referenced)
    total = scene_folder_bytes(folder)
    if total > SCENE_WARN_BYTES:
        logger.warning(
            '户型快照目录已占用 %.1f MiB（超过 %.0f MiB）：被仪表盘引用的快照不会自动回收，'
            '请检查是否有大量不再使用的户型。',
            total / 1048576,
            SCENE_WARN_BYTES / 1048576,
        )
    return stats
