'''Only explicit saved deletions affect studio-backed bindings; never HA entities.'''
import hashlib
import json
from copy import deepcopy

from .access import module_components, scene_snapshot_file
from .device import GENERIC_DEVICE_COLLECTIONS

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
)

def identities(scene):
    result = set()
    for floor in (scene or { }).get('floors', []):
        for kind, field in (('model', 'items'), ('light', 'lightGroups')):
            result.update((floor['id'], kind, item['id']) for item in floor.get('scene', { }).get(field, []) if item.get('id'))
        result.update((floor['id'], 'door', f'door:{item["id"]}') for item in floor.get('scene', { }).get('doors', []) if item.get('id'))
    return result

def collection(properties, path):
    parent = properties
    for key in path[:-1]:
        parent = parent.get(key, { })
    return (parent, parent.get(path[-1], []))

def binding_key(item, path):
    if path == ('security', 'locks'):
        return (item.get('floorId'), 'door', item.get('modelId'))
    return (item.get('floorId'), 'light' if path == ('lights',) else 'model', item.get('groupId') if path == ('lights',) else item.get('modelId'))

def plan_cleanup(documents, old_scene, new_scene, archives, settings):
    """Return new documents and granular undo records without modifying inputs."""
    before = identities(old_scene)
    after = identities(new_scene)
    removed = before - after
    added = after - before
    if not removed and not added:
        return ({ }, deepcopy(archives), [])
    output = { }
    saved = deepcopy(archives)
    impacts = []
    for project_id, document in documents.items():
        updated = deepcopy(document)
        for _, component in module_components(updated):
            properties = component.get('properties', { })
            scene_id = properties.get('sceneId', '')
            path = scene_snapshot_file(settings, scene_id)
            if path is None:
                continue
            scope = [project_id, component.get('id'), scene_id]
            removed_members = set()
            for parts in COLLECTIONS:
                parent, items = collection(properties, parts)
                deleted = [item for item in items if binding_key(item, parts) in removed]
                if not deleted:
                    continue
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
                if parts == ('environment', 'curtains'):
                    removed_members.update(item['id'] for item in deleted)
            environment = properties.get('environment', { })
            groups = environment.get('curtainGroups', [])
            broken = [group for group in groups if removed_members.intersection(group.get('memberIds', []))]
            if broken:
                environment['curtainGroups'] = [group for group in groups if group not in broken]
                for group in broken:
                    saved.append({
                        'scope': scope,
                        'path': ['environment', 'curtainGroups'],
                        'item': deepcopy(group),
                        'key': None,
                    })
            for entry in list(saved):
                if entry['scope'] != scope or entry['key'] is None or tuple(entry['key']) not in added:
                    continue
                parts = tuple(entry['path'])
                parent, items = collection(properties, parts)
                item = entry['item']
                if not any(other.get('id') == item.get('id') or binding_key(other, parts) == tuple(entry['key']) for other in items):
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
                # 组合只对「同楼层、非梦幻帘的两片帘」成立：成员数不是 2 就直接不成立，
                # 否则下一行的 selected[1] 会在单成员组合上抛 IndexError。
                valid = len(selected) == 2 and all(item.get('floorId') == group['floorId'] and item.get('coverKind') != 'dream' for item in selected)
                valid = valid and not (selected[0].get('entityId') and selected[0].get('entityId') == selected[1].get('entityId'))
                if valid and not conflict:
                    environment['curtainGroups'] = [*groups, deepcopy(group)]
                saved.remove(entry)
        if updated != document:
            output[project_id] = updated
    return (output, saved, impacts)

def confirmation_token(revision, scene, documents, impacts):
    return hashlib.sha256(json.dumps([revision, scene, documents, impacts], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
