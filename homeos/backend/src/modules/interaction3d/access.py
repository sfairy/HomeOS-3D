"""3D 交互增量包的授权门禁与控件配置校验。

同一个功能有两条能力码：``editor``（编辑器整包）与 ``module.3d_interaction``（本增量包
自己），任一有效即放行 —— 既能随整包售卖，也能只给 3D 交互单独授权。这个蕴含关系登记在
``services/license/features.py`` 的 ``IMPLIED_BY`` 里，所以 ``allows(<增量包>)`` 已经包含
了「有 editor 就算有」这一条，这里不再各写一次 ``or``。
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import HTTPException, Request

from ...services.license import features as feature_codes
from ...services.license.crypto import LicenseCryptoError
from .config import validate_config

FEATURE = feature_codes.FEATURE_INTERACTION_3D
COMPONENT_TYPE = 'interaction3d'
MAX_GRANT_SECONDS = 60

SCENE_ID_PATTERN = re.compile('[0-9a-f]{32}')


def is_scene_id(scene_id) -> bool:
    return isinstance(scene_id, str) and SCENE_ID_PATTERN.fullmatch(scene_id) is not None


def scene_snapshot_file(settings, scene_id):
    if not is_scene_id(scene_id):
        return None
    path = settings.data_dir / 'modules' / 'interaction3d' / 'scenes' / f'{scene_id}.json'
    return path if path.is_file() else None


def allowed(request: Request, *, database=None) -> bool:
    service = request.app.state.license_service
    return service.allows(FEATURE, database=database)


def require_access(request: Request, *, database=None) -> None:
    if not allowed(request, database=database):
        raise HTTPException(403, detail={
            'code': 'INTERACTION3D_RESTRICTED',
            'message': '当前授权未开通 3D 交互功能增量包，或该权益已失效。',
        })


def access_grant(request: Request) -> dict:
    """一个短暂的 UI 有效期，绝不是任何后端路由都会接受的凭证。"""
    require_access(request)
    service = request.app.state.license_service
    lifetime = float(MAX_GRANT_SECONDS)
    if service.settings.license_required:
        try:
            deadline = service.earliest_entitlement_expiry({feature_codes.FEATURE_EDITOR, FEATURE})
        except (LicenseCryptoError, KeyError, TypeError, ValueError) as error:
            raise HTTPException(403, detail='3D 交互授权校验失败。') from error
        lifetime = min(lifetime, (deadline - datetime.now(UTC)).total_seconds())
        if lifetime <= 0:
            raise HTTPException(403, detail='3D 交互授权已到期。')
    return {
        'allowed': True,
        'feature': FEATURE,
        'phase': 'authorization-shell',
        'validForSeconds': lifetime,
    }


def module_components(value, path=()):
    """同时遍历嵌套的分组/模板；列表位置不应阻碍正常编辑。"""
    if isinstance(value, dict):
        if value.get('type') == COMPONENT_TYPE:
            yield (path, value)
        for key, item in value.items():
            yield from module_components(item, (*path, key))
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            identity = item.get('id', item.get('path', index)) if isinstance(item, dict) else index
            yield from module_components(item, (*path, str(identity)))


def validate_module_component(component: dict) -> None:
    if component.get('componentVersion', 1) != 1:
        raise HTTPException(422, detail='不支持的 3D 交互控件版本。')
    if component.get('bindings') or component.get('actions') or component.get('children'):
        raise HTTPException(422, detail='当前版本的 3D 交互控件不支持此设备绑定、交互动作或子控件配置。')
    validate_config(component.get('properties', {}))


def require_document_changes(request: Request, document: dict, previous: dict | None = None, *, database=None) -> None:
    incoming = list(module_components(document))
    old = dict(module_components(previous or {}))
    if not incoming:
        return
    if allowed(request, database=database):
        for _, component in incoming:
            validate_module_component(component)
        return
    for path, component in incoming:
        if protected_config(old.get(path)) != protected_config(component):
            require_access(request, database=database)
    ids = {item.get('id') for item in document.get('sharedComponents', []) if any(module_components(item))}
    old_pages = {page.get('id'): page for page in (previous or {}).get('pages', [])}
    for page in document.get('pages', []):
        prior = old_pages.get(page.get('id'), {})
        if (set(page.get('sharedComponentIds', [])) & ids) - set(prior.get('sharedComponentIds', [])):
            require_access(request, database=database)
    return


def protected_config(component):
    if component is None:
        return None
    return {
        **component,
        'position': {key: value for key, value in component.get('position', {}).items() if key != 'zIndex'},
    }
