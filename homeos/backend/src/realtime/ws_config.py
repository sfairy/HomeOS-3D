"""WS/状态存储配置读取（wsPush / stateStore 分区）。

默认值与 Nest ``backend/src/shared/app-config/defaults.ts`` 保持一致；读取时从
``SystemConfig`` JSON 覆盖，缺省回退默认值。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from ..core.app_config import load_raw_config
from .access import WS_PUSH_CRITICAL_DOMAINS


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


def load_ws_push_config(session: Session) -> WsPushConfig:
    raw = load_raw_config(session)
    section = raw.get("wsPush") if isinstance(raw.get("wsPush"), dict) else {}
    merged = {**DEFAULT_WS_PUSH, **section}
    domains = merged.get("criticalDomains")
    return WsPushConfig(
        critical_domains=tuple(str(x) for x in domains) if isinstance(domains, list) else tuple(WS_PUSH_CRITICAL_DOMAINS),
        ha_sync_wait_ms=int(merged["haSyncWaitMs"]),
        replay_chunk_size=int(merged["replayChunkSize"]),
        cold_entity_on_demand=bool(merged["coldEntityOnDemand"]),
    )


def load_state_store_config(session: Session) -> StateStoreConfig:
    raw = load_raw_config(session)
    section = raw.get("stateStore") if isinstance(raw.get("stateStore"), dict) else {}
    merged = {**DEFAULT_STATE_STORE, **section}
    return StateStoreConfig(
        stale_threshold_ms=int(merged["staleThresholdMs"]),
        initial_states_priority_enabled=bool(merged["initialStatesPriorityEnabled"]),
        max_recent_changes=int(merged.get("maxRecentChanges") or 3000),
    )


_default_ws_push = WsPushConfig()
_default_state_store = StateStoreConfig()
_ = (_default_ws_push, _default_state_store, field)
