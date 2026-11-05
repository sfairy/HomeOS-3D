"""常驻运行循环：取启用连接、全量同步、WebSocket 长连与指数退避重连。"""

from __future__ import annotations

import asyncio
import contextlib
import inspect
import json
import time
import traceback
from collections import deque
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from .client import HAClientError
from .live_entities import CompressedStateDecoder, ShadowStateTracker
from .live_events import (
    LIVE_EVENT_BATCH_WINDOW_MS,
    LIVE_EVENT_CRITICAL_DOMAINS,
    LiveStateEventQueue,
    entity_domain,
    live_state_change,
    superseded_by_snapshot,
)
from .service_contract import HAConnectorHost
from .service_support import (
    DISCONNECT_REASON_HINTS,
    FAILURE_DISCONNECTED,
    FAILURE_UNEXPECTED,
    LIVE_EVENT_TYPES,
    LOGGER,
    OFFLINE_LOG_INTERVAL_SECONDS,
    classify_connector_failure,
    classify_disconnect_reason,
)
from ...logs.global_log import _safe_text
from ....platform.core.runtime.observability import record_ha_counter, record_ha_sync_latency

#: HA 注册表事件 → 进程内事件名（区域索引与语音快路径缓存据此失效）。
_REGISTRY_EVENT_NAMES = {
    "entity_registry_updated": "ha.entity_registry_updated",
    "device_registry_updated": "ha.device_registry_updated",
    "area_registry_updated": "ha.area_registry_updated",
}

#: 握手窗口最多缓冲多少帧（订阅已建立、全量快照还没落地）。
#:
#: 这个窗口里不能「不读 socket」：HA 的待发队列会堆积，轻则事件延迟，重则被判为消费
#: 不过来而踢连接（→ 又触发一轮全量重建）。也不能无限缓冲：大户型在同步那几秒里
#: 可能收到成百上千条传感器帧。超限时丢最旧的（与实时合并队列同一取舍：新的更重要），
#: 并在回放结束后补一次全量对账。
LIVE_BOOTSTRAP_MAX_FRAMES = 2_000


class _HandshakeCapture:
    """订阅已建立、全量快照尚未落地期间到达的原始帧。

    ``frames`` 用定长 deque：超限自动丢最旧的一帧。``received`` 记录实际收到多少，
    用来判断是否发生过丢弃（丢弃意味着窗口内的部分变更只能靠下一次对账补齐）。
    """

    __slots__ = ("frames", "received")

    def __init__(self, limit: int = LIVE_BOOTSTRAP_MAX_FRAMES) -> None:
        self.frames: deque[dict[str, Any]] = deque(maxlen=max(int(limit), 1))
        self.received = 0

    @property
    def dropped(self) -> int:
        return max(0, self.received - len(self.frames))


def _event_lag_ms(time_fired: Any) -> float | None:
    """HA 事件时间戳 → 本地已过去的毫秒数（超范围返回 None）。

    时钟偏差（容器/墙屏时间不同步）与补发的旧事件都会把 p99 拉成假尖峰，
    因此只统计 0～60s 的区间。
    """
    if not isinstance(time_fired, str) or not time_fired:
        return None
    text = time_fired.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        fired = datetime.fromisoformat(text)
    except ValueError:
        return None
    if fired.tzinfo is None:
        fired = fired.replace(tzinfo=UTC)
    lag = (datetime.now(UTC) - fired).total_seconds() * 1000
    if lag < 0 or lag > 60_000:
        return None
    return lag


