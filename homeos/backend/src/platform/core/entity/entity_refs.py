from __future__ import annotations

import re
from typing import Any

_SENSOR_ENTITY_PATTERN = re.compile(r'sensor\.[a-z0-9_]+')
_TIRE_WHEEL_KEYS = ('fl', 'fr', 'rl', 'rr', 'front', 'rear')

def is_virtual_entity_id(value):
    return value.startswith('virtual.')

def _car_tire_entity_ids(component):
    '''车辆卡片的胎压传感器：只有开启胎压的车才计入，避免把隐藏字段也拉进权限范围。'''
    properties = component.get('properties')
    devices = properties.get('devices') if isinstance(properties, dict) else None
    cars = devices.get('cars') if isinstance(devices, dict) else None
    result = set()
    for car in cars if isinstance(cars, list) else []:
        tires = car.get('tirePressure') if isinstance(car, dict) else None
        if not isinstance(tires, dict) or tires.get('enabled') is not True:
            continue
        wheels = tires.get('wheels')
        if not isinstance(wheels, dict):
            continue
        for key in _TIRE_WHEEL_KEYS:
            entity_id = wheels.get(key)
            if isinstance(entity_id, str) and _SENSOR_ENTITY_PATTERN.fullmatch(entity_id):
                result.add(entity_id)
    return result

def document_entity_ids(value):
    '''返回面板文档显式或隐式使用的所有 HA 实体。'''
    result = set()

    def walk(item: Any) -> None:
        if isinstance(item, dict):
            if item.get('type') == 'interaction3d':
                result.update(_car_tire_entity_ids(item))
            if item.get('type') == 'weather':
                sun_id = ((item.get('bindings') or { }).get('sun') or { }).get('entityId')
                result.add(str(sun_id or 'sun.sun'))
            for key, child in item.items():
                normalized_key = str(key).casefold()
                if normalized_key.endswith('entityid') and isinstance(child, str) and '.' in child:
                    if not is_virtual_entity_id(child):
                        result.add(child)
                    continue
                if normalized_key.endswith('entityids') and isinstance(child, list):
                    result.update(
                        str(entity_id)
                        for entity_id in child
                        if isinstance(entity_id, str) and '.' in entity_id and not is_virtual_entity_id(entity_id)
                    )
                    continue
                walk(child)
        elif isinstance(item, list):
            for child in item:
                walk(child)

    walk(value)
    return result
