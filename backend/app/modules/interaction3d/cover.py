"""3D 窗帘控件的模型绑定与 HA 实时能力校验。

与空调模块同一套思路：配置侧确认「普通窗帘模型」仍在场景中，
运行侧用 HA 上报的 supported_features 位掩码核对这次服务调用是否被支持。
梦幻帘（coverKind=dream）额外一条：只有整体完全关闭且静止时才允许调整叶片。
"""
from __future__ import annotations

from fastapi import HTTPException
from math import isfinite

# 服务 → HA 能力位（CoverEntityFeature 的取值），按设备实际上报的能力放行。
COVER_SERVICES = {
    'open_cover': 1,
    'close_cover': 2,
    'set_cover_position': 4,
    'stop_cover': 8,
    'set_cover_tilt_position': 128,
}


def require_curtain_model(bindings: list, entity_id: str, scene: dict) -> None:
    """确认实体绑定的是场景中唯一的「普通窗帘」模型。

    只认 type == 'curtain'：梦幻帘等其它外观即使 ID 相同也不在这里放行，
    因为两类帘可下发的指令集不同（见 validate_cover_command 的 dream 分支）。

    异常:
        HTTPException: 409，找不到合法绑定（模型被删或换成了其它类型）。
    """
    for binding in bindings:
        # 绑定三要素缺一就跳过：没有楼层或模型 ID 时无法在场景里定位到具体模型。
        if binding.get('entityId') != entity_id or not binding.get('floorId') or not binding.get('modelId'):
            continue
        floors = [floor for floor in scene.get('floors', []) if floor.get('id') == binding['floorId']]
        # 楼层必须唯一命中，避免同名楼层下选错模型。
        if len(floors) != 1:
            continue
        models = [item for item in floors[0].get('scene', {}).get('items', []) if item.get('id') == binding['modelId']]
        # 模型同样必须唯一，且类型是普通窗帘。
        if len(models) == 1 and models[0].get('type') == 'curtain':
            return None
    raise HTTPException(status_code=409, detail='窗帘模型已失联，请在环境配置中重新选择普通窗帘模型。')


def validate_cover_command(service: str, data: dict, state: dict | None, *, dream: bool = False) -> None:
    """校验一次窗帘服务调用是否被当前设备能力支持。

    参数:
        service: HA 服务名，必须命中 COVER_SERVICES。
        data: 透传参数，按服务类型要求恰好带 position 或 tilt_position，其余服务必须为空。
        state: 实体的实时状态快照，缺失视为设备不可用。
        dream: 该绑定是否梦幻帘，为 True 时限制调叶片的时机。

    异常:
        HTTPException: 422 参数非法或设备不支持该操作；409 状态不可用或不满足调整前提。
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
        raise HTTPException(status_code=422, detail='3D 窗帘控制不支持此服务或参数。')
    if service in ('set_cover_position', 'set_cover_tilt_position'):
        # 位置只接受 0~100 的整数：bool 是 int 子类须单独排除，浮点与字符串也一律拒绝，
        # 否则 HA 侧按各自规则截断，行程会与用户预期不一致。
        position = data['position'] if service == 'set_cover_position' else data['tilt_position']
        if not isinstance(position, int) or isinstance(position, bool) or not 0 <= position <= 100:
            raise HTTPException(status_code=422, detail='窗帘位置必须是 0 到 100 的整数。')
    # 状态缺失 / unknown / unavailable 一律按不可用处理，不做乐观转发。
    if not isinstance(state, dict) or state.get('available') is False or state.get('state') in (None, '', 'unknown', 'unavailable'):
        raise HTTPException(status_code=409, detail='窗帘状态暂不可用，请等待设备重新连接。')
    attributes = state.get('attributes')
    # 拿不到 supported_features 就无法判断能力，宁可让前端稍后重试也不盲目透传。
    features = attributes.get('supported_features') if isinstance(attributes, dict) else None
    if not isinstance(features, int) or isinstance(features, bool) or features < 0:
        raise HTTPException(status_code=409, detail='窗帘能力尚未载入，请稍后重试。')
    # 位掩码比对：请求的服务必须出现在设备声明支持的能力位里。
    if not features & required_feature:
        raise HTTPException(status_code=422, detail='窗帘当前不支持此操作。')
    if dream and service in ('set_cover_position', 'set_cover_tilt_position'):

        # 梦幻帘的叶片判断要做数值解析：HA 常把位置上报成数字字符串，这里统一转 float。
        def number(value):
            if isinstance(value, bool) or not isinstance(value, (str, int, float)):
                return None
            try:
                value = float(value)
                # NaN / inf 会让后续比较失去意义，一律归一成 None（即「没有这个值」）。
                return value if isfinite(value) else None
            except ValueError:
                return None

        # 是否真有叶片能力：要么上报了 current_tilt_position，要么 240（16+32+64+128）
        # 中任意一个能力位被置起。
        has_tilt = number(attributes.get('current_tilt_position')) is not None or bool(features & 240)
        # 没有叶片能力时只需不打断正在运行的帘：位置指令照常放行。
        if not has_tilt:
            if state.get('state') in ('opening', 'closing'):
                raise HTTPException(status_code=409, detail='窗帘正在运行，请停止后再调整叶片。')
            return None
        # 有叶片能力时，只有整体确实 closed 且实际行程为 0 才允许调叶片 ——
        # 帘体未合拢时调叶片会与行程电机抢状态，HA 侧结果不确定。
        if state.get('state') != 'closed' or (
            attributes.get('current_position') is not None and number(attributes.get('current_position')) != 0
        ):
            raise HTTPException(status_code=409, detail='只有确认整体完全关闭且停止后，才能调整叶片。')
    return None
