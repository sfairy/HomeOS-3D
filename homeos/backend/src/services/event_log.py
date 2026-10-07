"""事件日志服务（对齐 Nest ``event-log/service.ts`` + ``query.service.ts`` + ``report.service.ts``）。

职责：
- 订阅 HA 冷批状态变更，按 tier 过滤/序列化后内存缓冲，定时或满载批量写入 EventLog；
- 写入成功后按序执行能源副作用（候选表 + 日/月聚合），再写 Redis timeline（PG 为权威）；
- 提供事件历史 / 时间线 / 统计 / 周期对比报表查询，按 JWT restrictions 实施实体级 ACL；
- 提供保留策略 meta 与全量清理。

SQLite 适配：无分区/``date_trunc``，按 ``substr(createdAt, 1, N)`` 分桶（列为 ISO 文本）。
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from ..core.app_config import load_raw_config
from ..core.entity_domain import get_entity_domain
from ..core.models import (
    DeviceUsageStat,
    EnergyCandidateEntity,
    EnergyUsageDaily,
    EnergyUsageMonthly,
    EnvironmentRecord,
    EventLog,
    Notification,
    SecurityEvent,
)
from ..core.redis import RedisService
from ..core.retention import (
    DEFAULT_OPS,
    build_event_log_public_meta,
    clamp_event_log_query_hours,
    resolve_event_log_retention_days,
)
from ..realtime.access import is_entity_allowed
from .energy_meter import business_day_key, business_month_key, compute_meter_delta
from .event_log_tier import (
    build_record_filter,
    extract_event_log_state,
    get_changed_control_attr,
    is_energy_meter_entity,
    is_event_log_recordable,
    resolve_event_log_tier,
    serialize_event_log_states,
    should_skip_redis_timeline,
)

logger = logging.getLogger("homeos.event_log")

DAY_MS = 86_400_000
BY_ENTITY_LIMIT = 20


# --------------------------------------------------------------------------- #
# stateDiff 解析（对齐 util.ts parseStateDiff / mapEventLogHistoryRow）
# --------------------------------------------------------------------------- #
def parse_state_diff(state_diff: str | None) -> dict[str, str | None]:
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


def map_history_row(row: EventLog) -> dict[str, Any]:
    parsed = parse_state_diff(row.state_diff)
    return {
        "id": row.id,
        "entityId": row.entity_id,
        "state": parsed["state"],
        "oldState": parsed["oldState"],
        "attrText": parsed["attrText"],
        "stateDiff": row.state_diff,
        "createdAt": _iso(row.created_at),
    }


def resolve_event_log_time_granularity(window_hours: int) -> str:
    return "hour" if window_hours <= 48 else "day"


def build_event_log_stats(
    domain_rows: list[tuple[str, int]],
    entity_rows: list[tuple[str, int]],
    time_rows: list[tuple[str, int]],
    window_hours: int,
    now: datetime | None = None,
) -> dict[str, Any]:
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


def _build_time_series(
    rows: list[tuple[str, int]], window_hours: int, now: datetime | None = None
) -> list[dict[str, Any]]:
    granularity = resolve_event_log_time_granularity(window_hours)
    bucket_seconds = 3600 if granularity == "hour" else 86_400
    reference = now or datetime.now()
    now_ms = int(reference.timestamp() * 1000)
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


# --------------------------------------------------------------------------- #
# 周期对比报表辅助（对齐 report.service.ts）
# --------------------------------------------------------------------------- #
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


def _build_comparison_periods(granularity: str, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now()
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


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


class EventLogService:
    """事件日志缓冲写入 + 查询 + 报表 + 保留清理。"""

    def __init__(
        self,
        database,
        redis: RedisService | None = None,
        *,
        is_leader: Any = None,
        is_entity_syncable: Any = None,
    ) -> None:
        self._database = database
        self._redis = redis
        self._is_leader = is_leader or (lambda: True)
        self._is_entity_syncable = is_entity_syncable or (lambda _entity_id: True)
        self._buffer: list[dict[str, Any]] = []
        self._flush_timer: asyncio.TimerHandle | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._dropped_events = 0
        self._timeline_max = DEFAULT_OPS["eventLogTimelineMax"]
        self._pending_timeline: list[tuple[str, str, str, int]] = []
        self._ops: dict[str, Any] = dict(DEFAULT_OPS)
        self._load_ops()

    # ---- 配置 ----
    def _load_ops(self) -> dict[str, Any]:
        try:
            with self._database.session_factory() as session:
                raw = load_raw_config(session)
            section = raw.get("ops") if isinstance(raw.get("ops"), dict) else {}
            self._ops = {**DEFAULT_OPS, **section}
        except Exception:  # noqa: BLE001 - 配置不可用时用默认值
            self._ops = dict(DEFAULT_OPS)
        self._timeline_max = int(self._ops.get("eventLogTimelineMax") or 500)
        return self._ops

    @property
    def _tier_cfg(self) -> dict[str, Any]:
        return {
            "enabled": self._ops.get("eventLogTierEnabled", True) is not False,
            "tier_c_sample_rate": float(self._ops.get("eventLogTierCSampleRate") or 0),
            "skip_sensor_timeline": self._ops.get("eventLogSkipSensorTimeline", True) is not False,
        }

    def _enabled_ck(self) -> bool:
        return self._ops.get("eventLogTierEnabled", True) is False

    # ---- 保留策略 / meta ----
    def get_retention_days(self) -> int:
        with self._database.session_factory() as session:
            raw = load_raw_config(session)
        retention = raw.get("retention") if isinstance(raw.get("retention"), dict) else {}
        value = retention.get("eventLog")
        if isinstance(value, (int, float)) and value > 0:
            return resolve_event_log_retention_days(value)
        other = raw.get("other") if isinstance(raw.get("other"), dict) else {}
        return resolve_event_log_retention_days(other.get("eventlogRetentionDays"))

    def get_query_meta(self) -> dict[str, Any]:
        return build_event_log_public_meta(
            self.get_retention_days(),
            event_log_timeline_max=self._ops.get("eventLogTimelineMax"),
            event_log_timeline_hours=self._ops.get("eventLogTimelineHours"),
            event_log_overlay_hours=self._ops.get("eventLogOverlayHours"),
        )

    def _clamp_query_hours(self, hours: Any, fallback: int) -> int:
        return clamp_event_log_query_hours(hours, self.get_retention_days(), fallback)

    # ------------------------------------------------------------------ #
    # 写入流水线
    # ------------------------------------------------------------------ #
    def handle_state_change_batch(self, payload: Any) -> None:
        changes = self._extract_changes(payload)
        if not changes:
            return
        record_filter = build_record_filter(self._ops)
        tier_cfg = self._tier_cfg
        for event in changes:
            entity_id = event.get("entity_id")
            if not entity_id:
                continue
            if not self._is_entity_syncable(entity_id):
                continue
            if not is_event_log_recordable(entity_id, record_filter):
                continue
            old_s = _state_text(event.get("old_state"))
            new_s = _state_text(event.get("new_state"))
            state_diff = f"{old_s}→{new_s}"
            if old_s == new_s:
                attr_change = get_changed_control_attr(
                    entity_id, event.get("old_state"), event.get("new_state")
                )
                if not attr_change:
                    continue
                state_diff = f"attr:{attr_change}"
            if not self._is_leader():
                continue
            tier = resolve_event_log_tier(
                entity_id,
                enabled=tier_cfg["enabled"],
                tier_c_sample_rate=tier_cfg["tier_c_sample_rate"],
            )
            if tier == "skip":
                continue
            max_requeue = int(self._ops.get("eventLogMaxRequeueBuffer") or 500)
            if len(self._buffer) >= max_requeue:
                self._buffer.pop(0)
                self._dropped_events += 1
                if self._dropped_events % 100 == 1:
                    logger.error("事件日志缓冲区溢出,已丢弃 %s 条事件", self._dropped_events)
            old_state, new_state = serialize_event_log_states(event, tier)
            self._buffer.append(
                {
                    "entity_id": entity_id,
                    "old_state": old_state,
                    "new_state": new_state,
                    "state_diff": state_diff,
                    "created_at": _resolve_event_occurred_at(event),
                    "redis": None
                    if should_skip_redis_timeline(entity_id, skip_sensor_timeline=tier_cfg["skip_sensor_timeline"])
                    else (old_s, new_s),
                }
            )
            if len(self._buffer) >= int(self._ops.get("eventLogMaxBuffer") or 200):
                self._schedule_flush(immediate=True)
        self._schedule_flush()

    @staticmethod
    def _extract_changes(payload: Any) -> list[dict[str, Any]]:
        if not payload:
            return []
        if isinstance(payload, list):
            return [e for e in payload if isinstance(e, dict)]
        if isinstance(payload, dict):
            changes = payload.get("changes")
            return [e for e in changes if isinstance(e, dict)] if isinstance(changes, list) else []
        return []

    def _schedule_flush(self, immediate: bool = False) -> None:
        if not self._buffer:
            return
        loop = self._loop
        if loop is None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                # 无运行中的事件循环（同步上下文）：数据留在缓冲区，等待显式 flush / 绑定时补刷
                return
        if immediate:
            if self._flush_timer is not None:
                self._flush_timer.cancel()
                self._flush_timer = None
            self._spawn(loop, self.flush())
            return
        if self._flush_timer is not None:
            return
        interval = max(int(self._ops.get("eventLogFlushIntervalMs") or 5000), 1) / 1000

        def _fire() -> None:
            self._flush_timer = None
            self._spawn(loop, self.flush())

        self._flush_timer = loop.call_later(interval, _fire)

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """绑定运行期事件循环（lifespan 内调用），供同步上下文安全调度 flush。"""
        self._loop = loop
        if self._buffer:
            self._schedule_flush()

    def _spawn(self, loop: asyncio.AbstractEventLoop, coro) -> None:
        try:
            if asyncio.get_running_loop() is loop:
                loop.create_task(coro)
            else:
                loop.call_soon_threadsafe(lambda: loop.create_task(coro))
        except RuntimeError:
            loop.call_soon_threadsafe(lambda: loop.create_task(coro))

    async def flush(self) -> None:
        if not self._buffer:
            return
        batch = self._buffer
        self._buffer = []
        try:
            await asyncio.to_thread(self._write_batch, batch)
        except Exception as error:  # noqa: BLE001
            max_requeue = int(self._ops.get("eventLogMaxRequeueBuffer") or 500)
            room = max(0, max_requeue - len(self._buffer))
            if room > 0:
                self._buffer = batch[:room] + self._buffer
                logger.warning("批量写入事件失败: %s,已回灌 %s 条", error, min(room, len(batch)))
                self._schedule_flush()
            else:
                self._dropped_events += len(batch)
                logger.error("事件日志批量写入失败且缓冲区满: %s", error)

    def _write_batch(self, batch: list[dict[str, Any]]) -> None:
        with self._database.session_factory() as session:
            for row in batch:
                session.add(
                    EventLog(
                        entity_id=row["entity_id"],
                        domain=get_entity_domain(row["entity_id"]) or "",
                        old_state=None if row["old_state"] is None else json.dumps(row["old_state"], ensure_ascii=False),
                        new_state=None if row["new_state"] is None else json.dumps(row["new_state"], ensure_ascii=False),
                        state_diff=row["state_diff"],
                        created_at=_naive_utc(row["created_at"]),
                    )
                )
            session.commit()
        self._apply_energy_side_effects(batch)
        self._queue_timeline(batch)

    def _apply_energy_side_effects(self, batch: list[dict[str, Any]]) -> None:
        energy_ids = sorted(
            {
                row["entity_id"]
                for row in batch
                if is_energy_meter_entity(row["entity_id"]) and row["old_state"] and row["new_state"]
            }
        )
        day_totals: dict[tuple[str, str], dict[str, float]] = {}
        month_totals: dict[tuple[str, str], dict[str, float]] = {}
        # 日切/月切跟随家庭时区（ops.homeTimezone），与前端报表口径一致。
        timezone_name = str(self._ops.get("homeTimezone") or "").strip() or None
        for row in batch:
            if not is_energy_meter_entity(row["entity_id"]):
                continue
            if not row["old_state"] or not row["new_state"]:
                continue
            delta = compute_meter_delta(row["old_state"], row["new_state"])
            if delta <= 0:
                continue
            created_at = row["created_at"]
            day = business_day_key(created_at, timezone_name)
            month = business_month_key(created_at, timezone_name)
            day_entry = day_totals.setdefault((row["entity_id"], day), {"kwh": 0.0, "count": 0})
            day_entry["kwh"] += delta
            day_entry["count"] += 1
            month_entry = month_totals.setdefault(
                (row["entity_id"], month), {"kwh": 0.0, "count": 0}
            )
            month_entry["kwh"] += delta
            month_entry["count"] += 1
        if not energy_ids and not day_totals and not month_totals:
            return
        try:
            with self._database.session_factory() as session:
                for entity_id in energy_ids:
                    existing = session.get(EnergyCandidateEntity, entity_id)
                    if existing is None:
                        session.add(EnergyCandidateEntity(entity_id=entity_id))
                for (entity_id, day), value in day_totals.items():
                    row = session.execute(
                        select(EnergyUsageDaily).where(
                            EnergyUsageDaily.entity_id == entity_id, EnergyUsageDaily.day == day
                        )
                    ).scalar_one_or_none()
                    if row is None:
                        session.add(
                            EnergyUsageDaily(
                                entity_id=entity_id,
                                day=day,
                                kwh=value["kwh"],
                                sample_count=int(value["count"]),
                            )
                        )
                    else:
                        row.kwh += value["kwh"]
                        row.sample_count += int(value["count"])
                for (entity_id, month), value in month_totals.items():
                    row = session.execute(
                        select(EnergyUsageMonthly).where(
                            EnergyUsageMonthly.entity_id == entity_id,
                            EnergyUsageMonthly.month == month,
                        )
                    ).scalar_one_or_none()
                    if row is None:
                        session.add(
                            EnergyUsageMonthly(
                                entity_id=entity_id,
                                month=month,
                                kwh=value["kwh"],
                                sample_count=int(value["count"]),
                            )
                        )
                    else:
                        row.kwh += value["kwh"]
                        row.sample_count += int(value["count"])
                session.commit()
        except Exception as error:  # noqa: BLE001 - 副作用失败不影响事件写入
            logger.warning("能源副作用维护失败: %s", error)

    def _queue_timeline(self, batch: list[dict[str, Any]]) -> None:
        for row in batch:
            redis_pair = row["redis"]
            if not redis_pair:
                continue
            self._pending_timeline.append(
                (row["entity_id"], redis_pair[0], redis_pair[1], int(_to_ms(row["created_at"])))
            )
        if self._redis is not None and self._redis.is_ready():
            loop = self._loop
            if loop is not None:
                self._spawn(loop, self._flush_pending_timeline())
            else:
                try:
                    self._spawn(asyncio.get_running_loop(), self._flush_pending_timeline())
                except RuntimeError:
                    pass

    async def _flush_pending_timeline(self) -> None:
        if self._redis is None or not self._redis.is_ready():
            return
        client = self._redis.get_client()
        if client is None:
            return
        pending, self._pending_timeline = self._pending_timeline, []
        if not pending:
            return
        try:
            entity_keys: set[str] = set()
            pipe = client.pipeline()
            for entity_id, _old_s, new_s, ts in pending:
                state = extract_event_log_state({"state": new_s})
                if state is None:
                    continue
                snapshot = json.dumps(
                    {"entity_id": entity_id, "state": state, "ts": ts}, ensure_ascii=False
                )
                entity_key = f"timeline:entity:{entity_id}"
                entity_keys.add(entity_key)
                pipe.zadd(entity_key, {snapshot: ts})
                pipe.zadd("timeline:all", {snapshot: ts})
            if entity_keys:
                for key in entity_keys:
                    pipe.zremrangebyrank(key, 0, -(self._timeline_max + 1))
                pipe.zremrangebyrank("timeline:all", 0, -(self._timeline_max * 10 + 1))
            await pipe.execute()
        except Exception as error:  # noqa: BLE001
            logger.warning("事件时间线写入 Redis 失败: %s", error)

    # ------------------------------------------------------------------ #
    # 查询
    # ------------------------------------------------------------------ #
    def query_history(
        self,
        entity_id: str | None = None,
        hours: int = 24,
        limit: int = 20,
        page: int = 1,
        restrictions: list[str] | None = None,
        domain: str | None = None,
    ) -> dict[str, Any]:
        window_hours = self._clamp_query_hours(hours, 24)
        since = datetime.now(UTC) - timedelta(hours=window_hours)
        page_size = min(max(int(limit or 20), 5), 200)
        current_page = max(int(page or 1), 1)
        skip = (current_page - 1) * page_size
        with self._database.session_factory() as session:
            conditions = self._history_conditions(since, restrictions, entity_id, domain)
            total = session.execute(
                select(func.count()).select_from(EventLog).where(*conditions)
            ).scalar_one()
            rows = (
                session.execute(
                    select(EventLog)
                    .where(*conditions)
                    .order_by(EventLog.created_at.desc())
                    .offset(skip)
                    .limit(page_size)
                )
                .scalars()
                .all()
            )
        return {
            "total": int(total),
            "page": current_page,
            "pageSize": page_size,
            "totalPages": (int(total) + page_size - 1) // page_size,
            "events": [map_history_row(row) for row in rows],
        }

    def _history_conditions(
        self,
        since: datetime,
        restrictions: list[str] | None,
        entity_id: str | None,
        domain: str | None,
    ) -> list[Any]:
        conditions: list[Any] = [EventLog.created_at >= _naive_utc(since)]
        conditions.extend(_restriction_conditions(restrictions))
        if entity_id:
            conditions.append(EventLog.entity_id == entity_id)
        if domain:
            conditions.append(EventLog.domain == domain)
        return conditions

    def query_timeline_events(
        self,
        entity_ids: list[str],
        hours: int = 12,
        limit: int = 60,
        restrictions: list[str] | None = None,
        include_full_state: bool = False,
    ) -> dict[str, Any]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in entity_ids:
            value = (raw or "").strip()
            if value and value not in seen:
                seen.add(value)
                cleaned.append(value)
        cleaned = cleaned[:30]
        if restrictions is not None:
            cleaned = [eid for eid in cleaned if is_entity_allowed(eid, restrictions)]
        if not cleaned:
            return {"events": []}
        meta = self.get_query_meta()
        window_hours = self._clamp_query_hours(hours, meta["timelineHours"])
        since = datetime.now(UTC) - timedelta(hours=window_hours)
        max_take = meta["timelineLimit"] if meta["timelineLimit"] > 0 else 80
        take = min(max(int(limit or 60), 1), max_take)
        with self._database.session_factory() as session:
            rows = (
                session.execute(
                    select(EventLog)
                    .where(EventLog.created_at >= _naive_utc(since), EventLog.entity_id.in_(cleaned))
                    .order_by(EventLog.created_at.desc())
                    .limit(take)
                )
                .scalars()
                .all()
            )
        if include_full_state:
            return {"events": [_full_event_row(row) for row in rows]}
        return {"events": [map_history_row(row) for row in rows]}

    def get_stats(
        self,
        hours: int = 24,
        restrictions: list[str] | None = None,
        entity_id: str | None = None,
        domain: str | None = None,
    ) -> dict[str, Any]:
        window_hours = self._clamp_query_hours(hours, 24)
        since = datetime.now(UTC) - timedelta(hours=window_hours)
        granularity = resolve_event_log_time_granularity(window_hours)
        bucket_expr = func.substr(EventLog.created_at, 1, 13 if granularity == "hour" else 10)
        conditions: list[Any] = [EventLog.created_at >= _naive_utc(since)]
        conditions.extend(_restriction_conditions(restrictions))
        if entity_id:
            conditions.append(EventLog.entity_id == entity_id)
        if domain:
            conditions.append(EventLog.domain == domain)
        with self._database.session_factory() as session:
            domain_rows = [
                (row[0], int(row[1]))
                for row in session.execute(
                    select(EventLog.domain, func.count())
                    .where(*conditions)
                    .group_by(EventLog.domain)
                    .order_by(func.count().desc())
                ).all()
            ]
            entity_rows = [
                (row[0], int(row[1]))
                for row in session.execute(
                    select(EventLog.entity_id, func.count())
                    .where(*conditions)
                    .group_by(EventLog.entity_id)
                    .order_by(func.count().desc())
                    .limit(10)
                ).all()
            ]
            time_rows = [
                (row[0], int(row[1]))
                for row in session.execute(
                    select(bucket_expr, func.count())
                    .where(*conditions)
                    .group_by(bucket_expr)
                    .order_by(bucket_expr.asc())
                ).all()
            ]
        return build_event_log_stats(domain_rows, entity_rows, time_rows, window_hours)

    # ------------------------------------------------------------------ #
    # 清理
    # ------------------------------------------------------------------ #
    def clear_all_records(self) -> dict[str, Any]:
        batch_size = int(self._ops.get("retentionDeleteBatchSize") or 800)
        deleted = 0
        with self._database.session_factory() as session:
            for _ in range(500):
                ids = [
                    row[0]
                    for row in session.execute(
                        select(EventLog.id).order_by(EventLog.id.asc()).limit(batch_size)
                    ).all()
                ]
                if not ids:
                    break
                result = session.execute(delete(EventLog).where(EventLog.id.in_(ids)))
                deleted += int(result.rowcount or 0)
                session.commit()
                if len(ids) < batch_size:
                    break
        self._buffer = []
        if self._flush_timer is not None:
            self._flush_timer.cancel()
            self._flush_timer = None
        self._pending_timeline = []
        redis_keys_removed = self._clear_redis_timeline()
        return {"deleted": deleted, "redisKeysRemoved": redis_keys_removed}

    def _clear_redis_timeline(self) -> int:
        if self._redis is None or not self._redis.is_ready():
            return 0
        client = self._redis.get_client()
        if client is None:
            return 0
        try:
            return int(client.delete("timeline:all", "stream:ha_events"))
        except Exception as error:  # noqa: BLE001
            logger.warning("事件日志 Redis 时间线清理失败: %s", error)
            return 0

    def force_clean(self) -> dict[str, Any]:
        """执行一次保留清理（覆盖 5 张保留表），返回 RetentionCleanupResult 结构。"""
        with self._database.session_factory() as session:
            raw = load_raw_config(session)
        retention_cfg = raw.get("retention") if isinstance(raw.get("retention"), dict) else {}
        base_days = resolve_event_log_retention_days(retention_cfg.get("eventLog"))
        batch_size = int(self._ops.get("retentionDeleteBatchSize") or 800)
        cutoff = datetime.now(UTC) - timedelta(days=base_days)
        steps = [
            ("eventLog", EventLog),
            ("notification", Notification),
            ("securityEvent", SecurityEvent),
        ]
        deleted: dict[str, int] = {}
        for key, model in steps:
            try:
                count = self._batch_delete(session, model, cutoff, batch_size)
                if count:
                    deleted[key] = count
            except Exception as error:  # noqa: BLE001 - 单表失败不阻塞
                logger.warning("清理 %s 失败: %s", key, error)
                session.rollback()
        total = sum(deleted.values())
        return {
            "retentionDays": base_days,
            "cutoff": _iso(datetime.now(UTC) - timedelta(days=base_days)),
            "deleted": deleted,
            "total": total,
        }

    @staticmethod
    def _batch_delete(session: Session, model, cutoff: datetime, batch_size: int) -> int:
        total = 0
        for _ in range(500):
            ids = [
                row[0]
                for row in session.execute(
                    select(model.id)
                    .where(model.created_at < _naive_utc(cutoff))
                    .order_by(model.id.asc())
                    .limit(batch_size)
                ).all()
            ]
            if not ids:
                break
            result = session.execute(delete(model).where(model.id.in_(ids)))
            total += int(result.rowcount or 0)
            session.commit()
            if len(ids) < batch_size:
                break
        return total

    # ------------------------------------------------------------------ #
    # 周期对比报表
    # ------------------------------------------------------------------ #
    def report_compare(self, payload: dict[str, Any]) -> dict[str, Any]:
        metric = payload.get("metric") or "events"
        if metric not in ("events", "energy", "environment", "device"):
            metric = "events"
        granularity = "month" if payload.get("granularity") == "month" else "week"
        field = payload.get("field") if payload.get("field") in ("humidity", "iaq") else "temperature"
        entity_ids = payload.get("entityIds")
        restrictions = payload.get("restrictions")
        periods = _build_comparison_periods(granularity)
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
        prev_map = {eid: count for eid, count in prev_entities}
        by_entity = [
            _build_compare_row(eid, count, prev_map.get(eid, 0), lambda n: int(round(n)))
            for eid, count in cur_entities
        ]
        return self._assemble_response(
            "events", granularity, None, "次", periods, cur_series, prev_series, by_entity
        )

    def _aggregate_event_series(self, session, period, entity_ids, restrictions) -> list[dict[str, Any]]:
        conditions = self._period_conditions(period, entity_ids, restrictions)
        day_expr = func.substr(EventLog.created_at, 1, 10)
        rows = session.execute(
            select(day_expr, func.count()).where(*conditions).group_by(day_expr)
        ).all()
        mapping = {row[0]: int(row[1]) for row in rows}
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
        return [(row[0], int(row[1])) for row in rows]

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
        ids = [row[0] for row in session.execute(select(EnergyCandidateEntity.entity_id)).all()]
        if entity_ids:
            wanted = set(entity_ids)
            ids = [eid for eid in ids if eid in wanted]
        if restrictions is not None:
            ids = [eid for eid in ids if is_entity_allowed(eid, restrictions)]
        return ids

    def _read_energy_deltas(self, session, period, ids) -> list[dict[str, Any]]:
        window_start = period["start"] - timedelta(days=7)
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
            day = str(day_expr_value(created_at))[:10]
            last_by_day[(entity_id, day)] = value
        grouped: dict[str, list[tuple[str, float]]] = {}
        for (entity_id, day), value in last_by_day.items():
            grouped.setdefault(entity_id, []).append((day, value))
        out: list[dict[str, Any]] = []
        for entity_id, entries in grouped.items():
            entries.sort(key=lambda item: item[0])
            previous: float | None = None
            for day, value in entries:
                if previous is None:
                    # 窗口内首日无前序读数：LAG 为 NULL，对齐 PG GREATEST 语义记为 0 增量
                    previous = value
                    out.append({"entityId": entity_id, "date": day, "delta": 0.0})
                    continue
                delta = value - previous if value >= previous else 0.0
                out.append({"entityId": entity_id, "date": day, "delta": delta})
                previous = value
        return out

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
        prev_map = {room: avg for room, avg in prev_rooms}
        by_entity = [
            _build_compare_row(room, avg or 0, prev_map.get(room), _round1) for room, avg in cur_rooms
        ]
        return self._assemble_response(
            "environment", granularity, field, unit, periods, cur_series, prev_series, by_entity
        )

    def _aggregate_env_series(self, session, period, column) -> list[dict[str, Any]]:
        day_expr = func.substr(EnvironmentRecord.recorded_at, 1, 10)
        rows = session.execute(
            select(day_expr, func.avg(column))
            .where(
                EnvironmentRecord.recorded_at >= _naive_utc(period["start"]),
                EnvironmentRecord.recorded_at < _naive_utc(period["end"]),
            )
            .group_by(day_expr)
        ).all()
        mapping = {row[0]: (None if row[1] is None else _round1(float(row[1]))) for row in rows}
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
        return [(row[0], None if row[1] is None else float(row[1])) for row in rows]

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
        prev_map = {eid: ms for eid, ms in prev_entities}
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
            row[0]
            for row in session.execute(
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
        return [(row[0], float(row[1] or 0)) for row in rows]

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
        return [(row[0], float(row[1] or 0)) for row in rows]

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
        rounder = (lambda n: int(round(n))) if metric == "events" else _round2
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


# --------------------------------------------------------------------------- #
# 工具函数
# --------------------------------------------------------------------------- #
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


def _full_event_row(row: EventLog) -> dict[str, Any]:
    return {
        "id": row.id,
        "entityId": row.entity_id,
        "oldState": _load_json(row.old_state),
        "newState": _load_json(row.new_state),
        "stateDiff": row.state_diff,
        "createdAt": _iso(row.created_at),
    }


def _load_json(raw: str | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def day_expr_value(created_at: datetime) -> str:
    return _naive_utc(created_at).strftime("%Y-%m-%d")


def _empty_series(period) -> list[dict[str, Any]]:
    return [
        {"date": date, "label": _format_short_label(date), "value": 0}
        for date in _build_day_labels(period["start"], period["end"])
    ]


def _to_energy_series(rows: list[dict[str, Any]], period) -> list[dict[str, Any]]:
    first_day = _format_day_label(period["start"])
    mapping: dict[str, float] = {}
    for row in rows:
        if row["date"] < first_day:
            continue
        mapping[row["date"]] = mapping.get(row["date"], 0.0) + row["delta"]
    return [
        {"date": date, "label": _format_short_label(date), "value": _round2(mapping.get(date, 0.0))}
        for date in _build_day_labels(period["start"], period["end"])
    ]


def _build_energy_by_entity(cur_rows, prev_rows, periods) -> list[dict[str, Any]]:
    def sum_by_entity(rows, period):
        first_day = _format_day_label(period["start"])
        mapping: dict[str, float] = {}
        for row in rows:
            if row["date"] < first_day:
                continue
            mapping[row["entityId"]] = mapping.get(row["entityId"], 0.0) + row["delta"]
        return mapping

    cur = sum_by_entity(cur_rows, periods["current"])
    prev = sum_by_entity(prev_rows, periods["previous"])
    ordered = sorted(cur.items(), key=lambda item: item[1], reverse=True)[:BY_ENTITY_LIMIT]
    return [_build_compare_row(eid, value, prev.get(eid, 0)) for eid, value in ordered]


def _to_hours_series(rows: list[tuple[str, float]], period) -> list[dict[str, Any]]:
    mapping = {day: _round2(ms / 3_600_000) for day, ms in rows}
    return [
        {"date": date, "label": _format_short_label(date), "value": mapping.get(date, 0)}
        for date in _build_day_labels(period["start"], period["end"])
    ]


def _build_insights(metric, cur_series, by_entity) -> dict[str, Any]:
    avg_round = (
        (lambda n: int(round(n)))
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
    with_pct = [row for row in by_entity if row.get("deltaPct") is not None]
    top_riser = top_faller = None
    for row in with_pct:
        pct = row["deltaPct"]
        if top_riser is None or pct > top_riser["deltaPct"]:
            top_riser = row
        if top_faller is None or pct < top_faller["deltaPct"]:
            top_faller = row
    return {
        "peakDay": peak_day,
        "avgPerDay": avg_per_day,
        "activeDays": active_days,
        "topRiser": top_riser,
        "topFaller": top_faller,
    }
