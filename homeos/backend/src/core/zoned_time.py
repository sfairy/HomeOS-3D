"""时区感知时间工具（对齐 @homeos/shared/time/zoned-time.util + home/mode-time.util）。

- ``normalize_home_mode_time_at``：时间字符串规范化为 HH:mm；
- ``home_mode_minute_key``：从 datetime 生成分钟键（可指定 IANA 时区）；
- ``zoned_date_parts``：按 IANA 时区拆解日期部件（weekday 0=周日 … 6=周六）。
"""

from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

_TIME_AT_RE = re.compile(r"^(\d{1,2}):(\d{2})$")
_WEEKDAY_MAP = {"Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6}


def normalize_home_mode_time_at(raw: object) -> str | None:
    text = str(raw or "").strip()
    match = _TIME_AT_RE.match(text)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def _tzinfo(time_zone: str | None) -> ZoneInfo | None:
    if not time_zone:
        return None
    try:
        return ZoneInfo(time_zone)
    except Exception:  # noqa: BLE001 - 非法时区回退本地时间
        return None


def home_mode_minute_key(now: datetime, time_zone: str | None = None) -> str:
    tz = _tzinfo(time_zone)
    local = now.astimezone(tz) if tz is not None else now.astimezone()
    return f"{local.hour:02d}:{local.minute:02d}"


def zoned_date_parts(now: datetime, time_zone: str | None = None) -> dict[str, int]:
    tz = _tzinfo(time_zone)
    local = now.astimezone(tz) if tz is not None else now.astimezone()
    # Python weekday(): 0=周一 … 6=周日 → 转换为 0=周日 … 6=周六
    weekday = (local.weekday() + 1) % 7
    return {
        "year": local.year,
        "month": local.month,
        "day": local.day,
        "hour": local.hour,
        "minute": local.minute,
        "second": local.second,
        "weekday": weekday,
    }


def date_from_zoned_wall_clock(
    time_zone: str | None,
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
) -> datetime:
    """按指定 IANA 时区的「墙上时钟」构造带时区信息的 datetime。

    等价 ``@homeos/shared`` 的 ``dateFromZonedWallClock``：非法时区回退本机时区。
    """
    tz = _tzinfo(time_zone) or datetime.now().astimezone().tzinfo
    return datetime(year, month, day, hour, minute, tzinfo=tz)

