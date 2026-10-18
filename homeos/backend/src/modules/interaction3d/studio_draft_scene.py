"""交互侧读取「当前 3D 户型草稿」的唯一入口。

为什么需要这个模块：迁移（migration 4）把权威草稿从 ``data/studio3d/draft.json`` 搬进了
``studio_drafts`` 单行表，同时 ``POST/PUT /studio3d`` 不再写那个文件。交互快照、场景同步、
底图回退这些运行期路径如果继续直接读文件，就会永远看到迁移前的旧户型：用户新画的墙、
新挂的灯都进不了展示页，而且没有任何报错。

读取顺序固定为「数据库优先、旧文件只读回退」：

- 数据库有行 → 它就是当前草稿；
- 数据库无行（迁移未执行/失败）→ 回退旧单文件，保证工作台还能读；
- 两者都不可用 → 返回 ``None``，调用方按「没有草稿」处理（409/404），绝不猜。
"""

from __future__ import annotations

import logging

from ...domains.studio3d import draft_repository

LOGGER = logging.getLogger(__name__)


def read_current_studio_draft(database, settings) -> dict | None:
    """返回 ``{revision, scene, updatedAt}``；不存在/损坏时返回 ``None``（并留警告）。"""
    try:
        snapshot = draft_repository.read_snapshot(database)
    except Exception:
        LOGGER.warning("读取 studio_drafts 失败，按没有草稿处理", exc_info=True)
        return None
    if snapshot is not None:
        return {
            "revision": snapshot.revision,
            "scene": snapshot.scene,
            "updatedAt": snapshot.updated_at,
        }
    try:
        return draft_repository.read_legacy_payload(settings.studio3d_draft_path)
    except Exception:
        LOGGER.warning("读取旧户型单文件失败，按没有草稿处理", exc_info=True)
        return None


def read_current_studio_scene(database, settings) -> dict | None:
    """只要 ``scene`` 的便捷版本；形状不合法时返回 ``None``。"""
    payload = read_current_studio_draft(database, settings)
    scene = (payload or {}).get("scene")
    return scene if isinstance(scene, dict) else None
