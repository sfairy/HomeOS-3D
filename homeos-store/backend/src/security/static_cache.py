"""静态 / 素材响应的缓存头（商店侧）。

商店侧不再使用 ``?v=`` 版本戳：``/store-static/**``、``/fonts/**``、``/store-appearance.css``
与 ``/store/v1/product-images/**`` 这类**稳定 URL** 统一下发 ``Cache-Control: no-cache``，
由响应上的 ETag / Last-Modified 回源校验，命中条件请求即 304。

``StaticFiles`` 自己协商 ``If-None-Match`` / ``If-Modified-Since`` 并回 304；``FileResponse``
（商品图）与 ``/store-appearance.css`` 走普通路由，缺这一步协商，由本中间件补齐。
"""
from __future__ import annotations

from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

#: 走「no-cache + ETag 回源校验」的稳定 URL 前缀。
STATIC_ASSET_PREFIXES = ('/store-static/', '/fonts/', '/store/v1/product-images/')

#: 精确路径（无前缀语义）的稳定 URL。
STATIC_ASSET_PATHS = frozenset({'/store-appearance.css'})


def is_static_asset_path(path: str) -> bool:
    """是否为「no-cache + 回源校验」的稳定静态 / 素材 URL。"""
    return path in STATIC_ASSET_PATHS or path.startswith(STATIC_ASSET_PREFIXES)


def _etag_matches(request: Request, response: Response) -> bool:
    """GET/HEAD 条件请求的校验器是否命中此可缓存响应。"""
    if request.method not in {'GET', 'HEAD'} or response.status_code != 200:
        return False
    etag = response.headers.get('etag')
    requested = request.headers.get('if-none-match')
    if not etag or not requested:
        return False
    normalized = etag.removeprefix('W/')
    return any(
        value == '*' or value.removeprefix('W/') == normalized
        for value in (part.strip() for part in requested.split(','))
    )


class StaticAssetCacheMiddleware:
    """给稳定 URL 的静态 / 素材响应补 ``no-cache``，并把命中的条件请求转成 304。"""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        request = Request(scope, receive)
        if not is_static_asset_path(request.url.path):
            await self.app(scope, receive, send)
            return

        suppress_body = False

        async def send_wrapper(message: Message) -> None:
            nonlocal suppress_body
            if message['type'] == 'http.response.start':
                response = Response(status_code=int(message['status']))
                response.raw_headers = list(message.get('headers') or [])
                if response.status_code in {200, 304}:
                    response.headers.setdefault('Cache-Control', 'no-cache')
                if _etag_matches(request, response) and response.headers.get(
                    'cache-control', ''
                ).startswith('no-cache'):
                    headers = {
                        key: value
                        for key, value in response.headers.items()
                        if key.lower() not in {'content-length', 'content-type', 'content-encoding'}
                    }
                    not_modified = Response(status_code=304, headers=headers)
                    await send(
                        {
                            'type': 'http.response.start',
                            'status': 304,
                            'headers': not_modified.raw_headers,
                        }
                    )
                    await send({'type': 'http.response.body', 'body': b'', 'more_body': False})
                    suppress_body = True
                    return
                await send(
                    {
                        'type': 'http.response.start',
                        'status': response.status_code,
                        'headers': response.raw_headers,
                    }
                )
                return
            if suppress_body:
                return
            await send(message)

        await self.app(scope, receive, send_wrapper)


__all__ = [
    'STATIC_ASSET_PATHS',
    'STATIC_ASSET_PREFIXES',
    'StaticAssetCacheMiddleware',
    'is_static_asset_path',
]
