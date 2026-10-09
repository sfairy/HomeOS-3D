"""Socket.IO 推送网关（msgpack 线协议），逐条对齐 Nest ``WsPushGateway`` 的核心契约。

已实现：
- msgpack 解析器 + notepack ExtType 兼容；
- 握手 JWT 鉴权（Cookie ``auth_token``）、用户房间、订阅分组；
- 首推序列：ha_status(early) → initial_states(单条/分片 begin/chunk/end) → state_replay → ha_status(final) → redis_status；
- 客户端事件 ``update_subscription`` / ``ha_sync_fe_latency``；
- 广播 API：ha_status / redis_status / state_changed_batch / entities_stale / ha_queue_dropped /
  notification / home_mode / automation_executed / security_* / presence_* /
  energy_anomaly / frigate_detection / room_presence / tts_speak / earthquake_*；
- HA connector 事件接入 + Redis 跨副本桥接 + 领域事件 fan-out（见 ``ha/service.py``、
  ``services/event_bus_bridge.py``、``realtime/domain_events.py``）。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import UTC, datetime
from typing import Any

import socketio

from .access import filter_entities_by_access, sort_entities_by_sync_priority
from .msgpack_compat import install_msgpack_ext_hook
from .payloads import (
    build_redis_ws_status_payload,
    parse_state_replay_params,
    should_replay_state,
    to_ws_state_change_payload,
)
from .state_store import StateStore
from .subscription import is_entity_visible_to_client, resolve_user_room_key
from .ws_auth import extract_auth_token_from_cookie, resolve_ws_user
from .ws_buffer import resolve_ws_max_buffer_bytes
from .ws_config import load_state_store_config, load_ws_push_config
from ..core.entity_domain import get_entity_domain
from ..core.observability import record_ha_sync_fe_latency_samples, record_ha_sync_latency

_SERVER_TOKEN = "server"

logger = logging.getLogger("homeos.realtime.gateway")

#: 单客户端 websocket 写缓冲背压阈值（对齐 Nest ``WS_PUSH_BACKPRESSURE_WRITE_BUFFER``）
WS_PUSH_BACKPRESSURE_WRITE_BUFFER = 512


def _resync_suggested_payload(reason: str = "backpressure") -> dict[str, Any]:
    """全量重同步建议负载（对齐 ``emitResyncSuggested``）。"""
    return {"type": "resync_suggested", "reason": reason, "timestamp": _iso_now()}


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


class RealtimeGateway:
    def __init__(self, app: Any) -> None:
        self.app = app
        install_msgpack_ext_hook()
        self.sio = socketio.AsyncServer(
            async_mode="asgi",
            serializer="msgpack",
            cors_allowed_origins=self._is_origin_allowed,
            cors_credentials=True,
            logger=False,
            engineio_logger=False,
            max_http_buffer_size=resolve_ws_max_buffer_bytes(),
        )
        self.connected: set[str] = set()
        #: 已收到全量基线的 sid。未就绪前不参与 ``state_changed_batch`` 广播：
        # 全量快照生成前的增量已包含在快照里，再以 delta 下发只会被前端丢弃并告警。
        self._baseline_ready: set[str] = set()
        #: 订阅索引：域 / 钉选 → sid，广播时先收窄候选再做精确过滤。
        self._sub_domain_sids: dict[str, set[str]] = {}
        self._sub_wildcard_sids: set[str] = set()
        self._sub_pinned_sids: dict[str, set[str]] = {}
        self._sid_sub_domains: dict[str, set[str] | None] = {}
        self._sid_pinned: dict[str, set[str]] = {}
        self.state_store: StateStore = StateStore()
        self._state_cfg_at = 0.0
        self._ws_cfg_cache: Any | None = None
        self._ws_cfg_at = 0.0
        self._register_handlers()

    # ------------------------------------------------------------------ #
    # CORS
    # ------------------------------------------------------------------ #
    @staticmethod
    def _is_origin_allowed(origin: str | None) -> bool:
        if not origin:
            return True
        from ..security.cookies import is_origin_allowed, resolve_allowed_origins

        return is_origin_allowed(origin, resolve_allowed_origins())

    # ------------------------------------------------------------------ #
    # 依赖读取（lifespan 之后才可用）
    # ------------------------------------------------------------------ #
    @property
    def settings(self) -> Any:
        return self.app.state.settings

    def _ha_configured(self) -> bool:
        if getattr(self.app.state, "ha_configured", None) is not None:
            return bool(self.app.state.ha_configured)
        return bool(os.getenv("HA_URL", "").strip() or os.getenv("HA_BASE_URL", "").strip())

    def _ha_status_snapshot(self) -> dict[str, Any]:
        return {
            "connected": bool(getattr(self.app.state, "ha_connected", False)),
            "ha_version": getattr(self.app.state, "ha_version", None),
            "attempt": getattr(self.app.state, "ha_reconnect_attempt", None),
        }

    def _ws_config(self):
        now = time.monotonic()
        cached = getattr(self, "_ws_cfg_cache", None)
        cached_at = getattr(self, "_ws_cfg_at", 0.0)
        if cached is not None and now - cached_at < 5.0:
            return cached
        database = self.app.state.database
        with database.session_factory() as session:
            cfg = load_ws_push_config(session)
        self._ws_cfg_cache = cfg
        self._ws_cfg_at = now
        return cfg

    def _state_config(self):
        database = self.app.state.database
        with database.session_factory() as session:
            return load_state_store_config(session)

    def _apply_state_config(self) -> None:
        """把 ``stateStore`` 分区配置热更新到 L1 存储（5s TTL 缓存，避免每批都读库）。"""
        now = time.monotonic()
        if now - self._state_cfg_at < 5.0:
            return
        self._state_cfg_at = now
        try:
            cfg = self._state_config()
        except Exception:
            return
        self.state_store.apply_config(
            max_recent_changes=cfg.max_recent_changes,
            stale_threshold_ms=cfg.stale_threshold_ms,
        )

    # ------------------------------------------------------------------ #
    # 事件注册
    # ------------------------------------------------------------------ #
    def _register_handlers(self) -> None:
        self.sio.on("connect", self._on_connect)
        self.sio.on("disconnect", self._on_disconnect)
        self.sio.on("update_subscription", self._on_update_subscription)
        self.sio.on("ha_sync_fe_latency", self._on_ha_sync_fe_latency)

    # ------------------------------------------------------------------ #
    # 握手 / 断开
    # ------------------------------------------------------------------ #
    async def _on_connect(self, sid: str, environ: dict[str, Any], auth: Any) -> None:
        cookie_header = environ.get("HTTP_COOKIE")
        # DB 会话 Cookie（homeos-3d LoginSession）为唯一登录凭证。
        session_token = extract_auth_token_from_cookie(
            cookie_header, self.settings.cookie_name
        )
        token = session_token
        if not token:
            raise socketio.exceptions.ConnectionRefusedError("auth required")

        database = self.app.state.database
        try:
            with database.session_factory() as session:
                user = resolve_ws_user(token, session)
        except Exception:
            raise socketio.exceptions.ConnectionRefusedError("unauthorized") from None

        auth_payload = auth if isinstance(auth, dict) else {}
        await self.sio.save_session(
            sid,
            {
                "user": user,
                "subscribedDomains": auth_payload.get("subscribeDomains"),
                "pinnedEntityIds": auth_payload.get("pinnedEntityIds"),
            },
        )
        await self.sio.enter_room(sid, resolve_user_room_key(user, sid))
        self.connected.add(sid)
        self.app.state.socket_clients = len(self.connected)

        # 1) 尽早推送 HA 状态，避免前端在等全量时误判掉线
        early = self._ha_status_snapshot()
        await self.sio.emit(
            "ha_status",
            _ha_status_payload("connected" if early["connected"] else "disconnected", early),
            to=sid,
        )

        ws_cfg = self._ws_config()
        self._apply_state_config()
        await self._wait_for_ha_entity_sync(ws_cfg.ha_sync_wait_ms)
        await self.state_store.recover_initial_states_if_needed()

        entities = sort_entities_by_sync_priority(
            filter_entities_by_access(self.state_store.get_all(), user),
            list(ws_cfg.critical_domains),
        )
        # 快照已生成：此刻起该 sid 才有「基线」。
        # 等待期（_wait_for_ha_entity_sync）内的增量其变更时刻不晚于本快照，已包含在
        # entities 中，因此无需再以 delta 下发；此前不纳入 state_changed_batch 广播目标，
        # 可避免前端「全量同步完成前丢弃 delta」的告警与无效带宽。
        self._baseline_ready.add(sid)
        self._index_subscription(
            sid,
            auth_payload.get("subscribeDomains"),
            auth_payload.get("pinnedEntityIds"),
        )

        handled_since = False
        try:
            await self._emit_initial_states(sid, entities, ws_cfg.replay_chunk_size)
        except Exception:
            await self.sio.emit(
                "sync_error",
                {
                    "type": "sync_error",
                    "code": "initial_states_failed",
                    "count": len(entities),
                },
                to=sid,
            )

        since_raw = auth_payload.get("since")
        last_event_raw = auth_payload.get("lastEventId")
        since_ms, last_event_id = parse_state_replay_params(since_raw, last_event_raw)
        if should_replay_state(since_ms, last_event_id):
            handled_since = True
            if self.state_store.is_replay_truncated(since_ms, last_event_id):
                # 环形缓冲已淘汰部分变更：此时下发增量会漏掉状态，
                # 前端已有完整快照，直接建议重同步（会回滚乐观更新并软重拉）。
                logger.info("state_replay 起点已淘汰,建议客户端重同步 sid=%s", sid)
                await self.sio.emit(
                    "resync_suggested", _resync_suggested_payload("replay_truncated"), to=sid
                )
            else:
                replay = [
                    record
                    for record in self.state_store.get_recent_changes_since(since_ms, last_event_id)
                    if _entity_visible(user, record["entity_id"])
                ]
                if replay:
                    await self.sio.emit(
                        "state_replay",
                        {
                            "type": "state_replay",
                            "changes": [
                                to_ws_state_change_payload(
                                    {
                                        "entity_id": record["entity_id"],
                                        "old_state": None,
                                        "new_state": record["new_state"],
                                        "changed_at": _ms_to_iso(record["at"]),
                                    }
                                )
                                for record in replay
                            ],
                            "count": len(replay),
                            "lastEventId": self.state_store.get_latest_change_id(),
                            "timestamp": _iso_now(),
                        },
                        to=sid,
                    )
        _ = handled_since

        final = self._ha_status_snapshot()
        await self.sio.emit(
            "ha_status",
            _ha_status_payload("connected" if final["connected"] else "disconnected", final),
            to=sid,
        )
        await self.sio.emit(
            "redis_status",
            build_redis_ws_status_payload(
                self.settings.redis_configured,
                bool(getattr(self.app.state, "redis", None) and self.app.state.redis.is_ready()),
            ),
            to=sid,
        )

    async def _on_disconnect(self, sid: str, reason: Any = None) -> None:
        self.connected.discard(sid)
        self._baseline_ready.discard(sid)
        self._unindex_subscription(sid)
        self.app.state.socket_clients = len(self.connected)

    def _unindex_subscription(self, sid: str) -> None:
        domains = self._sid_sub_domains.pop(sid, None)
        self._sub_wildcard_sids.discard(sid)
        if domains:
            for domain in domains:
                bucket = self._sub_domain_sids.get(domain)
                if not bucket:
                    continue
                bucket.discard(sid)
                if not bucket:
                    self._sub_domain_sids.pop(domain, None)
        for entity_id in self._sid_pinned.pop(sid, ()):
            bucket = self._sub_pinned_sids.get(entity_id)
            if not bucket:
                continue
            bucket.discard(sid)
            if not bucket:
                self._sub_pinned_sids.pop(entity_id, None)

    def _index_subscription(self, sid: str, domains_raw: Any, pinned_raw: Any) -> None:
        self._unindex_subscription(sid)
        domains = _as_set(domains_raw)
        pinned = _as_set(pinned_raw, require_dot=True) or set()
        self._sid_sub_domains[sid] = domains
        self._sid_pinned[sid] = pinned
        if domains is None:
            self._sub_wildcard_sids.add(sid)
        else:
            for domain in domains:
                self._sub_domain_sids.setdefault(domain, set()).add(sid)
        for entity_id in pinned:
            self._sub_pinned_sids.setdefault(entity_id, set()).add(sid)

    def _candidate_sids_for_changes(
        self, changes: list[dict[str, Any]], critical_domains: set[str]
    ) -> set[str]:
        """按域/钉选收窄广播候选；含 critical 域时退回全量 baseline（语义不变）。"""
        if not self._baseline_ready:
            return set()
        change_domains = {get_entity_domain(str(change.get("entity_id") or "")) for change in changes}
        change_domains.discard("")
        if change_domains & critical_domains:
            return set(self._baseline_ready)
        candidates = set(self._sub_wildcard_sids)
        for domain in change_domains:
            bucket = self._sub_domain_sids.get(domain)
            if bucket:
                candidates |= bucket
        for change in changes:
            entity_id = str(change.get("entity_id") or "")
            if not entity_id:
                continue
            bucket = self._sub_pinned_sids.get(entity_id)
            if bucket:
                candidates |= bucket
        if not candidates:
            # 索引尚未建立时保守退回全量，避免漏推。
            return set(self._baseline_ready)
        return candidates & self._baseline_ready

    # ------------------------------------------------------------------ #
    # 客户端事件
    # ------------------------------------------------------------------ #
    async def _on_update_subscription(self, sid: str, payload: Any = None) -> dict[str, Any]:
        payload = payload if isinstance(payload, dict) else {}
        session = await self.sio.get_session(sid)
        session = dict(session or {})
        session["subscribedDomains"] = payload.get("subscribeDomains")
        session["pinnedEntityIds"] = payload.get("pinnedEntityIds")
        await self.sio.save_session(sid, session)
        self._index_subscription(
            sid, session.get("subscribedDomains"), session.get("pinnedEntityIds")
        )
        return {"ok": True}

    async def _on_ha_sync_fe_latency(self, sid: str, payload: Any = None) -> dict[str, Any]:
        samples = payload.get("samples") if isinstance(payload, dict) else None
        accepted = record_ha_sync_fe_latency_samples(samples)
        return {"ok": True, "accepted": accepted}

    # ------------------------------------------------------------------ #
    # 首推
    # ------------------------------------------------------------------ #
    async def _wait_for_ha_entity_sync(self, timeout_ms: int) -> None:
        if self.state_store.is_ha_synced():
            return
        # 未配置 HA 时不做长等待（否则每个连接都会阻塞至超时）；直接推当前缓存。
        if not self._ha_configured():
            return
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
        while asyncio.get_event_loop().time() < deadline:
            if self.state_store.is_ha_synced():
                return
            await asyncio.sleep(0.25)

    def apply_entity_count_buffer_tuning(self, entity_count: int | None = None) -> None:
        """按实体规模自适应 Socket.IO 帧缓冲（对齐 Nest ``applyEntityCountBufferTuning``）。"""
        count = self.state_store.get_count() if entity_count is None else int(entity_count)
        target = resolve_ws_max_buffer_bytes(count)
        engineio = getattr(self.sio, "eio", None)
        if engineio is not None and getattr(engineio, "max_http_buffer_size", None) != target:
            engineio.max_http_buffer_size = target
            logger.info(
                "Socket.IO 帧缓冲已按实体数 %s 调整为 %sMB", count, round(target / 1024 / 1024)
            )

    async def _emit_initial_states(
        self, sid: str, entities: list[dict[str, Any]], chunk_size: int
    ) -> None:
        chunk_size = max(1, int(chunk_size))
        total = len(entities)
        # 按实体规模自适应 Socket.IO 帧缓冲（对齐 Nest applyEntityCountBufferTuning）
        self.apply_entity_count_buffer_tuning(total)
        timestamp = _iso_now()
        if total <= chunk_size:
            await self.sio.emit(
                "initial_states",
                {"type": "initial_states", "entities": entities, "count": total, "timestamp": timestamp},
                to=sid,
            )
            return
        await self.sio.emit(
            "initial_states_begin",
            {"type": "initial_states_begin", "count": total, "chunkSize": chunk_size, "timestamp": timestamp},
            to=sid,
        )
        for offset in range(0, total, chunk_size):
            chunk = entities[offset : offset + chunk_size]
            await self.sio.emit(
                "initial_states_chunk",
                {
                    "type": "initial_states_chunk",
                    "offset": offset,
                    "count": len(chunk),
                    "total": total,
                    "entities": chunk,
                },
                to=sid,
            )
            await asyncio.sleep(0)
        await self.sio.emit(
            "initial_states_end",
            {"type": "initial_states_end", "count": total, "timestamp": _iso_now()},
            to=sid,
        )

    # ------------------------------------------------------------------ #
    # 广播 API（供 HA connector / state pipeline / 领域事件调用）
    # ------------------------------------------------------------------ #
    def client_count(self) -> int:
        """当前在线 Socket.IO 客户端数（对齐 Nest ``WsPushGateway.getClientCount``）。"""
        return len(self.connected)

    async def broadcast_ha_status(self, status: str, **extra: Any) -> None:
        payload = _ha_status_payload(status, extra)
        await self.sio.emit("ha_status", payload)

    async def broadcast_redis_status(self, configured: bool, ready: bool) -> None:
        await self.sio.emit("redis_status", build_redis_ws_status_payload(configured, ready))

    async def broadcast_state_changed_batch(self, changes: list[dict[str, Any]]) -> None:
        if not changes:
            return
        # 事件日志流水线：与 WS 广播共用同一批冷批变更（内存缓冲，不阻塞本协程）。
        event_log = getattr(self.app.state, "event_log", None)
        if event_log is not None:
            try:
                event_log.handle_state_change_batch({"changes": changes})
            except Exception:
                pass
        started = time.monotonic()
        ws_cfg = self._ws_config()
        self._apply_state_config()
        payloads = [to_ws_state_change_payload(change) for change in changes]
        timestamp = _iso_now()
        critical = set(ws_cfg.critical_domains)
        # 先按域/钉选收窄候选，再对候选做精确可见性过滤（见 _baseline_ready 说明）
        for sid in self._candidate_sids_for_changes(changes, critical):
            session = await self.sio.get_session(sid)
            session = session or {}
            user = session.get("user") or {}
            subscribed = _as_set(session.get("subscribedDomains"))
            pinned = _as_set(session.get("pinnedEntityIds"), require_dot=True)
            visible: list[dict[str, Any]] = []
            for change, payload in zip(changes, payloads, strict=False):
                entity_id = change["entity_id"]
                if not _entity_visible(user, entity_id):
                    continue
                if not is_entity_visible_to_client(
                    entity_id,
                    subscribed,
                    pinned,
                    critical,
                    ws_cfg.cold_entity_on_demand,
                ):
                    continue
                visible.append(payload)
            if not visible:
                continue
            # 批次含钉选实体时对该客户端可靠推送（背压下仍尝试送达）
            has_pinned = pinned is not None and any(
                str(change.get("entity_id")) in pinned for change in changes
            )
            if self._is_socket_backpressured(sid):
                if has_pinned:
                    await self.sio.emit(
                        "state_changed_batch",
                        {
                            "type": "state_changed_batch",
                            "changes": visible,
                            "count": len(visible),
                            "timestamp": timestamp,
                        },
                        to=sid,
                    )
                await self.sio.emit("resync_suggested", _resync_suggested_payload(), to=sid)
                continue
            await self.sio.emit(
                "state_changed_batch",
                {
                    "type": "state_changed_batch",
                    "changes": visible,
                    "count": len(visible),
                    "timestamp": timestamp,
                },
                to=sid,
            )
        record_ha_sync_latency("ws_emit", (time.monotonic() - started) * 1000)

    def _is_socket_backpressured(self, sid: str) -> bool:
        """客户端写缓冲背压检测（对齐 Nest ``isSocketBackpressured``，fail-open）。

        仅对已升级为 websocket 的传输生效；拿不到内部写缓冲返回 False（绝不误报）。
        """
        eio_socket = None
        try:
            eio = getattr(self.sio, "eio", None)
            sockets = getattr(eio, "sockets", None)
            if isinstance(sockets, dict):
                eio_socket = sockets.get(sid)
        except Exception:
            return False
        if eio_socket is None:
            return False
        if not getattr(eio_socket, "upgraded", False):
            return False
        queue = getattr(eio_socket, "queue", None)
        size = getattr(queue, "qsize", None)
        if callable(size):
            try:
                return int(size()) > WS_PUSH_BACKPRESSURE_WRITE_BUFFER
            except Exception:
                return False
        transport = getattr(eio_socket, "transport", None)
        buffer = getattr(transport, "write_buffer", None)
        if isinstance(buffer, list):
            return len(buffer) > WS_PUSH_BACKPRESSURE_WRITE_BUFFER
        return False

    async def broadcast_notification(self, data: dict[str, Any]) -> None:
        """站内通知广播（对齐 ws-push ``handleNotification``）。

        - ``channels`` 不含 ``socket`` 时跳过；
        - 无 ``entityId`` 的通知全员广播；
        - 绑定实体的通知按 ACL 过滤，并按 user room 去重推送；
        - 实际送达后异步回写 ``deliveredAt`` / ``deliveryChannels``。
        """
        raw_channels = data.get("channels")
        channels = raw_channels if isinstance(raw_channels, list) and raw_channels else ["in_app", "socket"]
        if "socket" not in channels:
            return
        payload = {"type": "notification", **data}
        entity_id = data.get("entityId")
        delivered = 0
        if not entity_id:
            await self.sio.emit("notification", payload)
            delivered = len(self.connected)
        else:
            rooms: set[str] = set()
            for sid in list(self.connected):
                session = (await self.sio.get_session(sid)) or {}
                user = session.get("user") or {}
                if not _entity_visible(user, str(entity_id)):
                    continue
                rooms.add(resolve_user_room_key(user, sid))
            for room in rooms:
                await self.sio.emit("notification", payload, to=room)
            delivered = len(rooms)
        notification_id = data.get("id")
        if delivered > 0 and notification_id:
            await self._mark_notification_delivered(str(notification_id), ["socket"])

    async def _mark_notification_delivered(self, notification_id: str, channels: list[str]) -> None:
        """通知送达回写（失败静默；对齐 ``markNotificationDelivered``）。"""
        from datetime import UTC, datetime

        from ..core.models import Notification
        from ..services.notification.stats import parse_json_array

        def _write() -> None:
            database = self.app.state.database
            with database.session_factory() as session:
                row = session.get(Notification, notification_id)
                if row is None:
                    return
                existing = [item for item in parse_json_array(row.delivery_channels) if isinstance(item, str)]
                merged = list(dict.fromkeys([*existing, *channels]))
                row.delivered_at = datetime.now(UTC).replace(tzinfo=None)
                row.delivery_channels = json.dumps(merged, ensure_ascii=False)
                session.commit()

        try:
            await asyncio.to_thread(_write)
        except Exception:
            pass

    async def broadcast_entities_stale(self, reason: str = "ha_disconnected") -> None:
        await self.sio.emit(
            "entities_stale",
            {"type": "entities_stale", "reason": reason, "timestamp": _iso_now()},
        )

    async def broadcast_ha_queue_dropped(self, payload: dict[str, Any]) -> None:
        await self.sio.emit(
            "ha_queue_dropped",
            {"type": "ha_queue_dropped", "timestamp": _iso_now(), **payload},
        )

    # ------------------------------------------------------------------ #
    # 地震预警（EEW）广播（对齐 ws-push ``handleEarthquakeAlert``）
    # ------------------------------------------------------------------ #
    async def broadcast_earthquake_alert(self, data: dict[str, Any]) -> None:
        """地震早期预警：高优先级全屏推送，携带震感与震中信息。"""
        await self.sio.emit(
            "earthquake_alert",
            {"type": "earthquake_alert", **data, "timestamp": _iso_now()},
        )

    async def broadcast_earthquake_confirmation(self, data: dict[str, Any]) -> None:
        """台网核定速报 / 迟到确认：轻量公报弹层（非全屏倒计时）。"""
        await self.sio.emit(
            "earthquake_confirmation",
            {
                "type": "earthquake_confirmation",
                "alertKind": data.get("alertKind") or "confirmation",
                **data,
                "timestamp": _iso_now(),
            },
        )

    # ------------------------------------------------------------------ #
    # 领域事件 fan-out（对齐 ws-push ``WsPushDomainEventsHelper``）
    # ------------------------------------------------------------------ #
    async def _emit_domain(self, event: str, payload: dict[str, Any]) -> None:
        await self.sio.emit(event, payload)

    async def broadcast_home_mode_activated(self, data: dict[str, Any]) -> None:
        """家庭模式激活：广播模式 ID / 名称与执行统计。"""
        await self._emit_domain(
            "home_mode",
            {
                "type": "home_mode_activated",
                "modeId": data.get("modeId"),
                "modeName": data.get("modeName"),
                "successCount": data.get("successCount"),
                "totalCount": data.get("totalCount"),
                "timestamp": _iso_now(),
            },
        )

    async def broadcast_home_mode_deactivated(self, data: dict[str, Any]) -> None:
        """家庭模式停用：仅携带 modeId。"""
        await self._emit_domain(
            "home_mode",
            {
                "type": "home_mode_deactivated",
                "modeId": data.get("modeId"),
                "timestamp": _iso_now(),
            },
        )

    async def broadcast_automation_executed(self, data: dict[str, Any]) -> None:
        """自动化执行结果：供前端展示成功/失败状态。"""
        await self._emit_domain(
            "automation_executed",
            {
                "type": "automation_executed",
                "automationId": data.get("id"),
                "name": data.get("name"),
                "success": data.get("success"),
                "timestamp": data.get("timestamp"),
            },
        )

    async def broadcast_security_mode_changed(self, data: dict[str, Any]) -> None:
        """安防布防/撤防模式变更。"""
        await self._emit_domain("security_mode", {"type": "security_mode_changed", **data})

    async def broadcast_security_zones_changed(self, data: dict[str, Any]) -> None:
        """安防区域配置变更：前端据此刷新区域列表。"""
        await self._emit_domain("security_zones", {"type": "security_zones_changed", **data})

    async def broadcast_security_alarm(self, data: dict[str, Any]) -> None:
        """安防告警：携带告警实体、区域、模式与动作失败列表。"""
        await self._emit_domain("security_alarm", {"type": "security_alarm", **data})

    async def broadcast_security_emergency(self, data: dict[str, Any]) -> None:
        """紧急事件（如 SOS）：默认 action 为 SOS。"""
        await self._emit_domain(
            "security_emergency",
            {
                "type": "security_emergency",
                "action": data.get("action") or "SOS",
                "timestamp": data.get("timestamp") or _iso_now(),
            },
        )

    async def broadcast_security_emergency_completed(self, data: dict[str, Any]) -> None:
        """紧急事件解除：通知前端关闭告警 UI。"""
        await self._emit_domain(
            "security_emergency_completed", {"type": "security_emergency_completed", **data}
        )

    async def broadcast_presence_changed(self, data: dict[str, Any]) -> None:
        """在场状态变化：成员是否在家。"""
        await self._emit_domain("presence_changed", {"type": "presence_changed", **data})

    async def broadcast_presence_all_left(self, data: dict[str, Any]) -> None:
        """全员离家：触发离家模式相关自动化。"""
        await self._emit_domain("presence_all_left", {"type": "presence_all_left", **data})

    async def broadcast_energy_anomaly(self, data: dict[str, Any]) -> None:
        """能耗异常检测：携带异常设备与原因。"""
        await self._emit_domain("energy_anomaly", {"type": "energy_anomaly", **data})

    async def broadcast_frigate_detection(self, data: dict[str, Any]) -> None:
        """Frigate 检测事件：携带摄像头/事件 ID。"""
        await self._emit_domain("frigate_detection", {"type": "frigate_detection", **data})

    async def broadcast_room_presence(self, data: dict[str, Any]) -> None:
        """房间级在场检测：携带房间名/是否有人/触发传感器。"""
        await self._emit_domain("room_presence", {"type": "room_presence", **data})

    async def broadcast_tts_speak(self, data: dict[str, Any], tts_speak: Any) -> None:
        """TTS 播报：调用 ``TtsSpeakService`` 选路播报，并广播播报结果。"""
        message = data.get("message") or ""
        result = await tts_speak.speak(message)
        ts = data.get("ts")
        try:
            timestamp = (
                datetime.fromtimestamp(float(ts) / 1000, tz=UTC) if ts else datetime.now(UTC)
            )
        except (TypeError, ValueError):
            timestamp = datetime.now(UTC)
        await self._emit_domain(
            "tts_speak",
            {
                "type": "tts_speak",
                "message": message,
                "success": result.get("success"),
                "detail": result.get("message"),
                "timestamp": timestamp.strftime("%Y-%m-%dT%H:%M:%S.")
                + f"{timestamp.microsecond // 1000:03d}Z",
            },
        )


def _entity_visible(user: dict[str, Any], entity_id: str) -> bool:
    from .access import is_entity_allowed

    return is_entity_allowed(entity_id, user)


def _ha_status_payload(status: str, snapshot: dict[str, Any]) -> dict[str, Any]:
    """构造 ha_status 负载：值为 ``None`` 的字段省略（对齐 JS ``undefined`` 不带键）。"""
    payload: dict[str, Any] = {"type": "ha_status", "status": status}
    ha_version = snapshot.get("ha_version")
    if ha_version is not None:
        payload["ha_version"] = ha_version
    attempt = snapshot.get("attempt")
    if attempt is not None:
        payload["attempt"] = attempt
    delay = snapshot.get("delay")
    if delay is not None:
        payload["delay"] = delay
    payload["timestamp"] = snapshot.get("timestamp") or _iso_now()
    return payload


def _as_set(raw: Any, require_dot: bool = False) -> set[str] | None:
    if raw is None or raw == "":
        return None
    items = raw if isinstance(raw, list) else str(raw).split(",")
    result = {str(item).strip() for item in items if str(item).strip()}
    if require_dot:
        result = {item for item in result if "." in item}
    return result or None


def _ms_to_iso(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(ms) % 1000:03d}Z"


def create_realtime_gateway(app: Any) -> RealtimeGateway:
    return RealtimeGateway(app)


_ = _SERVER_TOKEN
