"""图标库查询接口：在 Material Design Icons 的元数据里按关键词搜索。

路由前缀 /api/v1/icons。数据源是随前端一起发布的静态目录
（frontend/static/vendor/mdi/<version>/meta.json），本模块只读不写。
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Query, Request

from ..dependencies import LicensedUser

router = APIRouter(prefix='/icons', tags=['icons'])


# 元数据文件随发行版固定不变，整体缓存一份：进程内只解析一次。
@lru_cache(maxsize=1)
def _mdi_metadata(path: str) -> tuple[dict, ...]:
    """读取并过滤 MDI 元数据，返回只含 name/aliases/tags 的元组。

    参数:
        path: meta.json 路径。
    返回:
        已过滤的条目元组，顺序保持文件里的原始顺序。
    """
    raw = json.loads(Path(path).read_text(encoding='utf-8'))
    return tuple(
        {
            'name': item['name'],
            'aliases': item.get('aliases') or [],
            'tags': item.get('tags') or [],
        }
        for item in raw
        # 过滤掉已弃用图标，以及名字带杂字符的条目：前端要按名字拼文件路径，必须干净。
        if not item.get('deprecated') and str(item.get('name', '')).replace('-', '').isalnum()
    )


@router.get('')
def icons(
    request: Request,
    _user: LicensedUser,
    query: str = '',
    limit: int = Query(160, ge=1, le=240),
    offset: int = Query(0, ge=0),
) -> dict:
    """按关键词搜索图标，返回一页结果。

    身份与能力码：LicensedUser（认证 + api）。
    查询参数：query（关键词，可带 mdi: 前缀）、limit（1~240，默认 160）、offset。
    返回 {library, version, total, offset, items[{name, slug, previewUrl}]}，
    total 始终是全量命中数，分页只影响 items。
    """
    # 版本号与静态目录 frontend/static/vendor/mdi/<version> 强绑定，升级图标库必须同步改这里。
    version = '7.4.47'
    root = request.app.state.settings.frontend_dir / 'static' / 'vendor' / 'mdi' / version
    # 允许直接粘贴 mdi:home 这种图标名：先剥掉前缀再匹配，同时统一小写。
    normalized = query.strip().lower().removeprefix('mdi:')
    matches = []
    for item in _mdi_metadata(str(root / 'meta.json')):
        haystack = [
            item['name'],
            *(str(value).lower() for value in item['aliases']),
            *(str(value).lower() for value in item['tags']),
        ]
        if normalized and not any(normalized in value for value in haystack):
            continue
        matches.append(item)
    # 排序取舍：完全命中 > 前缀命中 > 其它，同级按名字字典序，保证结果稳定可预期。
    matches.sort(
        key=lambda item: (
            0 if item['name'] == normalized else 1 if item['name'].startswith(normalized) else 2,
            item['name'],
        )
    )
    # 在内存里切片分页：命中集合本身不大，而且 total 需要全量命中数。
    page = matches[offset:offset + limit]
    return {
        'library': 'Material Design Icons',
        'version': version,
        'total': len(matches),
        'offset': offset,
        'items': [
            {
                'name': item['name'],
                'slug': f"mdi:{item['name']}",
                'previewUrl': f"/static/vendor/mdi/{version}/svg/{item['name']}.svg",
            }
            for item in page
        ],
    }
