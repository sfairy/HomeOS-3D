"""WS/状态存储配置读取（wsPush / stateStore 分区）。

默认值与 Nest ``backend/src/shared/app-config/defaults.ts`` 保持一致；读取时从
``SystemConfig`` JSON 覆盖，缺省回退默认值。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from ..platform.core.db.json_field import object_field
from ..platform.core.runtime.app_config import load_raw_config
from ..platform.security.entity_access import WS_PUSH_CRITICAL_DOMAINS

logger = logging.getLogger("homeos.realtime.ws_config")


@dataclass(frozen=True)
class WsPushConfig:
    critical_domains: tuple[str, ...] = tuple(WS_PUSH_CRITICAL_DOMAINS)
    ha_sync_wait_ms: int = 90_000
    replay_chunk_size: int = 400
    cold_entity_on_demand: bool = True


@dataclass(frozen=True)
class StateStoreConfig:
    stale_threshold_ms: int = 12_000
    initial_states_priority_enabled: bool = True
    max_recent_changes: int = 3000


DEFAULT_WS_PUSH: dict[str, Any] = {
    "criticalDomains": list(WS_PUSH_CRITICAL_DOMAINS),
    "haSyncWaitMs": 90_000,
    "replayChunkSize": 400,
    "coldEntityOnDemand": True,
}
DEFAULT_STATE_STORE: dict[str, Any] = {
    "staleThresholdMs": 12_000,
    "initialStatesPriorityEnabled": True,
    "maxRecentChanges": 3000,
}


def _int_field(mapping: dict[str, Any], key: str, default: int) -> int:
    try:
        return int(mapping.get(key, default))
    except (TypeError, ValueError):
        logger.warning("ws 配置 %s 非法，回退默认值 %r", key, default)
        return default


def _bool_field(mapping: dict[str, Any], key: str, default: bool) -> bool:
    value = mapping.get(key, default)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default


def load_ws_push_config(session: Session) -> WsPushConfig:
    raw = load_raw_config(session)
    section = object_field(raw, "wsPush")
    merged = {**DEFAULT_WS_PUSH, **section}
    domains = merged.get("criticalDomains")
    return WsPushConfig(
        critical_domains=tuple(str(x) for x in domains) if isinstance(domains, list) else tuple(WS_PUSH_CRITICAL_DOMAINS),
        ha_sync_wait_ms=_int_field(merged, "haSyncWaitMs", DEFAULT_WS_PUSH["haSyncWaitMs"]),
        replay_chunk_size=_int_field(merged, "replayChunkSize", DEFAULT_WS_PUSH["replayChunkSize"]),
        cold_entity_on_demand=_bool_field(
            merged, "coldEntityOnDemand", DEFAULT_WS_PUSH["coldEntityOnDemand"]
        ),
    )


def load_state_store_config(session: Session) -> StateStoreConfig:
    raw = load_raw_config(session)
    section = object_field(raw, "stateStore")
    merged = {**DEFAULT_STATE_STORE, **section}
    return StateStoreConfig(
        stale_threshold_ms=_int_field(
            merged, "staleThresholdMs", DEFAULT_STATE_STORE["staleThresholdMs"]
        ),
        initial_states_priority_enabled=_bool_field(
            merged,
            "initialStatesPriorityEnabled",
            DEFAULT_STATE_STORE["initialStatesPriorityEnabled"],
        ),
        max_recent_changes=_int_field(
            merged, "maxRecentChanges", DEFAULT_STATE_STORE["maxRecentChanges"]
        ),
    )


_default_ws_push = WsPushConfig()
_default_state_store = StateStoreConfig()
_ = (_default_ws_push, _default_state_store, field)
