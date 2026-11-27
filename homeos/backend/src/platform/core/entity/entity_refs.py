from __future__ import annotations

import re
from typing import Any

_SENSOR_ENTITY_PATTERN = re.compile(r"sensor\.[a-z0-9_]+")
_TIRE_WHEEL_KEYS = ("fl", "fr", "rl", "rr", "front", "rear")


def is_virtual_entity_id(value):
    return value.startswith("virtual.")


def _car_tire_entity_ids(component):
    """车辆卡片的胎压传感器：只有开启胎压的车才计入，避免把隐藏字段也拉进权限范围。"""
    properties = component.get("properties")
    devices = properties.get("devices") if isinstance(properties, dict) else None
    cars = devices.get("cars") if isinstance(devices, dict) else None
    result = set()
    for car in cars if isinstance(cars, list) else []:
        tires = car.get("tirePressure") if isinstance(car, dict) else None
        if not isinstance(tires, dict) or tires.get("enabled") is not True:
            continue
        wheels = tires.get("wheels")
        if not isinstance(wheels, dict):
            continue
        for key in _TIRE_WHEEL_KEYS:
            entity_id = wheels.get(key)
            if isinstance(entity_id, str) and _SENSOR_ENTITY_PATTERN.fullmatch(entity_id):
                result.add(entity_id)
    return result


def document_entity_ids(value):
    """返回面板文档显式或隐式使用的所有 HA 实体。"""
    result = set()

    def walk(item: Any) -> None:
        if isinstance(item, dict):
            if item.get("type") == "interaction3d":
                result.update(_car_tire_entity_ids(item))
            if item.get("type") == "weather":
                sun_id = ((item.get("bindings") or {}).get("sun") or {}).get("entityId")
                result.add(str(sun_id or "sun.sun"))
            for key, child in item.items():
                normalized_key = str(key).casefold()
                if normalized_key.endswith("entityid") and isinstance(child, str) and "." in child:
                    if not is_virtual_entity_id(child):
                        result.add(child)
                    continue
                if normalized_key.endswith("entityids") and isinstance(child, list):
                    result.update(
                        str(entity_id)
                        for entity_id in child
                        if isinstance(entity_id, str) and "." in entity_id and not is_virtual_entity_id(entity_id)
                    )
                    continue
                walk(child)
        elif isinstance(item, list):
            for child in item:
                walk(child)

    walk(value)
    return result


#: 只读用途的绑定键（车辆在家/离家的位置、门磁、胎压等只用于「显示」）。
#: 其余（主实体、开关、控制类）一律算控制用途 —— 授权按最大范围发放，
#: 少算一条会让用户在点了按钮之后才收到 403。
_READ_ONLY_KEYS = frozenset(
    {
        "presenceentityid",
        "openingentityid",
        "tirepressure",
        "doorentityid",
        "dooropenentityid",
        "doorcloseentityid",
        "doorevententityid",
        "batteryentityid",
        "battery2entityid",
        "lowbatteryentityid",
        "tamperentityid",
        "animationentityid",
        "contactentityid",
        "temperatureentityid",
        "humidityentityid",
    }
)


def document_entity_references(value):
    """把面板文档引用的实体分成 ``(read_only, for_control)`` 两组（0.9.0）。

    与 :func:`document_entity_ids` 的区别只在**分组**，条目集合完全一致：

    - ``read_only``：只用于显示的绑定（在家/离家、开合状态、胎压、门磁、电量…）。
      允许只读授权的账户查看，但不能据此下发指令；
    - ``for_control``：需要下发指令的实体（主实体、开关、媒体、灯光…）。

    两个集合**可能重叠**（同一个实体既用于显示也用于控制）—— 那种情况下按控制处理，
    所以 ``for_control`` 会从 ``read_only`` 里移除自己，避免授权判定出现歧义。
    """
    read_only: set[str] = set()
    for_control: set[str] = set()

    def record(entity_id: str, read_only_hint: bool) -> None:
        if is_virtual_entity_id(entity_id):
            return
        (read_only if read_only_hint else for_control).add(entity_id)

    def walk(item: Any, read_only_hint: bool) -> None:
        if isinstance(item, dict):
            # 胎压轮位属于只读：只有开启胎压的车才计入（与 document_entity_ids 同口径）。
            item.get("type") == "interaction3d" and read_only.update(_car_tire_entity_ids(item))
            if item.get("type") == "weather":
                sun_id = ((item.get("bindings") or {}).get("sun") or {}).get("entityId")
                record(str(sun_id or "sun.sun"), True)
            for key, child in item.items():
                normalized_key = str(key).casefold()
                if normalized_key.endswith("entityid") and isinstance(child, str) and "." in child:
                    record(child, normalized_key in _READ_ONLY_KEYS)
                    continue
                if normalized_key.endswith("entityids") and isinstance(child, list):
                    for entity_id in child:
                        isinstance(entity_id, str) and "." in entity_id and record(
                            entity_id, normalized_key in _READ_ONLY_KEYS
                        )
                    continue
                walk(child, read_only_hint or normalized_key in _READ_ONLY_KEYS)
        elif isinstance(item, list):
            for child in item:
                walk(child, read_only_hint)

    walk(value, False)
    return read_only - for_control, for_control
