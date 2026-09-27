"""3D 交互增量包的授权门禁与控件配置校验。
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request

from ...license.crypto import LicenseCryptoError
from .config import validate_config

# 本增量包自己的能力码；与编辑器的 'editor' 一起构成双重门禁。
FEATURE = 'module.3d_interaction'
# 文档里 3D 交互控件的 type 值，保存与遍历时按它识别本模块的控件。
COMPONENT_TYPE = 'interaction3d'
# 下发给前端舞台页的授权有效期上限（秒）。
MAX_GRANT_SECONDS = 15


def allowed(request: Request, *, database=None) -> bool:
    """判断当前授权是否允许使用 3D 交互功能。
    """
    service = request.app.state.license_service
    # 顺序无关：两个 allows 都读同一份授权状态，直接短路求值即可。
    return service.allows('editor', database=database) or service.allows(FEATURE, database=database)


def require_access(request: Request, *, database=None) -> None:
    if not allowed(request, database=database):
        # 错误码固定：前端靠它引导用户去开通，而不是弹通用的登录失效提示。
        raise HTTPException(403, detail={
            'code': 'INTERACTION3D_RESTRICTED',
            'message': '当前授权未开通 3D 交互功能增量包，或该权益已失效。',
        })
    return None


def access_grant(request: Request) -> dict:
    """下发前端舞台页用的短时效授权信息。
    """
    require_access(request)
    service = request.app.state.license_service
    lifetime = float(MAX_GRANT_SECONDS)
    # 未开启授权强制（开发 / 自托管部署）时没有租约可校验，直接用默认值。
    if service.settings.license_required:
        # 租约的读取与验签交给 LicenseService 的公开方法，本模块不碰它的内部成员：
        try:
            deadline = service.earliest_entitlement_expiry({'editor', FEATURE})
        except (LicenseCryptoError, KeyError, TypeError, ValueError) as error:
            # 租约损坏或签名不匹配时宁可拒绝，不退化到「当没开授权强制」而放行。
            raise HTTPException(403, detail='3D 交互授权校验失败。') from error
        lifetime = min(lifetime, (deadline - datetime.now(timezone.utc)).total_seconds())
        # 租约本身还在，但权益已经过期：同样不放行。
        if lifetime <= 0:
            raise HTTPException(403, detail='3D 交互授权已到期。')
    return {
        'allowed': True,
        'feature': FEATURE,
        'phase': 'authorization-shell',
        'validForSeconds': lifetime,
    }


def module_components(value, path=()):
    """深度遍历仪表盘文档，产出所有 3D 交互控件及其「位置路径」。
    """
    if isinstance(value, dict):
        if value.get('type') == COMPONENT_TYPE:
            yield (path, value)
        # 继续下潜：控件可能嵌在成组控件的 children、模板或任意嵌套字段里。
        for key, item in value.items():
            yield from module_components(item, (*path, key))
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            # 列表项优先用自带 id / path 当路径段，取不到才回落到下标，
            identity = item.get('id', item.get('path', index)) if isinstance(item, dict) else index
            yield from module_components(item, (*path, str(identity)))


def validate_module_component(component: dict) -> None:
    """校验单个 3D 交互控件的版本与配置。
    """
    if component.get('componentVersion', 1) != 1:
        raise HTTPException(422, detail='不支持的 3D 交互控件版本。')
    # 设备绑定、交互动作与子控件属于通用控件的能力，3D 交互控件暂未实现：
    if component.get('bindings') or component.get('actions') or component.get('children'):
        raise HTTPException(422, detail='当前版本的 3D 交互控件不支持此设备绑定、交互动作或子控件配置。')
    validate_config(component.get('properties', {}))
    return None


def require_document_changes(request: Request, document: dict, previous: dict | None = None, *, database=None) -> None:
    """保存文档时判定这次改动是否需要 3D 交互授权。
    """
    incoming = list(module_components(document))
    if not incoming:
        return None
    if allowed(request, database=database):
        # 有授权：逐个控件校验配置合法性，不比较差异（怎么改都行）。
        for _, component in incoming:
            validate_module_component(component)
        return None
    # 未授权：先按旧文档建立「路径 → 受保护配置」索引，再逐控件比对。
    old = dict(module_components(previous or {}))
    for path, component in incoming:
        if protected_config(old.get(path)) != protected_config(component):
            require_access(request, database=database)
    # 未授权时也不允许把 3D 控件新挂成本页面的共享组件：
    ids = {item.get('id') for item in document.get('sharedComponents', []) if any(module_components(item))}
    old_pages = {page.get('id'): page for page in (previous or {}).get('pages', [])}
    for page in document.get('pages', []):
        prior = old_pages.get(page.get('id'), {})
        if (set(page.get('sharedComponentIds', [])) & ids) - set(prior.get('sharedComponentIds', [])):
            require_access(request, database=database)
    return None


def protected_config(component):
    """取出控件里「一改就要授权」的那部分配置。
    """
    if component is None:
        return None
    # **component 在前、position 在后：字典字面量里后写的键取胜，等于只替换 position。
    return {
        **component,
        'position': {key: value for key, value in component.get('position', {}).items() if key != 'zIndex'},
    }
