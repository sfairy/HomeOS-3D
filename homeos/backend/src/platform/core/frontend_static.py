"""前端产物的挂载点清单（静态资源路径的**唯一真源**）。

这份常量存在的理由是一次真实的死锁事故：授权门禁（``domains/license/guard.py``）按
「哪些路径未激活也必须能加载」维护了一份豁免名单，而挂载点清单在 ``bootstrap/spa_static.py``
里另写了一份 —— 两边一旦不一致，未激活的生产实例就会白屏：外壳能下发，但它引用的
``/assets/js/**``、``/assets/css/**`` 被门禁挡成 401（响应体是 JSON，于是 CSS 还会额外报
``MIME type ('application/json') is not a supported stylesheet``），而**激活页自身也是用这些
产物渲染的** —— 用户永远走不到激活那一步。

所以把清单放在平台层（``bootstrap`` 与 ``domains`` 都能 import，且都不反向依赖对方）：
挂载时用它、豁免时也用它，两边不可能再分叉。往后新增挂载点只需在这里加一条。

注意语义边界：这份豁免只对**授权门禁**生效。真正的访问控制是登录门禁
（``bootstrap/studio_shell.py`` 的 ``ProtectAssetsMiddleware``，按构建产物白名单拦
``/static/**`` 并拦下 ``/assets/builtin/**``），两层职责不同，不要合并。
"""

from __future__ import annotations

#: 由 ``spa_static._mount_frontend_build_dirs`` 挂载的 vite 构建产物目录。
STATIC_MOUNT_PREFIX = "/static"
ASSETS_MOUNT_PREFIX = "/assets"
MODULES_MOUNT_PREFIX = "/modules"

#: 由 ``spa_static._mount_replaceable_asset_dirs`` 挂载 / 登记的可替换素材目录
#: （图标 / 背景图 / 音效 / Logo；用户上传的版本优先于随包默认素材）。
ICONS_MOUNT_PREFIX = "/icons"
BACKGROUNDS_MOUNT_PREFIX = "/backgrounds"
SOUNDS_MOUNT_PREFIX = "/sounds"
LOGO_MOUNT_PREFIX = "/logo"

#: 全部静态挂载前缀（授权门禁据此整体豁免，见模块 docstring）。
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


def is_frontend_static_path(path: str) -> bool:
    """``path`` 是否落在前端产物的挂载点上（挂载目录或根路径产物文件）。

    匹配的是**前缀**：调用方若要区分「目录本身」与「目录下的文件」，需自行处理尾斜杠。
    """
    if path in FRONTEND_STATIC_ROOT_FILES:
        return True
    return path.startswith(tuple(f"{prefix}/" for prefix in FRONTEND_STATIC_MOUNT_PREFIXES))


__all__ = [
    "APPLE_TOUCH_ICON_PATHS",
    "ASSETS_MOUNT_PREFIX",
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
    "is_frontend_static_path",
]
