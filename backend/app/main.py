from __future__ import annotations

import asyncio
import hmac
import json
import os
import sys
import time
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text
from starlette.exceptions import HTTPException as StarletteHTTPException

from .admin_account import AdminAccountStore
from .api.auth import router as auth_router
from .api.assets import AssetCatalog, read_builtin_asset, router as assets_router
from .api.displays import router as displays_router
from .api.ha import router as ha_router, runtime_router
from .api.ha_proxy import router as ha_proxy_router
from .api.global_logs import router as global_logs_router
from .api.icons import router as icons_router
from .api.license import router as license_router
from .modules.interaction3d.api import router as interaction3d_router
from .api.projects import router as projects_router
from .api.studio3d import router as studio3d_router
from .api.ui_packs import router as ui_packs_router
from .auth_limiter import LoginAttemptLimiter
from .config import Settings, load_settings
from .database import Database
from .ha.service import HAConnectorService
from .license import LicenseService
from .updates import UpdateChecker, router as updates_router
from .migrations import restore_upgrade_backup, run_migrations
from .display_access import active_display_device, backfill_persistent_display_pairings
from .global_log import GlobalLogStore, _safe_text, event_context
from .models import DisplayDevice, LoginSession, Project, User
from .security import session_token_hash, set_display_cookie

SLOW_REQUEST_MILLISECONDS = 2000


def _record_lifecycle_failure(app: FastAPI, phase: str, error: Exception) -> None:
    message = f"HomeOS {'启动' if phase == 'startup' else '停止'}失败：{error}"
    details = traceback.format_exc()
    event_log = getattr(app.state, 'global_log', None)
    if event_log is not None:
        event_log.append('error', '系统后台', '系统', message, context={'phase': phase}, details=details)
    try:
        sys.stderr.write(f'{_safe_text(message, limit = 1000)}\n{_safe_text(details, limit = 12000)}\n')
    except OSError:
        pass


