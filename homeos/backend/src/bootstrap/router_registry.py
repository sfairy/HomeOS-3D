"""业务路由注册表：合并 ``app.py`` 与 ``studio3d_plane.mount`` 的 ``include_router`` 顺序。

顺序不可改：业务路由须在 SPA catch-all 之前；3D 数据面紧随 homeos ``/api/v1`` 路由之后。
"""

from __future__ import annotations

from fastapi import FastAPI

from ..api.advisor_usage import router as advisor_usage_router
from ..api.agent import router as agent_router
from ..api.assets import router as assets_router
from ..api.auth import router as auth_router
from ..api.backups import router as backups_router
from ..api.channels import router as channels_router
from ..api.channels import wecom_router as channels_wecom_router
from ..api.client_power import router as client_power_router
from ..api.command_proxy import router as command_proxy_router
from ..api.earthquake import router as earthquake_router
from ..api.embed_proxy import router as embed_proxy_router
from ..api.entities import router as entities_router
from ..api.events import router as events_router
from ..api.global_logs import router as global_logs_router
from ..api.ha import router as ha_router
from ..api.ha import runtime_router
from ..api.ha_proxy import router as ha_proxy_router
from ..api.ha_webrtc import router as ha_webrtc_router
from ..api.home_mode import router as home_mode_router
from ..api.icons import router as icons_router
from ..api.license import router as license_router
from ..api.mcp import router as mcp_router
from ..api.moviepilot_proxy import router as moviepilot_proxy_router
from ..api.notification import router as notification_router
from ..api.projects import router as projects_router
from ..api.public_config import router as public_config_router
from ..api.security import router as security_router
from ..api.security_panel import router as security_panel_router
from ..api.studio3d import router as studio3d_router
from ..api.system_backup import router as system_backup_router
from ..api.system_config import router as system_config_router
from ..api.system_core import router as system_core_router
from ..api.system_lifestyle import router as system_lifestyle_router
from ..api.system_ops import router as system_ops_router
from ..api.system_setup import router as system_setup_router
from ..api.ui_config import router as ui_config_router
from ..api.voice import router as voice_router
from ..api.ws_proxy import router as ws_proxy_router
from ..modules.interaction3d.api import router as interaction3d_router
from ..updates import router as updates_router

API_PREFIX = "/api/v1"


def register_homeos_routers(app: FastAPI) -> None:
    """homeos ``/api/v1`` 业务路由（原 ``create_app`` 顺序）。"""
    app.include_router(auth_router, prefix=API_PREFIX)
    app.include_router(agent_router, prefix=API_PREFIX)
    app.include_router(embed_proxy_router, prefix=API_PREFIX)
    app.include_router(entities_router, prefix=API_PREFIX)
    app.include_router(events_router, prefix=API_PREFIX)
    app.include_router(command_proxy_router, prefix=API_PREFIX)
    app.include_router(channels_router, prefix=API_PREFIX)
    app.include_router(channels_wecom_router, prefix=API_PREFIX)
    app.include_router(client_power_router, prefix=API_PREFIX)
    app.include_router(earthquake_router, prefix=API_PREFIX)
    app.include_router(home_mode_router, prefix=API_PREFIX)
    app.include_router(license_router, prefix=API_PREFIX)
    app.include_router(mcp_router, prefix=API_PREFIX)
    app.include_router(moviepilot_proxy_router, prefix=API_PREFIX)
    app.include_router(notification_router, prefix=API_PREFIX)
    app.include_router(security_router, prefix=API_PREFIX)
    app.include_router(security_panel_router, prefix=API_PREFIX)
    app.include_router(system_backup_router, prefix=API_PREFIX)
    app.include_router(backups_router, prefix=API_PREFIX)
    app.include_router(system_config_router, prefix=API_PREFIX)
    app.include_router(system_core_router, prefix=API_PREFIX)
    app.include_router(system_lifestyle_router, prefix=API_PREFIX)
    app.include_router(system_ops_router, prefix=API_PREFIX)
    app.include_router(system_setup_router, prefix=API_PREFIX)
    app.include_router(ui_config_router, prefix=API_PREFIX)
    app.include_router(updates_router, prefix=API_PREFIX)
    app.include_router(voice_router, prefix=API_PREFIX)
    app.include_router(advisor_usage_router, prefix=API_PREFIX)
    app.include_router(ws_proxy_router, prefix=API_PREFIX)
    app.include_router(ha_webrtc_router, prefix=API_PREFIX)


def register_studio3d_routers(app: FastAPI) -> None:
    """3D Studio 数据面路由（原 ``studio3d_plane.mount`` 顺序）。"""
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


def register_routers(app: FastAPI) -> None:
    """注册全部业务路由：homeos → 3D 数据面。"""
    register_homeos_routers(app)
    register_studio3d_routers(app)
