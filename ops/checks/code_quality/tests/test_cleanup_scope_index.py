"""studio3d.cleanup.plan_cleanup 的等价性与性能检查。

对照实现是优化前的版本（逐字复制自本次改动前的 `cleanup.py`）：唯一差异是把
「每个组件重扫整份归档」换成「按 scope 分桶 + 按身份标记已消费」、以及把
`any(...)` 成员判断换成集合判断。本测试用随机文档/归档对比两者输出的
`(output, saved, impacts)` 完全一致，并给出归档规模放大时的基准。
"""

from __future__ import annotations

import importlib
import random
import sys
import tempfile
import time
import types
import unittest
from copy import deepcopy
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[4]
# 不存在的快照路径：baseline 里该分支依赖 Path.exists() 为 False。
MISSING_SCENE = Path(tempfile.gettempdir()) / 'homeos-qc-missing-scene.json'
_PKG = 'qa_cleanup_src'
_pkg = types.ModuleType(_PKG)
_pkg.__path__ = [str(REPO / 'homeos' / 'backend' / 'src')]
sys.modules[_PKG] = _pkg
sys.path.insert(0, str(REPO / 'packages' / 'shared-py'))
cleanup = importlib.import_module(f'{_PKG}.domains.studio3d.cleanup')

identities = cleanup.identities
COLLECTIONS = cleanup.COLLECTIONS
collection = cleanup.collection
binding_key = cleanup.binding_key
logger = cleanup.logger


def scene_snapshot_file(settings, scene_id):
    """代理到被测模块，便于 mock.patch 同时作用于新旧两份实现。"""
    return cleanup.scene_snapshot_file(settings, scene_id)


def module_components(document):
    return cleanup.module_components(document)


def legacy_plan_cleanup(documents, old_scene, new_scene, archives, settings):
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

def _component(component_id, scene_id, rng, light_count=6, curtain_count=6, group_count=2):
    lights = [
        {'id': f'L{index}', 'floorId': 'f1', 'groupId': f'g{index % 3}', 'label': f'灯{index}'}
        for index in range(light_count)
    ]
    curtains = [
        {
            'id': f'C{index}',
            'floorId': 'f1',
            'modelId': f'm{index % 2}',
            'coverKind': rng.choice(['dream', 'normal']),
            'entityId': f'e{index}' if index % 3 else '',
        }
        for index in range(curtain_count)
    ]
    groups = [
        {
            'id': f'G{index}',
            'floorId': 'f1',
            'memberIds': [f'C{index}', f'C{index + 1}'],
        }
        for index in range(group_count)
    ]
    return {
        'id': component_id,
        'type': 'interaction3d',
        'properties': {
            'sceneId': scene_id,
            'lights': lights,
            'environment': {'curtains': curtains, 'curtainGroups': groups, 'fans': []},
            'devices': {'televisions': [{'id': 'T1', 'floorId': 'f1', 'modelId': 'm1'}]},
            'security': {'locks': [{'id': 'K1', 'floorId': 'f1', 'modelId': 'm1'}]},
        },
    }


def _documents(project_count, component_count, rng, **kwargs):
    documents = {}
    for project in range(project_count):
        documents[f'p{project}'] = {
            'name': f'项目{project}',
            'components': [
                _component(f'c{project}-{index}', f's{project}-{index}', rng, **kwargs)
                for index in range(component_count)
            ],
        }
    return documents


def _scene(floor_items, light_groups, doors):
    return {
        'floors': [
            {
                'id': 'f1',
                'scene': {'items': floor_items, 'lightGroups': light_groups, 'doors': doors},
            }
        ]
    }


def _scenarios(seed):
    rng = random.Random(seed)
    documents = _documents(3, 2, rng, light_count=8, curtain_count=8, group_count=3)
    old_scene = _scene(
        [{'id': f'm{index}'} for index in range(3)],
        [{'id': f'g{index}'} for index in range(4)],
        [{'id': f'd{index}'} for index in range(2)],
    )
    # 新场景删掉一部分模型/灯组/门，用来制造 removed；再加回一个已存在的绑定制造 added。
    new_scene = _scene(
        [{'id': f'm{index}'} for index in range(2)] + [{'id': 'm9'}],
        [{'id': f'g{index}'} for index in range(3)],
        [{'id': 'd0'}],
    )
    archives = [
        {
            'scope': [f'p{project}', f'c{project}-{index}', f's{project}-{index}'],
            'path': ['lights'],
            'item': {'id': f'L{index}', 'floorId': 'f1', 'groupId': 'g0'},
            'key': ['f1', 'light', 'g0'],
        }
        for project in range(3)
        for index in range(2)
    ]
    archives.append(
        {
            'scope': ['p0', 'c0-0', 's0-0'],
            'path': ['environment', 'curtainGroups'],
            'item': {'id': 'G0', 'floorId': 'f1', 'memberIds': ['C0', 'C1']},
            'key': None,
        }
    )
    return documents, old_scene, new_scene, archives


