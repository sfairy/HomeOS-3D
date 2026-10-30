"""应用工厂：把数据库、授权服务器、商店 API 与页面装配成一个 ASGI 应用。"""

from __future__ import annotations

import asyncio
import contextlib
import ipaddress
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import FastAPI, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .api import admin as admin_api
from .api import alipay as alipay_api
from .api import appearance as appearance_api
from .api import license as license_api
from .api import pages as pages_api
from .api import setup as setup_api
from .api import store as store_api
from .api import wechat as wechat_api
from .config import PROJECT_ROOT, StoreSettings, _warn_order_ttl_against_qr, load_settings
from .core.bootstrap import ensure_default_products, ensure_default_settings
from .core.console_log import configure_console_logging
from .core.database import Database
from .core.schema import prepare_schema
from .licensing import keys
from .licensing.crypto import (
    KeyGeneration,
    KeyRegistry,
    LeaseSigner,
    TransportCipher,
    as_naive_utc,
)
from .licensing.service import LicenseAuthority
from .ops import incidents
from .ops.appearance import AppearanceStore
from .ops.site_settings import get_setting
from .payments import resolve_provider
from .payments.channels import enabled_channel_names
from .payments.sweeper import (
    configure_sweep_loop,
    mark_sweep_loop_stopped,
    sweep_round,
    sweep_status,
)
from .security.access_log import install_access_log_filters
from .security.body_guard import RequestBodyGuard
from .security.compression import SelectiveGZipMiddleware
from .security.request_security import (
    error_page_html,
    forwarded_headers_present,
    new_csp_nonce,
    parse_trusted_proxies,
    prefers_html,
    same_origin_request,
    security_headers,
)
from .security.setup_guard import SetupGuard, announce_setup_window
from .security.static_cache import StaticAssetCacheMiddleware

logger = logging.getLogger("src")


def _ensure_license_keys(settings: StoreSettings) -> None:
    """确保商店密钥存在；默认密钥目录下还校验仓库根 keys/ 公钥镜像。
    """
    default_keys_dir = (PROJECT_ROOT / "keys" / "local").resolve()
    using_default = settings.license_keys_dir.resolve() == default_keys_dir
    key_preparation_hint = (
        "本地开发请在仓库根运行 bun run dev："
        "它会生成 homeos-store/keys/local 私钥并把公钥镜像到仓库根 keys/，"
        "同时按公钥文件字节设置主应用的指纹校验；"
        "容器部署则由 ops/docker/start_store.py 启动时完成同样的准备。"
    )

    missing_signing = (
        not settings.private_key_path.exists() or not settings.public_key_path.exists()
    )
    missing_transport = (
        not settings.transport_private_key_path.exists()
        or not settings.transport_public_key_path.exists()
    )
    if using_default and (missing_signing or missing_transport):
        raise RuntimeError(f"缺少商店授权密钥（{settings.license_keys_dir}）。{key_preparation_hint}")

    if missing_signing:
        result = keys.generate_ed25519(
            keys.KeyPairPaths(settings.private_key_path, settings.public_key_path)
        )
        # 首启生成属于正常流程（不是「有问题」），用 INFO：WARNING 会被巡检与告警按「需要人看」处理
        logger.info(
            "已生成授权签名密钥对：%s（sha256=%s）", result.public_path, result.sha256
        )
    if missing_transport:
        result = keys.generate_x25519(
            keys.KeyPairPaths(
                settings.transport_private_key_path, settings.transport_public_key_path
            )
        )
        logger.info(
            "已生成授权传输密钥对：%s（sha256=%s）", result.public_path, result.sha256
        )

    if not using_default:
        return

    client_keys = (settings.repo_root / "keys").resolve()
    for source, name in (
        (settings.public_key_path, "license-public.pem"),
        (settings.transport_public_key_path, "license-transport-public.pem"),
    ):
        mirror = client_keys / name
        if not mirror.exists():
            raise RuntimeError(
                f"客户端公钥镜像缺失：{mirror}。商店密钥与仓库根 keys/ 必须逐字节一致。{key_preparation_hint}"
            )
        if source.read_bytes() != mirror.read_bytes():
            raise RuntimeError(
                f"客户端公钥镜像与商店密钥不一致：{mirror}。{key_preparation_hint}"
            )


