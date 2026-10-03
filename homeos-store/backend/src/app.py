"""应用工厂：把数据库、授权服务器、商店 API 与页面装配成一个 ASGI 应用。"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

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
from .config import PROJECT_ROOT, StoreSettings, load_settings
from .core.bootstrap import ensure_default_products, ensure_default_settings
from .core.database import Database
from .core.migrations import run_migrations
from .licensing import keys
from .licensing.crypto import (
    KeyGeneration,
    KeyRegistry,
    LeaseSigner,
    TransportCipher,
)
from .licensing.service import LicenseAuthority
from .ops import incidents
from .ops.appearance import AppearanceStore
from .ops.release_info import CURRENT_VERSION, ensure_current_release
from .ops.site_settings import get_setting
from .payments import resolve_provider
from .payments.sweeper import (
    configure_sweep_loop,
    mark_sweep_loop_stopped,
    sweep_round,
    sweep_status,
)
from .security.access_log import install_access_log_noise_filter
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
from .security.schema_guard import inspect_schema, log_drift
from .security.setup_guard import SetupGuard, announce_setup_window

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
        logger.warning(
            "已生成授权签名密钥对：%s（sha256=%s）", result.public_path, result.sha256
        )
    if missing_transport:
        result = keys.generate_x25519(
            keys.KeyPairPaths(
                settings.transport_private_key_path, settings.transport_public_key_path
            )
        )
        logger.warning(
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


def build_key_registry(settings: StoreSettings):
    """按当前密钥组装密钥环。
    """
    return KeyRegistry(
        KeyGeneration(
            transport=TransportCipher(
                settings.transport_private_key_path,
                settings.license_transport_key_id,
            ),
            signer=LeaseSigner(settings.private_key_path, settings.license_key_id),
        )
    )


def create_app(settings: StoreSettings | None = None) -> FastAPI:
    settings = settings or load_settings()
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

    for step in run_migrations(settings):
        logger.info("数据库迁移：%s", step)

    database = Database(settings)

    schema_drift = inspect_schema(database.engine)
    log_drift(schema_drift)

    with database.session() as session:
        released = ensure_current_release(session)
        ensure_default_settings(session)
        ensure_default_products(session)
    if released:
        logger.info("已补写 %s 渠道 %s 发布记录。", "docker", CURRENT_VERSION)

    authority = LicenseAuthority(settings, database, build_key_registry(settings))
    setup_guard = SetupGuard(settings.data_dir, settings.setup_token)

    async def _payment_sweep_loop() -> None:
        """后台支付巡检循环。
        """
        interval = int(settings.payment_sweep_interval_seconds or 0)
        generation = configure_sweep_loop(interval)
        if interval <= 0:
            logger.info("支付巡检已关闭（STORE_PAYMENT_SWEEP_INTERVAL_SECONDS=0）")
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

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        install_access_log_noise_filter()
        logger.info(
            "授权商店服务已启动：%s（数据目录 %s）", settings.public_base_url, settings.data_dir
        )
        with database.session() as session:
            if not setup_api.admin_exists(session):
                setup_guard.ensure_token()
                announce_setup_window(setup_guard)
            else:
                setup_guard.discard_file()
        sweep_task = asyncio.create_task(_payment_sweep_loop())
        try:
            yield
        finally:
            sweep_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await sweep_task
            database.dispose()

    app = FastAPI(
        title="HomeOS 授权商店与授权服务器",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )

    app.state.settings = settings
    app.state.database = database
    app.state.schema_drift = schema_drift
    app.state.license_authority = authority
    app.state.setup_guard = setup_guard
    app.state.appearance = AppearanceStore(settings.appearance_path)
    app.state.appearance.load()

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

    app.add_middleware(RequestBodyGuard)

    app.add_middleware(SelectiveGZipMiddleware)

    @app.middleware("http")
    async def attach_security_headers(request: Request, call_next):
        """给所有响应补上安全头。
        """
        request.state.csp_nonce = new_csp_nonce()
        response = await call_next(request)
        for name, value in security_headers(request).items():
            response.headers.setdefault(name, value)
        return response

    def resolve_payment_provider(setting=None, *, name: str | None = None):
        """解析支付渠道。
        """
        if setting is None:
            with database.session() as lookup:
                setting = get_setting(lookup)
        if name:
            return resolve_provider(settings, setting, name_override=name)
        return resolve_provider(settings, setting)

    app.state.resolve_payment_provider = resolve_payment_provider

    static_dir = settings.static_dir
    app.mount("/store-static", StaticFiles(directory=static_dir), name="store-static")
    app.mount("/fonts", StaticFiles(directory=static_dir / "fonts"), name="fonts")

    app.include_router(license_api.router)
    app.include_router(store_api.router)
    app.include_router(alipay_api.router)
    app.include_router(wechat_api.router)
    app.include_router(admin_api.router)
    app.include_router(appearance_api.router)
    app.include_router(setup_api.router)
    app.include_router(pages_api.router)

    @app.get("/store-appearance.css", include_in_schema=False)
    def appearance_stylesheet(request: Request) -> Response:
        """商店站点配色样式表：内容就是当前配置展开出的 ``:root{…}``。
        """
        revision = app.state.appearance.revision
        has_version = request.query_params.get("v") == revision
        response = Response(
            content=app.state.appearance.css(),
            media_type="text/css",
            headers={"ETag": f'"{revision}"'},
        )
        response.headers["Cache-Control"] = (
            "public, max-age=31536000, immutable" if has_version else "no-cache"
        )
        return response

    @app.get("/healthz", include_in_schema=False)
    def healthz() -> dict:
        drift = app.state.schema_drift
        return {
            "status": "ok",
            "version": __version__,
            "port": settings.port,
            "paymentSweep": sweep_status(),
            "incidents": incidents.status(),
            "schema": {
                "ok": drift.clean,
                "summary": drift.summary(),
                "drift": None if drift.clean else drift.as_dict(),
            },
        }

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

    return app
