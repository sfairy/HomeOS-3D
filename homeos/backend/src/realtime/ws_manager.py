"""Socket.IO 广播管理器（B19）：去掉每收件人 task，改为单 task 内顺序投递。

python-socketio 默认的 ``AsyncManager.emit`` 在无 callback 时也会为**每个收件人**
创建 ``asyncio.Task``，再用 ``asyncio.wait`` 收集。房间越大、广播越频繁，task
创建/调度/异常聚合的成本越接近真实写入成本；而每收件人的写入本身只是
``engineio.AsyncSocket.send`` 的一次 ``queue.put``，不需要独立 task。

本管理器保持与默认实现相同的线协议语义：
- 载荷只序列化一次，同房间共享；
- 收件人顺序与 ``get_participants`` 一致；
- 单个收件人发送失败只记录并跳过，不影响同轮其它收件人；
- 带 callback 的 emit 仍走父类（每个客户端需要唯一 ack id）。

engineio 的写队列本身仍无界；应用层由 ``RealtimeGateway`` 的背压阈值控制状态
广播，不在库层做会破坏协议语义的丢包。
"""

from __future__ import annotations

import os
from typing import Any

from engineio import packet as eio_packet
from socketio import packet
from socketio.async_manager import AsyncManager

WS_MANAGER_MODE_ENV = "HOMEOS_WS_MANAGER"


def resolve_ws_manager_mode() -> str:
    """返回 ``custom``（默认）或 ``builtin``；``builtin`` 用于快速回滚。"""
    raw = os.getenv(WS_MANAGER_MODE_ENV, "").strip().lower()
    return "builtin" if raw in {"builtin", "default"} else "custom"


class HomeOSAsyncManager(AsyncManager):
    """单 task 顺序投递的 Socket.IO 管理器。"""

    async def emit(
        self,
        event: str,
        data: Any = None,
        namespace: str | None = None,
        room: str | list[str] | None = None,
        skip_sid: str | list[str] | None = None,
        callback: Any = None,
        to: str | list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        if callback:
            await self._emit_with_callback(event, data, namespace, room, skip_sid, callback, to, **kwargs)
            return

        room = to or room
        if namespace not in self.rooms:
            return
        eio_packets = self._encode_event(event, data, namespace)
        await self._send_to_participants(namespace, room, skip_sid, eio_packets)

    async def _emit_with_callback(
        self,
        event: str,
        data: Any,
        namespace: str | None,
        room: str | list[str] | None,
        skip_sid: str | list[str] | None,
        callback: Any,
        to: str | list[str] | None,
        **kwargs: Any,
    ) -> None:
        # callback 需要为每个收件人生成唯一 ack id，不能共享同一份编码载荷。
        await super().emit(
            event,
            data,
            namespace,
            room=room,
            skip_sid=skip_sid,
            callback=callback,
            to=to,
            **kwargs,
        )

    def _encode_event(self, event: str, data: Any, namespace: str | None) -> list[eio_packet.Packet]:
        """按 socket.io 语义把 data 归一化后只编码一次。"""
        if isinstance(data, tuple):
            payloads = list(data)
        elif data is not None:
            payloads = [data]
        else:
            payloads = []
        encoded_packet = self.server.packet_class(packet.EVENT, namespace=namespace, data=[event, *payloads]).encode()
        if not isinstance(encoded_packet, list):
            encoded_packet = [encoded_packet]
        return [eio_packet.Packet(eio_packet.MESSAGE, payload) for payload in encoded_packet]

    async def _send_to_participants(
        self,
        namespace: str | None,
        room: str | list[str] | None,
        skip_sid: str | list[str] | None,
        eio_packets: list[eio_packet.Packet],
    ) -> None:
        skipped = skip_sid if isinstance(skip_sid, list) else [skip_sid]
        for sid, eio_sid in self.get_participants(namespace, room):
            if sid in skipped:
                continue
            for eio_pkt in eio_packets:
                await self._send_one(eio_sid, eio_pkt)

    async def _send_one(self, eio_sid: str, eio_pkt: eio_packet.Packet) -> None:
        try:
            await self.server._send_eio_packet(eio_sid, eio_pkt)
        except Exception as exc:  # 单个收件人失败不能中断整轮广播
            logger = getattr(self.server, "logger", None)
            if logger is not None:
                logger.warning("Socket.IO 发送失败 eio_sid=%s: %s", eio_sid, exc)
