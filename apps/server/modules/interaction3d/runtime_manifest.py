"""3D 交互运行时资源的可下发清单。
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import HTTPException

#: 清单相对 ``frontend/`` 的路径。
MANIFEST_RELATIVE_PATH = 'modules/runtime/manifest.json'
#: 清单只列文件，媒体类型由扩展名推导 —— 不再为每个条目各写一遍。
DEFAULT_MEDIA_TYPES: dict[str, str] = {
    '.js': 'text/javascript',
    '.css': 'text/css',
}

#: (清单路径, mtime_ns) → (可下发集合, 扩展名 → 媒体类型)。
_manifest_cache: dict[tuple[str, int], tuple[frozenset[str], dict[str, str]]] = {}


def runtime_manifest_path(frontend_dir: Path) -> Path:
    """清单在磁盘上的位置。"""
    return frontend_dir / MANIFEST_RELATIVE_PATH


def load_runtime_manifest(frontend_dir: Path) -> tuple[frozenset[str], dict[str, str]]:
    """读清单，返回 ``(可下发的相对路径集合, 扩展名 → 媒体类型)``。
    """
    path = runtime_manifest_path(frontend_dir)
    try:
        stat = path.stat()
    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail=f'3D 交互资源清单缺失：{MANIFEST_RELATIVE_PATH}（{error}）',
        ) from error
    cache_key = (str(path), stat.st_mtime_ns)
    cached = _manifest_cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise HTTPException(
            status_code=500,
            detail=f'3D 交互资源清单读不出来：{MANIFEST_RELATIVE_PATH}（{error}）',
        ) from error
    raw_files = payload.get('files')
    if not isinstance(raw_files, list) or not all(isinstance(item, str) for item in raw_files):
        raise HTTPException(
            status_code=500,
            detail=f'3D 交互资源清单格式不对：{MANIFEST_RELATIVE_PATH} 的 files 必须是字符串数组。',
        )
    media_types = dict(DEFAULT_MEDIA_TYPES)
    declared = payload.get('mediaTypes')
    if isinstance(declared, dict):
        media_types.update({str(key): str(value) for key, value in declared.items()})
    loaded = (frozenset(raw_files), media_types)
    _manifest_cache.clear()
    _manifest_cache[cache_key] = loaded
    return loaded
