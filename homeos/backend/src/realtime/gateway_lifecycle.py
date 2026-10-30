"""连接生命周期 —— 从 ``RealtimeGateway`` 拆出的协作者之一。

覆盖：握手鉴权 / 授权门禁 / 首次基线推送（含增量回放）/ 断线清理 / 主动踢人
（登出、会话吊销、授权终态）。

拆出来的原因：这段逻辑承载了「连接的每个阶段都在改哪几个集合」这条不变量
（``connected`` / ``_baseline_ready`` / 订阅索引 / 会话镜像），与广播载荷、订阅索引
混在同一个 1100 行类里时，任何一处登记遗漏都会变成「死 sid 参与每次广播」这类
只增不减的泄漏。集中在一处后，登记 / 清理的对称性可以一眼看完。
"""
# 这些实例字段由组合方 ``RealtimeGateway.__init__`` 初始化；mixin 只提供方法，
# 不重复声明默认值（那会在类上留下共享可变对象）。
# pyright: reportUninitializedInstanceVariable=false

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from .payloads import parse_state_replay_params, should_replay_state, to_ws_state_change_payload
from .subscription import resolve_user_room_key
from .ws_buffer import resolve_ws_max_buffer_bytes
from .ws_payloads import (
    REPLAY_ONLY_MAX_CHANGES,
    entity_visible,
    ha_status_payload,
    iso_now,
    ms_to_iso,
    resync_suggested_payload,
)
from ..domains.license import features as feature_codes
from ..platform.security.entity_access import (
    filter_entities_by_access,
    sort_entities_by_sync_priority,
)
from ..platform.security.ws_auth import extract_auth_token_from_cookie, resolve_ws_user

if TYPE_CHECKING:
    import socketio

    from .state_store import StateStore

logger = logging.getLogger("homeos.realtime.gateway")


