"""模型删除后的 3D 交互绑定级联清理。
"""
from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from typing import Any

from .access import module_components
from .device import GENERIC_DEVICE_COLLECTIONS
from .scene_store import scenes_dir

#: 场景里「物件身份」的两种集合形状：(身份类别, 楼层场景里的集合字段)。
_FLOOR_COLLECTIONS: tuple[tuple[str, str], ...] = (
    ('model', 'items'),
    ('light', 'lightGroups'),
)

#: 一个绑定集合在 ``properties`` 里的路径。顺序无关紧要，但这是遍历与撤销记录 path 的唯一来源。
COLLECTIONS: tuple[tuple[str, ...], ...] = (
    ('lights',),
    ('environment', 'airConditioners'),
    ('environment', 'airPurifiers'),
    ('environment', 'curtains'),
    ('environment', 'temperatureHumidity'),
    ('devices', 'nas'),
    ('devices', 'televisions'),
    ('devices', 'vacuums'),
    *(('devices', key) for key in GENERIC_DEVICE_COLLECTIONS),
    ('security', 'cameras'),
    ('security', 'presenceSensors'),
    ('security', 'locks'),
)

_SCENE_ID_PATTERN = re.compile('[a-f0-9]{32}')


def identities(scene: dict | None) -> set[tuple[str, str, str]]:
    """把一份场景里全部「可被绑定指向」的物件身份提炼成 ``(floorId, kind, id)`` 集合。
    """
    result: set[tuple[str, str, str]] = set()
    for floor in (scene or {}).get('floors', []) or []:
        if not isinstance(floor, dict):
            continue
        floor_id = floor.get('id')
        floor_scene = floor.get('scene')
        if not floor_id or not isinstance(floor_scene, dict):
            continue
        for kind, field in _FLOOR_COLLECTIONS:
            for item in floor_scene.get(field, []) or []:
                if isinstance(item, dict) and item.get('id'):
                    result.add((floor_id, kind, item['id']))
        for door in floor_scene.get('doors', []) or []:
            if isinstance(door, dict) and door.get('id'):
                result.add((floor_id, 'door', f'door:{door["id"]}'))
    return result


def collection(properties: dict, path: tuple[str, ...]) -> tuple[dict, list]:
    """按路径取出绑定的父容器与列表本体，供删除 / 追加时就地改写。
    """
    parent = properties
    for key in path[:-1]:
        child = parent.get(key, {})
        parent = child if isinstance(child, dict) else {}
    items = parent.get(path[-1], [])
    return parent, items if isinstance(items, list) else []


def binding_key(item: dict, path: tuple[str, ...]) -> tuple:
    """一条绑定指向的物件身份，与 :func:`identities` 产出的元组可直接比较。
    """
    if path == ('security', 'locks'):
        model_id = item.get('modelId')
        if isinstance(model_id, str):
            # 与 lock.py 同口径地剥净前缀再补一次：控件侧存的一直是 ``door:<id>``，
            raw = model_id
            while raw.startswith('door:'):
                raw = raw[5:]
            model_id = f'door:{raw}' if raw else model_id
        return (item.get('floorId'), 'door', model_id)
    return (
        item.get('floorId'),
        'light' if path == ('lights',) else 'model',
        item.get('groupId') if path == ('lights',) else item.get('modelId'),
    )


def confirmation_token(revision: Any) -> str:
    """把「这次清理计划」摘要成一个确认令牌，绑定到精确的输入。
    """
    return hashlib.sha256(
        json.dumps(revision, sort_keys=True, separators=(',', ':')).encode()
    ).hexdigest()


