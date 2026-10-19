"""交互侧读取「当前 3D 户型草稿」的唯一入口。

权威草稿只有 ``studio_drafts`` 单行表一处（旧单文件由 migration 4 一次性导入）：
数据库有行就是当前草稿；无行或损坏时返回 ``None``，调用方按「没有草稿」处理
（409/404），绝不猜。
"""

from __future__ import annotations

import logging

from ...domains.studio3d import draft_repository

LOGGER = logging.getLogger(__name__)


def read_current_studio_draft(database) -> dict | None:
    """返回 ``{revision, scene, updatedAt}``；不存在/损坏时返回 ``None``（并留警告）。"""
    try:
        snapshot = draft_repository.read_snapshot(database)
    except Exception:
        LOGGER.warning("读取 studio_drafts 失败，按没有草稿处理", exc_info=True)
        return None
    if snapshot is None:
        return None
    return {
        "revision": snapshot.revision,
        "scene": snapshot.scene,
        "updatedAt": snapshot.updated_at,
    }


def read_current_studio_scene(database) -> dict | None:
    """只要 ``scene`` 的便捷版本；形状不合法时返回 ``None``。"""
    payload = read_current_studio_draft(database)
    scene = (payload or {}).get("scene")
    return scene if isinstance(scene, dict) else None
