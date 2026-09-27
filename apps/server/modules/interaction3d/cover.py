"""3D 窗帘控件的模型绑定与 HA 实时能力校验。

与空调模块同一套思路：配置侧确认「普通窗帘模型」仍在场景中，
运行侧用 HA 上报的 supported_features 位掩码核对这次服务调用是否被支持。
梦幻帘（coverKind=dream）额外一条：只有整体完全关闭且静止时才允许调整叶片。
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
# 没有能力位时按状态推断放行，被拒时要说清「为什么推断不出这项能力」，不能让用户以为
# 再等等就会好（「请稍后重试」这种不可自救的提示正是要避免的）。
INFERRED_FEATURE_HINT = {
    'set_cover_position': '设备未上报能力位，且状态里没有位置反馈（current_position），无法确定它支持定位操作，请在 Home Assistant 中确认设备能力。',
    'set_cover_tilt_position': '设备未上报能力位，且状态里没有叶片角度（current_tilt_position），无法确定它支持调整叶片，请在 Home Assistant 中确认设备能力。',
}


def _reported_number(value) -> bool:
    """上报值是否是一个可用的数值（bool / 空串 / 非数字都不算）。

    读 HA **属性**，所以接受数字字符串（集成常把位置上报成 ``"42"``）。
    """
    return as_finite_number(value) is not None


def inferred_cover_features(attributes: dict) -> int:
    """设备**从不**上报 supported_features 时，按它已经上报的状态推断能力位。

    背景：``supported_features`` 是 HA 集成「自愿」上报的，一部分集成（尤其是只暴露基础实体的
    网关）从不给这个字段。修复前凡是读不到能力位就直接 409「窗帘能力尚未载入，请稍后重试。」——
    而这是**永久**条件，不是「稍后就好」：前端会无限重试，用户看到一条永远不消失的提示，且没有任何
    自救办法。

    推断规则刻意保守，只认「设备自己已经报出来的东西」：开 / 关 / 停是 cover 实体天然具备，一律放行
    （HA 侧不支持时会自己报错）；调位置只有上报过 ``current_position`` 才认为支持；调叶片只有上报过
    ``current_tilt_position`` 才认为有叶片。

    「没报过」不等于「不支持」，所以这只是一个不会再放大的下限：真正不支持的操作仍由 HA 拒绝，
    而不会在这里被无限期地挡死。
    """
    features = COVER_SERVICES['open_cover'] | COVER_SERVICES['close_cover'] | COVER_SERVICES['stop_cover']
    if _reported_number(attributes.get('current_position')):
        features |= COVER_SERVICES['set_cover_position']
    if _reported_number(attributes.get('current_tilt_position')):
        features |= COVER_SERVICES['set_cover_tilt_position']
    return features



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
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='窗帘模型已失联，请在环境配置中重新选择普通窗帘模型。')


def validate_cover_command(service: str, data: dict, state: dict | None, *, dream: bool = False) -> None:
    """校验一次窗帘服务调用是否被当前设备能力支持。

    参数:
        service: HA 服务名，必须命中 COVER_SERVICES。
        data: 透传参数，按服务类型要求恰好带 position 或 tilt_position，其余服务必须为空。
        state: 实体的实时状态快照，缺失视为设备不可用。
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
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='3D 窗帘控制不支持此服务或参数。')
    if service in ('set_cover_position', 'set_cover_tilt_position'):
        # 位置只接受 0~100 的整数：bool 是 int 子类须单独排除，浮点与字符串也一律拒绝，
        # 否则 HA 侧按各自规则截断，行程会与用户预期不一致。
        position = data['position'] if service == 'set_cover_position' else data['tilt_position']
        if not isinstance(position, int) or isinstance(position, bool) or not 0 <= position <= 100:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='窗帘位置必须是 0 到 100 的整数。')
    # 状态缺失 / unknown / unavailable 一律按不可用处理，不做乐观转发。
    if not isinstance(state, dict) or state.get('available') is False or state.get('state') in (None, '', 'unknown', 'unavailable'):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='窗帘状态暂不可用，请等待设备重新连接。')
    attributes = state.get('attributes')
    # 区分「真的还没载入」（瞬时状态，值得让前端稍后重试）与「这个设备从不声明能力位」
    # （永久条件，再报 409 只会让前端无限重试）。判据是 attributes 本身在不在：连属性都没有时
    # 无从判断；有属性、只是缺 supported_features，就是设备不给这个字段。
    if not isinstance(attributes, dict):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='窗帘能力尚未载入，请稍后重试。')
    features = attributes.get('supported_features')
    inferred = features is None
    if inferred:
        features = inferred_cover_features(attributes)
    elif not isinstance(features, int) or isinstance(features, bool) or features < 0:
        # 上报了但值不可用（字符串、负数、布尔）同样是永久条件：说清是设备上报的问题，
        # 不要用「请稍后重试」把用户困在重试循环里。
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
        # 中任意一个能力位被置起。
        has_tilt = as_finite_number(attributes.get('current_tilt_position')) is not None or bool(features & 240)
        # 没有独立叶片通道时，这台风帘只有一个可控轴（位置），整体状态门禁一律不设：
        # HA 的 state 可能是长期不刷新的陈旧值（实测客厅那台停在 closing + position 50 数十分钟），
        # 拿它挡在这里会让叶片滑杆被永久禁用（前端同样口径，见 cover-state.js 的 coverCanAdjustBlades）。
        # 命令是否被设备接受由 HA 自己裁决，不在这一层预先否决。
        if not has_tilt:
            return None
        # 有叶片能力时，只有整体确实 closed 且实际行程为 0 才允许调叶片 ——
        # 帘体未合拢时调叶片会与行程电机抢状态，HA 侧结果不确定。
        if state.get('state') != 'closed' or (
            attributes.get('current_position') is not None and as_finite_number(attributes.get('current_position')) != 0
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='只有确认整体完全关闭且停止后，才能调整叶片。')
    return None
