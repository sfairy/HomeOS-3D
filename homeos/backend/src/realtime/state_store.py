"""实体状态存储（L1 内存 + 最近变更环形缓冲，供 WS 首推与 state_replay 使用）。

替代 Nest ``StateStoreService`` 的核心子集。本模块同时提供运维诊断所需的
``get_stale_info`` / ``get_memory_diagnostics``，口径与 Nest
``computeStateStoreStaleInfo`` / ``computeStateStoreMemoryDiagnostics`` 对齐。
"""

from __future__ import annotations

import json
import time
from collections import deque
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

from ..platform.core.db.json_field import object_field

#: 最近变更环形缓冲容量（``stateStore.maxRecentChanges`` 默认值，与 Nest 一致）。
_RECENT_CHANGES_MAX = 3000
#: 数据陈旧判定阈值（``stateStore.staleThresholdMs`` 默认值，与 Nest 一致）。
_STALE_THRESHOLD_MS = 12_000


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


class StateStore:
    def __init__(
        self,
        max_recent_changes: int = _RECENT_CHANGES_MAX,
        stale_threshold_ms: int = _STALE_THRESHOLD_MS,
    ) -> None:
        self._states: dict[str, dict[str, Any]] = {}
        self._max_recent_changes = max(1, int(max_recent_changes))
        self._recent: deque[dict[str, Any]] = deque(maxlen=self._max_recent_changes)
        self._change_seq = 0
        self._ha_synced = False
        self._ha_connected = False
        self._ha_disconnected_at: float | None = None
        self._last_synced_at: str | None = None
        self._last_state_change_at: float | None = None
        self._stale_threshold_ms = int(stale_threshold_ms)

    # ---- 配置热更新 ----
    def apply_config(
        self,
        *,
        max_recent_changes: int | None = None,
        stale_threshold_ms: int | None = None,
    ) -> None:
        """应用 ``stateStore`` 分区配置（容量变化时重建环形缓冲，保留最近条目）。"""
        if max_recent_changes is not None:
            capacity = max(1, int(max_recent_changes))
            if capacity != self._max_recent_changes:
                self._max_recent_changes = capacity
                self._recent = deque(list(self._recent)[-capacity:], maxlen=capacity)
        if stale_threshold_ms is not None:
            self._stale_threshold_ms = int(stale_threshold_ms)

    # ---- 全量 ----
    def get_all(self, domain: str | None = None) -> list[dict[str, Any]]:
        """返回全部实体；指定 ``domain`` 时仅返回该域（按 entity_id 前缀过滤）。"""
        if not domain:
            return list(self._states.values())
        prefix = f"{domain}."
        return [entity for entity_id, entity in self._states.items() if entity_id.startswith(prefix)]

    def get_count(self) -> int:
        return len(self._states)

    def get(self, entity_id: str) -> dict[str, Any] | None:
        return self._states.get(entity_id)

    def set_all(
        self,
        entities: list[dict[str, Any]],
        *,
        preserve: Iterable[str] | None = None,
    ) -> list[dict[str, Any]]:
        """用一份全量快照重建 L1，返回**本次真正变化**的实体集合。

        ``preserve`` 是「取这份快照期间本地又收到过更新」的实体集合（
        ``StateHub.StateFetchChanges.changed``）。对它们的处理必须区别对待，否则周期对账
        会把窗口内的实时更新整体回退成快照时刻的旧值，而且**不广播、不 resync** ——
        用户看到的就是「设备状态每隔几分钟自己跳回一次」。

        规则（三条都要，缺一条就会丢一种更新）：
        1. 快照里**有**、``preserve`` 命中 → 保留内存里的值（内存的更新）。
        2. 快照里**有**、内存时间戳更新（对账窗口之外也可能发生）→ 同样保留内存值。
        3. 快照里**没有**、``preserve`` 命中 → 保留：这是窗口内新出现的实体，
           快照是它出现之前的。
        其余（含快照里没有、也不在 ``preserve`` 的）按「快照即权威」删除 ——
        周期对账同时也是实体删除的兜底路径。

        返回值的三个用途各不相同，缺一个就会留下一种「界面已连接、数据永远停在旧值」：

        - **广播**：对账窗口里错过的变化只能靠它补推给已连接的客户端（否则它们要等到
          下一次全量初态，可能永远等不到）；
        - **回放**：变更同时写进 ``_recent`` 环形缓冲，重连客户端的 ``state_replay``
          才能看见「对账期间变过什么」。旧实现只替换 ``_states`` 不记变更，于是回放
          返回空列表、客户端把「什么都没变」当成「已经补齐」；
        - **计数**：没有变化时不为每个实体写一条空记录，避免把环形缓冲挤爆。
        """
        preserve_ids = {str(item) for item in (preserve or ())}
        previous = self._states
        next_states: dict[str, dict[str, Any]] = {}
        changes: list[dict[str, Any]] = []
        for entity in entities:
            entity_id = str(entity.get("entity_id") or "")
            if not entity_id:
                continue
            existing = previous.get(entity_id)
            if existing is not None and (entity_id in preserve_ids or _is_newer_than(existing, entity)):
                next_states[entity_id] = existing
                continue
            next_states[entity_id] = entity
            _record_snapshot_change(changes, entity_id, existing, entity)
        for entity_id, existing in previous.items():
            if entity_id in next_states:
                continue
            if entity_id in preserve_ids:
                next_states[entity_id] = existing
                continue
            changes.append({"entity_id": entity_id, "old_state": existing, "new_state": None})
        self._states = next_states
        self._ha_synced = True
        self._last_synced_at = _iso_now()
        self._last_state_change_at = time.time() * 1000
        # 「发现变化的时刻」而不是实体自带的 last_updated：环形缓冲的 ``at`` 必须单调
        # 递增，否则 ``is_replay_truncated`` 拿 ``_recent[0].at`` 判起点会误判截断。
        for change in changes:
            record = self.apply_change(change["entity_id"], change["new_state"], self._last_synced_at)
            change["changed_at"] = self._last_synced_at
            change["id"] = record["id"]
            if change["new_state"] is None:
                change["removed"] = True
        return changes

    def remove(self, entity_id: str, changed_at: str | None = None) -> dict[str, Any] | None:
        """删除单个实体（HA ``state_changed`` 且 ``new_state=None``）。

        返回删除前的状态；实体本来就不存在时返回 ``None`` 且**不**写环形缓冲 ——
        否则每次重复的删除事件都会塞一条空变更，把真正需要回放的增量挤出缓冲。
        """
        previous = self._states.get(entity_id)
        if previous is None:
            return None
        self.apply_change(entity_id, None, changed_at)
        return previous

    # ---- 增量 ----
    def apply_change(
        self,
        entity_id: str,
        new_state: dict[str, Any] | None,
        changed_at: str | None = None,
    ) -> dict[str, Any]:
        if new_state is None:
            self._states.pop(entity_id, None)
        else:
            self._states[entity_id] = new_state
        self._last_state_change_at = time.time() * 1000
        self._change_seq += 1
        record = {
            "id": self._change_seq,
            "entity_id": entity_id,
            "new_state": new_state,
            "at": _parse_iso_ms(changed_at) or time.time() * 1000,
        }
        self._recent.append(record)
        return record

    def get_recent_changes_since(self, since_ms: float, last_event_id: int) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for record in self._recent:
            if last_event_id and record["id"] <= last_event_id:
                continue
            if since_ms and record["at"] <= since_ms:
                continue
            out.append(record)
        return out

    def get_latest_change_id(self) -> int:
        return self._change_seq

    def get_last_full_sync_ms(self) -> float:
        """最近一次全量同步（``set_all``）的时刻（毫秒）；从未同步过返回 ``0.0``。

        重连回放要用它判断「客户端基线之后服务端是否整体重铺过一次状态」：
        ``set_all`` 虽然把差异写进了 ``_recent``，但差异为 0 或某批记录已被环形缓冲
        挤出时，回放会变成一个空列表 —— 客户端把它当成「已补齐」，界面就永久停在
        基线时刻的旧值（而且毫无异常提示）。
        """
        return _parse_iso_ms(self._last_synced_at) or 0.0

    def is_replay_truncated(self, since_ms: float, last_event_id: int) -> bool:
        """请求的 replay 起点是否已不可信（此时增量会被漏发，应强制全量 resync）。

        - ``last_event_id`` **超前**于本进程已产生的最大 id：``_change_seq`` 是进程内自增
          计数，重启后从 0 开始。客户端跨重连保留旧游标（例如 1200），新进程只有几十条
          记录时增量过滤会把**所有**记录剔掉，而调用方见 ``replayed`` 就不再发全量 ——
          实体表从此永久停在重启前的状态（且界面毫无异常）。
        - ``last_event_id`` 早于当前保留的最旧记录：中间变更已被丢弃；
        - ``since_ms`` 早于最旧记录的变更时刻：同上（时间窗已滚出缓冲）。
        """
        if last_event_id and last_event_id > self._change_seq:
            return True
        if not self._recent:
            # 缓冲为空但已有变更历史，说明早期变更全部被淘汰
            return self._change_seq > 0
        oldest = self._recent[0]
        if last_event_id and last_event_id < int(oldest["id"]) - 1:
            return True
        return bool(since_ms and since_ms < float(oldest["at"]))

    def apply_state_changed_hot(self, event: dict[str, Any]) -> bool:
        """热路径写入（对齐 Nest ``applyStateChangedHot``）。

        单调性：拒绝时间戳更旧的回放/乱序事件，避免 L1 被陈旧态覆盖。
        同步白名单由调用方（``entity_sync_filter``）先行过滤。
        """
        entity_id = str(event.get("entity_id") or "")
        new_state = event.get("new_state")
        if entity_id and new_state:
            prev = self._states.get(entity_id)
            if prev:
                incoming_ts = _parse_iso_ms(str(new_state.get("last_updated") or new_state.get("last_changed") or ""))
                prev_ts = _parse_iso_ms(str(prev.get("last_updated") or prev.get("last_changed") or ""))
                if incoming_ts and prev_ts and incoming_ts < prev_ts:
                    return False
        self.apply_change(entity_id, new_state, event.get("changed_at"))
        return True

    # ---- HA 同步 / 连接状态 ----
    def is_ha_synced(self) -> bool:
        return self._ha_synced

    def is_ha_connected(self) -> bool:
        """HA 当前是否处于已连接状态（断连期间的状态不可信）。"""
        return self._ha_connected

    def mark_ha_synced(self, value: bool = True) -> None:
        self._ha_synced = value

    def handle_ha_connected(self) -> None:
        """HA 连接成功：标记已连接并清除断连时间戳。"""
        self._ha_connected = True
        self._ha_disconnected_at = None

    def handle_ha_disconnected(self) -> None:
        """HA 断连：标记未连接并记录断连时间戳（用于陈旧度判定）。"""
        self._ha_connected = False
        self._ha_disconnected_at = time.time() * 1000

    # ---- 运维诊断 ----
    def get_stale_info(self) -> dict[str, Any]:
        """数据陈旧度详情：stale 标记、最近同步时间、断连时长（毫秒）。

        与 Nest ``computeStateStoreStaleInfo`` 同口径：阈值内刚刷新的数据不算陈旧，
        避免短暂断连误报。
        """
        threshold = self._stale_threshold_ms
        store_size = len(self._states)
        last_synced_ms = _parse_iso_ms(self._last_synced_at)

        if not self._ha_connected and store_size > 0:
            last_fresh_ms = max(self._last_state_change_at or 0, last_synced_ms)
            if last_fresh_ms > 0 and time.time() * 1000 - last_fresh_ms < threshold:
                return {"stale": False, "syncedAt": self._last_synced_at}
            disconnected_ms = (
                time.time() * 1000 - self._ha_disconnected_at if self._ha_disconnected_at else threshold + 1
            )
            if disconnected_ms >= threshold:
                return {
                    "stale": True,
                    "syncedAt": self._last_synced_at,
                    "disconnectedMs": round(disconnected_ms),
                }
        if not self._ha_synced and store_size > 0 and not self._ha_connected:
            return {"stale": True, "syncedAt": self._last_synced_at}
        return {"stale": False, "syncedAt": self._last_synced_at}

    def get_entity_freshness(self, entity_id: str) -> dict[str, Any]:
        """逐实体新鲜度与可用性派生。

        ``get_stale_info`` 只有连接级口径：HA 连接正常、但单个实体长时间没有上报时，
        界面上仍会显示为「在线」。这里按实体给出 ``lastUpdated`` / ``ageMs`` /
        ``available``，供设备详情与命令后置校验使用。
        """
        state = self._states.get(entity_id)
        if not isinstance(state, dict):
            return {
                "entityId": entity_id,
                "present": False,
                "lastUpdated": None,
                "ageMs": None,
                "available": False,
                "reason": "missing",
            }
        raw_updated = state.get("last_updated") or state.get("lastUpdated") or state.get("updatedAt")
        updated_ms = _parse_iso_ms(str(raw_updated or ""))
        age_ms = round(time.time() * 1000 - updated_ms) if updated_ms else None
        state_value = str(state.get("state") or "").lower()
        if state_value in ("unavailable", "unknown"):
            available, reason = False, state_value
        elif age_ms is not None and age_ms >= self._stale_threshold_ms:
            available, reason = False, "stale"
        else:
            available, reason = True, "ok"
        return {
            "entityId": entity_id,
            "present": True,
            "lastUpdated": raw_updated,
            "ageMs": age_ms,
            "available": available,
            "reason": reason,
        }

    def get_availability_summary(self, limit: int = 20) -> dict[str, Any]:
        """全量可用性派生摘要：不可用 / 陈旧实体计数与样例（运维诊断用）。"""
        unavailable: list[str] = []
        stale: list[str] = []
        now = time.time() * 1000
        for entity_id, state in self._states.items():
            if not isinstance(state, dict):
                continue
            state_value = str(state.get("state") or "").lower()
            if state_value in ("unavailable", "unknown"):
                unavailable.append(entity_id)
                continue
            raw_updated = state.get("last_updated") or state.get("lastUpdated") or state.get("updatedAt")
            updated_ms = _parse_iso_ms(str(raw_updated or ""))
            if updated_ms and now - updated_ms >= self._stale_threshold_ms:
                stale.append(entity_id)
        return {
            "entityCount": len(self._states),
            "unavailableCount": len(unavailable),
            "staleCount": len(stale),
            "unavailableSample": sorted(unavailable)[:limit],
            "staleSample": sorted(stale)[:limit],
        }

    def get_memory_diagnostics(self) -> dict[str, Any]:
        """估算 StateStore 内存占用构成（抽样 150 条实体序列化长度外推）。"""
        entity_count = len(self._states)
        sample_bytes = 0
        sample_n = 0
        for entity in self._states.values():
            sample_bytes += len(json.dumps(entity, ensure_ascii=False, default=str))
            sample_n += 1
            if sample_n >= 150:
                break
        estimated_bytes = round(sample_bytes / sample_n * entity_count) if sample_n else 0
        return {
            "entityCount": entity_count,
            "estimatedEntityStoreMb": round(estimated_bytes / 1024 / 1024 * 10) / 10,
            "recentChangesCount": len(self._recent),
            "recentChangesMax": self._max_recent_changes,
            "haInitialStatesCached": False,
        }


