"""``HAConnectorService`` 的宿主契约：跨族依赖的属性与方法声明。

拆成 mixin 后各族看不见主类 ``__init__`` 注入的属性与其他族的方法，这里统一声明；
类体 ``None`` 默认值满足 ``reportUninitializedInstanceVariable`` 硬门禁
，运行期由实现方覆盖。
"""

from __future__ import annotations

from typing import Any


class HAConnectorHost:
    """宿主与各族 mixin 共享的成员声明（仅类型契约）。"""

    _connected: Any = None
    _connection_listener: Any = None
    _control_pool: Any = None
    _database_lock: Any = None
    _endpoint: Any = None
    _endpoint_lock: Any = None
    _endpoint_probed_at: Any = None
    _endpoint_signature: Any = None
    _failure_kind: Any = None
    _failure_logged_at: Any = None
    _offline_since: Any = None
    _ha_tuning_at: Any = None
    _ha_tuning_cache: Any = None
    _history_cache: Any = None
    _history_cache_lock: Any = None
    _history_fetches: Any = None
    _history_semaphore: Any = None
    _http_pool: Any = None
    _incremental_flushed_at: Any = None
    _jitter_random: Any = None
    _initial_sync_logged: Any = None
    _known_entity_ids: Any = None
    _last_connection_status: Any = None
    _lifecycle_lock: Any = None
    _persistent_entity_ids: Any = None
    _registry_refresh_tasks: Any = None
    _runner: Any = None
    _runtime_entity_watch_counts: Any = None
    _runtime_error: Any = None
    _state_listener: Any = None
    _sync_lock: Any = None
    _translation_cache: Any = None
    _translation_lock: Any = None
    _watch_lock: Any = None
    cipher: Any = None
    database: Any = None
    event_log: Any = None
    settings: Any = None
    state_hub: Any = None

    _active_catalog_counts: Any = None
    _apply_incremental_state: Any = None
    _apply_incremental_states: Any = None
    _apply_registry_event: Any = None
    _apply_registry_snapshot: Any = None
    _apply_snapshot: Any = None
    _control_configuration: Any = None
    _debounced_registry_refresh: Any = None
    _device_registry_metadata: Any = None
    _discard_history_fetch: Any = None
    _dispatch_live_event: Any = None
    _fetch_and_cache_history: Any = None
    _flush_live_state_changes: Any = None
    _ha_tuning: Any = None
    _handle_live_event: Any = None
    _history_cache_limits: Any = None
    _live_connection: Any = None
    _live_event_batch_window: Any = None
    _load_connection: Any = None
    _load_persistent_entity_ids: Any = None
    _log_event: Any = None
    _log_cycle_failure: Any = None
    _mark_connected: Any = None
    _mark_sync_started: Any = None
    _next_backoff: Any = None
    _notify_connection: Any = None
    _notify_state: Any = None
    _probe_endpoint: Any = None
    _probe_endpoints: Any = None
    _reconnect_base_backoff: Any = None
    _reconnect_max_backoff: Any = None
    _record_error: Any = None
    _reset_failure_state: Any = None
    _run: Any = None
    _run_database: Any = None
    _safe_record_error: Any = None
    _schedule_registry_refresh: Any = None
    _status: Any = None
    _stop: Any = None
    _stop_tasks: Any = None
    _store_active_endpoint: Any = None
    active_connection: Any = None
    active_endpoint: Any = None
    catalog_counts: Any = None
    client_for: Any = None
    ensure_entity_states: Any = None
    invalidate_endpoint: Any = None
    refresh_persistent_entity_ids: Any = None
    start: Any = None
    sync_once: Any = None
    watched_entity_ids: Any = None
