"""绑定弹窗里的「列表 / 预报 / 更新」类附加卡校验。

``calendar`` / ``todo`` / ``weather`` / ``update`` 四个域的服务面都不大，但每个域
的能力位与字段组合各不相同。这里按域拆开写，共用两个判定：

- ``when``：ISO 日期 / 日期时间必须是**同一类型**且可解析；
- ``interval``：结束时间必须晚于开始时间，超大范围要求分段读取。

所有"能力位"都取 HA 原生位域（``supported_features``），不自行发明能力表。
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, NoReturn

from fastapi import HTTPException

from .capabilities import attributes_of, feature_flags

#: 本校验器负责的域。
LIST_DOMAINS = frozenset({'todo', 'update', 'weather', 'calendar'})

#: 日历能力位。
CALENDAR_FEATURES = {'create_event': 1, 'delete_event': 2, 'update_event': 4}
#: 待办能力位。
TODO_FEATURES = {
    'add_item': 1,
    'remove_item': 2,
    'update_item': 4,
    'move_item': 8,
    'remove_completed_items': 2,
}
#: 待办字段能力位：截止日期 / 截止日期时间 / 描述。
TODO_FIELD_FEATURES = {'due_date': 16, 'due_datetime': 32, 'description': 64}
#: 天气预报能力位。
WEATHER_FORECAST_FEATURES = {'daily': 1, 'hourly': 2, 'twice_daily': 4}
#: 更新实体能力位。
UPDATE_INSTALL = 1
UPDATE_SPECIFIC_VERSION = 2
UPDATE_BACKUP = 8
UPDATE_RELEASE_NOTES = 16

#: ``list_events`` 单次最多读 93 天（三个月），超出要求分段。
CALENDAR_READ_LIMIT_DAYS = 93
#: 文本上限（与 HA 校验口径一致）。
UID_LIMIT = 512
SUMMARY_LIMIT = 1024
ITEM_LIMIT = 2048
VERSION_LIMIT = 128
#: 待办状态枚举。
TODO_STATUSES = frozenset({'completed', 'needs_action'})


def _fail(message: str = '列表操作或参数无效。') -> NoReturn:
    raise HTTPException(422, detail=message)


def _text(value: Any, limit: int) -> bool:
    return isinstance(value, str) and len(value) <= limit


def _when(value: Any) -> date | datetime:
    """解析 ISO 日期或日期时间；两者形状不同，不能互相比较。

    日期时间必须带时区（``Z`` / ``+08:00`` 等）：HA 的服务参数一律按绝对时刻
    比较，裸时间会在不同楼层 / 浏览器时区下漂移，所以这里直接拒绝。
    """
    if not isinstance(value, str):
        _fail('日期时间格式无效。')
    try:
        parsed = (
            datetime.fromisoformat(value)
            if 'T' in value
            else date.fromisoformat(value)
        )
    except (ValueError, TypeError):
        raise HTTPException(422, detail='日期时间格式无效。') from None
    if isinstance(parsed, datetime) and parsed.tzinfo is None:
        _fail('日期时间必须包含时区。')
    return parsed


def _interval(start: Any, end: Any, limit_days: int = 0) -> None:
    """结束必须晚于开始；给了 ``limit_days`` 就限制单次跨度。"""
    first, last = _when(start), _when(end)
    # 日期与日期时间形状不同，不能互相比较。``_when`` 保证两者只在「都有时间」或
    # 「都只有日期」时才是同一种类型，但 ``type(a) is not type(b)`` 收窄不了联合类型，
    # 故按分支显式判断，静态检查才能在相减时看到同一个类型。
    if isinstance(first, datetime) and isinstance(last, datetime):
        span = last - first
    elif isinstance(first, datetime) or isinstance(last, datetime):
        _fail('结束时间必须晚于开始时间。')
        return
    else:
        span = last - first
    if span <= timedelta(0):
        _fail('结束时间必须晚于开始时间。')
    if limit_days and span.days > limit_days:
        _fail('读取范围过大，请分段读取。')


def _validate_calendar(service: str, data: dict, flags: int) -> None:
    if service == 'list_events':
        if set(data) != {'start', 'end'}:
            _fail()
        _interval(data['start'], data['end'], CALENDAR_READ_LIMIT_DAYS)
        return
    bit = CALENDAR_FEATURES.get(service)
    if not bit or not flags & bit:
        _fail('此日历不支持该编辑功能。')
    if service == 'delete_event':
        if set(data) - {'uid', 'recurrence_id', 'recurrence_range'} or not _text(
            data.get('uid'), UID_LIMIT
        ):
            _fail()
        for key in ('recurrence_id', 'recurrence_range'):
            if key in data and not isinstance(data[key], str):
                _fail()
        return
    allowed = (
        {'summary', 'end_date', 'location', 'start_date', 'description', 'end_date_time', 'start_date_time'}
        if service == 'create_event'
        else {'uid', 'event', 'recurrence_id', 'recurrence_range'}
    )
    if set(data) - allowed:
        _fail()
    event = data if service == 'create_event' else data.get('event', {})
    if not isinstance(event, dict) or not _text(event.get('summary'), SUMMARY_LIMIT):
        _fail('请填写日程标题。')
    if service == 'update_event':
        if not _text(data.get('uid'), UID_LIMIT) or set(event) - {
            'end',
            'start',
            'summary',
            'location',
            'description',
        }:
            _fail()
        _interval(event.get('start'), event.get('end'))
    else:
        timed = 'start_date_time' in event
        if timed and ('start_date' in event or 'end_date' in event):
            _fail()
        _interval(
            event.get('start_date_time' if timed else 'start_date'),
            event.get('end_date_time' if timed else 'end_date'),
        )
    for key in ('description', 'location'):
        if key in event and not isinstance(event[key], str):
            _fail()


def _validate_todo(service: str, data: dict, flags: int) -> None:
    if service == 'get_items':
        if not data:
            return
        if (
            set(data) == {'status'}
            and isinstance(data['status'], list)
            and all(item in TODO_STATUSES for item in data['status'])
        ):
            return
        _fail()
    bit = TODO_FEATURES.get(service)
    if not bit or not flags & bit:
        _fail('此待办列表不支持该编辑功能。')
    if service == 'remove_completed_items':
        if data:
            _fail()
        return
    if service == 'move_item':
        if (
            set(data) - {'uid', 'previous_uid'}
            or not _text(data.get('uid'), UID_LIMIT)
            or ('previous_uid' in data and not _text(data['previous_uid'], UID_LIMIT))
        ):
            _fail()
        return
    if service == 'remove_item':
        if set(data) != {'item'} or not _text(data.get('item'), ITEM_LIMIT):
            _fail()
        return
    allowed = {'item', 'rename', 'status', 'due_date', 'description', 'due_datetime'}
    if set(data) - allowed or not _text(data.get('item'), ITEM_LIMIT):
        _fail()
    if 'status' in data and (
        not isinstance(data['status'], str) or data['status'] not in TODO_STATUSES
    ):
        _fail()
    if 'rename' in data and not _text(data['rename'], ITEM_LIMIT):
        _fail()
    if 'due_date' in data and 'due_datetime' in data:
        _fail()
    for key, bit_value in TODO_FIELD_FEATURES.items():
        if key not in data:
            continue
        if not flags & bit_value:
            _fail('此待办列表未提供该字段的编辑能力。')
        if key in ('due_date', 'due_datetime'):
            _when(data[key])
        elif not isinstance(data[key], str):
            _fail()


def _validate_weather(service: str, data: dict, flags: int) -> None:
    if (
        service == 'get_forecasts'
        and set(data) == {'type'}
        and isinstance(data['type'], str)
        and flags & WEATHER_FORECAST_FEATURES.get(data['type'], 0)
    ):
        return
    _fail()


def _validate_update(service: str, data: dict, flags: int, attrs: dict) -> None:
    if service == 'release_notes':
        if flags & UPDATE_RELEASE_NOTES and not data:
            return
        _fail()
    if service in ('skip', 'clear_skipped'):
        if not data:
            return
        _fail()
    if service == 'install' and flags & UPDATE_INSTALL:
        if set(data) - {'version', 'backup'}:
            _fail()
        if attrs.get('in_progress'):
            _fail('更新正在进行。')
        if 'version' in data and (
            not flags & UPDATE_SPECIFIC_VERSION or not _text(data['version'], VERSION_LIMIT)
        ):
            _fail()
        if 'backup' in data and (
            not flags & UPDATE_BACKUP or type(data['backup']) is not bool
        ):
            _fail()
        return
    _fail()


def validate_list_extra(domain: str, service: str, data: Any, state: Any) -> None:
    """校验 ``calendar`` / ``todo`` / ``weather`` / ``update`` 的附加命令。"""
    if domain not in LIST_DOMAINS or not isinstance(data, dict):
        _fail()
    attrs = attributes_of(state)
    flags = feature_flags(attrs)
    if domain == 'calendar':
        _validate_calendar(service, data, flags)
    elif domain == 'todo':
        _validate_todo(service, data, flags)
    elif domain == 'weather':
        _validate_weather(service, data, flags)
    else:
        _validate_update(service, data, flags, attrs)
