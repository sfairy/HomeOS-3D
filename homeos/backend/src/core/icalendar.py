"""iCalendar（.ics，RFC 5545）解析（对齐 ``common/utils/icalendar-parse.util.ts``）。

- ``parse_icalendar``：切分 VEVENT 块，提取 SUMMARY/UID/LOCATION/DESCRIPTION/DTSTART/DTEND/RRULE，
  支持转义还原（``\\,`` → ``,``、``\\n`` → 换行）；
- ``is_away`` 启发式：标题 / 位置 / 描述含「外出 / 出差 / 旅行 / 旅游 / 度假」视为不在家；
- ``expand_rrule_instances``：基础 RRULE 展开（FREQ=DAILY/WEEKLY + COUNT/UNTIL + BYDAY），
  最多 30 个实例。

时区语义与 Node ``Date`` 保持一致：``getDay`` / ``setDate`` 走本机时区，
``toISOString`` 走 UTC。
"""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

_BEGIN_VEVENT = re.compile(r"BEGIN:VEVENT\r?\n", re.IGNORECASE)
_DAY_MAP = {"SU": 0, "MO": 1, "TU": 2, "WE": 3, "TH": 4, "FR": 5, "SA": 6}
_BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def _iso_utc(moment: datetime) -> str:
    """对齐 ``Date.prototype.toISOString()``：UTC + 毫秒 + Z。"""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _ms_to_iso(milliseconds: float) -> str:
    return _iso_utc(datetime.fromtimestamp(milliseconds / 1000, tz=UTC))


def _parse_iso_ms(value: str) -> float:
    text = value.replace("Z", "+00:00")
    return datetime.fromisoformat(text).timestamp() * 1000


def _random_uid() -> str:
    """对齐 ``Math.random().toString(36).slice(2)`` 的随机短 ID 语义。"""
    return "".join(secrets.choice(_BASE36) for _ in range(11))


def parse_icalendar(ics_content: str) -> list[dict[str, Any]]:
    """解析 ICS 文本为事件数组（按 start 升序，重复事件展开为多实例）。"""
    events: list[dict[str, Any]] = []
    blocks = _BEGIN_VEVENT.split(ics_content)[1:]

    for block in blocks:
        end_index = block.find("END:VEVENT")
        if end_index == -1:
            continue
        event_block = block[:end_index]

        def get_prop(name: str, _block: str = event_block) -> str:
            match = re.search(rf"^{name}(;.*?)?:(.+)$", _block, re.MULTILINE)
            if not match:
                return ""
            return match.group(2).replace("\\,", ",").replace("\\n", "\n").strip()

        title = get_prop("SUMMARY")
        uid = get_prop("UID")
        location = get_prop("LOCATION")
        description = get_prop("DESCRIPTION")
        dt_start = get_prop("DTSTART")
        dt_end = get_prop("DTEND")
        rrule = get_prop("RRULE")

        # 无标题或开始时间的事件跳过
        if not title or not dt_start:
            continue

        # 全天事件：DTSTART 原始行带 VALUE=DATE 参数
        dt_start_line = re.search(r"DTSTART[^\n]*", event_block)
        is_all_day = "VALUE=DATE" in dt_start or bool(
            dt_start_line and re.search(r"VALUE=DATE", dt_start_line.group(0), re.IGNORECASE)
        )
        is_away = (
            "外出" in title
            or "出差" in title
            or "旅行" in title
            or "旅游" in title
            or "度假" in title
            or "外" in location
            or "外出" in description
            or "出差" in description
        )

        base_start = parse_cal_date(dt_start, is_all_day)
        base_end = parse_cal_date(dt_end, is_all_day)
        instances = expand_rrule_instances(base_start, base_end, rrule)
        if not instances:
            events.append(
                {
                    "uid": uid or _random_uid(),
                    "title": title,
                    "start": base_start,
                    "end": base_end,
                    "location": location,
                    "description": description,
                    "isAllDay": is_all_day,
                    "isAway": is_away,
                }
            )
        else:
            for index, instance in enumerate(instances):
                events.append(
                    {
                        "uid": f"{uid or _random_uid()}_{index}",
                        "title": title,
                        "start": instance["start"],
                        "end": instance["end"],
                        "location": location,
                        "description": description,
                        "isAllDay": is_all_day,
                        "isAway": is_away,
                    }
                )

    return sorted(events, key=lambda event: event["start"])


