"""通知统计与行映射工具（对齐 ``modules/notification/stats.util.ts``）。

SQLite 适配：无 ``date_trunc``，按 ``substr(createdAt, 1, 13|10)`` 分桶（列为 ISO 文本），
与 ``EventLogService`` 的既有口径一致。
"""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, or_
from sqlalchemy.sql.elements import ColumnElement

from ..alerts.sources import (
    NotificationSourceDbFilter,
    build_notification_source_db_filter,
    normalize_notification_source,
)

ALERT_LEVELS = ("info", "warn", "danger")


def parse_json_array(raw: Any) -> list[Any]:
    """解析 JSON 数组文本；失败或非数组时返回空数组（对齐 ``parseJsonArray``）。"""
    if isinstance(raw, list):
        return raw
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


def iso_or_none(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def map_notification_row(row: Any) -> dict[str, Any]:
    """将数据库行映射为对外暴露的通知视图。

    对齐 JS ``undefined`` 序列化语义：``entityId`` / ``deliveredAt`` 为空时省略该键；
    键序对齐 ``mapNotificationRow``。
    """
    delivery_channels = [
        str(item) for item in parse_json_array(getattr(row, "delivery_channels", None))
    ]
    payload: dict[str, Any] = {
        "id": row.id,
        "level": row.level,
        "message": row.message,
    }
    if row.entity_id:
        payload["entityId"] = row.entity_id
    payload["source"] = row.source
    payload["read"] = bool(row.read)
    payload["createdAt"] = iso_or_none(row.created_at)
    delivered_at = iso_or_none(row.delivered_at)
    if delivered_at:
        payload["deliveredAt"] = delivered_at
    payload["deliveryChannels"] = delivery_channels
    return payload


def resolve_notification_time_granularity(window_hours: int) -> str:
    """48 小时以内按小时聚合，超过则按天聚合。"""
    return "hour" if window_hours <= 48 else "day"


def clamp_notification_stats_hours(hours: Any, fallback: int = 24) -> int:
    """将统计时间窗口 clamp 到 1-720 小时；非法输入回退 fallback。"""
    try:
        value = int(float(hours))
    except (TypeError, ValueError):
        return fallback
    if value <= 0:
        return fallback
    return min(max(value, 1), 720)


def build_notification_source_conditions(
    filter_key: str,
) -> ColumnElement[bool] | None:
    """把 source 过滤键转换为 SQLAlchemy where 条件（对齐 ``prismaNotificationSourceWhere``）。"""
    from ...core.models import Notification

    spec: NotificationSourceDbFilter | None = build_notification_source_db_filter(filter_key)
    if not spec:
        return None
    kind = spec.get("kind")
    if kind == "exact":
        return Notification.source == spec.get("value")
    if kind == "startsWith":
        return Notification.source.startswith(str(spec.get("value") or ""))
    if kind == "or":
        clauses: list[ColumnElement[bool]] = []
        for clause in spec.get("clauses") or []:
            if clause.get("exact") is not None:
                clauses.append(Notification.source == clause["exact"])
            elif clause.get("startsWith") is not None:
                clauses.append(Notification.source.startswith(clause["startsWith"]))
            else:
                clauses.append(Notification.source == "__invalid__")
        return or_(*clauses) if clauses else None
    return None


def combine_conditions(*conditions: ColumnElement[bool] | None) -> ColumnElement[bool] | None:
    present = [condition for condition in conditions if condition is not None]
    if not present:
        return None
    if len(present) == 1:
        return present[0]
    return and_(*present)


def _round_half_up(value: float, digits: int = 1) -> float:
    factor = 10**digits
    return math.floor(value * factor + 0.5) / factor


def _parse_bucket_key(bucket_key: Any, granularity: str) -> int | None:
    if not bucket_key:
        return None
    text = str(bucket_key)
    try:
        if granularity == "hour":
            parsed = datetime.strptime(text[:13], "%Y-%m-%d %H")
        else:
            parsed = datetime.strptime(text[:10], "%Y-%m-%d")
    except ValueError:
        return None
    return int(parsed.replace(tzinfo=UTC).timestamp() * 1000)


def _format_time_label(ts: int, granularity: str) -> str:
    moment = datetime.fromtimestamp(ts / 1000, tz=UTC)
    if granularity == "hour":
        return f"{moment.hour:02d}:00"
    return f"{moment.month}/{moment.day}"


def build_notification_time_series(
    rows: list[tuple[Any, int]],
    window_hours: int,
    now_ms: int | None = None,
) -> list[dict[str, Any]]:
    """构建完整时间序列（补齐空桶），按粒度的桶边界对齐。"""
    granularity = resolve_notification_time_granularity(window_hours)
    bucket_ms = 3600_000 if granularity == "hour" else 86_400_000
    reference = now_ms if now_ms is not None else int(datetime.now(UTC).timestamp() * 1000)
    window_ms = window_hours * 3600_000
    start = (reference - window_ms) // bucket_ms * bucket_ms
    end = reference // bucket_ms * bucket_ms
    buckets: dict[int, int] = {}
    ts = start
    while ts <= end:
        buckets[ts] = 0
        ts += bucket_ms
    for bucket_key, count in rows:
        parsed = _parse_bucket_key(bucket_key, granularity)
        if parsed is None:
            continue
        key = parsed // bucket_ms * bucket_ms
        buckets[key] = buckets.get(key, 0) + int(count)
    return [
        {"ts": ts, "count": count, "label": _format_time_label(ts, granularity)}
        for ts, count in sorted(buckets.items())
    ]


def build_notification_stats(
    *,
    total: int,
    unread: int,
    delivered: int,
    window_hours: int,
    source_rows: list[tuple[str, int]],
    level_rows: list[tuple[str, int]],
    time_rows: list[tuple[Any, int]],
) -> dict[str, Any]:
    """构建完整的通知统计结果（对齐 ``buildNotificationStats``）。"""
    by_source: dict[str, int] = {}
    for source, count in source_rows:
        key = normalize_notification_source(source)
        by_source[key] = by_source.get(key, 0) + int(count)

    by_level: dict[str, int] = {}
    for level, count in level_rows:
        by_level[level] = by_level.get(level, 0) + int(count)

    top_sources = [
        {"source": source, "count": count}
        for source, count in sorted(by_source.items(), key=lambda item: item[1], reverse=True)[:12]
    ]

    read = max(0, total - unread)
    return {
        "total": total,
        "unread": unread,
        "delivered": delivered,
        "read": read,
        "windowHours": window_hours,
        "bySource": by_source,
        "byLevel": by_level,
        "byTime": build_notification_time_series(time_rows, window_hours),
        "topSources": top_sources,
        "deliveryRate": _round_half_up(delivered / total * 100, 2) if total else 0,
        "readRate": _round_half_up(read / total * 100, 2) if total else 0,
    }


__all__ = [
    "ALERT_LEVELS",
    "build_notification_source_conditions",
    "build_notification_stats",
    "build_notification_time_series",
    "clamp_notification_stats_hours",
    "combine_conditions",
    "iso_or_none",
    "map_notification_row",
    "parse_json_array",
    "resolve_notification_time_granularity",
]
