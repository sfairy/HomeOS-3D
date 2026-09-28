"""匿名可访问的静态资源清单。
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import HTTPException

#: 清单相对 ``frontend/`` 的路径。
MANIFEST_RELATIVE_PATH = 'public-static.json'

#: (清单路径, mtime_ns, 字段) → 路径集合。
_manifest_cache: dict[tuple[str, int, str], frozenset[str]] = {}


def public_static_manifest_path(frontend_dir: Path) -> Path:
    """清单在磁盘上的位置。"""
    return frontend_dir / MANIFEST_RELATIVE_PATH


def load_always_revalidate(frontend_dir: Path) -> frozenset[str]:
    """读清单里的 alwaysRevalidate：入口页自己的 JS/CSS，必须逐次回源。"""
    return _load_list(frontend_dir, "alwaysRevalidate")


def load_public_static_files(frontend_dir: Path) -> frozenset[str]:
    """读清单，返回可匿名访问的 URL 路径集合。
    """
    return _load_list(frontend_dir, "files")


def _load_list(frontend_dir: Path, field: str) -> frozenset[str]:
    """读清单里的某个路径数组；带 (路径, mtime_ns, 字段) 缓存。"""
    path = public_static_manifest_path(frontend_dir)
    try:
        stat = path.stat()
    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail=f'公开静态资源清单缺失：{MANIFEST_RELATIVE_PATH}（{error}）',
        ) from error
    cache_key = (str(path), stat.st_mtime_ns, field)
    cached = _manifest_cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise HTTPException(
            status_code=500,
            detail=f'公开静态资源清单读不出来：{MANIFEST_RELATIVE_PATH}（{error}）',
        ) from error
    raw_files = payload.get(field)
    if not isinstance(raw_files, list):
        raise HTTPException(
            status_code=500,
            detail=f'公开静态资源清单格式不对：{MANIFEST_RELATIVE_PATH} 的 files 必须是数组。',
        )
    paths = []
    for item in raw_files:
        value = item.get('path') if isinstance(item, dict) else item
        if not isinstance(value, str) or not value.startswith('/static/'):
            raise HTTPException(
                status_code=500,
                detail=f'公开静态资源清单里有非法条目：{value!r}（必须是以 /static/ 开头的字符串）。',
            )
        paths.append(value)
    loaded = frozenset(paths)
    _manifest_cache.clear()
    _manifest_cache[cache_key] = loaded
    return loaded