def expand_rrule_instances(base_start: str, base_end: str, rrule: str) -> list[dict[str, str]]:
    """基础 RRULE 展开（DAILY / WEEKLY + COUNT/UNTIL + BYDAY），最多 30 个实例。"""
    if not rrule or not rrule.strip():
        return []
    parts: dict[str, str] = {}
    for segment in rrule.split(";"):
        key, _, value = segment.partition("=")
        if key and value:
            parts[key.upper()] = value
    freq = parts.get("FREQ")
    if not freq or freq not in ("DAILY", "WEEKLY"):
        return []

    try:
        count = int(parts.get("COUNT") or "8")
    except ValueError:
        count = 8
    max_instances = min(count or 8, 30)
    duration_ms = _parse_iso_ms(base_end) - _parse_iso_ms(base_start)
    start0_ms = _parse_iso_ms(base_start)
    until = parse_rrule_until(parts["UNTIL"]) if parts.get("UNTIL") else None
    by_day = [d.strip()[-2:].upper() for d in (parts.get("BYDAY") or "").split(",") if d.strip()]

    out: list[dict[str, str]] = []
    cursor = datetime.fromtimestamp(start0_ms / 1000)  # 本机时区，与 JS setDate/getDay 同语义
    start0_dow = (datetime.fromtimestamp(start0_ms / 1000).weekday() + 1) % 7
    added = 0
    # 安全阀：游标超过 366 天仍无产出则退出，防止 BYDAY 配错导致死循环
    while added < max_instances:
        cursor_ms = cursor.timestamp() * 1000
        if until is not None and cursor_ms > until:
            break
        dow = (cursor.weekday() + 1) % 7  # JS: 0=周日
        matched = freq == "DAILY" or (
            freq == "WEEKLY"
            and (dow == start0_dow if not by_day else any(_DAY_MAP.get(d) == dow for d in by_day))
        )
        if matched:
            out.append({"start": _ms_to_iso(cursor_ms), "end": _ms_to_iso(cursor_ms + duration_ms)})
            added += 1
        cursor = cursor + timedelta(days=1)
        if freq == "WEEKLY" and not by_day:
            cursor = cursor + timedelta(days=6)
        if added == 0 and cursor.timestamp() * 1000 - start0_ms > 366 * 86_400_000:
            break
    # 仅 1 个实例视为无重复，与无 RRULE 同等对待
    return out if len(out) > 1 else []


def parse_rrule_until(raw: str) -> float | None:
    """解析 RRULE UNTIL：一律取当日 23:59:59Z 作为截止（毫秒时间戳）。"""
    match = re.match(r"^(\d{4})(\d{2})(\d{2})(?:T\d{6}Z?)?Z?$", raw.strip())
    if not match:
        return None
    moment = datetime(
        int(match.group(1)), int(match.group(2)), int(match.group(3)), 23, 59, 59, tzinfo=UTC
    )
    return moment.timestamp() * 1000


def parse_cal_date(raw: str, is_all_day: bool) -> str:
    """ICS 日期字段 → ISO 字符串（无法识别时兜底为当前时间，保证不抛错）。"""
    clean = re.sub(r";.*?(?=:)", "", raw)
    if is_all_day:
        return f"{clean[0:4]}-{clean[4:6]}-{clean[6:8]}T00:00:00.000Z"
    if clean.endswith("Z"):
        return (
            f"{clean[0:4]}-{clean[4:6]}-{clean[6:8]}"
            f"T{clean[9:11]}:{clean[11:13]}:{clean[13:15]}.000Z"
        )
    # 浮动本地时间 / 带 TZID（参数已剥除）形如 yyyymmddThhmmss：按 UTC 墙上时钟确定性解析
    if re.fullmatch(r"\d{8}T\d{6}", clean):
        return (
            f"{clean[0:4]}-{clean[4:6]}-{clean[6:8]}"
            f"T{clean[9:11]}:{clean[11:13]}:{clean[13:15]}.000Z"
        )
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def is_away_during_calendar(events: list[dict[str, Any]]) -> bool:
    """当前是否处于「外出」事件中（``isAway`` 且 now ∈ [start, end]）。"""
    now = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return any(
        event.get("isAway") and event.get("start", "") <= now <= event.get("end", "")
        for event in events
    )


def get_upcoming_away_events(events: list[dict[str, Any]], within_hours: float = 2) -> list[dict[str, Any]]:
    """即将开始的外出事件（窗口默认 2 小时）。"""
    now_ms = datetime.now(UTC).timestamp() * 1000
    cutoff = now_ms + within_hours * 3_600_000
    out: list[dict[str, Any]] = []
    for event in events:
        if not event.get("isAway"):
            continue
        try:
            start_ms = _parse_iso_ms(str(event.get("start") or ""))
        except ValueError:
            continue
        if now_ms < start_ms <= cutoff:
            out.append(event)
    return out


__all__ = [
    "expand_rrule_instances",
    "get_upcoming_away_events",
    "is_away_during_calendar",
    "parse_cal_date",
    "parse_icalendar",
    "parse_rrule_until",
]
