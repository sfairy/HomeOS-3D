"""跨模块共用的时间口径。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import overload


@overload
def ensure_aware(value: datetime) -> datetime: ...


@overload
def ensure_aware(value: None) -> None: ...


def ensure_aware(value: datetime | None) -> datetime | None:
    """给缺少 tzinfo 的时间补上 UTC；已有 tzinfo 或为 None 时原样返回。
    """
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)
