"""页面路由与内置素材路由：本应用的 HTML 出口。

从 main.py 拆出来的。这一层只做三件事：判断该不该放行（身份判定见 app/request_context.py）、
决定跳到哪里、把页面渲染出来（渲染口径见 http/page_shell.py）。

刻意保留成 create_app 里的闭包风格：所有路由都通过 install_page_routes(app, settings) 注册，
于是 settings 只出现一次，路由体里直接用 —— 不必每个处理函数都收一遍。
"""
from __future__ import annotations

from fastapi import FastAPI

from .request_context import active_display, browser_authorized, initialized, signed_in


import asyncio
from urllib.parse import quote

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy import text

from ..security.access import (
    display_token_from,
)
from ..http.http_cache import set_public_immutable_cache
from ..api.assets import read_builtin_asset
from ..api.ha_proxy import (
    router as ha_proxy_router,
)
from ..http.body_guard import RequestBodyGuard
from ..http.commissioning import has_rail, rail_states
from ..http.compression import SelectiveGZipMiddleware
from ..http.page_shell import APPEARANCE_PATH, render_shell_page
from ..http.telemetry import deck_tiles, has_deck
from ..app.middleware import record_request_diagnostics
from ..config import Settings
from ..security.http_security import (
    is_direct_local,
)
from ..security.display_access import display_path, resolve_display_project
from ..core.models import Project
from ..security.security import set_display_cookie

