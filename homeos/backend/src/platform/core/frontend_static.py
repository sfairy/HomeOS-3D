"""前端产物的挂载点清单（静态资源路径的**唯一真源**）。

这份常量存在的理由是一次真实的死锁事故：授权门禁（``domains/license/guard.py``）按
「哪些路径未激活也必须能加载」维护了一份豁免名单，而挂载点清单在 ``bootstrap/spa_static.py``
里另写了一份 —— 两边一旦不一致，未激活的生产实例就会白屏：外壳能下发，但它引用的
``/static/assets/**``（哈希 chunk）被门禁挡成 401（响应体是 JSON，于是 CSS 还会额外报
``MIME type ('application/json') is not a supported stylesheet``），而**激活页自身也是用这些
产物渲染的** —— 用户永远走不到激活那一步。

所以把清单放在平台层（``bootstrap`` 与 ``domains`` 都能 import，且都不反向依赖对方）：
挂载时用它、豁免时也用它，两边不可能再分叉。往后新增挂载点只需在这里加一条。

注意语义边界：这份豁免只对**授权门禁**生效。真正的访问控制是登录门禁
（``bootstrap/studio_shell.py`` 的 ``ProtectAssetsMiddleware``，按构建产物白名单拦
``/static/**`` 并拦下 ``/assets/builtin/**``），两层职责不同，不要合并。
"""

from __future__ import annotations

import re
from pathlib import PurePosixPath

#: 由 ``spa_static._mount_frontend_build_dirs`` 挂载的 vite 构建产物目录。
#: 哈希 chunk 与 public 静态资源同处 ``/static`` 下（``static/assets/**``），与商店同构。
STATIC_MOUNT_PREFIX = "/static"
MODULES_MOUNT_PREFIX = "/modules"

#: 内置 3D 素材的**路由**前缀（``api/assets.py`` 的 ``/assets/builtin/{path}``）。
#: 它不再是产物挂载点 —— 根级 ``dist/<项目>/frontend/assets`` 已随 chunk 迁入
#: ``static/assets`` 而消失，``/assets`` 下只剩这一条 API 路由。
#: 仍留在下面的豁免元组里：未激活 / 未登录时展示页的 3D 场景也要能取内置素材。
ASSETS_MOUNT_PREFIX = "/assets"

#: 由 ``spa_static._mount_replaceable_asset_dirs`` 挂载 / 登记的可替换素材目录
#: （图标 / 背景图 / 音效 / Logo；用户上传的版本优先于随包默认素材）。
ICONS_MOUNT_PREFIX = "/icons"
BACKGROUNDS_MOUNT_PREFIX = "/backgrounds"
SOUNDS_MOUNT_PREFIX = "/sounds"
LOGO_MOUNT_PREFIX = "/logo"

#: 全部静态挂载前缀（授权门禁据此整体豁免，见模块 docstring）。
#: 注意 ``/assets`` 一项现在只覆盖内置素材路由，真正的产物挂载点只有 ``/static``
#: 与 ``/modules`` —— 哈希 chunk 已并入 ``/static/assets/**``。
FRONTEND_STATIC_MOUNT_PREFIXES = (
    STATIC_MOUNT_PREFIX,
    ASSETS_MOUNT_PREFIX,
    MODULES_MOUNT_PREFIX,
    ICONS_MOUNT_PREFIX,
    BACKGROUNDS_MOUNT_PREFIX,
    SOUNDS_MOUNT_PREFIX,
    LOGO_MOUNT_PREFIX,
)

#: 位于根路径、不属于任何挂载目录的前端产物。
MANIFEST_PATH = "/manifest.json"
SERVICE_WORKER_PATH = "/sw.js"
FAVICON_PATH = "/favicon.ico"
APPLE_TOUCH_ICON_PATHS = ("/apple-touch-icon.png", "/apple-touch-icon-precomposed.png")

FRONTEND_STATIC_ROOT_FILES = frozenset(
    (MANIFEST_PATH, SERVICE_WORKER_PATH, FAVICON_PATH, *APPLE_TOUCH_ICON_PATHS)
)

#: 前端产物后缀。用途有二，但语义同一个「这串地址是产物、不是页面路由」：
#: ① SPA catch-all 见到这些后缀必须 404，绝不能回 ``index.html``（否则模块拿到 HTML
#:    会以 ``Strict MIME`` 报错）；
#: ② 授权门禁万一拦下这类路径，说明必然白屏，要单独告警（见 ``bootstrap/middleware.py``）。
#: 三个调用点共用这一份，避免各自维护后漂移 —— 本模块顶部的注释说的就是这类漂移事故。
FRONTEND_ASSET_SUFFIXES = frozenset(
    {
        ".js",
        ".mjs",
        ".css",
        ".map",
        ".wasm",
        ".json",
        ".webmanifest",
        ".woff",
        ".woff2",
        ".ttf",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".svg",
        ".ico",
    }
)


