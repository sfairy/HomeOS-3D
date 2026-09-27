"""空气净化器与附加实体的命令白名单。

两类调用共用一张域→能力表：净化器本身的 supported_features 决定它支持哪些动作
（oscillate / direction / preset_mode / percentage），附加实体则按域决定能下什么命令。
前端的按钮就是照这张表渲染的，后端在这里复核一次 —— 前端可以骗人，HA 不会。

另有 require_purifier_model：配置侧确认控件绑定的净化器模型此刻仍在场景中，
与 climate.py 的 require_air_conditioner_model 同一职责。
"""
from __future__ import annotations

import math

from fastapi import HTTPException

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


def _finite_number(value) -> bool:
    """有限实数；bool 是 int 的子类必须排除，否则 True 会被当成 1 通过。"""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_extra_command(extra: dict, domain: str, service: str, data, state) -> None:
    """复核发往附加实体的命令。

    异常:
        HTTPException: 422 实体类型与配置不符 / 操作或参数不支持；409 实体当前不可用。
    """
    kind = EXTRA_TYPES.get(domain, "state")
    # 配置里记的实体域必须和本次调用的域一致：对不上说明前端拿错了绑定。
    # 'state' 类实体（sensor / binary_sensor）根本不接受命令，直接拒。
    if (extra and extra.get("entityId", "").split(".")[0] != domain) or kind == "state":
        raise HTTPException(422, detail="此实体不支持配置的控制类型。")
    if state and (
        state.get("available") is False
        or state.get("state") in (None, "", "unknown", "unavailable")
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
    # 这里先拦一道，避免设备端报错后前端只看到一个笼统的失败）。
    if kind == "number" and service == "set_value" and set(data) == {"value"}:
        value, low, high, step = (
            data["value"],
            attrs.get("min"),
            attrs.get("max"),
            attrs.get("step", 1),
        )
        if all(_finite_number(candidate) for candidate in (value, low, high, step)) and step > 0:
            if low <= value <= high and abs((value - low) / step - round((value - low) / step)) < 1e-5:
                return
    raise HTTPException(422, detail="附加实体不支持此操作或参数。")


#: 可作为「空气净化器」绑定的场景模型类型。
#:
#: 素材库里净化器有两副外观，HA 侧都是 fan 域（能力位与面板完全同形），因此两者都可绑：
#:   - ``airpurifier``：空气净化器本体；
#:   - ``freshair``：新风机，按需求算作净化器的一种。
#: 前端有三处同源白名单 —— ``config-editor.js`` 的 ``sceneModelTypes()``（模型选择器）、
#: ``binding-collectors.js`` 的 ``collectClimateBindings()``（运行时绑定）与本表。三者必须
#: 一起改：选择器漏一个 → 配不上；绑定漏一个 → 配得上但 modelAvailable 恒为 false（不报错）；
#: 本表漏一个 → 配置与画面都对，命令却 409「模型已失联」。
PURIFIER_MODEL_TYPES = frozenset({'airpurifier', 'freshair'})


def require_purifier_model(bindings: list, entity_id: str, scene: dict) -> None:
    """确认实体绑定的空气净化器模型仍唯一存在于场景中。

    与空调的 ``require_air_conditioner_model`` 同形（楼层存在、模型 ID 在该楼层唯一、
    类型正确），只有可接受的类型不同：净化器在场景里是 ``airpurifier`` 或 ``freshair``，
    **不是**空调的 wallac / floorac / airoutlet。这两者绝不能互相借用 —— 拿空调那一套
    来查净化器，每一台净化器都会被判成「模型已失联」，附加功能整个不可用且浏览器里不报错。

    异常:
        HTTPException: 409，找不到合法绑定（模型被删或类型变了）。
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
            return None
    raise HTTPException(409, detail='空气净化器模型已失联，请在环境配置中重新选择模型。')


def validate_purifier_command(service: str, data, state) -> None:
    """复核发往空气净化器本身的命令。

    异常:
        HTTPException: 409 净化器当前不可用；422 操作或参数不支持。
    """
    if state and (
        state.get("available") is False or state.get("state") not in ("on", "off")
    ):
        raise HTTPException(409, detail="空气净化器当前不可用。")
    attrs = state.get("attributes") or {}
    features = attrs.get("supported_features", 0)
    # 位掩码必须是真正的整数：上报成字符串时按 0 处理，让「不确定」表现为「不支持」，
    # 而不是让 & 在字符串上抛 TypeError。
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
    # 预设模式：bit 3（PRESET_MODE）；没上报 supported_features 时退化为「选项表里有就放行」。
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
        if _finite_number(value) and 0 <= value <= 100:
            if "supported_features" in attrs:
                if features & 1:
                    return
            elif attrs.get("percentage") is not None:
                return
    raise HTTPException(422, detail="空气净化器不支持此操作或参数。")
