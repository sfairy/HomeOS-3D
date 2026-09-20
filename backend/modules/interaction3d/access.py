"""3D 交互增量包的授权门禁与控件配置校验。

同一个功能有两条能力码：'editor'（编辑器整包）与 'module.3d_interaction'
（本增量包自己），任一有效即放行 —— 既能随整包售卖，也能只给 3D 交互单独授权。

本模块只做查询与判定，不写库、不续期：调用方（文档保存、舞台页、资源下发）
拿到的永远是「此刻能不能用」的结论。
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request

from ...license.crypto import LicenseCryptoError, parse_timestamp
from .config import validate_config

# 本增量包自己的能力码；与编辑器的 'editor' 一起构成双重门禁。
FEATURE = 'module.3d_interaction'
# 文档里 3D 交互控件的 type 值，保存与遍历时按它识别本模块的控件。
COMPONENT_TYPE = 'interaction3d'
# 下发给前端舞台页的授权有效期上限（秒）。
# 15 秒只够完成一次加载，后端不认这个凭据，每个接口都会重新过 require_access。
MAX_GRANT_SECONDS = 15


def allowed(request: Request, *, database=None) -> bool:
    """判断当前授权是否允许使用 3D 交互功能。

    两个能力码取或：买整包或单买增量包都能用；
    至于某个实体该不该被控制，由调用方另做归属校验。
    """
    service = request.app.state.license_service
    # 顺序无关：两个 allows 都读同一份授权状态，直接短路求值即可。
    return service.allows('editor', database=database) or service.allows(FEATURE, database=database)


def require_access(request: Request, *, database=None) -> None:
    """要求授权允许 3D 交互功能，否则 403。

    异常:
        HTTPException: 403，detail.code 固定为 INTERACTION3D_RESTRICTED，
        前端据此区分「未开通增量包」与「会话失效」两种提示。
    """
    if not allowed(request, database=database):
        # 错误码固定：前端靠它引导用户去开通，而不是弹通用的登录失效提示。
        raise HTTPException(403, detail={
            'code': 'INTERACTION3D_RESTRICTED',
            'message': '当前授权未开通 3D 交互功能增量包，或该权益已失效。',
        })
    return None


def access_grant(request: Request) -> dict:
    """下发前端舞台页用的短时效授权信息。

    它只用于界面控制交互元素的显隐，绝不是任何后端路由接受的凭据：
    每个接口都会独立走 require_access，改这个返回值换不来多余权限。

    返回:
        dict：allowed / feature / phase 与 validForSeconds（剩余有效秒数）。
    异常:
        HTTPException: 403，未开通增量包，或授权租约校验失败 / 已过期。
    """
    require_access(request)
    service = request.app.state.license_service
    # 默认给满上限；下面按授权租约的实际到期时间再收窄，避免前端多算出可用时间。
    lifetime = float(MAX_GRANT_SECONDS)
    # 未开启授权强制（开发 / 自托管部署）时没有租约可校验，直接用默认值。
    if service.settings.license_required:
        with service.database.session_factory() as database:
            state = service._state(database)
            try:
                payload = service.verifier.verify(state.signed_lease or '', state.instance_id)
                # 起算点取「租约整体到期时间」与「各相关权益到期时间」中最早的那个。
                deadlines = [parse_timestamp(payload['expiresAt'])]
                for item in payload.get('entitlements', []):
                    if not isinstance(item, dict):
                        continue
                    # 只关心与本页面有关的两个能力码，其它权益何时到期不影响这里。
                    if item.get('code') not in {'editor', FEATURE}:
                        continue
                    if not item.get('expiresAt'):
                        continue
                    deadlines.append(parse_timestamp(item['expiresAt']))
                lifetime = min(lifetime, (min(deadlines) - datetime.now(timezone.utc)).total_seconds())
            except (LicenseCryptoError, KeyError, TypeError, ValueError) as error:
                # 租约损坏或签名不匹配时宁可拒绝，不退化到「当没开授权强制」而放行。
                raise HTTPException(403, detail='3D 交互授权校验失败。') from error
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

    path 由键名与列表项 ID 拼成，作为控件在文档中的稳定身份：
    保存时的新旧差异比较（require_document_changes）靠它把控件一一对上，
    所以列表项优先用自带 id 而不是下标 —— 否则在列表前面插入一个控件，
    后面所有控件的路径都会整体漂移，被误判成「全都改过」。
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
            # 这样在列表中间插入或增删条目不会让已有控件的路径整体漂移。
            identity = item.get('id', item.get('path', index)) if isinstance(item, dict) else index
            yield from module_components(item, (*path, str(identity)))


def validate_module_component(component: dict) -> None:
    """校验单个 3D 交互控件的版本与配置。

    异常:
        HTTPException: 422，版本不支持、带了本模块未实现的通用控件字段，
        或 properties 未通过 validate_config。
    """
    if component.get('componentVersion', 1) != 1:
        raise HTTPException(422, detail='不支持的 3D 交互控件版本。')
    # 设备绑定、交互动作与子控件属于通用控件的能力，3D 交互控件暂未实现：
    # 一旦出现就直接拒绝，免得前端挂上后端不认的字段到运行期才失效。
    if component.get('bindings') or component.get('actions') or component.get('children'):
        raise HTTPException(422, detail='当前版本的 3D 交互控件不支持此设备绑定、交互动作或子控件配置。')
    validate_config(component.get('properties', {}))
    return None


def require_document_changes(request: Request, document: dict, previous: dict | None = None, *, database=None) -> None:
    """保存文档时判定这次改动是否需要 3D 交互授权。

    判定顺序（有意为之，先松后紧）：文档里没有 3D 控件 → 放行（本增量包不影响普通仪表盘的编辑）；
    已有授权 → 逐控件做配置校验后放行，不比较差异；未授权 → 只比较受保护配置，受保护字段没变时
    移动控件、调整缩放等纯展示性改动仍然允许保存。

    ``previous`` 是上一次保存的文档（首次保存为空）；``database`` 可选，透传给授权查询。
    未授权却改动了受保护配置、或新增了 3D 共享组件引用时抛 403。
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
    # 那相当于绕开上面的字段比对，整体换掉页面的内容。
    ids = {item.get('id') for item in document.get('sharedComponents', []) if any(module_components(item))}
    old_pages = {page.get('id'): page for page in (previous or {}).get('pages', [])}
    for page in document.get('pages', []):
        prior = old_pages.get(page.get('id'), {})
        # 只看新增的共享引用（差集）：原本就有的引用保持不变时不重复拦截。
        if (set(page.get('sharedComponentIds', [])) & ids) - set(prior.get('sharedComponentIds', [])):
            require_access(request, database=database)
    return None


def protected_config(component):
    """取出控件里「一改就要授权」的那部分配置。

    zIndex 被排除是刻意的：图层顺序纯属展示，前端拖拽排序会频繁改动它，
    算进去会让未授权环境连调整叠放次序都做不到。
    其余字段整体比较，等于结构与位置等任何实质改动都需要授权。
    """
    if component is None:
        return None
    # **component 在前、position 在后：字典字面量里后写的键取胜，等于只替换 position。
    return {
        **component,
        'position': {key: value for key, value in component.get('position', {}).items() if key != 'zIndex'},
    }
