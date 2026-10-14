"""3D 增量配置校验的原语上下文（原为 ``validate_config`` 内的闭包与模块级校验器）。

拆出后各分区校验函数共用同一套语义：``fail`` 抛 422，类型/范围判定逐字保持原实现。
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable
from typing import Any, NoReturn

from fastapi import HTTPException

_GRID_SPANS = {'columns': (1, 2, 3, 4), 'rows': (1, 2)}


def validate_appliance_extras(item, entity, fail):
    extras = item.get('extraControls', [])
    if not isinstance(extras, list) or len(extras) > 12:
        fail()
    extra_ids = set()
    for extra in extras:
        if (
            not isinstance(extra, dict)
            or set(extra) - {'rows', 'type', 'label', 'columns', 'entityId'}
            or not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', str(extra.get('entityId', '')))
        ):
            fail()
        for dimension in ('columns', 'rows'):
            if dimension in extra:
                if type(extra[dimension]) is not int or extra[dimension] not in _GRID_SPANS[dimension]:
                    fail()
        if extra.get('type') not in {'state', 'button', 'number', 'select', 'switch'}:
            fail()
        from .purifier import EXTRA_TYPES

        extra_id = extra['entityId']
        extra_domain = extra_id.split('.')[0]
        if extra['type'] != 'state' and extra['type'] != EXTRA_TYPES.get(extra_domain):
            fail()
        if extra_id in extra_ids or extra_id == entity or not isinstance(extra.get('label', ''), str) or len(extra.get('label', '')) > 120:
            fail()
        extra_ids.add(extra_id)


class ValidationContext:
    """校验原语：与拆分前嵌在 ``validate_config`` 里的闭包等价。

    ``full`` 由 ``validate_config`` 注入自身，供 ``pageBehaviors`` 这类「先归一化再按
    完整契约复校验」的嵌套场景调用；这样分区模块无需反向 import 编排模块，保持单向依赖。
    """

    def __init__(self, full: Callable[[dict], None]) -> None:
        self.full = full

    def fail(self) -> NoReturn:
        raise HTTPException(422, detail='3D 交互配置无效，请检查户型、灯光、环境及图标设置。')

    def number(self, value: Any, low: float, high: float) -> bool:
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            return False
        try:
            return math.isfinite(value) and low <= value <= high
        except OverflowError:
            return False

    def positive_number(self, value: Any) -> bool:
        return self.number(value, 0, math.inf) and value > 0

    def text(self, value: Any, length: int = 128) -> bool:
        return isinstance(value, str) and len(value) <= length

    def validate_camera(self, camera: Any) -> None:
        if camera is None:
            return
        required = {'mode', 'zoom', 'target', 'position'}
        optional = {'up', 'view', 'frameSize', 'focalLength', 'topRotation'}
        if (
            not isinstance(camera, dict)
            or not required.issubset(camera)
            or set(camera) - required - optional
        ):
            self.fail()
        if camera['mode'] not in ('orthographic', 'perspective') or not self.number(
            camera['zoom'], 0.01, 100
        ):
            self.fail()
        for key in ('position', 'target', *(['up'] if 'up' in camera else [])):
            if (
                not isinstance(camera[key], list)
                or len(camera[key]) != 3
                or not all(self.number(v, -10000, 10000) for v in camera[key])
            ):
                self.fail()
        for key, low, high in (
            ('frameSize', 0.001, 20000),
            ('topRotation', 0, 360),
            ('focalLength', 18, 120),
        ):
            if key not in camera:
                continue
            if self.number(camera[key], low, high):
                continue
            self.fail()
        if 'view' in camera and camera['view'] not in ('free', 'top'):
            self.fail()
        return
