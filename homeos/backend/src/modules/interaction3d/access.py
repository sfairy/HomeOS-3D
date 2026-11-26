"""3D 交互增量包的授权门禁与控件配置校验。

同一个功能有两条能力码：``editor``（编辑器整包）与 ``module.3d_interaction``（本增量包
自己），任一有效即放行 —— 既能随整包售卖，也能只给 3D 交互单独授权。这个蕴含关系登记在
``domains/license/features.py`` 的 ``IMPLIED_BY`` 里，所以 ``allows(<增量包>)`` 已经包含
了「有 editor 就算有」这一条，这里不再各写一次 ``or``。
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import HTTPException, Request

from .config import validate_config
from ...domains.license import features as feature_codes
from ...domains.license.crypto import LicenseCryptoError
from ...platform.core.http.errors import BusinessException, ErrorCode, api_error

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
        # 0.8.9：HA 连接身份。前端把它写进后续写请求的 `X-HABridge-HA-Source`，
        # 换 HA 后旧页面里的操作会被 409（而不是打到新机器的同名实体上）。
        **ha_connection_facts(request),
    }


def ha_connection_facts(request: Request) -> dict:
    """当前 HA 连接的可公开事实（身份 / epoch / 在线）。

    `haSource` 是派生哈希（不含 base_url 与凭据原文），可以安全地出现在响应与日志里；
    `haEpoch` 每次换连接自增，前端据此整体丢弃缓存。
    """
    hub = getattr(request.app.state, 'state_hub', None)
    if hub is None:
        return {'haSource': '', 'haEpoch': 0, 'haOnline': False}
    return {
        'haSource': hub.runtime_source_identity,
        'haEpoch': hub.runtime_epoch,
        'haOnline': hub.runtime_online,
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

#: 浏览器回传的 HA 连接身份（0.8.9）。与 `access_grant` 响应里的 `haSource` 同源。
HA_SOURCE_HEADER = 'x-habridge-ha-source'

#: 请求体/查询串里的同义字段（0.8.9 的 `expectedHaSource`，另兼容 snake_case）。
HA_SOURCE_FIELDS = ('expectedHaSource', 'expected_ha_source')


def declared_ha_source(request: Request, expected: str | None = None) -> str:
    """取出「调用方以为自己连的是哪台 HA」。

    三处来源，优先级从高到低：显式参数（已解析的请求体字段）→ 请求头 → 查询串。
    为什么不能只读请求头：0.8.9 的保存类接口把身份放在 JSON 体里
    （`expectedHaSource`），只读头会把这类请求当成「未声明」而永远放行。
    """
    if expected is not None and str(expected).strip():
        return str(expected).strip()
    header = request.headers.get(HA_SOURCE_HEADER, '')
    if header:
        return header
    for name in HA_SOURCE_FIELDS:
        value = request.query_params.get(name)
        if value:
            return value
    return ''


def require_ha_source(request: Request, expected: str | None = None) -> None:
    """写操作前核对「我以为连的那台 HA」是否仍是当前连接（0.8.9）。

    不匹配就 409 —— 换 HA 之后旧页面里的按钮不该继续控制新机器的同名实体。
    旧客户端不声明身份（空串）时一律放行：`StateHub.source_changed` 把空值视为
    「未声明」。
    """
    hub = getattr(request.app.state, 'state_hub', None)
    if hub is None:
        return
    if hub.source_changed(declared_ha_source(request, expected)):
        raise BusinessException(ErrorCode.CONFLICT, api_error('HA_SOURCE_CHANGED'), 409)

def require_scene_viewer(request, database, viewer, scene_id, project_id):
    """场景查看权：登录 + 授权即可。

    配对码机制移除后编辑器与展示页共用同一登录会话；管理员视角本就允许预览尚未挂到
    仪表盘的户型快照，因此这里不做「场景 ↔ 仪表盘」归属收敛。保留参数便于将来按项目隔离。
    """
    require_access(request)


def require_scene_transfer(request, viewer, scene_id, project_id):
    """场景传输权（读取快照 / 背景 / 装饰模型）：与查看权同一口径，但自开会话。"""
    database = request.app.state.database.session_factory()
    with database:
        require_scene_viewer(request, database, viewer, scene_id, project_id)
