"""3D 窗帘控件的模型绑定与 HA 实时能力校验。
"""
from __future__ import annotations

from fastapi import HTTPException, status

from .numbers import as_finite_number

# 服务 → HA 能力位（CoverEntityFeature 的取值），按设备实际上报的能力放行。
COVER_SERVICES = {
    'open_cover': 1,
    'close_cover': 2,
    'set_cover_position': 4,
    'stop_cover': 8,
    'set_cover_tilt_position': 128 }
INFERRED_FEATURE_HINT = {
    'set_cover_position': '设备未上报能力位，且状态里没有位置反馈（current_position），无法确定它支持定位操作，请在 Home Assistant 中确认设备能力。',
    'set_cover_tilt_position': '设备未上报能力位，且状态里没有叶片角度（current_tilt_position），无法确定它支持调整叶片，请在 Home Assistant 中确认设备能力。',
}


def _reported_number(value) -> bool:
    """上报值是否是一个可用的数值（bool / 空串 / 非数字都不算）。
    """
    return as_finite_number(value) is not None


def inferred_cover_features(attributes: dict) -> int:
    """设备**从不**上报 supported_features 时，按它已经上报的状态推断能力位。
    """
    features = COVER_SERVICES['open_cover'] | COVER_SERVICES['close_cover'] | COVER_SERVICES['stop_cover']
    if _reported_number(attributes.get('current_position')):
        features |= COVER_SERVICES['set_cover_position']
    if _reported_number(attributes.get('current_tilt_position')):
        features |= COVER_SERVICES['set_cover_tilt_position']
    return features



def require_curtain_model(bindings: list, entity_id: str, scene: dict) -> None:
    """确认实体绑定的是场景中唯一的「普通窗帘」模型。
    """
    for binding in bindings:
        # 绑定三要素缺一就跳过：没有楼层或模型 ID 时无法在场景里定位到具体模型。
        if binding.get('entityId') != entity_id or not binding.get('floorId') or not binding.get('modelId'):
            continue
        floors = [floor for floor in scene.get('floors', []) if floor.get('id') == binding['floorId']]
        if len(floors) != 1:
            continue
        models = [item for item in floors[0].get('scene', {}).get('items', []) if item.get('id') == binding['modelId']]
        # 模型同样必须唯一，且类型是普通窗帘。
        if len(models) == 1 and models[0].get('type') == 'curtain':
            return
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='窗帘模型已失联，请在环境配置中重新选择普通窗帘模型。')


def validate_cover_command(service: str, data: dict, state: dict | None, *, dream: bool = False) -> None:
    """校验一次窗帘服务调用是否被当前设备能力支持。
    """
    required_feature = COVER_SERVICES.get(service)
    # 每类服务允许出现的参数集合是固定的：位置类带一个位置值，其余服务必须不带参数。
    if service == 'set_cover_position':
        fields = {'position'}
    elif service == 'set_cover_tilt_position':
        fields = {'tilt_position'}
    else:
        fields = set()
    if required_feature is None or not isinstance(data, dict) or set(data) != fields:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='3D 窗帘控制不支持此服务或参数。')
    if service in ('set_cover_position', 'set_cover_tilt_position'):
        # 位置只接受 0~100 的整数：bool 是 int 子类须单独排除，浮点与字符串也一律拒绝，
        position = data['position'] if service == 'set_cover_position' else data['tilt_position']
        if not isinstance(position, int) or isinstance(position, bool) or not 0 <= position <= 100:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='窗帘位置必须是 0 到 100 的整数。')
    # 状态缺失 / unknown / unavailable 一律按不可用处理，不做乐观转发。
    if not isinstance(state, dict) or state.get('available') is False or state.get('state') in (None, '', 'unknown', 'unavailable'):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='窗帘状态暂不可用，请等待设备重新连接。')
    attributes = state.get('attributes')
    # 区分「真的还没载入」（瞬时状态，值得让前端稍后重试）与「这个设备从不声明能力位」
    if not isinstance(attributes, dict):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='窗帘能力尚未载入，请稍后重试。')
    features = attributes.get('supported_features')
    inferred = features is None
    if inferred:
        features = inferred_cover_features(attributes)
    elif not isinstance(features, int) or isinstance(features, bool) or features < 0:
        # 上报了但值不可用（字符串、负数、布尔）同样是永久条件：说清是设备上报的问题，
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='窗帘上报的能力值无法识别，请检查设备配置。')
    # 位掩码比对：请求的服务必须出现在设备声明支持的能力位里。
    if not features & required_feature:
        # 推断出来的「不支持」要给出可自救的说明；设备明确上报的能力位则只需一句结论。
        if inferred and service in INFERRED_FEATURE_HINT:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=INFERRED_FEATURE_HINT[service])
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='窗帘当前不支持此操作。')
    if dream and service in ('set_cover_position', 'set_cover_tilt_position'):
        # 梦幻帘的叶片判断要做数值解析：HA 常把位置上报成数字字符串，由 as_finite_number 统一转换。

        # 是否真有叶片能力：要么上报了 current_tilt_position，要么 240（16+32+64+128）
        has_tilt = as_finite_number(attributes.get('current_tilt_position')) is not None or bool(features & 240)
        # 没有独立叶片通道时，这台风帘只有一个可控轴（位置），整体状态门禁一律不设：
        if not has_tilt:
            return
        # 有叶片能力时，只有整体确实 closed 且实际行程为 0 才允许调叶片 ——
        if state.get('state') != 'closed' or (
            attributes.get('current_position') is not None and as_finite_number(attributes.get('current_position')) != 0
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='只有确认整体完全关闭且停止后，才能调整叶片。')
    return
