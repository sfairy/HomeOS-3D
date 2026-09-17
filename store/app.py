"""应用工厂：把数据库、授权服务器、商店 API 与页面装配成一个 ASGI 应用。"""

from __future__ import annotations

import asyncio
import contextlib
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
from store.config import STORE_ROOT, StoreSettings, load_settings
from store.database import Database
from store.licensing import keys
from store.licensing.crypto import LeaseSigner, TransportCipher
from store.licensing.service import LicenseAuthority
from store.payments import resolve_provider
from store.payments.sweeper import (
    configure_sweep_loop,
    mark_sweep_loop_stopped,
    sweep_round,
    sweep_status,
)
from store.release_info import CURRENT_VERSION, ensure_current_release
from store.request_security import (
    forwarded_headers_present,
    parse_trusted_proxies,
    same_origin_request,
)
from store.schema_guard import ensure_schema
from store.site_settings import get_setting

logger = logging.getLogger("store")


def _ensure_license_keys(settings: StoreSettings) -> None:
    """确保商店密钥存在；默认密钥目录下还校验仓库根 keys/ 公钥镜像。

    临时目录（smoke / e2e）仍可自动生成密钥且不强制镜像。
    默认 ``store/keys/local`` 缺密钥或与 ``keys/`` 不一致时直接失败，
    引导运行 ``python -m store.tools.gen_keys``，避免「商店一把钥、客户端另一把」的静默激活失败。
    """
    default_keys_dir = (STORE_ROOT / "keys" / "local").resolve()
    using_default = settings.license_keys_dir.resolve() == default_keys_dir
    gen_keys_hint = (
        "请在仓库根运行：.venv-store/bin/python -m store.tools.gen_keys"
        "（会生成 store/keys/local 私钥并同步公钥到仓库根 keys/；"
        "若轮换了密钥，还需把打印的 sha256 写入 APP_LICENSE_*_PUBLIC_KEY_SHA256"
        " 或 backend/app/config.py 的 DEFAULT_LICENSE_* 常量）。"
    )

    missing_signing = (
        not settings.private_key_path.exists() or not settings.public_key_path.exists()
    )
    missing_transport = (
        not settings.transport_private_key_path.exists()
        or not settings.transport_public_key_path.exists()
    )
    if using_default and (missing_signing or missing_transport):
        raise RuntimeError(f"缺少商店授权密钥（{settings.license_keys_dir}）。{gen_keys_hint}")

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

    client_keys = (settings.project_root / "keys").resolve()
    for source, name in (
        (settings.public_key_path, "license-public.pem"),
        (settings.transport_public_key_path, "license-transport-public.pem"),
    ):
        mirror = client_keys / name
        if not mirror.exists():
            raise RuntimeError(
                f"客户端公钥镜像缺失：{mirror}。商店密钥与仓库根 keys/ 必须逐字节一致。{gen_keys_hint}"
            )
        if source.read_bytes() != mirror.read_bytes():
            raise RuntimeError(
                f"客户端公钥镜像与商店密钥不一致：{mirror}。{gen_keys_hint}"
            )


