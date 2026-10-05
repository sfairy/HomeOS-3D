"""HA WebSocket 客户端（对齐 HaConnectorService 的 WS 通道核心能力）。

提供：
- 连接 / 认证 / 自动重连（``auth_required`` → ``auth`` → ``auth_ok``）；
- 请求-响应（``send_request``，按消息 ``id`` 关联 pending future）；
- 事件订阅（``add_event_subscription`` 按 id 分发 ``event`` 负载）；
- ``camera/webrtc/offer`` 长流程（订阅确认 + answer/candidate 聚合）。

状态同步（``subscribe_events`` / ``state_changed`` 冷批入队）由上层 RealtimeGateway 复用本客户端的
``on_event`` 回调实现，避免与既有内存缓冲/Redis 快照链路重复。
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import websockets

from ..core.errors import BusinessException, ErrorCode, api_error

logger = logging.getLogger("homeos.ha_ws")


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


EventCallback = Callable[[dict[str, Any]], None]


@dataclass
class _Pending:
    future: asyncio.Future
    type_: str
    timer: asyncio.TimerHandle | None = None


@dataclass
class WebRtcOfferResult:
    session_id: str
    answer: str
    candidates: list[dict[str, Any]] = field(default_factory=list)
    subscription_id: int = 0


class HaWebSocketClient:
    """单例 HA WebSocket 客户端（由 FastAPI lifespan 启停）。"""

    def __init__(
        self,
        endpoint_selector,
        *,
        on_event: Callable[[dict[str, Any]], Any] | None = None,
        on_connected: Callable[[], Any] | None = None,
        on_disconnected: Callable[[], Any] | None = None,
        on_reconnecting: Callable[[int], Any] | None = None,
    ) -> None:
        self._endpoint_selector = endpoint_selector
        self._on_event = on_event
        self._on_connected = on_connected
        self._on_disconnected = on_disconnected
        self._on_reconnecting = on_reconnecting
        self._ws: Any = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._connected = False
        self._authenticated = False
        self._next_id = 1
        self._pending: dict[int, _Pending] = {}
        self._event_subs: dict[int, EventCallback] = {}
        self.ha_version = ""
        #: 最近一次连接成功时间（ISO 8601；供 /system/diagnostics 展示）
        self.last_connected_at: str | None = None
        #: 连续失败重连次数（认证成功后清零，与 Nest reconnectCount 同口径）
        self.reconnect_count = 0

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        if self._task is not None:
            return
        self._loop = asyncio.get_running_loop()
        self._stop.clear()
        self._task = asyncio.create_task(self._run_forever(), name="ha-ws")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None
        await self._close_ws()
        self._fail_pending(api_error("HA_WS_CONNECTION_CLOSED"))

    def is_connected(self) -> bool:
        return self._connected and self._authenticated

    def next_message_id(self) -> int:
        value = self._next_id
        self._next_id += 1
        return value

    # ------------------------------------------------------------------ #
    # pending result / event subscription
    # ------------------------------------------------------------------ #
    def add_pending_result(self, message_id: int, future: asyncio.Future, type_: str = "") -> None:
        self._pending[message_id] = _Pending(future=future, type_=type_)

    def has_pending_result(self, message_id: int) -> bool:
        return message_id in self._pending

    def delete_pending_result(self, message_id: int) -> bool:
        return self._pending.pop(message_id, None) is not None

    def add_event_subscription(self, message_id: int, handler: EventCallback) -> None:
        self._event_subs[message_id] = handler

    def remove_event_subscription(self, message_id: int) -> None:
        self._event_subs.pop(message_id, None)

    # ------------------------------------------------------------------ #
    # 发送
    # ------------------------------------------------------------------ #
    async def send_json(self, message: dict[str, Any]) -> bool:
        if self._ws is None:
            return False
        try:
            await self._ws.send(json.dumps(message, ensure_ascii=False))
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("发送 HA WS 消息失败: %s", exc)
            return False

    async def send_request(self, type_: str, payload: dict[str, Any] | None = None, timeout_ms: int = 10_000) -> Any:
        """发送请求并等待 ``result``；超时 / 未连接抛业务异常。"""
        if not self.is_connected():
            raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_WS_NOT_CONNECTED"))
        message_id = self.next_message_id()
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self.add_pending_result(message_id, future, type_)
        message = {"id": message_id, "type": type_, **(payload or {})}
        sent = await self.send_json(message)
        if not sent:
            self.delete_pending_result(message_id)
            raise BusinessException(ErrorCode.EXTERNAL_ERROR, api_error("HA_WS_REQUEST_FAILED"))
        try:
            return await asyncio.wait_for(future, timeout=timeout_ms / 1000)
        except TimeoutError as exc:
            self.delete_pending_result(message_id)
            raise BusinessException(
                ErrorCode.EXTERNAL_ERROR, api_error("HA_WS_REQUEST_TIMEOUT", type_)
            ) from exc
        finally:
            self.delete_pending_result(message_id)

    # ------------------------------------------------------------------ #
    # WebRTC 协商（camera/webrtc/offer 长流程）
    # ------------------------------------------------------------------ #
    async def subscribe_webrtc_offer(self, entity_id: str, offer: str) -> WebRtcOfferResult:
        if not self.is_connected():
            raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_WS_NOT_CONNECTED"))

        loop = asyncio.get_running_loop()
        acked = loop.create_future()
        done = loop.create_future()
        state: dict[str, Any] = {"session_id": "", "answer": "", "candidates": []}
        settle_timer: list[asyncio.TimerHandle] = []

        def _cleanup(message_id: int) -> None:
            self.remove_event_subscription(message_id)
            for handle in settle_timer:
                handle.cancel()
            settle_timer.clear()

        def _settle(message_id: int) -> None:
            _cleanup(message_id)
            if not done.done():
                done.set_result(
                    WebRtcOfferResult(
                        session_id=str(state["session_id"]),
                        answer=str(state["answer"]),
                        candidates=list(state["candidates"]),
                        subscription_id=message_id,
                    )
                )

        message_id = self.next_message_id()

        def _on_event(event: dict[str, Any]) -> None:
            etype = event.get("type")
            if etype == "session":
                state["session_id"] = str(event.get("session_id") or "")
            elif etype == "answer":
                if not acked.done():
                    return
                state["answer"] = str(event.get("answer") or "")
                for handle in settle_timer:
                    handle.cancel()
                settle_timer.append(loop.call_later(0.8, _settle, message_id))
            elif etype == "candidate":
                candidate = event.get("candidate")
                if isinstance(candidate, dict):
                    state["candidates"].append(candidate)
            elif etype == "error":
                message = str(event.get("message") or event.get("code") or api_error("HA_WEBRTC_ERROR"))
                _cleanup(message_id)
                if not done.done():
                    done.set_exception(BusinessException(ErrorCode.EXTERNAL_ERROR, message))

        self.add_event_subscription(message_id, _on_event)
        self.add_pending_result(message_id, acked, "camera/webrtc/offer")

        try:
            sent = await self.send_json({"id": message_id, "type": "camera/webrtc/offer", "entity_id": entity_id, "offer": offer})
            if not sent:
                raise BusinessException(ErrorCode.EXTERNAL_ERROR, api_error("HA_WS_REQUEST_FAILED"))
            await asyncio.wait_for(acked, timeout=10)
        except TimeoutError as exc:
            self._cleanup_webrtc(message_id, acked)
            raise BusinessException(
                ErrorCode.EXTERNAL_ERROR, api_error("HA_WEBRTC_OFFER_ACK_TIMEOUT")
            ) from exc
        except Exception:
            self._cleanup_webrtc(message_id, acked)
            raise

        try:
            return await asyncio.wait_for(done, timeout=25)
        except TimeoutError as exc:
            self._cleanup_webrtc(message_id, acked)
            raise BusinessException(ErrorCode.EXTERNAL_ERROR, api_error("HA_WEBRTC_TIMEOUT")) from exc

    def _cleanup_webrtc(self, message_id: int, acked: asyncio.Future) -> None:
        self.remove_event_subscription(message_id)
        self.delete_pending_result(message_id)
        if acked.cancelled():
            return
        with contextlib.suppress(Exception):
            acked.exception()

    async def unsubscribe(self, subscription_id: int, timeout_ms: int = 5000) -> None:
        if not self.is_connected():
            return
        message_id = self.next_message_id()
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self.add_pending_result(message_id, future, "unsubscribe")
        await self.send_json({"id": message_id, "type": "unsubscribe", "subscription": subscription_id})
        try:
            await asyncio.wait_for(future, timeout=timeout_ms / 1000)
        except TimeoutError as exc:
            self.delete_pending_result(message_id)
            raise BusinessException(ErrorCode.EXTERNAL_ERROR, api_error("HA_UNSUBSCRIBE_TIMEOUT")) from exc
        except BusinessException:
            raise

    # ------------------------------------------------------------------ #
    # 内部：连接循环与消息分发
    # ------------------------------------------------------------------ #
    async def _run_forever(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                await self._connect_once()
                backoff = 1.0
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                # 连续失败计数：认证成功后复位（对齐 Nest reconnectCount 语义）
                # 同时上报故障转移器：连续失败达阈值后自动切外网地址。
                self._endpoint_selector.notify_connect_failure()
                self.reconnect_count += 1
                if self._endpoint_selector.is_expected_lan_failover():
                    # 局域网失败且已配置外网：属预期切换，降级为普通日志（对齐 Nest）
                    logger.info("局域网HA WebSocket不可达(已配置外网):%s", exc)
                else:
                    logger.warning("HA WS 连接中断: %s", exc)
            finally:
                was_connected = self._connected
                self._connected = False
                self._authenticated = False
                self._ws = None
                self._fail_pending(api_error("HA_WS_CONNECTION_CLOSED"))
                if was_connected:
                    await _maybe_await(self._on_disconnected)
            if self._stop.is_set():
                break
            await _maybe_await(self._on_reconnecting, self.reconnect_count)
            await asyncio.sleep(backoff + random.random() * 0.5)
            backoff = min(backoff * 2, 30.0)

    async def _connect_once(self) -> None:
        # 按当前重连序号解析主/备地址（使用外网期间周期性探测局域网）
        endpoints = self._endpoint_selector.resolve(reconnect_attempt=self.reconnect_count)
        url = endpoints.ha_url_primary
        if not url or not endpoints.token:
            raise RuntimeError("HA 未配置")
        ws_url = _to_ws_url(url)
        # ``proxy=None``：显式禁用代理。``websockets`` 默认 (proxy=True) 会调用
        # ``urllib.request.getproxies()``，在 macOS 上该函数会读取「系统设置 → 网络 → 代理」，
        # 一旦系统代理含 SOCKS，wss 会被改写成 ``socks5h://`` 并因缺少 python-socks 直接抛
        # ImportError；即使可用，HA 属于局域网/自建内网服务，也不应经第三方代理转发。
        async with websockets.connect(
            ws_url, max_size=None, ping_interval=30, open_timeout=10, proxy=None
        ) as ws:
            self._ws = ws
            first = json.loads(await ws.recv())
            if first.get("type") != "auth_required":
                raise RuntimeError(f"HA WS 协议异常: {first.get('type')}")
            await ws.send(json.dumps({"type": "auth", "access_token": endpoints.token}))
            auth = json.loads(await ws.recv())
            if auth.get("type") != "auth_ok":
                raise RuntimeError(f"HA WS 认证失败: {auth.get('type')}")
            self._authenticated = True
            self._connected = True
            self.ha_version = str(auth.get("ha_version") or "")
            # 认证成功：清零连续失败计数并记录连接时间（对齐 Nest resetOnAuthOk）
            self.reconnect_count = 0
            self._endpoint_selector.notify_connect_success(url)
            self.last_connected_at = _iso_now()
            logger.info("✅ 已连接 HA WebSocket %s", self.ha_version)
            # 连接后引导（subscribe_events / get_states）需与接收循环并发执行：
            # 若在进入 recv 循环前 await，send_request 的响应永远无人分发而死锁。
            bootstrap = asyncio.create_task(_maybe_await(self._on_connected), name="ha-ws-bootstrap")
            try:
                async for raw in ws:
                    try:
                        message = json.loads(raw)
                    except (TypeError, ValueError):
                        continue
                    await self._dispatch(message)
            finally:
                if not bootstrap.done():
                    bootstrap.cancel()
                    with contextlib.suppress(asyncio.CancelledError, Exception):
                        await bootstrap

    async def _dispatch(self, message: dict[str, Any]) -> None:
        message_id = message.get("id")
        msg_type = message.get("type")
        if msg_type == "result" and isinstance(message_id, int):
            pending = self._pending.get(message_id)
            if pending is not None:
                self.delete_pending_result(message_id)
                if not pending.future.done():
                    if message.get("success"):
                        pending.future.set_result(message.get("result"))
                    else:
                        error = message.get("error") or {}
                        code = error.get("message") or error.get("code") or api_error("HA_WS_REQUEST_FAILED")
                        pending.future.set_exception(BusinessException(ErrorCode.EXTERNAL_ERROR, str(code)))
                return
        if msg_type == "event":
            event = message.get("event")
            if isinstance(message_id, int) and message_id in self._event_subs:
                handler = self._event_subs[message_id]
                if isinstance(event, dict):
                    handler(event)
                return
            if isinstance(event, dict):
                # 订阅确认（result 已由 pending 处理）之外的全局事件 → 上层 fan-out
                if isinstance(message_id, int) and message_id in self._pending:
                    pending = self._pending.get(message_id)
                    if pending is not None and not pending.future.done():
                        pending.future.set_result(None)
                await _maybe_await(self._on_event, event)
            return
        # 部分 HA 版本对 camera/webrtc/candidate 等直接推送根级字段
        if isinstance(message_id, int) and message_id in self._event_subs:
            self._event_subs[message_id](message)

    def _fail_pending(self, message: str) -> None:
        pending_items = list(self._pending.items())
        self._pending.clear()
        for _message_id, pending in pending_items:
            if not pending.future.done():
                pending.future.set_exception(BusinessException(ErrorCode.EXTERNAL_ERROR, message))

    async def _close_ws(self) -> None:
        ws = self._ws
        self._ws = None
        if ws is not None:
            with contextlib.suppress(Exception):
                await ws.close()


async def _maybe_await(callback: Callable[..., Any] | None, *args) -> None:
    if callback is None:
        return
    result = callback(*args)
    if isinstance(result, Awaitable):
        await result


def _to_ws_url(http_url: str) -> str:
    base = http_url.rstrip("/")
    if base.startswith("https://"):
        base = "wss://" + base[len("https://") :]
    elif base.startswith("http://"):
        base = "ws://" + base[len("http://") :]
    return f"{base}/api/websocket"
