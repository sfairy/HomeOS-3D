"""FastAPI 应用装配：生命周期、中间件、页面路由与静态资源保护。

这个模块是后端的总入口，`create_app()` 把各子系统拼成一个应用：
- lifespan 里按顺序建目录、跑迁移、起授权 / HA 同步 / 更新检查三个后台服务；
- 两层 HTTP 中间件：一层做请求诊断日志，一层做资源鉴权与安全响应头；
- 一组页面路由各自判断「是否已初始化 / 是否登录 / 授权是否允许」，不合格就 303 跳转。

注意最后一行会直接构造 `app`，`uvicorn apps.server.main:app` 依赖它存在。
"""
from __future__ import annotations


from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .api.auth import router as auth_router
from .api.assets import router as assets_router
from .api.displays import (
    router as displays_router,
)
from .api.ha_translations import (
    EntityTranslationCache,
    TRANSLATION_CACHE_FILENAME,
)
from .api.ha import (
    router as ha_router,
)
from .api.ha_runtime import (
    runtime_router,
)
from .api.media_proxy_support import (
    MediaProxyCaches,
)
from .api.global_logs import router as global_logs_router
from .api.appearance import router as appearance_router
from .api.icons import router as icons_router
from .api.license import router as license_router
from .modules.interaction3d.api import router as interaction3d_router
from .modules.interaction3d.scene_store import LiveSceneCache
from .api.projects import router as projects_router
from .api.studio3d import router as studio3d_router
from .app.lifespan import build_lifespan
from .app.middleware import install_middlewares
from .config import Settings, load_settings
from .observability.updates import router as updates_router
from .app.errors import install_exception_handlers
from .app.pages import install_page_routes


def create_app(settings: Settings | None = None, license_transport = None, license_endpoint_pool = None) -> FastAPI:
    """构造 FastAPI 应用。

    参数:
        settings: 覆盖配置；为 None 时从环境变量加载。
    """
    app_settings = settings or load_settings()
    app = FastAPI(
        title = 'HomeOS',
        version = app_settings.version,
        lifespan = build_lifespan(app_settings, license_transport, license_endpoint_pool), docs_url = None, redoc_url = None, openapi_url = None)
    app.state.settings = app_settings
    # 媒体代理的两份进程内记账（快照缓存 + HLS 归属）挂在应用上而不是模块级：
    # create_app() 调两次时模块级的那一份会被两个应用共享（缓存串台、刷新任务绑在
    # 另一个事件循环上），而进程内单实例只是习惯，不是保证。
    app.state.media_proxy = MediaProxyCaches()
    # 实体翻译表的进程内缓存：与媒体代理同理挂在应用上（create_app() 调两次不能串台）。
    # 翻译表带磁盘缓存：开发态热重载与正式升级都会重启进程，没有它每次都要重付一次
    # 中位 2.9 秒、最坏 23 秒的回源（见 api/ha.py 的 EntityTranslationCache）。
    # 实时草稿的解析缓存：控制类接口每条命令都要读一次草稿判"模型还在不在"，
    # 按 (路径, mtime_ns, size) 缓存，草稿一改写就自动落到新键（见 scene_store.LiveSceneCache）。
    app.state.live_scenes = LiveSceneCache()
    app.state.entity_translations = EntityTranslationCache(
        cache_path = app_settings.data_dir / 'cache' / TRANSLATION_CACHE_FILENAME
    )

    install_exception_handlers(app)

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

    # 请求级身份判定与资源门禁在 apps/server/app/request_context.py（页面层与中间件层共用同一套判据）。
    # 响应面的三道中间件在 apps/server/app/middleware.py（诊断层仍在尾部注册，顺序是承重的）。
    install_middlewares(app, app_settings)

    # 页面路由在 apps/server/app/pages.py。
    install_page_routes(app, app_settings)

    return app


# 模块级实例：uvicorn 的 `apps.server.main:app` 依赖它。
app = create_app()
