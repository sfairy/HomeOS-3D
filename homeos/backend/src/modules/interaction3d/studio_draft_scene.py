"""交互侧读取「当前 3D 户型草稿」的唯一入口。

权威草稿只有 ``studio_drafts`` 单行表一处（旧单文件由 migration 4 一次性导入）：
数据库有行就是当前草稿；无行或损坏时返回 ``None``，调用方按「没有草稿」处理
（409/404），绝不猜。
"""

from __future__ import annotations

import logging

from ...domains.studio3d import draft_repository

LOGGER = logging.getLogger(__name__)


def read_current_studio_draft_fingerprint(database) -> tuple[int, str, int] | None:
    """当前草稿的廉价指纹；读取失败与「没有草稿」同样返回 ``None``。"""
    try:
        return draft_repository.read_fingerprint(database)
    except Exception:
        LOGGER.warning("读取 studio_drafts 指纹失败，按没有草稿处理", exc_info=True)
        return None


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


#: ``(指纹, 草稿)``：控制链路每条命令都要校验绑定模型是否还在，整篇草稿 JSON 可达数 MB。
_readonly_draft_cache: tuple[tuple[int, str, int], dict] | None = None


def read_current_studio_draft_readonly(database) -> dict | None:
    """与 :func:`read_current_studio_draft` 同值，但按指纹缓存解析结果；返回值共享，调用方不得修改。

    先读指纹再读草稿：两次读之间若有写入，缓存的是更新的草稿、挂在旧指纹下，下一次指纹不符即重读。
    """
    global _readonly_draft_cache
    fingerprint = read_current_studio_draft_fingerprint(database)
    cached = _readonly_draft_cache
    if fingerprint is not None and cached is not None and cached[0] == fingerprint:
        return cached[1]
    payload = read_current_studio_draft(database)
    _readonly_draft_cache = (fingerprint, payload) if fingerprint is not None and payload is not None else None
    return payload
