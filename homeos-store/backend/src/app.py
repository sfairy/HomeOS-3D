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
from .ops import incidents
from .api import admin as admin_api
from .api import alipay as alipay_api
from .api import wechat as wechat_api
from .api import appearance as appearance_api
from .api import license as license_api
from .api import pages as pages_api
from .api import setup as setup_api
from .api import store as store_api
from .config import PROJECT_ROOT, StoreSettings, load_settings
from .core.database import Database
from .licensing import keys
from .licensing.crypto import (
    KeyGeneration,
    KeyRegistry,
    LeaseSigner,
    TransportCipher,
)
from .licensing.service import LicenseAuthority
from .payments import resolve_provider
from .payments.sweeper import (
    configure_sweep_loop,
    mark_sweep_loop_stopped,
    sweep_round,
    sweep_status,
)
from .core.bootstrap import ensure_default_products, ensure_default_settings
from .ops.appearance import AppearanceStore
from .ops.release_info import CURRENT_VERSION, ensure_current_release
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
from .security.schema_guard import ensure_schema
from .security.setup_guard import SetupGuard, announce_setup_window
from .ops.site_settings import get_setting

logger = logging.getLogger("src")


def _ensure_license_keys(settings: StoreSettings) -> None:
    """确保商店密钥存在；默认密钥目录下还校验仓库根 keys/ 公钥镜像。
    """
    default_keys_dir = (PROJECT_ROOT / "keys" / "local").resolve()
    using_default = settings.license_keys_dir.resolve() == default_keys_dir
    key_preparation_hint = (
        "本地开发请在仓库根运行 python ops/start.py："
        "它会生成 homeos-store/keys/local 私钥并把公钥镜像到仓库根 keys/，"
        "同时按公钥文件字节设置主应用的指纹校验；"
        "容器部署则由 ops/docker/start_store.py 启动时完成同样的准备。"
        "要让旧客户端在轮换后继续可用一段时间，"
        "保留成对齐全的 *.previous.pem（四件套齐全时重叠窗口自动开启）。"
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
    """按当前密钥 +（可选的）上一代密钥组装密钥环。
    """
    active = KeyGeneration(
        transport=TransportCipher(
            settings.transport_private_key_path,
            settings.license_transport_key_id,
        ),
        signer=LeaseSigner(settings.private_key_path, settings.license_key_id),
    )
    generations = [active]
    previous_paths = settings.previous_key_paths
    if previous_paths is not None:
        previous_private, previous_public, previous_transport_private, previous_transport_public = previous_paths
        generations.append(
            KeyGeneration(
                transport=TransportCipher(
                    previous_transport_private,
                    keys.key_id_from_public(previous_transport_public),
                ),
                signer=LeaseSigner(
                    previous_private, keys.key_id_from_public(previous_public)
                ),
            )
        )
        logger.warning(
            "授权密钥重叠窗口开启：新签发的租约用 %s，旧客户端仍可用 %s。"
            "窗口结束（删除 *.previous.pem）后它们会立即失效。",
            active.lease_key_id,
            generations[-1].lease_key_id,
        )
    return KeyRegistry(generations)


def create_app(settings: StoreSettings | None = None) -> FastAPI:
    settings = settings or load_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.product_images_dir.mkdir(parents=True, exist_ok=True)
    settings.license_keys_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    _ensure_license_keys(settings)
    # 代理信任范围是安全配置：解析不了的值必须当场炸掉，不能静默退化成「谁也不信」
    trusted_proxies = parse_trusted_proxies(tuple(settings.trusted_proxies))
    if not trusted_proxies and settings.public_base_url.startswith("https://"):
        logger.warning(
            "STORE_BASE_URL 是 https 但未配置 STORE_TRUSTED_PROXIES："
            "限流与授权记录会按反向代理地址统计，建议按部署方式配置。"
        )

    database = Database(settings)
    database.create_all()

    # create_all 只建缺的表，对已存在的表**不会加列**。新增字段必须在这里补上，
    applied = ensure_schema(database.engine)
    if applied:
        logger.info("已补齐 %d 项库结构变更：%s", len(applied), "、".join(applied))

    # 确保 docker 渠道存在当前版本的发布记录：「检查更新」查的正是这张表。
    with database.session() as session:
        released = ensure_current_release(session)
        # 商品目录、站点配置——首次部署就该就位的默认数据，幂等补齐，不覆盖运营改过的字段。
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
        # 代号要一路带到 sweep_round / mark_sweep_loop_stopped：测试里会反复建 app，
        generation = configure_sweep_loop(interval)
        if interval <= 0:
            logger.info("支付巡检已关闭（STORE_PAYMENT_SWEEP_INTERVAL_SECONDS=0）")
            return
        # 首轮稍作延后：启动瞬间还在建表/补列，没必要立刻去抢数据库
        delay = min(interval, 5)
        try:
            while True:
                await asyncio.sleep(delay)
                delay = interval
                try:
                    await asyncio.to_thread(sweep_round, database, settings, generation)
                except Exception:  # noqa: BLE001 - 单轮异常不能让巡检整体退出
                    logger.exception("支付巡检本轮失败，将在 %d 秒后重试", interval)
        finally:
            mark_sweep_loop_stopped(generation)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # 访问日志的第三方噪音过滤必须在 lifespan 这一层装：uvicorn 会先
        install_access_log_noise_filter()
        logger.info(
            "授权商店服务已启动：%s（数据目录 %s）", settings.public_base_url, settings.data_dir
        )
        # 首次初始化窗口：库里还没有管理员时，把引导密钥打印到启动日志（stderr），
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

    #: OpenAPI / docs 永远关闭，避免暴露全部端点与鉴权结构。
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
    app.state.license_authority = authority
    app.state.setup_guard = setup_guard
    # 商店站点配色：一个 JSON 文件，没有迁移、也没有表。失败只退回默认配色 ——
    app.state.appearance = AppearanceStore(settings.appearance_path)
    app.state.appearance.load()

    @app.middleware("http")
    async def require_same_origin_for_writes(request: Request, call_next):
        """改状态的商店/后台请求必须同源（CSRF 第二道闸）。
        """
        path = request.url.path
        # 只提示一次：请求带了转发头但没配可信代理，说明前面有反代而限流与授权记录
        if not getattr(app.state, "proxy_warning_logged", False) and forwarded_headers_present(request):
            if not trusted_proxies:
                app.state.proxy_warning_logged = True
                logger.warning(
                    "检测到请求带反向代理转发头，但未配置 STORE_TRUSTED_PROXIES："
                    "限流与授权记录会按代理地址统计。请按实际部署配置可信代理的 IP 或网段。"
                )
        #: 渠道回调必须豁免来源校验：它们是**服务器到服务器**的请求，既没有 Origin
        #: 也没有 Referer（若有代理补了一个，反而会被这道闸门拒掉）。
        #: 安全性由各渠道自己的验签负责 —— 那才是回调的信任根。
        callback_paths = frozenset({alipay_api.NOTIFY_PATH, wechat_api.NOTIFY_PATH})
        guarded = (
            path.startswith("/store/v1/") or path.startswith("/store-admin/v1/")
        ) and path not in callback_paths
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

    # 请求体字节上限。注册在这里意味着它比同源闸门与路由更靠外：FastAPI 是先读全请求体
    app.add_middleware(RequestBodyGuard)

    # 响应压缩：**先注册 = 更靠里**，压的是路由产出（含 /store-static 下的主题与后台脚本）
    app.add_middleware(SelectiveGZipMiddleware)

    # 安全头中间件必须**最后**注册：``@app.middleware`` 往栈顶插，最后注册的那层才
    @app.middleware("http")
    async def attach_security_headers(request: Request, call_next):
        """给所有响应补上安全头。
        """
        request.state.csp_nonce = new_csp_nonce()
        response = await call_next(request)
        # setdefault：端点自己设过的同名头以端点的为准，这里只负责「没有就补上」。
        for name, value in security_headers(request).items():
            response.headers.setdefault(name, value)
        return response

    def resolve_payment_provider(setting=None, *, name: str | None = None):
        """解析支付渠道。
        """
        if setting is None:
            # 没带站点配置就从库里现读一份：支付宝凭据可以在后台改，绝不能把
            with database.session() as lookup:
                setting = get_setting(lookup)
        if name:
            return resolve_provider(settings, setting, name_override=name)
        return resolve_provider(settings, setting)

    def payment_provider_from_db():
        with database.session() as session:
            setting = get_setting(session)
            return setting.payment_provider or settings.payment_provider

    app.state.resolve_payment_provider = resolve_payment_provider
    app.state.payment_provider_from_db = payment_provider_from_db

        # 静态资源
    static_dir = settings.static_dir
    app.mount("/store-static", StaticFiles(directory=static_dir), name="store-static")
    # font.min.css 内部写死了 ../fonts/xxx，必须挂到根路径 /fonts 才能加载图标字体
    app.mount("/fonts", StaticFiles(directory=static_dir / "fonts"), name="fonts")

        # 路由
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
        # status 只表示「进程活着」，探活机器不会被巡检状态带偏；巡检与 incidents
        return {
            "status": "ok",
            "version": __version__,
            "port": settings.port,
            "paymentSweep": sweep_status(),
            "incidents": incidents.status(),
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
