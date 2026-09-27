"""响应压缩（商店侧）：只压「文本类 + 体积够大」的响应。

商店是**公网直连**的服务，而它每次打开后台都要下发 ``jquery.min.js``（86 KB）与几份
上百 KB 的样式表；控制台的 JSON 列表动辄几十 KB。这些内容 gzip 之后只剩约四分之一。
（生产部署通常在商店前面还有一层反代，那一层也开了压缩；但 ``docker-compose`` 直连 18082、
或 ``ops/start.py`` 本地联调的路径上没有反代，压缩只能由应用自己做。）

**为什么是这一份而不是复用主应用那份**：商店与主应用是两个独立部署的项目，各自只
``import`` 自己的包（见 ``apps/store/core/static_revision.py` 的同款说明与主 README）。本文件与
``apps/store/security/body_guard.py` 是同一类做法：概念共享、实现各留一份。口径也必须按商店裁剪 ——
主应用那份要为 HA 代理的五条流式透传通路让路，商店根本没有那类路由。

口径三条，缺一不可：

1. 请求的 ``accept-encoding`` 里有 gzip（不看 q 值：浏览器实际不会发 ``gzip;q=0``）；
2. 响应**没有** content-encoding，content-type 在下面的白名单里；
3. ``content-length``` 已知且小于 ``MINIMUM_SIZE`` 时跳过 —— 几十字节压完往往更大。

再加一条 HEAD 跳过：它不带实体，压它只会让响应头与实体对不上。

实现是**纯 ASGI 中间件**：``BaseHTTPMiddleware``` 会把响应整份读进内存，而商店有支付宝
回调这类需要及时回 ``success`` 的端点，不该为了压缩多一层缓冲。
"""
from __future__ import annotations

import zlib
from collections.abc import Sequence

#: 值得压的响应类型前缀。只列文本类：图片 / 字体（woff2 本就是压缩格式）压了只会更慢。
COMPRESSIBLE_CONTENT_TYPES: tuple[str, ...] = (
    'application/javascript',
    'application/json',
    'application/manifest+json',
    'application/xml',
    'image/svg+xml',
    'text/',
)

#: 小于它不压：压完更大，而且要把 Content-Length 换成 chunked 编码。
MINIMUM_SIZE = 1024

#: 压缩级别。取 6 而不是 9：这一档是 CPU 与体积的拐点。
_COMPRESSION_LEVEL = 6

#: 15 位窗口 + 16 表示「gzip 容器」，与 gzip(1) 的默认口径一致，兼容性最好。
_GZIP_WBITS = 16 + zlib.MAX_WBITS

_HEADER_CONTENT_ENCODING = b'content-encoding'
_HEADER_CONTENT_LENGTH = b'content-length'
_HEADER_CONTENT_TYPE = b'content-type'
_HEADER_VARY = b'vary'


def accepts_gzip(scope) -> bool:
    """请求是否接受 gzip。"""
    for name, value in scope.get('headers') or ():
        if name == b'accept-encoding':
            return b'gzip' in value.lower()
    return False


def _header(headers: Sequence[tuple[bytes, bytes]], name: bytes) -> bytes | None:
    for key, value in headers:
        if key.lower() == name:
            return value
    return None


def _is_compressible_type(headers: Sequence[tuple[bytes, bytes]], allowed: Sequence[str]) -> bool:
    raw = _header(headers, _HEADER_CONTENT_TYPE)
    if not raw:
        # 没有类型就无法判断「压它安不安全」：宁可明文下发，也不要压一份二进制。
        return False
    content_type = raw.decode('latin-1').split(';')[0].strip().lower()
    return any(content_type.startswith(prefix) for prefix in allowed)


def _content_length(headers: Sequence[tuple[bytes, bytes]]) -> int | None:
    raw = _header(headers, _HEADER_CONTENT_LENGTH)
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _rewrite_start_headers(headers: Sequence[tuple[bytes, bytes]]) -> list[tuple[bytes, bytes]]:
    """把响应头改成「已压缩」的形态。

    删掉 content-length：压缩后长度变了，留着它客户端会当成截断。补 vary：同一份 URL 对不同
    accept-encoding 的客户端内容不同，共享缓存必须按它分桶，否则会把 gzip 那份喂给不支持 gzip 的客户端。
    """
    rewritten = [
        (key, value)
        for key, value in headers
        if key.lower() not in {_HEADER_CONTENT_LENGTH, _HEADER_CONTENT_ENCODING, _HEADER_VARY}
    ]
    rewritten.append((_HEADER_CONTENT_ENCODING, b'gzip'))
    rewritten.append((_HEADER_VARY, b'Accept-Encoding'))
    return rewritten


class _GZipSend:
    """包住 ``send``：在响应头落地的那一刻决定压不压，之后逐块压。"""

    def __init__(self, send, allowed_types: Sequence[str], minimum_size: int):
        self._send = send
        self._allowed_types = allowed_types
        self._minimum_size = minimum_size
        # 压缩器只在「决定压」的那一刻建；为 None 表示这份响应原样放行。
        self._compressor = None
        self._passthrough = False

    async def __call__(self, message) -> None:
        message_type = message['type']
        if message_type == 'http.response.start':
            headers = message.get('headers') or []
            length = _content_length(headers)
            too_small = length is not None and length < self._minimum_size
            if (
                too_small
                or _header(headers, _HEADER_CONTENT_ENCODING) is not None
                or not _is_compressible_type(headers, self._allowed_types)
            ):
                self._passthrough = True
            else:
                self._compressor = zlib.compressobj(_COMPRESSION_LEVEL, zlib.DEFLATED, _GZIP_WBITS)
                message = {**message, 'headers': _rewrite_start_headers(headers)}
            await self._send(message)
            return

        if message_type != 'http.response.body' or self._passthrough or self._compressor is None:
            await self._send(message)
            return

        body = message.get('body') or b''
        more_body = bool(message.get('more_body'))
        # 压不满一个块时 zlib 会自己攒着，这里不必再包一层缓冲。
        payload = self._compressor.compress(body)
        if not more_body:
            payload += self._compressor.flush()
        await self._send({'type': 'http.response.body', 'body': payload, 'more_body': more_body})


class SelectiveGZipMiddleware:
    """按 allowlist 压缩响应的纯 ASGI 中间件（口径见模块头）。"""

    def __init__(
        self,
        app,
        *,
        allowed_types: Sequence[str] = COMPRESSIBLE_CONTENT_TYPES,
        minimum_size: int = MINIMUM_SIZE,
    ) -> None:
        self.app = app
        self.allowed_types = tuple(allowed_types)
        self.minimum_size = minimum_size

    async def __call__(self, scope, receive, send) -> None:
        # WebSocket / lifespan 没有响应实体可言，原样放行。
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        if scope.get('method') == 'HEAD':
            await self.app(scope, receive, send)
            return
        if not accepts_gzip(scope):
            await self.app(scope, receive, send)
            return
        await self.app(scope, receive, _GZipSend(send, self.allowed_types, self.minimum_size))