def _load_retired_generation(settings: StoreSettings) -> KeyGeneration | None:
    """读退役代密钥（轮换时把上一代重命名加 ``.retired``）；四个文件齐了才算一代。

    退役代的两个私钥都必须还在：只留传输私钥，老客户端能连上却验不过回包的签名；
    只留签名私钥，又根本解不开它的请求。缺任何一个都当成「没有退役代」并告警 ——
    半套密钥出现在密钥环里只会让失败现象变得难查。
    """
    paths = (
        settings.retired_transport_private_key_path,
        settings.retired_transport_public_key_path,
        settings.retired_private_key_path,
        settings.retired_public_key_path,
    )
    present = [path for path in paths if path.is_file()]
    if not present:
        return None
    if len(present) != len(paths):
        missing = "、".join(str(path.name) for path in paths if not path.is_file())
        logger.warning(
            "退役代授权密钥不完整（缺少 %s）：本次不启用退役代接收。轮换时请把上一代的"
            "四个 pem 一并重命名加 .retired 后缀。",
            missing,
        )
        return None

    retired_at = _retired_at(settings)
    # 退役窗口内同时接受两代密钥是**设计内的正常状态**（不是异常），故用 INFO 说明事实
    logger.info(
        "启用退役代授权密钥：退役时间 %sZ（接收窗口 %d 天）",
        retired_at.isoformat(),
        settings.license_key_retirement_days,
    )
    return KeyGeneration(
        transport=TransportCipher(
            settings.retired_transport_private_key_path,
            keys.key_id_from_public(settings.retired_transport_public_key_path),
        ),
        signer=LeaseSigner(
            settings.retired_private_key_path,
            keys.key_id_from_public(settings.retired_public_key_path),
        ),
        retired_at=retired_at,
    )


def _retired_at(settings: StoreSettings) -> datetime:
    """退役时刻（naive UTC，与库里其余时间同口径）：优先读标记文件，缺失时退回公钥 mtime。

    mtime 只是「重命名那一刻」的近似，够用：窗口以天计，不是秒。标记文件存在是为了
    让运维能显式声明（例如提前把密钥换掉、推迟公布退役时间）。
    """
    marker = settings.retired_key_marker_path
    try:
        text = marker.read_text(encoding="utf-8").strip()
    except OSError:
        text = ""
    if text:
        try:
            parsed = datetime.fromisoformat(f"{text[:-1]}+00:00" if text.endswith("Z") else text)
        except ValueError:
            logger.warning("退役时刻标记无法解析（%s）：改用公钥文件 mtime。", marker)
        else:
            return as_naive_utc(parsed)
    stamp = settings.retired_public_key_path.stat().st_mtime
    return datetime.fromtimestamp(stamp, tz=UTC).replace(tzinfo=None)


def build_key_registry(settings: StoreSettings):
    """按当前密钥组装密钥环（在用代 + 仍在窗口内的退役代）。
    """
    retired = _load_retired_generation(settings)
    return KeyRegistry(
        KeyGeneration(
            transport=TransportCipher(
                settings.transport_private_key_path,
                settings.license_transport_key_id,
            ),
            signer=LeaseSigner(settings.private_key_path, settings.license_key_id),
        ),
        retired=[retired] if retired is not None else (),
        retirement_window_seconds=settings.license_key_retirement_days * 24 * 3600,
    )


@dataclass(frozen=True)
class _StoreRuntime:
    """``create_app`` 装配期准备好的运行时零件（随后挂到 ``app.state``）。"""

    settings: StoreSettings
    database: Database
    authority: LicenseAuthority
    setup_guard: SetupGuard
    trusted_proxies: tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]


def _prepare_settings(settings: StoreSettings) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    """建好数据目录、确保密钥齐备，并解析可信代理网段。"""
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.product_images_dir.mkdir(parents=True, exist_ok=True)
    settings.license_keys_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    _ensure_license_keys(settings)
    trusted_proxies = parse_trusted_proxies(tuple(settings.trusted_proxies))
    if not trusted_proxies and settings.public_base_url.startswith("https://"):
        logger.warning(
            "STORE_BASE_URL 是 https 但未配置 STORE_TRUSTED_PROXIES："
            "限流与授权记录会按反向代理地址统计，建议按部署方式配置。"
        )
    return trusted_proxies


def _open_database(settings: StoreSettings) -> Database:
    """建库、打开数据库并补齐种子数据。"""
    prepare_schema(settings)
    database = Database(settings)

    with database.session() as session:
        ensure_default_settings(session)
        ensure_default_products(session)
        # 环境变量未设、但后台站点配置选了支付宝时，也要给出 TTL 过短告警。
        setting = get_setting(session)
        enabled = enabled_channel_names(setting, settings)
        if "alipay" in enabled and (settings.payment_provider or "").strip().lower() != "alipay":
            _warn_order_ttl_against_qr(settings, enabled_providers=enabled)
    return database


def _build_runtime(settings: StoreSettings) -> _StoreRuntime:
    """把这份进程要用的一整套运行时零件准备好。"""
    trusted_proxies = _prepare_settings(settings)
    database = _open_database(settings)
    authority = LicenseAuthority(settings, database, build_key_registry(settings))
    setup_guard = SetupGuard(settings.data_dir, settings.setup_token)
    return _StoreRuntime(
        settings=settings,
        database=database,
        authority=authority,
        setup_guard=setup_guard,
        trusted_proxies=trusted_proxies,
    )


