"""多设备实体（``extraDevices``）的成员校验：一台"主设备" + 若干来源设备。

场景：一个媒体中心控件要同时操作电视、功放、游戏机。主实体仍然只允许一个
（``deviceId``），其它来源设备的实体挂在 ``extraControls`` 上，用 ``sourceDeviceId``
指回来源。这样「主设备状态」与「来源设备指令」在数据结构上就是分开的，UI 不必猜。

两条必须守住的边界：

1. ``extraDevices`` 只能是 ``{deviceId, deviceName}`` —— 多出来的字段（尤其是指令字段）
   会绕过主设备的能力校验，所以白名单外的键一律拒绝；
2. 同一个实体不能既是主实体、又出现在某个来源设备的控制里 —— 否则一次点击会下发两次，
   而两条路径的乐观状态会互相覆盖。
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, NoReturn

#: 来源设备允许的字段（白名单）。
EXTRA_DEVICE_FIELDS = frozenset({'deviceId', 'deviceName'})

#: 单台设备的来源数量上限。再多是配置错误，不是需求。
MAX_EXTRA_DEVICES = 32

#: 设备 id / 名称长度上限。
MAX_DEVICE_ID = 128
MAX_DEVICE_NAME = 256


def _check_extra_source_entry(source: Any, fail: Callable[[], NoReturn]) -> str:
    """单个来源设备的结构校验，返回它的 ``deviceId``。"""
    if not isinstance(source, dict) or set(source) - EXTRA_DEVICE_FIELDS:
        fail()
    device_id = source.get('deviceId')
    if not isinstance(device_id, str) or not device_id.strip() or len(device_id) > MAX_DEVICE_ID:
        fail()
    name = source.get('deviceName', '')
    if not isinstance(name, str) or len(name) > MAX_DEVICE_NAME:
        fail()
    return device_id


def _validate_extra_sources(item: dict, fail: Callable[[], NoReturn]) -> set[str]:
    """``extraDevices`` 整体校验；返回所有来源设备 id。"""
    sources = item.get('extraDevices', [])
    if not isinstance(sources, list):
        fail()
    if len(sources) > MAX_EXTRA_DEVICES:
        fail()
    ids: set[str] = set()
    for source in sources:
        device_id = _check_extra_source_entry(source, fail)
        # 重复的来源设备、以及「来源就是主设备本身」都只会让配置退化成空操作。
        if device_id in ids or device_id == item.get('deviceId'):
            fail()
        ids.add(device_id)
    return ids


def _foreign_entities(item: dict, ids: set[str], fail: Callable[[], NoReturn]) -> set[str]:
    """``extraControls`` 里被来源设备占用的实体 id 集合。"""
    foreign_entities: set[str] = set()
    for extra in item.get('extraControls', []) or []:
        if not isinstance(extra, dict):
            fail()
        source = extra.get('sourceDeviceId')
        if source is None:
            continue
        if not isinstance(source, str) or source not in ids:
            fail()
        entity_id = extra.get('entityId')
        if isinstance(entity_id, str) and entity_id:
            foreign_entities.add(entity_id)
    return foreign_entities


def _contains_foreign_source(value: Any, foreign_entities: set[str]) -> bool:
    """递归查找「已被某个来源设备占用的实体」是否又出现在主实体位置上。"""
    if isinstance(value, dict):
        for key, nested in value.items():
            if key in ('entityId', 'mainEntityId', 'primaryEntityId') and nested in foreign_entities:
                return True
            if _contains_foreign_source(nested, foreign_entities):
                return True
        return False
    if isinstance(value, list):
        return any(_contains_foreign_source(entry, foreign_entities) for entry in value)
    return False


def validate_extra_sources(item: dict, fail: Callable[[], NoReturn]) -> None:
    """校验 ``item`` 的 ``extraDevices`` / ``extraControls`` 关联关系。

    ``fail`` 由调用方注入：3D 配置的校验失败文案统一由 ``config.py`` 给出，
    本模块只负责结构判定，不重复维护文案。

    ``fail`` 必须标成 ``NoReturn``（``ValidationContext.fail`` 就是这样）：
    类型检查器只有知道「这一支不会继续往下走」，才能把 ``if not isinstance(x, str):
    fail()`` 后面的 ``x`` 窄化成 ``str``；否则下面每个 ``len(x)`` / ``ids.add(x)``
    都得再判一次类型。
    """
    ids = _validate_extra_sources(item, fail)
    foreign_entities = _foreign_entities(item, ids, fail)
    if not foreign_entities:
        return
    # 只检查 ``extraControls`` 之外的字段：来源控制自己当然会引用那些实体。
    for key, value in item.items():
        if key in ('extraControls', 'extraDevices'):
            continue
        if _contains_foreign_source(value, foreign_entities):
            fail()
