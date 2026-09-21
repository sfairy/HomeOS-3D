"""FastAPI 应用装配：生命周期、中间件、页面路由与静态资源保护。

这个模块是后端的总入口，`create_app()` 把各子系统拼成一个应用：
- lifespan 里按顺序建目录、跑迁移、起授权 / HA 同步 / 更新检查三个后台服务；
- 两层 HTTP 中间件：一层做请求诊断日志，一层做资源鉴权与安全响应头；
- 一组页面路由各自判断「是否已初始化 / 是否登录 / 授权是否允许」，不合格就 303 跳转。

注意最后一行会直接构造 `app`，`uvicorn backend.main:app` 依赖它存在。
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
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from .security.access import (
    admin_token_from,
    check_admin_session,
    discard_expired_session,
    display_token_from,
    resolve_principal,
)
from .security.admin_account import AdminAccountStore
from .core.dependencies import DISPLAY_HEARTBEAT_THROTTLE_SECONDS
from .http.http_cache import NO_STORE, set_no_store_with_revalidation, set_public_immutable_cache, set_versioned_private_cache
from .api.auth import router as auth_router
from .api.assets import AssetCatalog, read_builtin_asset, router as assets_router, sweep_user_assets_for_app
from .api.displays import (
    PAIRING_CODE_KEYS,
    PAIRING_CODE_LIMIT,
    PAIRING_GLOBAL_LIMIT,
    PAIRING_SHARED_ADDRESS_LIMIT,
    router as displays_router,
)
from .api.ha import (
    HA_TEST_KEYS,
    HA_TEST_LIMIT,
    router as ha_router,
    runtime_router,
)
from .api.ha_proxy import MediaProxyCaches, router as ha_proxy_router
from .api.global_logs import router as global_logs_router
from .api.license import (
    LICENSE_ACTIVATION_KEYS,
    LICENSE_ACTIVATION_LIMIT,
)
from .api.appearance import router as appearance_router
from .core.appearance import AppearanceStore
from .api.icons import router as icons_router
from .api.license import router as license_router
from .modules.interaction3d.api import router as interaction3d_router
from .api.projects import router as projects_router
from .api.studio3d import migrate_legacy_scene, router as studio3d_router
from .security.auth_limiter import BoundedAttemptLimiter, LoginAttemptLimiter
from .http.body_guard import RequestBodyGuard
from .http.commissioning import has_rail, rail_states
from .http.page_shell import APPEARANCE_PATH, render_shell_page
from .config import Settings, load_settings
from .core.database import Database
from .ha.service import HAConnectorService
from .security.http_security import (
    forwarded_allow_ips_warning,
    forwarded_headers_present,
    is_direct_local,
    parse_trusted_proxies,
    same_origin_request,
)
from .license import LicenseService
from .observability.updates import UpdateChecker, endpoint_hosts, router as updates_router
from .core.migrations import run_migrations
from .security.display_access import active_display_device, display_path, resolve_display_project
from .observability.global_log import GlobalLogStore, RepeatedErrorTally, _safe_text, event_context
from .core.models import DisplayDevice, Project
from .security.security import set_display_cookie
from .security.setup_guard import SetupGuard, announce_setup_window

# 超过这个耗时的接口会在全局日志里记一条"响应缓慢"的警告。
SLOW_REQUEST_MILLISECONDS = 2000

#: 校验失败的中文原因表：键是 pydantic v2 的 error ``type``。
#: 为什么要有这张表：pydantic 的 ``msg`` 是**英文**且面向开发者，可以进日志但不适合直接给用户看；
#: 这份映射只覆盖本仓接口真的会产生的那几类，其余落到「取值不合法」—— 宁可笼统也不要猜错。
#: 与前端的分工：这里负责「这一次校验为什么没过」（而且知道约束值），前端负责从任意错误载荷里挑出
#: 最能说明问题的那句话，两边刻意不重叠。
_VALIDATION_REASON_TEXT = {
    'missing': '为必填项',
    'string_too_short': '长度不足',
    'string_too_long': '长度超限',
    'string_type': '必须是文本',
    'string_pattern_mismatch': '格式不符',
    'int_parsing': '必须是整数',
    'int_type': '必须是整数',
    'int_from_float': '必须是整数',
    'float_parsing': '必须是数字',
    'float_type': '必须是数字',
    'bool_parsing': '必须是布尔值',
    'bool_type': '必须是布尔值',
    'json_invalid': '请求体不是合法 JSON',
    'list_type': '必须是列表',
    'dict_type': '必须是对象',
    'url_parsing': '必须是合法链接',
    'url_scheme': '链接协议不支持',
    'datetime_parsing': '必须是合法时间',
    'date_parsing': '必须是合法日期',
    'uuid_parsing': '必须是合法标识',
    'greater_than': '超出允许范围',
    'greater_than_equal': '超出允许范围',
    'less_than': '超出允许范围',
    'less_than_equal': '超出允许范围',
    'enum': '取值不在允许范围内',
    'literal_error': '取值不在允许范围内',
    'value_error': '取值不合法',
}

#: 带上下界约束的那几类，把 ``ctx`` 里的边界值一起说出来（「长度不足（至少 8 个字符）」
#: 比「长度不足」可操作）。值是 ``(ctx 键, 前缀词, 单位)`` —— 方向词直接写在表里，
#: 不在拼装处按类型名做判断（那种判断是改一处漏一处的形态）。
_VALIDATION_BOUND_TEXT = {
    'string_too_short': ('min_length', '至少', ' 个字符'),
    'string_too_long': ('max_length', '最多', ' 个字符'),
    'greater_than': ('gt', '需大于', ''),
    'greater_than_equal': ('ge', '需不小于', ''),
    'less_than': ('lt', '需小于', ''),
    'less_than_equal': ('le', '需不大于', ''),
}

#: 请求位置的固定前缀（FastAPI 的 ``loc`` 首段）：对着用户显示「参数 body.x」没有意义。
_VALIDATION_LOCATION_PREFIXES = ('body', 'query', 'path', 'header', 'cookie')

#: 一条 message 里最多说几处错：字段一多（批量提交）会把提示撑成一屏，用户反而读不出重点。
_VALIDATION_MESSAGE_MAX_PARTS = 3


def _validation_error_message(errors: list[dict]) -> str:
    """把 FastAPI 的校验错误压成一句中文摘要，供前端直接展示。
    值得在后端做：只有这里知道**约束值**，前端拿到的 ``msg`` 是英文、``ctx`` 里的边界值也读不出，
    自己再维护 pydantic 类型表才是真正的重复。形态（前端优先取顶层 ``message``）如
    ``参数 activationCode 长度不足（至少 8 个字符）``；多处用「；」连，超过上限只报前几处并缀「等」。
    连一条都解析不出来时也返回兜底文案，绝不返回空串。
    """
    parts: list[str] = []
    for item in errors:
        if not isinstance(item, dict):
            continue
        location = [str(part) for part in (item.get('loc') or ())]
        # 首段是请求位置（body / query / path …）：去掉，剩下的用 `.` 拼成字段路径。
        if location and location[0] in _VALIDATION_LOCATION_PREFIXES:
            location = location[1:]
        field = '.'.join(location)
        error_type = str(item.get('type') or '')
        reason = _VALIDATION_REASON_TEXT.get(error_type, '取值不合法')
        bound = _VALIDATION_BOUND_TEXT.get(error_type)
        context = item.get('ctx') if isinstance(item.get('ctx'), dict) else {}
        if bound and bound[0] in context:
            reason = f'{reason}（{bound[1]} {context[bound[0]]}{bound[2]}）'
        parts.append(f'参数 {field} {reason}' if field else reason)
    if not parts:
        return '参数校验未通过。'
    if len(parts) > _VALIDATION_MESSAGE_MAX_PARTS:
        return '；'.join(parts[:_VALIDATION_MESSAGE_MAX_PARTS]) + ' 等。'
    return '；'.join(parts) + '。'


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
            # uvicorn 那层的信任范围由启动器透传（见 docker/start_app.py），是「对端不可
            # 伪造」的第一层：通配时本模块所有判断都不成立。只记警告不够，还要写 stderr ——
            # 只看 docker logs 的运维也得看得到。
            allow_ips_warning = forwarded_allow_ips_warning(
                os.environ.get('UVICORN_FORWARDED_ALLOW_IPS')
            )
            if allow_ips_warning:
                app.state.global_log.append('warning', '系统后台', '配置', allow_ips_warning)
                # stderr 已关闭时这句提醒写不出去：告警本身已进 event_log，不该因此中断启动。
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
            # 中控令牌的有效期必须大于心跳节流窗口，否则设备会在有机会续期之前就先过期
            # —— 表现是「配对完没几分钟就回配对页」。窗口值见 DISPLAY_HEARTBEAT_THROTTLE_SECONDS。
            display_ttl = int(getattr(app_settings, 'display_token_ttl_seconds', 0) or 0)
            if 0 < display_ttl <= DISPLAY_HEARTBEAT_THROTTLE_SECONDS:
                app.state.global_log.append(
                    'warning', '系统后台', '配置',
                    f'APP_DISPLAY_TOKEN_TTL_SECONDS={display_ttl} 小于中控心跳节流窗口（{DISPLAY_HEARTBEAT_THROTTLE_SECONDS // 60} 分钟）：'
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
            # 只能拿到共享地址（可信代理没传转发头）时的兜底桶：按 IP 那一档
            # 在这种情况下会让位，但不能整个跳过 —— 那样一个来源就能烧完跨来源预算，
            # 把所有人一起挡在配对页外。
            app.state.pairing_shared_limiter = LoginAttemptLimiter(*PAIRING_SHARED_ADDRESS_LIMIT)
            # 第三档：按被尝试的码记账。键是外部可控输入，因此用带键上限的一层
            # 包装 —— 否则「每次换一个码来试」就成了一条内存放大路径。
            app.state.pairing_code_limiter = BoundedAttemptLimiter(*PAIRING_CODE_LIMIT, max_keys = PAIRING_CODE_KEYS)
            # 激活尝试的失败预算（按账号，见 license.py）：此前这个端点每次都会打到授权
            # 服务器上、且不限次数，用户可控的激活码就是被猜的密文。
            app.state.license_activation_limiter = BoundedAttemptLimiter(
                *LICENSE_ACTIVATION_LIMIT, max_keys = LICENSE_ACTIVATION_KEYS)
            # HA 试连预算（按账号，见 ha.py）：这个端点让服务端按请求里的地址发一次出网请求，
            # 不限次数就等于给了管理员一个内网端口扫描器。
            app.state.ha_test_limiter = BoundedAttemptLimiter(
                *HA_TEST_LIMIT, max_keys = HA_TEST_KEYS)
            # 匿名 4xx 的形态合并计数：诊断中间件据此把「一次请求一行」压成
            # 「每形态每窗口一行」。放在这里而不是模块级全局，是为了让 create_app()
            # 多次调用（同一进程里先后建两个应用）互不共享状态。
            app.state.error_tally = RepeatedErrorTally()
            # 首次初始化的守卫：没带引导密钥的远程请求不允许抢建管理员账号。
            app.state.setup_guard = SetupGuard(app_settings.data_dir, app_settings.setup_token, event_log = app.state.global_log)
            # 站点配色：一个 JSON 文件，没有迁移、也没有表。失败只退回默认配色并记一条日志 ——
            # 配色是纯装饰，不该让服务起不来（那会把「改错了颜色」升级成「全家打不开中控」）。
            app.state.appearance = AppearanceStore(app_settings.appearance_path)
            app.state.appearance.load()
            if account_state in ('empty', 'reset_required'):
                # 打印到启动日志（stderr），密钥本身不进全局日志：全局日志可导出。
                announce_setup_window(account_state, app.state.setup_guard)
            else:
                # 已初始化：清掉残留的引导密钥文件，免得它以后又被当成有效凭证。
                app.state.setup_guard.discard_file()
            app.state.license_service = LicenseService(app_settings, app.state.database, transport = license_transport, endpoint_pool = license_endpoint_pool, event_log = app.state.global_log)
            await app.state.license_service.start()
            app.state.asset_catalog = AssetCatalog(app_settings.built_in_assets_dir, app_settings.user_assets_dir, app_settings.studio3d_exports_dir, app_settings.effect_variants_dir)
            # 用户素材目录巡检：回收崩溃残留的空壳目录、临时文件与孤儿变体缓存，并把用量
            # 报进全局日志。放启动时机是因为「上传中断 / 进程被杀」的残渣只有此刻才能被确定
            # 认定（进行中的上传有宽限期）。扫盘是同步重活进线程池，失败只记日志不阻断启动。
            try:
                await asyncio.to_thread(sweep_user_assets_for_app, app)
            except Exception as error:  # noqa: BLE001 - 巡检是附加工作，启动不能因它失败
                app.state.global_log.append('warning', '系统后台', '存储', f'用户素材巡检失败：{error}')
            # 3D 户型图的旧数据迁移：把旧版仪表盘文档里的 studio3d 字段搬成独立草稿文件。
            # 放在启动期一次性做，而不是挂在 GET /studio3d 上 —— 它写文件又改库，读接口带
            # 副作用会让「同时打开两个页面」被锁串行化，也让冷启动的第一个读请求多一次写盘。
            # 已有草稿文件时整体跳过（同一次启动内不必再扫全部文档）。
            if not app_settings.studio3d_draft_path.is_file():
                def _migrate_studio3d_draft() -> None:
                    with app.state.database.session_factory() as session:
                        migrate_legacy_scene(session, app_settings.studio3d_draft_path)
                try:
                    await asyncio.to_thread(_migrate_studio3d_draft)
                except Exception as error:  # noqa: BLE001 - 迁移是附加工作，失败不阻断启动
                    app.state.global_log.append(
                        'warning', '系统后台', '存储', f'3D 户型图旧数据迁移失败：{error}')
            app.state.ha_connector = HAConnectorService(
                app_settings,
                app.state.database,
                event_log = app.state.global_log,
                # 连接被重建 / 删除时作废媒体代理的两份记账：快照缓存里是上一台 HA 的
                # 画面，HLS 归属记的是上一台 HA 发的令牌。地址可以不变而实例已经换了一台，
                # 所以这件事只能由「连接被重建」这个事件告诉它。
                on_reconnect = app.state.media_proxy.clear,
            )
            # HA 同步是同步方法，内部自己起线程 / 任务，因此这里不 await。
            app.state.ha_connector.start()
            app.state.update_checker = UpdateChecker(
                app_settings.data_dir,
                app_settings.version,
                app_settings.update_channel,
                enabled = app_settings.update_checks_enabled,
                endpoints = app_settings.update_endpoints,
                wiki_url = app_settings.update_wiki_url,
            )
            app.state.update_checker.start()
            if app_settings.update_checks_enabled:
                # 打开外发检查就在启动日志里说清「发给谁、发什么」：这是本应用唯一一条
                # 主动外发的周期性请求，运维有权在启动输出里看到它。
                app.state.global_log.append(
                    'info', '系统后台', '配置',
                    f'更新检查已开启：每 6 小时向 {endpoint_hosts(app.state.update_checker.endpoints)} 上报本机版本与更新渠道；不需要时设 APP_UPDATE_CHECKS=0 关闭。',
                )
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
    # 媒体代理的两份进程内记账（快照缓存 + HLS 归属）挂在应用上而不是模块级：
    # create_app() 调两次时模块级的那一份会被两个应用共享（缓存串台、刷新任务绑在
    # 另一个事件循环上），而进程内单实例只是习惯，不是保证。
    app.state.media_proxy = MediaProxyCaches()

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
        # 响应体在标准 ``{"detail": [...]}`` 之上**追加**顶层 ``message``：``detail`` 原样保留
        # （OpenAPI 契约与既有解析方认它），中文摘要给用户看 —— 前端调用点只认字符串与
        # ``detail.message``（认不出 422 的数组形态），走标准处理器补键以保住状态码与编码。
        response = await request_validation_exception_handler(request, error)
        body = json.loads(response.body)
        body['message'] = _validation_error_message(error.errors())
        return JSONResponse(status_code=response.status_code, content=body)

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
    app.include_router(appearance_router, prefix = '/api/v1')
    app.include_router(updates_router, prefix = '/api/v1')
    # 静态资源挂载在 /static；是否允许匿名访问由下面的中间件按白名单决定。
    app.mount('/static', StaticFiles(directory = app_settings.frontend_dir / 'static'), name = 'static')

    def initialized(request: Request) -> bool:
        """系统是否已完成管理员初始化。"""
        return request.app.state.admin_account.initialized

    def signed_in(request: Request) -> bool:
        """是否为已登录的有效管理员会话。
        必须与 API 侧共用 ``access.check_admin_session``：独立实现容易漏掉绝对寿命判定，而滑动有效期
        能被续期一直往后推 —— 被盗 Cookie 只要还在用就能一直打开页面、取静态资源。页面路由要的是
        「未登录就跳转」而非 401，所以这里只返回布尔值；副作用与 API 侧一致，顺手清掉命中的过期会话行。
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
        令牌有效期必须由 ``active_display_device`` 判定：只查「配没配过」的话，
        展示页就绕过了 display_token_ttl / hard_ttl。
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

        两种身份必须由同一个解析入口给出：分别写成
        ``signed_in(request) or active_display(request) is not None`` 的话，
        一次请求要开两个数据库会话，而两边的判据又各自不完整。
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
        '/static/logging/client-log.js',
        '/static/auth/pair.js',
        '/static/auth/login.js',
        '/static/auth/setup.js',
        '/static/auth/license.js',
        # 恢复页（/pair 与 /display/* 在授权不可用时就地渲染的那一页）的入口脚本：
        # 那些地址恰恰是「授权不可用」时才会渲染它，所以必须在匿名白名单里 ——
        # 否则未登录时恢复页连脚本都加载不到，直接白屏。
        '/static/auth/license-recovery.js',
        '/static/auth/auth-shell.js',
        '/static/auth/pairing-link.js',
        '/static/auth/pairing-entry.js',
        # 匿名页脚本 import 的工具模块也必须在这里：模块图缺一环整页脚本都不执行
        # （login/setup/pair/license 未激活时就要能打开）。utils/ 只放纯工具、白名单
        # 按文件精确列；新增匿名页依赖的 utils 务必同步这里，否则未登录会白屏。
        '/static/utils/api-fetch.js',
        '/static/utils/request-timeout.js',
        # 授权激活页与初始化页都要把失败响应翻成人话（422 的原因只在 detail 数组里），
        # 所以这份共用的纯文本工具也在匿名图里 —— 它不碰 DOM、不发请求，
        # 符合上面「utils/ 只放与业务无关的纯工具」的口径。
        '/static/utils/api-error.js',
        # 401（会话过期）/ 403（授权受限）的判定与翻文案收敛在 utils/api-request.js，
        # 而 license.js 属于匿名图：漏了它，未激活时那个 import 会被 401 挡下，
        # 整页脚本都不执行（正是上面说的「页面能打开、脚本不跑」）。它只 import
        # api-error.js，不碰 DOM、不发请求，符合「utils/ 只放纯工具」的口径。
        '/static/utils/api-request.js',
        # 配对页的引导判定经 pairing-link.js → utils/apple-device.js
        # （苹果移动端判定只有这一份实现），所以它也在匿名图里。
        '/static/utils/apple-device.js',
        # 入口页的场景外壳（design/scene 的分发产物）。这几份必须在匿名白名单里：
        # 未初始化 / 未登录时正是靠它们渲染 /setup、/login、/pair、/license 四个页面，
        # 漏一个就是「页面能打开、样式全丢」——而问题只在未登录时才出现。
        '/static/auth/scene/fonts.css',
        '/static/auth/scene/page.css',
        '/static/auth/scene/scene.css',
        '/static/auth/scene/panel.css',
        # 景深脚本同理。它不是「锦上添花可以晚一步加载」的东西：脚本被 401 挡下时不会报错，
        # 只是场景退化成一张平面 —— 而入口页最常被看到的就是未登录那一眼。
        # 同目录的 appearance.js 不放行：它只服务登录后的编辑器与商店，匿名读它有暴露面。
        '/static/auth/scene/scene-depth.js',
        # 字体文件同样要放行：@font-face 的请求不带 Cookie 上下文可供白名单判断，
        # 被 401 挡下时页面只剩系统字体回退，肉眼几乎看不出是「字体没加载」。
        '/static/auth/scene/fonts/orbitron-700-latin.woff2',
        '/static/auth/scene/fonts/exo-2-400-latin.woff2',
        '/static/auth/scene/fonts/jetbrains-mono-400-latin.woff2',
        '/static/auth/scene/fonts/share-tech-mono-400-latin.woff2',
        '/static/assets/manifest/manifest.webmanifest',
        '/static/assets/manifest/dashboard.webmanifest',
        '/static/assets/icons/homeos-favicon.ico',
        '/static/assets/icons/homeos-favicon.svg',
        '/static/assets/icons/homeos-icon-16.png',
        '/static/assets/icons/homeos-icon-32.png',
        '/static/assets/icons/homeos-icon-48.png',
        '/static/assets/icons/homeos-icon-180.png',
        '/static/assets/icons/homeos-icon-192.png',
        '/static/assets/icons/homeos-icon-512.png',
        '/static/assets/manifest/manifest-h3.webmanifest',
        '/static/assets/manifest/manifest-h4.webmanifest',
        '/static/assets/manifest/manifest-h5.webmanifest',
        '/static/assets/icons/homeos-favicon-h3.ico',
        '/static/assets/icons/homeos-favicon-h3.svg',
        '/static/assets/icons/homeos-favicon-h4.ico',
        '/static/assets/icons/homeos-favicon-h4.svg',
        '/static/assets/icons/homeos-favicon-h5.ico',
        '/static/assets/icons/homeos-favicon-h5.svg',
        '/static/assets/icons/homeos-icon-16-h3.png',
        '/static/assets/icons/homeos-icon-16-h4.png',
        '/static/assets/icons/homeos-icon-16-h5.png',
        '/static/assets/icons/homeos-icon-32-h3.png',
        '/static/assets/icons/homeos-icon-32-h4.png',
        '/static/assets/icons/homeos-icon-32-h5.png',
        '/static/assets/icons/homeos-icon-48-h3.png',
        '/static/assets/icons/homeos-icon-48-h4.png',
        '/static/assets/icons/homeos-icon-48-h5.png',
        '/static/assets/icons/homeos-icon-180-h3.png',
        '/static/assets/icons/homeos-icon-180-h4.png',
        '/static/assets/icons/homeos-icon-180-h5.png',
        '/static/assets/icons/homeos-icon-192-h3.png',
        '/static/assets/icons/homeos-icon-192-h4.png',
        '/static/assets/icons/homeos-icon-192-h5.png',
        '/static/assets/icons/homeos-icon-512-h3.png',
        '/static/assets/icons/homeos-icon-512-h4.png',
        '/static/assets/icons/homeos-icon-512-h5.png',
        '/static/assets/icons/homeos-mark-black-orange.svg',
        '/static/assets/icons/homeos-mark-white-orange.svg'}

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

    # 页面路径集合。两处判定口径不同，因此是两个常量而不是一个：
    # - ``PUBLIC_PAGE_PATHS``：安全头作用面里的页面（不含 ``/``，首页由 ``app_surface`` 单独判）；
    # - ``PUBLIC_OR_ENTRY_PAGE_PATHS``：要禁止缓存的入口页面，比上面多一个 ``/``（首页）。
    # 新增页面时两处都要看：只进前面那个 = 首页之外的新页面不会被禁缓存。
    public_page_paths = {'/pair', '/login', '/setup', '/license', '/3d-studio'}
    public_or_entry_page_paths = public_page_paths | {'/'}

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
            set_versioned_private_cache(response, bool(request.query_params.get('v')))
        elif (
            path in public_or_entry_page_paths
            or (path.startswith('/api/v1/') and not immutable_private_asset(path))
            or path.startswith('/display/')
            or path.startswith('/static/3d-studio/')
            or path in {'/static/display/display.js', '/static/display/display.css'}
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
        return {'status': 'ok', 'version': app_settings.version}

    @app.get('/favicon.ico', include_in_schema = False)
    def favicon() -> FileResponse:
        """站点图标：浏览器标签页与书签栏使用。"""
        return FileResponse(app_settings.frontend_dir / 'static' / 'assets' / 'icons' / 'homeos-favicon-h5.ico', media_type = 'image/x-icon')

    @app.get('/apple-touch-icon.png', include_in_schema = False)
    @app.get('/apple-touch-icon-precomposed.png', include_in_schema = False)
    def apple_touch_icon() -> FileResponse:
        """iOS 添加到主屏时使用的 180×180 图标。

        同时挂在 /apple-touch-icon.png 与 /apple-touch-icon-precomposed.png 上：
        不同 iOS 版本会请求其中之一，缺了就会在添加到主屏时显示空白图标。
        """
        return FileResponse(app_settings.frontend_dir / 'static' / 'assets' / 'icons' / 'homeos-icon-180-h5.png', media_type = 'image/png')

    @app.get('/assets/builtin/{asset_path:path}', include_in_schema = False)
    def built_in_asset(asset_path: str, request: Request) -> FileResponse:
        """内置素材：这里再查一次身份，因为路径不在 /static 前缀下，
        不会被 StaticFiles 的中间件规则覆盖。"""
        if not browser_authorized(request):
            raise HTTPException(status_code = 401, detail = '请先登录或完成中控设备配对。')
        return read_builtin_asset(asset_path, request)

    def render_page(request: Request, filename: str, *, scene: bool = True) -> Response:
        """本应用所有 HTML 页面的统一出口（见 ``http/page_shell``）。

        收成一个闭包是为了让 ``app_settings``、``version`` 与配色版本号在调用处不必各写
        一遍 —— 九个路由各拼一次参数，迟早有一个漏带配色版本，而那一页会安静地不跟配色。

        入口页（五个）额外带上开通轨读数。读数**按访问者**算而不是按页面算：同一条
        ``/pair`` 对管理员与墙面板的进度不一样（见 ``http/commissioning``），所以这里
        多花一次会话查询是必要的，不是重复劳动 —— 路由那边即使刚查过，也不该把结论
        往下传：调用点分散在六个路由里，迟早有一个忘了传，而那一页会显示别人的进度。

        ``active_display`` 只在带设备 Cookie 时才查库，非设备访客（绝大多数入口页请求）
        是纯 Cookie 解析，所以这里无条件算它不会变成每次两查。
        """
        rail = None
        if has_rail(filename):
            rail = rail_states(
                filename,
                admin_session = signed_in(request),
                device = active_display(request) is not None,
            )
        return render_shell_page(
            app_settings.frontend_dir,
            filename,
            app_settings.version,
            request.app.state.appearance.revision,
            scene = scene,
            rail = rail,
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
        return render_page(request, 'login.html')

    @app.get('/setup', include_in_schema = False)
    def setup_page(request: Request):
        """设置页：已初始化就不允许再进来，按登录状态分流。

        已登录时同样先过授权门（/license），与首次设置成功后的跳转一致。
        """
        if initialized(request):
            if signed_in(request):
                return RedirectResponse('/license', status_code = 303)
            return RedirectResponse('/login', status_code = 303)
        return render_page(request, 'setup.html')

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
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        if not await asyncio.to_thread(signed_in, request):
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
        if not initialized(request):
            return RedirectResponse('/setup', status_code = 303)
        if not await asyncio.to_thread(signed_in, request):
            return RedirectResponse('/login', status_code = 303)
        await request.app.state.license_service.confirm_binding()
        license_status = await asyncio.to_thread(request.app.state.license_service.status)
        if license_status.get('status') == 'ACTIVE' and license_status.get('editorAllowed'):
            return RedirectResponse('/', status_code = 303)
        return render_page(request, 'license.html')

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
        return render_page(request, '3d-studio.html', scene = False)

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
    # 请求体的字节 / 嵌套深度上限：默认 1 MiB，草稿类写路由单独放宽（8 / 32 MiB），
    # 三个流式上传端点原样放行。注册在这里意味着它比同源闸门与资源鉴权更靠外：
    # FastAPI 是先读全请求体再进依赖与路由的，只有在中间件层拦才算拦得住
    # （未登录的匿名请求也能用它把内存打满）。
    app.add_middleware(RequestBodyGuard)
    # 诊断中间件放在最后注册：它会包住上面所有路由（含 ha_proxy），
    # 从而也能记录代理请求的耗时与错误。
    app.middleware('http')(record_request_diagnostics)
    return app


# 模块级实例：uvicorn 的 `backend.main:app` 依赖它。
app = create_app()
