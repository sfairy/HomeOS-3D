"""事件日志服务（对齐 Nest ``event-log/service.ts`` + ``query.service.ts`` + ``report.service.ts``）。"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select

from .event_log_tier import (
    build_record_filter,
    get_changed_control_attr,
    is_energy_meter_state,
    is_event_log_recordable,
    resolve_event_log_tier,
    serialize_event_log_states,
)
from ..client_power.energy_meter import (
    normalize_meter_scope,
)
from ...platform.core.db.models import (
    EnergyCandidateEntity,
    EnergyUsageDaily,
    EnergyUsageMonthly,
    EventLog,
)
from ...platform.core.db.retention import (
    DEFAULT_OPS,
    build_event_log_public_meta,
    clamp_event_log_query_hours,
    resolve_event_log_retention_days,
)
from ...platform.core.entity.entity_domain import get_entity_domain
from ...platform.core.runtime.app_config import load_raw_config
from ...platform.security.entity_access import is_entity_allowed

logger = logging.getLogger("homeos.event_log")

from .event_log_report import (
    EventLogReportMixin,
    EventLogStatsPayload,
    _full_event_row,
    _naive_utc,
    _report_now,
    _resolve_event_occurred_at,
    _resolve_ops_timezone_name,
    _restriction_conditions,
    _state_text,
    build_event_log_stats,
    map_history_row,
    resolve_event_log_time_granularity,
)

#: `clear_all_records` 的批数上限（批大小见 ops 的 `retentionDeleteBatchSize`，默认 800）。
#: 触顶不是错误（库里可能真有上百万行），但必须把 `complete=False` 如实返回给调用方。
CLEAR_ALL_MAX_BATCHES = 500


from .energy_aggregate import (
    _merge_backfill_daily,
    _merge_backfill_monthly,
    _normalize_backfill_totals,
    _register_backfill_candidates,
    accumulate_energy_totals,
)


class EventLogService(EventLogReportMixin):
    """事件日志缓冲写入 + 查询 + 报表 + 保留清理。"""

    def __init__(
        self,
        database,
        *,
        is_leader: Any = None,
        is_entity_syncable: Any = None,
        energy_primary_entities: Any = None,
        energy_bindings: Any = None,
    ) -> None:
        self._database = database
        self._is_leader = is_leader or (lambda: True)
        self._is_entity_syncable = is_entity_syncable or (lambda _entity_id: True)
        #: 返回「应计入总耗的电表集合」；为空集合时回退到全量识别（老装机无绑定）。
        self._energy_primary_entities = energy_primary_entities or set
        #: 返回能源绑定全貌（主表/口径/日表/月表），决定每一档粒度的权威读数来源。
        self._energy_bindings = energy_bindings
        self._buffer: list[dict[str, Any]] = []
        self._flush_timer: asyncio.TimerHandle | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._dropped_events = 0
        #: 批量写入与「清空全部」串行化用的跨线程锁（两者都跑在工作线程里）。
        self._write_lock = threading.Lock()
        #: 清空世代。写批次提交前比对世代，若期间发生过清空就丢弃该批 —— 否则一个在
        #: 清空之前抓取的批次会在删除之后提交，把刚清掉的记录重新写回去。
        self._clear_epoch = 0
        self._ops: dict[str, Any] = dict(DEFAULT_OPS)
        self._load_ops()

    # ---- 配置 ----
    def _load_ops(self) -> dict[str, Any]:
        try:
            with self._database.session_factory() as session:
                raw = load_raw_config(session)
            ops_source = raw.get("ops")
            section = ops_source if isinstance(ops_source, dict) else {}
            self._ops = {**DEFAULT_OPS, **section}
        except Exception:
            self._ops = dict(DEFAULT_OPS)
        return self._ops

    @property
    def _tier_cfg(self) -> dict[str, Any]:
        return {
            "enabled": self._ops.get("eventLogTierEnabled", True) is not False,
            "tier_c_sample_rate": float(self._ops.get("eventLogTierCSampleRate") or 0),
        }

    def _enabled_ck(self) -> bool:
        return self._ops.get("eventLogTierEnabled", True) is False

    # ---- 保留策略 / meta ----
    def get_retention_days(self) -> int:
        with self._database.session_factory() as session:
            raw = load_raw_config(session)
        retention_source = raw.get("retention")
        retention = retention_source if isinstance(retention_source, dict) else {}
        value = retention.get("eventLog")
        if isinstance(value, (int, float)) and value > 0:
            return resolve_event_log_retention_days(value)
        other_source = raw.get("other")
        other = other_source if isinstance(other_source, dict) else {}
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

    def handle_state_change_batch(self, batch: Any) -> None:
        changes = self._extract_changes(batch)
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
                attr_change = get_changed_control_attr(entity_id, event.get("old_state"), event.get("new_state"))
                if not attr_change:
                    continue
                state_diff = f"attr:{attr_change}"
            if not self._is_leader():
                continue
            tier = resolve_event_log_tier(
                entity_id,
                enabled=tier_cfg["enabled"],
                tier_c_sample_rate=tier_cfg["tier_c_sample_rate"],
                old_state=event.get("old_state"),
                new_state=event.get("new_state"),
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
                }
            )
            if len(self._buffer) >= int(self._ops.get("eventLogMaxBuffer") or 200):
                self._schedule_flush(immediate=True)
        self._schedule_flush()

    @staticmethod
    def _extract_changes(batch: Any) -> list[dict[str, Any]]:
        if not batch:
            return []
        if isinstance(batch, list):
            return [e for e in batch if isinstance(e, dict)]
        if isinstance(batch, dict):
            changes = batch.get("changes")
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
        # 抓取世代：若提交前发生过「清空全部」，这一批就已经过时，必须丢弃。
        epoch = self._clear_epoch
        self._buffer = []
        try:
            await asyncio.to_thread(self._write_batch, batch, epoch)
        except Exception as error:
            max_requeue = int(self._ops.get("eventLogMaxRequeueBuffer") or 500)
            room = max(0, max_requeue - len(self._buffer))
            if room > 0:
                self._buffer = batch[:room] + self._buffer
                logger.warning("批量写入事件失败: %s,已回灌 %s 条", error, min(room, len(batch)))
                self._schedule_flush()
            else:
                self._dropped_events += len(batch)
                logger.error("事件日志批量写入失败且缓冲区满: %s", error)

    def _write_batch(self, batch: list[dict[str, Any]], epoch: int) -> None:
        with self._write_lock:
            # 世代比对与提交必须在同一把锁内：否则「比对通过 → 清空删除 → 本批提交」
            # 仍会把过时的记录写回一个刚被清空的库，而接口已经报过 complete。
            if epoch != self._clear_epoch:
                logger.info("清空事件日志期间丢弃过时批次 %s 条", len(batch))
                return
            with self._database.session_factory() as session:
                for row in batch:
                    session.add(
                        EventLog(
                            entity_id=row["entity_id"],
                            domain=get_entity_domain(row["entity_id"]) or "",
                            old_state=None
                            if row["old_state"] is None
                            else json.dumps(row["old_state"], ensure_ascii=False),
                            new_state=None
                            if row["new_state"] is None
                            else json.dumps(row["new_state"], ensure_ascii=False),
                            state_diff=row["state_diff"],
                            created_at=_naive_utc(row["created_at"]),
                        )
                    )
                session.commit()
        self._apply_energy_side_effects(batch)

    def _resolve_energy_primary_entities(self) -> set[str]:
        """本次应计入总耗的电表集合；未绑定主电表时返回空集合（调用方回退全量）。"""
        try:
            return {str(item).strip() for item in (self._energy_primary_entities() or ()) if str(item).strip()}
        except Exception as error:  # 配置读取失败不该带塌能耗聚合
            logger.debug("能耗主电表读取失败，回退全量识别: %s", error)
            return set()

    def _resolve_energy_bindings(self) -> dict[str, str]:
        """能源绑定全貌：``{primary, scope, day, month}``。

        未注入 bindings 时只保留主表集合（老调用方/测试），口径按 ``total`` 处理、
        不启用日/月权威表 —— 行为与只有主表时完全一致。
        """
        if self._energy_bindings is None:
            primary = self._resolve_energy_primary_entities()
            only = next(iter(primary)) if len(primary) == 1 else ""
            return {"primary": only, "scope": "total", "day": "", "month": ""}
        try:
            raw = self._energy_bindings() or {}
        except Exception as error:  # 配置读取失败时退回「只有主表」的保守口径
            logger.debug("能耗绑定读取失败，按主表保守处理: %s", error)
            raw = {}
        return {
            "primary": str(raw.get("primary") or "").strip(),
            "scope": normalize_meter_scope(raw.get("scope")),
            "day": str(raw.get("day") or "").strip(),
            "month": str(raw.get("month") or "").strip(),
        }

    def _apply_energy_side_effects(self, batch: list[dict[str, Any]]) -> None:
        energy_ids = sorted(
            {
                row["entity_id"]
                for row in batch
                if is_energy_meter_state(row["entity_id"], row["old_state"], row["new_state"])
                and row["old_state"]
                and row["new_state"]
            }
        )
        # 日切/月切跟随家庭时区（ops.homeTimezone），与前端报表口径一致。
        timezone_name = _resolve_ops_timezone_name(self._ops)
        # 绑定了主电表就只聚它：HA 里同表的日/月/年累计与各回路电量表都算进来，
        # 会让「今日用电」凭空翻几倍。未绑定时（老装机）保持全量识别。
        day_totals, month_totals, reset_count = accumulate_energy_totals(
            batch,
            self._resolve_energy_primary_entities(),
            self._resolve_energy_bindings(),
            timezone_name,
        )
        if reset_count:
            logger.info(
                "检测到电量表底重置: %s（该区间按重置后累积量计入日/月用电）",
                ", ".join(f"{entity_id}×{count}" for entity_id, count in reset_count.items()),
            )
        if not energy_ids and not day_totals and not month_totals:
            return
        try:
            with self._database.session_factory() as session:
                if energy_ids:
                    known_ids = set(
                        session.scalars(
                            select(EnergyCandidateEntity.entity_id).where(
                                EnergyCandidateEntity.entity_id.in_(list(energy_ids))
                            )
                        )
                    )
                    session.add_all(
                        EnergyCandidateEntity(entity_id=entity_id)
                        for entity_id in energy_ids
                        if entity_id not in known_ids
                    )
                # 一次取回本批涉及的日/月聚合行：旧实现对每个 (实体, 日) 各查一次，
                # 一次同步几十个实体 × 多个自然日就是几十次数据库往返。
                daily_rows: dict[tuple[Any, Any], EnergyUsageDaily] = {}
                if day_totals:
                    daily_rows = {
                        (row.entity_id, row.day): row
                        for row in session.scalars(
                            select(EnergyUsageDaily).where(
                                EnergyUsageDaily.entity_id.in_({entity_id for entity_id, _ in day_totals}),
                                EnergyUsageDaily.day.in_({day for _, day in day_totals}),
                            )
                        )
                    }
                monthly_rows: dict[tuple[Any, Any], EnergyUsageMonthly] = {}
                if month_totals:
                    monthly_rows = {
                        (row.entity_id, row.month): row
                        for row in session.scalars(
                            select(EnergyUsageMonthly).where(
                                EnergyUsageMonthly.entity_id.in_({entity_id for entity_id, _ in month_totals}),
                                EnergyUsageMonthly.month.in_({month for _, month in month_totals}),
                            )
                        )
                    }
                for (entity_id, day), value in day_totals.items():
                    row = daily_rows.get((entity_id, day))
                    if row is None:
                        row = EnergyUsageDaily(
                            entity_id=entity_id,
                            day=day,
                            kwh=value["kwh"],
                            sample_count=int(value["count"]),
                        )
                        daily_rows[(entity_id, day)] = row
                        session.add(row)
                    elif value.get("mode") == "reading":
                        # 权威读数直接覆盖：同一周期内读数单调递增，覆盖不会丢量，
                        # 也不会把「先差分、后补绑权威表」的当天用量叠加成两倍。
                        row.kwh = value["kwh"]
                        row.sample_count = max(row.sample_count, int(value["count"]))
                    else:
                        row.kwh += value["kwh"]
                        row.sample_count += int(value["count"])
                for (entity_id, month), value in month_totals.items():
                    row = monthly_rows.get((entity_id, month))
                    if row is None:
                        row = EnergyUsageMonthly(
                            entity_id=entity_id,
                            month=month,
                            kwh=value["kwh"],
                            sample_count=int(value["count"]),
                        )
                        monthly_rows[(entity_id, month)] = row
                        session.add(row)
                    elif value.get("mode") == "reading":
                        row.kwh = value["kwh"]
                        row.sample_count = max(row.sample_count, int(value["count"]))
                    else:
                        row.kwh += value["kwh"]
                        row.sample_count += int(value["count"])
                session.commit()
        except Exception as error:
            logger.warning("能源副作用维护失败: %s", error)

    # ---- 能耗历史回填 ----
    def ops_timezone_name(self) -> str | None:
        """家庭业务时区（能耗日切/月切口径，取自 ``ops.homeTimezone``）。"""
        return _resolve_ops_timezone_name(self._ops)

    def apply_energy_backfill(self, totals: dict[str, dict[str, float]]) -> dict[str, int]:
        """把历史差分算出的 (实体, 日) 用电量合并进日/月聚合表。

        合并口径是「只增不减」（``max``）：实时事件链路可能已经为同一天写过一部分增量，
        回填只负责补上漏掉的部分，重复执行不会把用电量翻倍。月份总量在日行落库后按**当月
        全部日行**重新求和 —— 回填窗口常常只覆盖当月的一部分天，直接累加窗口内数值会把
        月总量写小。
        """
        day_values = _normalize_backfill_totals(totals)
        if not day_values:
            return {"daily": 0, "monthly": 0, "entities": 0}
        # 回填同样只认主电表，否则「日/月/年累计 + 各回路表」会被各写一份日行，
        # 与实时链路口径不一致、也让报表总量重复。
        primary_entities = self._resolve_energy_primary_entities()
        if primary_entities:
            day_values = {key: value for key, value in day_values.items() if key[0] in primary_entities}
            if not day_values:
                return {"daily": 0, "monthly": 0, "entities": 0}
        entities = sorted({entity_id for entity_id, _ in day_values})
        days = sorted({day for _, day in day_values})
        months = sorted({day[:7] for day in days})
        try:
            with self._database.session_factory() as session:
                _register_backfill_candidates(session, entities)
                daily_written = _merge_backfill_daily(session, day_values, entities, days)
                session.flush()
                monthly_written = _merge_backfill_monthly(session, entities, months)
                session.commit()
        except Exception as error:
            logger.warning("能耗历史回填落库失败: %s", error)
            return {"daily": 0, "monthly": 0, "entities": 0}
        return {"daily": daily_written, "monthly": monthly_written, "entities": len(entities)}

    # 查询
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
            total = session.execute(select(func.count()).select_from(EventLog).where(*conditions)).scalar_one()
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
    ) -> EventLogStatsPayload:
        # 「现在」取家庭时区的墙钟并贯穿到聚合：分桶键是家庭时区文本，坐标轴必须同坐标。
        now = _report_now(self._ops)
        window_hours = self._clamp_query_hours(hours, 24)
        since = now - timedelta(hours=window_hours)
        granularity = resolve_event_log_time_granularity(window_hours)
        bucket_expr = self._bucket_expr(EventLog.created_at, 13 if granularity == "hour" else 10)
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
        return build_event_log_stats(domain_rows, entity_rows, time_rows, window_hours, now)

    # 清理
    def clear_all_records(self) -> dict[str, Any]:
        """清空全部事件记录（分批删除），返回 ``deleted`` 与 ``complete``。

        ``complete`` 是必须有的：批数有**上限**（`CLEAR_ALL_MAX_BATCHES` × 批大小），
        触顶时库里仍有记录。只返回条数会让界面按「已清空」提示用户，实际却还剩一大截，
        且没有任何地方能察觉。触顶与否用一次 `LIMIT 1` 探针判定，
        比 `count(*)` 便宜得多。

        删除与批量写入共用 ``_write_lock`` 并借 ``_clear_epoch`` 作废在途批次：否则一个
        在清空之前抓取的批次会在删除**之后**提交，把刚清掉的记录重新写回去，而这里已经
        返回了 ``complete=True``。
        """
        batch_size = int(self._ops.get("retentionDeleteBatchSize") or 800)
        deleted = 0
        complete = True
        # 与 _write_batch 共用一把锁：进入临界区先递增世代（让在途批次作废），再删除。
        # 这样无论谁先拿到锁，结果都一致 —— 先写的批次会被随后的删除清掉，后到的过时
        # 批次会因世代不符而丢弃，不会出现「报已清空、记录又回来」。
        with self._write_lock:
            self._clear_epoch += 1
            with self._database.session_factory() as session:
                for _ in range(CLEAR_ALL_MAX_BATCHES):
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
                else:
                    complete = session.execute(select(EventLog.id).limit(1)).first() is None
        if not complete:
            logger.warning(
                "清空事件日志触顶：%s 批 × %s 行，仍有记录未删除（需再执行一次或交由保留策略清理）",
                CLEAR_ALL_MAX_BATCHES,
                batch_size,
            )
        self._buffer = []
        if self._flush_timer is not None:
            self._flush_timer.cancel()
            self._flush_timer = None
        return {"deleted": deleted, "complete": complete}

    # 周期对比报表
