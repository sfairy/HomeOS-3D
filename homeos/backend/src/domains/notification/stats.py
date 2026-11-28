"""通知统计与行映射工具（对齐 ``modules/notification/stats.util.ts``）。

SQLite 适配：无 ``date_trunc``，按 ``substr(createdAt, 1, 13|10)`` 分桶（列为 ISO 文本），
与 ``EventLogService`` 的既有口径一致。
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, or_
from sqlalchemy.sql.elements import ColumnElement

from ..alerts.sources import (
    NotificationSourceDbFilter,
    build_notification_source_db_filter,
    normalize_notification_source,
)
from ...platform.core.db.json_field import parse_json_array

ALERT_LEVELS = ("info", "warn", "danger")


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
    action_prompt = getattr(row, "action_prompt", None)
    if action_prompt:
        payload["actionPrompt"] = action_prompt
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
    from ...platform.core.db.models import Notification

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


def _format_time_label(timestamp: int, granularity: str) -> str:
    moment = datetime.fromtimestamp(timestamp / 1000, tz=UTC)
    if granularity == "hour":
        return f"{moment.hour:02d}:00"
    return f"{moment.month}/{moment.day}"


def _resolve_timezone(time_zone: str | None):
    """家庭时区；未配置 / 非法时回退本机时区（与 ``zoned_time`` 同口径）。"""
    from ...platform.core.runtime.zoned_time import _tzinfo

    return _tzinfo(time_zone)


def _parse_created_at(text: Any) -> datetime | None:
    """把库里的 ``YYYY-MM-DDTHH:MM:SS.mmmZ``（naive UTC 文本）解析成带时区的时刻。"""
    raw = str(text or "").strip()
    if len(raw) < 19:
        return None
    try:
        return datetime.strptime(raw[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=UTC)
    except ValueError:
        return None


def _floor_local(moment: datetime, granularity: str) -> datetime:
    """按**家庭时区墙上时钟**取整到小时 / 天的起点。"""
    if granularity == "hour":
        return moment.replace(minute=0, second=0, microsecond=0)
    return moment.replace(hour=0, minute=0, second=0, microsecond=0)


def build_notification_time_series_in_zone(
    timestamps: list[Any],
    window_hours: int,
    time_zone: str | None,
    now_ms: int | None = None,
) -> list[dict[str, Any]]:
    """按家庭时区构建完整时间序列（补齐空桶）。

    ## 为什么不能在 SQL 里 ``substr(createdAt, 1, 13)``

    ``created_at`` 落库是 **UTC** 文本，按它的前 13 位分桶等于把横轴画成 UTC：
    东八区家庭 23:30 的通知会被放进 15:00 的桶里，日边界也落在本地 16:00，
    与界面上所有其它时间（家庭时区）互相矛盾。``substr`` 也拿不到 DST / 半小时时区。

    这里改为逐条取 ``created_at``、按家庭时区取整后聚合：窗口最大 720 小时、
    通知表上限 1 万条，代价可接受（统计端点本身有 ``sharedFetch`` 去抖）。
    """
    granularity = resolve_notification_time_granularity(window_hours)
    tz = _resolve_timezone(time_zone)
    reference = datetime.fromtimestamp((now_ms if now_ms is not None else _now_ms()) / 1000, tz=UTC)
    local_now = reference.astimezone(tz) if tz is not None else reference.astimezone()
    anchor = _floor_local(local_now, granularity)
    step = timedelta(hours=1) if granularity == "hour" else timedelta(days=1)
    span = window_hours if granularity == "hour" else max(1, window_hours // 24)

    buckets: dict[int, int] = {}
    for offset in range(span, -1, -1):
        bucket_start = anchor - offset * step
        buckets[int(bucket_start.timestamp() * 1000)] = 0

    # 没有家庭时区时用本机时区：``local_now`` 已按同一规则换算，分桶键必须一致。
    for raw in timestamps:
        parsed = _parse_created_at(raw)
        if parsed is None:
            continue
        local = parsed.astimezone(tz) if tz is not None else parsed.astimezone()
        key = int(_floor_local(local, granularity).timestamp() * 1000)
        if key not in buckets:
            # 窗口边界外的桶不补：SQL 已按 ``created_at >= since`` 过滤，这里多出来的
            # 只会是取整溢出的那半个桶，补进去会让 X 轴出现窗口外的刻度。
            continue
        buckets[key] += 1

    return [
        {"ts": ts, "count": count, "label": _format_local_label(ts, granularity, tz)}
        for ts, count in sorted(buckets.items())
    ]


def _format_local_label(timestamp: int, granularity: str, tz) -> str:
    moment = datetime.fromtimestamp(timestamp / 1000, tz=UTC)
    local = moment.astimezone(tz) if tz is not None else moment.astimezone()
    if granularity == "hour":
        return f"{local.hour:02d}:00"
    return f"{local.month}/{local.day}"


def _now_ms() -> int:
    return int(datetime.now(UTC).timestamp() * 1000)


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
    time_rows: list[tuple[Any, int]] | None = None,
    time_timestamps: list[Any] | None = None,
    time_zone: str | None = None,
) -> dict[str, Any]:
    """构建完整的通知统计结果（对齐 ``buildNotificationStats``）。

    ``time_timestamps`` 优先：按家庭时区分桶（正确处理时差 / 跨午夜 / DST）。
    ``time_rows`` 是旧的「SQL 已按 UTC 分桶」入参，仅在调用方没给逐条时间时使用。
    """
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
    if time_timestamps is not None:
        by_time = build_notification_time_series_in_zone(time_timestamps, window_hours, time_zone)
    else:
        by_time = build_notification_time_series(time_rows or [], window_hours)
    return {
        "total": total,
        "unread": unread,
        "delivered": delivered,
        "read": read,
        "windowHours": window_hours,
        "bySource": by_source,
        "byLevel": by_level,
        "byTime": by_time,
        "topSources": top_sources,
        "deliveryRate": _round_half_up(delivered / total * 100, 2) if total else 0,
        "readRate": _round_half_up(read / total * 100, 2) if total else 0,
    }


__all__ = [
    "ALERT_LEVELS",
    "build_notification_source_conditions",
    "build_notification_stats",
    "build_notification_time_series",
    "build_notification_time_series_in_zone",
    "clamp_notification_stats_hours",
    "combine_conditions",
    "iso_or_none",
    "map_notification_row",
    "parse_json_array",
    "resolve_notification_time_granularity",
]
