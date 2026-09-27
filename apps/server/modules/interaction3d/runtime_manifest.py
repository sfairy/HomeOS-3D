"""3D 交互运行时资源的可下发清单。

清单在 ``frontend/modules/runtime/manifest.json``，是这条路由的**唯一事实来源**：
``get_resource`` 只下发清单里登记过的文件，而清单本身就是这条路由的安全边界 ——
"文件放进磁盘"不等于"可以被下发"，因为这条路由按增量包能力码门禁。

**为什么不再写死在 Python 里**：原先那份是"文件名清单 + 媒体类型表"两份结构拼出来的
（77 条 js 一条条列举，css 再单独 update 一遍）。新增一个模块要改两处，漏掉一处不报错 ——
只表现为浏览器里那个模块 404、整条 import 链断掉（本仓真踩过一次）。改成清单文件之后：
新增模块只改清单一处，而"清单 ↔ 磁盘"的一致性由 ``tools/check_invariants.mjs`` 双向核对兜住。

读取结果按 (路径, mtime_ns) 缓存：清单是静态文件，但开发态改完立刻生效比"重启才生效"省事，
而 mtime 一变缓存自然失效，不需要任何显式刷新。
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

    异常:
        HTTPException: 500 —— 清单缺失或格式不对。这是部署事故，用 500 明确喊出来，
            而不是静默回一份空清单：那会让"所有 3D 交互资源都 404"看起来像前端写错了路径。
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
    # 只留最近一份：清单是单文件，缓存多份没有意义，反而会钉住历史内容。
    _manifest_cache.clear()
    _manifest_cache[cache_key] = loaded
    return loaded
