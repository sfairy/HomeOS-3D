from __future__ import annotations
import gzip
import json
import re
import shutil
from copy import deepcopy
from pathlib import Path
from uuid import uuid4
from ...panel.template_entities import TEMPLATE_ENTITY_BINDINGS_KEY, replace_template_entity_bindings
DEFAULT_TEMPLATE_SCENE_ID = '308eb3fb77ed426cbfd65545bbfcb11a'
DEFAULT_TEMPLATE_FIXTURE = 'qiguang-3d-default-scene-v1.json.gz'
DEFAULT_TEMPLATE_BACKGROUND = 'qiguang-3d-default-background.png'
DEFAULT_TEMPLATE_ANCHOR_FLOOR_ID = 'floor-5f78a55c-46ab-4f33-b2e7-405d10d4b910'
SCENE_SOURCE_KEY = 'interaction3dSource'

def is_template_scene(settings, scene_id: str, snapshot: dict) -> bool:
    '''Source travels with the immutable scene, including copied components.

    Older snapshots have no source marker. Recognize their bundled floor/model
    identities, never the dashboard containing the component. New studio
    snapshots always have an explicit marker, even when drawing from a template.
    '''
    if SCENE_SOURCE_KEY in snapshot:
        return snapshot[SCENE_SOURCE_KEY] == 'template'
    if scene_id == DEFAULT_TEMPLATE_SCENE_ID:
        return True
    floors = snapshot.get('scene', { }).get('floors', [])
    if not any(floor.get('id') == DEFAULT_TEMPLATE_ANCHOR_FLOOR_ID for floor in floors):
        return False
    expected = {floor['id']: {item.get('id') for item in floor['scene'].get('items', [])} for floor in _load_fixture(settings.project_root)['scene']['floors']}
    return all(floor.get('id') in expected and {item.get('id') for item in floor.get('scene', { }).get('items', [])} == expected[floor['id']] for floor in floors)

def _fixture_root(project_root: Path) -> Path:
    return project_root / 'dashboard_templates'

def _load_fixture(project_root: Path) -> dict:
    fixture = _fixture_root(project_root) / DEFAULT_TEMPLATE_FIXTURE
    if not fixture.is_file():
        name = fixture.name
        raise RuntimeError(f'''3D 模板默认户型快照缺失：{name}''')
    try:
        with gzip.open(fixture, 'rt', encoding = 'utf-8') as source:
            payload = json.load(source)
    except (OSError, ValueError) as error:
        raise RuntimeError('3D 模板默认户型快照无法读取。') from error
    if not (isinstance(payload, dict) and isinstance(payload.get('scene'), dict)):
        raise RuntimeError('3D 模板默认户型快照格式无效。')
    return payload

def load_default_template_scene(settings, *, database) -> dict:
    """Load the packaged floorplan snapshot for a fixed dashboard template.

    Template projects must not read the global studio draft: that draft belongs
    to the user's editable 3D drawing and may contain a completely different
    house.  Keep the same entity-binding replacement used during project
    creation, while leaving the bundled scene metadata private to the fixture.
    """
    payload = _load_fixture(settings.project_root)
    template_entity_bindings = payload.pop(TEMPLATE_ENTITY_BINDINGS_KEY, { })
    return replace_template_entity_bindings(payload, template_entity_bindings, database)

def load_default_template_reference_scene(settings, *, database) -> dict:
    '''Build the legacy camera frame used by the bundled dashboard views.

    The template cameras were authored against the original one-floor scene.
    The rendered template now intentionally contains the immutable four-floor
    snapshot, so use the matching first-floor geometry as a coordinate-only
    reference while keeping the actual payload untouched.  This lets the
    frontend convert saved ALL cameras into the current four-floor frame.
    '''
    payload = load_default_template_scene(settings, database = database)
    scene = deepcopy(payload['scene'])
    anchor = next((floor for floor in scene.get('floors', []) if floor.get('id') == DEFAULT_TEMPLATE_ANCHOR_FLOOR_ID), None)
    if anchor is None:
        raise RuntimeError('3D 模板默认户型快照缺少相机参考楼层。')
    anchor = deepcopy(anchor)
    for key in ('elevation', 'offsetX', 'offsetZ', 'originX', 'originY', 'rotation'):
        anchor[key] = 0
    scene['floors'] = [anchor]
    scene['activeFloorId'] = anchor['id']
    scene['previewFloorGap'] = 0
    scene['previewFloorMode'] = 'active'
    scene['uniformOverviewStack'] = False
    return {
        'scene': scene }

def clone_default_template_scene(settings, *, database) -> str:
    '''Copy the packaged floorplan into a project-independent scene snapshot.'''
    payload = load_default_template_scene(settings, database = database)
    payload[SCENE_SOURCE_KEY] = 'template'
    scene = payload['scene']
    backgrounds = []
    for floor in scene.get('floors', [
        {
            'scene': scene }]):
        background = (floor.get('scene') or { }).get('background') or { }
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        if not asset_id:
            continue
        if asset_id not in backgrounds:
            backgrounds.append(asset_id)
    if not backgrounds:
        raise RuntimeError('3D 模板默认户型快照未配置户型底图。')
    source_background = _fixture_root(settings.project_root) / DEFAULT_TEMPLATE_BACKGROUND
    if not source_background.is_file():
        name = source_background.name
        raise RuntimeError(f'''3D 模板默认户型底图缺失：{name}''')
    scene_id = uuid4().hex
    folder = settings.data_dir / 'modules' / 'interaction3d' / 'scenes'
    folder.mkdir(parents = True, exist_ok = True)
    scene_file = folder / f'''{scene_id}.json'''
    with scene_file.open('x', encoding = 'utf-8') as output:
        json.dump(payload, output, ensure_ascii = False)
    scene_file.chmod(384)
    for asset_id in backgrounds:
        if not re.fullmatch('[0-9a-f]{32}', asset_id):
            raise RuntimeError('3D 模板默认户型底图资源 ID 无效。')
        suffix = source_background.suffix.lower()
        shutil.copyfile(source_background, folder / f'''{scene_id}-{asset_id}{suffix}''')
    return scene_id

def rewrite_default_template_scene_ids(document: dict, settings, *, database) -> dict:
    '''Replace the legacy fixed scene ID once for all 3D components.'''
    replacement = None

    def visit(value) -> None:
        if isinstance(value, dict):
            if value.get('sceneId') == DEFAULT_TEMPLATE_SCENE_ID:
                replacement = replacement or clone_default_template_scene(settings, database = database)
                value['sceneId'] = replacement
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
        return None

    visit(document)
    return document
