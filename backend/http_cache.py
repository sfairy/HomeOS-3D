"""静态资源 / 图片响应的 ``Cache-Control`` 口径。

同一条判据散在多处时最容易漂移：漏了 ``private`` 会让共享缓存存下需要鉴权的图片，
漏了 ``immutable`` 又会让带版本戳的模型每次都被重新校验。这里把两种口径各收成一
条，调用方只表达「这是不是带内容版本的可长缓存资源」。
"""
from __future__ import annotations

from starlette.responses import Response

#: 一年期强缓存：只给 URL 自带内容版本（``?v=``）、内容一变 URL 就变的资源。
PRIVATE_IMMUTABLE_CACHE = 'private, max-age=31536000, immutable'
#: 每次校验：没有内容版本时不能让浏览器长期留下旧图。
PRIVATE_NO_CACHE = 'private, no-cache'


def set_private_immutable_cache(response: Response) -> None:
    """给响应打上一期强缓存（调用方必须保证 URL 已带内容版本）。"""
    response.headers['Cache-Control'] = PRIVATE_IMMUTABLE_CACHE


def set_versioned_private_cache(response: Response, has_version: bool) -> None:
    """有内容版本才强缓存，否则要求每次校验。"""
    response.headers['Cache-Control'] = (
        PRIVATE_IMMUTABLE_CACHE if has_version else PRIVATE_NO_CACHE
    )
