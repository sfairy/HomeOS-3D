"""配置数值收口：把任意来源（JSON 配置 / 查询串 / 表单）的数值解析成确定的整数。

这些值来自 ``app_config``（JSON）与请求参数，同一语义在多个域里被重复实现过
（``domains.alerts.channels`` 与 ``domains.security.config`` 各有一份通知拉取条数
clamp）。收在一处后，非数值/非正数/非有限数的处理只有一种口径。
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

#: 通知列表默认拉取条数（前端未配置时）。
DEFAULT_REMOTE_NOTIFICATION_LIMIT = 100
#: 通知存储默认上限（本地未配置时）。
DEFAULT_NOTIFICATION_STORAGE_CAP = 500


def positive_int(raw_value: Any) -> int | None:
    """可解析为有限数值且 > 0 时返回其整数部分，否则返回 ``None``。

    拒绝 ``None`` / 空串 / 非数字串 / 非正数 / ``NaN`` / ``±inf``：这些值若直接交给
    ``int()`` 会抛 ``ValueError`` / ``OverflowError``，进而在请求路径上变成 500。
    """
    candidate = raw_value.strip() if isinstance(raw_value, str) else raw_value
    try:
        parsed = float(candidate)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(parsed) or parsed <= 0:
        return None
    return int(parsed)


def positive_number(raw_value: Any) -> int | float | None:
    """有限且 > 0 时返回原值（``int`` 仍是 ``int``），否则返回 ``None``。

    保留原类型的理由：这些值会被写回配置并序列化，``2000`` 被顺手转成 ``2000.0``
    会改变前端的取值形状。``bool`` 是 ``int`` 的子类，需显式排除。
    """
    if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float)):
        return None
    if not math.isfinite(raw_value) or raw_value <= 0:
        return None
    return raw_value


def resolve_notification_fetch_limit(
    limit: Any,
    frontend: Mapping[str, Any] | None,
    notification: Mapping[str, Any] | None,
) -> int:
    """通知列表 API 的安全拉取条数。

    ``limit`` 来自请求参数，另外两个是 ``frontend`` / ``notification`` 配置分区（可为 None，
    用于「配置尚未加载」的调用点）。口径：请求值非法则回落到配置默认拉取条数，最后统一夹到
    ``[1, maxNotifications]``，避免调用方用超大 limit 把上游拉空。
    """
    frontend_config = frontend or {}
    notification_config = notification or {}
    default_fetch = (
        positive_int(frontend_config.get("maxRemoteNotifications"))
        or DEFAULT_REMOTE_NOTIFICATION_LIMIT
    )
    storage_cap = (
        positive_int(notification_config.get("maxNotifications"))
        or DEFAULT_NOTIFICATION_STORAGE_CAP
    )
    parsed_limit = positive_int(limit) or default_fetch
    return min(max(parsed_limit, 1), storage_cap)


__all__ = [
    "DEFAULT_NOTIFICATION_STORAGE_CAP",
    "DEFAULT_REMOTE_NOTIFICATION_LIMIT",
    "positive_int",
    "positive_number",
    "resolve_notification_fetch_limit",
]