#: 认证场景样式四片：只在登录 / 注册 / 激活 / 找回密码等入户页面需要。
#: 已登录的总览与 3D 舞台不挂这四片（合计约 125KB / 37KB gzip，且全部 render-blocking），
#: 运行时由 `page-assets.ts` 按路由幂等挂载/卸载，因此服务端剥离不会破坏后续跳转。
AUTH_SCENE_STYLESHEET_PATHS = (
    "/static/auth/scene/fonts.css",
    "/static/auth/scene/page.css",
    "/static/auth/scene/scene.css",
    "/static/auth/scene/panel.css",
)

#: 必须保留认证场景样式的页面。`/setup` 是初始化向导，可能在任何阶段被直接打开。
_AUTH_PAGE_PATHS = frozenset(
    {
        "/login",
        "/register",
        "/reset-password",
        "/activate",
        "/license-recovery",
        "/setup",
    }
)

_AUTH_STYLESHEET_LINK_RE = re.compile(
    r"\s*<link\b(?=[^>]*\brel=\"stylesheet\")(?=[^>]*\bhref=\"(?:"
    + "|".join(re.escape(path) for path in AUTH_SCENE_STYLESHEET_PATHS)
    + r")\")[^>]*>"
)


def is_auth_page_path(path: str) -> bool:
    """页面是否属于需要认证场景样式的入户路由（精确匹配，避免 `/` 误伤）。"""
    normalized = path.rstrip("/") or "/"
    return normalized in _AUTH_PAGE_PATHS or normalized.startswith("/setup/")


def strip_auth_scene_stylesheets(html: str) -> str:
    """从 SPA 外壳里移除认证场景四片（保留 spa-shell/appearance/其它样式）。

    只匹配 `<link rel="stylesheet" href="...">` 这一种节点；调用方负责判断当前页面
    是否真的不需要它们（已登录的非入户页面）。运行时若导航到登录页，`applyStylesheets`
    会按 `AUTH_STYLESHEETS` 重新创建这些节点。
    """
    return _AUTH_STYLESHEET_LINK_RE.sub("", html)


def is_frontend_static_path(path: str) -> bool:
    """``path`` 是否落在前端产物的挂载点上（挂载目录或根路径产物文件）。

    匹配的是**前缀**：调用方若要区分「目录本身」与「目录下的文件」，需自行处理尾斜杠。
    """
    if path in FRONTEND_STATIC_ROOT_FILES:
        return True
    return path.startswith(tuple(f"{prefix}/" for prefix in FRONTEND_STATIC_MOUNT_PREFIXES))


#: 不属于 SPA 页面、也不在 ``/api/`` 之下的端点前缀（socket.io 由外层 ASGI 组合直接处理，
#: 永远不该回 HTML；授权门禁对它的约束走 WebSocket 握手检查）。
NON_SPA_ENDPOINT_PREFIXES = ("/api/", "/socket.io")


def is_spa_document_path(path: str) -> bool:
    """``path`` 是否由 SPA 外壳承载的页面路由（而不是 API / 前端产物 / 其他端点）。

    判据必须与 ``spa_static.py`` 的 catch-all **完全同口径**：不是 ``/api/`` 前缀、
    不是静态挂载点、后缀不是产物后缀。两边一旦分叉，门禁放行的页面 catch-all 仍会 404，
    「放行」就变成了另一种报错。

    授权门禁用它把「文档导航」与「数据请求」分开：未激活时页面导航必须下发外壳
    （否则浏览器会把 JSON 401 的响应体当成网页渲染，用户看到屏幕上「一段代码」），
    真正的数据访问仍由 ``/api/**`` 与 WebSocket 握手拦住。
    """
    if path.startswith(NON_SPA_ENDPOINT_PREFIXES):
        return False
    if is_frontend_static_path(path):
        return False
    return PurePosixPath(path).suffix.lower() not in FRONTEND_ASSET_SUFFIXES


__all__ = [
    "APPLE_TOUCH_ICON_PATHS",
    "ASSETS_MOUNT_PREFIX",
    "AUTH_SCENE_STYLESHEET_PATHS",
    "BACKGROUNDS_MOUNT_PREFIX",
    "FAVICON_PATH",
    "FRONTEND_ASSET_SUFFIXES",
    "FRONTEND_STATIC_MOUNT_PREFIXES",
    "FRONTEND_STATIC_ROOT_FILES",
    "ICONS_MOUNT_PREFIX",
    "LOGO_MOUNT_PREFIX",
    "MANIFEST_PATH",
    "MODULES_MOUNT_PREFIX",
    "SERVICE_WORKER_PATH",
    "SOUNDS_MOUNT_PREFIX",
    "STATIC_MOUNT_PREFIX",
    "is_auth_page_path",
    "is_frontend_static_path",
    "is_spa_document_path",
    "strip_auth_scene_stylesheets",
]
