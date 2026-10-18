"""静态资源挂载与 SPA fallback（顺序与 Nest ServeStaticModule + main.ts 一致）。"""

from __future__ import annotations

import asyncio
from html import escape as html_escape
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from ..api.assets import read_builtin_asset
from ..config import Settings
from ..domains.license import features as feature_codes
from ..platform.core.frontend_static import (
    APPLE_TOUCH_ICON_PATHS,
    BACKGROUNDS_MOUNT_PREFIX,
    FAVICON_PATH,
    FRONTEND_ASSET_SUFFIXES,
    ICONS_MOUNT_PREFIX,
    LOGO_MOUNT_PREFIX,
    MANIFEST_PATH,
    MODULES_MOUNT_PREFIX,
    SERVICE_WORKER_PATH,
    SOUNDS_MOUNT_PREFIX,
    STATIC_MOUNT_PREFIX,
    is_frontend_static_path,
)
from ..platform.security.session_store import resolve_login_session

#: 需要按「能力」判定授权状态的页面路径 → 能力名。
_PAGE_LICENSE_FEATURE: tuple[tuple[tuple[str, ...], str], ...] = (
    (("/3d-studio", "/studio/editor"), feature_codes.FEATURE_EDITOR),
    (("/", "/display/", "/homeos/"), feature_codes.FEATURE_DISPLAY),
)

#: Nest ``spaFallbackMiddleware`` 对所有方法生效（未匹配的任意方法都回退 index.html）
_SPA_FALLBACK_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

#: 这些后缀绝不是 SPA 路由；回 HTML 会被浏览器当成「MIME 不是 JS」拒绝执行模块。
#: 取值来自平台层的单一真源（授权门禁的告警判据用的是同一份）。
_SPA_FALLBACK_ASSET_SUFFIXES = FRONTEND_ASSET_SUFFIXES


def signed_in(request: Request) -> bool:
    """是否存在有效登录会话（DB 会话）。

    仅为静态资源门禁服务，故不复刻完整守卫链：只要能确认「这条请求带着一个可解析的
    登录凭证」即可，权限矩阵仍由各路由的 ``require_user`` 把关。
    """
    settings = request.app.state.settings
    database = getattr(request.app.state, "database", None)
    if database is None:
        return False
    token = request.cookies.get(settings.cookie_name, "")
    if not token:
        return False
    try:
        with database.session_factory() as session:
            return (
                resolve_login_session(
                    session, token, max_age_seconds=settings.jwt_expires_in_seconds
                )
                is not None
            )
    except Exception:
        return False


def page_license_feature(path: str) -> str | None:
    """页面路径对应的授权能力；无需判定时返回 ``None``。

    ``"/"`` 是**精确**页面（总览），不能当成前缀：否则 ``prefix.endswith("/")`` 会让
    它匹配到 ``/login`` / ``/register`` / ``/activate`` / ``/reset-password`` 等入户页，
    授权过期时这些页面也会被 ``data-license-blocked`` 就地替换成授权恢复页 ——
    而激活本身要求登录、找回密码更是唯一的账号修复入口，等于把钥匙锁在门里。
    """
    for prefixes, feature in _PAGE_LICENSE_FEATURE:
        for prefix in prefixes:
            if path == prefix:
                return feature
            if prefix != "/" and prefix.endswith("/") and path.startswith(prefix):
                return feature
    return None


def register_page_asset_routes(app: FastAPI, settings: Settings) -> None:
    """页面级图标与内置素材（公开 / 受保护资源路由）。"""

    @app.get(FAVICON_PATH, include_in_schema=False)
    def favicon() -> FileResponse:
        return FileResponse(
            settings.frontend_dir / "static" / "assets" / "icons" / "homeos-favicon-h5.ico",
            media_type="image/x-icon",
        )

    @app.get(APPLE_TOUCH_ICON_PATHS[0], include_in_schema=False)
    @app.get(APPLE_TOUCH_ICON_PATHS[1], include_in_schema=False)
    def apple_touch_icon() -> FileResponse:
        return FileResponse(
            settings.frontend_dir / "static" / "assets" / "icons" / "homeos-icon-180-h5.png",
            media_type="image/png",
        )

    @app.get("/assets/builtin/{asset_path:path}", include_in_schema=False)
    def built_in_asset(asset_path: str, request: Request) -> FileResponse:
        # 内置素材受登录门禁保护：未登录一律 401，授权 / 素材能力另由 read_builtin_asset 判定。
        if not signed_in(request):
            raise HTTPException(status_code=401, detail="请先登录后再访问该资源。")
        return read_builtin_asset(asset_path, request)


