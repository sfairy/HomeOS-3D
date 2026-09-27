"""响应面的三道中间件：诊断、资源鉴权 + 安全头、同源闸门。

从 main.py 拆出来的。这三段是"每个请求都要过一遍"的策略，与装配流程放在一起时
很难核对 —— 一个 1200 行的文件里既有"启动什么服务"又有"回什么响应头"。

**注册顺序是承重的**，改这里之前先读这段：

1. ``install_middlewares`` 注册的两个（资源鉴权 + 同源闸门）在路由挂载之前注册；
2. ``create_app`` 尾部按 `RequestBodyGuard` → `SelectiveGZipMiddleware` →
   `record_request_diagnostics` 的顺序注册，Starlette 的 `add_middleware` 是**后注册的包在外层**，
   所以体量闸门最靠外（它必须在 FastAPI 读全请求体之前拦下），诊断层包住全部路由。

``public_static_files`` 是匿名可访问的静态资源清单的唯一事实来源（见 frontend/public-static.json 与 app/public_assets.py）：
两边（资源鉴权中间件与页面路由）口径不同处都有注释说明；新增页面时两个页面路径常量都要看。
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

    规则：内置素材目录，以及不在白名单里的 /static/ 资源。
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
# - ``PUBLIC_PAGE_PATHS``：安全头作用面里的页面（不含 ``/``，首页由 ``app_surface`` 单独判）；
# - ``PUBLIC_OR_ENTRY_PAGE_PATHS``：要禁止缓存的入口页面，比上面多一个 ``/``（首页）。
# 新增页面时两处都要看：只进前面那个 = 首页之外的新页面不会被禁缓存。
public_page_paths = {'/pair', '/login', '/setup', '/license', '/3d-studio'}
public_or_entry_page_paths = public_page_paths | {'/'}


def install_middlewares(app: FastAPI, settings: Settings) -> None:
    """注册资源鉴权与同源闸门。

    settings 一路传给 request_context 里的身份判定（它要用令牌与数据目录）。
    匿名可访问的静态资源清单在这一层读一次（见 public_assets.py），逐请求不再碰磁盘。
    """
    public_files = load_public_static_files(settings.frontend_dir)
    # 入口页自己的 JS/CSS：内容一变必须立刻换新（见清单里的 alwaysRevalidate）。
    entry_page_assets = load_always_revalidate(settings.frontend_dir)
    @app.middleware('http')
    async def protect_assets_and_add_security_headers(request: Request, call_next):
        """资源鉴权 + 安全响应头 + 缓存策略，三件事合并在一个中间件里。

        鉴权只作用于 premium_asset，且要在 call_next 之前拒绝，
        否则文件内容已经发出去了才追加 401 是无意义的。
        """
        path = request.url.path
        if premium_asset(path, public_files):
            # 数据库查询是同步的，丢到线程池避免阻塞事件循环；两道门禁共用同一个会话
            # （见 asset_denial_status —— 原先是两次 to_thread、两个会话）。
            # 拒绝响应也打 no-store：虽然 401 / 403 本就不在可缓存之列，但中间层与浏览器
            # 对「凭据失败」的处理各不相同，把「不缓存」写死，避免拒绝页被留在缓存里。
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
            # 其余一律 frame-ancestors 'none'，防点击劫持。
            same_origin_frame = embedded_auto_diagram or embedded_interaction3d
            if path.startswith('/api/v1/assets/user/') and response.headers.get('content-type', '').startswith('image/svg+xml'):
                # 用户上传的 SVG 可能带脚本，用最严格的沙箱策略隔离。
                response.headers['Content-Security-Policy'] = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
                response.headers['Cross-Origin-Resource-Policy'] = 'same-origin'
            else:
                frame_ancestors = "'self'" if same_origin_frame else "'none'"
                # connect-src 里的 blob:/data: 是给 GLTFLoader 用的：模型贴图内嵌在 .glb/.gltf
                # 里时，它会把图片数据转成 blob:（或 data:）URL 再交给 ImageBitmapLoader，
                # 而后者走 fetch()，受 connect-src 管辖。漏掉这两个用户会看到贴图加载失败。
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
            # 没有版本戳就只能 no-cache，否则换了模型用户看不到。
            set_versioned_private_cache(response, bool(request.query_params.get('v')))
        elif (
            path in public_or_entry_page_paths
            or (path.startswith('/api/v1/') and not immutable_private_asset(path))
            or path.startswith('/display/')
            or path.startswith('/static/3d-studio/')
            or path in entry_page_assets
        ):
            # 入口页面与它们的 JS/CSS：内容一变就必须立刻换新，否则前端资源戳全对不上。
            set_no_store_with_revalidation(response)
        return response

    @app.middleware('http')
    async def require_same_origin_for_writes(request: Request, call_next):
        """所有改状态的 /api 请求必须同源（CSRF 第二道闸）。
        第一道闸是 SameSite=Lax + 只收 JSON 体（跨站表单会 422、跨站 fetch 会因没有 CORS 而 preflight
        失败）。这里补一道显式的 Origin/Referer 校验，这样日后新增「GET 写操作」或收 text/plain 的接口
        时不会立刻出现缺口。GET/HEAD/OPTIONS 不拦（读操作 + 预检），非 /api 路径不拦（页面无副作用）。
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
                    # 磁盘写入量。窗口首现时写一条、滚动时补写累计次数；按形态归并
                    # （数字/id 段换成占位符）防绕开合并，已自行记录错误的接口不重复记。
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
        # 不重置会把上个请求的 requestId 带到下个请求的日志里。
        event_context.reset(token)
