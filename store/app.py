"""应用工厂：把数据库、授权服务器、商店 API 与页面装配成一个 ASGI 应用。"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from store import __version__
from store.api import admin as admin_api
from store.api import alipay as alipay_api
from store.api import license as license_api
from store.api import pages as pages_api
from store.api import store as store_api
from store.config import StoreSettings, load_settings
from store.database import Database
from store.licensing import keys
from store.licensing.crypto import LeaseSigner, TransportCipher
from store.licensing.service import LicenseAuthority
from store.migrations import CURRENT_VERSION, ensure_current_release, rebrand_legacy_identifiers
from store.payments import resolve_provider
from store.site_settings import get_setting, heal_legacy_icon_paths

logger = logging.getLogger("store")


def _ensure_license_keys(settings: StoreSettings) -> None:
    """首次启动自动生成本地密钥，并打印指纹供客户端配置使用。"""
    if not settings.private_key_path.exists() or not settings.public_key_path.exists():
        result = keys.generate_ed25519(
            keys.KeyPairPaths(settings.private_key_path, settings.public_key_path)
        )
        logger.warning(
            "已生成授权签名密钥对：%s（sha256=%s）", result.public_path, result.sha256
        )
    if (
        not settings.transport_private_key_path.exists()
        or not settings.transport_public_key_path.exists()
    ):
        result = keys.generate_x25519(
            keys.KeyPairPaths(
                settings.transport_private_key_path, settings.transport_public_key_path
            )
        )
        logger.warning(
            "已生成授权传输密钥对：%s（sha256=%s）", result.public_path, result.sha256
        )


def create_app(settings: StoreSettings | None = None) -> FastAPI:
    settings = settings or load_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.product_images_dir.mkdir(parents=True, exist_ok=True)
    settings.license_keys_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    _ensure_license_keys(settings)

    database = Database(settings)
    database.create_all()

    # 图标改名后，老部署的 store_settings.logo_url 仍指向旧文件名，启动时自愈。
    # 品牌改名后，releases.product / products.product_code 仍写着旧标识，同样自愈。
    # 两处都必须先于任何请求执行：按新值查询查不到旧数据是静默失败。
    with database.session() as session:
        healed = heal_legacy_icon_paths(session)
        rebranded = rebrand_legacy_identifiers(session)
        # 硬切协议的那一版必须让「检查更新」看得到，否则老客户端被踢下线后
        # 没有任何可升级的目标版本 —— 这条记录同样在启动时兜底补写。
        released = ensure_current_release(session)
    if healed:
        logger.info("已把 %d 处旧图标路径归一为新文件名。", healed)
    if rebranded:
        logger.info("已把旧品牌标识归一为新值：%s", rebranded)
    if released:
        logger.info("已补写 %s 渠道 %s 发布记录。", "docker", CURRENT_VERSION)

    signer = LeaseSigner(settings.private_key_path, settings.license_key_id)
    transport = TransportCipher(
        settings.transport_private_key_path, settings.license_transport_key_id
    )
    authority = LicenseAuthority(settings, database, signer, transport)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info(
            "授权商店服务已启动：%s（数据目录 %s）", settings.public_base_url, settings.data_dir
        )
        yield
        database.dispose()

    app = FastAPI(
        title="HomeOS 授权商店与授权服务器",
        version=__version__,
        docs_url="/store-api-docs",
        redoc_url=None,
        openapi_url="/store-api-docs/openapi.json",
        lifespan=lifespan,
    )

    app.state.settings = settings
    app.state.database = database
    app.state.license_authority = authority

    def resolve_payment_provider(setting=None):
        return resolve_provider(settings, setting)

    def payment_provider_from_db():
        with database.session() as session:
            setting = get_setting(session)
            return setting.payment_provider or settings.payment_provider

    app.state.resolve_payment_provider = resolve_payment_provider
    app.state.payment_provider_from_db = payment_provider_from_db

    # ------------------------------------------------------------------ #
    # 静态资源
    # ------------------------------------------------------------------ #
    static_dir = settings.static_dir
    app.mount("/store-static", StaticFiles(directory=static_dir), name="store-static")
    # font.min.css 内部写死了 ../fonts/xxx，必须挂到根路径 /fonts 才能加载图标字体
    app.mount("/fonts", StaticFiles(directory=static_dir / "fonts"), name="fonts")

    # ------------------------------------------------------------------ #
    # 路由
    # ------------------------------------------------------------------ #
    app.include_router(license_api.router)
    app.include_router(store_api.router)
    app.include_router(alipay_api.router)
    app.include_router(admin_api.router)
    app.include_router(pages_api.router)

    @app.get("/healthz", include_in_schema=False)
    def healthz() -> dict:
        return {"status": "ok", "version": __version__, "port": settings.port}

    @app.exception_handler(Exception)
    async def unhandled_exception(_request: Request, error: Exception) -> JSONResponse:
        logger.exception("未处理的异常：%s", error)
        return JSONResponse({"detail": "服务器内部错误，请稍后重试。"}, status_code=500)

    return app