def create_app(settings: StoreSettings | None = None) -> FastAPI:
    settings = settings or load_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.product_images_dir.mkdir(parents=True, exist_ok=True)
    settings.license_keys_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    _ensure_license_keys(settings)
    # 代理信任范围是安全配置：解析不了的值必须当场炸掉，不能静默退化成「谁也不信」
    # （那会让限流与授权记录里的客户端地址全变成代理地址）。
    trusted_proxies = parse_trusted_proxies(tuple(settings.trusted_proxies))
    if not trusted_proxies and settings.public_base_url.startswith("https://"):
        logger.warning(
            "STORE_BASE_URL 是 https 但未配置 STORE_TRUSTED_PROXIES："
            "限流与授权记录会按反向代理地址统计，建议按部署方式配置。"
        )

    database = Database(settings)
    database.create_all()

    # create_all 只建「缺的表」，对已存在的表**不会加列**。新增字段必须在这里
    # 补上，否则老部署要等到某条特定 API 被调用时才以 no such column 崩掉。
    applied = ensure_schema(database.engine)
    if applied:
        logger.info("已补齐 %d 项库结构变更：%s", len(applied), "、".join(applied))

    # 确保 docker 渠道存在当前版本的发布记录：「检查更新」查的正是这张表，
    # 缺了它客户端就没有可升级的目标版本。
    with database.session() as session:
        released = ensure_current_release(session)
    if released:
        logger.info("已补写 %s 渠道 %s 发布记录。", "docker", CURRENT_VERSION)

    signer = LeaseSigner(settings.private_key_path, settings.license_key_id)
    transport = TransportCipher(
        settings.transport_private_key_path, settings.license_transport_key_id
    )
    authority = LicenseAuthority(settings, database, signer, transport)

    async def _payment_sweep_loop() -> None:
        """后台支付巡检循环。

        每轮都跑在 ``asyncio.to_thread`` 里：对渠道的调用是阻塞 I/O，
        直接在事件循环里发同步请求会把整个服务卡住（连 /healthz 都不响应）。

        状态一律经 ``store.payments.sweeper`` 登记，后台概览与 /healthz 读的是
        同一份快照——巡检坏了必须能从接口看出来，不能只躺在日志里。
        """
        interval = int(settings.payment_sweep_interval_seconds or 0)
        # 代号要一路带到 sweep_round / mark_sweep_loop_stopped：同一个进程里若还有
        # 上一个循环的收尾没跑完（测试里就是这么反复建 app 的），只有当前代号的
        # 写入才算数，旧循环迟到的 finally 不能把新循环标成「已停止」。
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
            # 循环以任何方式结束（取消、任务异常）都要落这个状态：否则后台会一直
            # 显示「上次成功 xx 分钟前」，看着像还活着，实际已经没人对账了。
            mark_sweep_loop_stopped(generation)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info(
            "授权商店服务已启动：%s（数据目录 %s）", settings.public_base_url, settings.data_dir
        )
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
        docs_url="/store-api-docs",
        redoc_url=None,
        openapi_url="/store-api-docs/openapi.json",
        lifespan=lifespan,
    )

    app.state.settings = settings
    app.state.database = database
    app.state.license_authority = authority

    @app.middleware("http")
    async def require_same_origin_for_writes(request: Request, call_next):
        """改状态的商店/后台请求必须同源（CSRF 第二道闸）。

        第一道闸是 SameSite=Lax + 只收 JSON 体（跨站表单会 422、跨站 fetch 会因
        没有 CORS 而 preflight 失败）。这里补一道显式的 Origin/Referer 校验，
        免得日后新增一个 GET 写操作就立刻出现 CSRF 缺口。

        保护范围：``/store/v1/*``（用户侧）与 ``/store-admin/v1/*``（后台侧）的
        非 GET 请求。两类不拦：
        - ``/v2/*`` 授权端点：客户端程序调用，报文加密封套 + 签名，没有浏览器 Origin；
        - 支付宝异步回调（NOTIFY_PATH）：支付宝服务器直连，同样没有 Origin，
          真伪由签名校验，不能被这道闸门挡住。

        GET / HEAD / OPTIONS 一律不拦：读操作与 CORS 预检本就没有副作用。
        """
        path = request.url.path
        # 只提示一次：请求带了转发头但没配可信代理，说明前面有反代而限流与授权记录
        # 只能看到代理地址。这是配置问题而不是每次请求的问题，反复记会把日志刷满。
        if not getattr(app.state, "proxy_warning_logged", False) and forwarded_headers_present(request):
            if not trusted_proxies:
                app.state.proxy_warning_logged = True
                logger.warning(
                    "检测到请求带反向代理转发头，但未配置 STORE_TRUSTED_PROXIES："
                    "限流与授权记录会按代理地址统计。请按实际部署配置可信代理的 IP 或网段。"
                )
        guarded = (
            path.startswith("/store/v1/") or path.startswith("/store-admin/v1/")
        ) and path != alipay_api.NOTIFY_PATH
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

    def resolve_payment_provider(setting=None, *, name: str | None = None):
        """解析支付渠道。

        ``name`` 用于「按订单下单时的渠道」做事后操作（例如退款）：渠道被切换后，
        必须打到当时那个网关。传空表示按当前站点配置解析。
        """
        if setting is None:
            # 没带站点配置就从库里现读一份。支付宝凭据可以在后台改，绝不能把
            # 「调用方没传 setting」当成「就该用环境变量里那套旧凭据」——
            # 那正是「后台显示已配置、实际签名用的是旧密钥」的成因。
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
        # status 依然只表示「进程活着」，外部探活的机器不会被巡检状态带偏；
        # 巡检单独给一个子对象，让监控可以按 paymentSweep.health 报警。
        return {
            "status": "ok",
            "version": __version__,
            "port": settings.port,
            "paymentSweep": sweep_status(),
        }

    @app.exception_handler(Exception)
    async def unhandled_exception(_request: Request, error: Exception) -> JSONResponse:
        logger.exception("未处理的异常：%s", error)
        return JSONResponse({"detail": "服务器内部错误，请稍后重试。"}, status_code=500)

    return app
