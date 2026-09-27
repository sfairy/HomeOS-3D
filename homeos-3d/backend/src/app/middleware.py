"""响应面的三道中间件：诊断、资源鉴权 + 安全头、同源闸门。
"""
from __future__ import annotations

import asyncio
import json
import time
import traceback
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response





from ..config import Settings
from ..http.http_cache import NO_STORE, set_no_store_with_revalidation, set_versioned_private_cache
from ..observability.global_log import event_context
from ..security.http_security import (
    forwarded_headers_present,
    same_origin_request,
)
from .public_assets import load_always_revalidate, load_public_static_files
from .request_context import asset_denial_status



# 超过这个耗时的接口会在全局日志里记一条"响应缓慢"的警告。
SLOW_REQUEST_MILLISECONDS = 2000



def premium_asset(path: str, public_files: frozenset[str]) -> bool:
    """判断该路径是否属于"需要登录且需要 assets 能力"的受保护资源。
    """
    return (
        path.startswith('/assets/builtin/')
        or path == '/assets/builtin'
        or (path.startswith('/static/') and path not in public_files)
    )

def immutable_private_asset(path: str) -> bool:
    """这些私有资源带不可变缓存（内容变即换 URL），因此不受 no-store 影响。"""
    return path.startswith(('/api/v1/assets/effect-variant', '/api/v1/assets/user/', '/api/v1/assets/studio3d-export/'))

# 页面路径集合。两处判定口径不同，因此是两个常量而不是一个：
public_page_paths = {'/pair', '/login', '/setup', '/license', '/3d-studio'}
public_or_entry_page_paths = public_page_paths | {'/'}


def install_middlewares(app: FastAPI, settings: Settings) -> None:
    """注册资源鉴权与同源闸门。
    """
    public_files = load_public_static_files(settings.frontend_dir)
    # 入口页自己的 JS/CSS：内容一变必须立刻换新（见清单里的 alwaysRevalidate）。
    entry_page_assets = load_always_revalidate(settings.frontend_dir)
    @app.middleware('http')
    async def protect_assets_and_add_security_headers(request: Request, call_next):
        """资源鉴权 + 安全响应头 + 缓存策略，三件事合并在一个中间件里。
        """
        path = request.url.path
        if premium_asset(path, public_files):
            denial_status = await asyncio.to_thread(asset_denial_status, request, settings)
            if denial_status is not None:
                reason = (
                    '请先登录或完成中控设备配对。'
                    if denial_status == 401
                    else '当前授权状态不允许读取该资源。'
                )
                denial = Response(reason, status_code = denial_status, media_type = 'text/plain')
                set_no_store_with_revalidation(denial)
                return denial
        response = await call_next(request)
        # 需要加安全头的页面与接口集合（静态资源与展示页也包含在内）。
        app_surface = (
            path == '/'
            or path in public_page_paths
            or path.startswith('/api/v1/')
            or path.startswith('/static/')
            or path.startswith('/assets/builtin/')
            or path.startswith('/display/')
        )
        if app_surface:
            embedded_auto_diagram = path == '/3d-studio' and request.query_params.get('auto-diagram-embed') == '1'
            embedded_interaction3d = path == '/api/v1/modules/interaction3d/stage.html' and response.status_code == 200
            # 只有这两个页面允许被同源 iframe 嵌入（展示页里嵌 3D 舞台），
            same_origin_frame = embedded_auto_diagram or embedded_interaction3d
            if path.startswith('/api/v1/assets/user/') and response.headers.get('content-type', '').startswith('image/svg+xml'):
                # 用户上传的 SVG 可能带脚本，用最严格的沙箱策略隔离。
                response.headers['Content-Security-Policy'] = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
                response.headers['Cross-Origin-Resource-Policy'] = 'same-origin'
            else:
                frame_ancestors = "'self'" if same_origin_frame else "'none'"
                response.headers['Content-Security-Policy'] = f"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob: data: ws: wss:; worker-src 'self' blob:; frame-src 'self'; frame-ancestors {frame_ancestors}; base-uri 'none'; form-action 'self'"
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
            set_versioned_private_cache(response, bool(request.query_params.get('v')))
        elif (
            path in public_or_entry_page_paths
            or (path.startswith('/api/v1/') and not immutable_private_asset(path))
            or path.startswith('/display/')
            or path.startswith('/static/3d-studio/')
            or path in entry_page_assets
        ):
            set_no_store_with_revalidation(response)
        return response

    @app.middleware('http')
    async def require_same_origin_for_writes(request: Request, call_next):
        """所有改状态的 /api 请求必须同源（CSRF 第二道闸）。
        """
        if (
            request.url.path.startswith('/api/')
            and request.method not in {'GET', 'HEAD', 'OPTIONS'}
            and not same_origin_request(request)
        ):
            return JSONResponse(
                {'detail': '跨站请求已被拒绝（来源校验未通过）。'},
                status_code = 403,
                headers = {'Cache-Control': NO_STORE},
            )
        return await call_next(request)

async def record_request_diagnostics(request: Request, call_next):
    """诊断中间件：分配 requestId、记录慢请求与错误、注入日志上下文。
    """
    started = time.monotonic()
    diagnostic_path = '/api/hls/[stream]' if request.url.path.startswith('/api/hls/') else request.url.path
    context = {'requestId': uuid4().hex, 'method': request.method, 'path': diagnostic_path}
    request.state.log_context = context
    # 放进 ContextVar，深层代码 append 日志时会自动带上这些字段。
    token = event_context.set(context)
    log_endpoint = request.url.path == '/api/v1/logs' or request.url.path.startswith('/api/v1/logs/')
    api_request = request.url.path.startswith('/api/')
    # 只提示一次：请求带了转发头但没配可信代理，说明前面有反代而限流/审计只能
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
                if response.status_code >= 500:
                    # 5xx 是我们的问题：逐条记 error 并带上细节，便于按 requestId 定位。
                    log.append(
                        'error',
                        '系统后台',
                        '接口',
                        f'接口返回错误：{request.method} {diagnostic_path} · HTTP {response.status_code}',
                        context = context,
                        details = detail if isinstance(detail, str) else (json.dumps(detail, ensure_ascii = False) if detail is not None else None),
                    )
                else:
                    # 4xx 走形态合并计数：路径外部可随手编，逐条写等于把扫描量放大成
                    summary = request.app.state.error_tally.note(
                        request.method, response.status_code, request.url.path
                    )
                    if summary is not None:
                        log.append('warning', '系统后台', '接口', summary, context = context)
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
        event_context.reset(token)