def install_page_routes(app: FastAPI, settings: Settings) -> None:
    """注册页面、内置素材与保留路径。"""
    def safe_next_path(request: Request) -> str:
        """安全地取出 ?next= 跳转目标。

        只接受以单个 / 开头的站内路径：以 // 开头是协议相对 URL，
        会跳到外站，属于开放重定向漏洞，因此必须排除。
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

        只有本机直连才回版本号：探活机器只需要一个 2xx，而精确版本对
        外部扫描者是「这个部署值不值得打」的第一手情报 —— 配合 setup_guard 的
        初始化窗口，匿名可读的版本号就是选靶子用的。
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

        同时挂在 /apple-touch-icon.png 与 /apple-touch-icon-precomposed.png 上：
        不同 iOS 版本会请求其中之一，缺了就会在添加到主屏时显示空白图标。
        """
        return FileResponse(settings.frontend_dir / 'static' / 'assets' / 'icons' / 'homeos-icon-180-h5.png', media_type = 'image/png')

    @app.get('/assets/builtin/{asset_path:path}', include_in_schema = False)
    def built_in_asset(asset_path: str, request: Request) -> FileResponse:
        """内置素材：这里再查一次身份，因为路径不在 /static 前缀下，
        不会被 StaticFiles 的中间件规则覆盖。"""
        if not browser_authorized(request, settings):
            raise HTTPException(status_code = 401, detail = '请先登录或完成中控设备配对。')
        return read_builtin_asset(asset_path, request)

    def render_page(request: Request, filename: str, *, scene: bool = True) -> Response:
        """本应用所有 HTML 页面的统一出口（见 ``http/page_shell``）。

        收成一个闭包是为了让 ``settings``、``version`` 与配色版本号在调用处不必各写
        一遍 —— 九个路由各拼一次参数，迟早有一个漏带配色版本，而那一页会安静地不跟配色。

        入口页（五个）额外带上开通轨与状态甲板读数。两者都**按访问者**算而不是按页面算：
        同一条 ``/pair`` 对管理员与墙面板的进度与读数都不一样（见 ``http/commissioning``
        与 ``http/telemetry``），所以这里多花一次会话查询是必要的，不是重复劳动 ——
        路由那边即使刚查过，也不该把结论往下传：调用点分散在六个路由里，
        迟早有一个忘了传，而那一页会显示别人的进度。

        ``active_display`` 只在带设备 Cookie 时才查库，非设备访客（绝大多数入口页请求）
        是纯 Cookie 解析，所以这里无条件算它不会变成每次两查。

        会话与设备这两项**只算一次**、同时喂给两条注入（轨与甲板）：两处各查一遍
        是同一份结论写两次，而它们分叉的那一天不会有任何测试发现 ——
        只会在某页上出现「轨说你没登录，甲板说你已登录」。
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

        不需要登录：它只含颜色字面量，和 page.css 一样是公开的设计系统资源，
        而且要能跟在未登录的 /login、/setup 后面加载。

        ``?v=`` 与 ETag 都在：URL 带版本时给一年强缓存（改配色 URL 就变），
        不带时要求每次校验 —— 手敲 ``/appearance.css`` 看到的一定是当前值。
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

        非本机直连只回 ``status``：``initialized`` 告诉扫描者「这台还没建
        管理员」—— 那正是 setup_guard 的初始化窗口最怕被挑出来的时刻；精确版本号
        同理。编排器的探测本来就是从容器内回环发起的（见 Dockerfile 与
        docker-compose 的 healthcheck），因此它照旧拿得到详情。
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

        已登录时同样先过授权门（/license），与首次设置成功后的跳转一致。
        """
        if initialized(request, settings):
            if signed_in(request, settings):
                return RedirectResponse('/license', status_code = 303)
            return RedirectResponse('/login', status_code = 303)
        return render_page(request, 'setup.html')

    @app.get('/pair', include_in_schema = False)
    def pair_page(request: Request):
        """配对页。

        `?scan=1` 表示用户主动要看扫码 / 手输配对界面，
        此时即使已登录或已配对也不跳走，否则用户没法再配一台设备。
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
            # 就地渲染在同一个地址上，它可以自动重试、网络恢复后无需人工介入。
            return render_page(request, 'license-recovery.html')
        return render_page(request, 'pair.html')

    @app.get('/', include_in_schema = False)
    async def home_page(request: Request):
        """编辑器主页：未初始化 → 设置页；未登录 → 登录页；授权非 ACTIVE → 授权页。
        三道门禁顺序固定，进入前联网确认绑定（走节流窗口）。仅 ``ACTIVE`` 可进编辑器：宽限态虽然离线
        验签仍可能通过，但必须先经过授权页展示告警，避免「未激活却直接进主页」。这里的同步查库一律转
        线程池；绑定确认不能 ``confirm_binding(force=True)``，否则刷几下面板就能让请求一起排队。
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

        CONNECTION_WARNING / STARTUP_VALIDATION_REQUIRED 等「离线宽限」状态
        仍可能 allows(editor)=True，但授权页必须留下来展示告警与重新激活入口——
        否则首次设置 / 登录后会被立刻 303 踢进编辑器，用户看不到「请重新激活」。
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

        鉴权有两种合法身份：管理员会话，或已配对且正好绑定该项目的设备。
        不是这两种情况就送去配对页，而不是直接 401 —— 墙面设备没有键盘，
        报错页无法处理，跳配对页才能让用户扫码。
        """
        if not initialized(request, settings):
            return RedirectResponse('/setup', status_code = 303)
        device = active_display(request, settings)
        viewer_signed_in = signed_in(request, settings)
        if not viewer_signed_in and device is None:
            return pairing_redirect(request)
        if not request.app.state.license_service.allows('display'):
            # 与 /pair 同理：展示地址本身就是恢复页的最佳落点 —— 设备刷新后仍回到这里，
            # 授权一恢复就能直接进画面，不需要用户重新输地址。
            return render_page(request, 'license-recovery.html')
        with request.app.state.database.session_factory() as database:
            (project, alias_name) = resolve_display_project(database, project_name)
        if project is None:
            raise HTTPException(status_code = 404, detail = '仪表盘不存在。')
        # 设备只能看自己绑定的项目；管理员会话不受此项限制。
        if not viewer_signed_in and (device is None or device.project_id != project.id):
            return pairing_redirect(request)
        # 用的是改名前的旧地址：跳到当前地址，并保留设备手里的书签可用。
        # 放在鉴权之后，未配对的匿名请求仍走配对页，不会因为这里多一条跳转而暴露
        # 「某个旧名称曾经存在」。
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

        注册在所有真实 API 路由之后，只接住完全没匹配上的 /api/v1/* 路径。
        """
        raise HTTPException(status_code = 404, detail = 'API 接口不存在。')

    @app.get('/component-lab', include_in_schema = False)
    def removed_component_lab() -> None:
        """已下线页面：显式 404，避免被静态兜底吞掉变成首页内容。"""
        raise HTTPException(status_code = 404, detail = '页面不存在。')

    @app.get('/template-assets/{asset_path:path}', include_in_schema = False)
    def removed_template_assets(asset_path: str) -> None:
        """已下线资源路径：显式 404，防止旧链接拿到半截内容。"""
        raise HTTPException(status_code = 404, detail = '资源不存在。')

    # camera / HLS 反向代理自行定义 /api/* 路径，因此不挂 /api/v1 前缀。
    app.include_router(ha_proxy_router)
    # 请求体的字节 / 嵌套深度上限：默认 1 MiB，草稿类写路由单独放宽（8 / 32 MiB），
    # 三个流式上传端点原样放行。注册在这里意味着它比同源闸门与资源鉴权更靠外：
    # FastAPI 是先读全请求体再进依赖与路由的，只有在中间件层拦才算拦得住
    # （未登录的匿名请求也能用它把内存打满）。
    app.add_middleware(RequestBodyGuard)
    # 响应压缩：**先注册 = 更靠里**，于是它压的是路由产出的原始字节，上面的请求体闸门与
    # 下面的诊断层看到的都是最终结果。口径（只压文本类 / 够大 / 不碰 HA 代理的流式透传）见
    # apps/server/http/compression.py 的模块头 —— 这里刻意不用 Starlette 的 GZipMiddleware，
    # 那个会把摄像头分片与 MJPEG 流一起重新编码。
    app.add_middleware(SelectiveGZipMiddleware)
    # 诊断中间件放在最后注册：它会包住上面所有路由（含 ha_proxy），
    # 从而也能记录代理请求的耗时与错误。
    app.middleware('http')(record_request_diagnostics)
