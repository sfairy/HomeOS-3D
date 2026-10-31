"""实体状态存储（L1 内存 + 最近变更环形缓冲，供 WS 首推与 state_replay 使用）。

替代 Nest ``StateStoreService`` 的核心子集。本模块同时提供运维诊断所需的
``get_stale_info`` / ``get_memory_diagnostics``，口径与 Nest
``computeStateStoreStaleInfo`` / ``computeStateStoreMemoryDiagnostics`` 对齐。
"""

from __future__ import annotations

import json
import time
from collections import deque
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

    def set_all(self, entities: list[dict[str, Any]]) -> None:
        self._states = {
            str(entity["entity_id"]): entity for entity in entities if entity.get("entity_id")
        }
        self._ha_synced = True
        self._last_synced_at = _iso_now()
        self._last_state_change_at = time.time() * 1000

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

    def is_replay_truncated(self, since_ms: float, last_event_id: int) -> bool:
        """请求的 replay 起点是否已被环形缓冲淘汰（此时增量不可信，应建议全量 resync）。

        - ``last_event_id`` 早于当前保留的最旧记录：中间变更已被丢弃；
        - ``since_ms`` 早于最旧记录的变更时刻：同上（时间窗已滚出缓冲）。
        """
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
                incoming_ts = _parse_iso_ms(
                    str(new_state.get("last_updated") or new_state.get("last_changed") or "")
                )
                prev_ts = _parse_iso_ms(
                    str(prev.get("last_updated") or prev.get("last_changed") or "")
                )
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
                time.time() * 1000 - self._ha_disconnected_at
                if self._ha_disconnected_at
                else threshold + 1
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
            raw_updated = (
                state.get("last_updated") or state.get("lastUpdated") or state.get("updatedAt")
            )
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


# 实体查询工具（对齐 Nest ``state-store/internals.ts``）
def slice_entities_by_cursor(
    entities: list[dict[str, Any]], cursor: str | None, limit: int
) -> dict[str, Any]:
    """按 entity_id 稳定排序后做游标分页（cursor 为上一页最后一条 entity_id）。"""
    ordered = sorted(entities, key=lambda e: str(e.get("entity_id") or ""))
    total = len(ordered)
    safe_limit = min(max(int(limit or 0), 1), 2000)

    start_idx = 0
    marker = str(cursor or "").strip()
    if marker:
        idx = next(
            (i for i, e in enumerate(ordered) if str(e.get("entity_id") or "") > marker), -1
        )
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
        result = [
            e for e in result if (level := _battery_level(e)) is not None and level <= 20
        ]

    area_filter = str(area or "").strip()
    if area_filter:
        result = [
            e
            for e in result
            if entity_matches_area_filter(
                object_field(e, "attributes"), area_filter
            )
        ]

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