def migrate_secret_key(source: os.PathLike[str], target: os.PathLike[str]) -> bool:
    source_path = os.fspath(source)
    target_path = os.fspath(target)
    if os.path.abspath(source_path) == os.path.abspath(target_path):
        return False
    if not os.path.isfile(source_path):
        return False
    target_parent = os.path.dirname(target_path)
    os.makedirs(target_parent, mode = 0o700, exist_ok = True)
    try:
        os.chmod(target_parent, 0o700)
    except OSError:
        pass
    with open(source_path, 'rb') as source_file:
        payload = source_file.read()
    if os.path.exists(target_path):
        with open(target_path, 'rb') as target_file:
            target_payload = target_file.read()
        if not hmac.compare_digest(payload, target_payload):
            raise RuntimeError('新旧密钥内容不一致，已保留 /data 中的旧密钥。')
    else:
        descriptor = os.open(target_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        with open(target_path, 'rb') as target_file:
            target_payload = target_file.read()
        if not hmac.compare_digest(payload, target_payload):
            raise RuntimeError('新密钥写入验证失败，已保留 /data 中的旧密钥。')
    os.chmod(target_path, 0o600)
    os.unlink(source_path)
    return True


def create_app(settings: Settings | None = None, license_transport = None, license_endpoint_pool = None) -> FastAPI:
    app_settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            app.state.global_log = GlobalLogStore(app_settings.data_dir)
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
            migrate_secret_key(app_settings.secrets_dir / 'ha_credentials.key', app_settings.credential_key_path)
            migrate_secret_key(app_settings.secrets_dir / 'display_pairing_codes.key', app_settings.display_pairing_key_path)
            migrate_secret_key(app_settings.secrets_dir / 'license_credentials.key', app_settings.license_secret_key_path)
            upgrade_backup = run_migrations(app_settings)
            os.chmod(app_settings.database_path, 0o600)
            app.state.database = Database(app_settings.database_url)
            app.state.admin_account = AdminAccountStore(app_settings.admin_account_path)
            try:
                account_state = app.state.admin_account.initialize(app.state.database)
            except Exception:
                app.state.database.dispose()
                if upgrade_backup is not None:
                    restore_upgrade_backup(app_settings, upgrade_backup)
                raise
            app.state.settings = app_settings
            if account_state == 'migrated':
                app.state.global_log.append('success', '系统后台', '账号', '原管理员账号已自动迁移到独立账号文件')
            elif account_state == 'reset_required':
                app.state.global_log.append('warning', '系统后台', '账号', '检测到管理员账号文件已删除，等待重新设置账号和密码')
            backfill_persistent_display_pairings(app_settings, app.state.database)
            app.state.login_limiter = LoginAttemptLimiter()
            app.state.license_service = LicenseService(app_settings, app.state.database, transport = license_transport, endpoint_pool = license_endpoint_pool, event_log = app.state.global_log)
            await app.state.license_service.start()
            app.state.asset_catalog = AssetCatalog(app_settings.built_in_assets_dir, app_settings.user_assets_dir, app_settings.studio3d_exports_dir, app_settings.effect_variants_dir)
            app.state.ha_connector = HAConnectorService(app_settings, app.state.database, event_log = app.state.global_log)
            app.state.ha_connector.start()
            app.state.update_checker = UpdateChecker(app_settings.data_dir, app_settings.version, app_settings.update_channel, enabled = app_settings.update_checks_enabled)
            app.state.update_checker.start()
        except Exception as error:
            _record_lifecycle_failure(app, 'startup', error)
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
            raise
        app.state.global_log.append('success', '系统后台', '系统', f'HomeOS {app_settings.version} 已启动', context={'phase': 'ready'})
        try:
            yield
        finally:
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
            if shutdown_error is not None:
                raise shutdown_error
            app.state.global_log.append('info', '系统后台', '系统', 'HomeOS 已正常停止')

    app = FastAPI(title = 'HomeOS', version = app_settings.version, lifespan = lifespan, docs_url = None, redoc_url = None, openapi_url = None)
    app.state.settings = app_settings

    @app.exception_handler(Exception)
    async def unhandled_error_response(request: Request, _error: Exception):
        context = getattr(request.state, 'log_context', {})
        return PlainTextResponse('Internal Server Error', status_code = 500, headers = {'X-Request-ID': context['requestId']} if context.get('requestId') else None)

    @app.exception_handler(StarletteHTTPException)
    async def remember_http_error(request: Request, error: StarletteHTTPException):
        request.state.diagnostic_detail = error.detail
        return await http_exception_handler(request, error)

    @app.exception_handler(RequestValidationError)
    async def remember_validation_error(request: Request, error: RequestValidationError):
        request.state.diagnostic_detail = [
            {key: item[key] for key in ('loc', 'msg', 'type') if key in item}
            for item in error.errors()
        ]
        return await request_validation_exception_handler(request, error)

    async def record_request_diagnostics(request: Request, call_next):
        started = time.monotonic()
        diagnostic_path = '/api/hls/[stream]' if request.url.path.startswith('/api/hls/') else request.url.path
        context = {'requestId': uuid4().hex, 'method': request.method, 'path': diagnostic_path}
        request.state.log_context = context
        token = event_context.set(context)
        log_endpoint = request.url.path == '/api/v1/logs' or request.url.path.startswith('/api/v1/logs/')
        api_request = request.url.path.startswith('/api/')
        try:
            response = await call_next(request)
            response.headers['X-Request-ID'] = context['requestId']
            context.update(status = response.status_code, durationMs = round((time.monotonic() - started) * 1000, 1))
            log = getattr(request.app.state, 'global_log', None)
            if log is not None and api_request and not log_endpoint:
                detail = getattr(request.state, 'diagnostic_detail', None)
                if isinstance(detail, dict) and isinstance(detail.get('code'), str):
                    context['code'] = detail['code']
                if response.status_code >= 400 and not getattr(request.state, 'diagnostic_error_logged', False):
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
            context.update(status = 500, durationMs = round((time.monotonic() - started) * 1000, 1))
            log = getattr(request.app.state, 'global_log', None)
            if log is not None and not log_endpoint:
                log.append('error', '系统后台', '接口', f'接口运行异常：{request.method} {diagnostic_path} · {error}', context = context, details = traceback.format_exc())
            raise
        finally:
            event_context.reset(token)

    app.include_router(auth_router, prefix = '/api/v1')
    app.include_router(displays_router, prefix = '/api/v1')
    app.include_router(assets_router, prefix = '/api/v1')
    app.include_router(ha_router, prefix = '/api/v1')
    app.include_router(runtime_router, prefix = '/api/v1')
    app.include_router(projects_router, prefix = '/api/v1')
    app.include_router(studio3d_router, prefix = '/api/v1')
    app.include_router(ui_packs_router, prefix = '/api/v1')
    app.include_router(icons_router, prefix = '/api/v1')
    app.include_router(license_router, prefix = '/api/v1')
    app.include_router(interaction3d_router, prefix = '/api/v1')
    app.include_router(global_logs_router, prefix = '/api/v1')
    app.include_router(updates_router, prefix = '/api/v1')
    app.mount('/static', StaticFiles(directory = app_settings.frontend_dir / 'static'), name = 'static')

    def initialized(request: Request) -> bool:
        return request.app.state.admin_account.initialized

    def signed_in(request: Request) -> bool:
        account_user_id = request.app.state.admin_account.user_id
        if account_user_id is None:
            return False
        token = request.cookies.get(app_settings.cookie_name, '')
        if not token:
            return False
        with request.app.state.database.session_factory() as database:
            record = database.scalar(select(LoginSession).where(LoginSession.id_hash == session_token_hash(token)))
            if record is None or record.expires_at.replace(tzinfo = timezone.utc) <= datetime.now(timezone.utc):
                return False
            if record.user_id != account_user_id:
                return False
            user = database.get(User, record.user_id)
            return user is not None and user.is_active

    def active_display(request: Request) -> DisplayDevice | None:
        token = request.cookies.get(app_settings.display_cookie_name, '')
        if not token:
            return None
        with request.app.state.database.session_factory() as database:
            device = active_display_device(database, token)
            if device is None:
                return None
            database.expunge(device)
            return device

    def browser_authorized(request: Request) -> bool:
        return signed_in(request) or active_display(request) is not None

    public_static_files = {
        # 每个页面（含未激活时可访问的 login/setup/pair/license）都会先加载它，
        # 漏掉这个入口会让「未激活」状态反过来把客户端日志上报一起挡掉。
        '/static/client-log.js',
        '/static/pair.js',
        '/static/auth.css',
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
        return (
            path.startswith('/assets/builtin/')
            or path == '/assets/builtin'
            or (path.startswith('/static/') and path not in public_static_files)
        )

    def immutable_private_asset(path: str) -> bool:
        return path.startswith(('/api/v1/assets/effect-variant', '/api/v1/assets/user/', '/api/v1/assets/studio3d-export/'))

    @app.middleware('http')
    async def protect_assets_and_add_security_headers(request: Request, call_next):
        path = request.url.path
        if premium_asset(path):
            if not await asyncio.to_thread(browser_authorized, request):
                return Response('请先登录或完成中控设备配对。', status_code = 401, media_type = 'text/plain')
            if not await asyncio.to_thread(request.app.state.license_service.allows, 'assets'):
                return Response('当前授权状态不允许读取该资源。', status_code = 403, media_type = 'text/plain')
        response = await call_next(request)
        app_surface = (
            path == '/'
            or path in {'/pair', '/login', '/setup', '/license', '/3d-studio'}
            or path.startswith('/api/v1/')
            or path.startswith('/static/')
            or path.startswith('/assets/builtin/')
            or path.startswith('/display/')
            or path.startswith('/habridge/')
            or path.startswith('/projects/')
        )
        if app_surface:
            embedded_auto_diagram = path == '/3d-studio' and request.query_params.get('auto-diagram-embed') == '1'
            embedded_interaction3d = path == '/api/v1/modules/interaction3d/stage.html' and response.status_code == 200
            same_origin_frame = embedded_auto_diagram or embedded_interaction3d
            if path.startswith('/api/v1/assets/user/') and response.headers.get('content-type', '').startswith('image/svg+xml'):
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
            response.headers['Cache-Control'] = 'private, max-age=31536000, immutable' if request.query_params.get('v') else 'private, no-cache'
        elif (
            path in {'/', '/pair', '/login', '/setup', '/license', '/3d-studio'}
            or (path.startswith('/api/v1/') and not immutable_private_asset(path))
            or path.startswith('/display/')
            or path.startswith('/habridge/')
            or path.startswith('/projects/')
            or path.startswith('/static/3d-studio/')
            or path in {'/static/display.js', '/static/display.css'}
        ):
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return response

    def safe_next_path(request: Request) -> str:
        destination = request.query_params.get('next', '').strip()
        if destination.startswith('/') and not destination.startswith('//'):
            return destination
        return '/'

    def pairing_redirect(request: Request) -> RedirectResponse:
        destination = request.url.path
        if request.url.query:
            destination = f'{destination}?{request.url.query}'
        return RedirectResponse(f'/pair?next={quote(destination, safe = "")}', status_code = 303)

    def login_redirect(request: Request) -> RedirectResponse:
        destination = request.url.path
        if request.url.query:
            destination = f'{destination}?{request.url.query}'
        return RedirectResponse(f'/login?next={quote(destination, safe = "")}', status_code = 303)

    @app.get('/health/live', include_in_schema = False)
    async def health_live() -> dict[str, str]:
        return {'status': 'ok', 'version': app_settings.version}

    @app.get('/favicon.ico', include_in_schema = False)
    def favicon() -> FileResponse:
        return FileResponse(app_settings.frontend_dir / 'static' / 'homeos-favicon-h5.ico', media_type = 'image/x-icon')

    @app.get('/apple-touch-icon.png', include_in_schema = False)
    @app.get('/apple-touch-icon-precomposed.png', include_in_schema = False)
    def apple_touch_icon() -> FileResponse:
        return FileResponse(app_settings.frontend_dir / 'static' / 'homeos-icon-180-h5.png', media_type = 'image/png')

    @app.get('/assets/builtin/{asset_path:path}', include_in_schema = False)
    def built_in_asset(asset_path: str, request: Request) -> FileResponse:
        if not browser_authorized(request):
            raise HTTPException(status_code = 401, detail = '请先登录或完成中控设备配对。')
        return read_builtin_asset(asset_path, request)

    @app.get('/health/ready', include_in_schema = False)
    def health_ready(request: Request) -> dict[str, str | bool]:
        with request.app.state.database.engine.connect() as connection:
            connection.execute(text('SELECT 1'))
        return {'status': 'ready', 'initialized': initialized(request), 'version': app_settings.version}

    @app.get('/setup', include_in_schema = False)
    def setup_page(request: Request):
        if initialized(request):
            return RedirectResponse('/' if signed_in(request) else '/login', status_code = 303)
        return FileResponse(app_settings.frontend_dir / 'setup.html')

    @app.get('/login', include_in_schema = False)
    def login_page(request: Request):
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        if signed_in(request):
            return RedirectResponse(safe_next_path(request), status_code = 303)
        return FileResponse(app_settings.frontend_dir / 'login.html')

    @app.get('/pair', include_in_schema = False)
    def pair_page(request: Request):
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        scan_link = request.query_params.get('scan') == '1'
        if signed_in(request) and not scan_link:
            return RedirectResponse(safe_next_path(request), status_code = 303)
        device = active_display(request)
        if device is not None and not scan_link:
            return RedirectResponse(f'/display/{device.project_id}', status_code = 303)
        if not request.app.state.license_service.allows('display'):
            raise HTTPException(status_code = 403, detail = '当前授权状态不允许添加中控设备。')
        return FileResponse(app_settings.frontend_dir / 'pair.html')

    @app.get('/', include_in_schema = False)
    def home_page(request: Request):
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        if not signed_in(request):
            return RedirectResponse('/login', status_code = 303)
        if not request.app.state.license_service.allows('editor'):
            return RedirectResponse('/license', status_code = 303)
        return FileResponse(app_settings.frontend_dir / 'index.html')

    @app.get('/license', include_in_schema = False)
    def license_page(request: Request):
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        if not signed_in(request):
            return RedirectResponse('/login', status_code = 303)
        if request.app.state.license_service.allows('editor'):
            return RedirectResponse('/', status_code = 303)
        return FileResponse(app_settings.frontend_dir / 'license.html')

    @app.get('/3d-studio', include_in_schema = False)
    def three_d_studio_page(request: Request):
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        if not signed_in(request):
            return login_redirect(request)
        if not request.app.state.license_service.allows('editor'):
            return RedirectResponse('/license', status_code = 303)
        return FileResponse(app_settings.frontend_dir / '3d-studio.html')

    @app.get('/projects/{project_id}/3d-studio', include_in_schema = False)
    def legacy_three_d_studio_page(project_id: str, request: Request):
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        if not signed_in(request):
            return login_redirect(request)
        if not request.app.state.license_service.allows('editor'):
            return RedirectResponse('/license', status_code = 303)
        return RedirectResponse('/3d-studio', status_code = 308)

    @app.get('/display/{project_id}', include_in_schema = False)
    def display_page(project_id: str, request: Request):
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        device = active_display(request)
        if not signed_in(request) and (device is None or device.project_id != project_id):
            return pairing_redirect(request)
        if not request.app.state.license_service.allows('display'):
            raise HTTPException(status_code = 403, detail = '当前授权状态不允许打开正式显示页面。')
        response = FileResponse(app_settings.frontend_dir / 'display.html')
        if device is not None:
            set_display_cookie(response, app_settings, request.cookies[app_settings.display_cookie_name])
        return response

    @app.get('/habridge/{project_name:path}', include_in_schema = False)
    def named_display_page(project_name: str, request: Request):
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        device = active_display(request)
        if not signed_in(request) and device is None:
            return pairing_redirect(request)
        if not request.app.state.license_service.allows('display'):
            raise HTTPException(status_code = 403, detail = '当前授权状态不允许打开正式显示页面。')
        with request.app.state.database.session_factory() as database:
            project = database.scalar(select(Project).where(Project.name == project_name))
        if project is None:
            raise HTTPException(status_code = 404, detail = '仪表盘不存在。')
        if not signed_in(request) and (device is None or device.project_id != project.id):
            return pairing_redirect(request)
        response = FileResponse(app_settings.frontend_dir / 'display.html')
        if device is not None:
            set_display_cookie(response, app_settings, request.cookies[app_settings.display_cookie_name])
        return response

    @app.api_route('/api/v1/{unknown_path:path}', methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'], include_in_schema = False)
    def unknown_api_route(unknown_path: str) -> None:
        raise HTTPException(status_code = 404, detail = 'API 接口不存在。')

    @app.get('/component-lab', include_in_schema = False)
    def removed_component_lab() -> None:
        raise HTTPException(status_code = 404, detail = '页面不存在。')

    @app.get('/template-assets/{asset_path:path}', include_in_schema = False)
    def removed_template_assets(asset_path: str) -> None:
        raise HTTPException(status_code = 404, detail = '资源不存在。')

    app.include_router(ha_proxy_router)
    app.middleware('http')(record_request_diagnostics)
    return app


app = create_app()