def _mount_frontend_build_dirs(app: FastAPI, frontend_dir: Path) -> None:
    """挂载 vite 构建产物目录（``/static`` 与 ``/modules``）。

    ``/static`` 同时承载 public 静态资源与哈希 chunk（``static/assets/<name>-<hash>``，
    与商店同构）；根级 ``assets/`` 不再是产物目录，因此这里**不再** mkdir/mount ``/assets``
    —— 那会在每次启动时凭空重建一个空目录，让人误以为产物仍分两处。

    目录必须在启动时 mkdir：watch-build / 原子发布窗口里 ``modules/`` 可能短暂不存在，
    若这里 ``is_dir()`` 失败就永远不 mount，之后即使 dist 已恢复，进程不重启也会一直把
    ``/modules/*.js`` 回成 HTML（Strict MIME 报错）。
    """
    static_dir = frontend_dir / "static"
    if static_dir.is_dir():
        app.mount(STATIC_MOUNT_PREFIX, StaticFiles(directory=str(static_dir)), name="static")
    modules_dir = frontend_dir / "modules"
    modules_dir.mkdir(parents=True, exist_ok=True)
    app.mount(
        MODULES_MOUNT_PREFIX,
        StaticFiles(directory=str(modules_dir)),
        name=MODULES_MOUNT_PREFIX.strip("/"),
    )


def _register_pwa_asset_routes(app: FastAPI, frontend_dir: Path) -> None:
    """显式登记 manifest / service worker（GET+HEAD），避免 catch-all HEAD 回成 HTML。"""

    @app.api_route(MANIFEST_PATH, methods=["GET", "HEAD"], include_in_schema=False)
    async def spa_manifest():
        manifest = frontend_dir / "manifest.json"
        if manifest.is_file():
            return FileResponse(manifest, media_type="application/manifest+json")
        raise HTTPException(status_code=404)

    @app.api_route(SERVICE_WORKER_PATH, methods=["GET", "HEAD"], include_in_schema=False)
    async def spa_service_worker():
        worker = frontend_dir / "sw.js"
        if worker.is_file():
            # Service worker 必须允许根作用域并禁止缓存，否则更新无法生效。
            return FileResponse(
                worker,
                media_type="application/javascript",
                headers={"Cache-Control": "no-store", "Service-Worker-Allowed": "/"},
            )
        raise HTTPException(status_code=404)


def _mount_replaceable_asset_dirs(app: FastAPI, settings: Settings) -> None:
    """可替换静态资源（图标 / 背景图 / 音效 / Logo）；缺失目录不挂载。

    图标与背景图是**分层**的：随包默认素材（``assets/icons`` / ``assets/backgrounds``）
    只读，用户上传落到 ``<data_dir>/ui-assets`` 并优先命中。这样上传覆盖默认图、删除默认
    素材都不再改动随包目录（否则升级 / 重建镜像后改动会被回滚）。
    """
    from ..platform.core.asset_paths import (
        UPLOAD_CONTENT_TYPES,
        get_backgrounds_dir,
        get_icons_dir,
        get_logo_dir,
        get_sounds_dir,
        layered_asset_path,
        load_hidden_assets,
    )

    ui_assets_root = settings.ui_assets_dir
    for mount_path, kind, builtin_root in (
        (ICONS_MOUNT_PREFIX, "icons", get_icons_dir()),
        (BACKGROUNDS_MOUNT_PREFIX, "backgrounds", get_backgrounds_dir()),
    ):
        user_root = ui_assets_root / kind

        def _layered_asset(
            asset_path: str,
            *,
            _kind: str = kind,
            _builtin: Path = builtin_root,
            _user: Path = user_root,
        ) -> FileResponse:
            hidden = load_hidden_assets(ui_assets_root)
            resolved = layered_asset_path(_builtin, _user, hidden, _kind, asset_path)
            if resolved is None:
                raise HTTPException(status_code=404, detail="资源不存在。")
            response = FileResponse(resolved, media_type=UPLOAD_CONTENT_TYPES.get(resolved.suffix.lower()))
            response.headers["Cache-Control"] = "private, no-cache"
            return response

        app.api_route(
            f"{mount_path}/{{asset_path:path}}",
            methods=["GET", "HEAD"],
            include_in_schema=False,
            name=f"layered{mount_path}",
        )(_layered_asset)

        # 无尾斜杠的挂载点本身不是资源：显式 404，避免回落到 SPA 外壳把目录当页面返回
        # （``StaticFiles`` 时期这里是 308 重定向到 ``/icons/``）。
        def _bare_asset_dir() -> None:
            raise HTTPException(status_code=404, detail="资源不存在。")

        app.api_route(
            mount_path,
            methods=["GET", "HEAD"],
            include_in_schema=False,
            name=f"layered-bare{mount_path}",
        )(_bare_asset_dir)

    for mount_path, asset_dir in (
        (SOUNDS_MOUNT_PREFIX, get_sounds_dir()),
        (LOGO_MOUNT_PREFIX, get_logo_dir()),
    ):
        if asset_dir.is_dir():
            app.mount(
                mount_path,
                StaticFiles(directory=str(asset_dir)),
                name=mount_path.strip("/"),
            )