def plan_cleanup(
    documents: dict[str, dict],
    old_scene: dict | None,
    new_scene: dict | None,
    archives: list[dict],
    settings: Any,
) -> tuple[dict[str, dict], list[dict], list[dict]]:
    """算出一份**新的**文档映射、新的撤销记录与影响清单，输入一概不改。
    """
    before = identities(old_scene)
    after = identities(new_scene)
    removed = before - after
    added = after - before
    if not removed and not added:
        # 没删也没加：不动文档、不动撤销记录。这一步放在深拷贝文档之前，热路径上最省。
        return {}, deepcopy(archives), []
    output: dict[str, dict] = {}
    saved: list[dict] = deepcopy(archives)
    impacts: list[dict] = []
    for project_id, document in documents.items():
        updated = deepcopy(document)
        for _path, component in module_components(updated):
            properties = component.get('properties', {})
            if not isinstance(properties, dict):
                continue
            scene_id = properties.get('sceneId', '')
            # 只处理 studio-backed 控件：sceneId 必须是本模块冻结出来的形态，且快照仍在。
            if not isinstance(scene_id, str) or not _SCENE_ID_PATTERN.fullmatch(scene_id):
                continue
            snapshot_path = scenes_dir(settings) / f'{scene_id}.json'
            if not snapshot_path.is_file():
                continue
            # 快照读不出来（缺失 / 坏编码 / 坏 JSON / 类型不对）时跳过这个控件：一次保存
            try:
                snapshot = json.loads(snapshot_path.read_text(encoding='utf-8'))
            except (OSError, UnicodeDecodeError, json.JSONDecodeError, TypeError):
                continue
            if not isinstance(snapshot, dict):
                continue
            # scope 是「哪个项目的哪个控件用了哪份快照」，撤销记录据此定位回同一条绑定。
            scope = [project_id, component.get('id'), scene_id]
            removed_members: set = set()
            for parts in COLLECTIONS:
                parent, items = collection(properties, parts)
                deleted = [item for item in items if binding_key(item, parts) in removed]
                if not deleted:
                    continue
                # 原地改写的是 updated（深拷贝后的文档），原 document 不受影响。
                parent[parts[-1]] = [item for item in items if item not in deleted]
                for item in deleted:
                    saved.append({
                        'scope': scope,
                        'path': list(parts),
                        'item': deepcopy(item),
                        'key': list(binding_key(item, parts)),
                    })
                    impacts.append({
                        'projectId': project_id,
                        'componentId': component.get('id'),
                        'label': item.get('label') or item.get('id'),
                    })
                # 窗帘绑定被删时，记下被删的成员 ID —— 组合（curtainGroups）里有它就得拆。
                if parts == ('environment', 'curtains'):
                    removed_members.update(item.get('id') for item in deleted)
            environment = properties.get('environment')
            environment = environment if isinstance(environment, dict) else {}
            groups = environment.get('curtainGroups') or []
            broken = [
                group for group in groups
                if isinstance(group, dict)
                and removed_members.intersection(group.get('memberIds') or [])
            ]
            if broken:
                environment['curtainGroups'] = [group for group in groups if group not in broken]
                for group in broken:
                    # 灯组撤销记录的 key 为 None：它没有「身份键」，靠 memberIds 是否复原来判断。
                    saved.append({
                        'scope': scope,
                        'path': ['environment', 'curtainGroups'],
                        'item': deepcopy(group),
                        'key': None,
                    })
            # 还原第一段：模型被加回场景（added 命中）时，把此前撤下的绑定放回原位。
            for entry in list(saved):
                if entry.get('scope') != scope or entry.get('key') is None:
                    continue
                if tuple(entry['key']) not in added:
                    continue
                parts = tuple(entry['path'])
                parent, items = collection(properties, parts)
                item = entry['item']
                if not any(
                    other.get('id') == item.get('id')
                    or binding_key(other, parts) == tuple(entry['key'])
                    for other in items
                ):
                    parent[parts[-1]] = [*items, deepcopy(item)]
                saved.remove(entry)
            # 还原第二段：窗帘组合的成员都回来了、且不与现存组合冲突时，把组合放回去。
            for entry in list(saved):
                if entry.get('scope') != scope or entry.get('key') is not None:
                    continue
                group = entry['item']
                members = environment.get('curtains') or []
                member_ids = {item.get('id') for item in members if isinstance(item, dict)}
                if not set(group.get('memberIds') or []) <= member_ids:
                    continue
                groups = environment.get('curtainGroups') or []
                selected = [
                    item for item in members
                    if isinstance(item, dict) and item.get('id') in (group.get('memberIds') or [])
                ]
                # 同一楼层已有普通帘组合时算冲突；梦幻帘与普通帘口径不同，单独放行。
                conflict = any(
                    isinstance(other, dict)
                    and (
                        other.get('id') == group.get('id')
                        or set(other.get('memberIds') or []) & set(group.get('memberIds') or [])
                    )
                    for other in groups
                )
                valid = all(
                    item.get('floorId') == group.get('floorId') and item.get('coverKind') != 'dream'
                    for item in selected
                ) and not (
                    # 两个成员指向同一个实体时，组合本身就是错的配置，不放回去。
                    selected[0].get('entityId')
                    and selected[0].get('entityId') == selected[1].get('entityId')
                )
                if valid and not conflict:
                    environment['curtainGroups'] = [*groups, deepcopy(group)]
                saved.remove(entry)
        # 只有真正改动过的文档才进入 output：调用方据此决定写哪几行、token 也才有区分度。
        if updated != document:
            output[project_id] = updated
    return output, saved, impacts
