"""事件日志报表层（compare 四类报表的聚合与装配；对齐 Nest ``report.service.ts``）。

从 ``event_log.py`` 抽出：宿主 ``EventLogService`` 混入本层，只提供
``_database``（session factory）与 ``_ops``（ops 配置）两个依赖，使报表口径
可以独立演进与测试，不必穿过缓冲写入 / 保留清理的代码路径。
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any, TypedDict

from sqlalchemy import func, or_, select


class ParsedStateDiff(TypedDict):
    state: str
    oldState: str
    attrText: str | None


class EventHistoryRow(TypedDict):
    id: Any
    entityId: str
    state: str
    oldState: str
    attrText: str | None
    stateDiff: str | None
    createdAt: str | None


class EventLogStatsPayload(TypedDict):
    total: int
    byDomain: dict[str, int]
    byTime: list[dict[str, Any]]
    topEntities: list[dict[str, Any]]

from ..client_power.energy_meter import (
    business_day_key,
    resolve_business_timezone,
)
from ...platform.core.models import (
    DeviceUsageStat,
    EnergyCandidateEntity,
    EnvironmentRecord,
    EventLog,
)
from ...platform.security.entity_access import is_entity_allowed

DAY_MS = 86_400_000
BY_ENTITY_LIMIT = 20


# stateDiff 解析（对齐 util.ts parseStateDiff / mapEventLogHistoryRow）
def parse_state_diff(state_diff: str | None) -> ParsedStateDiff:
    if not state_diff:
        return {"state": "", "oldState": "", "attrText": None}
    if state_diff.startswith("attr:"):
        body = state_diff[5:]
        arrow = body.find("→")
        if arrow < 0:
            return {"state": "", "oldState": "", "attrText": body}
        key_part = body[:arrow]
        colon = key_part.find(":")
        key = key_part[:colon] if colon >= 0 else key_part
        old_raw = key_part[colon + 1 :] if colon >= 0 else ""
        new_raw = body[arrow + 1 :]
        attr_text = f"{key}: {old_raw} → {new_raw}" if colon >= 0 else body
        return {"state": "", "oldState": "", "attrText": attr_text}
    parts = state_diff.split("→")
    if len(parts) >= 2:
        return {"oldState": parts[0] or "", "state": parts[-1] or "", "attrText": None}
    return {"state": state_diff, "oldState": "", "attrText": None}


def map_history_row(event_log: EventLog) -> EventHistoryRow:
    parsed = parse_state_diff(event_log.state_diff)
    return {
        "id": event_log.id,
        "entityId": event_log.entity_id,
        "state": parsed["state"],
        "oldState": parsed["oldState"],
        "attrText": parsed["attrText"],
        "stateDiff": event_log.state_diff,
        "createdAt": _iso(event_log.created_at),
    }


def resolve_event_log_time_granularity(window_hours: int) -> str:
    return "hour" if window_hours <= 48 else "day"


def build_event_log_stats(
    domain_rows: list[tuple[str, int]],
    entity_rows: list[tuple[str, int]],
    time_rows: list[tuple[str, int]],
    window_hours: int,
    now: datetime,
) -> EventLogStatsPayload:
    """装配 stats 报表。``now`` 必须显式传入家庭时区的「现在」（见 :func:`_report_now`）。

    传参而非回落 ``datetime.now()`` 是有意的：分桶键是**家庭时区墙钟**文本，坐标轴必须
    用同一坐标才能对齐，否则非 UTC 主机上会整体错位（东八区 8 小时）。
    """
    by_domain: dict[str, int] = {}
    total = 0
    for domain, count in domain_rows:
        by_domain[domain or ""] = int(count)
        total += int(count)
    return {
        "total": total,
        "byDomain": by_domain,
        "byTime": _build_time_series(time_rows, window_hours, now),
        "topEntities": [{"entityId": eid, "count": int(count)} for eid, count in entity_rows],
    }


def _bucket_frame_ms(reference: datetime) -> int:
    """把「现在」换算到分桶键所在坐标：**家庭时区墙钟按 UTC 解释**。

    ``_bucket_expr`` 先把 UTC 存储值平移家庭时区偏移再截取，得到的是家庭墙钟文本
    （东八区 ``2026-10-15 20``）；:func:`_parse_bucket_key` 又把它当 UTC 解析。两者相抵，
    坐标轴就必须用同一种「墙钟字段按 UTC 解释」的毫秒。用 ``datetime.now()``（naive
    本地时间）当坐标轴，在 UTC 容器里会与东八区数据整体错位 8 小时，还会把窗口外的数据
    塞成额外的时间点。
    """
    wall_clock = reference.replace(tzinfo=None) if reference.tzinfo is not None else reference
    return int(wall_clock.replace(tzinfo=UTC).timestamp() * 1000)


def _build_time_series(
    rows: list[tuple[str, int]], window_hours: int, now: datetime
) -> list[dict[str, Any]]:
    granularity = resolve_event_log_time_granularity(window_hours)
    bucket_seconds = 3600 if granularity == "hour" else 86_400
    now_ms = _bucket_frame_ms(now)
    window_ms = window_hours * 3600_000
    bucket_ms = bucket_seconds * 1000
    start = (now_ms - window_ms) // bucket_ms * bucket_ms
    end = now_ms // bucket_ms * bucket_ms
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


def _parse_bucket_key(bucket_key: str, granularity: str) -> int | None:
    if not bucket_key:
        return None
    try:
        if granularity == "hour":
            dt = datetime.strptime(bucket_key[:13], "%Y-%m-%d %H")
        else:
            dt = datetime.strptime(bucket_key[:10], "%Y-%m-%d")
    except ValueError:
        return None
    return int(dt.replace(tzinfo=UTC).timestamp() * 1000)


def _format_time_label(ts: int, granularity: str) -> str:
    dt = datetime.fromtimestamp(ts / 1000, tz=UTC)
    if granularity == "hour":
        return f"{dt.hour:02d}:00"
    return f"{dt.month}/{dt.day}"


# 周期对比报表辅助（对齐 report.service.ts）
def _start_of_day(d: datetime) -> datetime:
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


def _monday_of(d: datetime) -> datetime:
    diff = d.weekday()  # 0=周一
    return _start_of_day(d - timedelta(days=diff))


def _format_day_label(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def _format_short_label(date: str) -> str:
    parts = date.split("-")
    if len(parts) == 3:
        return f"{int(parts[1])}/{int(parts[2])}"
    return date


def _build_day_labels(start: datetime, end: datetime) -> list[str]:
    labels: list[str] = []
    cursor = _start_of_day(start)
    last = _start_of_day(end)
    while cursor <= last and len(labels) < 62:
        labels.append(_format_day_label(cursor))
        cursor += timedelta(days=1)
    return labels


def _round2(n: float) -> float:
    return round(n * 100) / 100


def _round1(n: float) -> float:
    return round(n * 10) / 10


def _build_compare_row(
    key: str, current: float, previous: float | None, rounder=_round2
) -> dict[str, Any]:
    cur = rounder(current)
    prev = None if previous is None else rounder(previous)
    delta = rounder(cur - (prev or 0))
    delta_pct: float | None = None
    if prev is not None:
        delta_pct = _round1(delta / prev * 100) if prev != 0 else (None if cur != 0 else 0)
    return {"key": key, "current": cur, "previous": prev, "delta": delta, "deltaPct": delta_pct}


def _timezone_offset_minutes(timezone_name: str | None) -> int:
    offset = datetime.now(resolve_business_timezone(timezone_name)).utcoffset()
    return int(offset.total_seconds() // 60) if offset is not None else 0


def _resolve_ops_timezone_name(ops: dict[str, Any] | None) -> str | None:
    return str((ops or {}).get("homeTimezone") or "").strip() or None


def _report_now(ops: dict[str, Any] | None) -> datetime:
    """报表周期基准时间：取家庭时区的「现在」，避免 UTC 容器下日切错位。"""
    return datetime.now(resolve_business_timezone(_resolve_ops_timezone_name(ops)))


def _build_comparison_periods(granularity: str, now: datetime) -> dict[str, Any]:
    if granularity == "week":
        current_start = _monday_of(now)
        span = now - current_start
        return {
            "current": {"start": current_start, "end": now, "label": "本周"},
            "previous": {
                "start": current_start - timedelta(days=7),
                "end": current_start - timedelta(days=7) + span,
                "label": "上周",
            },
        }
    current_start = _start_of_day(now.replace(day=1))
    span = now - current_start
    prev_month_last = current_start - timedelta(days=1)
    previous_start = _start_of_day(prev_month_last.replace(day=1))
    return {
        "current": {"start": current_start, "end": now, "label": "本月"},
        "previous": {"start": previous_start, "end": previous_start + span, "label": "上月"},
    }


def _restriction_conditions(restrictions: list[str] | None) -> list[Any]:
    """把 restrictions 转为 row 级过滤条件（None 无限制；[] 全拒）。"""
    if restrictions is None:
        return []
    if not restrictions:
        return [EventLog.entity_id.in_([])]
    conditions: list[Any] = []
    for prefix in restrictions:
        if not prefix:
            continue
        if "." in prefix:
            conditions.append(EventLog.entity_id.like(f"{prefix}%"))
        else:
            conditions.append(EventLog.domain == prefix)
    return [or_(*conditions)] if conditions else [EventLog.entity_id.in_([])]


def _iso(moment: datetime | None) -> str | None:
    if moment is None:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"

class EventLogReportMixin:
    """报表层：依赖宿主注入的 ``_database`` 与 ``_ops``。"""

    # 宿主装配期注入：类体给 ``None`` 默认值，满足 ``reportUninitializedInstanceVariable``；
    # ``EventLogService.__init__`` 覆写。
    _database: Any = None
    _ops: Any = None

    def report_compare(self, compare_request: dict[str, Any]) -> dict[str, Any]:
        metric = compare_request.get("metric") or "events"
        if metric not in ("events", "energy", "environment", "device"):
            metric = "events"
        granularity = "month" if compare_request.get("granularity") == "month" else "week"
        field = compare_request.get("field") if compare_request.get("field") in ("humidity", "iaq") else "temperature"
        entity_ids = compare_request.get("entityIds")
        restrictions = compare_request.get("restrictions")
        periods = _build_comparison_periods(granularity, _report_now(self._ops))
        if metric == "environment":
            return self._build_environment_report(periods, granularity, field)
        if metric == "energy":
            return self._build_energy_report(periods, granularity, entity_ids, restrictions)
        if metric == "device":
            return self._build_device_report(periods, granularity, entity_ids, restrictions)
        return self._build_events_report(periods, granularity, entity_ids, restrictions)

    def _build_events_report(self, periods, granularity, entity_ids, restrictions) -> dict[str, Any]:
        with self._database.session_factory() as session:
            cur_series = self._aggregate_event_series(session, periods["current"], entity_ids, restrictions)
            prev_series = self._aggregate_event_series(session, periods["previous"], entity_ids, restrictions)
            cur_entities = self._aggregate_event_by_entity(session, periods["current"], entity_ids, restrictions)
            prev_entities = self._aggregate_event_by_entity(session, periods["previous"], entity_ids, restrictions)
        prev_map = dict(prev_entities)
        by_entity = [
            _build_compare_row(eid, count, prev_map.get(eid, 0), round)
            for eid, count in cur_entities
        ]
        return self._assemble_response(
            "events", granularity, None, "次", periods, cur_series, prev_series, by_entity
        )

    def _aggregate_event_series(self, session, period, entity_ids, restrictions) -> list[dict[str, Any]]:
        conditions = self._period_conditions(period, entity_ids, restrictions)
        day_expr = self._bucket_expr(EventLog.created_at, 10)
        rows = session.execute(
            select(day_expr, func.count()).where(*conditions).group_by(day_expr)
        ).all()
        mapping = {bucket_key: int(count) for bucket_key, count in rows}
        return [
            {"date": date, "label": _format_short_label(date), "value": mapping.get(date, 0)}
            for date in _build_day_labels(period["start"], period["end"])
        ]

    def _aggregate_event_by_entity(self, session, period, entity_ids, restrictions) -> list[tuple[str, int]]:
        conditions = self._period_conditions(period, entity_ids, restrictions)
        rows = session.execute(
            select(EventLog.entity_id, func.count())
            .where(*conditions)
            .group_by(EventLog.entity_id)
            .order_by(func.count().desc())
            .limit(BY_ENTITY_LIMIT)
        ).all()
        return [(bucket_key, int(count)) for bucket_key, count in rows]

    def _period_conditions(self, period, entity_ids, restrictions) -> list[Any]:
        conditions: list[Any] = [
            EventLog.created_at >= _naive_utc(period["start"]),
            EventLog.created_at < _naive_utc(period["end"]),
        ]
        conditions.extend(_restriction_conditions(restrictions))
        if entity_ids:
            conditions.append(EventLog.entity_id.in_(entity_ids))
        return conditions

    # ---- energy ----
    def _build_energy_report(self, periods, granularity, entity_ids, restrictions) -> dict[str, Any]:
        with self._database.session_factory() as session:
            ids = self._resolve_energy_entity_ids(session, entity_ids, restrictions)
            if not ids:
                empty_cur = _empty_series(periods["current"])
                empty_prev = _empty_series(periods["previous"])
                return self._assemble_response(
                    "energy", granularity, None, "kWh", periods, empty_cur, empty_prev, []
                )
            cur_rows = self._read_energy_deltas(session, periods["current"], ids)
            prev_rows = self._read_energy_deltas(session, periods["previous"], ids)
        cur_series = _to_energy_series(cur_rows, periods["current"])
        prev_series = _to_energy_series(prev_rows, periods["previous"])
        by_entity = _build_energy_by_entity(cur_rows, prev_rows, periods)
        return self._assemble_response(
            "energy", granularity, None, "kWh", periods, cur_series, prev_series, by_entity
        )

    def _resolve_energy_entity_ids(self, session, entity_ids, restrictions) -> list[str]:
        ids = [entity_id for (entity_id,) in session.execute(select(EnergyCandidateEntity.entity_id)).all()]
        if entity_ids:
            wanted = set(entity_ids)
            ids = [eid for eid in ids if eid in wanted]
        if restrictions is not None:
            ids = [eid for eid in ids if is_entity_allowed(eid, restrictions)]
        return ids

    def _bucket_expr(self, column: Any, length: int) -> Any:
        """按家庭时区取分桶键（SQLite 下先平移再截取 ISO 文本）。

        存储值是 UTC ISO 文本，直接 ``substr(col,1,N)`` 得到的是 UTC 分桶；
        家庭时区非 UTC 时需先平移（``datetime(col, '+480 minutes')``）再截取，
        否则东八区 00:00–08:00 的数据会被算进前一天，与能源日聚合、报表标签全都对不上。
        时区偏移为 0 时保持原样，避免对 UTC 部署产生任何 SQL 差异。
        """
        offset_minutes = _timezone_offset_minutes(_resolve_ops_timezone_name(self._ops))
        if offset_minutes == 0:
            return func.substr(column, 1, length)
        shifted = func.datetime(column, f"{offset_minutes:+d} minutes")
        return func.substr(shifted, 1, length)

    def _read_energy_deltas(self, session, period, ids) -> list[dict[str, Any]]:
        window_start = period["start"] - timedelta(days=7)
        timezone_name = _resolve_ops_timezone_name(self._ops)
        rows = (
            session.execute(
                select(EventLog.entity_id, EventLog.created_at, EventLog.state_diff)
                .where(
                    EventLog.created_at >= _naive_utc(window_start),
                    EventLog.created_at < _naive_utc(period["end"]),
                    EventLog.entity_id.in_(ids),
                    EventLog.state_diff.is_not(None),
                )
                .order_by(EventLog.entity_id.asc(), EventLog.created_at.asc())
            )
            .all()
        )
        # 取每 (entity, day) 末次读数，再按日序 LAG 差分
        last_by_day: dict[tuple[str, str], float] = {}
        for entity_id, created_at, state_diff in rows:
            if not state_diff or state_diff.startswith("attr:") or "→" not in state_diff:
                continue
            new_part = state_diff.split("→")[-1]
            try:
                value = float(new_part)
            except (TypeError, ValueError):
                continue
            day = str(day_expr_value(created_at, timezone_name))[:10]
            last_by_day[(entity_id, day)] = value
        grouped: dict[str, list[tuple[str, float]]] = {}
        for (entity_id, day), value in last_by_day.items():
            grouped.setdefault(entity_id, []).append((day, value))
        day_deltas: list[dict[str, Any]] = []
        for entity_id, entries in grouped.items():
            entries.sort(key=lambda entry: entry[0])
            previous: float | None = None
            for day, value in entries:
                if previous is None:
                    # 窗口内首日无前序读数：LAG 为 NULL，对齐 PG GREATEST 语义记为 0 增量
                    previous = value
                    day_deltas.append({"entityId": entity_id, "date": day, "delta": 0.0})
                    continue
                delta = value - previous if value >= previous else 0.0
                day_deltas.append({"entityId": entity_id, "date": day, "delta": delta})
                previous = value
        return day_deltas

    # ---- environment ----
    def _build_environment_report(self, periods, granularity, field) -> dict[str, Any]:
        unit = "%" if field == "humidity" else ("分" if field == "iaq" else "℃")
        column = {
            "humidity": EnvironmentRecord.humidity,
            "iaq": EnvironmentRecord.iaq_score,
            "temperature": EnvironmentRecord.temperature,
        }[field]
        with self._database.session_factory() as session:
            cur_series = self._aggregate_env_series(session, periods["current"], column)
            prev_series = self._aggregate_env_series(session, periods["previous"], column)
            cur_rooms = self._aggregate_env_by_room(session, periods["current"], column)
            prev_rooms = self._aggregate_env_by_room(session, periods["previous"], column)
        prev_map = dict(prev_rooms)
        by_entity = [
            _build_compare_row(room, avg or 0, prev_map.get(room), _round1) for room, avg in cur_rooms
        ]
        return self._assemble_response(
            "environment", granularity, field, unit, periods, cur_series, prev_series, by_entity
        )

    def _aggregate_env_series(self, session, period, column) -> list[dict[str, Any]]:
        day_expr = self._bucket_expr(EnvironmentRecord.recorded_at, 10)
        rows = session.execute(
            select(day_expr, func.avg(column))
            .where(
                EnvironmentRecord.recorded_at >= _naive_utc(period["start"]),
                EnvironmentRecord.recorded_at < _naive_utc(period["end"]),
            )
            .group_by(day_expr)
        ).all()
        mapping = {bucket_key: (None if avg is None else _round1(float(avg))) for bucket_key, avg in rows}
        return [
            {
                "date": date,
                "label": _format_short_label(date),
                "value": mapping.get(date),
            }
            for date in _build_day_labels(period["start"], period["end"])
        ]

    def _aggregate_env_by_room(self, session, period, column) -> list[tuple[str, float | None]]:
        rows = session.execute(
            select(EnvironmentRecord.room, func.avg(column))
            .where(
                EnvironmentRecord.recorded_at >= _naive_utc(period["start"]),
                EnvironmentRecord.recorded_at < _naive_utc(period["end"]),
            )
            .group_by(EnvironmentRecord.room)
            .order_by(func.avg(column).desc())
            .limit(BY_ENTITY_LIMIT)
        ).all()
        return [(bucket_key, None if avg is None else float(avg)) for bucket_key, avg in rows]

    # ---- device ----
    def _build_device_report(self, periods, granularity, entity_ids, restrictions) -> dict[str, Any]:
        with self._database.session_factory() as session:
            ids = self._resolve_device_entity_ids(session, periods, entity_ids, restrictions)
            if ids is not None and not ids:
                return self._assemble_response(
                    "device",
                    granularity,
                    None,
                    "小时",
                    periods,
                    _empty_series(periods["current"]),
                    _empty_series(periods["previous"]),
                    [],
                )
            cur_rows = self._aggregate_device_series(session, periods["current"], ids)
            prev_rows = self._aggregate_device_series(session, periods["previous"], ids)
            cur_entities = self._aggregate_device_by_entity(session, periods["current"], ids)
            prev_entities = self._aggregate_device_by_entity(session, periods["previous"], ids)
        prev_map = dict(prev_entities)
        by_entity = [
            _build_compare_row(eid, ms / 3_600_000, prev_map.get(eid, 0)) for eid, ms in cur_entities
        ]
        return self._assemble_response(
            "device",
            granularity,
            None,
            "小时",
            periods,
            _to_hours_series(cur_rows, periods["current"]),
            _to_hours_series(prev_rows, periods["previous"]),
            by_entity,
        )

    def _resolve_device_entity_ids(self, session, periods, entity_ids, restrictions) -> list[str] | None:
        if restrictions is None and not entity_ids:
            return None
        start_day = _format_day_label(periods["current"]["start"])
        end_day = _format_day_label(periods["current"]["end"])
        ids = [
            entity_id
            for (entity_id,) in session.execute(
                select(DeviceUsageStat.entity_id)
                .where(DeviceUsageStat.day >= start_day, DeviceUsageStat.day <= end_day)
                .distinct()
            ).all()
        ]
        if entity_ids:
            wanted = set(entity_ids)
            ids = [eid for eid in ids if eid in wanted]
        if restrictions is not None:
            ids = [eid for eid in ids if is_entity_allowed(eid, restrictions)]
        return ids

    def _aggregate_device_series(self, session, period, ids) -> list[tuple[str, float]]:
        start_day = _format_day_label(period["start"])
        end_day = _format_day_label(period["end"])
        conditions: list[Any] = [DeviceUsageStat.day >= start_day, DeviceUsageStat.day <= end_day]
        if ids is not None:
            conditions.append(DeviceUsageStat.entity_id.in_(ids))
        rows = session.execute(
            select(DeviceUsageStat.day, func.sum(DeviceUsageStat.total_runtime_ms))
            .where(*conditions)
            .group_by(DeviceUsageStat.day)
            .order_by(DeviceUsageStat.day.asc())
        ).all()
        return [(bucket_key, float(total or 0)) for bucket_key, total in rows]

    def _aggregate_device_by_entity(self, session, period, ids) -> list[tuple[str, float]]:
        start_day = _format_day_label(period["start"])
        end_day = _format_day_label(period["end"])
        conditions: list[Any] = [DeviceUsageStat.day >= start_day, DeviceUsageStat.day <= end_day]
        if ids is not None:
            conditions.append(DeviceUsageStat.entity_id.in_(ids))
        rows = session.execute(
            select(DeviceUsageStat.entity_id, func.sum(DeviceUsageStat.total_runtime_ms))
            .where(*conditions)
            .group_by(DeviceUsageStat.entity_id)
            .order_by(func.sum(DeviceUsageStat.total_runtime_ms).desc())
            .limit(BY_ENTITY_LIMIT)
        ).all()
        return [(bucket_key, float(total or 0)) for bucket_key, total in rows]

    # ---- 响应组装 ----
    def _assemble_response(
        self, metric, granularity, field, unit, periods, cur_series, prev_series, by_entity
    ) -> dict[str, Any]:
        def sum_of(points):
            return sum((p["value"] or 0) for p in points)

        def mean_of(points):
            values = [p["value"] for p in points if p["value"] is not None]
            return sum(values) / len(values) if values else None

        current_total = (mean_of(cur_series) or 0) if metric == "environment" else sum_of(cur_series)
        previous_total = mean_of(prev_series) if metric == "environment" else sum_of(prev_series)
        rounder = round if metric == "events" else _round2
        totals = _build_compare_row("total", current_total, previous_total, rounder)
        return {
            "metric": metric,
            "granularity": granularity,
            "field": field if metric == "environment" else None,
            "unit": unit,
            "periods": {
                "current": {
                    "start": _iso(periods["current"]["start"]),
                    "end": _iso(periods["current"]["end"]),
                    "label": periods["current"]["label"],
                },
                "previous": {
                    "start": _iso(periods["previous"]["start"]),
                    "end": _iso(periods["previous"]["end"]),
                    "label": periods["previous"]["label"],
                },
            },
            "series": {"current": cur_series, "previous": prev_series},
            "totals": totals,
            "byEntity": by_entity,
            "insights": _build_insights(metric, cur_series, by_entity),
        }

# 工具函数
def _state_text(state: Any) -> str:
    if not isinstance(state, dict):
        return "null"
    value = state.get("state")
    return "null" if value is None else str(value)


def _resolve_event_occurred_at(event: dict[str, Any]) -> datetime:
    for state in (event.get("new_state"), event.get("old_state")):
        if isinstance(state, dict):
            raw = state.get("last_changed") or state.get("last_updated")
            parsed = _parse_time(raw)
            if parsed is not None:
                return parsed
    return datetime.now(UTC)


def _parse_time(raw: Any) -> datetime | None:
    if not raw or not isinstance(raw, str):
        return None
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def _to_ms(when: datetime) -> float:
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    return when.timestamp() * 1000


def _naive_utc(when: datetime) -> datetime:
    """SQLite 存储无时区偏移，统一按 UTC naive 存取，避免比较错位。"""
    if when.tzinfo is None:
        return when
    return when.astimezone(UTC).replace(tzinfo=None)


def _full_event_row(event_log: EventLog) -> dict[str, Any]:
    return {
        "id": event_log.id,
        "entityId": event_log.entity_id,
        "oldState": _load_json(event_log.old_state),
        "newState": _load_json(event_log.new_state),
        "stateDiff": event_log.state_diff,
        "createdAt": _iso(event_log.created_at),
    }


def _load_json(raw: str | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def day_expr_value(created_at: datetime, timezone_name: str | None = None) -> str:
    """报表日键：按家庭时区（``ops.homeTimezone``）计算，与能源日聚合口径一致。

    原先固定按 UTC 分桶，会让 00:00–08:00（东八区）的读数落到前一天，
    与 ``EnergyUsageDaily``（家庭时区）对不上，日/周/月曲线整体错位。
    """
    return business_day_key(created_at, timezone_name)


def _empty_series(period) -> list[dict[str, Any]]:
    return [
        {"date": date, "label": _format_short_label(date), "value": 0}
        for date in _build_day_labels(period["start"], period["end"])
    ]


def _to_energy_series(rows: list[dict[str, Any]], period) -> list[dict[str, Any]]:
    first_day = _format_day_label(period["start"])
    mapping: dict[str, float] = {}
    for delta_row in rows:
        if delta_row["date"] < first_day:
            continue
        mapping[delta_row["date"]] = mapping.get(delta_row["date"], 0.0) + delta_row["delta"]
    return [
        {"date": date, "label": _format_short_label(date), "value": _round2(mapping.get(date, 0.0))}
        for date in _build_day_labels(period["start"], period["end"])
    ]


def _build_energy_by_entity(cur_rows, prev_rows, periods) -> list[dict[str, Any]]:
    def sum_by_entity(rows, period):
        first_day = _format_day_label(period["start"])
        mapping: dict[str, float] = {}
        for delta_row in rows:
            if delta_row["date"] < first_day:
                continue
            mapping[delta_row["entityId"]] = mapping.get(delta_row["entityId"], 0.0) + delta_row["delta"]
        return mapping

    cur = sum_by_entity(cur_rows, periods["current"])
    prev = sum_by_entity(prev_rows, periods["previous"])
    ordered = sorted(cur.items(), key=lambda entry: entry[1], reverse=True)[:BY_ENTITY_LIMIT]
    return [_build_compare_row(eid, current_total, prev.get(eid, 0)) for eid, current_total in ordered]


def _to_hours_series(rows: list[tuple[str, float]], period) -> list[dict[str, Any]]:
    mapping = {day: _round2(ms / 3_600_000) for day, ms in rows}
    return [
        {"date": date, "label": _format_short_label(date), "value": mapping.get(date, 0)}
        for date in _build_day_labels(period["start"], period["end"])
    ]


def _build_insights(metric, cur_series, by_entity) -> dict[str, Any]:
    avg_round = (
        round
        if metric == "events"
        else (_round1 if metric == "environment" else _round2)
    )
    peak_day = None
    total = 0.0
    active_days = 0
    for point in cur_series:
        value = point["value"]
        if value is None:
            continue
        if metric == "environment" or value != 0:
            active_days += 1
        total += value
        if peak_day is None or value > peak_day["value"]:
            peak_day = {"date": point["date"], "label": point["label"], "value": value}
    avg_per_day = avg_round(total / active_days) if active_days > 0 else None
    if peak_day is not None:
        peak_day = {**peak_day, "value": avg_round(peak_day["value"])}
    with_pct = [entity_row for entity_row in by_entity if entity_row.get("deltaPct") is not None]
    top_riser = top_faller = None
    for entity_row in with_pct:
        pct = entity_row["deltaPct"]
        if top_riser is None or pct > top_riser["deltaPct"]:
            top_riser = entity_row
        if top_faller is None or pct < top_faller["deltaPct"]:
            top_faller = entity_row
    return {
        "peakDay": peak_day,
        "avgPerDay": avg_per_day,
        "activeDays": active_days,
        "topRiser": top_riser,
        "topFaller": top_faller,
    }