class HALiveMixin(HAConnectorHost):
    """常驻运行循环：取启用连接、全量同步、WebSocket 长连与指数退避重连。"""

    async def _run(self) -> None:
        attempt = 0
        backoff = self._reconnect_base_backoff()
        self._reset_failure_state()
        # HA 停机 / 网络切换 / 反代重启时，一轮轮重连失败是常态而不是故障：
        #   - 实时连接被对端关掉、地址连不上，控制台只留一行中文摘要，不打 12k 堆栈；
        #   - 同一个原因持续存在时每 OFFLINE_LOG_INTERVAL_SECONDS 秒才提示一次
        #     （退避封顶 10s ≈ 每分钟 6 轮，逐轮打会让控制台变成心跳）；
        #   - 只有意外异常才保留完整堆栈；堆栈始终由 _log_event 入库。
        while True:
            connection_id = None
            try:
                connection = await self._run_database(self.active_connection)
                if connection is None:
                    self._connected = False
                    await asyncio.sleep(3)
                    continue
                connection_id = connection.id
                await self.refresh_persistent_entity_ids(ensure_states=False)
                # 上一轮遗留的周期对账可能还卡在全量快照上：先取消，避免这次重连同步
                # 在 _sync_lock 上排队等它跑完。
                await self._cancel_reconcile()
                fast_reconnect = self._can_fast_reconnect()
                if fast_reconnect:
                    # 刚同步过、且用压缩状态流：断连窗口内的差异会由
                    # ``subscribe_entities`` 的首帧全量 + 解码器比对补齐，
                    # 不必再付一次「建连 + get_states + 注册表 + 大事务」。
                    record_ha_counter("fast_reconnect")
                    await self._log_event("info", "连接", "快速重连：跳过全量同步，由实时状态流补齐差异")
                    await self._live_connection(connection_id)
                    # 注册表事件在断连窗口内无法补齐：连上后立刻排一次后台对账刷新目录，
                    # 不阻塞首帧实时数据。
                    self.schedule_reconcile(connection_id)
                else:
                    # 全量同步放在实时连接**建立之后**（订阅优先）：反过来先同步再订阅，
                    # 同步那几秒里发生的状态变更 HA 不会重发，前端就永久停在旧值上。
                    await self._live_connection(connection_id, bootstrap=True)
                backoff = self._reconnect_base_backoff()
            except asyncio.CancelledError:
                raise
            except Exception as error:
                self._connected = False
                self._runtime_error = str(error)
                self.refresh_endpoint_in_background(connection_id)
                # 计数从「上一次真正连上」起算：断连后看到的是第 1 次重试，不再是进程启动
                # 以来的累计次数（那会让「第 87 次」这种数字失去意义）。
                attempt = 1 if self._failure_kind is None else attempt + 1
                await self._notify_connection("disconnected", error=str(error))
                kind = classify_connector_failure(error)
                # 原因分类与日志档位正交：决定重连提示里给用户什么建议（换令牌 / 等网络 / 改地址）。
                reason = classify_disconnect_reason(error)
                first_of_kind = kind != self._failure_kind
                if first_of_kind and kind != FAILURE_DISCONNECTED:
                    # 只有原因变了才入库：同一种离线每 10s 记一条，日志页同样会被刷满，
                    # 而连接状态与 last_error 已由 _safe_record_error 每轮更新。正常断开不算异常，
                    # 恢复时那条「已连接」success 已经说明了整段经过。
                    await self._log_event(
                        "error" if kind == FAILURE_UNEXPECTED else "warning",
                        "连接",
                        f"Home Assistant 连接异常：{error}",
                        details=traceback.format_exc(),
                    )
                self._failure_kind = kind
                # 本轮实际等待时间：指数退避加抖动。墙屏、手机、家里多个 HomeOS 进程在同一个
                # HA 重启后往往同时重连，固定间隔会让它们每一轮都撞在一起（同刻 SYN、同刻超时）。
                delay = self._next_backoff(backoff)
                self._log_cycle_failure(error, kind, attempt, delay, first_of_kind, reason=reason)
                if connection_id:
                    await self._run_database(self._safe_record_error, connection_id, str(error))
                await asyncio.sleep(delay)
                await self._notify_connection("reconnecting", attempt=attempt, reason=reason)
                # 重连退避取自 haConnector（reconnectBaseMs / maxReconnectDelayMs），
                # 每次失败都重读，用户改参数后下一轮即生效。
                backoff = min(backoff * 2, self._reconnect_max_backoff())

    def _reset_failure_state(self) -> None:
        """连接真正建立后清空失败状态，下一次故障重新完整说明一次。"""
        self._failure_kind = None
        self._failure_logged_at = 0.0
        self._offline_since = None

    def _log_cycle_failure(
        self,
        error: BaseException,
        kind: str,
        attempt: int,
        delay: float,
        first_of_kind: bool,
        *,
        reason: str | None = None,
    ) -> None:
        """写一行重连失败摘要：断连 / 离线不打堆栈，同一原因按分钟限流。

        delay 是本轮实际等待秒数（已带抖动）；reason 是给用户的下一步建议。
        """
        now = time.monotonic()
        if self._offline_since is None:
            self._offline_since = now
        within_window = now - self._failure_logged_at < OFFLINE_LOG_INTERVAL_SECONDS
        if kind == FAILURE_UNEXPECTED:
            # 意外异常保留堆栈，但同一类原因也只给一次：重复的堆栈对排障没有新增信息。
            if first_of_kind or not within_window:
                self._failure_logged_at = now
                LOGGER.error(
                    "Home Assistant 连接循环出现未预期异常\n%s", _safe_text(traceback.format_exc(), limit=12000)
                )
            else:
                LOGGER.debug("HA 连接重试失败（第 %d 次）：%s", attempt, error)
            return
        if not first_of_kind and within_window:
            LOGGER.debug("HA 连接重试失败（第 %d 次）：%s", attempt, error)
            return
        self._failure_logged_at = now
        delay_text = f"{delay:.0f} 秒" if delay >= 1 else f"{delay * 1000:.0f} 毫秒"
        if kind == FAILURE_DISCONNECTED:
            LOGGER.info("Home Assistant 断开了实时连接，%s后重连（第 %d 次）", delay_text, attempt)
            return
        # 认证失败重试一万次也不会成功、网络断了等着就好 —— 提示语必须不一样。
        hint = DISCONNECT_REASON_HINTS.get(reason) if reason else None
        suffix = f"。{hint}" if hint else ""
        summary = _safe_text(str(error), limit=300).rstrip("。")
        # 端点汇总等文案自身已经点名 Home Assistant，这里只兜没有主语的短原因（超时、拒绝连接…）。
        headline = summary if "Home Assistant" in summary else f"Home Assistant 连接失败：{summary}"
        if first_of_kind:
            LOGGER.warning("%s；%s后自动重连（第 %d 次）%s", headline, delay_text, attempt, suffix)
        else:
            elapsed = int(now - self._offline_since)
            LOGGER.warning("%s；已持续 %d 秒，仍在重试（第 %d 次）%s", headline, elapsed, attempt, suffix)

    def _reconnect_base_backoff(self) -> float:
        """首次重连等待秒数：haConnector.reconnectBaseMs（默认 1000ms）。"""
        connector = self._ha_tuning()["haConnector"]
        try:
            return max(int(connector.get("reconnectBaseMs") or 0), 100) / 1000.0
        except (TypeError, ValueError):
            return 1.0

    def _reconnect_max_backoff(self) -> float:
        """退避上限秒数：haConnector.maxReconnectDelayMs（默认 10000ms），不小于起点。"""
        connector = self._ha_tuning()["haConnector"]
        try:
            value = max(int(connector.get("maxReconnectDelayMs") or 0), 100) / 1000.0
        except (TypeError, ValueError):
            value = 10.0
        return max(value, self._reconnect_base_backoff())

    def _next_backoff(self, backoff: float) -> float:
        """本轮重连等待秒数：指数退避乘 0.5~1.0 的抖动，上限仍由 maxReconnectDelayMs 封顶。

        抖动是刚需而不是美化：墙屏、手机、家里多个 HomeOS 进程常常在同一个 HA 重启后同时
        重连，固定间隔会让它们每一轮都撞在同一时刻（同刻 SYN、同刻超时），把恢复拖慢。
        抖动只向下取，因此等待时间永远不会超过配置的上限。
        """
        maximum = self._reconnect_max_backoff()
        jittered = min(backoff, maximum) * self._jitter_random.uniform(0.5, 1.0)
        return min(max(jittered, 0.05), maximum)

    def _live_event_batch_window(self) -> float:
        """实时状态合并窗口秒数：haConnector.liveEventBatchWindowMs（默认 50ms，0 表示不合并）。"""
        connector = self._ha_tuning()["haConnector"]
        raw = connector.get("liveEventBatchWindowMs")
        if raw is None:
            return LIVE_EVENT_BATCH_WINDOW_MS / 1000.0
        try:
            return max(int(raw), 0) / 1000.0
        except (TypeError, ValueError):
            return LIVE_EVENT_BATCH_WINDOW_MS / 1000.0

    def _can_fast_reconnect(self) -> bool:
        """重连是否可以跳过全量同步。

        必须同时满足：

        - 开关打开（``haConnector.fastReconnectEnabled``，默认开）；
        - 正在使用 ``subscribe_entities``：它的首帧全量 + 解码器比对能把断连窗口内的
          状态差异补齐。用 ``subscribe_events`` 时没有这个能力，跳过就会静默丢状态；
        - 距上次全量成功不超过 ``fastReconnectWindowMs``（默认 120s），避免长时间离线后
          拿一份过旧的基线去比。
        """
        connector = self._ha_tuning()["haConnector"]
        if not connector.get("fastReconnectEnabled", True):
            return False
        if not connector.get("useSubscribeEntities"):
            return False
        if self._last_full_sync_at <= 0:
            return False
        try:
            window_ms = max(int(connector.get("fastReconnectWindowMs") or 120_000), 1_000)
        except (TypeError, ValueError):
            window_ms = 120_000
        return (time.monotonic() - self._last_full_sync_at) * 1000 <= window_ms

    async def _live_connection(self, connection_id: str, *, bootstrap: bool = False) -> None:
        """建立实时连接并长连收包。

        ``bootstrap=True`` 表示**本轮要在订阅建立之后才做全量同步**（首次连接 / 长离线
        后的重连）。顺序必须是「订阅 → 同步 → 回放」：

        - 先同步再订阅：同步那几秒（get_states + 3 张注册表 + 大事务）里发生的状态变更
          没人订阅，HA 也不会重发 —— 前端永久停在旧值，直到下一次对账（默认 30 分钟）；
        - 订阅了但不读 socket：HA 侧待发队列会堆积，轻则延迟、重则被踢连接；
        - 所以同步期间收到的帧先进 ``_HandshakeCapture``，同步结束后按 ``last_updated``
          与快照合并回放（旧于快照的丢弃，见 ``live_events.superseded_by_snapshot``）。
        """
        connection = await self._run_database(self._load_connection, connection_id)
        client = await self.client_for(connection)
        websocket = await client.connect_websocket()
        # 状态事件先合批再落地：HA 场景切换 / 全屋开关会一次推几十上百条 state_changed，
        # 逐条各开一次数据库事务 + 逐条广播，读写两端都会被放大成卡顿。
        events = LiveStateEventQueue(
            lambda changes: self._flush_live_state_changes(connection_id, changes),
            window_seconds=self._live_event_batch_window(),
            on_drop=lambda delta, total: self._notify_live_drops(connection_id, delta, total),
        )
        # ``subscribe_entities`` 只承载状态流，注册表变更仍需单独订阅。
        registry_event_types = tuple(event_type for event_type in LIVE_EVENT_TYPES if event_type != "state_changed")
        decoder: CompressedStateDecoder | None = None
        shadow: ShadowStateTracker | None = None
        compressed_stream = False
        shadow_stream = False
        capture: _HandshakeCapture | None = None
        capture_task: asyncio.Task[Any] | None = None
        try:
            if client.use_subscribe_entities:
                buffered_events, compressed_stream, shadow_stream = await self._subscribe_compressed_stream(
                    client, websocket, registry_event_types
                )
            else:
                buffered_events = await client.subscribe_events(
                    websocket,
                    LIVE_EVENT_TYPES,
                    required_event_types={"state_changed"},
                    timeout=self.settings.ha_request_timeout_seconds,
                )
            if bootstrap:
                # 订阅已建立：同步期间的帧收进内存，同步结束后统一回放。
                capture = _HandshakeCapture()
                capture_task = asyncio.create_task(
                    self._capture_handshake_frames(websocket, capture), name="ha-live-handshake"
                )
                try:
                    await self.sync_once(connection_id)
                finally:
                    await self._stop_handshake_capture(capture_task)
                    capture_task = None
            # 解码器的比对基线必须是「刚落地的那份快照」：先订阅后同步时它只能在同步之后
            # 创建，否则首帧全量里的每个实体都会拿旧基线比对失败，等于重连广播一次全屋。
            if compressed_stream:
                decoder = CompressedStateDecoder(seed=self._live_seed)
                if shadow_stream:
                    shadow = ShadowStateTracker()
            await self._run_database(self._mark_connected, connection_id)
            self._connected = True
            # 连上之后按这条连接的凭据重新激活姿态历史：换了 HA 实例就得换一份历史视图，
            # 同时把作用域同步给 StateHub，迟到的旧连接状态会被 observe 丢弃。
            await asyncio.to_thread(self.refresh_cover_memory_scope)
            self._runtime_error = None
            # 真正连上才算恢复：同步成功但 WebSocket 被反代挡住时，失败原因并没有变，
            # 不该因此每轮都重新打一遍完整说明。
            self._reset_failure_state()
            await self._log_event("success", "连接", "已连接 Home Assistant，实时状态同步正常")
            version = getattr(self, "ha_version", None) or getattr(connection, "ha_version", None)  # 快照可能为空
            await self._notify_connection("connected", ha_version=version)
            events.start()
            for message in buffered_events:
                await self._dispatch_message(events, connection_id, message, decoder, shadow)
            if capture is not None:
                await self._replay_handshake_capture(events, connection_id, capture, decoder, shadow)
            reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
            while True:
                wait_seconds = max(0.1, reconcile_at - time.monotonic())
                try:
                    raw_message = await asyncio.wait_for(websocket.recv(), timeout=wait_seconds)
                except TimeoutError:
                    # 周期对账绝不能跑在收包循环上：全量快照是一次「建连 + get_states +
                    # 3 张注册表 + 全量大事务」，耗时可达数秒。期间不读 socket 会让
                    # websockets 的 max_queue（4）填满、HA 侧待发队列堆积，轻则事件延迟，
                    # 重则被判为消费不过来而被动踢连接（→ 又触发一轮全量重建）。
                    self.schedule_reconcile(connection_id)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
                    continue
                try:
                    message = json.loads(raw_message)
                except (TypeError, ValueError):
                    # 单条畸形帧只丢这一条：抛出去会把整条实时连接拆掉，代价是一次全量重同步。
                    LOGGER.debug("HA 实时事件不是合法 JSON，已跳过")
                    continue
                try:
                    await self._dispatch_message(events, connection_id, message, decoder, shadow)
                except Exception:
                    # 同样地：分派失败不能终结收包循环。状态类事件进的是内存队列（不会抛），
                    # 能抛出来的是注册表落库 —— 下一轮周期对账会把它补回来。
                    LOGGER.warning("HA 实时事件分派失败，已跳过", exc_info=True)
                if decoder is not None and decoder.needs_resync:
                    # 增量基线缺失：先安排一次全量对账，由对账重建快照（并刷新 _live_seed）。
                    decoder.needs_resync = False
                    self.schedule_reconcile(connection_id)
                if time.monotonic() >= reconcile_at:
                    self.schedule_reconcile(connection_id)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
        finally:
            self._connected = False
            await self._stop_handshake_capture(capture_task)
            # 断开前把已收到但还没落地的变化冲出去：最后一帧也要进读模型与广播。
            await events.aclose()
            await self._notify_connection("disconnected")
            await websocket.close()

    async def _subscribe_compressed_stream(
        self, client, websocket, registry_event_types: tuple[str, ...]
    ) -> tuple[list[Any], bool, bool]:
        """建立压缩状态流订阅；返回 ``(订阅期缓冲帧, 是否压缩流, 是否影子订阅)``。

        ``subscribe_entities`` 只承载状态流，注册表变更仍需单独订阅；旧版 HA（< 2023.3）
        或反代拦截该 WS 命令时降级回 ``state_changed`` 全量事件 —— 绝不能让连接因为
        「省带宽的优化」而起不来。
        """
        buffered_events = await client.subscribe_events(
            websocket,
            registry_event_types,
            required_event_types=set(registry_event_types),
            # 反代把 WS 挂住时 ``recv`` 不会返回：不给超时就会永远停在「连接中」。
            timeout=self.settings.ha_request_timeout_seconds,
        )
        compressed_stream = False
        shadow_stream = False
        try:
            buffered_events += await client.subscribe_entities(websocket)
            compressed_stream = True
        except HAClientError as error:
            record_ha_counter("subscribe_entities_fallback")
            LOGGER.warning("HA 不支持 subscribe_entities，降级为 subscribe_events：%s", error)
            buffered_events += await client.subscribe_events(
                websocket,
                ("state_changed",),
                start_id=140,
                required_event_types={"state_changed"},
                timeout=self.settings.ha_request_timeout_seconds,
            )
        # 影子订阅独立 try：它只是诊断用的第二条 state_changed 订阅。挂掉时若走到上面的
        # 降级分支，就会变成「降级订阅 + 残留影子订阅」两条 state_changed，每条状态被派发两次。
        if compressed_stream and client.subscribe_entities_shadow:
            try:
                buffered_events += await client.subscribe_events(
                    websocket,
                    ("state_changed",),
                    start_id=120,
                    required_event_types={"state_changed"},
                    timeout=self.settings.ha_request_timeout_seconds,
                )
                shadow_stream = True
            except HAClientError as error:
                LOGGER.warning("HA 压缩状态影子订阅失败，继续使用压缩流：%s", error)
        return buffered_events, compressed_stream, shadow_stream

    async def _capture_handshake_frames(self, websocket: Any, capture: _HandshakeCapture) -> None:
        """同步窗口的收包旁路：订阅已建立、全量快照还没落地。

        只收不处理（解码器还要等新快照做基线）。取消 ``recv`` 是 websockets 明确支持的
        操作，不会丢帧：停止时只是不再等下一帧，socket 仍然可用。
        """
        while True:
            try:
                raw_message = await websocket.recv()
            except asyncio.CancelledError:
                raise
            except Exception:
                # 连接在同步期间断掉：交给同步失败 / 收包循环去报错，这里只退出。
                LOGGER.debug('握手期收包旁路已断开，停止旁路收帧', exc_info=True)
                return
            try:
                message = json.loads(raw_message)
            except (TypeError, ValueError):
                LOGGER.debug('握手期收到非 JSON 帧，已跳过')
                continue
            capture.received += 1
            capture.frames.append(message)

    @staticmethod
    async def _stop_handshake_capture(task: asyncio.Task[Any] | None) -> None:
        if task is None or task.done():
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    async def _replay_handshake_capture(
        self,
        events: LiveStateEventQueue,
        connection_id: str,
        capture: _HandshakeCapture,
        decoder: CompressedStateDecoder | None,
        shadow: ShadowStateTracker | None,
    ) -> None:
        """把同步窗口里缓冲的帧补发出去，并丢掉已被快照覆盖的旧值。"""
        frames = list(capture.frames)
        capture.frames.clear()
        dropped = capture.dropped
        if dropped:
            record_ha_counter("handshake_overflow", dropped)
            LOGGER.warning(
                "HA 握手窗口内缓冲溢出，丢弃最旧 %d 帧（上限 %d），将补一次全量对账",
                dropped,
                LIVE_BOOTSTRAP_MAX_FRAMES,
            )
        if not frames:
            if dropped:
                self.schedule_reconcile(connection_id)
            return
        started = time.monotonic()
        replayed = 0
        baseline = self._live_seed
        for message in frames:
            replayed += await self._dispatch_message(
                events, connection_id, message, decoder, shadow, baseline=baseline
            )
        record_ha_sync_latency("handshake_replay", (time.monotonic() - started) * 1000)
        if replayed:
            record_ha_counter("handshake_replay", replayed)
            LOGGER.debug("HA 握手窗口回放 %d 条状态变化（缓冲 %d 帧）", replayed, len(frames))
        if dropped:
            self.schedule_reconcile(connection_id)


    async def _dispatch_message(
        self,
        events: LiveStateEventQueue,
        connection_id: str,
        message: dict[str, Any],
        decoder: CompressedStateDecoder | None = None,
        shadow: ShadowStateTracker | None = None,
        *,
        baseline: Mapping[str, tuple[str, float | None]] | None = None,
    ) -> int:
        """按消息形状分派：压缩帧解码 / 影子帧仅对比 / 其它保持原路径。

        ``subscribe_entities`` 的帧没有 ``event_type``（只有 a/c/r），
        注册表事件与 ``state_changed`` 则一定带 ``event_type``，二者不会混淆。

        ``baseline`` 只用于握手窗口的缓冲回放：给定时，已被同步快照覆盖的旧值会被丢弃
        （见 ``live_events.superseded_by_snapshot``）。返回实际派发出去的状态变化条数。
        """
        event = message.get("event") if isinstance(message, dict) else None
        compressed = (
            decoder is not None
            and isinstance(event, dict)
            and "event_type" not in event
            and any(key in event for key in ("a", "c", "r"))
        )
        if compressed and decoder is not None:
            dispatched = 0
            for decoded in decoder.feed(message):
                dispatched += await self._dispatch_live_event(events, connection_id, decoded, baseline=baseline)
            return dispatched
        if shadow is not None and isinstance(event, dict) and event.get("event_type") == "state_changed":
            # 影子订阅只用于对账，绝不重复进下游（否则每条状态会被处理两遍）。
            if decoder is not None:
                shadow.observe(message, decoder)
            return 0
        return await self._dispatch_live_event(events, connection_id, message, baseline=baseline)

    async def _dispatch_live_event(
        self,
        events: LiveStateEventQueue,
        connection_id: str,
        message: dict[str, Any],
        *,
        baseline: Mapping[str, tuple[str, float | None]] | None = None,
    ) -> int:
        """分派一条 WS 消息：state_changed 进合并队列，其余事件保持即时处理。

        返回 1 表示这条状态变化已入队，0 表示不是状态变化或被判定为过期。
        """
        change = live_state_change(message)
        if change is None:
            await self._handle_live_event(connection_id, message)
            return 0
        if baseline is not None and superseded_by_snapshot(change, baseline):
            # 握手窗口里收到的旧值：同步快照已经包含它，再回放会把状态推回过去。
            record_ha_counter("handshake_replay_stale")
            return 0
        entity_id = str(change.get("entity_id") or change.get("removed_entity_id") or "")
        # ① 收包段：HA 触发 → 本进程收到。用事件自带的 time_fired 计算，
        # 只统计合理区间（时钟偏差 / 补发的旧事件不污染 p99）。
        lag_ms = _event_lag_ms(change.get("time_fired"))
        if lag_ms is not None:
            record_ha_sync_latency("ha_receive", lag_ms)
        record_ha_counter("recv")
        events.enqueue(change, entity_id=entity_id or None)
        return 1


    async def _notify_live_drops(self, connection_id: str, delta: int, total: int) -> None:
        """实时合并队列丢事件时通知 UI，由前端触发重同步（REST 增量优先）。

        丢弃本身是设计内的降级（保内存），但**静默**丢弃会让面板停在旧值上而不自知，
        所以这里走事件总线 → socket.io 的 ``ha_queue_dropped``（前端已有处理器：
        回滚乐观更新 + 标陈旧 + 触发对齐）。
        """
        bus = getattr(self, "_event_bus", None)
        record_ha_counter("queue_dropped", delta)
        if bus is None:
            return
        payload = {
            "reason": "live_state_backlog",
            "count": delta,
            "total": total,
            "connectionId": connection_id,
        }
        try:
            emit = getattr(bus, "emit", None) or getattr(bus, "publish", None)
            if not callable(emit):
                return
            result = emit("ha.queue_dropped", payload)
            if inspect.isawaitable(result):
                await result
        except Exception:
            LOGGER.debug("HA 实时状态丢弃事件外发失败", exc_info=True)

    async def _notify_single_state_change(
        self, change: dict[str, Any], flushed_at: float
    ) -> tuple[float, dict[str, Any] | None, str]:
        """单条落地：延迟打点 + 外发监听（含删除事件）。

        返回 ``(notify 耗时 ms, 可入库的 new_state, 被删除的实体 ID)``。
        """
        removed_entity_id = str(change.get("removed_entity_id") or "")
        new_state = change.get("new_state")
        # ② 合并队列停留：入队 → 本批落地，窗口本身（50ms）也算在内，
        # 因为这就是「被刻意推迟」的那一段。
        received_at = change.get("received_at")
        if isinstance(received_at, float):
            dwell_ms = max(0.0, (flushed_at - received_at) * 1000)
            record_ha_sync_latency("ha_deferred_dwell", dwell_ms)
            # 关键域单独记一段：它的窗口是 4ms 而不是 50ms，混在一起会被传感器样本淹没，
            # 于是「点灯反馈变快了没有」在 /metrics 里看不出来。
            if entity_domain(change.get("entity_id")) in LIVE_EVENT_CRITICAL_DOMAINS:
                record_ha_sync_latency("ha_deferred_dwell_critical", dwell_ms)
        started = time.monotonic()
        # 删除事件必须把 id 一并下发：``removed_entity_id`` 原本只在本模块内部使用，
        # 于是消费端只看到 ``entity_id=None`` 就 return，删除分支永远走不到 ——
        # HA 里删掉的实体在 L1 / ``/api/state`` / 前端实体表里永久残留。
        await self._notify_state(
            "change",
            {
                "entity_id": change.get("entity_id") or (removed_entity_id or None),
                "old_state": change.get("old_state"),
                "new_state": new_state,
                "time_fired": change.get("time_fired"),
                **({"removed": True} if removed_entity_id else {}),
            },
        )
        # ③ 事件总线段：读模型监听 + socket.io 广播（不含网络发送）。
        notify_ms = (time.monotonic() - started) * 1000
        return notify_ms, (new_state if isinstance(new_state, dict) else None), removed_entity_id

    async def _publish_watched_updates(self, states: list[dict[str, Any]], removed_entity_ids: list[str]) -> None:
        """把本批落地结果推给状态中心（被监听的实体才更新，删除一律移除）。"""
        watched = await self.watched_entity_ids()
        for new_state in states:
            if str(new_state.get("entity_id") or "") in watched:
                await self.state_hub.update(new_state)
        for removed_entity_id in removed_entity_ids:
            await self.state_hub.remove(removed_entity_id)

    async def _publish_catalog_changed(
        self, connection_id: str, operation: str, counts: dict[str, int] | None = None
    ) -> None:
        """目录变更同时送到两条通道：StateHub（``/ws/runtime``）与事件总线（socket.io）。

        只发 StateHub 时，墙屏（3D）能看到新设备，而网页端的实体列表要等到下一次整表
        刷新 —— 同一个后端、两条通道、两套消费者，缺一条就是「有的端看不见」。
        """
        resolved = counts if counts is not None else await self._run_database(self.catalog_counts, connection_id)
        await self.state_hub.publish(
            {
                "type": "entity_catalog_changed",
                "operation": operation,
                "counts": resolved,
            }
        )
        bus = getattr(self, "_event_bus", None)
        if bus is None:
            return
        try:
            emit = getattr(bus, "emit", None) or getattr(bus, "publish", None)
            if not callable(emit):
                return
            result = emit(
                "ha.entity_catalog_changed",
                {"type": "entity_catalog_changed", "operation": operation, "counts": resolved},
            )
            if inspect.isawaitable(result):
                await result
        except Exception:
            # 目录变更外发是旁路：失败不影响状态同步主流程（前端另有整表刷新兜底）。
            LOGGER.debug("实体目录变更事件外发失败: %s", operation, exc_info=True)

    async def _apply_removed_states_batch(self, connection_id: str, removed_entity_ids: list[str]) -> bool:
        """数据库里的幽灵行同样要收尾：否则「实体列表」接口仍返回已删除的实体，
        前端刷新一次就把刚清掉的设备又装回来。"""
        if not removed_entity_ids:
            return False
        return bool(await self._run_database(self._apply_removed_states, connection_id, removed_entity_ids))

    async def _flush_live_state_changes(self, connection_id: str, changes: list[dict[str, Any]]) -> None:
        """把一批合并后的状态变化落地。

        外发仍逐条：监听器契约（kind=change，载荷含 entity_id / old_state / new_state /
        time_fired）不变，homeos 读模型与 socket.io 广播的语义与逐条路径完全一致；
        数据库写入与目录计数则按批处理 —— 一批一次事务、最多一次 catalog_counts。
        """
        states: list[dict[str, Any]] = []
        removed_entity_ids: list[str] = []
        flushed_at = time.monotonic()
        notify_ms = 0.0
        for change in changes:
            change_ms, new_state, removed_entity_id = await self._notify_single_state_change(change, flushed_at)
            notify_ms += change_ms
            if removed_entity_id:
                removed_entity_ids.append(removed_entity_id)
            if new_state is not None:
                states.append(new_state)
        await self._publish_watched_updates(states, removed_entity_ids)
        if notify_ms > 0:
            record_ha_sync_latency("hot_apply", notify_ms / max(len(changes), 1))
        catalog_changed = await self._apply_removed_states_batch(connection_id, removed_entity_ids)
        if not states:
            if catalog_changed:
                await self._publish_catalog_changed(connection_id, "removed")
            return
        started = time.monotonic()
        catalog_changed = (
            bool(await self._run_database(self._apply_incremental_states, connection_id, states)) or catalog_changed
        )
        # ④ 落地段：一批一次 SQLite 事务。
        record_ha_sync_latency("ingress_flush", (time.monotonic() - started) * 1000)
        if catalog_changed:
            await self._publish_catalog_changed(connection_id, "added")

    async def _handle_live_event(self, connection_id: str, message: dict[str, Any]) -> None:
        """非状态类事件（三类注册表变更）的即时处理。"""
        if message.get("type") != "event":
            return
        event = message.get("event") or {}
        event_type = event.get("event_type")
        event_data = event.get("data") or {}
        if event_type in {"entity_registry_updated", "device_registry_updated", "area_registry_updated"}:
            operation = await self._run_database(self._apply_registry_event, connection_id, event_type, event_data)
            if operation:
                if event_type == "entity_registry_updated":
                    action = str(event_data.get("action") or "update")
                    entity_id = str(event_data.get("entity_id") or "")
                    changes_value = event_data.get("changes")
                    changes = changes_value if isinstance(changes_value, dict) else {}
                    old_entity_id = str(changes.get("entity_id") or "")
                    removed_entity_ids = set()
                    if old_entity_id and old_entity_id != entity_id:
                        removed_entity_ids.add(old_entity_id)
                    if action == "remove":
                        removed_entity_ids.add(entity_id)
                    elif "disabled_by" in event_data:
                        if event_data.get("disabled_by"):
                            removed_entity_ids.add(entity_id)
                    elif "disabled_by" in changes and changes.get("disabled_by") is None:
                        removed_entity_ids.add(entity_id)
                    for removed_entity_id in sorted(removed_entity_ids - {""}):
                        await self.state_hub.remove(removed_entity_id)
                await self._publish_catalog_changed(connection_id, operation)
                self._schedule_registry_refresh(connection_id)
            # 无论增量落库是否成功都要广播：注册表变了，房间索引 / 语音快路径的房间缓存
            # 就必须失效，否则新增「书房灯」后语音指令会一直命中旧缓存。
            await self._emit_registry_event(event_type, event_data)

    async def _emit_registry_event(self, event_type: str, event_data: dict[str, Any]) -> None:
        """把 HA 注册表变更转成进程内事件（``ha.<kind>_registry_updated``）。

        此前只有订阅方（区域索引、语音快路径）而没有发布方，缓存永不失效。
        """
        event_name = _REGISTRY_EVENT_NAMES.get(event_type)
        bus = getattr(self, "_event_bus", None)
        if event_name is None or bus is None:
            return
        payload = {
            "type": event_type,
            "action": str(event_data.get("action") or "update"),
            "entity_id": event_data.get("entity_id"),
            "area_id": event_data.get("area_id"),
            "device_id": event_data.get("device_id"),
        }
        try:
            emit = getattr(bus, "emit", None) or getattr(bus, "publish", None)
            if not callable(emit):
                return
            result: Any = emit(event_name, payload)
            if inspect.isawaitable(result):
                await result
        except Exception:
            # 广播失败不影响同步主流程，但必须留痕（缓存另有 TTL 兜底）。
            LOGGER.warning("注册表变更事件广播失败：%s", event_name, exc_info=True)