def _make_payment_sweep_loop(runtime: _StoreRuntime):
    """造一个后台支付巡检循环：按 ``STORE_PAYMENT_SWEEP_INTERVAL_SECONDS`` 逐轮巡检。"""
    settings = runtime.settings
    database = runtime.database

    async def _payment_sweep_loop() -> None:
        """后台支付巡检循环。
        """
        interval = int(settings.payment_sweep_interval_seconds or 0)
        generation = configure_sweep_loop(interval)
        if interval <= 0:
            logger.debug("支付巡检已关闭（STORE_PAYMENT_SWEEP_INTERVAL_SECONDS=0）")
            return
        delay = min(interval, 5)
        try:
            while True:
                await asyncio.sleep(delay)
                delay = interval
                try:
                    await asyncio.to_thread(sweep_round, database, settings, generation)
                except Exception:
                    logger.exception("支付巡检本轮失败，将在 %d 秒后重试", interval)
        finally:
            mark_sweep_loop_stopped(generation)

    return _payment_sweep_loop


def _make_lifespan(runtime: _StoreRuntime):
    """造应用生命周期钩子：启动时拉起后台任务，退出时取消任务并释放数据库。"""
    settings = runtime.settings
    database = runtime.database
    setup_guard = runtime.setup_guard
    payment_sweep_loop = _make_payment_sweep_loop(runtime)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # reload 的 worker 不继承 run.py 装好的日志配置，这里再装一次，见 core/console_log.py。
        configure_console_logging()
        # 降噪要在下面那行启动日志之前生效：首装时引导密钥横幅紧随其后，只打印一次，
        # 而客户机轮询与健康检查几秒就能把它顶出 docker logs 的可见范围。
        install_access_log_filters()
        logger.info(
            "服务已启动：%s（数据目录 %s）", settings.public_base_url, settings.data_dir
        )
        with database.session() as session:
            if not setup_api.admin_exists(session):
                setup_guard.ensure_token()
                announce_setup_window(setup_guard)
            else:
                setup_guard.discard_file()
        sweep_task = asyncio.create_task(payment_sweep_loop())
        try:
            yield
        finally:
            sweep_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await sweep_task
            database.dispose()

    return lifespan


def _attach_runtime_state(app: FastAPI, runtime: _StoreRuntime) -> None:
    """把运行时零件挂到 ``app.state``（路由与中间件都从这里取）。"""
    app.state.settings = runtime.settings
    app.state.database = runtime.database
    app.state.license_authority = runtime.authority
    app.state.setup_guard = runtime.setup_guard
    app.state.appearance = AppearanceStore(runtime.settings.appearance_path)
    app.state.appearance.load()


def _install_write_guard(app: FastAPI, runtime: _StoreRuntime) -> None:
    """改状态的商店/后台请求必须同源（CSRF 第二道闸）。"""
    trusted_proxies = runtime.trusted_proxies

    @app.middleware("http")
    async def require_same_origin_for_writes(request: Request, call_next):
        """改状态的商店/后台请求必须同源（CSRF 第二道闸）。
        """
        path = request.url.path
        if not getattr(app.state, "proxy_warning_logged", False) and forwarded_headers_present(request):
            if not trusted_proxies:
                app.state.proxy_warning_logged = True
                logger.warning(
                    "检测到请求带反向代理转发头，但未配置 STORE_TRUSTED_PROXIES："
                    "限流与授权记录会按代理地址统计。请按实际部署配置可信代理的 IP 或网段。"
                )
        callback_paths = frozenset({alipay_api.NOTIFY_PATH, wechat_api.NOTIFY_PATH})
        guarded = path.startswith(("/store/v1/", "/store-admin/v1/")) and path not in callback_paths
        if (
            guarded
            and request.method not in {"GET", "HEAD", "OPTIONS"}
            and not same_origin_request(request)
        ):
            return JSONResponse(
                {"detail": "跨站请求已被拒绝（来源校验未通过）。"},
                status_code=403,
                headers={"Cache-Control": "no-store"},
            )
        return await call_next(request)


def _install_security_headers(app: FastAPI) -> None:
    """给所有响应补上安全头。"""

    @app.middleware("http")
    async def attach_security_headers(request: Request, call_next):
        """给所有响应补上安全头。
        """
        request.state.csp_nonce = new_csp_nonce()
        response = await call_next(request)
        for name, value in security_headers(request).items():
            response.headers.setdefault(name, value)
        return response


