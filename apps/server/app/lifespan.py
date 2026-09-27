"""应用的生命周期：启动顺序、后台服务与逆序回滚。

从 main.py 拆出来的：它原先一个文件里混了装配、生命周期、中间件、页面路由四件事。

这里只做一件事 —— 把"启动什么、按什么顺序、失败怎么回滚"讲清楚，装配层拿到的是一个
已经绑好 settings 的 lifespan，不必知道它内部依赖谁。

为什么用工厂而不是模块级 lifespan：生命周期要用到 create_app 的 settings（数据目录、
草稿路径、各项开关），而 FastAPI 的 lifespan 只能接受一个参数 app。工厂把 settings 绑在
闭包里 —— 既不用全局变量，也让 create_app() 被调用两次时两份状态互不串台。
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

import os
import sys
import traceback


from ..security.admin_account import AdminAccountStore
from ..security.dependencies import DISPLAY_HEARTBEAT_THROTTLE_SECONDS
from ..api.assets_catalog import AssetCatalog, sweep_user_assets_for_app
from ..api.displays import (
    PAIRING_CODE_KEYS,
    PAIRING_CODE_LIMIT,
    PAIRING_GLOBAL_LIMIT,
    PAIRING_SHARED_ADDRESS_LIMIT,
)
from ..api.ha import (
    HA_TEST_KEYS,
    HA_TEST_LIMIT,
)
from ..api.media_proxy_support import (
    CameraStreamWarmer,
    dashboard_camera_entity_ids,
)
from ..api.license import (
    LICENSE_ACTIVATION_KEYS,
    LICENSE_ACTIVATION_LIMIT,
)
from ..core.appearance import AppearanceStore
from ..api.studio3d import migrate_legacy_scene
from ..security.auth_limiter import BoundedAttemptLimiter, LoginAttemptLimiter
from ..http.access_log import install_access_log_noise_filter
from ..config import Settings
from ..core.database import Database
from ..ha.service import HAConnectorService
from ..security.http_security import (
    configured_base_origin,
    forwarded_allow_ips_warning,
    parse_trusted_proxies,
)
from ..license import LicenseService
from ..observability.updates import UpdateChecker, endpoint_hosts
from ..core.migrations import run_migrations
from ..observability.global_log import GlobalLogStore, RepeatedErrorTally, _safe_text
from ..security.setup_guard import SetupGuard, announce_setup_window


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


def build_lifespan(settings: Settings, license_transport = None, license_endpoint_pool = None):
    """构造绑定好 settings 的 lifespan（说明见模块头）。"""
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """启动与停止流程。

        启动顺序是有依赖的：日志 → 目录权限 → 迁移 → 数据库 → 账号 →
        授权服务（它决定门禁）→ 资源目录 → HA 同步 → 更新检查。
        任一步抛异常都会逆序关闭已启动的服务，再向上抛出，让进程退出，
        而不是留下一个"半启动"的进程对外服务。
        """
        try:
            # 访问日志的第三方噪音过滤：**必须装在 lifespan 这一层**（uvicorn 会先
            # configure_logging、再导入应用，导入期装的过滤器会被 dictConfig 抹掉）。
            # 只挡「已知且已确认查无此路由」的那几类，见 apps/server/http/access_log.py 的模块头。
            install_access_log_noise_filter()
            # 日志最先建：后面每一步的失败都要能记进日志。
            app.state.global_log = GlobalLogStore(settings.data_dir)
            # 代理信任范围是安全配置：解析不了的值必须当场炸掉，不能静默退化成
            # 「谁也不信」（那会让限流悄悄按代理地址统计，等于所有人共用一个桶）。
            trusted_proxies = parse_trusted_proxies(tuple(settings.trusted_proxies))
            # uvicorn 那层的信任范围由启动器透传（见 ops/docker/start_app.py），是「对端不可
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
            if settings.app_base_url and not configured_base_origin(settings):
                # APP_BASE_URL 写错（最常见的是漏了协议头）时，Origin 校验会静默退回
                # 「只比较 Host」：运维以为对外地址已钉死，实际没有。提醒一句，不阻断启动。
                app.state.global_log.append(
                    'warning', '系统后台', '配置',
                    'APP_BASE_URL 解析不出 http(s)://主机 形态的来源（检查是否漏了协议头）：'
                    'Origin 校验将退回只比较请求的 Host。',
                )
            if not trusted_proxies and (settings.app_base_url.startswith('https://')):
                # 最常见的错配：HTTPS 反代后面却没配可信代理 —— 于是限流、审计里的
                # 客户端 IP 全是代理地址，且带转发头的请求还会被当成「本机直连」之外的
                # 情况处理。这里提醒一句，不阻断启动（业务仍可用，只是统计不准）。
                app.state.global_log.append(
                    'warning', '系统后台', '配置',
                    'APP_BASE_URL 是 https 但未配置 APP_TRUSTED_PROXIES：限流与审计会按反向代理地址统计，建议按部署方式配置。',
                )
            # 中控令牌的有效期必须大于心跳节流窗口，否则设备会在有机会续期之前就先过期
            # —— 表现是「配对完没几分钟就回配对页」。窗口值见 DISPLAY_HEARTBEAT_THROTTLE_SECONDS。
            display_ttl = int(getattr(settings, 'display_token_ttl_seconds', 0) or 0)
            if 0 < display_ttl <= DISPLAY_HEARTBEAT_THROTTLE_SECONDS:
                app.state.global_log.append(
                    'warning', '系统后台', '配置',
                    f'APP_DISPLAY_TOKEN_TTL_SECONDS={display_ttl} 小于中控心跳节流窗口（{DISPLAY_HEARTBEAT_THROTTLE_SECONDS // 60} 分钟）：'
                    '中控设备会在能续期之前就过期，请把有效期调到 5 分钟以上（默认 180 天）。',
                )
            display_hard_ttl = int(getattr(settings, 'display_token_hard_ttl_seconds', 0) or 0)
            if 0 < display_hard_ttl < display_ttl:
                app.state.global_log.append(
                    'warning', '系统后台', '配置',
                    f'APP_DISPLAY_TOKEN_HARD_TTL_SECONDS={display_hard_ttl} 小于滑动有效期 '
                    f'（{display_ttl}）：实际生效的是更短的硬上限，请确认是否符合预期。',
                )
            # 所有数据目录都收紧到 0700，密钥与用户图片不允许同机其它用户读取。
            settings.data_dir.mkdir(parents = True, exist_ok = True, mode = 0o700)
            os.chmod(settings.data_dir, 0o700)
            settings.user_assets_dir.mkdir(parents = True, exist_ok = True, mode = 0o700)
            os.chmod(settings.user_assets_dir, 0o700)
            settings.studio3d_dir.mkdir(parents = True, exist_ok = True, mode = 0o700)
            os.chmod(settings.studio3d_dir, 0o700)
            settings.studio3d_exports_dir.mkdir(parents = True, exist_ok = True, mode = 0o700)
            os.chmod(settings.studio3d_exports_dir, 0o700)
            settings.effect_variants_dir.mkdir(parents = True, exist_ok = True, mode = 0o700)
            os.chmod(settings.effect_variants_dir, 0o700)
            run_migrations(settings)
            # 数据库文件同样只给属主读写：里面有加密后的 HA 令牌与授权状态。
            os.chmod(settings.database_path, 0o600)
            app.state.database = Database(settings.database_url)
            app.state.admin_account = AdminAccountStore(settings.admin_account_path)
            account_state = app.state.admin_account.initialize(app.state.database)
            app.state.settings = settings
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
            app.state.setup_guard = SetupGuard(settings.data_dir, settings.setup_token, event_log = app.state.global_log)
            # 站点配色：一个 JSON 文件，没有迁移、也没有表。失败只退回默认配色并记一条日志 ——
            # 配色是纯装饰，不该让服务起不来（那会把「改错了颜色」升级成「全家打不开中控」）。
            app.state.appearance = AppearanceStore(settings.appearance_path)
            app.state.appearance.load()
            if account_state in ('empty', 'reset_required'):
                # 打印到启动日志（stderr），密钥本身不进全局日志：全局日志可导出。
                announce_setup_window(account_state, app.state.setup_guard)
            else:
                # 已初始化：清掉残留的引导密钥文件，免得它以后又被当成有效凭证。
                app.state.setup_guard.discard_file()
            app.state.license_service = LicenseService(settings, app.state.database, transport = license_transport, endpoint_pool = license_endpoint_pool, event_log = app.state.global_log)
            await app.state.license_service.start()
            app.state.asset_catalog = AssetCatalog(settings.built_in_assets_dir, settings.user_assets_dir, settings.studio3d_exports_dir, settings.effect_variants_dir)
            # 用户素材目录巡检：回收崩溃残留的空壳目录、临时文件与孤儿变体缓存，并把用量
            # 报进全局日志。放启动时机是因为「上传中断 / 进程被杀」的残渣只有此刻才能被确定
            # 认定（进行中的上传有宽限期）。扫盘是同步重活进线程池，失败只记日志不阻断启动。
            #
            # **不 await，放后台跑**：检查本身要扫整个用户素材目录，而 uvicorn 在 lifespan
            # 结束前不对外服务 —— await 它等于让每一次启动都先等一遍全目录扫描（素材多的部署
            # 是秒级）。它与请求路径没有耦合：进行中的上传有宽限期，晚几十毫秒开始没有任何
            # 语义变化，而失败依旧是记一条 warning。
            async def _sweep_user_assets() -> None:
                try:
                    await asyncio.to_thread(sweep_user_assets_for_app, app)
                except Exception as error:  # noqa: BLE001 - 巡检是附加工作，启动不能因它失败
                    app.state.global_log.append('warning', '系统后台', '存储', f'用户素材巡检失败：{error}')

            app.state.user_asset_sweep_task = asyncio.create_task(
                _sweep_user_assets(), name='user-asset-sweep'
            )
            # 3D 户型图的旧数据迁移：把旧版仪表盘文档里的 studio3d 字段搬成独立草稿文件。
            # 放在启动期一次性做，而不是挂在 GET /studio3d 上 —— 它写文件又改库，读接口带
            # 副作用会让「同时打开两个页面」被锁串行化，也让冷启动的第一个读请求多一次写盘。
            # 已有草稿文件时整体跳过（同一次启动内不必再扫全部文档）。
            if not settings.studio3d_draft_path.is_file():
                def _migrate_studio3d_draft() -> None:
                    with app.state.database.session_factory() as session:
                        migrate_legacy_scene(session, settings.studio3d_draft_path)
                try:
                    await asyncio.to_thread(_migrate_studio3d_draft)
                except Exception as error:  # noqa: BLE001 - 迁移是附加工作，失败不阻断启动
                    app.state.global_log.append(
                        'warning', '系统后台', '存储', f'3D 户型图旧数据迁移失败：{error}')
            def _clear_connection_derived_caches() -> None:
                """连接被重建 / 删除时，作废全部「跟着那一台 HA 走」的进程内缓存。

                媒体代理的两份记账（快照缓存里是上一台 HA 的画面，HLS 归属记的是上一台 HA
                发的令牌）与实体翻译表都要清：地址可以不变而实例已经换了一台，缓存自身发现不了。
                """
                app.state.media_proxy.clear()
                app.state.entity_translations.clear()
                # 保温池排在连接器之后创建，理论上这时一定已经就绪；真没有就跳过。
                warmer = getattr(app.state, 'camera_warmer', None)
                if warmer is not None:
                    warmer.forget_all()

            app.state.ha_connector = HAConnectorService(
                settings,
                app.state.database,
                event_log = app.state.global_log,
                # 重建 / 删除连接时作废从连接派生的进程内缓存，这件事只能由
                # 「连接被重建」这个事件告诉它。
                on_reconnect = _clear_connection_derived_caches,
                # 内外网端点切换同理：HLS 令牌与快照都来自旧那一路，缓存必须作废。
                # 这里只清媒体代理，**不动保温池** —— 它会自己按新端点重新起流，
                # 停了就再没人把它叫回来（详见 service.py 的参数说明）。
                on_endpoint_switch = app.state.media_proxy.clear,
            )
            # HA 同步是同步方法，内部自己起线程 / 任务，因此这里不 await。
            app.state.ha_connector.start()
            # 摄像头流保温池：go2rtc 在没有消费者时约 10 秒就回收整条 RTSP→HLS 管道，
            # 冷启动的第一个清单请求实测要 9.2 秒。先把仪表盘文档里引用到的摄像头登记上，
            # 让「重启后的第一次打开」也是热的；此后每次播放还会由 /api/camera_hls 追加登记。
            app.state.camera_warmer = CameraStreamWarmer(
                app.state.database, app.state.ha_connector, app.state.media_proxy
            )
            try:
                app.state.camera_warmer.want_all(
                    await asyncio.to_thread(dashboard_camera_entity_ids, app.state.database)
                )
            except Exception as error:  # noqa: BLE001 - 预热登记是附加工作，失败不阻断启动
                app.state.global_log.append(
                    'warning', '系统后台', '存储', f'摄像头流预热登记失败：{error}')
            app.state.update_checker = UpdateChecker(
                settings.data_dir,
                settings.version,
                settings.update_channel,
                enabled = settings.update_checks_enabled,
                endpoints = settings.update_endpoints,
                wiki_url = settings.update_wiki_url,
            )
            app.state.update_checker.start()
            if settings.update_checks_enabled:
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
        app.state.global_log.append('success', '系统后台', '系统', f'HomeOS {settings.version} 已启动', context={'phase': 'ready'})
        try:
            yield
        finally:
            # 正常停止也要逐个关闭，并把第一个失败留到最后抛出，
            # 保证其余服务仍然被尝试关闭。
            # 保温池先停：它只是后台任务，同步 cancel 即可，不必挤进下面那串 await 的循环。
            app.state.camera_warmer.stop()
            # 素材巡检同理：它是启动期排出去的后台任务，停机时同步取消即可。
            sweep_task = getattr(app.state, 'user_asset_sweep_task', None)
            if sweep_task is not None and not sweep_task.done():
                sweep_task.cancel()
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

    return lifespan
