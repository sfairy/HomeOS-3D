"""图标库查询接口：在 Material Design Icons 的元数据里按关键词搜索。

路由前缀 /api/v1/icons。数据源是随前端一起发布的静态目录
（frontend/static/vendor/mdi/<version>/meta.json），本模块只读不写。
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Query, Request

from ..core.dependencies import LicensedUser

router = APIRouter(prefix='/icons', tags=['icons'])


#: 已解析的元数据：{路径: (mtime_ns, 字节数, 条目)}。
#: 键里为什么不只有路径（B20）：meta.json 会被**原地更新**（重新发布图标库、运维
#: 替换 vendor 目录、开发时换一份 meta.json），只按路径缓存的话永远读回第一次那份，
#: 表现为「新图标搜不到、旧图标搜得到」，而磁盘上明明已经是新文件。
#: 存快照而不是用 lru_cache 是为了让「文件变没变」这件事可观测：排障时可以直接看这张表。
_mdi_metadata_cache: dict[str, tuple[int, int, tuple[dict, ...]]] = {}


def _mdi_metadata(meta_path: Path) -> tuple[dict, ...]:
    """取（必要时重新解析）MDI 元数据。

    每次先看 mtime 与字节数：没变就直接回上次解析的结果（省掉读盘 + 解析），变了就重新解析并覆盖。
    判断依据只有「文件本身变没变」，与请求参数无关，因此按路径缓存是安全的（不同版本目录的路径
    本来就不同）。返回已过滤的条目元组，顺序保持文件里的原始顺序。
    """
    stat = meta_path.stat()
    stamp = (stat.st_mtime_ns, stat.st_size)
    cached = _mdi_metadata_cache.get(str(meta_path))
    if cached is not None and cached[:2] == stamp:
        return cached[2]
    parsed = _parse_mdi_metadata(meta_path)
    _mdi_metadata_cache[str(meta_path)] = (stamp[0], stamp[1], parsed)
    return parsed


def _parse_mdi_metadata(meta_path: Path) -> tuple[dict, ...]:
    """读取并过滤 MDI 元数据，返回只含 name/aliases/tags 的元组。"""
    raw = json.loads(meta_path.read_text(encoding='utf-8'))
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
    for item in _mdi_metadata(root / 'meta.json'):
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