class PlanCleanupEquivalenceTest(unittest.TestCase):
    def _run(self, seed):
        documents, old_scene, new_scene, archives = _scenarios(seed)
        snapshot = deepcopy((documents, old_scene, new_scene, archives))
        with (
            mock.patch.object(cleanup, 'scene_snapshot_file', lambda settings, scene_id: MISSING_SCENE),
            mock.patch.object(cleanup, 'module_components', lambda doc: enumerate(doc['components'])),
        ):
            legacy = legacy_plan_cleanup(documents, old_scene, new_scene, archives, object())
            repaired = cleanup.plan_cleanup(documents, old_scene, new_scene, archives, object())
        self.assertEqual(legacy, repaired)
        self.assertEqual(snapshot, (documents, old_scene, new_scene, archives))
        return repaired

    def test_random_documents_match(self):
        for seed in range(40):
            self._run(seed)

    def test_missing_snapshot_is_skipped_identically(self):
        documents, old_scene, new_scene, archives = _scenarios(0)
        with (
            mock.patch.object(cleanup, 'scene_snapshot_file', lambda settings, scene_id: None),
            mock.patch.object(cleanup, 'module_components', lambda doc: enumerate(doc['components'])),
        ):
            self.assertEqual(
                legacy_plan_cleanup(documents, old_scene, new_scene, archives, object()),
                cleanup.plan_cleanup(documents, old_scene, new_scene, archives, object()),
            )

    def test_no_change_returns_empty_output(self):
        documents, old_scene, _, archives = _scenarios(0)
        with (
            mock.patch.object(cleanup, 'scene_snapshot_file', lambda settings, scene_id: MISSING_SCENE),
            mock.patch.object(cleanup, 'module_components', lambda doc: enumerate(doc['components'])),
        ):
            output, saved, impacts = cleanup.plan_cleanup(documents, old_scene, old_scene, archives, object())
        self.assertEqual((output, saved, impacts), ({}, deepcopy(archives), []))

    def test_archives_scale_benchmark(self):
        rng = random.Random(20261021)
        documents = _documents(40, 2, rng, light_count=20, curtain_count=20, group_count=5)
        old_scene = _scene([{'id': f'm{index}'} for index in range(4)], [{'id': f'g{index}'} for index in range(4)], [{'id': 'd0'}])
        new_scene = _scene([{'id': 'm0'}], [{'id': 'g0'}], [])
        archives = [
            {
                'scope': [f'p{project}', f'c{project}-{index}', f's{project}-{index}'],
                'path': ['lights'],
                'item': {'id': f'L{index}', 'floorId': 'f1', 'groupId': f'g{index % 3}'},
                'key': ['f1', 'light', f'g{index % 3}'],
            }
            for project in range(40)
            for index in range(50)
        ]

        def run(fn):
            start = time.perf_counter()
            fn(documents, old_scene, new_scene, archives, object())
            return (time.perf_counter() - start) * 1000

        with (
            mock.patch.object(cleanup, 'scene_snapshot_file', lambda settings, scene_id: MISSING_SCENE),
            mock.patch.object(cleanup, 'module_components', lambda doc: enumerate(doc['components'])),
        ):
            legacy_ms = min(run(legacy_plan_cleanup) for _ in range(3))
            repaired_ms = min(run(cleanup.plan_cleanup) for _ in range(3))
            self.assertEqual(
                legacy_plan_cleanup(documents, old_scene, new_scene, archives, object()),
                cleanup.plan_cleanup(documents, old_scene, new_scene, archives, object()),
            )
        print(
            f'\n[bench] plan_cleanup 80 components / 2000 archives: '
            f'legacy={legacy_ms:.1f}ms new={repaired_ms:.1f}ms speedup={legacy_ms / repaired_ms:.2f}x'
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
