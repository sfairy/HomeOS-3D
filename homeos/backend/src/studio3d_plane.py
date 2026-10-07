"""3D Studio 后端平面（阶段 3/4）在 homeos 上的装配入口。

把并入 homeos 的 homeos-3d 后端资产收敛成**一次调用**，避免把大段 3D 专有装配散落进
homeos 的 ``app.py``：

- 数据面服务：``GlobalLogStore``（全局日志）、``AssetCatalog``（素材目录）；
- HA 平面：以并入的 ``src.ha.service.HAConnectorService`` 作为**唯一 HA 连接**与状态
  事实源。它把全量快照与全量增量直接交给 homeos 状态监听（``app.py`` 的
  ``_make_state_listener``）写入 ``StateStore`` 读模型并广播，而 ``StateHub`` 只承载
  3D 侧 watched 子集供 ``/ws/runtime`` 用 —— 单连接、单事实源，homeos 消费者不改动；
- 路由：挂载并入的 ``/api/v1`` 数据面路由（ha / ha_proxy / projects / studio3d / assets /
  assets / icons / global_logs / public_config / interaction3d）与 ``/ws/runtime``。

homeos 原有的 2D 画布业务消费者仍按其既有接口工作；其与 3D 的重叠能力（HA 控制、
项目/素材、中控设备）以 3D 实现为准。
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from .api.assets import AssetCatalog
from .api.assets import router as assets_router
from .api.global_logs import router as global_logs_router
from .api.ha import router as ha_router
from .api.ha import runtime_router
from .api.ha_proxy import router as ha_proxy_router
from .api.icons import router as icons_router
from .api.projects import router as projects_router
from .api.public_config import router as public_config_router
from .api.studio3d import router as studio3d_router
from .auth_limiter import LoginAttemptLimiter
from .global_log import GlobalLogStore
from .ha.service import HAConnectorService as StudioHAConnectorService
from .modules.interaction3d.api import router as interaction3d_router
from .services.ha_config import backfill_ha_connection_from_layout

#: 3D 数据面路由统一前缀（与 homeos-3d 保持一致）。
API_PREFIX = "/api/v1"


async def install(
    app: FastAPI,
    settings: Any,
    database: Any = None,
    *,
    global_log: GlobalLogStore | None = None,
) -> None:
    """在 lifespan 内初始化 3D 平面服务（路由挂载见 ``mount``，须在 app 装配期完成）。

    显式依赖注入：``database``（会话工厂所有者）与可选的 ``global_log`` 由调用方传入，
    不隐式读取 ``app.state``，便于在装配顺序调整时立刻暴露缺失依赖。

    调用点须在 ``database`` / ``app.state.license_service`` /
    ``app.state.settings`` 就绪之后、且 homeos 既有 HA 读模型（``StateStore``）已建立之后。
    """
    app.state.settings = settings
    if database is None:
        database = getattr(app.state, "database", None)
    if database is None:
        raise RuntimeError("studio3d_plane.install 缺少 database 依赖")
    # 全局日志：3D 的数据面与页面守卫、/api/v1/logs 都依赖它。
    app.state.global_log = global_log or GlobalLogStore(settings.data_dir)
    # 数据面目录（对齐 homeos-3d ``main.py`` 的 lifespan 建目录；缺目录会让素材/导出接口报错）。
    for directory in (
        settings.data_dir,
        settings.user_assets_dir,
        settings.studio3d_dir,
        settings.studio3d_exports_dir,
        settings.effect_variants_dir,
    ):
        try:
            directory.mkdir(parents=True, exist_ok=True)
        except OSError as exc:  # noqa: BLE001 - 目录不可用不应阻塞启动
            app.state.global_log.append(
                "warning", "系统后台", "系统", f"目录创建失败：{directory}（{exc}）"
            )
    # 素材目录：内置素材 / 用户上传 / Studio 导出 / 特效变体。
    app.state.asset_catalog = AssetCatalog(
        settings.built_in_assets_dir,
        settings.user_assets_dir,
        settings.studio3d_exports_dir,
        settings.effect_variants_dir,
    )
    # 账号快照机制已退役：单用户注册下「是否已注册」直接查 ``users`` 表，无需外置文件。
    # 3D 登录限流器（配对码 / 授权激活等端点使用）。
    app.state.login_limiter = LoginAttemptLimiter()

    # HA 平面：并入的 HAConnectorService 是唯一 HA 连接与 StateHub 事实源。
    # 它在同一次 lifespan 里由 app.py 直接挂到 ``app.state.ha_connector``
    # （homeos 兼容接口已并入连接器本身，见 ``ha/homeos_facade.py``），
    # 因此不存在第二条 HA 连接；3D 数据面统一读 ``app.state.studio_ha``。
    studio_ha = StudioHAConnectorService(
        settings, database, event_log=app.state.global_log
    )
    # 阶段 3.3 数据迁移：连接凭据的单源改为 ``ha_connections`` 表，老安装的连接还留在
    # 项目 layout 里。必须赶在 ``studio_ha.start()`` 之前补齐，否则升级后连接器找不到
    # 连接记录，表现成「什么都没改却掉线」。
    migrated_url = backfill_ha_connection_from_layout(database, studio_ha.cipher)
    if migrated_url:
        app.state.global_log.append(
            'info',
            '系统后台',
            '连接',
            f'已把旧版保存的 Home Assistant 连接（{migrated_url}）迁移到连接记录',
        )
    app.state.studio_ha = studio_ha
    app.state.state_hub = studio_ha.state_hub
    studio_ha.start()

    # homeos 状态监听（``_make_state_listener``：写 L2 shadow / 播种在场 / 广播
    # ``ha.initial_states`` 与 ``ha.state_changed.batch``）定义在 app.py，所以「连接器 →
    # homeos 读模型」的接线也在 app.py：``studio_connector.set_state_listener(...)``。


async def shutdown(app: FastAPI) -> None:
    """停掉 3D 平面服务（幂等）。"""
    connector = getattr(app.state, "studio_ha", None)
    if connector is not None:
        await connector.stop()


def mount(app: FastAPI, settings: Any) -> None:
    """挂载并入的 3D 数据面路由（须在应用装配期调用，不能在 lifespan 内）。

    授权路由仍用 homeos 已并入的实现，不重复挂载。中控设备配对（displays 路由）
    已随配对码机制移除。
    """
    del settings  # 目前路由挂载不需要 settings，保留形参以便后续扩展。
    app.include_router(assets_router, prefix=API_PREFIX)
    app.include_router(ha_router, prefix=API_PREFIX)
    app.include_router(runtime_router, prefix=API_PREFIX)
    app.include_router(projects_router, prefix=API_PREFIX)
    app.include_router(public_config_router, prefix=API_PREFIX)
    app.include_router(studio3d_router, prefix=API_PREFIX)
    app.include_router(icons_router, prefix=API_PREFIX)
    app.include_router(interaction3d_router, prefix=API_PREFIX)
    app.include_router(global_logs_router, prefix=API_PREFIX)
    # ha_proxy 自带路径前缀（媒体代理），与 homeos-3d 一致不额外加前缀。
    app.include_router(ha_proxy_router)
