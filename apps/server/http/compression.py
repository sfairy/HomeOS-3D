"""窄口径的响应压缩：只压「文本类 + 体积够大 + 不是流式透传」的响应。

**为什么不用 Starlette 自带的 ``GZipMiddleware``**：它只判断「响应头里有没有 content-encoding」，
其余一律压。而本应用有一整类**必须原样透传**的响应 —— ``apps/server/api/ha_proxy.py`` 那五条代理
路由（``/api/camera_hls/``、``/api/camera_proxy/``、``/api/camera_proxy_stream/``、
``/api/image_proxy/``、``/api/media_player_proxy/``、``/api/hls/``）刻意**删掉**上游的
content-encoding、按已解码字节逐块下发（见该文件 RESPONSE_HEADERS_TO_DROP 与 pass_through_body
的说明）。对它们再压一次不只是白烧 CPU：摄像头分片与 MJPEG 流本来就不该被重新编码，而且
「按字节透传」会变成「按块压缩」，客户端拿到的分块边界不再是上游那一份。

于是口径收成三条，缺一不可：

1. 请求的 ``accept-encoding`` 里有 gzip（不看 q 值：浏览器实际不会发 ``gzip;q=0``，
   为它加一条分支只会让这个文件更难读）；
2. 响应**没有** content-encoding（已经有就不重复压），content-type 在下面的白名单里；
3. 请求路径**不在** ``BYPASS_PATH_PREFIXES`` 里 —— 这一条在响应头生成之前就能判定，
   因此流式透传的通路根本不会走到压缩逻辑里。

再加两道闸门：``content-length``` 已知且小于 ``MINIMUM_SIZE`` 时直接跳过（几十字节压完往往
更大，还白白把 Content-Length 换成 chunked），以及 HEAD 请求一律跳过（它不带实体，压它只会让
响应头与实体对不上）。

实现是**纯 ASGI 中间件**而不是 ``BaseHTTPMiddleware``：后者会把流式响应整份读进内存，
而 ``/api/hls/`` 这类无限流一旦走到那条路径就会把内存吃光。这里逐块压、逐块发，
任何时刻只持有一个 chunk。
"""
from __future__ import annotations

import zlib
from collections.abc import Sequence

#: 值得压的响应类型前缀。只列文本类：图片 / 视频 / 字体（woff2 本就是压缩格式）压了只会更慢。
COMPRESSIBLE_CONTENT_TYPES: tuple[str, ...] = (
    'application/javascript',
    'application/json',
    'application/manifest+json',
    'application/xml',
    'image/svg+xml',
    'text/',
)

#: 不参与压缩的请求路径前缀：HA 代理的媒体透传通路（见模块头说明）。
BYPASS_PATH_PREFIXES: tuple[str, ...] = (
    '/api/camera_hls/',
    '/api/camera_proxy/',
    '/api/camera_proxy_stream/',
    '/api/image_proxy/',
    '/api/media_player_proxy/',
    '/api/hls/',
)

#: 小于它不压：压完更大，而且要把 Content-Length 换成 chunked 编码。
MINIMUM_SIZE = 1024

#: 压缩级别。取 6 而不是 9：这一档是 CPU 与体积的拐点，9 级对首屏那几份大文件
#: 多花的 CPU 换来的体积收益不到 1%。
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

    删掉 content-length：压缩后长度变了，留着它会比实际字节数大，客户端读到「少了一段」
    会当成截断。补 vary：同一份 URL 对不同 accept-encoding 的客户端内容不同，共享缓存必须
    按它分桶，否则会把 gzip 的那一份喂给不支持 gzip 的客户端。
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
        bypass_prefixes: Sequence[str] = BYPASS_PATH_PREFIXES,
        minimum_size: int = MINIMUM_SIZE,
    ) -> None:
        self.app = app
        self.allowed_types = tuple(allowed_types)
        self.bypass_prefixes = tuple(bypass_prefixes)
        self.minimum_size = minimum_size

    async def __call__(self, scope, receive, send) -> None:
        # WebSocket / lifespan 没有响应实体可言，原样放行。
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        if scope.get('method') == 'HEAD':
            await self.app(scope, receive, send)
            return
        if scope['path'].startswith(self.bypass_prefixes):
            await self.app(scope, receive, send)
            return
        if not accepts_gzip(scope):
            await self.app(scope, receive, send)
            return
        await self.app(scope, receive, _GZipSend(send, self.allowed_types, self.minimum_size))
