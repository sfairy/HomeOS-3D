"""Studio 3D 删除级联清理：把 3D 场景里被删掉的物件/灯组/门从项目交互配置中摘除。

原 ``modules/interaction3d/studio_cleanup.py`` 已并入本模块（C1），那里只保留了
一段时间的 re-export 垫片，随零引用清理一并删除。这里只保留业务规则：

- identities 决定「哪些绑定目标被删了」；
- plan_cleanup 产出新文档、可回滚归档与影响清单；
- confirmation_token 给「一次删除影响多个项目」的场景做一次性确认凭据。

行为约束（与迁移前一致）：快照文件缺失的组件仍然不改变其绑定 —— 宁可留下不可达
绑定，也不凭缺失文件误删用户配置；区别是现在会记录警告，而不是静默跳过。
静默跳过会让「删了家具、但项目里的交互项还在」这类反馈无从排查。
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from copy import deepcopy

from fastapi import HTTPException, status

from . import draft_repository
from ...modules.interaction3d.access import module_components, scene_snapshot_file
from ...modules.interaction3d.device import GENERIC_DEVICE_COLLECTIONS

logger = logging.getLogger(__name__)

COLLECTIONS = (
    ('lights',),
    ('environment', 'airConditioners'),
    ('environment', 'airers'),
    ('environment', 'fans'),
    ('environment', 'exhaustFans'),
    ('environment', 'airPurifiers'),
    ('environment', 'waterHeaters'),
    ('environment', 'curtains'),
    ('environment', 'temperatureHumidity'),
    ('devices', 'nas'),
    ('devices', 'televisions'),
    ('devices', 'speakers'),
    ('devices', 'vacuums'),
    *(('devices', key) for key in GENERIC_DEVICE_COLLECTIONS),
    ('security', 'cameras'),
    ('security', 'presenceSensors'),
    ('security', 'locks'),
    ('security', 'alarms'),
)


def identities(scene):
    """场景中所有「可被交互配置绑定」的目标身份：`(floorId, kind, id)`。

    kind 取 `model` / `light` / `door`；门用 `door:<id>` 前缀，避免与同层模型 id 撞车。
    缺 id 的条目直接丢弃 —— 没有身份就无法判断它是否被删。
    """
    result = set()
    for floor in (scene or {}).get('floors', []):
        for kind, field in (('model', 'items'), ('light', 'lightGroups')):
            result.update(
                (floor['id'], kind, item['id'])
                for item in floor.get('scene', {}).get(field, [])
                if item.get('id')
            )
        result.update(
            (floor['id'], 'door', f'door:{item["id"]}')
            for item in floor.get('scene', {}).get('doors', [])
            if item.get('id')
        )
    return result


def collection(properties, path):
    """按 `path` 取 `(父容器, 列表)`，供调用方原地改写 `父容器[path[-1]]`。

    注意：中间层级缺失时返回的是一个**游离**的空 dict，对其写回不会影响 `properties`。
    这是刻意的 —— 项目里没有该集合时本来就不该凭空造出一层。
    """
    parent = properties
    for key in path[:-1]:
        parent = parent.get(key, {})
    return (parent, parent.get(path[-1], []))


def binding_key(item, path):
    """交互项 → 它绑定的目标身份（与 `identities()` 的三元组同构）。

    锁绑门、灯绑灯组、其余绑模型；绑定键缺失时返回含 `None` 的元组，天然匹配不上任何目标。
    """
    if path == ('security', 'locks'):
        return (item.get('floorId'), 'door', item.get('modelId'))
    return (
        item.get('floorId'),
        'light' if path == ('lights',) else 'model',
        item.get('groupId') if path == ('lights',) else item.get('modelId'),
    )


def _hashable(values):
    """把值收成集合；遇到不可哈希元素返回 None（调用方回退逐项比较）。"""
    result = set()
    for value in values:
        try:
            result.add(value)
        except TypeError:
            return None
    return result


def _binding_present(items, item, path, key):
    """``items`` 中是否已有同一 id 或同一绑定键的条目。

    与原 ``any(other.id == item.id or binding_key(other) == key for other in items)`` 等价：
    常规路径用集合做 O(1) 判断；元素不可哈希时回退到逐项比较。
    """
    ids = _hashable(other.get('id') for other in items)
    keys = _hashable(binding_key(other, path) for other in items)
    if ids is None or keys is None:
        return any(
            other.get('id') == item.get('id') or binding_key(other, path) == key for other in items
        )
    return item.get('id') in ids or key in keys


def plan_cleanup(documents, old_scene, new_scene, archives, settings):
    """计算删除级联清理计划，返回 `(新文档, 新归档, 影响清单)`，且不修改任何入参。

    三步：
    1. 用 `identities()` 对比新旧场景，得到被删/新增的绑定目标；
    2. 逐项目逐组件，把绑定了「被删目标」的交互项摘出来，写进归档；
    3. 反方向处理「新增目标」—— 从归档里捞回此前被摘掉、如今又能绑上的条目（幂等：
       已消费的归档条目按 `id()` 去重，末尾按原顺序过滤，等价于逐条 `saved.remove`）。

    `documents` 只返回**真的变了**的项目（`updated != document`），避免无谓写库。
    """
    before = identities(old_scene)
    after = identities(new_scene)
    removed = before - after
    added = after - before
    if not removed and not added:
        return ({}, deepcopy(archives), [])
    output = {}
    saved = deepcopy(archives)
    impacts = []
    reported_missing = set()
    # 按 scope 分桶：原实现每个组件都重扫整份归档（O(组件数 × 归档数)），归档越多越慢。
    # 分桶后每个组件只遍历自己 scope 的条目；桶内顺序与 saved 中的原始顺序一致，
    # 因此「按身份标记已消费 + 末尾按原顺序过滤」与原来的 `saved.remove(entry)` 等价。
    saved_by_scope: dict[tuple, list[dict]] = {}
    for archived in saved:
        saved_by_scope.setdefault(tuple(archived['scope']), []).append(archived)
    consumed: set[int] = set()

    def append_saved(entry: dict) -> None:
        saved.append(entry)
        saved_by_scope.setdefault(tuple(entry['scope']), []).append(entry)

    for project_id, document in documents.items():
        updated = deepcopy(document)
        for _, component in module_components(updated):
            properties = component.get('properties', {})
            scene_id = properties.get('sceneId', '')
            snapshot = scene_snapshot_file(settings, scene_id)
            if snapshot is None:
                # 不静默跳过：记录一次（同一组件只记一次），继续处理其余组件/项目。
                if scene_id and (project_id, component.get('id'), scene_id) not in reported_missing:
                    reported_missing.add((project_id, component.get('id'), scene_id))
                    logger.warning(
                        '3D 交互场景快照缺失，跳过该组件的级联清理（绑定保持不变）：'
                        'project=%s component=%s scene=%s',
                        project_id,
                        component.get('id'),
                        scene_id,
                    )
                continue
            scope = [project_id, component.get('id'), scene_id]
            removed_members = set()
            for parts in COLLECTIONS:
                parent, items = collection(properties, parts)
                deleted = []
                kept = []
                for item in items:
                    (deleted if binding_key(item, parts) in removed else kept).append(item)
                if not deleted:
                    continue
                parent[parts[-1]] = kept
                for item in deleted:
                    append_saved(
                        {
                            'scope': scope,
                            'path': list(parts),
                            'item': deepcopy(item),
                            'key': list(binding_key(item, parts)),
                        }
                    )
                    impacts.append(
                        {
                            'projectId': project_id,
                            'componentId': component.get('id'),
                            'label': item.get('label') or item.get('id'),
                        }
                    )
                if parts == ('environment', 'curtains'):
                    removed_members.update(item['id'] for item in deleted)
            environment = properties.get('environment', {})
            groups = environment.get('curtainGroups', [])
            broken = [group for group in groups if removed_members.intersection(group.get('memberIds', []))]
            if broken:
                environment['curtainGroups'] = [group for group in groups if group not in broken]
                for group in broken:
                    append_saved(
                        {
                            'scope': scope,
                            'path': ['environment', 'curtainGroups'],
                            'item': deepcopy(group),
                            'key': None,
                        }
                    )
            for entry in list(saved_by_scope.get(tuple(scope), ())):
                if id(entry) in consumed or entry['key'] is None or tuple(entry['key']) not in added:
                    continue
                parts = tuple(entry['path'])
                parent, items = collection(properties, parts)
                item = entry['item']
                if not _binding_present(items, item, parts, tuple(entry['key'])):
                    parent[parts[-1]] = [*items, deepcopy(item)]
                consumed.add(id(entry))
            for entry in list(saved_by_scope.get(tuple(scope), ())):
                if id(entry) in consumed or entry['key'] is not None:
                    continue
                group = entry['item']
                members = environment.get('curtains', [])
                member_ids = {item['id'] for item in members}
                if not set(group['memberIds']) <= member_ids:
                    continue
                groups = environment.get('curtainGroups', [])
                selected = [item for item in members if item['id'] in group['memberIds']]
                conflict = any(g['id'] == group['id'] or set(g['memberIds']) & set(group['memberIds']) for g in groups)
                valid = len(selected) == 2 and all(
                    item.get('floorId') == group['floorId'] and item.get('coverKind') != 'dream' for item in selected
                )
                valid = valid and not (
                    selected[0].get('entityId') and selected[0].get('entityId') == selected[1].get('entityId')
                )
                if valid and not conflict:
                    environment['curtainGroups'] = [*groups, deepcopy(group)]
                consumed.add(id(entry))
        if updated != document:
            output[project_id] = updated
    if consumed:
        saved = [entry for entry in saved if id(entry) not in consumed]
    return (output, saved, impacts)


def confirmation_token(revision, scene, documents, impacts):
    """「一次删除影响多个项目」的一次性确认凭据。

    对 `[revision, scene, documents, impacts]` 的规范化 JSON（键排序、无空格）取 SHA-256，
    因此入参任一字节变化都会让旧 token 失效 —— 前端必须带着与服务端一致的影响面回传。
    """
    return hashlib.sha256(
        json.dumps([revision, scene, documents, impacts], sort_keys=True, separators=(',', ':')).encode()
    ).hexdigest()


#: 交互配置里 ``sceneId`` 的格式：32 位小写十六进制（与 ``access.is_scene_id`` 一致）。
BINDING_SCENE_ID = re.compile('[a-f0-9]{32}')


def _binding_reference_map(document):
    """文档里所有「交互项 → 绑定的户型身份」，键为 ``(sceneId, (floorId, kind, id))``。

    值与 ``identities()`` 同构，因此可以直接和「当前户型图的身份集合」求差；
    ``label`` 只用于错误文案，取交互项自己的 label / id。
    """
    result = {}
    for _, component in module_components(document or {}):
        properties = component.get('properties') or {}
        scene_id = properties.get('sceneId') or ''
        if not isinstance(scene_id, str) or BINDING_SCENE_ID.fullmatch(scene_id) is None:
            continue
        for parts in COLLECTIONS:
            _, items = collection(properties, parts)
            for item in items:
                if not isinstance(item, dict):
                    continue
                key = (scene_id, tuple(binding_key(item, parts)))
                result[key] = item.get('label') or item.get('id') or ''
    return result


def new_binding_references(document, previous=None):
    """``document`` 里**新出现**的绑定引用：``[(sceneId, key, label)]``。

    只检查新增身份是刻意的：普通保存会带上历史遗留的失效绑定（删过的模型），
    全部重校验会让「任何一次保存」都失败。真正需要拦的是撤销 / 粘贴 / 复制把已经
    删掉的模型、楼层、灯组、门又绑回来。
    """
    before = _binding_reference_map(previous)
    return [
        (scene_id, key, label)
        for (scene_id, key), label in _binding_reference_map(document).items()
        if (scene_id, key) not in before
    ]


def _binding_conflict(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={'code': 'STUDIO3D_BINDING_CONFLICT', 'message': message},
    )


def _current_binding_identities(database):
    """当前户型图草稿里的绑定身份；没有草稿返回 ``None``。

    读不出来（草稿损坏）不能当成「没有草稿」放行 —— 那就是「证明不了就不许写」。
    """
    try:
        snapshot = draft_repository.read_snapshot(database)
    except HTTPException as error:
        raise _binding_conflict(
            '无法核对最新户型，请先打开户型绘制检查，再保存新增或复制的 3D 配置。'
        ) from error
    if snapshot is None:
        return None
    return identities(snapshot.scene)


def require_current_binding_references(settings, database, references) -> None:
    """新增绑定必须存在于**当前**户型图，否则 409 ``STUDIO3D_BINDING_CONFLICT``。

    只有「组件自己保存过场景快照」的引用才校验：快照文件缺失说明这份配置来自更早的
    版本，没有可对照的数据，按上游口径跳过而不是误杀。
    """
    if not references:
        return
    sources = {}
    current_ids = None
    for scene_id, key, label in references:
        if scene_id not in sources:
            snapshot = None
            path = scene_snapshot_file(settings, scene_id)
            if path is not None:
                try:
                    snapshot = json.loads(path.read_text(encoding='utf-8'))
                except (OSError, UnicodeDecodeError, json.JSONDecodeError):
                    # 快照读不出来就当「没有可对照数据」放行，但必须留痕：
                    # 否则用户看到的只是「保存成功」，实际绑定从没被校验过。
                    logger.warning('3D 交互场景快照无法解析，跳过绑定校验：%s', path, exc_info=True)
                    snapshot = None
            sources[scene_id] = snapshot if isinstance(snapshot, dict) else None
        if sources[scene_id] is None:
            continue
        if current_ids is None:
            current_ids = _current_binding_identities(database)
            if current_ids is None:
                return
        if key not in current_ids:
            raise _binding_conflict(
                f'户型已更新，‘{label}’关联的模型或楼层已不存在。'
                '请重新配置，或先在户型绘制中撤销删除。'
            )
