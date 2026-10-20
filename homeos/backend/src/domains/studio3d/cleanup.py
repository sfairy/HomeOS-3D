"""Studio 3D 删除级联清理：把 3D 场景里被删掉的物件/灯组/门从项目交互配置中摘除。

从 modules/interaction3d/studio_cleanup.py 迁入（C1）。这里只保留业务规则：

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
from copy import deepcopy

from ...modules.interaction3d.access import module_components, scene_snapshot_file
from ...modules.interaction3d.device import GENERIC_DEVICE_COLLECTIONS

logger = logging.getLogger(__name__)

COLLECTIONS = (
    ('lights',),
    ('environment', 'airConditioners'),
    ('environment', 'airers'),
    ('environment', 'fans'),
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
    parent = properties
    for key in path[:-1]:
        parent = parent.get(key, {})
    return (parent, parent.get(path[-1], []))


def binding_key(item, path):
    if path == ('security', 'locks'):
        return (item.get('floorId'), 'door', item.get('modelId'))
    return (
        item.get('floorId'),
        'light' if path == ('lights',) else 'model',
        item.get('groupId') if path == ('lights',) else item.get('modelId'),
    )


def plan_cleanup(documents, old_scene, new_scene, archives, settings):
    """返回新文档和细粒度撤销记录，且不修改入参。"""
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
                    saved.append(
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
                    saved.append(
                        {
                            'scope': scope,
                            'path': ['environment', 'curtainGroups'],
                            'item': deepcopy(group),
                            'key': None,
                        }
                    )
            for entry in list(saved):
                if entry['scope'] != scope or entry['key'] is None or tuple(entry['key']) not in added:
                    continue
                parts = tuple(entry['path'])
                parent, items = collection(properties, parts)
                item = entry['item']
                if not any(
                    other.get('id') == item.get('id') or binding_key(other, parts) == tuple(entry['key'])
                    for other in items
                ):
                    parent[parts[-1]] = [*items, deepcopy(item)]
                saved.remove(entry)
            for entry in list(saved):
                if entry['scope'] != scope or entry['key'] is not None:
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
                saved.remove(entry)
        if updated != document:
            output[project_id] = updated
    return (output, saved, impacts)


def confirmation_token(revision, scene, documents, impacts):
    return hashlib.sha256(
        json.dumps([revision, scene, documents, impacts], sort_keys=True, separators=(',', ':')).encode()
    ).hexdigest()
