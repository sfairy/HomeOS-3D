"""socket.io-msgpack-parser(notepack) 兼容：把 ExtType code 0 还原为原始 bytes。

Phase 0 spike 已证实：JS 侧 ``socket.io-msgpack-parser`` 将 ``Uint8Array`` 编码为 msgpack
扩展类型 0；python-socketio 的 msgpack 解析器默认会得到 ``ExtType(0, data)``，需在
``ext_hook`` 中解码为 ``bytes``，否则前端的二进制负载会以 ExtType 形式泄漏到业务层。
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


def install_msgpack_ext_hook() -> None:
    """幂等安装 ext_hook（重复调用无副作用）。"""
    global _INSTALLED
    if _INSTALLED:
        return
    msgpack_packet.MsgPackPacket.ext_hook = _ext_hook
    _INSTALLED = True
