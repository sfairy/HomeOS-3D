"""事件日志服务（对齐 Nest ``event-log/service.ts`` + ``query.service.ts`` + ``report.service.ts``）。"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
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
from ...platform.core.db.models import EventLog
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
    _restriction_conditions,
    _state_text,
    build_event_log_stats,
    map_history_row,
    resolve_event_log_time_granularity,
)

#: `clear_all_records` 的批数上限（批大小见 ops 的 `retentionDeleteBatchSize`，默认 800）。
#: 触顶不是错误（库里可能真有上百万行），但必须把 `complete=False` 如实返回给调用方。
CLEAR_ALL_MAX_BATCHES = 500

#: 能耗旁路缓冲上限。电表读数抖动不会无限堆积；超限丢最旧的一条，
#: 差分口径下只损失一次增量精度，周期读数（max）不受影响。
ENERGY_BUFFER_MAX = 2000

#: 保留天数缓存有效期（秒）。
#:
#: `/events`、`/events/meta`、`/events/timeline`、`/events/stats` 每个请求都要读一次
#: `system_configs.data` 全量 JSON 才能拿到保留天数；一次时间线查询内还会再取一次
#: （路由取 meta 一次 + `query_timeline_events` 内部一次）。保留天数只在用户改设置时
#: 变化，5 秒的窗口与 `domains/security/panel.py` 的配置缓存同一量级。
RETENTION_CACHE_TTL_SECONDS = 5.0


from .energy_store import EnergyStoreMixin


class EventLogService(EventLogReportMixin, EnergyStoreMixin):
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
        #: 能耗旁路缓冲：电表读数**不受**「事件日志显示过滤」约束。
        #:
        #: 电表全是 ``sensor.*``，而默认 ``eventLogRecordBlockDomains`` 含 ``sensor``
        #: （用户为了压掉传感器刷屏普遍会加上它）。两者共用同一份过滤条件时，能耗实时
        #: 记账会被整体掐断：``event_logs`` 里一条 ``sensor.*`` 都没有，日/月用量永远
        #: 不增，``/events/reports/compare?metric=energy`` 恒为 0。这里把「记账」与
        #: 「显示」拆成两个缓冲：显示过滤挡不住的，记账照样进行。
        self._energy_buffer: list[dict[str, Any]] = []
        self._flush_timer: asyncio.TimerHandle | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._dropped_events = 0
        #: 批量写入与「清空全部」串行化用的跨线程锁（两者都跑在工作线程里）。
        self._write_lock = threading.Lock()
        #: 清空世代。写批次提交前比对世代，若期间发生过清空就丢弃该批 —— 否则一个在
        #: 清空之前抓取的批次会在删除之后提交，把刚清掉的记录重新写回去。
        self._clear_epoch = 0
        self._ops: dict[str, Any] = dict(DEFAULT_OPS)
        #: 保留天数短缓存：(采样时刻, 天数)。见 ``RETENTION_CACHE_TTL_SECONDS``。
        self._retention_cache: tuple[float, int] | None = None
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
        self._retention_cache = None
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
        cached = self._retention_cache
        now = time.monotonic()
        if cached is not None and now - cached[0] < RETENTION_CACHE_TTL_SECONDS:
            return cached[1]
        with self._database.session_factory() as session:
            raw = load_raw_config(session)
        retention_source = raw.get("retention")
        retention = retention_source if isinstance(retention_source, dict) else {}
        # 保留天数只认 ``retention.eventLog``（缺省回落到内置默认值）。
        days = resolve_event_log_retention_days(retention.get("eventLog"))
        self._retention_cache = (now, days)
        return days

    def invalidate_retention_cache(self) -> None:
        """丢弃保留天数缓存（配置热更新 / 整库还原后调用）。"""
        self._retention_cache = None

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
            # 从属进程不记账：能耗与事件日志一样是「只由 leader 写」，
            # 否则多进程部署下每块电表会被重复累计 N 次。
            if not self._is_leader():
                continue
            # 能耗记账必须先于「显示过滤」：电表是 sensor.*，被默认域黑名单挡住之后
            # 就再也进不了 _apply_energy_side_effects，日/月用量与能耗报表会一直是 0。
            self._collect_energy_row(event, entity_id)
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

    def _collect_energy_row(self, event: dict[str, Any], entity_id: str) -> None:
        """把电表读数收进能耗旁路缓冲（不经过显示过滤，也不写 event_logs）。

        ``serialize_event_log_states(..., "compact")`` 对电表只保留
        ``state`` + ``device_class`` / ``unit_of_measurement``，正是
        ``accumulate_energy_totals`` 判定与折算所需的全部字段。

        ``created_at`` 必须一并带：它是 ``accumulate_energy_totals`` 的日/月分桶键，旁路
        缓冲拿不到显示缓冲那份，缺了会 KeyError → 整批 flush 失败并无限回灌（见运行日志
        「批量写入事件失败:'created_at',已回灌0条」）。
        """
        old_state = event.get("old_state")
        new_state = event.get("new_state")
        if not is_energy_meter_state(entity_id, old_state, new_state):
            return
        old_serialized, new_serialized = serialize_event_log_states(event, "compact")
        if old_serialized is None and new_serialized is None:
            return
        self._energy_buffer.append(
            {
                "entity_id": entity_id,
                "old_state": old_serialized,
                "new_state": new_serialized,
                "created_at": _resolve_event_occurred_at(event),
            }
        )
        # 上界与显示缓冲同量级：能量表读数抖动不会无限堆积（超限丢最旧的，
        # 差值口径下丢中间读数只影响一次增量精度，不影响周期读数）。
        if len(self._energy_buffer) > ENERGY_BUFFER_MAX:
            self._energy_buffer.pop(0)

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
        if not self._buffer and not self._energy_buffer:
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
        if self._buffer or self._energy_buffer:
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
        if not self._buffer and not self._energy_buffer:
            return
        batch = self._buffer
        energy_batch = self._energy_buffer
        # 抓取世代：若提交前发生过「清空全部」，这一批就已经过时，必须丢弃。
        epoch = self._clear_epoch
        self._buffer = []
        self._energy_buffer = []
        try:
            await asyncio.to_thread(self._write_batch, batch, epoch, energy_batch)
        except Exception as error:
            max_requeue = int(self._ops.get("eventLogMaxRequeueBuffer") or 500)
            room = max(0, max_requeue - len(self._buffer))
            if room > 0:
                self._buffer = batch[:room] + self._buffer
                # 能耗行同样要回灌：它们是记账的唯一来源，丢了就是永久缺口。
                self._energy_buffer = energy_batch[:room] + self._energy_buffer
                logger.warning("批量写入事件失败: %s,已回灌 %s 条", error, min(room, len(batch)))
                self._schedule_flush()
            else:
                self._dropped_events += len(batch)
                logger.error("事件日志批量写入失败且缓冲区满: %s", error)

    def _write_batch(
        self,
        batch: list[dict[str, Any]],
        epoch: int,
        energy_batch: list[dict[str, Any]] | None = None,
    ) -> None:
        if batch:
            self._write_display_rows(batch, epoch)
        # 能耗记账与「事件日志显示」无关，也不受清空世代影响：用户清空日志不该
        # 让日/月用量凭空少掉一批读数。``energy_batch`` 为空时回退用显示批次
        # （测试与直接调用不走独立记账）。
        #
        # ⚠ 这一段**绝不能**把异常抛给 ``flush``：显示行在上面已经 commit 了，冒泡出去
        # 会被当成「整批没写成」而回灌，下一轮把同一批显示行再写一遍 —— 11-18 → 11-21
        # 的 1200 万行重复就是这样滚出来的（当时异常来自 energy 路径，而它那时只在内部
        # try 里兜了写库部分，``accumulate_energy_totals`` 在 try 之外）。
        # ``_apply_energy_side_effects`` 自身已全量兜底，这里再加一道，保证「记账失败
        # 只损失记账」不被下一次改动破坏。
        side_effects = energy_batch or batch
        if side_effects:
            try:
                self._apply_energy_side_effects(side_effects)
            except Exception as error:  # pragma: no cover - 防御：不应到达
                logger.warning("能源副作用未隔离地失败（已吞掉，避免重复写事件日志）: %s", error)

    def _write_display_rows(self, batch: list[dict[str, Any]], epoch: int) -> None:
        with self._write_lock:
            # 世代比对与提交必须在同一把锁内：否则「比对通过 → 清空删除 → 本批提交」
            # 仍会把过时的记录写回一个刚被清空的库，而接口已经报过 complete。
            if epoch != self._clear_epoch:
                logger.info("清空事件日志期间丢弃过时批次 %s 条", len(batch))
                return
            # 逐批内去重：同一 (实体, 时刻, 变化) 在一批里出现多次只写一条。
            # 上游在「同一批被重复投递」时（例如对账与 state_changed 撞在同一窗口）会
            # 给出重复条目；不去重就等比例放大表体积，而这类行对分析没有新信息。
            deduped: list[dict[str, Any]] = []
            seen: set[tuple[str, str, str]] = set()
            for row in batch:
                key = (str(row["entity_id"]), str(row["created_at"]), str(row["state_diff"]))
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(row)
            if len(deduped) < len(batch):
                logger.debug("事件日志批次内去重：%s → %s 条", len(batch), len(deduped))
            with self._database.session_factory() as session:
                for row in deduped:
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
        self._energy_buffer = []
        if self._flush_timer is not None:
            self._flush_timer.cancel()
            self._flush_timer = None
        return {"deleted": deleted, "complete": complete}

    # 周期对比报表
