"""设备状态翻转时序与因果归因。

对齐 Nest ``AgentTimelineService``：

- 订阅 ``ha.state_changed`` / ``ha.state_changed.batch``，记录每次「状态翻转」；
- 归因触发源：HA 事件 ``context.user_id`` → ``MANUAL_APP``，``context.parent_id`` →
  ``HA_AUTOMATION``，本进程刚下发过命令 → ``MANUAL_APP``（带操作者），其余 →
  ``EXTERNAL_DEVICE``；
- 记录本次翻转的持续时长（下一条同实体记录到来时结算）；
- 记录同房间其它设备的状态快照，供「开灯时窗帘是开的」这类因果复盘；
- 60 天保留期，后台按批次清理。

写库一律放进后台任务：状态变更 fan-out 是热路径，不能在这里 await SQLite。
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select

from ....platform.core.db.db_exec import run_db
from ....platform.core.db.json_field import read_json_object
from ....platform.core.db.models import AgentContextTimeline
from ....platform.core.runtime.background import spawn_background

logger = logging.getLogger("homeos.agent.timeline")

#: 触发源枚举（前端按此展示）
SOURCE_MANUAL = "MANUAL_APP"
SOURCE_AUTOMATION = "HA_AUTOMATION"
SOURCE_EXTERNAL = "EXTERNAL_DEVICE"
#: 时序保留天数（默认值；可用 ``HOMEOS_AGENT_TIMELINE_RETENTION_DAYS`` 覆盖）。
RETENTION_DAYS = 30
#: 保留天数环境变量名。
RETENTION_DAYS_ENV = "HOMEOS_AGENT_TIMELINE_RETENTION_DAYS"
#: 旧默认值（60 天）。仅用于日志提示：传感器抖动下 60 天实测积累到千万行。
LEGACY_RETENTION_DAYS = 60
#: 同房间快照最多记录多少台设备
MAX_PEERS = 20
#: 本地命令标记有效期（秒）：同实体在窗口内的翻转归因为本地下发
LOCAL_MARK_TTL_SECONDS = 10.0
#: 数值型传感器的最小记录间隔（秒）。
#:
#: 传感器每变一次读数就落一行时序，实测单机每天 20 万行以上（`agent_context_timeline`
#: 11 天 208 万行 / 900MB 库）。这里只节流「数值 → 数值」的抖动；开关、不可用这类
#: 语义翻转照常记录，因果复盘的可用性不受影响。
NUMERIC_THROTTLE_SECONDS = 300.0
#: 参与数值节流的域。
NUMERIC_THROTTLE_DOMAINS = frozenset({"sensor", "number", "input_number"})
#: 节流表上限：超过就整体丢弃重建，避免无界增长。
NUMERIC_THROTTLE_MAX_KEYS = 4096
#: 纯时间刻度实体：值每秒都在变，但「几点几分」没有任何因果复盘价值。
#:
#: 实测这类实体占剩余写入的大头（`sensor.time` / `time_utc` / `date_time` 等
#: 每个每天 1,440 行 × 5 个），却是查「谁在什么时候开过灯」时完全无用的噪音。
CLOCK_ENTITY_PATTERNS = (
    "sensor.time",
    "sensor.date",
    "sensor.date_time",
    "sensor.time_date",
    "sensor.time_utc",
    "sensor.last_boot",
    "sensor.uptime",
)
#: 写入队列容量与单批条数（队列满时丢弃并计数，不阻塞状态 fan-out 热路径）。
WRITE_QUEUE_MAXSIZE = 4096
WRITE_BATCH_SIZE = 64
#: 两轮保留期清理之间的最小间隔（秒）。
PRUNE_MIN_INTERVAL_SECONDS = 600.0
#: 单轮清理的分批大小与最大批数：避免单个事务删除数十万行长时间持有写锁。
PRUNE_BATCH_SIZE = 2000
PRUNE_MAX_BATCHES = 20
#: 单次查询上限
MAX_QUERY_ROWS = 100


def _resolve_retention_days() -> int:
    """读取保留天数：环境变量优先，非法/非正数回落到 ``RETENTION_DAYS``。"""
    raw = os.getenv(RETENTION_DAYS_ENV)
    if raw is None or not raw.strip():
        return RETENTION_DAYS
    try:
        value = int(raw.strip())
    except ValueError:
        logger.debug("保留天数环境变量非法，按默认 %s 处理: %r", RETENTION_DAYS, raw)
        return RETENTION_DAYS
    return value if value > 0 else RETENTION_DAYS


def _is_numeric_text(value: Any) -> bool:
    """``True`` 表示该状态是有限数值（用于判断是否为可节流的读数抖动）。"""
    if isinstance(value, bool) or value is None:
        return False
    if isinstance(value, (int, float)):
        return math.isfinite(value)
    text = str(value).strip()
    if not text or text[0] not in "+-.0123456789":
        return False
    try:
        return math.isfinite(float(text))
    except ValueError:
        # "1e" / "12%" 这类看起来像数字但不是的文本；调用点只关心真假。
        logger.debug("状态值无法解析为数值，按非数值处理: %r", text)
        return False


def _parse_time(raw: Any) -> datetime:
    """解析 HA 的 ISO 时间；非法 / 缺失回退当前时间（不带时区偏移，落库口径统一）。"""
    if isinstance(raw, datetime):
        moment = raw
    elif isinstance(raw, str) and raw.strip():
        text = raw.strip().replace("Z", "+00:00")
        try:
            moment = datetime.fromisoformat(text)
        except ValueError:
            logger.debug("状态时间格式非法，回退当前时间: %s", text)
            moment = datetime.now(UTC)
    else:
        moment = datetime.now(UTC)
    if moment.tzinfo is not None:
        moment = moment.astimezone(UTC).replace(tzinfo=None)
    return moment


def _state_of(value: Any) -> str | None:
    if isinstance(value, dict):
        state = value.get("state")
        return str(state) if state is not None else None
    if isinstance(value, str):
        return value
    return None


class AgentTimelineService:
    """状态翻转时序记录与查询。"""

    def __init__(
        self,
        session_factory: Any = None,
        state_store: Any = None,
        enrichment: Any = None,
        event_bus: Any = None,
    ) -> None:
        self._session_factory = session_factory
        self._state_store = state_store
        self._enrichment = enrichment
        self._event_bus = event_bus
        #: entity_id → (monotonic, actor 名称)
        self._local_marks: dict[str, tuple[float, str]] = {}
        #: 数值传感器节流表：entity_id → 上次落库的 monotonic 时刻
        self._numeric_last: dict[str, float] = {}
        self._written = 0
        self._dropped = 0
        self._prune_lock = asyncio.Lock()
        self._retention_days = _resolve_retention_days()
        #: 写入队列与单消费者：把「每条状态变更一个后台任务」收敛成一次批量落库，
        #: 避免传感器抖动时几十个线程同时抢 SQLite 写锁。
        self._queue: asyncio.Queue[dict[str, Any]] | None = None
        self._consumer: asyncio.Task[None] | None = None
        self._last_prune = 0.0

    # 生命周期 / 事件绑定
    def bind_events(self) -> None:
        """订阅状态变更事件（幂等：重复绑定会重复写，故只由装配层调用一次）。"""
        if self._event_bus is None:
            return
        self._event_bus.on("ha.state_changed", self._on_single)
        self._event_bus.on("ha.state_changed.batch", self._on_batch)

    def _on_single(self, payload: Any) -> None:
        if isinstance(payload, dict) and payload.get("entity_id"):
            self._schedule(payload)

    def _on_batch(self, payload: Any) -> None:
        changes = payload.get("changes") if isinstance(payload, dict) else None
        if not isinstance(changes, list):
            return
        for change in changes:
            if isinstance(change, dict) and change.get("entity_id"):
                self._schedule(change)

    def _schedule(self, change: dict[str, Any]) -> None:
        # 上游会在同一次 fan-out 里就地补全 old_state，必须立即拷出需要的字段
        new_state = change.get("new_state")
        new_state_obj = read_json_object(new_state, {}) if isinstance(new_state, dict) else {}
        snapshot = {
            "entity_id": str(change.get("entity_id") or ""),
            "old_state": _state_of(change.get("old_state")),
            "new_state": _state_of(new_state),
            "changed_at": change.get("changed_at") or new_state_obj.get("last_changed"),
            "context": change.get("context") or new_state_obj.get("context"),
            "attributes": new_state_obj.get("attributes") if isinstance(new_state_obj.get("attributes"), dict) else {},
        }
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.debug("无运行中的事件循环，跳过时序写入: %s", snapshot.get("entity_id"))
            return
        if self._should_skip_numeric(snapshot):
            return
        self._ensure_consumer(loop)
        queue = self._queue
        if queue is None:
            return
        try:
            queue.put_nowait(snapshot)
        except asyncio.QueueFull:
            self._dropped += 1
            if self._dropped == 1 or self._dropped % 500 == 0:
                logger.warning(
                    "设备时序写入队列已满（容量 %s），丢弃事件累计 %s 条",
                    WRITE_QUEUE_MAXSIZE,
                    self._dropped,
                )

    def _should_skip_numeric(self, snapshot: dict[str, Any]) -> bool:
        """数值型传感器/纯时间刻度的噪音过滤。

        返回 ``True`` 表示本条不入库。语义翻转（``on``/``off``/``unavailable``）不受影响。
        """
        entity_id = str(snapshot.get("entity_id") or "")
        # 纯时间刻度（几点几分）永远不是「设备状态翻转」，直接丢弃。
        if entity_id.startswith(CLOCK_ENTITY_PATTERNS):
            return True
        domain = entity_id.split(".", 1)[0]
        if domain not in NUMERIC_THROTTLE_DOMAINS:
            return False
        old_state = snapshot.get("old_state")
        new_state = snapshot.get("new_state")
        if not (_is_numeric_text(old_state) and _is_numeric_text(new_state)):
            return False
        now = time.monotonic()
        last = self._numeric_last.get(entity_id)
        if last is not None and now - last < NUMERIC_THROTTLE_SECONDS:
            return True
        if len(self._numeric_last) >= NUMERIC_THROTTLE_MAX_KEYS:
            # 宁可整体丢弃重建，也不让节流表随设备数无界增长。
            self._numeric_last.clear()
        self._numeric_last[entity_id] = now
        return False

    def _ensure_consumer(self, loop: asyncio.AbstractEventLoop) -> None:
        """确保写入消费者在跑（懒启动，避免在模块导入期绑事件循环）。"""
        if self._queue is None:
            self._queue = asyncio.Queue(maxsize=WRITE_QUEUE_MAXSIZE)
        consumer = self._consumer
        if consumer is None or consumer.done():
            self._consumer = loop.create_task(self._consume_loop(), name="agent-timeline-writer")

    async def _consume_loop(self) -> None:
        """单消费者：成批取出、成批落库（一个事务写一批）。"""
        queue = self._queue
        if queue is None:
            return
        while True:
            first = await queue.get()
            batch = [first]
            while len(batch) < WRITE_BATCH_SIZE and not queue.empty():
                batch.append(queue.get_nowait())
            try:
                await self._record_batch(batch)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.debug("批量写入设备时序失败: %s (%s 条)", exc, len(batch))
            finally:
                for _ in batch:
                    queue.task_done()

    async def close(self) -> None:
        """停止写入消费者，并把队列里剩余的事件落库（lifespan 关停时调用）。"""
        consumer = self._consumer
        self._consumer = None
        if consumer is not None and not consumer.done():
            consumer.cancel()
            try:
                await consumer
            except asyncio.CancelledError:
                logger.debug("设备时序写入消费者已取消")
        queue = self._queue
        self._queue = None
        if queue is None:
            return
        pending: list[dict[str, Any]] = []
        while not queue.empty():
            pending.append(queue.get_nowait())
        rows = [row for row in (self._prepare(snapshot) for snapshot in pending) if row]
        if rows:
            try:
                await run_db(self._write_many_sync, rows)
            except Exception as exc:
                logger.debug("关停时落盘设备时序失败: %s", exc)

    # 本地命令标记
    def mark_local_control(self, entity_id: str, actor: Any = None) -> None:
        """记下「这条命令是本进程刚下发的」，让随后的状态翻转归因为手动操作。"""
        ident = str(entity_id or "").strip()
        if not ident:
            return
        username = ""
        if isinstance(actor, str):
            username = actor
        elif actor is not None:
            username = str(getattr(actor, "username", "") or getattr(actor, "user_id", "") or "")
        now = time.monotonic()
        # 顺带清理过期标记，避免长期运行后字典只增不减
        for key, (stamp, _name) in list(self._local_marks.items()):
            if now - stamp > LOCAL_MARK_TTL_SECONDS:
                self._local_marks.pop(key, None)
        self._local_marks[ident] = (now, username)

    def _consume_local_mark(self, entity_id: str) -> str | None:
        entry = self._local_marks.pop(entity_id, None)
        if entry is None:
            return None
        stamp, username = entry
        if time.monotonic() - stamp > LOCAL_MARK_TTL_SECONDS:
            return None
        return username or ""

    # 归因
    def _resolve_source(self, entity_id: str, context: Any) -> tuple[str, str]:
        context_obj = context if isinstance(context, dict) else {}
        username = self._consume_local_mark(entity_id)
        if username is not None:
            return SOURCE_MANUAL, username
        if context_obj.get("user_id"):
            return SOURCE_MANUAL, str(context_obj.get("user_id"))
        if context_obj.get("parent_id"):
            return SOURCE_AUTOMATION, ""
        return SOURCE_EXTERNAL, ""

    # 区域 / 同房间快照
    def _area_of(self, entity_id: str, attributes: dict[str, Any]) -> tuple[str, str]:
        area_id = str(attributes.get("area_id") or "").strip()
        area_name = str(attributes.get("area_name") or "").strip()
        if area_id or area_name:
            return area_id, area_name
        enrichment = self._enrichment
        if enrichment is None:
            return "", ""
        try:
            entity = self._state_store.get(entity_id) if self._state_store is not None else None
            enriched = enrichment.enrich_entity_sync(entity or {}) if entity else {}
        except Exception as exc:
            logger.debug("解析设备区域失败: %s (%s)", entity_id, exc)
            return "", ""
        attrs = read_json_object(enriched, {}).get("attributes")
        attrs = attrs if isinstance(attrs, dict) else {}
        return str(attrs.get("area_id") or ""), str(attrs.get("area_name") or "")

    def _peer_snapshot(self, area_id: str, exclude_entity: str) -> dict[str, str]:
        """同房间其它设备的当前状态（限量），供因果复盘。"""
        if not area_id or self._state_store is None:
            return {}
        peers: dict[str, str] = {}
        try:
            ids: list[str] = []
            enrichment = self._enrichment
            if enrichment is not None:
                ids = list(enrichment.get_entity_ids_by_area_id(area_id))
            if not ids:
                return {}
            for entity_id in ids:
                if len(peers) >= MAX_PEERS:
                    break
                if entity_id == exclude_entity:
                    continue
                entity = self._state_store.get(entity_id)
                if not entity:
                    continue
                state = _state_of(entity)
                if state is not None:
                    peers[entity_id] = state
        except Exception:
            logger.debug("同房间状态快照失败", exc_info=True)
        return peers

    # 写入
    async def _record(self, snapshot: dict[str, Any]) -> None:
        """单条记录（保留给直接调用方与小批量路径）。"""
        row = self._prepare(snapshot)
        if row is None:
            return
        try:
            await run_db(self._write_many_sync, [row])
        except Exception as exc:
            logger.debug("写入设备时序失败: %s (%s)", row.get("entity_id"), exc)
            return
        self._after_written(1)

    async def _record_batch(self, snapshots: list[dict[str, Any]]) -> None:
        """批量记录：区域/同房间富化在事件循环里做，落库合并成一个事务。"""
        rows = [row for row in (self._prepare(snapshot) for snapshot in snapshots) if row]
        if not rows:
            return
        await run_db(self._write_many_sync, rows)
        self._after_written(len(rows))

    def _prepare(self, snapshot: dict[str, Any]) -> dict[str, Any] | None:
        """把一条状态变更归一成待写入的行；不是有效翻转时返回 ``None``。"""
        entity_id = str(snapshot.get("entity_id") or "")
        new_state = snapshot.get("new_state")
        old_state = snapshot.get("old_state")
        if not entity_id or new_state is None:
            return None
        if old_state == new_state:
            # 同状态重发（属性抖动 / 区域补全）不是翻转，不记录
            return None
        domain = entity_id.split(".", 1)[0]
        attributes = snapshot.get("attributes")
        attributes = attributes if isinstance(attributes, dict) else {}
        area_id, area_name = self._area_of(entity_id, attributes)
        trigger_source, actor = self._resolve_source(entity_id, snapshot.get("context"))
        peers = self._peer_snapshot(area_id, entity_id)
        changed_at = _parse_time(snapshot.get("changed_at"))
        return {
            "entity_id": entity_id,
            "domain": domain,
            "area_id": area_id,
            "area_name": area_name,
            "old_state": old_state,
            "new_state": new_state,
            "changed_at": changed_at,
            "trigger_source": trigger_source,
            "actor": actor,
            "context": snapshot.get("context") if isinstance(snapshot.get("context"), dict) else {},
            "peer_snapshot": peers,
        }

    def _after_written(self, count: int) -> None:
        self._written += count
        self._maybe_prune()

    def _maybe_prune(self) -> None:
        """按时间节流触发保留期清理（不再按「每 200 条」触发）。"""
        now = time.monotonic()
        if now - self._last_prune < PRUNE_MIN_INTERVAL_SECONDS:
            return
        self._last_prune = now
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            logger.debug("无运行中的事件循环，跳过保留期清理")
            return
        spawn_background(self.prune())

    def _write_sync(self, row: dict[str, Any]) -> None:
        """单行写入（兼容入口）。"""
        self._write_many_sync([row])

    def _write_many_sync(self, rows: list[dict[str, Any]]) -> None:
        """一个事务写一批：SQLite 单写者，批量提交把每条 4 条语句降到 1 次 commit。"""
        if self._session_factory is None or not rows:
            return
        with self._session_factory() as session:
            for row in rows:
                self._write_row(session, row)
            session.commit()

    def _write_row(self, session: Any, row: dict[str, Any]) -> None:
        changed_at: datetime = row["changed_at"]
        # 结算上一条：同实体的上一条记录在这里结束
        previous = (
            session.execute(
                select(AgentContextTimeline)
                .where(
                    AgentContextTimeline.entity_id == row["entity_id"],
                    AgentContextTimeline.ended_at.is_(None),
                )
                .order_by(AgentContextTimeline.changed_at.desc())
            )
            .scalars()
            .first()
        )
        if previous is not None:
            previous.ended_at = changed_at
            previous.duration_seconds = max(0, int((changed_at - previous.changed_at).total_seconds()))
        session.add(
            AgentContextTimeline(
                entity_id=row["entity_id"],
                domain=row["domain"],
                area_id=row["area_id"],
                area_name=row["area_name"],
                old_state=row["old_state"],
                new_state=row["new_state"],
                changed_at=changed_at,
                trigger_source=row["trigger_source"],
                actor=row["actor"],
                context=json.dumps(row["context"], ensure_ascii=False),
                peer_snapshot=json.dumps(row["peer_snapshot"], ensure_ascii=False),
            )
        )

    # 查询
    async def query(
        self,
        *,
        entity_id: str = "",
        area_id: str = "",
        hours: int = 24,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """按实体 / 区域 + 时间窗查询翻转记录（最新在前）。"""
        hours = max(1, min(24 * 60, int(hours or 24)))
        limit = max(1, min(MAX_QUERY_ROWS, int(limit or 50)))
        since = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=hours)
        try:
            rows = await run_db(self._query_sync, entity_id, area_id, since, limit)
        except Exception as exc:
            logger.warning("查询设备时序失败: %s", exc)
            return []
        return rows

    def _query_sync(self, entity_id: str, area_id: str, since: datetime, limit: int) -> list[dict[str, Any]]:
        if self._session_factory is None:
            return []
        with self._session_factory() as session:
            query = select(AgentContextTimeline).where(AgentContextTimeline.changed_at >= since)
            if entity_id:
                query = query.where(AgentContextTimeline.entity_id == entity_id)
            if area_id:
                query = query.where(AgentContextTimeline.area_id == area_id)
            rows = list(session.execute(query.order_by(AgentContextTimeline.changed_at.desc()).limit(limit)).scalars())
        return [
            {
                "entityId": row.entity_id,
                "domain": row.domain,
                "areaId": row.area_id or "",
                "areaName": row.area_name or "",
                "oldState": row.old_state,
                "newState": row.new_state,
                "changedAt": row.changed_at.isoformat() if row.changed_at else None,
                "endedAt": row.ended_at.isoformat() if row.ended_at else None,
                "durationSeconds": row.duration_seconds,
                "triggerSource": row.trigger_source,
                "actor": row.actor or "",
                "peerSnapshot": read_json_object(row.peer_snapshot, {}),
            }
            for row in rows
        ]

    async def last_on_since(self, entity_ids: list[str]) -> dict[str, datetime]:
        """取每个实体最近一次「变为开启」的时间（看门狗判断空转时长用）。"""
        ids = [str(item) for item in entity_ids if item]
        if not ids or self._session_factory is None:
            return {}
        try:
            return await run_db(self._last_on_sync, ids)
        except Exception as exc:
            logger.debug("读取设备开启时间失败: %s", exc)
            return {}

    def _last_on_sync(self, entity_ids: list[str]) -> dict[str, datetime]:
        if self._session_factory is None:
            return {}
        on_states = ("on", "open", "playing", "heat", "cool", "auto", "heat_cool", "dry", "fan_only")
        with self._session_factory() as session:
            rows = list(
                session.execute(
                    select(AgentContextTimeline)
                    .where(
                        AgentContextTimeline.entity_id.in_(entity_ids),
                        AgentContextTimeline.new_state.in_(on_states),
                    )
                    .order_by(AgentContextTimeline.changed_at.desc())
                    .limit(2000)
                ).scalars()
            )
        result: dict[str, datetime] = {}
        for row in rows:
            result.setdefault(row.entity_id, row.changed_at)
        return result

    # 保留期
    async def prune(self) -> int:
        """清理超过保留期的时序记录（返回删除条数）。"""
        if self._session_factory is None:
            return 0
        async with self._prune_lock:
            cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=self._retention_days)
            try:
                removed = await run_db(self._prune_sync, cutoff)
            except Exception as exc:
                logger.debug("清理设备时序失败: %s", exc)
                return 0
            if removed:
                logger.info("设备时序清理完成：删除 %s 行（保留 %s 天）", removed, self._retention_days)
            return removed

    def _prune_sync(self, cutoff: datetime) -> int:
        """分批删除过期行。

        旧实现是一条无 ``LIMIT`` 的 ``DELETE``：库里数十万过期行时单个事务长时间持有
        写锁。这里按 ``PRUNE_BATCH_SIZE`` 分批，并给批数上限，剩余留到下一轮。
        """
        if self._session_factory is None:
            return 0
        total = 0
        for _ in range(PRUNE_MAX_BATCHES):
            with self._session_factory() as session:
                ids = list(
                    session.execute(
                        select(AgentContextTimeline.id)
                        .where(AgentContextTimeline.changed_at < cutoff)
                        .limit(PRUNE_BATCH_SIZE)
                    ).scalars()
                )
                if not ids:
                    break
                result = session.execute(delete(AgentContextTimeline).where(AgentContextTimeline.id.in_(ids)))
                session.commit()
                total += int(result.rowcount or 0)
            if len(ids) < PRUNE_BATCH_SIZE:
                break
        return total

    #: 当前生效的保留天数（环境变量可覆盖）。
    @property
    def retention_days(self) -> int:
        return self._retention_days


__all__ = [
    "LEGACY_RETENTION_DAYS",
    "PRUNE_BATCH_SIZE",
    "PRUNE_MAX_BATCHES",
    "RETENTION_DAYS",
    "RETENTION_DAYS_ENV",
    "SOURCE_AUTOMATION",
    "SOURCE_EXTERNAL",
    "SOURCE_MANUAL",
    "AgentTimelineService",
]
