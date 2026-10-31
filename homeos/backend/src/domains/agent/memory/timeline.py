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
#: 时序保留天数
RETENTION_DAYS = 60
#: 同房间快照最多记录多少台设备
MAX_PEERS = 20
#: 本地命令标记有效期（秒）：同实体在窗口内的翻转归因为本地下发
LOCAL_MARK_TTL_SECONDS = 10.0
#: 每写入多少条做一次保留期清理
PRUNE_EVERY = 200
#: 单次查询上限
MAX_QUERY_ROWS = 100


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
        self._written = 0
        self._prune_lock = asyncio.Lock()

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
            asyncio.get_running_loop()
        except RuntimeError:
            logger.debug("无运行中的事件循环，跳过时序写入: %s", snapshot.get("entity_id"))
            return
        spawn_background(self._record(snapshot))

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
        entity_id = str(snapshot.get("entity_id") or "")
        new_state = snapshot.get("new_state")
        old_state = snapshot.get("old_state")
        if not entity_id or new_state is None:
            return
        if old_state == new_state:
            # 同状态重发（属性抖动 / 区域补全）不是翻转，不记录
            return
        domain = entity_id.split(".", 1)[0]
        attributes = snapshot.get("attributes")
        attributes = attributes if isinstance(attributes, dict) else {}
        area_id, area_name = self._area_of(entity_id, attributes)
        trigger_source, actor = self._resolve_source(entity_id, snapshot.get("context"))
        peers = self._peer_snapshot(area_id, entity_id)
        changed_at = _parse_time(snapshot.get("changed_at"))
        try:
            await run_db(
                self._write_sync,
                {
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
                },
            )
        except Exception as exc:
            logger.debug("写入设备时序失败: %s (%s)", entity_id, exc)
            return
        self._written += 1
        if self._written % PRUNE_EVERY == 0:
            spawn_background(self.prune())

    def _write_sync(self, row: dict[str, Any]) -> None:
        if self._session_factory is None:
            return
        changed_at: datetime = row["changed_at"]
        with self._session_factory() as session:
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
            session.commit()

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
            cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=RETENTION_DAYS)
            try:
                return await run_db(self._prune_sync, cutoff)
            except Exception as exc:
                logger.debug("清理设备时序失败: %s", exc)
                return 0

    def _prune_sync(self, cutoff: datetime) -> int:
        if self._session_factory is None:
            return 0
        with self._session_factory() as session:
            result = session.execute(delete(AgentContextTimeline).where(AgentContextTimeline.changed_at < cutoff))
            session.commit()
            return int(result.rowcount or 0)


__all__ = [
    "RETENTION_DAYS",
    "SOURCE_AUTOMATION",
    "SOURCE_EXTERNAL",
    "SOURCE_MANUAL",
    "AgentTimelineService",
]
