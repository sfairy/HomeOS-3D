from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Query, Request

from ..dependencies import LicensedUser

router = APIRouter(prefix='/icons', tags=['icons'])


@lru_cache(maxsize=1)
def _mdi_metadata(path: str) -> tuple[dict, ...]:
    raw = json.loads(Path(path).read_text(encoding='utf-8'))
    return tuple(
        {
            'name': item['name'],
            'aliases': item.get('aliases') or [],
            'tags': item.get('tags') or [],
        }
        for item in raw
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
    version = '7.4.47'
    root = request.app.state.settings.frontend_dir / 'static' / 'vendor' / 'mdi' / version
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
    matches.sort(
        key=lambda item: (
            0 if item['name'] == normalized else 1 if item['name'].startswith(normalized) else 2,
            item['name'],
        )
    )
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
