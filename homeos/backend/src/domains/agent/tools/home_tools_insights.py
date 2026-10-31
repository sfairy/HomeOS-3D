"""只读洞察工具族：能耗 / 历史事件 / 通知 / 天气预报。

这些工具的共同点：
- **只读**：不经过 ``assert_actor_may_control``，但必须走读路径 ACL（``_may_read``），
  否则受限账号能通过管家读取本不可见设备的历史与告警；
- **有上限**：所有参数都夹紧（天数 / 条数 / 小时数），避免一次调用把整张表回填给 LLM；
- **可降级**：数据库未就绪 / 未配置天气服务时返回结构化空结果 + 说明，而不是抛异常。
"""

from __future__ import annotations

import inspect
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select

from .home_tools_base import HomeToolsHost
from .home_tools_primitives import _error_message, _s, logger
from ..runtime.agent_actor import AgentActor
from ...client_power.energy_meter import business_day_key, business_month_key
from ....platform.core.db_exec import run_db
from ....platform.core.models import EnergyUsageDaily, EventLog, Notification

#: 能耗查询最大回溯天数
MAX_ENERGY_DAYS = 90
#: 历史事件最大回溯小时数 / 单次返回条数
MAX_EVENT_HOURS = 168
MAX_EVENT_ROWS = 50
#: 通知单次返回条数
MAX_NOTIFICATION_ROWS = 50
#: 天气预报最大条数（OpenWeather 3 小时粒度，40 条≈5 天）
MAX_FORECAST_ITEMS = 24


def _clamped_int(raw: Any, default: int, minimum: int, maximum: int) -> int:
    """把 LLM 传入的任意值收敛到 ``[minimum, maximum]``；布尔与非法值回退默认。"""
    if isinstance(raw, bool):
        return default
    try:
        value = int(float(raw))
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, value))


def _as_float(raw: Any) -> float | None:
    """宽松解析数字（字符串数字也接受）；非法返回 None。"""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, str):
        try:
            return float(raw.strip())
        except ValueError:
            return None
    return None


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    aware = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return aware.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


