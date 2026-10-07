"""授权门禁的路径豁免与开关判定（HomeOS 侧口径）。

并入 homeos-3d 的授权服务后，``LicenseService`` 只负责「状态机 + 能力判定 + 在线续租」，
不再内置路径白名单 —— homeos-3d 的门禁是**按路由依赖**做的，而 HomeOS 沿用中间件式
严格门禁（对齐迁移前的 Nest ``LicenseGuard``）。因此把「哪些路径必须在未激活时仍可访问」
留在 HomeOS 这一侧维护，语义与旧实现一致：

- ``LICENSE_EXEMPT_EXACT``  精确匹配的引导 / 登录 / 公共配置路径；
- ``LICENSE_EXEMPT_LICENSE_PATHS`` 授权接口白名单（逐条枚举，不再按前缀放行）。

放在独立模块而不是塞回 ``service.py``，是为了让移植来的 ``service.py`` 与上游逐字节
可比（便于后续跟随上游更新），差异只在 HomeOS 自己的装配层。
"""

from __future__ import annotations

#: 授权严格路径豁免（精确匹配）。
LICENSE_EXEMPT_EXACT = frozenset(
    {
        "/health",
        "/health/live",
        "/health/ready",
        "/metrics",
        "/api/v1/setup/status",
        "/api/v1/auth/register",
        "/api/v1/auth/verification",
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
        "/api/v1/auth/me",
        "/api/v1/system/config/public",
        # SPA 页面：必须能下发外壳，才能由前端就地渲染「注册 / 登录 / 授权恢复 / 激活」页。
        # 未激活时后端会给外壳打 data-license-blocked（见 app.py ``_spa_shell``）。
        "/",
        "/login",
        "/register",
        "/setup",
        "/activate",
        "/license",
        "/license-recovery",
        "/3d-studio",
        "/studio/editor",
    }
)

#: 授权接口豁免（**逐条枚举**，不再按 ``/api/v1/license`` 前缀放行）。
#:
#: 这些是「授权不可用时用来修复」的入口，未激活时也必须可达：激活、可用性查询，
#: 以及状态 / 重激活 / 重试（后三者另外要求登录会话，见 ``api/license.py``）。
#: 用精确集合而不是前缀，是为了让将来新增的授权端点默认**落在门禁之内** —— 前缀豁免
#: 的失败模式是「新端点静默继承豁免」，而这里必须显式加白。
LICENSE_EXEMPT_LICENSE_PATHS = frozenset(
    {
        "/api/v1/license/status",
        "/api/v1/license/availability",
        "/api/v1/license/activate",
        "/api/v1/license/reactivate",
        "/api/v1/license/retry",
    }
)

#: 授权静态资源豁免：匿名白名单内的登录页 / 配对页资源，未激活也必须能加载。
LICENSE_EXEMPT_STATIC_PREFIX = "/static/"

#: 展示页前缀豁免（``/display/{project_id}`` 与 ``/homeos/{name}``）：外壳下发后再由前端
#: 按 ``license-blocked`` 就地渲染，否则墙屏会在未激活时看到一坨 JSON。
LICENSE_EXEMPT_PREFIXES = ("/display/", "/homeos/")


def is_license_exempt_path(path: str, method: str = "GET") -> bool:
    """判断某请求路径是否豁免授权门禁。

    - 精确白名单与授权接口白名单（逐条枚举）一律豁免；
    - ``/static/**`` 仅在 ``GET/HEAD`` 下豁免（授权页自身要用）；
    - ``/display/**``、``/homeos/**`` 展示页豁免（外壳内部再判定）；
    - 其余路径都要过门禁。
    """
    if path in LICENSE_EXEMPT_EXACT or path in LICENSE_EXEMPT_LICENSE_PATHS:
        return True
    if path.startswith(LICENSE_EXEMPT_PREFIXES):
        return True
    if method in ("GET", "HEAD") and path.startswith(LICENSE_EXEMPT_STATIC_PREFIX):
        return True
    return False


__all__ = [
    "LICENSE_EXEMPT_EXACT",
    "LICENSE_EXEMPT_LICENSE_PATHS",
    "LICENSE_EXEMPT_PREFIXES",
    "LICENSE_EXEMPT_STATIC_PREFIX",
    "is_license_exempt_path",
]
