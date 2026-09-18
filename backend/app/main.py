"""FastAPI 应用装配：生命周期、中间件、页面路由与静态资源保护。

这个模块是后端的总入口，`create_app()` 把各子系统拼成一个应用：
- lifespan 里按顺序建目录、跑迁移、起授权 / HA 同步 / 更新检查三个后台服务；
- 两层 HTTP 中间件：一层做请求诊断日志，一层做资源鉴权与安全响应头；
- 一组页面路由各自判断「是否已初始化 / 是否登录 / 授权是否允许」，不合格就 303 跳转。

注意最后一行会直接构造 `app`，`uvicorn backend.app.main:app` 依赖它存在。
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text
from starlette.exceptions import HTTPException as StarletteHTTPException

from .access import (
    admin_token_from,
    check_admin_session,
    discard_expired_session,
    display_token_from,
    resolve_principal,
)
from .admin_account import AdminAccountStore
from .api.auth import router as auth_router
from .api.assets import AssetCatalog, read_builtin_asset, router as assets_router
from .api.displays import PAIRING_GLOBAL_LIMIT, router as displays_router
from .api.ha import router as ha_router, runtime_router
from .api.ha_proxy import router as ha_proxy_router
from .api.global_logs import router as global_logs_router
from .api.icons import router as icons_router
from .api.license import router as license_router
from .modules.interaction3d.api import router as interaction3d_router
from .api.projects import router as projects_router
from .api.studio3d import router as studio3d_router
from .auth_limiter import LoginAttemptLimiter
from .config import Settings, load_settings
from .database import Database
from .ha.service import HAConnectorService
from .http_security import (
    forwarded_allow_ips_warning,
    forwarded_headers_present,
    parse_trusted_proxies,
    same_origin_request,
)
from .license import LicenseService
from .updates import UpdateChecker, router as updates_router
from .migrations import run_migrations
from .display_access import active_display_device, display_path
from .global_log import GlobalLogStore, _safe_text, event_context
from .models import DisplayDevice, Project
from .security import set_display_cookie
from .setup_guard import SetupGuard, announce_setup_window

# 超过这个耗时的接口会在全局日志里记一条"响应缓慢"的警告。
SLOW_REQUEST_MILLISECONDS = 2000


def _record_lifecycle_failure(app: FastAPI, phase: str, error: Exception) -> None:
    """把启动 / 停止阶段的异常同时写进全局日志与 stderr。

    启动失败时日志系统本身可能就是故障点，因此两条路都写：
    全局日志能看到就更好，看不到还有 stderr 兜底。
    """
    message = f"HomeOS {'启动' if phase == 'startup' else '停止'}失败：{error}"
    details = traceback.format_exc()
    event_log = getattr(app.state, 'global_log', None)
    if event_log is not None:
        event_log.append('error', '系统后台', '系统', message, context={'phase': phase}, details=details)
    try:
        # stderr 写失败（例如已关闭）不该掩盖真正的启动异常。
        sys.stderr.write(f'{_safe_text(message, limit = 1000)}\n{_safe_text(details, limit = 12000)}\n')
    except OSError:
        pass


def create_app(settings: Settings | None = None, license_transport = None, license_endpoint_pool = None) -> FastAPI:
    """构造 FastAPI 应用。

    参数:
        settings: 覆盖配置；为 None 时从环境变量加载。
        license_transport / license_endpoint_pool: 授权客户端的依赖注入点，
            测试时用来替换真实网络传输。

    返回:
        已注册中间件、路由与异常处理器的应用实例。
    """
    app_settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """启动与停止流程。

        启动顺序是有依赖的：日志 → 目录权限 → 迁移 → 数据库 → 账号 →
        授权服务（它决定门禁）→ 资源目录 → HA 同步 → 更新检查。
        任一步抛异常都会逆序关闭已启动的服务，再向上抛出，让进程退出，
        而不是留下一个"半启动"的进程对外服务。
        """
        try:
            # 日志最先建：后面每一步的失败都要能记进日志。
            app.state.global_log = GlobalLogStore(app_settings.data_dir)
            # 代理信任范围是安全配置：解析不了的值必须当场炸掉，不能静默退化成
            # 「谁也不信」（那会让限流悄悄按代理地址统计，等于所有人共用一个桶）。
            trusted_proxies = parse_trusted_proxies(tuple(app_settings.trusted_proxies))
            # uvicorn 那一层的信任范围由启动器透传进来（见 docker/start_app.py）。
            # 它是「对端不可伪造」这条前提的第一层：通配时本模块的所有判断都不再成立，
            # 所以只记警告不够，还要同时写到 stderr —— 只在 docker logs 里看启动输出
            # 的运维也得看得到。
            allow_ips_warning = forwarded_allow_ips_warning(
                os.environ.get('UVICORN_FORWARDED_ALLOW_IPS')
            )
            if allow_ips_warning:
                app.state.global_log.append('warning', '系统后台', '配置', allow_ips_warning)
                try:
                    sys.stderr.write(f'{allow_ips_warning}\n')
                except OSError:
                    pass
            if not trusted_proxies and (app_settings.app_base_url.startswith('https://')):
                # 最常见的错配：HTTPS 反代后面却没配可信代理 —— 于是限流、审计里的
                # 客户端 IP 全是代理地址，且带转发头的请求还会被当成「本机直连」之外的
                # 情况处理。这里提醒一句，不阻断启动（业务仍可用，只是统计不准）。
                app.state.global_log.append(
                    'warning', '系统后台', '配置',
                    'APP_BASE_URL 是 https 但未配置 APP_TRUSTED_PROXIES：限流与审计会按反向代理地址统计，建议按部署方式配置。',
                )
            # 中控令牌的有效期必须大于心跳节流窗口（5 分钟），否则设备会在
            # 有机会续期之前就先过期 —— 表现是「配对完没几分钟就回配对页」。
            display_ttl = int(getattr(app_settings, 'display_token_ttl_seconds', 0) or 0)
            if 0 < display_ttl <= 300:
                app.state.global_log.append(
                    'warning', '系统后台', '配置',
                    f'APP_DISPLAY_TOKEN_TTL_SECONDS={display_ttl} 小于中控心跳节流窗口（5 分钟）：'
                    '中控设备会在能续期之前就过期，请把有效期调到 5 分钟以上（默认 180 天）。',
                )
            display_hard_ttl = int(getattr(app_settings, 'display_token_hard_ttl_seconds', 0) or 0)
            if 0 < display_hard_ttl < display_ttl:
                app.state.global_log.append(
                    'warning', '系统后台', '配置',
                    f'APP_DISPLAY_TOKEN_HARD_TTL_SECONDS={display_hard_ttl} 小于滑动有效期 '
                    f'（{display_ttl}）：实际生效的是更短的硬上限，请确认是否符合预期。',
                )
            # 所有数据目录都收紧到 0700，密钥与用户图片不允许同机其它用户读取。
            app_settings.data_dir.mkdir(parents = True, exist_ok = True, mode = 0o700)
            os.chmod(app_settings.data_dir, 0o700)
            app_settings.user_assets_dir.mkdir(parents = True, exist_ok = True, mode = 0o700)
            os.chmod(app_settings.user_assets_dir, 0o700)
            app_settings.studio3d_dir.mkdir(parents = True, exist_ok = True, mode = 0o700)
            os.chmod(app_settings.studio3d_dir, 0o700)
            app_settings.studio3d_exports_dir.mkdir(parents = True, exist_ok = True, mode = 0o700)
            os.chmod(app_settings.studio3d_exports_dir, 0o700)
            app_settings.effect_variants_dir.mkdir(parents = True, exist_ok = True, mode = 0o700)
            os.chmod(app_settings.effect_variants_dir, 0o700)
            run_migrations(app_settings)
            # 数据库文件同样只给属主读写：里面有加密后的 HA 令牌与授权状态。
            os.chmod(app_settings.database_path, 0o600)
            app.state.database = Database(app_settings.database_url)
            app.state.admin_account = AdminAccountStore(app_settings.admin_account_path)
            account_state = app.state.admin_account.initialize(app.state.database)
            app.state.settings = app_settings
            if account_state == 'reset_required':
                # 账号文件被删过：记录下来，前端会跳设置页重建账号。
                app.state.global_log.append('warning', '系统后台', '账号', '检测到管理员账号文件已删除，等待重新设置账号和密码')
            # 登录限流器是进程内状态，重启即清空（可接受：重启本身不常见）。
            app.state.login_limiter = LoginAttemptLimiter()
            # 只按账号（不含 IP）的那一档预算：挡「不停换 IP 撞同一个账号」。
            # 阈值故意比按 IP 那档宽：正常人手滑几次不该被锁，而换 IP 爆破会被它兜住。
            app.state.login_account_limiter = LoginAttemptLimiter(10, 900, 900)
            # 中控配对的跨来源失败预算（按 IP 那一档在 login_limiter 里，见 displays.py）。
            app.state.pairing_limiter = LoginAttemptLimiter(*PAIRING_GLOBAL_LIMIT)
            # 首次初始化的守卫：没带引导密钥的远程请求不允许抢建管理员账号。
            app.state.setup_guard = SetupGuard(app_settings.data_dir, app_settings.setup_token, event_log = app.state.global_log)
            if account_state in ('empty', 'reset_required'):
                # 打印到启动日志（stderr），密钥本身不进全局日志：全局日志可导出。
                announce_setup_window(account_state, app.state.setup_guard)
            else:
                # 已初始化：清掉残留的引导密钥文件，免得它以后又被当成有效凭证。
                app.state.setup_guard.discard_file()
            app.state.license_service = LicenseService(app_settings, app.state.database, transport = license_transport, endpoint_pool = license_endpoint_pool, event_log = app.state.global_log)
            await app.state.license_service.start()
            app.state.asset_catalog = AssetCatalog(app_settings.built_in_assets_dir, app_settings.user_assets_dir, app_settings.studio3d_exports_dir, app_settings.effect_variants_dir)
            app.state.ha_connector = HAConnectorService(app_settings, app.state.database, event_log = app.state.global_log)
            # HA 同步是同步方法，内部自己起线程 / 任务，因此这里不 await。
            app.state.ha_connector.start()
            app.state.update_checker = UpdateChecker(app_settings.data_dir, app_settings.version, app_settings.update_channel, enabled = app_settings.update_checks_enabled)
            app.state.update_checker.start()
        except Exception as error:
            _record_lifecycle_failure(app, 'startup', error)
            # 逆序回滚：只关闭真正启动成功的那些服务，
            # 逐个 try 是为了让一个关闭失败不影响其余服务的清理。
            for service_name in ('update_checker', 'ha_connector', 'license_service'):
                service = getattr(app.state, service_name, None)
                if service is None:
                    continue
                try:
                    await service.stop()
                except Exception as cleanup_error:
                    _record_lifecycle_failure(app, 'shutdown', cleanup_error)
            database = getattr(app.state, 'database', None)
            if database is not None:
                try:
                    database.dispose()
                except Exception as cleanup_error:
                    _record_lifecycle_failure(app, 'shutdown', cleanup_error)
            # 启动失败也要收掉日志写线程，否则半启动的进程会留下一个常驻线程。
            event_log = getattr(app.state, 'global_log', None)
            if event_log is not None:
                try:
                    event_log.stop()
                except Exception as cleanup_error:
                    _record_lifecycle_failure(app, 'shutdown', cleanup_error)
            raise
        app.state.global_log.append('success', '系统后台', '系统', f'HomeOS {app_settings.version} 已启动', context={'phase': 'ready'})
        try:
            yield
        finally:
            # 正常停止也要逐个关闭，并把第一个失败留到最后抛出，
            # 保证其余服务仍然被尝试关闭。
            shutdown_error = None
            for service in (app.state.update_checker, app.state.ha_connector, app.state.license_service):
                try:
                    await service.stop()
                except Exception as error:
                    _record_lifecycle_failure(app, 'shutdown', error)
                    shutdown_error = shutdown_error or error
            try:
                app.state.database.dispose()
            except Exception as error:
                _record_lifecycle_failure(app, 'shutdown', error)
                shutdown_error = shutdown_error or error
            try:
                if shutdown_error is not None:
                    raise shutdown_error
                # 最后一条日志：确认所有服务都已按序关闭。
                app.state.global_log.append('info', '系统后台', '系统', 'HomeOS 已正常停止')
            finally:
                # 日志写线程始终要收尾（且放在最后）：既保证上面那条记录落盘，
                # 也保证异常退出路径上不留下残余线程。
                app.state.global_log.stop()

    # 关掉 docs / redoc / openapi：本项目不对外暴露接口文档。
    app = FastAPI(title = 'HomeOS', version = app_settings.version, lifespan = lifespan, docs_url = None, redoc_url = None, openapi_url = None)
    app.state.settings = app_settings

    @app.exception_handler(Exception)
    async def unhandled_error_response(request: Request, _error: Exception):
        """兜底异常处理：只回纯文本，不回堆栈。

        带上 X-Request-ID 便于用户报障时与服务端日志对上号；
        真正的异常详情已经由诊断中间件记进全局日志。
        """
        context = getattr(request.state, 'log_context', {})
        return PlainTextResponse('Internal Server Error', status_code = 500, headers = {'X-Request-ID': context['requestId']} if context.get('requestId') else None)

    @app.exception_handler(StarletteHTTPException)
    async def remember_http_error(request: Request, error: StarletteHTTPException):
        """把 HTTPException 的 detail 暂存到请求上，供诊断中间件写日志。"""
        request.state.diagnostic_detail = error.detail
        return await http_exception_handler(request, error)

    @app.exception_handler(RequestValidationError)
    async def remember_validation_error(request: Request, error: RequestValidationError):
        """同上，并对 422 的校验错误做裁剪。

        只保留 loc / msg / type 三个键：pydantic 原始错误里会带 input 原文，
        那可能包含用户提交的敏感内容，不该进日志。
        """
        request.state.diagnostic_detail = [
            {key: item[key] for key in ('loc', 'msg', 'type') if key in item}
            for item in error.errors()
        ]
        return await request_validation_exception_handler(request, error)

    async def record_request_diagnostics(request: Request, call_next):
        """诊断中间件：分配 requestId、记录慢请求与错误、注入日志上下文。

        只记录 /api/ 开头的请求（页面与静态资源量太大，记了反而淹没真问题），
        并显式排除日志接口自身，否则前端一拉日志就会因为慢而再写一条日志。
        """
        started = time.monotonic()
        # HLS 流地址里带令牌，日志里一律折叠成占位路径，避免令牌落盘。
        diagnostic_path = '/api/hls/[stream]' if request.url.path.startswith('/api/hls/') else request.url.path
        context = {'requestId': uuid4().hex, 'method': request.method, 'path': diagnostic_path}
        request.state.log_context = context
        # 放进 ContextVar，深层代码 append 日志时会自动带上这些字段。
        token = event_context.set(context)
        log_endpoint = request.url.path == '/api/v1/logs' or request.url.path.startswith('/api/v1/logs/')
        api_request = request.url.path.startswith('/api/')
        # 只提示一次：请求带了转发头但没配可信代理，说明前面有反代而限流/审计只能
        # 看到代理地址。这是配置问题，不是每次请求的问题，反复记会把日志刷满。
        if not getattr(request.app.state, 'proxy_warning_logged', False) and forwarded_headers_present(request):
            if not getattr(request.app.state.settings, 'trusted_proxies', ()):
                request.app.state.proxy_warning_logged = True
                forward_log = getattr(request.app.state, 'global_log', None)
                if forward_log is not None:
                    forward_log.append(
                        'warning', '系统后台', '配置',
                        '检测到请求带反向代理转发头，但未配置 APP_TRUSTED_PROXIES：限流与审计会按代理地址统计。请按实际部署配置可信代理的 IP 或网段。',
                        context = context,
                    )
        try:
            response = await call_next(request)
            # 回带 requestId：用户截图报障时服务端能直接定位到这次请求。
            response.headers['X-Request-ID'] = context['requestId']
            context.update(status = response.status_code, durationMs = round((time.monotonic() - started) * 1000, 1))
            log = getattr(request.app.state, 'global_log', None)
            if log is not None and api_request and not log_endpoint:
                detail = getattr(request.state, 'diagnostic_detail', None)
                # 业务错误码（如 LICENSE_RESTRICTED）单独提出来，便于日志按码筛选。
                if isinstance(detail, dict) and isinstance(detail.get('code'), str):
                    context['code'] = detail['code']
                if response.status_code >= 400 and not getattr(request.state, 'diagnostic_error_logged', False):
                    # 4xx 记 warning、5xx 记 error；已经自行记录过的接口不重复记。
                    log.append(
                        'error' if response.status_code >= 500 else 'warning',
                        '系统后台',
                        '接口',
                        f'接口返回错误：{request.method} {diagnostic_path} · HTTP {response.status_code}',
                        context = context,
                        details = detail if isinstance(detail, str) else (json.dumps(detail, ensure_ascii = False) if detail is not None else None),
                    )
                elif response.status_code < 400 and context['durationMs'] >= SLOW_REQUEST_MILLISECONDS:
                    log.append('warning', '系统后台', '性能', f'接口响应缓慢：{request.method} {diagnostic_path} · {context["durationMs"]} 毫秒', context = context)
            return response
        except Exception as error:
            # 未捕获异常：记完整堆栈后原样抛出，交给兜底处理器回 500。
            context.update(status = 500, durationMs = round((time.monotonic() - started) * 1000, 1))
            log = getattr(request.app.state, 'global_log', None)
            if log is not None and not log_endpoint:
                log.append('error', '系统后台', '接口', f'接口运行异常：{request.method} {diagnostic_path} · {error}', context = context, details = traceback.format_exc())
            raise
        finally:
            # 必须重置 ContextVar：ASGI 会在同一线程 / 任务里复用上下文，
            # 不重置会把上个请求的 requestId 带到下个请求的日志里。
            event_context.reset(token)

    # 主应用路由统一挂在 /api/v1 下。
    app.include_router(auth_router, prefix = '/api/v1')
    app.include_router(displays_router, prefix = '/api/v1')
    app.include_router(assets_router, prefix = '/api/v1')
    app.include_router(ha_router, prefix = '/api/v1')
    app.include_router(runtime_router, prefix = '/api/v1')
    app.include_router(projects_router, prefix = '/api/v1')
    app.include_router(studio3d_router, prefix = '/api/v1')
    app.include_router(icons_router, prefix = '/api/v1')
    app.include_router(license_router, prefix = '/api/v1')
    app.include_router(interaction3d_router, prefix = '/api/v1')
    app.include_router(global_logs_router, prefix = '/api/v1')
    app.include_router(updates_router, prefix = '/api/v1')
    # 静态资源挂载在 /static；是否允许匿名访问由下面的中间件按白名单决定。
    app.mount('/static', StaticFiles(directory = app_settings.frontend_dir / 'static'), name = 'static')

    def initialized(request: Request) -> bool:
        """系统是否已完成管理员初始化。"""
        return request.app.state.admin_account.initialized

    def signed_in(request: Request) -> bool:
        """是否为已登录的有效管理员会话。

        与 API 侧共用 ``access.check_admin_session``（B32）。这里原先独立实现了
        一遍校验，而独立实现的那一版少了绝对寿命判定：滑动有效期能被续期一直
        往后推，于是被盗 Cookie 只要还在被使用，就能一直打开页面、取
        ``/static/*`` 与 ``/assets/builtin/*``（B3）。

        页面路由要的是「未登录就跳转」而不是抛 401，所以这里只返回布尔值；
        副作用与 API 侧一致 —— 顺手清掉命中的过期会话行。
        """
        with request.app.state.database.session_factory() as database:
            session = check_admin_session(
                database,
                app_settings,
                admin_token_from(request.cookies, app_settings),
                account_user_id=request.app.state.admin_account.user_id,
            )
            discard_expired_session(database, session)
        return session.ok

    def active_display(request: Request) -> DisplayDevice | None:
        """从 Cookie 解析已配对且未过期的中控设备，并把对象 detachment 出会话。

        expunge 是为了让调用方拿到游离对象后连接即可归还连接池。
        令牌有效期由 ``active_display_device`` 判定（B2）：这里原先只查「配没配过」，
        于是展示页完全绕过了 display_token_ttl / hard_ttl。
        """
        token = display_token_from(request.cookies, app_settings)
        if not token:
            return None
        with request.app.state.database.session_factory() as database:
            device = active_display_device(database, app_settings, token)
            if device is None:
                return None
            database.expunge(device)
            return device

    def browser_authorized(request: Request) -> bool:
        """页面级访问条件：管理员已登录，或是一台已配对且未过期的中控设备。

        两种身份由同一个解析入口给出（B32）。原先写的是
        ``signed_in(request) or active_display(request) is not None``：
        两条路一次请求要开两个数据库会话，而两边的判据又各自不完整。
        """
        with request.app.state.database.session_factory() as database:
            resolution = resolve_principal(
                database,
                app_settings,
                admin_token=admin_token_from(request.cookies, app_settings),
                display_token=display_token_from(request.cookies, app_settings),
                account_user_id=request.app.state.admin_account.user_id,
            )
            discard_expired_session(database, resolution.admin)
            return resolution.authenticated

    # 匿名可访问的静态资源白名单。
    # 这些是「未初始化 / 未登录 / 未激活」时也必须能加载的页面入口脚本与图标：
    # 漏掉任何一个，都会让对应页面在未登录状态下白屏。
    public_static_files = {
        # 每个页面（含未激活时可访问的 login/setup/pair/license）都会先加载它，
        # 漏掉这个入口会让「未激活」状态反过来把客户端日志上报一起挡掉。
        '/static/client-log.js',
        '/static/pair.js',
        '/static/auth.css',
        '/static/setup.css',
        '/static/login.js',
        '/static/setup.js',
        '/static/license.js',
        '/static/auth-shell.js',
        '/static/pairing-link.js',
        '/static/pairing-entry.js',
        '/static/manifest.webmanifest',
        '/static/dashboard.webmanifest',
        '/static/homeos-favicon.ico',
        '/static/homeos-favicon.svg',
        '/static/homeos-icon-16.png',
        '/static/homeos-icon-32.png',
        '/static/homeos-icon-48.png',
        '/static/homeos-icon-180.png',
        '/static/homeos-icon-192.png',
        '/static/homeos-icon-512.png',
        '/static/manifest-h3.webmanifest',
        '/static/manifest-h4.webmanifest',
        '/static/manifest-h5.webmanifest',
        '/static/homeos-favicon-h3.ico',
        '/static/homeos-favicon-h3.svg',
        '/static/homeos-favicon-h4.ico',
        '/static/homeos-favicon-h4.svg',
        '/static/homeos-favicon-h5.ico',
        '/static/homeos-favicon-h5.svg',
        '/static/homeos-icon-16-h3.png',
        '/static/homeos-icon-16-h4.png',
        '/static/homeos-icon-16-h5.png',
        '/static/homeos-icon-32-h3.png',
        '/static/homeos-icon-32-h4.png',
        '/static/homeos-icon-32-h5.png',
        '/static/homeos-icon-48-h3.png',
        '/static/homeos-icon-48-h4.png',
        '/static/homeos-icon-48-h5.png',
        '/static/homeos-icon-180-h3.png',
        '/static/homeos-icon-180-h4.png',
        '/static/homeos-icon-180-h5.png',
        '/static/homeos-icon-192-h3.png',
        '/static/homeos-icon-192-h4.png',
        '/static/homeos-icon-192-h5.png',
        '/static/homeos-icon-512-h3.png',
        '/static/homeos-icon-512-h4.png',
        '/static/homeos-icon-512-h5.png',
        '/static/homeos-mark-black-orange.svg',
        '/static/homeos-mark-white-orange.svg'}

    def premium_asset(path: str) -> bool:
        """判断该路径是否属于"需要登录且需要 assets 能力"的受保护资源。

        规则：内置素材目录，以及不在白名单里的 /static/ 资源。
        """
        return (
            path.startswith('/assets/builtin/')
            or path == '/assets/builtin'
            or (path.startswith('/static/') and path not in public_static_files)
        )

    def immutable_private_asset(path: str) -> bool:
        """这些私有资源带不可变缓存（内容变即换 URL），因此不受 no-store 影响。"""
        return path.startswith(('/api/v1/assets/effect-variant', '/api/v1/assets/user/', '/api/v1/assets/studio3d-export/'))

    @app.middleware('http')
    async def protect_assets_and_add_security_headers(request: Request, call_next):
        """资源鉴权 + 安全响应头 + 缓存策略，三件事合并在一个中间件里。

        鉴权只作用于 premium_asset，且要在 call_next 之前拒绝，
        否则文件内容已经发出去了才追加 401 是无意义的。
        """
        path = request.url.path
        if premium_asset(path):
            # 数据库查询是同步的，丢到线程池避免阻塞事件循环。
            if not await asyncio.to_thread(browser_authorized, request):
                return Response('请先登录或完成中控设备配对。', status_code = 401, media_type = 'text/plain')
            if not await asyncio.to_thread(request.app.state.license_service.allows, 'assets'):
                return Response('当前授权状态不允许读取该资源。', status_code = 403, media_type = 'text/plain')
        response = await call_next(request)
        # 需要加安全头的页面与接口集合（静态资源与展示页也包含在内）。
        app_surface = (
            path == '/'
            or path in {'/pair', '/login', '/setup', '/license', '/3d-studio'}
            or path.startswith('/api/v1/')
            or path.startswith('/static/')
            or path.startswith('/assets/builtin/')
            or path.startswith('/display/')
        )
        if app_surface:
            embedded_auto_diagram = path == '/3d-studio' and request.query_params.get('auto-diagram-embed') == '1'
            embedded_interaction3d = path == '/api/v1/modules/interaction3d/stage.html' and response.status_code == 200
            # 只有这两个页面允许被同源 iframe 嵌入（展示页里嵌 3D 舞台），
            # 其余一律 frame-ancestors 'none'，防点击劫持。
            same_origin_frame = embedded_auto_diagram or embedded_interaction3d
            if path.startswith('/api/v1/assets/user/') and response.headers.get('content-type', '').startswith('image/svg+xml'):
                # 用户上传的 SVG 可能带脚本，用最严格的沙箱策略隔离。
                response.headers['Content-Security-Policy'] = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
                response.headers['Cross-Origin-Resource-Policy'] = 'same-origin'
            else:
                frame_ancestors = "'self'" if same_origin_frame else "'none'"
                response.headers['Content-Security-Policy'] = f"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; worker-src 'self' blob:; frame-src 'self'; frame-ancestors {frame_ancestors}; base-uri 'none'; form-action 'self'"
            response.headers['Referrer-Policy'] = 'no-referrer'
            response.headers['X-Content-Type-Options'] = 'nosniff'
            response.headers['X-Frame-Options'] = 'SAMEORIGIN' if same_origin_frame else 'DENY'
            response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        model_asset = (
            path.startswith('/static/3d-studio/models/')
            and Path(path).suffix.lower() in {'.bin', '.glb', '.jpg', '.png', '.gltf', '.jpeg', '.ktx2', '.webp'}
        )
        if model_asset and response.status_code in {304, 200, 206}:
            # 3D 模型体积大且内容不变，带 ?v= 版本戳时允许一年强缓存；
            # 没有版本戳就只能 no-cache，否则换了模型用户看不到。
            response.headers['Cache-Control'] = 'private, max-age=31536000, immutable' if request.query_params.get('v') else 'private, no-cache'
        elif (
            path in {'/', '/pair', '/login', '/setup', '/license', '/3d-studio'}
            or (path.startswith('/api/v1/') and not immutable_private_asset(path))
            or path.startswith('/display/')
            or path.startswith('/static/3d-studio/')
            or path in {'/static/display.js', '/static/display.css'}
        ):
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return response

    @app.middleware('http')
    async def require_same_origin_for_writes(request: Request, call_next):
        """所有改状态的 /api 请求必须同源（CSRF 第二道闸）。

        第一道闸是 SameSite=Lax + 只收 JSON 体（跨站表单会 422、跨站 fetch 会因
        没有 CORS 而 preflight 失败）。这里补一道显式的 Origin/Referer 校验，
        这样日后新增「GET 写操作」或收 text/plain 的接口时不会立刻出现 CSRF 缺口。

        GET / HEAD / OPTIONS 不拦（读操作 + CORS 预检）；非 /api 路径不拦
        （页面与静态资源没有副作用）。判定细节见 http_security.same_origin_request。
        """
        if (
            request.url.path.startswith('/api/')
            and request.method not in {'GET', 'HEAD', 'OPTIONS'}
            and not same_origin_request(request)
        ):
            return JSONResponse(
                {'detail': '跨站请求已被拒绝（来源校验未通过）。'},
                status_code = 403,
                headers = {'Cache-Control': 'no-store'},
            )
        return await call_next(request)

    def safe_next_path(request: Request) -> str:
        """安全地取出 ?next= 跳转目标。

        只接受以单个 / 开头的站内路径：以 // 开头是协议相对 URL，
        会跳到外站，属于开放重定向漏洞，因此必须排除。
        """
        destination = request.query_params.get('next', '').strip()
        if destination.startswith('/') and not destination.startswith('//'):
            return destination
        return '/'

    def pairing_redirect(request: Request) -> RedirectResponse:
        """把当前请求转到配对页，并把原地址塞进 next 以便配对后跳回。"""
        destination = request.url.path
        if request.url.query:
            destination = f'{destination}?{request.url.query}'
        return RedirectResponse(f'/pair?next={quote(destination, safe = "")}', status_code = 303)

    def login_redirect(request: Request) -> RedirectResponse:
        """把当前请求转到登录页，并把原地址塞进 next 以便登录后跳回。"""
        destination = request.url.path
        if request.url.query:
            destination = f'{destination}?{request.url.query}'
        return RedirectResponse(f'/login?next={quote(destination, safe = "")}', status_code = 303)

    @app.get('/health/live', include_in_schema = False)
    async def health_live() -> dict[str, str]:
        """存活探针：只要进程能响应就算存活，不检查任何依赖。"""
        return {'status': 'ok', 'version': app_settings.version}

    @app.get('/favicon.ico', include_in_schema = False)
    def favicon() -> FileResponse:
        """站点图标：浏览器标签页与书签栏使用。"""
        return FileResponse(app_settings.frontend_dir / 'static' / 'homeos-favicon-h5.ico', media_type = 'image/x-icon')

    @app.get('/apple-touch-icon.png', include_in_schema = False)
    @app.get('/apple-touch-icon-precomposed.png', include_in_schema = False)
    def apple_touch_icon() -> FileResponse:
        """iOS 添加到主屏时使用的 180×180 图标。

        同时挂在 /apple-touch-icon.png 与 /apple-touch-icon-precomposed.png 上：
        不同 iOS 版本会请求其中之一，缺了就会在添加到主屏时显示空白图标。
        """
        return FileResponse(app_settings.frontend_dir / 'static' / 'homeos-icon-180-h5.png', media_type = 'image/png')

    @app.get('/assets/builtin/{asset_path:path}', include_in_schema = False)
    def built_in_asset(asset_path: str, request: Request) -> FileResponse:
        """内置素材：这里再查一次身份，因为路径不在 /static 前缀下，
        不会被 StaticFiles 的中间件规则覆盖。"""
        if not browser_authorized(request):
            raise HTTPException(status_code = 401, detail = '请先登录或完成中控设备配对。')
        return read_builtin_asset(asset_path, request)

    @app.get('/health/ready', include_in_schema = False)
    def health_ready(request: Request) -> dict[str, str | bool]:
        """就绪探针：真的连一次数据库，连不上就返回 500 让编排器不转发流量。"""
        with request.app.state.database.engine.connect() as connection:
            connection.execute(text('SELECT 1'))
        return {'status': 'ready', 'initialized': initialized(request), 'version': app_settings.version}

    @app.get('/login', include_in_schema = False)
    def login_page(request: Request):
        """登录页：未初始化先去设置；已登录先过授权门再进目标页。"""
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        if signed_in(request):
            destination = safe_next_path(request)
            # 默认进首页时先走 /license：失效留在激活页，有效由该页 303 回 /
            if destination == '/':
                destination = '/license'
            return RedirectResponse(destination, status_code = 303)
        return FileResponse(app_settings.frontend_dir / 'login.html')

    @app.get('/setup', include_in_schema = False)
    def setup_page(request: Request):
        """设置页：已初始化就不允许再进来，按登录状态分流。

        已登录时同样先过授权门（/license），与首次设置成功后的跳转一致。
        """
        if initialized(request):
            if signed_in(request):
                return RedirectResponse('/license', status_code = 303)
            return RedirectResponse('/login', status_code = 303)
        return FileResponse(app_settings.frontend_dir / 'setup.html')

    @app.get('/pair', include_in_schema = False)
    def pair_page(request: Request):
        """配对页。

        `?scan=1` 表示用户主动要看扫码 / 手输配对界面，
        此时即使已登录或已配对也不跳走，否则用户没法再配一台设备。
        """
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        scan_link = request.query_params.get('scan') == '1'
        if signed_in(request) and not scan_link:
            return RedirectResponse(safe_next_path(request), status_code = 303)
        device = active_display(request)
        if device is not None and not scan_link:
            # 已配对且未强制扫码：直接送去它绑定的那块仪表盘。
            with request.app.state.database.session_factory() as database:
                paired_project = database.get(Project, device.project_id)
            if paired_project is not None:
                return RedirectResponse(display_path(paired_project.name), status_code = 303)
        if not request.app.state.license_service.allows('display'):
            raise HTTPException(status_code = 403, detail = '当前授权状态不允许添加中控设备。')
        return FileResponse(app_settings.frontend_dir / 'pair.html')

    @app.get('/', include_in_schema = False)
    async def home_page(request: Request):
        """编辑器主页：未初始化 → 设置页；未登录 → 登录页；授权非 ACTIVE → 授权页。

        三道门禁顺序固定。进入前联网确认绑定（走节流窗口，见 confirm_binding）。
        仅 ``ACTIVE`` 可进编辑器：``CONNECTION_WARNING`` 等宽限态虽然离线验签
        仍可能通过，但必须先经过授权页（展示告警 / 重新激活），避免「未激活
        却直接进主页」。心跳恢复为 ACTIVE 后授权页轮询会自动放行。

        这一条是 ``async def`` 里的同步查库（会话校验、读授权状态），一律转线程池：
        修复前它还会 ``confirm_binding(force=True)`` 跳过全部节流，于是「刷新几下
        面板」就能让多个请求一起排在并发的网络往返后面（B55）。
        """
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        if not await asyncio.to_thread(signed_in, request):
            return RedirectResponse('/login', status_code = 303)
        await request.app.state.license_service.confirm_binding()
        license_status = await asyncio.to_thread(request.app.state.license_service.status)
        if license_status.get('status') != 'ACTIVE' or not license_status.get('editorAllowed'):
            return RedirectResponse('/license', status_code = 303)
        return FileResponse(app_settings.frontend_dir / 'index.html')

    @app.get('/license', include_in_schema = False)
    async def license_page(request: Request):
        """授权页：仅在状态为 ACTIVE 且具备 editor 时回首页。

        CONNECTION_WARNING / STARTUP_VALIDATION_REQUIRED 等「离线宽限」状态
        仍可能 allows(editor)=True，但授权页必须留下来展示告警与重新激活入口——
        否则首次设置 / 登录后会被立刻 303 踢进编辑器，用户看不到「请重新激活」。
        """
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        if not await asyncio.to_thread(signed_in, request):
            return RedirectResponse('/login', status_code = 303)
        await request.app.state.license_service.confirm_binding()
        license_status = await asyncio.to_thread(request.app.state.license_service.status)
        if license_status.get('status') == 'ACTIVE' and license_status.get('editorAllowed'):
            return RedirectResponse('/', status_code = 303)
        return FileResponse(app_settings.frontend_dir / 'license.html')

    @app.get('/3d-studio', include_in_schema = False)
    async def three_d_studio_page(request: Request):
        """3D 户型工作室：需要登录 + editor 能力。"""
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        if not await asyncio.to_thread(signed_in, request):
            return login_redirect(request)
        await request.app.state.license_service.confirm_binding()
        license_status = await asyncio.to_thread(request.app.state.license_service.status)
        if license_status.get('status') != 'ACTIVE' or not license_status.get('editorAllowed'):
            return RedirectResponse('/license', status_code = 303)
        return FileResponse(app_settings.frontend_dir / '3d-studio.html')

    @app.get('/display/{project_name:path}', include_in_schema = False)
    def display_page(project_name: str, request: Request):
        """正式展示页（中控设备打开的那一页）。

        鉴权有两种合法身份：管理员会话，或已配对且正好绑定该项目的设备。
        不是这两种情况就送去配对页，而不是直接 401 —— 墙面设备没有键盘，
        报错页无法处理，跳配对页才能让用户扫码。
        """
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        device = active_display(request)
        viewer_signed_in = signed_in(request)
        if not viewer_signed_in and device is None:
            return pairing_redirect(request)
        if not request.app.state.license_service.allows('display'):
            raise HTTPException(status_code = 403, detail = '当前授权状态不允许打开正式显示页面。')
        with request.app.state.database.session_factory() as database:
            project = database.scalar(select(Project).where(Project.name == project_name))
        if project is None:
            raise HTTPException(status_code = 404, detail = '仪表盘不存在。')
        # 设备只能看自己绑定的项目；管理员会话不受此项限制。
        if not viewer_signed_in and (device is None or device.project_id != project.id):
            return pairing_redirect(request)
        response = FileResponse(app_settings.frontend_dir / 'display.html')
        if device is not None:
            # 打开展示页即顺带续期 Cookie，减少设备因长期不活跃而掉配对。
            token = display_token_from(request.cookies, app_settings)
            if token:
                set_display_cookie(response, app_settings, token)
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
    # 诊断中间件放在最后注册：它会包住上面所有路由（含 ha_proxy），
    # 从而也能记录代理请求的耗时与错误。
    app.middleware('http')(record_request_diagnostics)
    return app


# 模块级实例：uvicorn 的 `backend.app.main:app` 依赖它。
app = create_app()
