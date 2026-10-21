"""从 HA 注册表条目里只读取传感器的显示精度。

设计约束（不要扩展）：这里**只读呈现选项**，绝不把 ``options`` 里的其它内容落库 ——
``options`` 是 HA 各集成的私有配置区，字段语义与生命周期都不归本仓管，一旦整体缓存，
后续 HA 改结构就会变成脏数据。

精度语义：
- HA 用 ``None`` 表示「未设置」，与 ``0``（保留 0 位小数）是两回事，所以不能用 0 兜底；
- 只接受真正的 ``int``。``bool`` 是 ``int`` 的子类，``float``/字符串虽然能被 ``int()``
  吞掉，但它们在 HA 侧不是合法形态，宽松解析会把 ``"2"`` 这类脏数据当成 2 位小数。
"""

from __future__ import annotations

from typing import Any

#: 精度合法区间（与 HA 的前端约束一致；超出即视为脏数据）。
PRECISION_MIN = 0
PRECISION_MAX = 100

#: 只有这个域的实体带显示精度选项。
PRECISION_DOMAIN_PREFIX = 'sensor.'

#: 读取结果：``(display_precision, suggested_display_precision)``，缺省均为 ``None``。
PrecisionPair = tuple[int | None, int | None]


def _valid_precision(value: Any) -> int | None:
    """严格校验一个精度值；``bool`` / ``float`` / 字符串一律作废。

    ``bool`` 要单独拦：它是 ``int`` 的子类，``isinstance(True, int)`` 为真，而 HA 侧
    ``display_precision: true`` 属于脏数据，不能当成 1 位小数。
    """
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if value < PRECISION_MIN or value > PRECISION_MAX:
        return None
    return value


def sensor_display_precision(registry: Any) -> PrecisionPair:
    """从一条 HA 实体注册表记录里取出 ``(显示精度, 建议精度)``。

    ``registry`` 是 ``config/entity_registry/list`` 的单个元素（或同名事件的 ``event_data``）。
    任何一层不符合预期都返回 ``(None, None)``，调用方按「未设置」处理即可，不必区分原因。
    """
    if not isinstance(registry, dict):
        return (None, None)
    options = registry.get('options')
    if not isinstance(options, dict):
        return (None, None)
    sensor_options = options.get('sensor')
    if not isinstance(sensor_options, dict):
        return (None, None)
    if not str(registry.get('entity_id') or '').startswith(PRECISION_DOMAIN_PREFIX):
        return (None, None)
    return (
        _valid_precision(sensor_options.get('display_precision')),
        _valid_precision(sensor_options.get('suggested_display_precision')),
    )


def apply_sensor_display_precision(record: Any, registry: Any) -> None:
    """把精度写进 ``HAEntity`` 记录；``registry`` 为空时不改动已有值。

    注册表事件（``entity_registry_updated``）可能只带 ``Changes`` 而拿不到完整 ``options``，
    这时**必须保留**库里已有的精度：置空会让「HA 改了个名字」顺带把精度清掉。
    """
    if not isinstance(registry, dict) or not isinstance(registry.get('options'), dict):
        return
    display_precision, suggested_precision = sensor_display_precision(registry)
    record.display_precision = display_precision
    record.suggested_display_precision = suggested_precision