class ConnectionLifecycleMixin:
    """握手 / 首推 / 断线 / 踢人。由 ``RealtimeGateway`` 组合使用。"""

    sio: socketio.AsyncServer
    app: Any
    state_store: StateStore
    connected: set[str]
    _baseline_ready: set[str]
    _resync_pending: set[str]
    _sessions: dict[str, dict[str, Any]]
    _license_listener_registered: bool
    _loop: asyncio.AbstractEventLoop | None
    #: 正在握手（_on_connect 未返回）的 sid；断连清理早于登记时用来留 tombstone。
    _connecting: set[str]
    _closed_sids: set[str]

    if TYPE_CHECKING:
        # 由 RealtimeGateway 提供：
        @property
        def settings(self) -> Any: ...

        def _ha_configured(self) -> bool: ...

        def _ha_status_snapshot(self) -> Any: ...

        def _ws_config(self) -> Any: ...

        def _apply_state_config(self) -> None: ...

        def _index_subscription(self, sid: str, domains_raw: Any, pinned_raw: Any) -> None: ...

        def _unindex_subscription(self, sid: str) -> None: ...

        def _session_for(self, sid: str) -> dict[str, Any]: ...

    # ------------------------------------------------------------------ 首推
    async def _emit_connect_state_replay(
        self, sid: str, user: Any, auth_fields: dict[str, Any]
    ) -> str:
        """按 since / lastEventId 下发增量回放。

        返回：

        - ``'replayed'``：增量已下发且足以补齐（调用方无需再推全量快照）；
        - ``'resync'``：起点已淘汰 / 增量过大，建议客户端重同步（仍需全量兜底）；
        - ``'none'``：客户端没有基线或未声明 `since`，必须推全量。
        """
        # 只有明确声明「本地已有基线」的客户端才走增量：首次打开页面（无缓存）时
        # 前端也会带一个 60s 前的 since，若据此跳过快照，新客户端会拿到空实体表。
        if not auth_fields.get("hasBaseline"):
            return "none"
        since_raw = auth_fields.get("since")
        last_event_raw = auth_fields.get("lastEventId")
        since_ms, last_event_id = parse_state_replay_params(since_raw, last_event_raw)
        if not should_replay_state(since_ms, last_event_id):
            return "none"
        if self.state_store.is_replay_truncated(since_ms, last_event_id):
            # 环形缓冲已淘汰部分变更：此时下发增量会漏掉状态，
            # 前端已有完整快照，直接建议重同步（会回滚乐观更新并软重拉）。
            logger.info("state_replay 起点已淘汰,建议客户端重同步 sid=%s", sid)
            await self.sio.emit("resync_suggested", resync_suggested_payload("replay_truncated"), to=sid)
            return "resync"
        replay = [
            record
            for record in self.state_store.get_recent_changes_since(since_ms, last_event_id)
            if entity_visible(user, record["entity_id"])
        ]
        if len(replay) > REPLAY_ONLY_MAX_CHANGES:
            # 增量比全量还大时全量更划算（压缩率与分片大小都更可控）。
            logger.info("state_replay 变更过多(%d),退回全量快照 sid=%s", len(replay), sid)
            await self.sio.emit(
                "resync_suggested", resync_suggested_payload("replay_too_large"), to=sid
            )
            return "resync"
        # 即使回放为空也要下发：客户端靠这条消息判定「基线已补齐」（服务端返回
        # replayed 后不会再发 initial_states），漏发会让前端一直停在未同步状态。
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
                            "changed_at": ms_to_iso(record["at"]),
                        }
                    )
                    for record in replay
                ],
                "count": len(replay),
                "lastEventId": self.state_store.get_latest_change_id(),
                "timestamp": iso_now(),
            },
            to=sid,
        )
        return "replayed"

    async def _finish_connect_sync(
        self,
        sid: str,
        user: Any,
        auth_fields: dict[str, Any],
        entities: list[Any],
        replay_chunk_size: int,
    ) -> None:
        """全量初态（或增量回放）+ 最终 ha_status。"""
        # 先尝试增量回放：客户端带了可用的 since/lastEventId 且缓冲未截断时，
        # 回放本身就是「当前状态」，再推 705 条全量快照纯属重复下行。
        replay_result = await self._emit_connect_state_replay(sid, user, auth_fields)
        if replay_result != "replayed":
            try:
                await self._emit_initial_states(sid, entities, replay_chunk_size)
            except Exception:
                # 前端已经收到 sync_error 提示，但服务端此前一个字都没记 ——
                # 初态下发失败（多半是序列化或 socket 异常）只能靠客户端现象反推。
                logger.warning('初态下发失败：sid=%s entities=%d', sid, len(entities), exc_info=True)
                await self.sio.emit(
                    "sync_error",
                    {
                        "type": "sync_error",
                        "code": "initial_states_failed",
                        "count": len(entities),
                    },
                    to=sid,
                )

        final = self._ha_status_snapshot()
        await self.sio.emit(
            "ha_status",
            ha_status_payload("connected" if final["connected"] else "disconnected", final),
            to=sid,
        )

    async def _emit_initial_states(
        self, sid: str, entities: list[dict[str, Any]], chunk_size: int
    ) -> None:
        chunk_size = max(1, int(chunk_size))
        total = len(entities)
        # 按实体规模自适应 Socket.IO 帧缓冲（对齐 Nest applyEntityCountBufferTuning）
        self.apply_entity_count_buffer_tuning(total)
        timestamp = iso_now()
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
            {"type": "initial_states_end", "count": total, "timestamp": iso_now()},
            to=sid,
        )

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

    # ------------------------------------------------------------------ 握手
    async def _on_connect(self, sid: str, environ: dict[str, Any], auth: Any) -> None:
        """握手入口：标记「正在握手」，并把握手期间断连的 sid 统一收尾清理。

        connect / disconnect 处理函数各自跑在独立 task 里（engineio 对每个消息都走
        start_background_task），所以客户端「连上就断」时 _on_disconnect 完全可能先于
        这里的登记动作跑完。若之后 connect 继续把 sid 写进 connected / _baseline_ready /
        订阅索引 / 会话镜像，清理不会再有第二次机会 —— 该 sid 会成为永久死 sid，参与之后
        的每一次广播。_closed_sids 就是这个交错窗口的墓碑。
        """
        self._connecting.add(sid)
        try:
            await self._establish_connection(sid, environ, auth)
        finally:
            self._connecting.discard(sid)
            if sid in self._closed_sids:
                self._closed_sids.discard(sid)
                # 登记动作可能已经跑过（断连清理早于登记）：按断连路径再清一次。
                # _on_disconnect 是幂等的，正常情况这里是 no-op。
                await self._on_disconnect(sid)

    async def _establish_connection(self, sid: str, environ: dict[str, Any], auth: Any) -> None:
        from socketio.exceptions import ConnectionRefusedError as SocketConnectionRefusedError

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
            ha_status_payload("connected" if early["connected"] else "disconnected", early),
            to=sid,
        )

        ws_cfg = self._ws_config()
        self._apply_state_config()
        await self._wait_for_ha_entity_sync(ws_cfg.ha_sync_wait_ms)

        entities = sort_entities_by_sync_priority(
            filter_entities_by_access(self.state_store.get_all(), user),
            list(ws_cfg.critical_domains),
        )
        # 等待期内客户端可能已经断开：connect / disconnect 处理函数各自跑在独立 task 里
        # （engineio 对每个消息都走 start_background_task），所以 _on_disconnect 完全可能
        # 已经跑完并清理过一遍；此刻若继续登记，sid 会被永久留在 _baseline_ready 与订阅
        # 索引里，而 _session_for 对缺失会话是 fail-open（视作无订阅限制），于是每个死 sid
        # 都会参与之后的每一次广播，候选集与内存只增不减。
        # 这里覆盖「等待期断开」；握手更早阶段（鉴权线程 / 授权查询等 await）的断开由
        # _on_connect 的 finally 通过 _closed_sids 墓碑兜底清理。
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

    # ------------------------------------------------------------------ 授权终态
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
        from ..domains.license.service import TERMINAL_STATES as LICENSE_TERMINAL_STATES

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
            logger.debug('授权终态断开连接时事件循环已关闭，跳过（进程退出中）', exc_info=True)
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

    # ------------------------------------------------------------------ 断开
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
        if sid in self._connecting:
            # 握手还没返回：登记动作可能尚未执行，这次清理会漏掉之后才写入的
            # connected / _baseline_ready / 订阅索引 / 会话镜像。留 tombstone 让
            # _on_connect 的 finally 在握手结束时再按断连路径清一次。
            self._closed_sids.add(sid)
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
