"""户型快照的落盘、归属与回收。

户型快照是「冻结一次、长期可读」的不可变文件：一份 scene JSON 加上随它冻结的底图副本
（可能几 MB）。冻结入口只有 ``POST /scenes`` 一条，而**此前没有任何删除路径** —— 项目删除、
场景替换、反复冻结算下来只在加文件，磁盘只增不减。

这里补上回收，规则刻意保守（删掉仍在用的快照 ＝ 看板黑屏，比多占几 MB 严重得多）：

1. **归属判定**：一个快照「还有没有人用」由**项目草稿文档里有没有出现这个 sceneId** 决定，
   与 ``require_scene_viewer`` 的可见性判定同源；
2. **巡检**：``sweep_scenes`` 只回收「没有被任何草稿引用」**且**超过 ``SCENE_TTL_SECONDS``
   的快照，被引用的快照无论多老都不动；
3. **触发时机**：冻结新快照时、删除项目时各跑一次 —— 都是低频操作，不给自动保存这类热路径加成本；
4. **残渣**：``delete_scene_files`` 只做到「尽力而为」，单文件删不掉时会留下「JSON 已没了、
   底图副本还在」的中间态；这类副本没有 owner 可查，因此按同一个「没人引用 + 已过保留期」的
   规则单独收一遍（见 :func:`orphan_scene_copies`）。

为什么不落一份索引文件：索引会与实际文件漂移，而这里需要的三件事（有哪些快照、多大、多久没动）
都能直接从文件系统读出来 —— 快照文件只在创建时写一次，读取不更新 mtime，所以 ``mtime`` 就是
冻结时刻。少一份需要同步的状态，就少一处「索引说还在、文件其实已经没了」的故障。

为什么不「项目删除就立刻删它的快照」：sceneId 可能只存在于某个浏览器本地状态里（用户刚冻结、
还没保存进仪表盘），立刻删会让那次编辑莫名丢失。统一等 TTL，代价只是多占一段时间磁盘。
"""
from __future__ import annotations

import json
import logging
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
#: sceneId 的形态：uuid4().hex。读取目录时只认这种文件名，避免把别的东西当快照。
SCENE_ID_LENGTH = 32
SCENE_ID_ALPHABET = frozenset('0123456789abcdef')


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

    sceneId 是 32 位十六进制，底图副本命名成 ``<sceneId>-<assetId><后缀>``，
    因此 ``<sceneId>-*`` 能精确匹配到自己的副本：别的 sceneId 不可能以
    ``<sceneId>-`` 开头（短横线不在十六进制字符集里）。
    """
    return [folder / f'{scene_id}.json', *sorted(folder.glob(f'{scene_id}-*'))]


def delete_scene_files(folder: Path, scene_id: str) -> int:
    """删除一个快照的全部文件，返回真正释放的字节数。

    单个文件删不掉（权限、被占用）不影响其余文件，也不抛异常：回收是尽力而为的
    工作，不该因为一个文件失败让整轮巡检中断，更不该让冻结快照的请求失败。
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
    """列出「主人已经不在了」的底图副本：``<sceneId>-…`` 但 ``<sceneId>.json`` 已不在。

    为什么需要它：``delete_scene_files`` 是尽力而为的（单文件可能因权限/占用删不掉），
    所以存在「scene JSON 删掉了、副本留下」的中间态。而快照的入口是那个 JSON，
    只按 ``*.json`` 巡检的话这类残渣谁也看不见，会一直躺在目录里 —— 正是「只增不减」
    的老问题换了个更隐蔽的形态。
    """
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

    解析不了的草稿直接跳过：一份坏文档不该让整轮回收停摆（结果是那些快照多活
    一轮，而不是被误删）。
    """
    found: set[str] = set()
    for raw in documents:
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
    """回收「没被引用」且已过期的快照，返回本轮统计。

    ``referenced`` 是仍被引用的 sceneId 集合（见 :func:`referenced_scene_ids`），``ttl_seconds``
    是未被引用的快照保留多久；``folder`` 不存在时返回全零统计。返回
    ``{'deleted', 'released', 'kept'}`` 三项。

    除完整快照外，还会清掉「主人已经不在了」的底图副本残渣（见 :func:`orphan_scene_copies`）——
    ``delete_scene_files`` 只做到「尽力而为」，部分失败会留下这类残渣，而只按 ``*.json`` 巡检的话
    它谁也看不见。
    """
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
        # 不能算成已回收，否则统计会骗人。
        if payload.exists():
            kept += 1
        else:
            deleted += 1
    for orphan in orphan_scene_copies(folder):
        # 被引用的场景即使 JSON 缺了也不动它的副本：先让人去看清楚，别顺手清掉证据。
        if orphan.name.partition('-')[0] in referenced:
            kept += 1
            continue
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

    用短会话而不是请求级会话：巡检是「尽力而为」的附加工作，不该把它的查询挂在
    请求会话上延长生命周期（删除项目那条路径此时已经 commit 过、会话状态已变）。
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
