"""外部日历同步辅助（对齐 ``external-calendar-sync.helper.ts``）。

- ``sync_calendar_from_url``：ICS URL → 拉取（支持 304 复用）→ 解析 → 外出状态变化回调。

依赖以 dataclass 注入，便于测试且不直接耦合 HTTP / 事件总线。
``is_away_during_calendar`` / ``get_upcoming_away_events`` 由 ``core.icalendar`` 提供。
"""

from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from ....core.icalendar import is_away_during_calendar


@dataclass
class CalendarSyncDeps:
    """日历同步依赖注入集合（``fetch_ics`` 返回 ``None`` 表示 304 未变更）。"""

    fetch_ics: Callable[[str], Awaitable[str | None]]
    parse_icalendar: Callable[[str], list[dict[str, Any]]]
    on_away_changed: Callable[[bool, list[dict[str, Any]]], Any]
    get_last_away_state: Callable[[], bool]
    set_last_away_state: Callable[[bool], None]
    get_last_events: Callable[[], list[dict[str, Any]]] | None = None
    set_last_events: Callable[[list[dict[str, Any]]], None] | None = None
    extra: dict[str, Any] = field(default_factory=dict)


async def sync_calendar_from_url(url: str | None, deps: CalendarSyncDeps) -> dict[str, Any]:
    """从 URL 同步日历（关键路径）。

    1. 校验 URL 非空；
    2. ``fetch_ics`` 拉取 ICS 文本（调用方负责熔断包装），返回 ``None`` 表示 304 未变更；
    3. 有变更时解析并缓存；未变更时复用上次事件；
    4. 计算当前是否外出，与上次状态比较，变化则触发 ``on_away_changed``；
    5. 返回同步结果（含事件列表）。
    """
    trimmed = (url or "").strip()
    if not trimmed:
        return {"synced": False, "reason": "未配置 calendarUrl"}
    try:
        content = await deps.fetch_ics(trimmed)
        events = list(deps.get_last_events() or []) if deps.get_last_events else []
        count = len(events)
        not_modified = False
        if content is not None:
            events = deps.parse_icalendar(content)
            count = len(events)
            if deps.set_last_events is not None:
                deps.set_last_events(events)
        else:
            not_modified = True
        away_now = is_away_during_calendar(events)
        # 外出状态变化时通知上层（避免每次同步都 emit）
        if away_now != deps.get_last_away_state():
            deps.set_last_away_state(away_now)
            result = deps.on_away_changed(
                away_now, [event for event in events if event.get("isAway")]
            )
            if inspect.isawaitable(result):
                await result
        return {
            "synced": True,
            "count": count,
            "awayNow": away_now,
            "events": events,
            "notModified": not_modified,
        }
    except Exception as err:
        return {"synced": False, "error": str(err)}


__all__ = ["CalendarSyncDeps", "sync_calendar_from_url"]
