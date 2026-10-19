"""WS 载荷构造（对齐 ws-push/delta.util.ts）。

含 80ms 短窗口 diff 缓存：高频同值事件复用 diff 结果，减少重复计算与带宽。
"""

from __future__ import annotations

import json
import math
import time
from typing import Any

DELTA_ATTR_SKIP = frozenset({"last_changed", "last_updated", "last_reported"})
_DELTA_DIFF_CACHE_TTL_MS = 80
_DELTA_DIFF_CACHE_MAX = 4096
_delta_cache: dict[str, dict[str, Any]] = {}


def _values_shallow_equal(a: Any, b: Any) -> bool:
    if a is b:
        return True
    if isinstance(a, (dict, list)) or isinstance(b, (dict, list)):
        try:
            return a == b
        except Exception:
            return False
    return a == b


def pick_changed_attributes(
    old_attrs: dict[str, Any] | None,
    new_attrs: dict[str, Any] | None,
    skip_keys: frozenset[str] | None = None,
) -> tuple[dict[str, Any] | None, list[str] | None]:
    old_attrs = old_attrs or {}
    new_attrs = new_attrs or {}
    changed: dict[str, Any] = {}
    removed: list[str] = []
    for key in set(old_attrs) | set(new_attrs):
        if skip_keys and key in skip_keys:
            continue
        old_value = old_attrs.get(key)
        new_value = new_attrs.get(key)
        if not _values_shallow_equal(old_value, new_value):
            if old_value is not None and new_value is None:
                removed.append(key)
            elif new_value is not None:
                changed[key] = new_value
    return (changed or None), (removed or None)


def _compute_state_diff(event: dict[str, Any]) -> dict[str, Any]:
    changed, removed = pick_changed_attributes(
        (event.get("old_state") or {}).get("attributes"),
        (event.get("new_state") or {}).get("attributes"),
        DELTA_ATTR_SKIP,
    )
    return {
        "changed": changed,
        "removed": removed,
        "stateChanged": (event.get("old_state") or {}).get("state")
        != (event.get("new_state") or {}).get("state"),
    }


def _fingerprint_attributes(attrs: dict[str, Any] | None) -> str:
    if not attrs:
        return ""
    out = ""
    for key in attrs:
        if key in DELTA_ATTR_SKIP:
            continue
        value = attrs[key]
        out += f"{key}:{'undefined' if value is None else _stable_json(value)};"
    return out


def _stable_json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=False, separators=(",", ":"))
    except (TypeError, ValueError):
        return str(value)


def _build_cache_key(event: dict[str, Any]) -> str:
    """80ms diff 缓存的键：O(1)，不序列化属性内容。

    旧实现把 old/new 两侧 attributes 逐键 ``json.dumps`` 拼成完整内容指纹：键本身比它
    要省的 delta 计算还贵，而命中率接近 0（只有「同值重发」才命中）。改成用
    ``entity_id + 两侧 state + last_updated + 属性条数`` 作为新鲜度令牌：

    - HA 侧任何 state/attribute 变化都会推进 ``last_updated``（属性变更只推进
      ``last_updated`` 不推进 ``last_changed``），所以它足以区分两次更新；
    - 缺时间戳的事件（本地构造）回退到内容指纹，正确性优先于开销。
    """
    old_state = event.get("old_state") or {}
    new_state = event.get("new_state") or {}
    new_updated = new_state.get("last_updated") or new_state.get("last_changed")
    if new_updated:
        old_attrs = old_state.get("attributes")
        new_attrs = new_state.get("attributes")
        return (
            f"{event.get('entity_id')}|{old_state.get('state', '')}|{new_state.get('state', '')}"
            f"|{new_updated}|{old_state.get('last_updated') or old_state.get('last_changed') or ''}"
            f"|{len(old_attrs) if isinstance(old_attrs, dict) else 0}"
            f"|{len(new_attrs) if isinstance(new_attrs, dict) else 0}"
        )
    key = f"{event.get('entity_id')}|{old_state.get('state', '')}|{new_state.get('state', '')}"
    key += f"|o:{_fingerprint_attributes(old_state.get('attributes'))}"
    key += f"|n:{_fingerprint_attributes(new_state.get('attributes'))}"
    return key


def to_ws_state_change_payload(event: dict[str, Any]) -> dict[str, Any]:
    pipeline_ts = event.get("pipeline_ts") if isinstance(event.get("pipeline_ts"), (int, float)) else None
    base: dict[str, Any] = {
        "entity_id": event.get("entity_id"),
        "old_state": event.get("old_state"),
        "new_state": event.get("new_state"),
        "changed_at": event.get("changed_at"),
    }
    if pipeline_ts is not None:
        base["_pipelineTs"] = pipeline_ts

    new_state = event.get("new_state")
    old_state = event.get("old_state")
    if not new_state or not old_state:
        return base

    cache_key = _build_cache_key(event)
    now = time.monotonic() * 1000
    cached = _delta_cache.get(cache_key)
    if cached is not None and cached["expiresAt"] > now:
        diff = cached
    else:
        diff = {**_compute_state_diff(event), "expiresAt": now + _DELTA_DIFF_CACHE_TTL_MS}
        if len(_delta_cache) >= _DELTA_DIFF_CACHE_MAX:
            _delta_cache.clear()
        _delta_cache[cache_key] = diff

    changed_attrs = diff["changed"]
    removed_attrs = diff["removed"]
    delta_attr_count = (len(changed_attrs) if changed_attrs else 0) + (len(removed_attrs) if removed_attrs else 0)

    if not diff["stateChanged"] and delta_attr_count == 0:
        return base

    old_count = len(old_state.get("attributes") or {})
    new_count = len(new_state.get("attributes") or {})

    if delta_attr_count > 0 and delta_attr_count < min(old_count, new_count) * 0.6:
        payload: dict[str, Any] = {
            "entity_id": event.get("entity_id"),
            "old_state": None,
            "new_state": None,
            "changed_at": event.get("changed_at"),
            "_delta": True,
            "state": new_state.get("state"),
        }
        if changed_attrs:
            payload["changed_attributes"] = changed_attrs
        if removed_attrs:
            payload["removed_attributes"] = removed_attrs
        if pipeline_ts is not None:
            payload["_pipelineTs"] = pipeline_ts
        return payload

    if diff["stateChanged"] and delta_attr_count <= 8:
        payload = {
            "entity_id": event.get("entity_id"),
            "old_state": None,
            "new_state": None,
            "changed_at": event.get("changed_at"),
            "_delta": True,
            "state": new_state.get("state"),
        }
        if changed_attrs:
            payload["changed_attributes"] = changed_attrs
        if removed_attrs:
            payload["removed_attributes"] = removed_attrs
        if pipeline_ts is not None:
            payload["_pipelineTs"] = pipeline_ts
        return payload

    return base



def parse_state_replay_params(since_raw: Any, last_event_id_raw: Any) -> tuple[float, int]:
    since_ms = 0.0
    last_event_id = 0
    if since_raw:
        try:
            from email.utils import parsedate_to_datetime

            since_ms = parsedate_to_datetime(str(since_raw)).timestamp() * 1000
        except Exception:
            since_ms = 0.0
    if last_event_id_raw:
        try:
            last_event_id = int(str(last_event_id_raw), 10)
        except (TypeError, ValueError):
            last_event_id = 0
    return (since_ms if not math.isnan(since_ms) else 0.0), last_event_id


def should_replay_state(since_ms: float, last_event_id: int) -> bool:
    return since_ms > 0 or last_event_id > 0


def _iso_now() -> str:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
