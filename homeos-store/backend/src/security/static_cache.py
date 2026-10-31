"""静态 / 素材响应的缓存头（商店侧）。

商店侧不再使用 ``?v=`` 版本戳：``/store-static/**``、``/fonts/**``、``/store-appearance.css``
与 ``/store/v1/product-images/**`` 这类**稳定 URL** 统一下发 ``Cache-Control: no-cache``，
由响应上的 ETag / Last-Modified 回源校验，命中条件请求即 304。

``/store-static/assets/`` 下带内容哈希的 Vite 产物例外：内容变化必然换文件名，
因此下发 ``public, max-age=31536000, immutable``，重复访问不再回源。

``StaticFiles`` 自己协商 ``If-None-Match`` / ``If-Modified-Since`` 并回 304；``FileResponse``
（商品图）与 ``/store-appearance.css`` 走普通路由，缺这一步协商，由本中间件补齐。
"""
from __future__ import annotations

import re

from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from homeos_shared.http_cache import etag_matches

#: 走「no-cache + ETag 回源校验」的稳定 URL 前缀。
STATIC_ASSET_PREFIXES = ('/store-static/', '/fonts/', '/store/v1/product-images/')

#: 精确路径（无前缀语义）的稳定 URL。
STATIC_ASSET_PATHS = frozenset({'/store-appearance.css'})

#: Vite 产物目录：文件名带内容哈希，内容变化必然换名，可安全长缓存。
IMMUTABLE_ASSET_PREFIX = '/store-static/assets/'
IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
_HASHED_ASSET_NAME = re.compile(r'-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$')


def is_static_asset_path(path: str) -> bool:
    """是否为「no-cache + 回源校验」的稳定静态 / 素材 URL。"""
    return path in STATIC_ASSET_PATHS or path.startswith(STATIC_ASSET_PREFIXES)


def is_immutable_asset_path(path: str) -> bool:
    """是否为可长缓存的 Vite 内容哈希产物（仅 ``/store-static/assets/`` 下的哈希文件名）。"""
    if not path.startswith(IMMUTABLE_ASSET_PREFIX):
        return False
    name = path.rsplit('/', 1)[-1]
    return bool(_HASHED_ASSET_NAME.search(name))


def _etag_matches(request: Request, response: Response) -> bool:
    """GET/HEAD 条件请求的校验器是否命中此可缓存响应（实现见 ``homeos_shared.http_cache``）。"""
    return etag_matches(request, response)

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

        immutable = is_immutable_asset_path(request.url.path)
        cache_control = IMMUTABLE_CACHE_CONTROL if immutable else 'no-cache'
        suppress_body = False

        async def send_wrapper(message: Message) -> None:
            nonlocal suppress_body
            if message['type'] == 'http.response.start':
                response = Response(status_code=int(message['status']))
                response.raw_headers = list(message.get('headers') or [])
                if response.status_code in {200, 304}:
                    response.headers.setdefault('Cache-Control', cache_control)
                response_cache_control = response.headers.get('cache-control', '')
                if _etag_matches(request, response) and (
                    response_cache_control.startswith('no-cache')
                    or 'immutable' in response_cache_control
                ):
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
    'IMMUTABLE_ASSET_PREFIX',
    'IMMUTABLE_CACHE_CONTROL',
    'STATIC_ASSET_PATHS',
    'STATIC_ASSET_PREFIXES',
    'StaticAssetCacheMiddleware',
    'is_immutable_asset_path',
    'is_static_asset_path',
]