def _make_provider_resolver(runtime: _StoreRuntime):
    """造支付渠道解析函数：``setting`` 省略时按当前站点配置查库。"""
    settings = runtime.settings
    database = runtime.database

    def resolve_payment_provider(setting=None, *, name: str | None = None):
        """解析支付渠道。
        """
        if setting is None:
            with database.session() as lookup:
                setting = get_setting(lookup)
        if name:
            return resolve_provider(settings, setting, name_override=name)
        return resolve_provider(settings, setting)

    return resolve_payment_provider


def _mount_routes(app: FastAPI, runtime: _StoreRuntime) -> None:
    """挂载静态素材与各 API 资源组（注册顺序即匹配优先级，勿调整）。"""
    static_dir = runtime.settings.static_dir
    app.mount("/store-static", StaticFiles(directory=static_dir), name="store-static")
    app.mount("/fonts", StaticFiles(directory=static_dir / "fonts"), name="fonts")

    app.include_router(license_api.router)
    app.include_router(store_api.router)
    app.include_router(alipay_api.router)
    app.include_router(wechat_api.router)
    app.include_router(admin_api.router)
    app.include_router(appearance_api.router)
    app.include_router(setup_api.router)


def _install_appearance_stylesheet(app: FastAPI) -> None:
    """注册商店站点配色样式表路由。"""

    @app.get("/store-appearance.css", include_in_schema=False)
    def appearance_stylesheet(request: Request) -> Response:
        """商店站点配色样式表：内容就是当前配置展开出的 ``:root{…}``。

        稳定 URL：下发 ``no-cache`` + ``ETag``，由 ``StaticAssetCacheMiddleware`` 在
        ``If-None-Match`` 命中时回 304（不再用 ``?v=`` 版本戳）。
        """
        revision = app.state.appearance.revision
        return Response(
            content=app.state.appearance.css(),
            media_type="text/css",
            headers={"ETag": f'"{revision}"', "Cache-Control": "no-cache"},
        )


def _install_healthz(app: FastAPI, runtime: _StoreRuntime) -> None:
    """注册健康检查路由。"""

    @app.get("/healthz", include_in_schema=False)
    def healthz() -> dict:
        return {
            "status": "ok",
            "version": __version__,
            "port": runtime.settings.port,
            "paymentSweep": sweep_status(),
            "incidents": incidents.status(),
        }


def _install_exception_handler(app: FastAPI) -> None:
    """注册未处理异常的统一出口。"""

    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, error: Exception) -> Response:
        """未处理异常统一出口（按调用方想要的格式回答）。
        """
        logger.exception("未处理的异常：%s", error)
        if prefers_html(request):
            request.state.csp_nonce = new_csp_nonce()
            response: Response = HTMLResponse(
                error_page_html(), status_code=500, headers={"Cache-Control": "no-store"}
            )
            for name, value in security_headers(request).items():
                response.headers.setdefault(name, value)
            return response
        return JSONResponse({"detail": "服务器内部错误，请稍后重试。"}, status_code=500)


def create_app(settings: StoreSettings | None = None) -> FastAPI:
    """装配 ASGI 应用：先备好运行时零件，再逐层挂中间件、路由与页面外壳。"""
    # 先把日志装好再建库：``_build_runtime`` 里的 ``prepare_schema`` 会打迁移进度与快照路径，
    # 而 reload 的 worker 不会执行 ``run.py`` 的 ``main()``（只有 lifespan 才装日志，晚于建库），
    # 于是那几行会落到 ``logging.lastResort``——没有时间戳、没有「授权商店」上下文，
    # 在启动日志里像是别的东西插进来。装在这里（幂等）只影响时序，不改任何输出格式。
    configure_console_logging()
    settings = settings or load_settings()
    runtime = _build_runtime(settings)

    app = FastAPI(
        title="HomeOS 授权商店与授权服务器",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=_make_lifespan(runtime),
    )

    _attach_runtime_state(app, runtime)
    _install_write_guard(app, runtime)

    app.add_middleware(RequestBodyGuard)

    # 稳定 URL 的静态 / 素材响应：no-cache + ETag 回源校验（替代 ?v= 版本戳）。
    # 置于 GZip 内层，命中条件请求时先定 304，再交给压缩层。
    app.add_middleware(StaticAssetCacheMiddleware)
    app.add_middleware(SelectiveGZipMiddleware)

    _install_security_headers(app)
    app.state.resolve_payment_provider = _make_provider_resolver(runtime)
    _mount_routes(app, runtime)
    _install_appearance_stylesheet(app)
    _install_healthz(app, runtime)
    _install_exception_handler(app)

    # 页面外壳（含 SPA catch-all）必须最后注册：它会把所有未命中路径兜走，
    # 所以要在 /healthz、/store-appearance.css 与各 API 路由之后。
    app.include_router(pages_api.router)

    return app
