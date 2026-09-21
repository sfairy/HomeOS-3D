"""静态资源 / 图片响应的 ``Cache-Control`` 口径。

同一条判据散在多处时最容易漂移：漏了 ``private`` 会让共享缓存存下需要鉴权的图片，
漏了 ``immutable`` 又会让带版本戳的模型每次都被重新校验。这里把每种口径各收成一条
常量（或一个 setter），调用方只表达「这是哪一类资源」，不再手写字符串。

各口径之间**只差一个词**，所以必须在这里集中维护：
- ``private`` / ``public``：私有（需鉴权）还是公开（只含设计系统字面量）；
- ``immutable``：URL 自带内容版本时才能用 —— 内容一变 URL 就变，浏览器才敢长期留；
- ``no-store, no-cache, must-revalidate``：连老中间层也要挡住，用于入口页面。
"""
from __future__ import annotations

from starlette.responses import Response

#: 一年期强缓存：只给 URL 自带内容版本（``?v=``）、内容一变 URL 就变的私有资源。
PRIVATE_IMMUTABLE_CACHE = 'private, max-age=31536000, immutable'
#: 十分钟期强缓存：同样要求 URL 自带版本，但内容是 HA 侧实时图片（实体状态图 / 摄像头快照）。
PRIVATE_BRIEF_IMMUTABLE_CACHE = 'private, max-age=600, immutable'
#: 每次校验：没有内容版本时不能让浏览器长期留下旧图。
PRIVATE_NO_CACHE = 'private, no-cache'
#: 完全不缓存：响应用户当场状态或含鉴权信息。
NO_STORE = 'no-store'
#: 不缓存但标明私有：HA 代理下发的实时快照（共享缓存尤其不能留）。
PRIVATE_NO_STORE = 'private, no-store'
#: 完全不缓存 + 老中间层兼容头，入口页面（HTML/JS）用：只写 ``no-store`` 挡不住
#: 只认 ``Pragma`` / ``Expires`` 的老代理，而入口页留旧版本 = 前端资源戳全对不上。
NO_STORE_WITH_REVALIDATION = 'no-store, no-cache, must-revalidate, max-age=0'
#: 公开一年期强缓存：内容随 URL 变化，且不含任何鉴权信息（如展开后的配色样式表）。
PUBLIC_IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'


def set_private_immutable_cache(response: Response) -> None:
    """给响应打上一期强缓存（调用方必须保证 URL 已带内容版本）。"""
    response.headers['Cache-Control'] = PRIVATE_IMMUTABLE_CACHE


def set_versioned_private_cache(response: Response, has_version: bool) -> None:
    """有内容版本才强缓存，否则要求每次校验。"""
    response.headers['Cache-Control'] = (
        PRIVATE_IMMUTABLE_CACHE if has_version else PRIVATE_NO_CACHE
    )


def set_no_store(response: Response) -> None:
    """给响应打上「完全不缓存」。

    传 ``Response`` 对象来打头而不是让调用方写 ``headers={...}``：多处调用点里有用
    ``FileResponse`` / ``JSONResponse`` 的，混着用两种写法最容易漏掉其中一处。
    """
    response.headers['Cache-Control'] = NO_STORE


def set_no_store_with_revalidation(response: Response) -> None:
    """入口页面专用：完全不缓存，并补上老中间层才看的 ``Pragma`` / ``Expires``。"""
    response.headers['Cache-Control'] = NO_STORE_WITH_REVALIDATION
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'


def set_public_immutable_cache(response: Response) -> None:
    """公开资源的一期强缓存（调用方必须保证 URL 已带内容版本）。"""
    response.headers['Cache-Control'] = PUBLIC_IMMUTABLE_CACHE
