"""天气实体的**只读、有上限**预报读取。

设计约束（与上游 0.8.4 一致）：

- 不订阅、不落盘、不缓存：预报是"看一眼"的数据，缓存只会让用户改完城市仍看到旧天气；
- 条数按类型硬上限（日 16 / 时 168 / 两次日 32）：部分集成会返回上千条，不截断会撑爆组件树；
- 失败统一抛 :class:`HAClientError`：路由层只需把 4xx/5xx 映射成 502，
  不必认识 HA 侧的十几种错误类型。

``supported_features`` 位掩码即 HA 的 ``WeatherEntityFeature``：
``FORECAST_DAILY=1`` / ``FORECAST_HOURLY=2`` / ``FORECAST_TWICE_DAILY=4``。
位没置起来时**不猜**：直接返回 ``status='unsupported'``，由前端隐藏对应标签页。
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

from .client import HAClient, HAClientError
from ....platform.core.ha.ha_errors import forecast_invalid, forecast_missing, forecast_unavailable

#: 预报类型 → HA ``WeatherEntityFeature`` 位。
FORECAST_FEATURES: dict[str, int] = {
    'daily': 1,
    'hourly': 2,
    'twice_daily': 4,
}

#: 预报类型 → 最大返回条数（日 16 天、时 168 小时、两次日 16 天 × 2）。
FORECAST_LIMITS: dict[str, int] = {
    'daily': 16,
    'hourly': 168,
    'twice_daily': 32,
}

#: ``auto``：用实体支持的第一种类型。
AUTO_TYPE = 'auto'


def _text(value: Any, limit: int) -> str:
    """截断字符串；非字符串一律当空串（HA 属性什么类型都可能出现）。"""
    return value[:limit] if isinstance(value, str) else ''


def _number(value: Any) -> float | None:
    """读成有限浮点数；``bool`` 被拒绝（它是 ``int`` 子类），``nan``/``inf`` 也拒绝。"""
    if type(value) not in (int, float):
        return None
    try:
        number = float(value)
    except (ValueError, OverflowError):
        return None
    return number if math.isfinite(number) else None


#: 顶层直接透传的数值字段：`HA 字段名 → 前端契约字段名`。
_FORECAST_NUMBER_FIELDS: tuple[tuple[str, str], ...] = (
    ('temperature', 'temperature'),
    ('templow', 'templow'),
    ('precipitation', 'precipitation'),
    ('wind_speed', 'windSpeed'),
)


def _normalize_row(row: dict) -> dict[str, Any]:
    """一条预报 → 前端契约子集；全空的条目返回空 dict（调用方负责丢弃）。"""
    item: dict[str, Any] = {}
    timestamp = row.get('datetime')
    if isinstance(timestamp, str) and timestamp:
        item['datetime'] = timestamp[:64]
    condition = _text(row.get('condition'), 64) or _text(row.get('skycon'), 64)
    if condition:
        item['condition'] = condition
    for key, field in _FORECAST_NUMBER_FIELDS:
        number = _number(row.get(key))
        if number is not None:
            item[field] = number
    probability = _number(row.get('precipitation_probability'))
    if probability is not None:
        item['precipitationProbability'] = probability
    if type(row.get('is_daytime')) is bool:
        item['isDaytime'] = row['is_daytime']
    return item


def normalize_forecast(rows: list[Any], forecast_type: str) -> list[dict[str, Any]]:
    """把 HA 的预报数组裁剪、归一成前端契约。

    只保留前端真正渲染的字段；``condition`` 与 ``skycon`` 二选一（部分国产集成只给彩云
    ``skycon`` 代码），缺失字段直接省略，避免前端把 ``None`` 画成"0 度"。
    """
    if not isinstance(rows, list):
        raise HAClientError(forecast_invalid())
    limit = FORECAST_LIMITS.get(forecast_type, 0)
    result: list[dict[str, Any]] = []
    for row in rows[:limit]:
        if not isinstance(row, dict):
            continue
        item = _normalize_row(row)
        if item:
            result.append(item)
    return result


def forecast_rows(response: Any, entity_id: str) -> list[Any] | None:
    """从 ``return_response`` 的响应里挖出 ``forecast`` 数组。

    HA 的 REST 形态是 ``{"changed_states": [...], "service_response": {<entity>: {...}}}``，
    经过 HA 代理时外面还会再套一层 ``{"success": true, "data": ...}``。两种都认，
    不能只取顶层：只取顶层会把真实的嵌套响应当成"没有预报"，前端只会看到一句
    「未返回有效的天气预报」，排起来毫无线索。
    """
    node: Any = response
    for key in ('data', 'service_response'):
        if isinstance(node, dict) and isinstance(node.get(key), dict):
            node = node[key]
    if isinstance(node, dict) and isinstance(node.get(entity_id), dict):
        node = node[entity_id]
    rows = node.get('forecast') if isinstance(node, dict) else None
    return rows if isinstance(rows, list) else None


async def read_weather_forecast(
    client: HAClient,
    entity_id: str,
    requested_type: str,
) -> dict[str, Any]:
    """读取一条天气实体的预报，返回可直接 JSON 化的字典。

    先读一次状态再调服务，是刻意的顺序：``weather.get_forecasts`` 的 ``type`` 必须属于
    实体声明支持的类型，否则 HA 回 400。先读能力位可以把"不支持"降级成前端空状态，
    而不是一条 502 报错。
    """
    states = await client.fetch_states({entity_id})
    state = next((item for item in states if item.get('entity_id') == entity_id), None)
    if state is None:
        raise HAClientError(forecast_missing())

    attributes = state.get('attributes') or {}
    if not isinstance(attributes, dict):
        raise HAClientError(forecast_invalid())

    raw_flags = attributes.get('supported_features')
    flags = raw_flags if type(raw_flags) is int and raw_flags >= 0 else 0
    supported = [kind for kind, bit in FORECAST_FEATURES.items() if flags & bit]

    selected = (supported[0] if supported else None) if requested_type == AUTO_TYPE else requested_type
    fetched_at = datetime.now(UTC).isoformat()
    payload: dict[str, Any] = {
        'entityId': entity_id,
        'type': selected,
        'supportedTypes': supported,
        'status': 'unsupported',
        'forecast': [],
        'city': _text(attributes.get('friendly_name'), 128) or entity_id,
        'condition': _text(state.get('state'), 64),
        'temperatureUnit': _text(attributes.get('temperature_unit'), 16) or '°C',
        'precipitationUnit': _text(attributes.get('precipitation_unit'), 16) or 'mm',
        # 风速单位没有通用默认值（m/s 与 km/h 差 3.6 倍），未声明就留空让前端省略。
        'windSpeedUnit': _text(attributes.get('wind_speed_unit'), 16),
        # 三类"一句话文案"：国产集成（彩云/和风）只给 keypoint/minutely，官方集成给 hourly。
        'hint': _text(attributes.get('forecast_keypoint'), 256),
        'summary': _text(attributes.get('forecast_minutely'), 256)
        or _text(attributes.get('forecast_hourly'), 256),
        'attribution': _text(attributes.get('attribution'), 256),
        'updatedAt': _text(state.get('last_updated'), 64),
        'fetchedAt': fetched_at,
        'readAt': fetched_at,
    }
    temperature = _number(attributes.get('temperature'))
    if temperature is not None:
        payload['temperature'] = temperature
    if payload['condition'] in ('', 'unknown', 'unavailable'):
        payload['status'] = 'unavailable'
        payload['available'] = False
        return payload

    if selected is None or selected not in supported:
        return payload

    response = await client.call_service(
        'weather',
        'get_forecasts',
        entity_id,
        {'type': selected},
        return_response=True,
    )
    rows = forecast_rows(response, entity_id)
    if rows is None:
        raise HAClientError(forecast_unavailable())

    payload['forecast'] = normalize_forecast(rows, selected)
    payload['status'] = 'ok' if payload['forecast'] else 'empty'
    # ``today`` 必须按**预报自身时区**生成：HA 的 datetime 带 +08:00，用 UTC 算"今天"
    # 会让凌晨的预报错位一天，前端就会把昨天标成"今天"。
    first_datetime = payload['forecast'][0].get('datetime') if payload['forecast'] else None
    if isinstance(first_datetime, str):
        try:
            payload['today'] = datetime.now(datetime.fromisoformat(first_datetime).tzinfo).isoformat()
        except ValueError:
            pass
    return payload
