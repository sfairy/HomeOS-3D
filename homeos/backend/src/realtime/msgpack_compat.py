"""socket.io-msgpack-parser(notepack) 兼容：把 ExtType code 0 还原为原始 bytes。

Phase 0 spike 已证实：JS 侧 ``socket.io-msgpack-parser`` 将 ``Uint8Array`` 编码为 msgpack
扩展类型 0；python-socketio 的 msgpack 解析器默认会得到 ``ExtType(0, data)``，需在
``ext_hook`` 中解码为 ``bytes``，否则前端的二进制负载会以 ExtType 形式泄漏到业务层。

另外修补 python-engineio ``Packet.encode`` 的 ``encode_cache``：缓存未区分
``b64``，msgpack 二进制包若先按 WebSocket（``b64=False`` → ``bytes``）编码，
随后 polling 路径 ``Payload.encode`` 再以 ``b64=True`` 复用缓存，会触发
``TypeError: can only concatenate str (not "bytes") to str``（见 engineio/payload.py）。
上游 main 仍保留该缓存语义（4.14.0），故在网关启动时本地打补丁。
"""

from __future__ import annotations

import msgpack
from socketio import msgpack_packet

_ORIGINAL_HOOK = msgpack_packet.MsgPackPacket.ext_hook


def _ext_hook(code: int, data: bytes):
    if code == 0:
        return data
    return msgpack.ExtType(code, data)


_INSTALLED = False
_ENCODE_CACHE_PATCHED = False


def _install_engineio_b64_encode_cache_fix() -> None:
    """让 Packet.encode 的缓存按 b64 模式区分，避免 bytes/str 混入 Payload.encode。"""
    global _ENCODE_CACHE_PATCHED
    if _ENCODE_CACHE_PATCHED:
        return
    from engineio.packet import Packet

    original_encode = Packet.encode

    def encode(self, b64=False):  # type: ignore[no-untyped-def]
        cached = self.encode_cache
        if cached is not None:
            # polling（b64=True）需要 str；websocket 二进制（b64=False）需要 bytes。
            if b64 and isinstance(cached, (bytes, bytearray)):
                self.encode_cache = None
            elif (not b64) and getattr(self, "binary", False) and isinstance(cached, str):
                self.encode_cache = None
        return original_encode(self, b64=b64)

    Packet.encode = encode  # type: ignore[method-assign]
    _ENCODE_CACHE_PATCHED = True


def install_msgpack_ext_hook() -> None:
    """幂等安装 ext_hook 与 engineio 编码缓存补丁（重复调用无副作用）。"""
    global _INSTALLED
    _install_engineio_b64_encode_cache_fix()
    if _INSTALLED:
        return
    msgpack_packet.MsgPackPacket.ext_hook = _ext_hook
    _INSTALLED = True
