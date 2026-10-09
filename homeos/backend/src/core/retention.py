"""事件日志保留策略与查询 meta（对齐 event-log-retention.util.ts）。"""

from __future__ import annotations

import math
from typing import Any

RETENTION_DEFAULT_DAYS = 7
RETENTION_DAYS_MIN = 1
RETENTION_DAYS_MAX = 365

#: retention 配置分区与清理步骤共用的表键（对齐 retention-tables.ts）。
RETENTION_TABLE_KEYS: tuple[str, ...] = (
    "eventLog",
    "notification",
    "securityEvent",
)

#: 物理表名（对齐 Prisma 模型名 / Python __tablename__ 的可读名）。
RETENTION_TABLE_NAMES: dict[str, str] = {
    "eventLog": "EventLog",
    "notification": "Notification",
    "securityEvent": "SecurityEvent",
}

#: 中文显示名（供设置面板展示）。
RETENTION_TABLE_LABELS: dict[str, str] = {
    "eventLog": "事件日志",
    "notification": "通知记录（按天数；条数上限另见 maxNotifications）",
    "securityEvent": "安防事件",
}

EVENT_LOG_QUERY_HOUR_STEPS = (3, 6, 12, 24, 48, 72, 168)

DEFAULT_OPS: dict[str, Any] = {
    "retentionCleanupIntervalHours": 1,
    "retentionDeleteBatchSize": 800,
    "retentionFirstDelaySec": 15,
    "eventLogFlushIntervalMs": 5000,
    "eventLogMaxBuffer": 200,
    "eventLogMaxRequeueBuffer": 500,
    "eventLogTimelineMax": 500,
    "eventLogTimelineHours": 12,
    "eventLogOverlayHours": 2,
    "eventLogTierEnabled": True,
    "eventLogTierCSampleRate": 0,
    "eventLogSkipSensorTimeline": True,
    "eventLogRecordFilterEnabled": True,
    "eventLogRecordFilterMode": "block",
    "homeTimezone": "Asia/Shanghai",
}

DEFAULT_RETENTION: dict[str, int] = {
    "eventLog": RETENTION_DEFAULT_DAYS,
    "notification": RETENTION_DEFAULT_DAYS,
    "securityEvent": RETENTION_DEFAULT_DAYS,
}


def resolve_event_log_retention_days(days: Any, fallback: int = RETENTION_DEFAULT_DAYS) -> int:
    try:
        value = float(days)
    except (TypeError, ValueError):
        return fallback
    if math.isnan(value) or value <= 0:
        return fallback
    return min(int(value), RETENTION_DAYS_MAX)


def resolve_event_log_max_hours(days: Any, fallback_days: int = RETENTION_DEFAULT_DAYS) -> int:
    return resolve_event_log_retention_days(days, fallback_days) * 24


def clamp_event_log_query_hours(
    hours: Any, retention_days: Any, fallback_hours: int | None = None
) -> int:
    max_hours = resolve_event_log_max_hours(retention_days)
    if fallback_hours is not None:
        fb = min(max(int(fallback_hours), 1), max_hours)
    else:
        fb = max_hours
    try:
        value = float(hours)
        base = int(value) if not math.isnan(value) and value > 0 else fb
    except (TypeError, ValueError):
        base = fb
    return min(max(base, 1), max_hours)


def list_event_log_query_hour_options(retention_days: Any) -> list[int]:
    max_hours = resolve_event_log_max_hours(retention_days)
    options = [step for step in EVENT_LOG_QUERY_HOUR_STEPS if step <= max_hours]
    return options or [max_hours]


def build_event_log_public_meta(
    retention_days: Any,
    *,
    event_log_timeline_max: Any = None,
    event_log_timeline_hours: Any = None,
    event_log_overlay_hours: Any = None,
) -> dict[str, Any]:
    days = resolve_event_log_retention_days(retention_days)
    max_query_hours = days * 24
    timeline_max = int(event_log_timeline_max) if _is_positive(event_log_timeline_max) else 500
    timeline_hours_raw = int(event_log_timeline_hours) if _is_positive(event_log_timeline_hours) else 12
    overlay_raw = int(event_log_overlay_hours) if _is_positive(event_log_overlay_hours) else 2
    return {
        "retentionDays": days,
        "maxQueryHours": max_query_hours,
        "hourOptions": list_event_log_query_hour_options(days),
        "timelineHours": min(timeline_hours_raw, max_query_hours),
        "timelineLimit": timeline_max if timeline_max > 0 else 500,
        "overlayHours": min(overlay_raw, max_query_hours),
    }


def _is_positive(value: Any) -> bool:
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


def load_ops_config(session) -> dict[str, Any]:
    from ..core.app_config import load_raw_config

    raw = load_raw_config(session)
    section = raw.get("ops") if isinstance(raw.get("ops"), dict) else {}
    return {**DEFAULT_OPS, **section}


def load_retention_config(session) -> dict[str, int]:
    from ..core.app_config import load_raw_config

    raw = load_raw_config(session)
    section = raw.get("retention") if isinstance(raw.get("retention"), dict) else {}
    merged = {**DEFAULT_RETENTION, **{k: v for k, v in section.items() if isinstance(v, (int, float))}}
    return {k: int(v) for k, v in merged.items()}
