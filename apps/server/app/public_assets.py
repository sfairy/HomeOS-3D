"""匿名可访问的静态资源清单。

清单在 ``frontend/public-static.json``，是 ``premium_asset`` 判定「这个 /static 资源要不要登录」
的唯一事实来源。放在 ``frontend/`` 下而不是 ``frontend/static/`` 里：那是被 StaticFiles 挂载出去
的目录，清单本身不该出现在可下载的命名空间里。

**为什么不再写死在中间件里**：这份集合同时是安全边界 —— 它决定「谁可以匿名取到什么」。
安全边界越显式越好核对，而写在 300 行的中间件里，改的时候既要翻代码又要判断哪些条目还活着。
每条后面的 ``why` 说明了「为什么它必须匿名」，这条信息与集合本身同等重要：漏掉一个入口脚本，
对应页面在未登录状态下会白屏。

读取结果按 (路径, mtime_ns) 缓存：清单是静态文件，但开发态改完立刻生效比"重启才生效"省事。
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import HTTPException

#: 清单相对 ``frontend/`` 的路径。
MANIFEST_RELATIVE_PATH = 'public-static.json'

#: (清单路径, mtime_ns) → 路径集合。
_manifest_cache: dict[tuple[str, int], frozenset[str]] = {}


def public_static_manifest_path(frontend_dir: Path) -> Path:
    """清单在磁盘上的位置。"""
    return frontend_dir / MANIFEST_RELATIVE_PATH


def load_always_revalidate(frontend_dir: Path) -> frozenset[str]:
    """读清单里的 alwaysRevalidate：入口页自己的 JS/CSS，必须逐次回源。"""
    return _load_list(frontend_dir, "alwaysRevalidate")


def load_public_static_files(frontend_dir: Path) -> frozenset[str]:
    """读清单，返回可匿名访问的 URL 路径集合。

    异常:
        HTTPException: 500 —— 清单缺失或格式不对。这是部署事故，要明确喊出来：静默回空集合
            会让**所有**静态资源都要求登录，表现为"未登录页面全白屏"，比启动失败更难查。
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
        # 允许两种写法：带 why 的对象，或纯路径字符串（新增条目懒得写理由时）。
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
