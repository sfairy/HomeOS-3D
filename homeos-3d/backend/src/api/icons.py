"""图标库查询接口：在 Material Design Icons 的元数据里按关键词搜索。
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request, status

from ..security.dependencies import LicensedUser

router = APIRouter(prefix='/icons', tags=['icons'])


#: 已解析的元数据：{路径: (mtime_ns, 字节数, 条目)}。
_mdi_metadata_cache: dict[str, tuple[int, int, tuple[dict, ...]]] = {}


def _mdi_version_root(frontend_dir: Path) -> Path:
    """定位当前的 mdi 版本目录：``dist/static/vendor/mdi/<version>``。
    """
    vendor_root = frontend_dir / 'static' / 'vendor' / 'mdi'
    versions = [
        entry.name
        for entry in vendor_root.iterdir()
        if entry.is_dir() and (entry / 'meta.json').exists()
    ] if vendor_root.is_dir() else []
    if not versions:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='图标库未安装：找不到 static/vendor/mdi/<version>/meta.json。',
        )

    def version_key(name: str) -> tuple[int, ...]:
        # 目录名是纯数字点分版本；非常规命名排到最后（仍可用，但不会盖过规范版本）。
        return tuple(int(part) for part in name.split('.')) if name.replace('.', '').isdigit() else (-1,)

    return vendor_root / max(versions, key=version_key)


def _mdi_metadata(meta_path: Path) -> tuple[dict, ...]:
    """取（必要时重新解析）MDI 元数据。
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
    """
    root = _mdi_version_root(request.app.state.settings.frontend_dir)
    version = root.name
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
