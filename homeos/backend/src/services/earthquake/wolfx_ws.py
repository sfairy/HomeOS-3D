"""WolfX EEW WebSocket 客户端（对齐 ``earthquake/wolfx-ws.client.ts``）。

维护与 WolfX 全部 EEW 源的长连接；指数退避自动重连（最大 30s）；
60 秒心跳保活，主节点活跃标记同步；收到的 JSON 消息回调上层处理。
"""

from __future__ import annotations

import asyncio
import contextlib
import inspect
import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

try:  # pragma: no cover - 依赖存在时导入
    import websockets
except Exception:
    websockets = None  # type: ignore[assignment]

logger = logging.getLogger("homeos.earthquake.wolfx")

#: WolfX EEW WebSocket 地址（聚合全部 EEW 源）
WOLFX_WS_URL = "wss://ws-api.wolfx.jp/all_eew"

MAX_RECONNECT_DELAY_MS = 30_000
INITIAL_RECONNECT_DELAY_MS = 1_000
HEARTBEAT_INTERVAL_SEC = 60


def _now_ms() -> float:
    return datetime.now(UTC).timestamp() * 1000


class WolfxWsClient:
    """WolfX EEW WebSocket 客户端。"""

    def __init__(
        self,
        on_message: Callable[[dict[str, Any]], Any],
        touch_leader_active: Callable[[], Any] | None = None,
        can_connect: Callable[[], bool] | None = None,
    ) -> None:
        self._on_message = on_message
        self._touch_leader_active = touch_leader_active
        self._can_connect = can_connect or (lambda: True)
        self._ws: Any = None
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._destroyed = False
        self._reconnect_delay = INITIAL_RECONNECT_DELAY_MS
        self._connected_at = 0.0
        self._last_activity_at = 0.0
        self._state = "closed"
        self._heartbeat_task: asyncio.Task[None] | None = None

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    def mark_destroyed(self) -> None:
        self._destroyed = True
        self._stop.set()
        if self._task is not None and not self._task.done():
            self._task.cancel()
        self._task = None

    async def connect(self) -> None:
        """建立连接（幂等）；若已销毁或 can_connect() 为假则跳过。"""
        if self._destroyed or not self._can_connect():
            return
        if self._task is not None and not self._task.done():
            return
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(self._run_forever(), name="wolfx-ws")

    async def disconnect(self) -> None:
        """主动断开连接（不标记销毁，可再次 connect）。"""
        self._stop.set()
        if self._task is not None and not self._task.done():
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
        self._task = None
        await self._close_ws()

    async def _run_forever(self) -> None:
        while not self._stop.is_set() and not self._destroyed and self._can_connect():
            try:
                await self._connect_once()
                self._reconnect_delay = INITIAL_RECONNECT_DELAY_MS
                await self._read_loop()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Wolfx WebSocket 连接异常: %s", exc)
            finally:
                self._state = "closed"
                await self._stop_heartbeat()
                await self._close_ws()
            if self._stop.is_set() or self._destroyed or not self._can_connect():
                break
            delay = self._reconnect_delay
            logger.warning("%ss 后重连 Wolfx...", delay / 1000)
            self._reconnect_delay = min(self._reconnect_delay * 2, MAX_RECONNECT_DELAY_MS)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=delay / 1000)
                break
            except TimeoutError:
                continue

    async def _connect_once(self) -> None:
        if websockets is None:  # pragma: no cover
            raise RuntimeError("websockets 依赖缺失")
        logger.info("正在连接 Wolfx EEW WebSocket:%s", WOLFX_WS_URL)
        self._state = "connecting"
        # ``proxy=None``：同 HaWsClient —— 显式禁用代理，否则 websockets 会经
        # ``urllib.request.getproxies()`` 读取到的 macOS 系统 SOCKS 代理连接，
        # 缺少 python-socks 时直接抛 ImportError 导致无限重连。
        self._ws = await websockets.connect(
            WOLFX_WS_URL, ping_interval=None, proxy=None
        )
        self._state = "open"
        self._connected_at = _now_ms()
        self._last_activity_at = self._connected_at
        logger.info("🔗 Wolfx EEW WebSocket 已连接")
        await self._heartbeat_loop_task()

    async def _heartbeat_loop_task(self) -> None:
        await self._touch()
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop(), name="wolfx-heartbeat")

    async def _heartbeat_loop(self) -> None:
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=HEARTBEAT_INTERVAL_SEC)
                return
            except TimeoutError:
                pass
            try:
                if self._ws is not None:
                    await self._ws.send("ping")
                    await self._touch()
            except Exception as exc:
                logger.warning("心跳发送失败:%s", exc)

    async def _stop_heartbeat(self) -> None:
        if self._heartbeat_task is not None and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._heartbeat_task
        self._heartbeat_task = None

    async def _read_loop(self) -> None:
        while not self._stop.is_set() and self._ws is not None:
            raw = await self._ws.recv()
            self._last_activity_at = _now_ms()
            text = raw.decode("utf-8", "ignore") if isinstance(raw, bytes) else str(raw)
            text = text.strip()
            if not text or text == "pong":
                continue
            try:
                msg = json.loads(text)
            except (ValueError, TypeError):
                logger.error("解析 Wolfx 消息失败:%s", text[:200])
                continue
            if isinstance(msg, dict):
                result = self._on_message(msg)
                if inspect.isawaitable(result):
                    await result

    async def _close_ws(self) -> None:
        ws, self._ws = self._ws, None
        if ws is None:
            return
        with contextlib.suppress(Exception):
            await ws.close()
        self._state = "closed"

    async def _touch(self) -> None:
        if self._touch_leader_active is None:
            return
        try:
            result = self._touch_leader_active()
            if inspect.isawaitable(result):
                await result
        except Exception as exc:
            logger.debug("刷新主节点活跃标记失败: %s", exc)

    # ------------------------------------------------------------------ #
    # 状态
    # ------------------------------------------------------------------ #
    def is_connected(self) -> bool:
        return self._ws is not None and self._state == "open"

    async def send_ping(self) -> None:
        if self._ws is not None:
            with contextlib.suppress(Exception):
                await self._ws.send("ping")

    def get_connection_status(self) -> dict[str, Any]:
        state = self._state
        labels = {"connecting": "connecting", "open": "open", "closing": "closing", "closed": "closed"}
        return {
            "connected": self.is_connected(),
            "readyState": {"connecting": 0, "open": 1, "closing": 2, "closed": 3}.get(state, 3),
            "state": labels.get(state, "unknown"),
            "connectedAt": self._connected_at or None,
            "lastActivityAt": self._last_activity_at or None,
            "reconnectDelayMs": self._reconnect_delay if state != "open" else 0,
        }


__all__ = ["WOLFX_WS_URL", "WolfxWsClient"]
