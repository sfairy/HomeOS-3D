"""空气净化器与附加实体的命令白名单。
"""
from __future__ import annotations

from fastapi import HTTPException

from .numbers import as_finite_number

# 域 -> 附加实体支持的控制类型。'state' 表示只读：能显示状态，不能下命令。
EXTRA_TYPES: dict[str, str] = {
    "switch": "switch",
    "input_boolean": "switch",
    "light": "switch",
    "select": "select",
    "input_select": "select",
    "number": "number",
    "input_number": "number",
    "button": "button",
    "input_button": "button",
    "sensor": "state",
    "binary_sensor": "state",
}


def validate_extra_command(extra: dict, domain: str, service: str, data, state) -> None:
    """复核发往附加实体的命令。
    """
    kind = EXTRA_TYPES.get(domain, "state")
    # 配置里记的实体域必须和本次调用的域一致：对不上说明前端拿错了绑定。
    if (extra and extra.get("entityId", "").split(".")[0] != domain) or kind == "state":
        raise HTTPException(422, detail="此实体不支持配置的控制类型。")
    # 与 lock/climate/cover 同一口径：state 为 None / 非 dict / 空映射时直接 409，
    # 不做乐观转发（StateHub 首轮同步前、HA 重连期都可能拿到空状态）。
    if not isinstance(state, dict) or state.get("available") is False or state.get("state") in (
        None,
        "",
        "unknown",
        "unavailable",
    ):
        raise HTTPException(409, detail="附加实体当前不可用。")
    attrs = state.get("attributes") or {}
    # 开关类：turn_on / turn_off 不带参数。
    if kind == "switch" and service in ("turn_on", "turn_off") and not data:
        return
    # 按钮类：press 不带参数。
    if kind == "button" and service == "press" and not data:
        return
    # 下拉类：选项必须在设备上报的 options 里，防止写入设备不认识的值。
    if kind == "select" and service == "select_option" and set(data) == {"option"}:
        if data["option"] in (attrs.get("options") or []):
            return
    # 数值类：必须落在 min~max 且与 step 对齐（HA 的 number 集成对步长是强校验的，
    if kind == "number" and service == "set_value" and set(data) == {"value"}:
        value, low, high, step = (
            data["value"],
            attrs.get("min"),
            attrs.get("max"),
            attrs.get("step", 1),
        )
        if all(as_finite_number(candidate, from_text=False) is not None for candidate in (value, low, high, step)) and step > 0:
            if low <= value <= high and abs((value - low) / step - round((value - low) / step)) < 1e-5:
                return
    raise HTTPException(422, detail="附加实体不支持此操作或参数。")


#: 可作为「空气净化器」绑定的场景模型类型。
PURIFIER_MODEL_TYPES = frozenset({'airpurifier', 'freshair'})


def require_purifier_model(bindings: list, entity_id: str, scene: dict) -> None:
    """确认实体绑定的空气净化器模型仍唯一存在于场景中。
    """
    floors = scene.get('floors', [])
    for binding in bindings:
        if binding.get('entityId') != entity_id:
            continue
        floor = next((item for item in floors if item.get('id') == binding.get('floorId')), None)
        if floor is None:
            continue
        # 同 ID 的模型必须恰好一个：出现重复时无法确定控制哪一台，宁可不放行。
        models = [item for item in floor.get('scene', {}).get('items', []) if item.get('id') == binding.get('modelId')]
        if len(models) == 1 and models[0].get('type') in PURIFIER_MODEL_TYPES:
            return
    raise HTTPException(409, detail='空气净化器模型已失联，请在环境配置中重新选择模型。')


def validate_purifier_command(service: str, data, state) -> None:
    """复核发往空气净化器本身的命令。
    """
    if not isinstance(state, dict) or state.get("available") is False or state.get("state") not in ("on", "off"):
        raise HTTPException(409, detail="空气净化器当前不可用。")
    attrs = state.get("attributes") or {}
    features = attrs.get("supported_features", 0)
    # 位掩码必须是真正的整数：上报成字符串时按 0 处理，让「不确定」表现为「不支持」，
    features = features if isinstance(features, int) else 0
    # 摆动：bit 1（OSCILLATE）。
    if (
        service == "oscillate"
        and set(data) == {"oscillating"}
        and isinstance(data["oscillating"], bool)
        and features & 2
    ):
        return
    # 风向前后吹：bit 2（DIRECTION）。
    if (
        service == "set_direction"
        and set(data) == {"direction"}
        and data["direction"] in ("forward", "reverse")
        and features & 4
    ):
        return
    if service in ("turn_on", "turn_off") and not data:
        return
    if (
        service == "set_preset_mode"
        and ("supported_features" not in attrs or features & 8)
        and set(data) == {"preset_mode"}
        and data["preset_mode"] in (attrs.get("preset_modes") or [])
    ):
        return
    # 风速百分比：bit 0（PERCENTAGE）；没上报能力位时看设备是否给过 percentage 属性。
    if service == "set_percentage" and set(data) == {"percentage"}:
        value = data["percentage"]
        if as_finite_number(value, from_text=False) is not None and 0 <= value <= 100:
            if "supported_features" in attrs:
                if features & 1:
                    return
            elif attrs.get("percentage") is not None:
                return
    raise HTTPException(422, detail="空气净化器不支持此操作或参数。")
