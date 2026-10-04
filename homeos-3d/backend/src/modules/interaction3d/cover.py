"""已保存的窗帘模型绑定与权威的 HA 能力校验。"""
from __future__ import annotations

from math import isfinite

from fastapi import HTTPException

COVER_SERVICES = {
    'open_cover': 1,
    'close_cover': 2,
    'set_cover_position': 4,
    'stop_cover': 8,
    'set_cover_tilt_position': 128 }


def require_curtain_model(
    bindings: list, entity_id: str, scene: dict, *, model_type: str = 'curtain'
) -> None:
    """只有唯一的普通窗帘模型才能为其绑定的窗帘授权。"""
    for binding in bindings:
        if binding.get('entityId') != entity_id or not binding.get('floorId') or not binding.get('modelId'):
            continue
        floors = [floor for floor in scene.get('floors', []) if floor.get('id') == binding['floorId']]
        if len(floors) != 1:
            continue
        models = [item for item in floors[0].get('scene', {}).get('items', []) if item.get('id') == binding['modelId']]
        if len(models) == 1 and models[0].get('type') == model_type:
            return
    if model_type == 'airer':
        raise HTTPException(409, detail='晾衣架模型已移除，请重新选择模型。')
    raise HTTPException(409, detail='窗帘模型已失联，请在环境配置中重新选择普通窗帘模型。')


def validate_cover_command(service: str, data: dict, state: dict | None, *, dream: bool = False) -> None:
    required_feature = COVER_SERVICES.get(service)
    if service == 'set_cover_position':
        fields = {'position'}
    elif service == 'set_cover_tilt_position':
        fields = {'tilt_position'}
    else:
        fields = set()
    if required_feature is None or not isinstance(data, dict) or set(data) != fields:
        raise HTTPException(422, detail='3D 窗帘控制不支持此服务或参数。')
    if service in ('set_cover_position', 'set_cover_tilt_position'):
        position = data['position'] if service == 'set_cover_position' else data['tilt_position']
        if not isinstance(position, int) or isinstance(position, bool) or not 0 <= position <= 100:
            raise HTTPException(422, detail='窗帘位置必须是 0 到 100 的整数。')
    if not isinstance(state, dict) or state.get('available') is False or state.get('state') in (None, '', 'unknown', 'unavailable'):
        raise HTTPException(409, detail='窗帘状态暂不可用，请等待设备重新连接。')
    attributes = state.get('attributes')
    if not isinstance(attributes, dict):
        raise HTTPException(409, detail='窗帘能力尚未载入，请稍后重试。')
    features = attributes.get('supported_features')
    if not isinstance(features, int) or isinstance(features, bool) or features < 0:
        raise HTTPException(409, detail='窗帘能力尚未载入，请稍后重试。')
    if not features & required_feature:
        raise HTTPException(422, detail='窗帘当前不支持此操作。')
    if dream and service in ('set_cover_position', 'set_cover_tilt_position'):

        def number(value):
            if isinstance(value, bool) or not isinstance(value, (str, int, float)):
                return None
            try:
                value = float(value)
                return value if isfinite(value) else None
            except ValueError:
                return None

        has_tilt = number(attributes.get('current_tilt_position')) is not None or bool(features & 240)
        if not has_tilt:
            return
        if state.get('state') != 'closed' or (
            attributes.get('current_position') is not None and number(attributes.get('current_position')) != 0
        ):
            raise HTTPException(409, detail='只有确认整体完全关闭且停止后，才能调整叶片。')
    return
