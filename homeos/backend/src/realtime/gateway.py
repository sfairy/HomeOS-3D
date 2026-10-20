"""Socket.IO 推送网关（msgpack 线协议），逐条对齐 Nest ``WsPushGateway`` 的核心契约。

已实现：
- msgpack 解析器 + notepack ExtType 兼容；
- 握手 JWT 鉴权（Cookie ``auth_token``）、用户房间、订阅分组；
- 首推序列：ha_status(early) → initial_states(单条/分片 begin/chunk/end) → state_replay → ha_status(final)；
- 客户端事件 ``update_subscription`` / ``ha_sync_fe_latency``；
- 广播 API：ha_status / state_changed_batch / entities_stale / ha_queue_dropped /
  notification / home_mode / automation_executed / security_* / presence_* /
  energy_anomaly / frigate_detection / room_presence / tts_speak / earthquake_*；
- HA connector 事件接入 + 领域事件 fan-out（见 ``domains/ha/integration/service.py``、``realtime/domain_events.py``）。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any, Required, TypedDict
from urllib.parse import urlsplit

import socketio
from socketio.exceptions import ConnectionRefusedError as SocketConnectionRefusedError

from .msgpack_compat import install_msgpack_ext_hook
from .payloads import (
    parse_state_replay_params,
    should_replay_state,
    to_ws_state_change_payload,
)
from .state_store import StateStore
from .subscription import is_entity_visible_to_client, resolve_user_room_key
from .ws_buffer import resolve_ws_max_buffer_bytes
from .ws_config import load_state_store_config, load_ws_push_config
from ..domains.license import features as feature_codes
from ..domains.license.service import TERMINAL_STATES as LICENSE_TERMINAL_STATES
from ..platform.core.entity_domain import get_entity_domain
from ..platform.core.observability import record_ha_sync_fe_latency_samples, record_ha_sync_latency
from ..platform.security.entity_access import filter_entities_by_access, sort_entities_by_sync_priority
from ..platform.security.ws_auth import extract_auth_token_from_cookie, resolve_ws_user

_SERVER_TOKEN = "server"

logger = logging.getLogger("homeos.realtime.gateway")

#: 单客户端 websocket 写缓冲背压阈值（对齐 Nest ``WS_PUSH_BACKPRESSURE_WRITE_BUFFER``）
WS_PUSH_BACKPRESSURE_WRITE_BUFFER = 512


class ResyncSuggestedPayload(TypedDict):
    type: str
    reason: str
    timestamp: str


class HaStatusSnapshot(TypedDict, total=False):
    """HA 连接状态快照（``_ha_status_snapshot`` 恒填 connected，其余可缺省）。"""

    connected: Required[bool]
    ha_version: str | None
    attempt: int | None


class NotificationBroadcastEvent(TypedDict, total=False):
    id: str
    entity_id: str
    entityId: str


class DomainBroadcastEvent(TypedDict, total=False):
    """领域 fan-out 事件的宽松负载（各 broadcast_* 共用超集）。"""

    type: str
    modeId: str
    modeName: str
    successCount: int
    totalCount: int
    automationId: str
    name: str
    success: bool
    action: str
    message: str
    timestamp: str
    ts: str | float | int
    reason: str
    alertKind: str


def _resync_suggested_payload(reason: str = "backpressure") -> ResyncSuggestedPayload:
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
        #: 会话镜像（sid → session dict）。广播是热路径：每次都对每个候选 sid 走一次
        # ``sio.get_session``（引擎侧存储往返），
        # 客户端多、变更频繁时会成为 WS 推送的主成本。会话只在此处（connect）与
        # ``update_subscription`` 写入，disconnect 清除，镜像与引擎会话保持同步。
        self._sessions: dict[str, dict[str, Any]] = {}
        #: 已就背压发过 ``resync_suggested`` 的 sid。背压期间每个变更都发一条只会往
        #: engineio 的无界写队列里继续灌水，形成正反馈；同一轮背压内只提示一次，
        #: 待该连接恢复正常（不再背压）后清除，下次真正背压时再提示。
        self._resync_pending: set[str] = set()
        #: 授权终态监听器只注册一次。注册时机只能是首次 connect：__init__ 跑在 lifespan
        #: 之前，那时 app.state.license_service 还不存在。
        self._license_listener_registered = False
        #: 监听器可能在任意线程被调用，跨线程调度协程需要事件循环句柄。
        self._loop: asyncio.AbstractEventLoop | None = None
        self.state_store: StateStore = StateStore()
        self._state_cfg_at = 0.0
        self._ws_cfg_cache: Any | None = None
        self._ws_cfg_at = 0.0
        self._register_handlers()

    # CORS
    @staticmethod
    def _is_origin_allowed(origin: str | None, environ: dict | None = None) -> bool:
        if not origin:
            return True
        from ..platform.security.cookies import is_origin_allowed, resolve_allowed_origins

        if is_origin_allowed(origin, resolve_allowed_origins()):
            return True
        # 同源兜底：握手一定带 Origin，而请求的 Host 就是浏览器此刻真正在访问的地址。
        # 这条不能只靠白名单：`APP_BASE_URL` 在客户机那份 compose 里默认留空（客户用
        # 自己的域名 / 穿透域名访问时根本不知道该填什么），只认白名单会把公网域名的实时
        # 通道判成「Not an accepted origin」，表现为面板连上又掉、状态不刷新。
        # 只比 netloc（主机 + 端口）：scheme 在隧道 / 内置 HTTPS 两条链路上不可靠，
        # 跨站页面无法把自己的 Origin 写成目标主机，所以这不削弱 CSRF 面。
        host = str((environ or {}).get('HTTP_HOST') or '').strip()
        if not host:
            return False
        try:
            return (urlsplit(origin).netloc or '').casefold() == host.casefold()
        except ValueError:
            return False

    # 依赖读取（lifespan 之后才可用）
    @property
    def settings(self) -> Any:
        return self.app.state.settings

    def _ha_configured(self) -> bool:
        if getattr(self.app.state, "ha_configured", None) is not None:
            return bool(self.app.state.ha_configured)
        return bool(os.getenv("HA_URL", "").strip() or os.getenv("HA_BASE_URL", "").strip())

    def _ha_status_snapshot(self) -> HaStatusSnapshot:
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

    # 事件注册
    def _register_handlers(self) -> None:
        self.sio.on("connect", self._on_connect)
        self.sio.on("disconnect", self._on_disconnect)
        self.sio.on("update_subscription", self._on_update_subscription)
        self.sio.on("ha_sync_fe_latency", self._on_ha_sync_fe_latency)

    async def _emit_connect_state_replay(
        self, sid: str, user: Any, auth_fields: dict[str, Any]
    ) -> bool:
        """按 since / lastEventId 下发增量回放；返回是否处理了 since。"""
        since_raw = auth_fields.get("since")
        last_event_raw = auth_fields.get("lastEventId")
        since_ms, last_event_id = parse_state_replay_params(since_raw, last_event_raw)
        if not should_replay_state(since_ms, last_event_id):
            return False
        if self.state_store.is_replay_truncated(since_ms, last_event_id):
            # 环形缓冲已淘汰部分变更：此时下发增量会漏掉状态，
            # 前端已有完整快照，直接建议重同步（会回滚乐观更新并软重拉）。
            logger.info("state_replay 起点已淘汰,建议客户端重同步 sid=%s", sid)
            await self.sio.emit(
                "resync_suggested", _resync_suggested_payload("replay_truncated"), to=sid
            )
            return True
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
        return True

    async def _finish_connect_sync(
        self,
        sid: str,
        user: Any,
        auth_fields: dict[str, Any],
        entities: list[Any],
        replay_chunk_size: int,
    ) -> None:
        """全量初态 + since 回放 + 最终 ha_status。"""
        try:
            await self._emit_initial_states(sid, entities, replay_chunk_size)
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

        handled_since = await self._emit_connect_state_replay(sid, user, auth_fields)
        _ = handled_since

        final = self._ha_status_snapshot()
        await self.sio.emit(
            "ha_status",
            _ha_status_payload("connected" if final["connected"] else "disconnected", final),
            to=sid,
        )

    # 握手 / 断开
    async def _on_connect(self, sid: str, environ: dict[str, Any], auth: Any) -> None:
        cookie_header = environ.get("HTTP_COOKIE")
        # DB 会话 Cookie（homeos-3d LoginSession）为唯一登录凭证。
        session_token = extract_auth_token_from_cookie(
            cookie_header, self.settings.cookie_name
        )
        token = session_token
        if not token:
            raise SocketConnectionRefusedError("auth required")

        database = self.app.state.database

        def _resolve_user() -> Any:
            # 同步 SQLite 会话在握手路径里会阻塞事件循环（connect 处理函数本身是协程），
            # 因此整个「开库 + 查会话 + 读用户」放进工作线程；返回值是纯 dict，不跨线程持有 ORM 对象。
            with database.session_factory() as session:
                return resolve_ws_user(token, session)

        try:
            user = await asyncio.to_thread(_resolve_user)
        except Exception:
            raise SocketConnectionRefusedError("unauthorized") from None

        # 授权门禁：HTTP 侧由 LicenseGuardMiddleware 拦，但 socket.io 的流量走
        # socketio.ASGIApp，根本不经过 FastAPI 中间件栈 —— 这里必须自己再判一次，
        # 否则授权失效后已登录账号仍能通过 WS 持续收到家中状态与站内通知。
        service = getattr(self.app.state, "license_service", None)
        self._watch_license(service)
        if service is not None and self.settings.license_required:
            try:
                allowed = await asyncio.to_thread(service.allows, feature_codes.FEATURE_API)
            except Exception:
                logger.warning("WebSocket 握手读取授权状态失败，按未授权拒绝。", exc_info=True)
                allowed = False
            if not allowed:
                raise SocketConnectionRefusedError("license inactive")

        auth_fields = auth if isinstance(auth, dict) else {}
        session_fields = {
            "user": user,
            "subscribedDomains": auth_fields.get("subscribeDomains"),
            "pinnedEntityIds": auth_fields.get("pinnedEntityIds"),
        }
        await self.sio.save_session(sid, session_fields)
        self._sessions[sid] = session_fields
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

        entities = sort_entities_by_sync_priority(
            filter_entities_by_access(self.state_store.get_all(), user),
            list(ws_cfg.critical_domains),
        )
        # 等待期内客户端可能已经断开。connect / disconnect 处理函数各自跑在独立 task 里
        # （engineio 对每个消息都 ``start_background_task``，见
        # ``engineio/async_server.py`` 的 ``_trigger_event(run_async=True)``），所以
        # ``_on_disconnect`` 完全可能已经跑完并清理过一遍；此刻若继续登记，sid 会被永久
        # 留在 ``_baseline_ready`` 与订阅索引里，而 ``_session_for`` 对缺失会话是 fail-open
        # （视作无订阅限制），于是每个死 sid 都会参与之后的每一次广播，候选集与内存只增不减。
        # 这里到下面两个登记动作之间没有 await，asyncio 是协作式的，不会再有交错窗口。
        if sid not in self.connected:
            return
        # 快照已生成：此刻起该 sid 才有「基线」。
        # 等待期（_wait_for_ha_entity_sync）内的增量不晚于本快照，已包含在 entities 中，
        # 无需再以 delta 下发，可避免前端「全量同步完成前丢弃 delta」的告警与无效带宽。
        self._baseline_ready.add(sid)
        self._index_subscription(
            sid,
            auth_fields.get("subscribeDomains"),
            auth_fields.get("pinnedEntityIds"),
        )

        await self._finish_connect_sync(
            sid, user, auth_fields, entities, ws_cfg.replay_chunk_size
        )

    def _watch_license(self, service: Any) -> None:
        """惰性把授权终态监听器挂到授权服务上（只挂一次）。

        WS 连接在握手时一次性完成鉴权，之后不会再查库/查授权，所以授权被吊销后这些
        连接必须被主动踢掉；靠状态监听器而不是轮询，是为了让吊销在秒级生效。
        """
        if service is None or self._license_listener_registered:
            return
        try:
            self._loop = asyncio.get_running_loop()
            service.add_status_listener(self._on_license_status)
        except Exception:
            logger.warning("注册授权状态监听器失败，WS 连接不会主动断开。", exc_info=True)
            return
        self._license_listener_registered = True

    def _on_license_status(self, status: str) -> None:
        """授权进入终态（吊销/停用/实例冲突…）时断开通往客户端的全部 WS 连接。"""
        if status not in LICENSE_TERMINAL_STATES:
            return
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            future = asyncio.run_coroutine_threadsafe(
                self.disconnect_all(reason=f"license_{status.lower()}"), loop
            )
        except RuntimeError:
            # 事件循环已关闭（进程正在退出）：没有需要保护的连接了。
            return
        future.add_done_callback(self._log_disconnect_all_result)

    @staticmethod
    def _log_disconnect_all_result(future: Any) -> None:
        try:
            closed = future.result()
        except Exception:
            logger.warning("授权进入终态后断开 WS 连接失败。", exc_info=True)
            return
        if closed:
            logger.info("授权进入终态，已断开 %s 条 WS 连接。", closed)

    async def _disconnect_sids(self, sids: list[str], *, reason: str) -> int:
        closed = 0
        for sid in sids:
            try:
                await self.sio.disconnect(sid)
                closed += 1
            except Exception:
                logger.warning("断开 WS 连接失败 sid=%s reason=%s", sid, reason)
        return closed

    async def _on_disconnect(self, sid: str, reason: Any = None) -> None:
        self.connected.discard(sid)
        self._baseline_ready.discard(sid)
        self._resync_pending.discard(sid)
        self._unindex_subscription(sid)
        self._sessions.pop(sid, None)
        self.app.state.socket_clients = len(self.connected)

    async def disconnect_user(self, user_id: str, *, reason: str = "session_revoked") -> int:
        """断开某账号的全部在线连接，返回断开条数。

        只删 DB 会话是不够的：WS 连接在握手时一次性完成鉴权，之后不会再查库，因此用户
        登出（或会话被吊销、账号被停用）之后，那条连接仍会持续收到家中的状态变更与站内
        通知 —— 登出在服务端并不是一道真正的边界。调用 ``sio.disconnect`` 会触发
        ``_on_disconnect``，所以这里的清理与正常断线走同一条路径。
        """
        key = str(user_id or "")
        if not key:
            return 0
        targets = [
            sid
            for sid in list(self.connected)
            if str((self._session_for(sid).get("user") or {}).get("userId") or "") == key
        ]
        return await self._disconnect_sids(targets, reason=reason)

    async def disconnect_all(self, *, reason: str = "license_revoked") -> int:
        """断开全部在线连接，返回断开条数（授权进入终态时调用）。

        授权被吊销/停用后，已建立的 WS 连接仍会持续推送状态变更与通知；这里统一走
        _on_disconnect 的清理路径，与正常断线、会话吊销保持同一套收尾逻辑。
        """
        return await self._disconnect_sids(list(self.connected), reason=reason)

    def _session_for(self, sid: str) -> dict[str, Any]:
        """取 sid 的会话（内存镜像优先）。镜像未命中时返回空 dict（fail-open：
        视为无订阅限制，与 ``get_session`` 返回 None 时的既有行为一致）。"""
        return self._sessions.get(sid) or {}

    async def _load_session(self, sid: str) -> dict[str, Any]:
        """会话读取（镜像未命中时回落到引擎存储，供连接恢复等边角场景）。"""
        cached = self._sessions.get(sid)
        if cached is not None:
            return cached
        session = dict(await self.sio.get_session(sid) or {})
        if session:
            self._sessions[sid] = session
        return session

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

    # 客户端事件
    async def _on_update_subscription(self, sid: str, message: Any = None) -> dict[str, Any]:
        message = message if isinstance(message, dict) else {}
        session = dict(await self._load_session(sid))
        session["subscribedDomains"] = message.get("subscribeDomains")
        session["pinnedEntityIds"] = message.get("pinnedEntityIds")
        await self.sio.save_session(sid, session)
        self._sessions[sid] = session
        self._index_subscription(
            sid, session.get("subscribedDomains"), session.get("pinnedEntityIds")
        )
        return {"ok": True}

    async def _on_ha_sync_fe_latency(self, sid: str, message: Any = None) -> dict[str, Any]:
        samples = message.get("samples") if isinstance(message, dict) else None
        accepted = record_ha_sync_fe_latency_samples(samples)
        return {"ok": True, "accepted": accepted}

    # 首推
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

    # 广播 API（供 HA connector / state pipeline / 领域事件调用）
    def client_count(self) -> int:
        """当前在线 Socket.IO 客户端数（对齐 Nest ``WsPushGateway.getClientCount``）。"""
        return len(self.connected)

    async def broadcast_ha_status(self, status: str, **extra: Any) -> None:
        message = _ha_status_payload(status, extra)
        await self.sio.emit("ha_status", message)

    async def broadcast_state_changed_batch(self, changes: list[dict[str, Any]]) -> None:
        if not changes:
            return
        # 事件日志流水线：与 WS 广播共用同一批冷批变更（内存缓冲，不阻塞本协程）。
        event_log = getattr(self.app.state, "event_log", None)
        if event_log is not None:
            try:
                event_log.handle_state_change_batch({"changes": changes})
            except Exception:  # 事件日志批量落库失败不能带塌 WS 广播
                pass
        started = time.monotonic()
        ws_cfg = self._ws_config()
        self._apply_state_config()
        payloads = [to_ws_state_change_payload(change) for change in changes]
        # 出站时刻（epoch ms）：前端据此对齐「后端广播 → UI apply」这一段。
        # 之前 payloads 只读 event.pipeline_ts，而没有任何地方写入它，于是前端
        # fe_e2e_apply 永远没有样本 —— 实时性无法回归，等于没有基线。
        emitted_at_ms = time.time() * 1000
        for payload in payloads:
            payload.setdefault("_pipelineTs", emitted_at_ms)
        timestamp = _iso_now()
        critical = set(ws_cfg.critical_domains)
        # 可见性判定按用户缓存：同一账号可能有多个连接（多端/多标签），
        # `is_entity_allowed` 会对每个 (连接 × 变更) 重算一次限制列表；
        # 这里按「限制列表指纹」复用同一批次内的判定结果。
        visibility_cache: dict[Any, dict[str, bool]] = {}
        # 先按域/钉选收窄候选，再对候选做精确可见性过滤（见 _baseline_ready 说明）
        deliveries: list[tuple[str, list[dict[str, Any]], bool]] = []
        for sid in self._candidate_sids_for_changes(changes, critical):
            session = self._session_for(sid)
            user = session.get("user") or {}
            subscribed = _as_set(session.get("subscribedDomains"))
            pinned = _as_set(session.get("pinnedEntityIds"), require_dot=True)
            visible: list[dict[str, Any]] = []
            has_pinned = False
            user_cache = _visibility_cache_for(visibility_cache, user)
            for change, message in zip(changes, payloads, strict=False):
                entity_id = change["entity_id"]
                allowed = user_cache.get(entity_id)
                if allowed is None:
                    allowed = _entity_visible(user, entity_id)
                    user_cache[entity_id] = allowed
                if not allowed:
                    continue
                if not is_entity_visible_to_client(
                    entity_id,
                    subscribed,
                    pinned,
                    critical,
                    ws_cfg.cold_entity_on_demand,
                ):
                    continue
                visible.append(message)
                if pinned is not None and entity_id in pinned:
                    has_pinned = True
            if visible:
                deliveries.append((sid, visible, has_pinned))
        if deliveries:
            # 逐连接串行 await 会让一轮广播的耗时 = Σ 每个连接的写队列/背压耗时，
            # 慢连接会拖住其后所有连接（队头阻塞）。这里并发投递：每个连接仍只收到
            # 一条本批消息、批内顺序不变；整个 gather 结束后才返回，故跨批次顺序不变。
            results = await asyncio.gather(
                *(
                    self._emit_state_changes(sid, visible, timestamp, has_pinned)
                    for sid, visible, has_pinned in deliveries
                ),
                return_exceptions=True,
            )
            for (sid, _visible, _pinned), result in zip(deliveries, results, strict=False):
                if isinstance(result, Exception):
                    # 单个连接发送失败（连接刚断、序列化异常等）不能让整轮广播中断，
                    # 否则后面所有订阅者都会漏掉这一批变更。
                    logger.warning("推送状态变更失败 sid=%s", sid, exc_info=result)
        record_ha_sync_latency("ws_emit", (time.monotonic() - started) * 1000)

    async def _emit_state_changes(
        self,
        sid: str,
        visible: list[dict[str, Any]],
        timestamp: str,
        has_pinned: bool,
    ) -> None:
        """向单个连接推送一批变更；背压时只对含钉选实体的批次尝试送达。"""
        batch = {
            "type": "state_changed_batch",
            "changes": visible,
            "count": len(visible),
            "timestamp": timestamp,
        }
        if not self._is_socket_backpressured(sid):
            self._resync_pending.discard(sid)
            await self.sio.emit("state_changed_batch", batch, to=sid)
            return
        # 批次含钉选实体时对该客户端可靠推送（背压下仍尝试送达）
        if has_pinned:
            await self.sio.emit("state_changed_batch", batch, to=sid)
            return
        # 背压且无钉选实体：不推状态，改用「建议重同步」提示。但同一轮背压内只提示一次 ——
        # 每个变更都发一条只会往已经堆积的写队列里继续灌水，越堵越糟。
        if sid in self._resync_pending:
            return
        self._resync_pending.add(sid)
        await self.sio.emit("resync_suggested", _resync_suggested_payload(), to=sid)

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
                pending = size()
            except Exception:
                return False
            # ``getattr`` 拿到的是 ``object``，先收窄再与阈值比较，避免误把非数值当 0/大数。
            return (
                isinstance(pending, int) and pending > WS_PUSH_BACKPRESSURE_WRITE_BUFFER
            )
        transport = getattr(eio_socket, "transport", None)
        buffer = getattr(transport, "write_buffer", None)
        if isinstance(buffer, list):
            return len(buffer) > WS_PUSH_BACKPRESSURE_WRITE_BUFFER
        return False

    async def broadcast_notification(self, event: NotificationBroadcastEvent | dict[str, Any]) -> None:
        """站内通知广播（对齐 ws-push ``handleNotification``）。

        - ``channels`` 不含 ``socket`` 时跳过；
        - 无 ``entityId`` 的通知全员广播；
        - 绑定实体的通知按 ACL 过滤，并按 user room 去重推送；
        - 实际送达后异步回写 ``deliveredAt`` / ``deliveryChannels``。
        """
        raw_channels = event.get("channels")
        channels = raw_channels if isinstance(raw_channels, list) and raw_channels else ["in_app", "socket"]
        if "socket" not in channels:
            return
        message = {"type": "notification", **event}
        entity_id = event.get("entityId")
        delivered = 0
        if not entity_id:
            await self.sio.emit("notification", message)
            delivered = len(self.connected)
        else:
            rooms: set[str] = set()
            for sid in list(self.connected):
                session = self._session_for(sid)
                user = session.get("user") or {}
                if not _entity_visible(user, str(entity_id)):
                    continue
                rooms.add(resolve_user_room_key(user, sid))
            if rooms:
                # 一个 room 发送失败不能让整条通知丢失：return_exceptions 让其余 room 照常收到。
                results = await asyncio.gather(
                    *[self.sio.emit("notification", message, to=room) for room in rooms],
                    return_exceptions=True,
                )
                for result in results:
                    if isinstance(result, Exception):
                        logger.warning("站内通知推送失败: %s", result)
            delivered = len(rooms)
        notification_id = event.get("id")
        if delivered > 0 and notification_id:
            await self._mark_notification_delivered(str(notification_id), ["socket"])

    async def _mark_notification_delivered(self, notification_id: str, channels: list[str]) -> None:
        """通知送达回写（失败留痕；对齐 ``markNotificationDelivered`` 的"不阻断投递"语义）。"""
        from datetime import UTC, datetime

        from ..platform.core.json_field import parse_json_array
        from ..platform.core.models import Notification

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
        except Exception:  # 回写失败只影响"已送达"标记，留痕后由下轮重投
            logger.warning("通知送达回写失败（下轮将重投）：id=%s channels=%s", notification_id, channels, exc_info=True)

    async def broadcast_entities_stale(self, reason: str = "ha_disconnected") -> None:
        await self.sio.emit(
            "entities_stale",
            {"type": "entities_stale", "reason": reason, "timestamp": _iso_now()},
        )

    async def broadcast_ha_queue_dropped(self, message: dict[str, Any]) -> None:
        await self.sio.emit(
            "ha_queue_dropped",
            {"type": "ha_queue_dropped", "timestamp": _iso_now(), **message},
        )

    # 地震预警（EEW）广播（对齐 ws-push ``handleEarthquakeAlert``）
    async def broadcast_earthquake_alert(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """地震早期预警：高优先级全屏推送，携带震感与震中信息。"""
        await self.sio.emit(
            "earthquake_alert",
            {"type": "earthquake_alert", **event, "timestamp": _iso_now()},
        )

    async def broadcast_earthquake_confirmation(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """台网核定速报 / 迟到确认：轻量公报弹层（非全屏倒计时）。"""
        await self.sio.emit(
            "earthquake_confirmation",
            {
                "type": "earthquake_confirmation",
                "alertKind": event.get("alertKind") or "confirmation",
                **event,
                "timestamp": _iso_now(),
            },
        )

    # 领域事件 fan-out（对齐 ws-push ``WsPushDomainEventsHelper``）
    async def _emit_domain(self, event: str, message: DomainBroadcastEvent | dict[str, Any]) -> None:
        await self.sio.emit(event, message)

    async def broadcast_home_mode_activated(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """家庭模式激活：广播模式 ID / 名称与执行统计。"""
        await self._emit_domain(
            "home_mode",
            {
                "type": "home_mode_activated",
                "modeId": event.get("modeId"),
                "modeName": event.get("modeName"),
                "successCount": event.get("successCount"),
                "totalCount": event.get("totalCount"),
                "timestamp": _iso_now(),
            },
        )

    async def broadcast_home_mode_deactivated(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """家庭模式停用：仅携带 modeId。"""
        await self._emit_domain(
            "home_mode",
            {
                "type": "home_mode_deactivated",
                "modeId": event.get("modeId"),
                "timestamp": _iso_now(),
            },
        )

    async def broadcast_automation_executed(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """自动化执行结果：供前端展示成功/失败状态。"""
        await self._emit_domain(
            "automation_executed",
            {
                "type": "automation_executed",
                "automationId": event.get("id"),
                "name": event.get("name"),
                "success": event.get("success"),
                "timestamp": event.get("timestamp"),
            },
        )

    async def broadcast_security_mode_changed(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """安防布防/撤防模式变更。"""
        await self._emit_domain("security_mode", {"type": "security_mode_changed", **event})

    async def broadcast_security_zones_changed(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """安防区域配置变更：前端据此刷新区域列表。"""
        await self._emit_domain("security_zones", {"type": "security_zones_changed", **event})

    async def broadcast_security_alarm(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """安防告警：携带告警实体、区域、模式与动作失败列表。"""
        await self._emit_domain("security_alarm", {"type": "security_alarm", **event})

    async def broadcast_security_emergency(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """紧急事件（如 SOS）：默认 action 为 SOS。"""
        await self._emit_domain(
            "security_emergency",
            {
                "type": "security_emergency",
                "action": event.get("action") or "SOS",
                "timestamp": event.get("timestamp") or _iso_now(),
            },
        )

    async def broadcast_security_emergency_completed(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """紧急事件解除：通知前端关闭告警 UI。"""
        await self._emit_domain(
            "security_emergency_completed", {"type": "security_emergency_completed", **event}
        )

    async def broadcast_presence_changed(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """在场状态变化：成员是否在家。"""
        await self._emit_domain("presence_changed", {"type": "presence_changed", **event})

    async def broadcast_presence_all_left(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """全员离家：触发离家模式相关自动化。"""
        await self._emit_domain("presence_all_left", {"type": "presence_all_left", **event})

    async def broadcast_energy_anomaly(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """能耗异常检测：携带异常设备与原因。"""
        await self._emit_domain("energy_anomaly", {"type": "energy_anomaly", **event})

    async def broadcast_frigate_detection(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """Frigate 检测事件：携带摄像头/事件 ID。"""
        await self._emit_domain("frigate_detection", {"type": "frigate_detection", **event})

    async def broadcast_room_presence(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """房间级在场检测：携带房间名/是否有人/触发传感器。"""
        await self._emit_domain("room_presence", {"type": "room_presence", **event})

    async def broadcast_tts_speak(self, event: DomainBroadcastEvent | dict[str, Any], tts_speak: Any) -> None:
        """TTS 播报：调用 ``TtsSpeakService`` 选路播报，并广播播报结果。"""
        message = event.get("message") or ""
        result = await tts_speak.speak(message)
        ts = event.get("ts")
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
    from ..platform.security.entity_access import is_entity_allowed

    return is_entity_allowed(entity_id, user)


def _visibility_cache_for(
    cache: dict[Any, dict[str, bool]], user: dict[str, Any]
) -> dict[str, bool]:
    """取（或建）某个用户的可见性缓存分桶。

    同一账号常有多个连接（多端 / 多标签 / 断线重连并存）；``is_entity_allowed``
    每次都要重新解析用户的 restrictions 列表，按批次复用可省掉重复解析与正则式前缀比较。
    分桶键用限制列表的不可变指纹：无限制 / 无可见实体 / 具体前缀集合。
    """
    from ..platform.security.entity_access import resolve_entity_restrictions

    restrictions = resolve_entity_restrictions(user)
    key: Any = None if restrictions is None else (() if not restrictions else tuple(restrictions))
    bucket = cache.get(key)
    if bucket is None:
        bucket = {}
        cache[key] = bucket
    return bucket


def _ha_status_payload(status: str, snapshot: Mapping[str, Any]) -> dict[str, Any]:
    """构造 ha_status 负载：值为 ``None`` 的字段省略（对齐 JS ``undefined`` 不带键）。"""
    message: dict[str, Any] = {"type": "ha_status", "status": status}
    ha_version = snapshot.get("ha_version")
    if ha_version is not None:
        message["ha_version"] = ha_version
    attempt = snapshot.get("attempt")
    if attempt is not None:
        message["attempt"] = attempt
    delay = snapshot.get("delay")
    if delay is not None:
        message["delay"] = delay
    message["timestamp"] = snapshot.get("timestamp") or _iso_now()
    return message


def _as_set(raw: Any, require_dot: bool = False) -> set[str] | None:
    if raw is None or raw == "":
        return None
    items = raw if isinstance(raw, list) else str(raw).split(",")
    result = {str(item).strip() for item in items if str(item).strip()}
    if require_dot:
        result = {item for item in result if "." in item}
    return result or None


def _ms_to_iso(milliseconds: float) -> str:
    return datetime.fromtimestamp(milliseconds / 1000, tz=UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(milliseconds) % 1000:03d}Z"


def create_realtime_gateway(app: Any) -> RealtimeGateway:
    return RealtimeGateway(app)


_ = _SERVER_TOKEN
