"""主动推送时间戳格式化（对齐 ``common/utils/push-time.util.ts``）。

时间字段统一 ``Asia/Shanghai`` 时区，与 notification / earthquake 模块一致。
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

#: 推送时间戳展示时区。
PUSH_TIME_ZONE = "Asia/Shanghai"

_TIMESTAMP_PREFIX_RE = re.compile(r"^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]")


def _to_valid_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value / 1000, tz=UTC)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            numeric = float(text)
        except ValueError:
            numeric = None
        if numeric is not None:
            return _to_valid_datetime(numeric)
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)
    return None


def _local(value: datetime) -> datetime:
    try:
        return value.astimezone(ZoneInfo(PUSH_TIME_ZONE))
    except Exception:  # noqa: BLE001 - 非法时区回退 UTC
        return value.astimezone(UTC)


def format_push_timestamp(value: Any = None) -> str:
    """推送时间戳：``YYYY-MM-DD HH:mm:ss``（Asia/Shanghai）。"""
    moment = _local(_to_valid_datetime(value) or datetime.now(UTC))
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def format_time_only(value: Any = None, fallback: str | None = None) -> str:
    """仅时间：``HH:mm:ss``（Asia/Shanghai）；缺失/非法时返回 fallback。"""
    valid = _to_valid_datetime(value)
    if valid is None:
        if fallback is None:
            return _local(datetime.now(UTC)).strftime("%H:%M:%S")
        return str(fallback)
    return _local(valid).strftime("%H:%M:%S")


def with_push_timestamp(message: str, value: Any = None) -> str:
    """为主动推送正文前置时间戳前缀 ``[YYYY-MM-DD HH:mm:ss] ``。"""
    text = str(message or "").strip()
    if not text:
        return ""
    if _TIMESTAMP_PREFIX_RE.match(text):
        return text
    return f"[{format_push_timestamp(value)}] {text}"


__all__ = [
    "PUSH_TIME_ZONE",
    "format_push_timestamp",
    "format_time_only",
    "with_push_timestamp",
]