class HomeToolsInsightsMixin(HomeToolsHost):
    """能耗 / 历史 / 通知 / 天气预报（只读）。"""

    # 通用读取封装
    def _session_scope(self) -> Any:
        """返回数据库会话上下文；``session_factory`` 缺失时抛 ValueError 由调用方兜底。"""
        factory = self._session_factory
        if factory is None:
            raise ValueError("数据库未就绪")
        return factory()

    def _friendly_name(self, entity_id: str) -> str:
        entity = self._state_store.get(entity_id) if entity_id else None
        attributes = (entity or {}).get("attributes") if isinstance(entity, dict) else None
        name = (attributes or {}).get("friendly_name") if isinstance(attributes, dict) else None
        return _s(name) or entity_id

    # 同步取数（一律经 run_db 放进线程池，避免只读查询阻塞事件循环）
    def _load_energy_rows(
        self, since_key: str, month_key: str
    ) -> tuple[list[EnergyUsageDaily], list[EnergyUsageDaily]]:
        with self._session_scope() as session:
            daily_rows = list(
                session.execute(
                    select(EnergyUsageDaily).where(EnergyUsageDaily.day >= since_key)
                ).scalars()
            )
            month_rows = list(
                session.execute(
                    select(EnergyUsageDaily).where(
                        EnergyUsageDaily.day >= f"{month_key}-01"
                    )
                ).scalars()
            )
        return daily_rows, month_rows

    def _load_today_energy_rows(self, today_key: str) -> list[EnergyUsageDaily]:
        with self._session_scope() as session:
            return list(
                session.execute(
                    select(EnergyUsageDaily).where(EnergyUsageDaily.day == today_key)
                ).scalars()
            )

    def _load_event_rows(
        self, since: datetime, entity_id: str, domain: str, fetch_size: int
    ) -> list[EventLog]:
        with self._session_scope() as session:
            query = select(EventLog).where(EventLog.created_at >= since)
            if entity_id:
                query = query.where(EventLog.entity_id == entity_id)
            if domain:
                query = query.where(EventLog.domain == domain)
            return list(
                session.execute(
                    query.order_by(EventLog.created_at.desc()).limit(fetch_size)
                ).scalars()
            )

    def _load_notification_rows(
        self, unread_only: bool, fetch_size: int
    ) -> tuple[list[Notification], list[Notification]]:
        with self._session_scope() as session:
            query = select(Notification)
            if unread_only:
                query = query.where(Notification.read.is_(False))
            rows = list(
                session.execute(
                    query.order_by(Notification.created_at.desc()).limit(fetch_size)
                ).scalars()
            )
            unread_rows = list(
                session.execute(
                    select(Notification).where(Notification.read.is_(False))
                ).scalars()
            )
        return rows, unread_rows

    # 能耗
    async def _get_energy_usage(
        self, args: dict[str, Any], actor: AgentActor | None = None
    ) -> dict[str, Any]:
        """近 N 天用电汇总：总量 / 今日 / 本月 / 每日曲线 / 用电最多的设备。"""
        denied = self._read_denied(actor)
        if denied is not None:
            return denied
        days = _clamped_int(args.get("days"), 7, 1, MAX_ENERGY_DAYS)
        today_key = business_day_key(datetime.now(UTC))
        month_key = business_month_key(datetime.now(UTC))
        since_key = (
            datetime.strptime(today_key, "%Y-%m-%d").date() - timedelta(days=days - 1)
        ).isoformat()
        try:
            daily_rows, month_rows = await run_db(self._load_energy_rows, since_key, month_key)
        except Exception as exc:
            logger.warning("能耗查询失败: %s", _error_message(exc))
            return {"error": f"能耗数据暂不可用: {_error_message(exc)}"}

        per_day: dict[str, float] = {}
        per_entity: dict[str, float] = {}
        today_kwh = 0.0
        for row in daily_rows:
            entity_id = _s(row.entity_id)
            if not self._may_read(entity_id, actor):
                continue
            kwh = float(row.kwh or 0.0)
            per_day[row.day] = per_day.get(row.day, 0.0) + kwh
            per_entity[entity_id] = per_entity.get(entity_id, 0.0) + kwh
            if row.day == today_key:
                today_kwh += kwh
        month_kwh = sum(
            float(row.kwh or 0.0)
            for row in month_rows
            if self._may_read(_s(row.entity_id), actor)
        )
        daily = [
            {"day": day, "kwh": round(per_day[day], 3)}
            for day in sorted(per_day)
        ]
        top_entities = [
            {
                "entity_id": entity_id,
                "name": self._friendly_name(entity_id),
                "kwh": round(kwh, 3),
            }
            for entity_id, kwh in sorted(per_entity.items(), key=lambda item: -item[1])[:5]
        ]
        return {
            "days": days,
            "today_kwh": round(today_kwh, 3),
            "month_kwh": round(month_kwh, 3),
            "total_kwh": round(sum(per_day.values()), 3),
            "daily": daily,
            "top_entities": top_entities,
        }

    async def _energy_today_kwh(self, actor: AgentActor | None = None) -> float | None:
        """今日用电量（供 ``get_home_status`` 内嵌；失败返回 None，不影响状态概览）。"""
        denied = self._read_denied(actor)
        if denied is not None:
            return None
        today_key = business_day_key(datetime.now(UTC))
        try:
            rows = await run_db(self._load_today_energy_rows, today_key)
        except Exception:
            return None
        total = sum(
            float(row.kwh or 0.0)
            for row in rows
            if self._may_read(_s(row.entity_id), actor)
        )
        return round(total, 3)

    # 历史事件
    async def _query_events(
        self, args: dict[str, Any], actor: AgentActor | None = None
    ) -> dict[str, Any]:
        """查询 HA 状态变更历史（按实体 / 域 / 时间窗过滤，最新在前）。"""
        denied = self._read_denied(actor)
        if denied is not None:
            return denied
        hours = _clamped_int(args.get("hours"), 24, 1, MAX_EVENT_HOURS)
        limit = _clamped_int(args.get("limit"), 20, 1, MAX_EVENT_ROWS)
        entity_id = _s(args.get("entity_id")).strip()
        domain = _s(args.get("domain")).strip()
        since = (datetime.now(UTC) - timedelta(hours=hours)).replace(tzinfo=None)
        # 受限账号先取更多再过滤：否则 limit 会把可见记录挤掉
        fetch_size = MAX_EVENT_ROWS * 4 if self._read_restrictions(actor) else limit
        try:
            rows = await run_db(self._load_event_rows, since, entity_id, domain, fetch_size)
        except Exception as exc:
            logger.warning("历史事件查询失败: %s", _error_message(exc))
            return {"error": f"历史数据暂不可用: {_error_message(exc)}"}

        events: list[dict[str, Any]] = []
        for row in rows:
            eid = _s(row.entity_id)
            if not self._may_read(eid, actor):
                continue
            events.append(
                {
                    "time": _iso(row.created_at),
                    "entity_id": eid,
                    "name": self._friendly_name(eid),
                    "domain": _s(row.domain),
                    "old_state": row.old_state,
                    "new_state": row.new_state,
                    "diff": row.state_diff,
                }
            )
            if len(events) >= limit:
                break
        return {"hours": hours, "count": len(events), "events": events}

    # 通知
    async def _get_notifications(
        self, args: dict[str, Any], actor: AgentActor | None = None
    ) -> dict[str, Any]:
        """查询通知中心：未读数 + 最近通知列表。"""
        denied = self._read_denied(actor)
        if denied is not None:
            return denied
        limit = _clamped_int(args.get("limit"), 10, 1, MAX_NOTIFICATION_ROWS)
        unread_only = args.get("unread_only") is True
        restrictions = self._read_restrictions(actor)
        fetch_size = MAX_NOTIFICATION_ROWS * 4 if restrictions else limit
        try:
            rows, unread_rows = await run_db(
                self._load_notification_rows, unread_only, fetch_size
            )
        except Exception as exc:
            logger.warning("通知查询失败: %s", _error_message(exc))
            return {"error": f"通知暂不可用: {_error_message(exc)}"}

        def _visible(row: Notification) -> bool:
            eid = _s(row.entity_id)
            # 系统级通知没有 entityId，不受实体白名单影响
            return not eid or self._may_read(eid, actor)

        items = []
        for row in rows:
            if not _visible(row):
                continue
            items.append(
                {
                    "id": _s(row.id),
                    "level": _s(row.level),
                    "message": _s(row.message),
                    "source": _s(row.source),
                    "entity_id": row.entity_id,
                    "read": bool(row.read),
                    "created_at": _iso(row.created_at),
                }
            )
            if len(items) >= limit:
                break
        unread_count = sum(1 for row in unread_rows if _visible(row))
        return {"unread_count": unread_count, "count": len(items), "notifications": items}

    # 天气预报
    async def _get_weather_forecast(
        self, args: dict[str, Any], actor: AgentActor | None = None
    ) -> dict[str, Any]:
        """未来天气（OpenWeather 3 小时粒度），返回精简的时段列表。"""
        items_limit = _clamped_int(args.get("count"), 8, 1, MAX_FORECAST_ITEMS)
        fetch = getattr(self._external_api, "fetch_forecast", None)
        if not callable(fetch):
            return {"items": [], "message": "当前环境未配置天气预报服务"}
        try:
            # ``fetch_forecast`` 在真实实现里是协程，但配置层允许注入同步桩；
            # 统一用 ``isawaitable`` 兜住两种形态（直接 ``await`` 会让同步桩报错）。
            pending = fetch(items_limit)
            raw = await pending if inspect.isawaitable(pending) else pending
        except Exception as exc:
            logger.warning("天气预报获取失败: %s", _error_message(exc))
            return {"error": f"天气预报暂不可用: {_error_message(exc)}"}
        raw_list = raw.get("list") if isinstance(raw, dict) else None
        items: list[dict[str, Any]] = []
        for entry in (raw_list or [])[:items_limit]:
            if not isinstance(entry, dict):
                continue
            main_raw = entry.get("main")
            main: dict[str, Any] = main_raw if isinstance(main_raw, dict) else {}
            weather_raw = entry.get("weather")
            weather_list: list[Any] = weather_raw if isinstance(weather_raw, list) else []
            first_raw = weather_list[0] if weather_list else None
            first: dict[str, Any] = first_raw if isinstance(first_raw, dict) else {}
            stamp = entry.get("dt")
            when = (
                datetime.fromtimestamp(float(stamp), tz=UTC).isoformat(timespec="minutes")
                if isinstance(stamp, (int, float))
                else entry.get("dt_txt")
            )
            items.append(
                {
                    "time": when,
                    "temperature": _as_float(main.get("temp")),
                    "condition": _s(first.get("description")),
                    "precipitation_probability": _as_float(entry.get("pop")),
                }
            )
        return {
            "source": _s(raw.get("source")) if isinstance(raw, dict) and raw.get("source") else "openweather",
            "cached": bool(raw.get("cached")) if isinstance(raw, dict) else False,
            "items": items,
        }


__all__ = ["HomeToolsInsightsMixin"]