def _parse_iso_ms(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        text = value.replace("Z", "+00:00")
        return datetime.fromisoformat(text).timestamp() * 1000
    except (TypeError, ValueError):
        return 0.0


def _updated_ms(entity: dict[str, Any]) -> float:
    raw = entity.get("last_updated") or entity.get("last_changed")
    return _parse_iso_ms(str(raw or ""))


def _record_snapshot_change(
    changes: list[dict[str, Any]],
    entity_id: str,
    existing: dict[str, Any] | None,
    entity: dict[str, Any],
) -> None:
    """记录一个快照实体带来的变化：新增记 ``old_state=None``，同一次更新则跳过。

    抽成独立函数只为把 ``set_all`` 的分支压回可读范围；判定规则与调用处完全一致。
    """
    if existing is None:
        changes.append({"entity_id": entity_id, "old_state": None, "new_state": entity})
    elif not _same_update(existing, entity):
        changes.append({"entity_id": entity_id, "old_state": existing, "new_state": entity})


def _is_newer_than(candidate: dict[str, Any], reference: dict[str, Any]) -> bool:
    """``candidate`` 的时间戳是否严格晚于 ``reference``。

    任一侧没有可用时间戳时返回 ``False``：无法判新旧就按快照权威走，
    不拿「缺字段」当「更新」的凭据，否则一份缺 ``last_updated`` 的快照会永久盖住内存。
    """
    candidate_ms = _updated_ms(candidate)
    reference_ms = _updated_ms(reference)
    if not candidate_ms or not reference_ms:
        return False
    return candidate_ms > reference_ms


def _same_update(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """两份状态是否代表**同一次更新**（对账后据此跳过未变化的实体）。

    ``last_updated`` 是 HA 的权威更新时刻：它相同即说明值和属性都没变，不必广播、
    也不必写回放记录。缺这个字段时退回「状态 + 属性」深比较 —— 宁可多广播一条，
    也不要漏掉一次真实变化。
    """
    left_token = str(left.get("last_updated") or left.get("last_changed") or "")
    right_token = str(right.get("last_updated") or right.get("last_changed") or "")
    if left_token and right_token:
        return left_token == right_token and str(left.get("state")) == str(right.get("state"))
    return str(left.get("state")) == str(right.get("state")) and object_field(
        left, "attributes"
    ) == object_field(right, "attributes")


# 实体查询工具（对齐 Nest ``state-store/internals.ts``）
def slice_entities_by_cursor(entities: list[dict[str, Any]], cursor: str | None, limit: int) -> dict[str, Any]:
    """按 entity_id 稳定排序后做游标分页（cursor 为上一页最后一条 entity_id）。"""
    ordered = sorted(entities, key=lambda e: str(e.get("entity_id") or ""))
    total = len(ordered)
    safe_limit = min(max(int(limit or 0), 1), 2000)

    start_idx = 0
    marker = str(cursor or "").strip()
    if marker:
        idx = next((i for i, e in enumerate(ordered) if str(e.get("entity_id") or "") > marker), -1)
        start_idx = idx if idx >= 0 else total

    page = ordered[start_idx : start_idx + safe_limit]
    has_more = start_idx + len(page) < total
    next_cursor = str(page[-1].get("entity_id")) if has_more and page else None
    return {"entities": page, "total": total, "nextCursor": next_cursor}


def _entity_name(entity: dict[str, Any]) -> str:
    attrs = object_field(entity, "attributes")
    return str(attrs.get("friendly_name") or entity.get("entity_id") or "")


def _is_unavailable(entity: dict[str, Any]) -> bool:
    return entity.get("state") in ("unavailable", "unknown")


def _battery_level(entity: dict[str, Any]) -> float | None:
    attrs = object_field(entity, "attributes")
    value = attrs.get("battery_level")
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def normalize_entity_status_filter(raw: Any) -> str:
    """状态过滤参数规范化（支持 ``low-battery`` → ``low_battery`` 变体）。"""
    if raw in ("online", "offline", "low_battery"):
        return str(raw)
    if raw == "low-battery":
        return "low_battery"
    return ""


def normalize_entity_sort_filter(raw: Any) -> str:
    """排序参数规范化（支持 kebab-case 与 snake_case 变体）。"""
    if raw == "name-asc":
        return "name_asc"
    if raw == "name-desc":
        return "name_desc"
    if raw == "last-changed":
        return "last_changed"
    if raw in ("status", "last_changed", "name_asc", "name_desc"):
        return str(raw)
    return ""


def filter_entities_by_query(
    entities: list[dict[str, Any]],
    *,
    status: str = "",
    area: str = "",
    sort: str = "",
    controllable: bool = False,
) -> list[dict[str, Any]]:
    """按状态 / 区域 / 可控性过滤实体并排序（对齐 Nest ``filterEntitiesByQuery``）。"""
    from ..platform.core.entity.controllable import is_controllable_entity_id
    from ..platform.core.entity.entity_area import entity_matches_area_filter

    result = entities
    if controllable:
        result = [e for e in result if is_controllable_entity_id(str(e.get("entity_id") or ""))]

    if status == "online":
        result = [e for e in result if not _is_unavailable(e)]
    elif status == "offline":
        result = [e for e in result if _is_unavailable(e)]
    elif status == "low_battery":
        result = [e for e in result if (level := _battery_level(e)) is not None and level <= 20]

    area_filter = str(area or "").strip()
    if area_filter:
        result = [e for e in result if entity_matches_area_filter(object_field(e, "attributes"), area_filter)]

    effective_sort = sort or "name_asc"
    if effective_sort == "name_asc":
        return sorted(result, key=_entity_name)
    if effective_sort == "name_desc":
        return sorted(result, key=_entity_name, reverse=True)
    if effective_sort == "status":
        return sorted(result, key=lambda e: (1 if _is_unavailable(e) else 0, _entity_name(e)))
    if effective_sort == "last_changed":
        return sorted(result, key=lambda e: _parse_iso_ms(str(e.get("last_changed") or "")), reverse=True)
    return result