def _register_spa_fallback(app: FastAPI, settings: Settings, version: str) -> None:
    """统一 SPA 外壳与 catch-all 回退。"""

    def _spa_index() -> Path:
        return settings.frontend_dir / "index.html"

    async def _page_license_status(request: Request) -> str | None:
        """当前页面被授权门禁拦下时返回**被拦的原因**（状态码）；放行返回 ``None``。

        只回布尔值是这里上一版的真实事故：``UNACTIVATED``（本机压根没激活）与
        ``RECOVERY_RETRY``（有授权、只是续租没成功）在浏览器里被渲染成同一张「授权恢复」页，
        而那张页的文案写着「本机授权仍在」—— 全新生产部署的用户于是看到一句假话，
        并在一个没有重试按钮的页面上找不到「去激活」的入口（``canRetry`` 依赖
        ``license_id``，未激活时恒为 false）。

        把状态码交给前端之后，「该去激活」与「该等重连」就能分开渲染（见 ``App.vue``）。
        """
        if not settings.license_required:
            return None
        feature = page_license_feature(request.url.path)
        service = getattr(request.app.state, "license_service", None)
        if feature is None or service is None:
            return None
        try:
            allowed = await asyncio.to_thread(service.allows, feature)
        except Exception:
            # 判定本身失败时保持原口径：不拦、也不假装知道原因。
            return None
        if allowed:
            return None
        try:
            payload = await asyncio.to_thread(service.availability)
        except Exception:
            payload = None
        status = str((payload or {}).get("status") or "").strip()
        # 已经确认被拦、但拿不到具体状态时按「未知」处理：前端会走恢复页（中性、可重试），
        # 而不是把用户直接推进激活表单。
        return status or "UNKNOWN"

    async def _spa_shell(request: Request) -> HTMLResponse:
        """统一 SPA 外壳出口。

        授权未放行时给 ``<html>`` 打 ``data-license-blocked="1"`` 与
        ``data-license-status="<状态码>"``：前端据此决定是在**原地址**就地渲染授权恢复页
        （等待重连），还是把「未激活」交给路由守卫送去注册 / 登录 / 激活。
        """
        index = _spa_index()
        if not index.is_file():
            raise HTTPException(status_code=404)
        html = index.read_text(encoding="utf-8")
        blocked = await _page_license_status(request)
        if blocked is not None:
            html = html.replace(
                "<html",
                f'<html data-license-blocked="1" data-license-status="{html_escape(blocked)}"',
                1,
            )
        return HTMLResponse(html, headers={"Cache-Control": "no-store"})

    @app.get("/", include_in_schema=False)
    async def spa_root(request: Request):
        if _spa_index().is_file():
            return await _spa_shell(request)
        return JSONResponse({"status": "ok", "service": "homeos", "version": version})

    @app.api_route("/{spa_path:path}", methods=_SPA_FALLBACK_METHODS, include_in_schema=False)
    async def spa_fallback(spa_path: str, request: Request):
        # API 前缀未命中：与 Nest 一致 —— 抛出无 detail 的 404，
        # 由统一异常处理器产出 { error: "Not Found", message: "请求的资源不存在", errorCode: "UNKNOWN" }。
        if request.url.path.startswith("/api/"):
            raise HTTPException(status_code=404)
        # 静态产物路径未挂载 / 文件缺失时也绝不能回 index.html（否则 shared-*.js 报 Strict MIME）。
        path = request.url.path
        if is_frontend_static_path(path) or Path(path).suffix.lower() in (
            _SPA_FALLBACK_ASSET_SUFFIXES
        ):
            raise HTTPException(status_code=404)
        return await _spa_shell(request)


def mount_spa_static(app: FastAPI, settings: Settings, version: str) -> None:
    """静态资源 + SPA fallback（须在业务路由之后注册）。"""
    frontend_dir = settings.frontend_dir
    _mount_frontend_build_dirs(app, frontend_dir)
    _register_pwa_asset_routes(app, frontend_dir)
    _mount_replaceable_asset_dirs(app, settings)
    _register_spa_fallback(app, settings, version)
