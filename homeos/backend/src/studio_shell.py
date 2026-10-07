"""SPA 外壳与静态资源门禁（并入 homeos-3d ``main.py`` 的页面 / 资源保护层）。

homeos-3d 的后端把「3D 查看器 / 编辑器」的全部代码与素材放在 ``/static/**`` 下，并用
一份**匿名白名单**（构建产物 ``dist/frontend/public-static.json``）划出「未登录也必须能
加载」的那一小撮资源（登录页场景样式、图标、manifest、SPA 外壳样式、错误上报脚本）。
其余 ``/static/**`` 只有已登录会话可读 —— 换句话说，授权与户型图绘制能力不会被匿名拉走。

homeos 侧沿用同一口径，本模块只负责：

- 读取匿名白名单并判定「是否受保护资源」；
- 缓存头 / ETag / CSP / 框架策略（与 homeos-3d 逐条对齐）；
- 把「授权未放行」表达为 SPA 外壳上的 ``data-license-blocked="1"``，由前端在原地址就地
  渲染授权恢复页。

路径集合按并入后的路由表更新：总览 ``/`` 是只读展示，创作能力在 ``/3d-studio`` 与
``/studio/editor``；中控设备配对（``/pair``、``/display`` 配对码）随配对码机制移除，
但 ``/display/{project_id}`` 与 ``/homeos/{name}`` 仍作为展示页地址保留。
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Iterable
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, Response

#: 构建产物里「匿名可读静态资源」清单（vite 插件产出）。
PUBLIC_STATIC_MANIFEST_NAME = "public-static.json"

#: 应用对外暴露的页面路径（裸地址，无需登录即可拿到 SPA 外壳）。
SPA_PAGE_PATHS = frozenset(
    {
        "/",
        "/login",
        "/setup",
        "/activate",
        "/license",
        "/license-recovery",
        "/guest",
        "/3d-studio",
        "/studio/editor",
    }
)

#: 前缀形式的页面路径（展示页）。
SPA_PAGE_PREFIXES = ("/display/", "/homeos/")

#: 计入「应用界面」的路径前缀：这些响应需要 CSP / 框架策略 / no-store 缓存头。
APP_SURFACE_PREFIXES = (
    "/api/v1/",
    "/static/",
    "/assets/builtin/",
    "/display/",
    "/homeos/",
    "/projects/",
)

#: 静态 3D 模型 / 贴图后缀：带 ``?v=`` 时可长缓存。
MODEL_ASSET_SUFFIXES = frozenset(
    {".bin", ".glb", ".jpg", ".png", ".gltf", ".jpeg", ".ktx2", ".webp"}
)

#: 需要「私有 no-cache」的静态后缀（源码模块与字体）。
NO_CACHE_ASSET_SUFFIXES = frozenset({".js", ".css", ".woff2"})

#: 交互模块（运行时按需下发）的路径前缀。
INTERACTION_MODULE_PREFIX = "/api/v1/modules/interaction3d/"

NO_STORE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


def _manifest_entries(payload: Any) -> Iterable[str]:
    entries = payload.get("files", []) if isinstance(payload, dict) else []
    if not isinstance(entries, list):
        return ()
    paths: list[str] = []
    for entry in entries:
        candidate = entry.get("path") if isinstance(entry, dict) else entry
        if isinstance(candidate, str) and candidate:
            paths.append(candidate)
    return paths


def load_public_static_files(settings: Any) -> frozenset[str]:
    """读取匿名静态资源白名单；产物缺失时返回空集合（等价于「全部受保护」）。

    清单不存在只说明前端还没构建，此时宁可把 ``/static/**`` 全部当作受保护资源，
    也不要在未登录请求下放行整个 3D 代码目录。
    """
    path: Path = settings.public_static_manifest_path
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return frozenset()
    return frozenset(_manifest_entries(payload))


def _manifest_fingerprint(path: Path) -> tuple[int, int] | None:
    """清单文件的 (mtime, size) 指纹；读不到（尚未构建）时返回 None。"""
    try:
        stat = path.stat()
    except OSError:
        return None
    return (stat.st_mtime_ns, stat.st_size)


def make_public_static_loader(settings: Any) -> Callable[[], frozenset[str]]:
    """构造「按指纹失效」的匿名白名单加载器。

    白名单是**构建产物**：前端每次重建都会覆写它（外壳新增的 ``/static`` 脚本会随之
    进入白名单）。若只在进程启动时读一次并闭包捕获，重建后新资源会被永久挡成 401 ——
    表现为外壳脚本加载失败、页面静默空白，且必须重启后端才能恢复。

    这里按 (mtime, size) 指纹失效：清单没变时零额外开销，变了就重读，
    既不必每请求读盘，也不会卡在旧清单上。
    """
    path: Path = settings.public_static_manifest_path
    state: dict[str, Any] = {"fingerprint": None, "files": frozenset()}

    def load() -> frozenset[str]:
        fingerprint = _manifest_fingerprint(path)
        if fingerprint != state["fingerprint"]:
            state["fingerprint"] = fingerprint
            state["files"] = load_public_static_files(settings)
        return state["files"]

    return load


def is_premium_asset(path: str, public_static_files: frozenset[str]) -> bool:
    """是否为「必须登录」的资源：内置素材目录 + 白名单之外的 ``/static/**``。"""
    if path.startswith("/assets/builtin/"):
        return True
    if path == "/static/" or path.startswith("/static/"):
        return path not in public_static_files
    return False


def is_page_path(path: str) -> bool:
    if path in SPA_PAGE_PATHS:
        return True
    return path.startswith(SPA_PAGE_PREFIXES)


def is_app_surface(path: str) -> bool:
    if path in SPA_PAGE_PATHS:
        return True
    return path.startswith(APP_SURFACE_PREFIXES)


def is_model_asset(path: str) -> bool:
    return path.startswith("/static/3d-studio/models/") and Path(path).suffix.lower() in MODEL_ASSET_SUFFIXES


def is_versioned_interaction_module(path: str, request: Request) -> bool:
    return (
        path.startswith(INTERACTION_MODULE_PREFIX)
        and path != f"{INTERACTION_MODULE_PREFIX}stage.html"
        and Path(path).suffix.lower() in {".js", ".css"}
        and bool(request.query_params.get("v"))
    )


def _is_immutable_private_asset(path: str) -> bool:
    return path.startswith(
        (
            "/api/v1/assets/effect-variant",
            "/api/v1/assets/user/",
            "/api/v1/assets/studio3d-export/",
        )
    )


def _etag_matches(request: Request, response: Response) -> bool:
    """GET/HEAD 校验器是否命中此可缓存响应。

    交互模块资源经普通 API 路由返回 ``FileResponse``（不是 ``StaticFiles``），
    协商由本函数补上；放在授权中间件之后，过期的私有缓存条目就不会把未授权请求变成 304。
    """
    if request.method not in {"GET", "HEAD"} or response.status_code != 200:
        return False
    etag = response.headers.get("etag")
    requested = request.headers.get("if-none-match")
    if not etag or not requested:
        return False
    normalized = etag.removeprefix("W/")
    return any(
        value == "*" or value.removeprefix("W/") == normalized
        for value in (part.strip() for part in requested.split(","))
    )


def _csp_header(path: str, request: Request, response: Response) -> str:
    """按响应类型给出 CSP。

    - 用户上传的 SVG：完全沙箱化，禁止任何外部加载；
    - HA 页面（``/display/*``、``/homeos/*``）与 3D 交互舞台：允许被同源/任意框架嵌；
    - 其余：``frame-ancestors 'none'``。
    """
    if path.startswith("/api/v1/assets/user/") and response.headers.get(
        "content-type", ""
    ).startswith("image/svg+xml"):
        return "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    ha_frame = path.startswith(("/display/", "/homeos/")) or path == f"{INTERACTION_MODULE_PREFIX}stage.html"
    same_origin_frame = path == "/3d-studio" and request.query_params.get("auto-diagram-embed") == "1"
    if same_origin_frame:
        ha_frame = False
    frame_ancestors = "*" if ha_frame else ("'self'" if same_origin_frame else "'none'")
    return (
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; "
        "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; "
        "worker-src 'self' blob:; frame-src 'self'; "
        f"frame-ancestors {frame_ancestors}; base-uri 'none'; form-action 'self'"
    )


def _apply_security_headers(request: Request, response: Response) -> None:
    path = request.url.path
    if path.startswith("/api/v1/assets/user/") and response.headers.get(
        "content-type", ""
    ).startswith("image/svg+xml"):
        response.headers["Content-Security-Policy"] = _csp_header(path, request, response)
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    else:
        response.headers["Content-Security-Policy"] = _csp_header(path, request, response)
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    ha_frame = path.startswith(("/display/", "/homeos/")) or path == (
        f"{INTERACTION_MODULE_PREFIX}stage.html"
    )
    same_origin_frame = path == "/3d-studio" and request.query_params.get("auto-diagram-embed") == "1"
    if ha_frame:
        # 注意：starlette 的 MutableHeaders 没有 dict 风格的 pop/clear，只有 del。
        # 这里是要「移除」而非「置空」，所以必须先判存在再删。
        if "x-frame-options" in response.headers:
            del response.headers["x-frame-options"]
    else:
        response.headers["X-Frame-Options"] = "SAMEORIGIN" if same_origin_frame else "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"


def _apply_cache_headers(request: Request, response: Response) -> None:
    path = request.url.path
    interaction_module = is_versioned_interaction_module(path, request)
    if is_model_asset(path) and response.status_code in {200, 206, 304}:
        response.headers["Cache-Control"] = (
            "private, max-age=31536000, immutable"
            if request.query_params.get("v")
            else "private, no-cache"
        )
        return
    if (
        response.status_code in {200, 304}
        and path.startswith("/static/")
        and Path(path).suffix.lower() in NO_CACHE_ASSET_SUFFIXES
    ) or (interaction_module and response.status_code in {200, 304}):
        response.headers["Cache-Control"] = "private, no-cache"
        return
    # 带内容哈希的构建产物（``/assets/js|css/<name>-<hash>.<ext>``）：内容寻址、永不覆盖，
    # 可以放心 ``immutable``。
    #
    # 缺这个头不只是少了点性能（浏览器会按 Last-Modified 做启发式缓存，约等于 0，
    # 于是每个 chunk 都要一次 304 往返）；更要紧的是**旧外壳的降级路径**：
    # Service Worker 会把导航响应（含 SPA 外壳）留在 ``homeos-shell`` 里做离线兜底，
    # 而旧外壳引用的是已被重建删除的旧 chunk。若这些 chunk 在 HTTP 缓存里是 durable 的，
    # 旧外壳仍能正常渲染；反之就 404 白屏。``sw.js`` 的注释一直假设这里有 immutable，
    # 实际上一直没有 —— 这里补上，让"外壳旧了"从**致命**退化为**优雅**。
    if (
        response.status_code in {200, 304}
        and path.startswith("/assets/")
        and not path.startswith("/assets/builtin/")
    ):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return
    if (
        is_page_path(path)
        or (
            path.startswith("/api/v1/")
            and not _is_immutable_private_asset(path)
            and not (interaction_module and response.status_code in {200, 304})
        )
        or path.startswith(("/display/", "/homeos/", "/projects/", "/static/3d-studio/"))
    ):
        response.headers.update(NO_STORE_HEADERS)


def install(
    app: FastAPI,
    settings: Any,
    *,
    is_authorized: Callable[[Request], Awaitable[bool]],
) -> frozenset[str]:
    """装配静态资源门禁中间件，返回匿名白名单（供其他中间件复用）。

    ``is_authorized`` 由装配层注入（homeos 的会话解析在 ``security`` 包里，见
    ``app.py`` 的 ``_signed_in``），避免本模块反向依赖认证实现。
    """
    # 白名单随构建产物变动（见 make_public_static_loader 的说明），不能只读一次。
    load_public_static_files_now = make_public_static_loader(settings)

    @app.middleware("http")
    async def protect_assets_and_add_security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        path = request.url.path
        if is_premium_asset(path, load_public_static_files_now()):
            if not await is_authorized(request):
                return Response(
                    "请先登录后再访问该资源。",
                    status_code=401,
                    media_type="text/plain",
                    headers=dict(NO_STORE_HEADERS),
                )
        response = await call_next(request)
        if is_app_surface(path):
            _apply_security_headers(request, response)
        _apply_cache_headers(request, response)
        if _etag_matches(request, response) and response.headers.get(
            "cache-control", ""
        ).startswith("private, no-cache"):
            headers = dict(response.headers)
            headers.pop("content-length", None)
            headers.pop("content-type", None)
            return Response(status_code=304, headers=headers)
        return response

    return load_public_static_files_now()


__all__ = [
    "APP_SURFACE_PREFIXES",
    "NO_STORE_HEADERS",
    "SPA_PAGE_PATHS",
    "SPA_PAGE_PREFIXES",
    "install",
    "is_app_surface",
    "is_model_asset",
    "is_page_path",
    "is_premium_asset",
    "is_versioned_interaction_module",
    "load_public_static_files",
    "make_public_static_loader",
]
