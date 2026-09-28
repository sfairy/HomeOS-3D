"""页面路由与内置素材路由：本应用的 HTML 出口。
"""
from __future__ import annotations

import asyncio
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy import text

from .request_context import active_display, browser_authorized, initialized, signed_in
from ..api.assets import read_builtin_asset
from ..api.ha_proxy import (
    router as ha_proxy_router,
)
from ..app.middleware import record_request_diagnostics
from ..config import Settings
from ..core.models import Project
from ..http.body_guard import RequestBodyGuard
from ..http.commissioning import has_rail, rail_states
from ..http.compression import SelectiveGZipMiddleware
from ..http.http_cache import set_public_immutable_cache
from ..http.page_shell import APPEARANCE_PATH, render_shell_page
from ..http.telemetry import deck_tiles, has_deck
from ..security.access import (
    display_token_from,
)
from ..security.display_access import display_path, resolve_display_project
from ..security.http_security import (
    is_direct_local,
)
from ..security.security import set_display_cookie


def install_page_routes(app: FastAPI, settings: Settings) -> None:
    """注册页面、内置素材与保留路径。"""
    def safe_next_path(request: Request) -> str:
        """安全地取出 ?next= 跳转目标。
        """
        destination = request.query_params.get('next', '').strip()
        if destination.startswith('/') and not destination.startswith('//'):
            return destination
        return '/'

    def next_redirect(request: Request, target: str) -> RedirectResponse:
        """把当前请求转到 ``target``，并把原地址塞进 next 以便跳回。"""
        destination = request.url.path
        if request.url.query:
            destination = f'{destination}?{request.url.query}'
        return RedirectResponse(f'{target}?next={quote(destination, safe = "")}', status_code = 303)

    def pairing_redirect(request: Request) -> RedirectResponse:
        """把当前请求转到配对页，并把原地址塞进 next 以便配对后跳回。"""
        return next_redirect(request, '/pair')

    def login_redirect(request: Request) -> RedirectResponse:
        """把当前请求转到登录页，并把原地址塞进 next 以便登录后跳回。"""
        return next_redirect(request, '/login')

    @app.get('/health/live', include_in_schema = False)
    async def health_live(request: Request) -> dict[str, str]:
        """存活探针：只要进程能响应就算存活，不检查任何依赖。
        """
        if not is_direct_local(request):
            return {'status': 'ok'}
        return {'status': 'ok', 'version': settings.version}

    @app.get('/favicon.ico', include_in_schema = False)
    def favicon() -> FileResponse:
        """站点图标：浏览器标签页与书签栏使用。"""
        return FileResponse(settings.frontend_dir / 'static' / 'assets' / 'icons' / 'homeos-favicon-h5.ico', media_type = 'image/x-icon')

    @app.get('/apple-touch-icon.png', include_in_schema = False)
    @app.get('/apple-touch-icon-precomposed.png', include_in_schema = False)
    def apple_touch_icon() -> FileResponse:
        """iOS 添加到主屏时使用的 180×180 图标。
        """
        return FileResponse(settings.frontend_dir / 'static' / 'assets' / 'icons' / 'homeos-icon-180-h5.png', media_type = 'image/png')

    @app.get('/assets/builtin/{asset_path:path}', include_in_schema = False)
    def built_in_asset(asset_path: str, request: Request) -> FileResponse:
        if not browser_authorized(request, settings):
            raise HTTPException(status_code = 401, detail = '请先登录或完成中控设备配对。')
        return read_builtin_asset(asset_path, request)

    def render_page(request: Request, filename: str, *, scene: bool = True) -> Response:
        """本应用所有 HTML 页面的统一出口（见 ``http/page_shell``）。
        """
        rail = None
        deck = None
        if has_rail(filename) or has_deck(filename):
            admin_session = signed_in(request, settings)
            device = active_display(request, settings) is not None
            if has_rail(filename):
                rail = rail_states(filename, admin_session = admin_session, device = device)
            if has_deck(filename):
                deck = deck_tiles(
                    filename,
                    admin_session = admin_session,
                    device = device,
                    request = request,
                )
        return render_shell_page(
            settings.frontend_dir,
            filename,
            settings.version,
            request.app.state.appearance.revision,
            scene = scene,
            rail = rail,
            deck = deck,
            request = request,
        )

    @app.get(APPEARANCE_PATH, include_in_schema = False)
    def appearance_stylesheet(request: Request) -> Response:
        """站点配色样式表：内容就是当前配置展开出的 ``:root{…}``。
        """
        revision = request.app.state.appearance.revision
        has_version = request.query_params.get('v') == revision
        response = Response(
            content = request.app.state.appearance.css(),
            media_type = 'text/css',
            headers = {'ETag': f'"{revision}"'},
        )
        if has_version:
            set_public_immutable_cache(response)
        else:
            response.headers['Cache-Control'] = 'no-cache'
        return response

    @app.get('/health/ready', include_in_schema = False)
    def health_ready(request: Request) -> dict[str, str | bool]:
        """就绪探针：真的连一次数据库，连不上就返回 500 让编排器不转发流量。
        """
        with request.app.state.database.engine.connect() as connection:
            connection.execute(text('SELECT 1'))
        if not is_direct_local(request):
            return {'status': 'ready'}
        return {'status': 'ready', 'initialized': initialized(request, settings), 'version': settings.version}

    @app.get('/login', include_in_schema = False)
    def login_page(request: Request):
        """登录页：未初始化先去设置；已登录先过授权门再进目标页。"""
        if not initialized(request, settings):
            return RedirectResponse('/setup', status_code = 303)
        if signed_in(request, settings):
            destination = safe_next_path(request)
            # 默认进首页时先走 /license：失效留在激活页，有效由该页 303 回 /
            if destination == '/':
                destination = '/license'
            return RedirectResponse(destination, status_code = 303)
        return render_page(request, 'login.html')

    @app.get('/setup', include_in_schema = False)
    def setup_page(request: Request):
        """设置页：已初始化就不允许再进来，按登录状态分流。
        """
        if initialized(request, settings):
            if signed_in(request, settings):
                return RedirectResponse('/license', status_code = 303)
            return RedirectResponse('/login', status_code = 303)
        return render_page(request, 'setup.html')

    @app.get('/pair', include_in_schema = False)
    def pair_page(request: Request):
        """配对页。
        """
        if not initialized(request, settings):
            return RedirectResponse('/setup', status_code = 303)
        scan_link = request.query_params.get('scan') == '1'
        if signed_in(request, settings) and not scan_link:
            return RedirectResponse(safe_next_path(request), status_code = 303)
        device = active_display(request, settings)
        if device is not None and not scan_link:
            # 已配对且未强制扫码：直接送去它绑定的那块仪表盘。
            with request.app.state.database.session_factory() as database:
                paired_project = database.get(Project, device.project_id)
            if paired_project is not None:
                return RedirectResponse(display_path(paired_project.name), status_code = 303)
        if not request.app.state.license_service.allows('display'):
            # 不落 403 错误页：授权不可用时墙面设备没有键盘，报错页无从处理。改为把恢复页
            return render_page(request, 'license-recovery.html')
        return render_page(request, 'pair.html')

    @app.get('/', include_in_schema = False)
    async def home_page(request: Request):
        """编辑器主页：未初始化 → 设置页；未登录 → 登录页；授权非 ACTIVE → 授权页。
        """
        if not initialized(request, settings):
            return RedirectResponse('/setup', status_code = 303)
        if not await asyncio.to_thread(signed_in, request, settings):
            return RedirectResponse('/login', status_code = 303)
        await request.app.state.license_service.confirm_binding()
        license_status = await asyncio.to_thread(request.app.state.license_service.status)
        if license_status.get('status') != 'ACTIVE' or not license_status.get('editorAllowed'):
            return RedirectResponse('/license', status_code = 303)
        return render_page(request, 'index.html', scene = False)

    @app.get('/license', include_in_schema = False)
    async def license_page(request: Request):
        """授权页：仅在状态为 ACTIVE 且具备 editor 时回首页。
        """
        if not initialized(request, settings):
            return RedirectResponse('/setup', status_code = 303)
        if not await asyncio.to_thread(signed_in, request, settings):
            return RedirectResponse('/login', status_code = 303)
        await request.app.state.license_service.confirm_binding()
        license_status = await asyncio.to_thread(request.app.state.license_service.status)
        if license_status.get('status') == 'ACTIVE' and license_status.get('editorAllowed'):
            return RedirectResponse('/', status_code = 303)
        return render_page(request, 'license.html')

    @app.get('/3d-studio', include_in_schema = False)
    async def three_d_studio_page(request: Request):
        """3D 户型工作室：需要登录 + editor 能力。"""
        if not initialized(request, settings):
            return RedirectResponse('/setup', status_code = 303)
        if not await asyncio.to_thread(signed_in, request, settings):
            return login_redirect(request)
        await request.app.state.license_service.confirm_binding()
        license_status = await asyncio.to_thread(request.app.state.license_service.status)
        if license_status.get('status') != 'ACTIVE' or not license_status.get('editorAllowed'):
            return RedirectResponse('/license', status_code = 303)
        return render_page(request, '3d-studio.html', scene = False)

    @app.get('/display/{project_name:path}', include_in_schema = False)
    def display_page(project_name: str, request: Request):
        """正式展示页（中控设备打开的那一页）。
        """
        if not initialized(request, settings):
            return RedirectResponse('/setup', status_code = 303)
        device = active_display(request, settings)
        viewer_signed_in = signed_in(request, settings)
        if not viewer_signed_in and device is None:
            return pairing_redirect(request)
        if not request.app.state.license_service.allows('display'):
            # 与 /pair 同理：展示地址本身就是恢复页的最佳落点 —— 设备刷新后仍回到这里，
            return render_page(request, 'license-recovery.html')
        with request.app.state.database.session_factory() as database:
            (project, alias_name) = resolve_display_project(database, project_name)
        if project is None:
            raise HTTPException(status_code = 404, detail = '仪表盘不存在。')
        # 设备只能看自己绑定的项目；管理员会话不受此项限制。
        if not viewer_signed_in and (device is None or device.project_id != project.id):
            return pairing_redirect(request)
        # 用的是改名前的旧地址：跳到当前地址，并保留设备手里的书签可用。
        if alias_name is not None:
            return RedirectResponse(display_path(project.name), status_code = 303)
        response = render_page(request, 'display.html', scene = False)
        if device is not None:
            # 打开展示页即顺带续期 Cookie，减少设备因长期不活跃而掉配对。
            token = display_token_from(request.cookies, settings)
            if token:
                set_display_cookie(response, settings, token)
        return response

    @app.api_route('/api/v1/{unknown_path:path}', methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'], include_in_schema = False)
    def unknown_api_route(unknown_path: str) -> None:
        """兜底 API 路由：返回结构化 404，而不是落到 SPA 的 index.html。
        """
        raise HTTPException(status_code = 404, detail = 'API 接口不存在。')

    @app.get('/component-lab', include_in_schema = False)
    def removed_component_lab() -> None:
        raise HTTPException(status_code = 404, detail = '页面不存在。')

    @app.get('/template-assets/{asset_path:path}', include_in_schema = False)
    def removed_template_assets(asset_path: str) -> None:
        """已下线资源路径：显式 404，防止旧链接拿到半截内容。"""
        raise HTTPException(status_code = 404, detail = '资源不存在。')

    # camera / HLS 反向代理自行定义 /api/* 路径，因此不挂 /api/v1 前缀。
    app.include_router(ha_proxy_router)
    # 请求体的字节 / 嵌套深度上限：默认 1 MiB，草稿类写路由单独放宽（8 / 32 MiB），
    app.add_middleware(RequestBodyGuard)
    # 响应压缩：**先注册 = 更靠里**，于是它压的是路由产出的原始字节，上面的请求体闸门与
    app.add_middleware(SelectiveGZipMiddleware)
    # 诊断中间件放在最后注册：它会包住上面所有路由（含 ha_proxy），
    app.middleware('http')(record_request_diagnostics)
