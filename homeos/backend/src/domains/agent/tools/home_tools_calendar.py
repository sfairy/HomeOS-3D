"""日历工具族：``manage_calendar``（查询 / 创建 HA 日历事件）。

``get_calendar`` 只回答「今天是否外出」，是外部日历摘要；用户说「明天下午有什么安排」
「帮我在家庭日历加一条」时需要真正的 HA 日历实体。``calendar.list_events`` 在 HA 里是
REST 端点（``/api/calendars/<entity>``），由 ``HaClient.call_service`` 特判；写操作复用
``_control_device`` 的服务白名单、实体 ACL 与审计。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from .home_tools_base import HomeToolsHost
from .home_tools_primitives import _error_message, _or, _s, logger

#: 单次查询最长天数（超过按 31 天截断，避免把一年的事件塞进上下文）
MAX_RANGE_DAYS = 31
#: 单次返回事件上限
MAX_EVENTS = 50
#: 标题 / 地点 / 描述长度上限
MAX_SUMMARY_CHARS = 120
MAX_LOCATION_CHARS = 120
MAX_DESCRIPTION_CHARS = 500


def _calendar_entities(state_store: Any) -> list[dict[str, Any]]:
    """从状态快照里取全部 calendar.* 实体。"""
    try:
        entities = state_store.get_all() or []
    except Exception as exc:  # pragma: no cover - 状态库自身防御
        logger.warning("读取日历实体失败: %s", exc)
        return []
    return [
        entity
        for entity in entities
        if isinstance(entity, dict) and str(entity.get("entity_id") or "").startswith("calendar.")
    ]


def _friendly_name(entity: dict[str, Any]) -> str:
    attributes = entity.get("attributes")
    if isinstance(attributes, dict):
        return str(_or(attributes.get("friendly_name"), entity.get("entity_id")))
    return str(entity.get("entity_id") or "")


def _parse_moment(raw: Any) -> datetime | None:
    """解析 ISO / ``YYYY-MM-DD HH:MM``；不带时区按本机时区解释。"""
    text = _s(raw).strip()
    if not text:
        return None
    try:
        # Python 3.10 的 fromisoformat 不认尾缀 Z，显式换成 +00:00（3.11+ 两者都行）
        normalized = text[:-1] + "+00:00" if text.endswith("Z") else text
        moment = datetime.fromisoformat(normalized)
    except ValueError as exc:
        logger.debug("日历时间解析失败: %r", exc)
        return None
    if moment.tzinfo is None:
        moment = moment.astimezone()
    return moment


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class HomeToolsCalendarMixin(HomeToolsHost):
    """日历工具族。"""

    async def _manage_calendar(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        """查询或创建日历事件。"""
        action = _s(args.get("action")).strip().lower() or "list"
        if action not in ("list", "create"):
            return {"error": "action 须为 list 或 create"}

        resolved = self._resolve_calendar_entity(args, actor)
        if resolved.get("error"):
            return resolved
        entity_id = str(resolved["entity_id"])

        if action == "list":
            return await self._list_calendar_events(entity_id, args, actor)
        return await self._create_calendar_event(entity_id, args, actor, resolved.get("name"))

    def _resolve_calendar_entity(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        """解析目标日历：显式 entity_id 优先，否则要求唯一可读日历。"""
        explicit = _s(args.get("entity_id")).strip()
        if explicit:
            if not explicit.startswith("calendar."):
                return {"error": "entity_id 须为 calendar.*"}
            if not self._may_read(explicit, actor):
                return {"error": f"当前账号无权查看日历 {explicit}"}
            entity = self._state_store.get(explicit)
            if entity is None:
                return {"error": f"未找到日历 {explicit}"}
            return {"entity_id": explicit, "name": _friendly_name(entity)}
        candidates = [
            entity
            for entity in _calendar_entities(self._state_store)
            if self._may_read(str(entity.get("entity_id") or ""), actor)
        ]
        if not candidates:
            return {"error": "家里没有可用的日历（HA 未配置 calendar 实体）"}
        if len(candidates) > 1:
            return {
                "error": "有多个日历，请先确认要操作哪一个",
                "candidates": [
                    {"entity_id": entity.get("entity_id"), "name": _friendly_name(entity)} for entity in candidates[:10]
                ],
            }
        entity = candidates[0]
        return {"entity_id": str(entity.get("entity_id")), "name": _friendly_name(entity)}

    async def _list_calendar_events(self, entity_id: str, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        """读取时间窗内的事件（默认现在起 7 天）。"""
        start = _parse_moment(args.get("start")) or datetime.now(UTC)
        end = _parse_moment(args.get("end")) or (start + timedelta(days=7))
        if end <= start:
            return {"error": "end 必须晚于 start"}
        if end - start > timedelta(days=MAX_RANGE_DAYS):
            end = start + timedelta(days=MAX_RANGE_DAYS)
        try:
            result = await self._command_proxy.call_service(
                {
                    "domain": "calendar",
                    "service": "list_events",
                    "entity_id": entity_id,
                    "service_data": {"start": _iso(start), "end": _iso(end)},
                    "return_response": True,
                }
            )
        except Exception as exc:
            logger.warning("查询日历失败: %s", _error_message(exc))
            return {"error": f"查询日历失败: {_error_message(exc, '未知错误')}"}
        if not isinstance(result, dict) or result.get("success") is not True:
            message = _s(result.get("error") or result.get("message")) if isinstance(result, dict) else ""
            return {"error": message or "查询日历失败"}
        events = _extract_calendar_events(result.get("data"))
        return {
            "entity_id": entity_id,
            "start": _iso(start),
            "end": _iso(end),
            "count": len(events),
            "events": events[:MAX_EVENTS],
        }

    async def _create_calendar_event(
        self,
        entity_id: str,
        args: dict[str, Any],
        actor: Any = None,
        name: Any = None,
    ) -> dict[str, Any]:
        """创建事件：按是否全天映射 ``start_date`` / ``start_date_time``。"""
        summary = _s(args.get("summary")).strip()[:MAX_SUMMARY_CHARS]
        if not summary:
            return {"error": "创建事件需要 summary（事件标题）"}
        start = _parse_moment(args.get("start"))
        if start is None:
            return {"error": "创建事件需要合法的 start（ISO 或 YYYY-MM-DD HH:MM）"}
        end = _parse_moment(args.get("end")) or (start + timedelta(hours=1))
        if end <= start:
            return {"error": "end 必须晚于 start"}

        all_day = args.get("all_day") is True
        service_data: dict[str, Any] = {"summary": summary}
        if all_day:
            service_data["start_date"] = start.date().isoformat()
            service_data["end_date"] = end.date().isoformat()
        else:
            service_data["start_date_time"] = start.isoformat()
            service_data["end_date_time"] = end.isoformat()
        location = _s(args.get("location")).strip()[:MAX_LOCATION_CHARS]
        if location:
            service_data["location"] = location
        description = _s(args.get("description")).strip()[:MAX_DESCRIPTION_CHARS]
        if description:
            service_data["description"] = description

        result = await self._control_device(
            {
                "domain": "calendar",
                "service": "create_event",
                "entity_id": entity_id,
                "service_data": service_data,
            },
            actor,
        )
        if isinstance(result, dict):
            result.setdefault("entity_id", entity_id)
            result.setdefault("name", name)
            result.setdefault("summary", summary)
            result.setdefault("start", start.isoformat())
            result.setdefault("end", end.isoformat())
        return result


def _extract_calendar_events(data: Any) -> list[dict[str, Any]]:
    """把 HA 日历返回精简成模型可读的事件列表。"""
    raw: Any = data
    if isinstance(data, dict):
        raw = data.get("events")
        if not isinstance(raw, list):
            for value in data.values():
                if isinstance(value, list):
                    raw = value
                    break
    if not isinstance(raw, list):
        return []
    events: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        start = entry.get("start")
        events.append(
            {
                "summary": _s(entry.get("summary")),
                "start": start,
                "end": entry.get("end"),
                "location": entry.get("location"),
                "description": entry.get("description"),
                # 全天事件在 HA 里用 {"date": ...} 表示，定时事件用 {"dateTime": ...}
                "all_day": bool(entry.get("all_day")) or (isinstance(start, dict) and bool(start.get("date"))),
            }
        )
    return events


__all__ = ["MAX_EVENTS", "HomeToolsCalendarMixin"]
