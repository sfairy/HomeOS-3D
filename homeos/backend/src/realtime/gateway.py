"""Socket.IO 推送网关（msgpack 线协议），逐条对齐 Nest ``WsPushGateway`` 的核心契约。

本类只保留**编排**：连接生命周期、订阅索引、广播载荷分别在
``gateway_lifecycle.py`` / ``gateway_subscriptions.py`` / ``gateway_broadcasts.py``
三个协作者里（通过 mixin 组合，对外方法名与调用方均不变）；载荷构造函数在
``ws_payloads.py``，其中 ``ws_event`` 保证**服务端事件类型优先**，客户端/领域
payload 里的同名 ``type`` 无法覆盖真实事件名。

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
import logging
import os
import time
from typing import Any
from urllib.parse import urlsplit

import socketio

from .gateway_broadcasts import BroadcastMixin
from .gateway_lifecycle import ConnectionLifecycleMixin
from .gateway_subscriptions import SubscriptionIndexMixin
from .msgpack_compat import install_msgpack_ext_hook
from .payloads import to_ws_state_change_payload
from .state_store import StateStore
from .subscription import is_entity_visible_to_client
from .ws_buffer import resolve_ws_max_buffer_bytes
from .ws_config import load_state_store_config, load_ws_push_config
from .ws_payloads import (
    HaStatusSnapshot,
    as_set,
    entity_visible,
    iso_now,
    resync_suggested_payload,
    visibility_cache_for,
)
from ..platform.core.observability import record_ha_sync_fe_latency_samples, record_ha_sync_latency

_SERVER_TOKEN = "server"

logger = logging.getLogger("homeos.realtime.gateway")

#: 单客户端 websocket 写缓冲背压阈值（对齐 Nest ``WS_PUSH_BACKPRESSURE_WRITE_BUFFER``）
WS_PUSH_BACKPRESSURE_WRITE_BUFFER = 512


class RealtimeGateway(BroadcastMixin, ConnectionLifecycleMixin, SubscriptionIndexMixin):
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
        #: 广播分桶的一次性房间序号（同可见集的连接共用一个临时房间，只序列化一次）。
        self._batch_room_seq = 0
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
            # 读库失败就沿用上一次已生效的配置；但要留痕，否则「配置改了不生效」
            # 会表现成前端状态字段全是旧的，而日志里毫无线索。
            logger.warning('读取 stateStore 配置失败，本次沿用上次配置', exc_info=True)
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

    async def _on_ha_sync_fe_latency(self, sid: str, message: Any = None) -> dict[str, Any]:
        samples = message.get("samples") if isinstance(message, dict) else None
        accepted = record_ha_sync_fe_latency_samples(samples)
        return {"ok": True, "accepted": accepted}

    # 广播 API（供 HA connector / state pipeline / 领域事件调用）
    def client_count(self) -> int:
        """当前在线 Socket.IO 客户端数（对齐 Nest ``WsPushGateway.getClientCount``）。"""
        return len(self.connected)

    async def broadcast_state_changed_batch(self, changes: list[dict[str, Any]]) -> None:
        if not changes:
            return
        # 事件日志流水线：与 WS 广播共用同一批冷批变更（内存缓冲，不阻塞本协程）。
        event_log = getattr(self.app.state, "event_log", None)
        if event_log is not None:
            try:
                event_log.handle_state_change_batch({"changes": changes})
            except Exception:  # 事件日志批量落库失败不能带塌 WS 广播
                logger.warning(
                    '事件日志批量落库失败（本批 %d 条状态变更未入事件日志，WS 广播继续）',
                    len(changes),
                    exc_info=True,
                )
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
        timestamp = iso_now()
        critical = set(ws_cfg.critical_domains)
        # 可见性判定按用户缓存：同一账号可能有多个连接（多端/多标签），
        # `is_entity_allowed` 会对每个 (连接 × 变更) 重算一次限制列表；
        # 这里按「限制列表指纹」复用同一批次内的判定结果。
        visibility_cache: dict[Any, dict[str, bool]] = {}
        # 先按域/钉选收窄候选，再对候选做精确可见性过滤（见 _baseline_ready 说明）。
        # 记录「可见的 payload 下标」而不是 payload 本身：多客户端往往看到完全相同的
        # 集合，按集合下标分桶后可以共享同一份列表、只序列化一次。
        deliveries: list[tuple[str, tuple[int, ...], bool]] = []
        for sid in self._candidate_sids_for_changes(changes, critical):
            session = self._session_for(sid)
            user = session.get("user") or {}
            subscribed = as_set(session.get("subscribedDomains"))
            pinned = as_set(session.get("pinnedEntityIds"), require_dot=True)
            visible_indices: list[int] = []
            has_pinned = False
            user_cache = visibility_cache_for(visibility_cache, user)
            for index, change in enumerate(changes):
                entity_id = change["entity_id"]
                allowed = user_cache.get(entity_id)
                if allowed is None:
                    allowed = entity_visible(user, entity_id)
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
                visible_indices.append(index)
                if pinned is not None and entity_id in pinned:
                    has_pinned = True
            if visible_indices:
                deliveries.append((sid, tuple(visible_indices), has_pinned))
        if deliveries:
            # 按「可见集 + 是否含钉选」分桶：一桶一次 emit，python-socketio 单次 emit
            # 只序列化一次（旧实现逐连接 emit，即每个连接一次 json.dumps）。
            buckets: dict[tuple[tuple[int, ...], bool], list[str]] = {}
            for sid, indices, has_pinned in deliveries:
                buckets.setdefault((indices, has_pinned), []).append(sid)
            # 逐连接串行 await 会让一轮广播的耗时 = Σ 每个连接的写队列/背压耗时，
            # 慢连接会拖住其后所有连接（队头阻塞）。这里并发投递：每个连接仍只收到
            # 一条本批消息、批内顺序不变；整个 gather 结束后才返回，故跨批次顺序不变。
            results = await asyncio.gather(
                *(
                    self._emit_state_changes(
                        bucket_sids,
                        [payloads[index] for index in indices],
                        timestamp,
                        has_pinned,
                    )
                    for (indices, has_pinned), bucket_sids in buckets.items()
                ),
                return_exceptions=True,
            )
            for ((_indices, _pinned), bucket_sids), result in zip(
                buckets.items(), results, strict=False
            ):
                if isinstance(result, Exception):
                    # 单个连接发送失败（连接刚断、序列化异常等）不能让整轮广播中断，
                    # 否则后面所有订阅者都会漏掉这一批变更。
                    logger.warning("推送状态变更失败 sids=%s", bucket_sids, exc_info=result)
        record_ha_sync_latency("ws_emit", (time.monotonic() - started) * 1000)

    async def _emit_state_changes(
        self,
        sids: list[str],
        visible: list[dict[str, Any]],
        timestamp: str,
        has_pinned: bool,
    ) -> None:
        """向一批可见集相同的连接推送同一批变更；背压连接单独降级。

        同桶连接共享同一份 payload：通过临时房间 ``emit(to=room)`` 让 socket.io 只
        序列化一次（逐连接 emit 会重复 ``json.dumps`` 同一份大 batch）。
        """
        batch = {
            "type": "state_changed_batch",
            "changes": visible,
            "count": len(visible),
            "timestamp": timestamp,
        }
        ready: list[str] = []
        for sid in sids:
            if not self._is_socket_backpressured(sid) or has_pinned:
                self._resync_pending.discard(sid)
                ready.append(sid)
                continue
            # 背压且无钉选实体：不推状态，改用「建议重同步」提示。但同一轮背压内只提示一次 ——
            # 每个变更都发一条只会往已经堆积的写队列里继续灌水，越堵越糟。
            if sid in self._resync_pending:
                continue
            self._resync_pending.add(sid)
            await self.sio.emit("resync_suggested", resync_suggested_payload(), to=sid)
        if not ready:
            return
        if len(ready) == 1:
            await self.sio.emit("state_changed_batch", batch, to=ready[0])
            return
        room = self._next_batch_room()
        joined: list[str] = []
        try:
            for sid in ready:
                try:
                    await self.sio.enter_room(sid, room)
                except (KeyError, ValueError):
                    # 期间断开的连接：跳过即可，不能让整桶推送失败。
                    continue
                joined.append(sid)
            if joined:
                await self.sio.emit("state_changed_batch", batch, to=room)
        finally:
            for sid in joined:
                try:
                    await self.sio.leave_room(sid, room)
                except (KeyError, ValueError):
                    continue

    def _next_batch_room(self) -> str:
        """生成一次性的广播桶房间名（带自增序号，避免并发广播撞名）。"""
        self._batch_room_seq += 1
        return f"__state_batch:{self._batch_room_seq}"

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

def create_realtime_gateway(app: Any) -> RealtimeGateway:
    return RealtimeGateway(app)


_ = _SERVER_TOKEN
