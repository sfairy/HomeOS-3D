"""授权门禁的路径豁免与开关判定（HomeOS 侧口径）。

``LicenseService`` 只负责「状态机 + 能力判定 + 在线续租」，不内置路径白名单；
HomeOS 采用中间件式严格门禁，因此「哪些路径必须在未激活时仍可访问」由本模块维护：

- ``LICENSE_EXEMPT_EXACT``  精确匹配的引导 / 登录 / 公共配置路径；
- ``LICENSE_EXEMPT_LICENSE_PATHS`` 授权接口白名单（逐条枚举，不再按前缀放行）；
- ``LICENSE_EXEMPT_STATIC_PREFIXES`` / ``LICENSE_EXEMPT_STATIC_FILES`` 前端产物路径。

放在独立模块而不是塞回 ``service.py``，是为了让移植来的 ``service.py`` 与上游逐字节
可比（便于后续跟随上游更新），差异只在 HomeOS 自己的装配层。

## 为什么静态产物必须豁免（这里的失败模式是**死锁**，不是「少个功能」）

未激活时能下发的只有 SPA 外壳（``index.html``），而外壳要自己去拉 JS / CSS 才能渲染 ——
包括前端用来就地画「注册 / 激活 / 授权恢复」页面的那份代码。外壳的引用面**不止
``/static/**`` 的 public 资源**：vite 的哈希 chunk 也在 ``/static/assets/**``，外壳还引用
``/icons``、``/backgrounds``、``/logo``、``/sounds``、``/manifest.json``、``/sw.js``。

一旦这些被门禁挡成 401，浏览器拿到的是「外壳 + 全部 401 的脚本」：页面白屏（CSS 还报
``MIME type ('application/json') is not a supported stylesheet``，因为 401 的响应体是 JSON），
**激活页本身也渲染不出来** —— 用户永远无法激活，而激活是解除门禁的唯一办法。所以这里
按「挂载前缀」整体豁免，而不是逐个文件列举（列举一旦漏掉新产物目录就再次死锁）。

豁免不等于不设防：真正的访问控制在**登录门禁**（``bootstrap/studio_shell.py`` 的
``ProtectAssetsMiddleware``，按构建产物 ``public-static.json`` 白名单拦 ``/static/**``，
并拦下 ``/assets/builtin/**`` 的 3D 素材），授权门禁只管「这台机器有没有激活」。
两层职责分开之后，这里的豁免名单可以稳定地按「静态挂载点」维护。
"""

from __future__ import annotations

from ...platform.core.frontend_static import (
    FRONTEND_ASSET_SUFFIXES,
    FRONTEND_STATIC_MOUNT_PREFIXES,
    FRONTEND_STATIC_ROOT_FILES,
    is_frontend_static_path,
)

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
        # 找回本机密码：邮箱验证码由商店代发，与授权无关。授权过期 / 未激活时如果把它
        # 挡在门禁外，用户会陷入「进不去设置改授权、也改不了密码」的死锁。
        # 该端点自身有同源校验 + 限流 + 双提交 CSRF，豁免授权门禁不等于放松鉴权。
        "/api/v1/auth/password/reset",
        "/api/v1/system/config/public",
        # 登录页「重置商店密码 / 商店」的地址来源（``api/public_config.py``）。它与上面的
        # ``/api/v1/system/config/public`` 是**两个**端点：那个是系统公开配置（HA 区域索引），
        # 这个是匿名下发的商店入口地址。漏掉它不会白屏，但登录页的商店链接会静默消失
        # （前端在拿不到地址时会隐藏入口，而不是回落到 ``127.0.0.1``）。
        "/api/v1/public/config",
        # SPA 页面：必须能下发外壳，才能由前端就地渲染「注册 / 登录 / 授权恢复 / 激活」页。
        # 未激活时后端会给外壳打 data-license-blocked / data-license-status（见
        # spa_static.py ``_spa_shell``）：前端据此分流到恢复页或注册 / 登录 / 激活。
        "/",
        "/login",
        "/register",
        "/reset-password",
        "/activate",
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
        # 匿名（未登录也是未激活）页面上的异常上报。前端 ``client-log`` 先打已登录端点
        # ``/logs/events``，拿到 401 才切到 ``/logs/public-events``；若这个也 401，激活页
        # 自身的报错就一条都留不下来 —— 而那正是排查「激活页为什么打不开」最需要的东西。
        # 端点自身有同源校验、级别限制（只收 warning/error）与匿名限流，放宽是安全的。
        "/api/v1/logs/public-events",
    }
)

#: 前端产物的**挂载前缀**：这些路径由静态挂载直接伺服，未激活时也必须能加载（见模块
#: docstring 的「死锁」说明）。
#:
#: 取值直接来自 ``platform/core/frontend_static.py`` —— 那份常量同时被
#: ``bootstrap/spa_static.py`` 用来挂载，所以「挂载点」与「豁免名单」不可能再分叉。
#: 这正是本模块上一版的真实事故：挂载点写在 bootstrap、豁免名单写在这里，漏掉 ``/assets/``
#: 就让未激活的生产实例白屏，而且激活页自身也渲染不出来（死锁）。
LICENSE_EXEMPT_STATIC_PREFIXES = FRONTEND_STATIC_MOUNT_PREFIXES

#: 位于根路径、不属于任何挂载目录的前端产物（PWA 与图标）。
LICENSE_EXEMPT_STATIC_FILES = FRONTEND_STATIC_ROOT_FILES

#: 展示页前缀豁免（``/display/{project_id}`` 与 ``/homeos/{name}``）：外壳下发后再由前端
#: 按 ``license-blocked`` 就地渲染，否则墙屏会在未激活时看到一坨 JSON。
LICENSE_EXEMPT_PREFIXES = ("/display/", "/homeos/")


def is_license_exempt_path(path: str, method: str = "GET") -> bool:
    """判断某请求路径是否豁免授权门禁。

    - 精确白名单与授权接口白名单（逐条枚举）一律豁免；
    - 静态产物（挂载前缀 + 根路径的 PWA / 图标）仅在 ``GET/HEAD`` 下豁免；
    - ``/display/**``、``/homeos/**`` 展示页豁免（外壳内部再判定）；
    - 其余路径都要过门禁。
    """
    if path in LICENSE_EXEMPT_EXACT or path in LICENSE_EXEMPT_LICENSE_PATHS:
        return True
    if path.startswith(LICENSE_EXEMPT_PREFIXES):
        return True
    if method not in ("GET", "HEAD"):
        return False
    return is_frontend_static_path(path)


#: 前端产物后缀：门禁拦下这类路径时的告警判据（见 ``bootstrap/middleware.py``）。
#: 与 SPA catch-all 用的是同一份 ``FRONTEND_ASSET_SUFFIXES`` —— 那些后缀一旦被门禁挡下，
#: 页面必定白屏，所以值得在日志里单列一条。
ASSET_SUFFIXES = FRONTEND_ASSET_SUFFIXES

__all__ = [
    "ASSET_SUFFIXES",
    "LICENSE_EXEMPT_EXACT",
    "LICENSE_EXEMPT_LICENSE_PATHS",
    "LICENSE_EXEMPT_PREFIXES",
    "LICENSE_EXEMPT_STATIC_FILES",
    "LICENSE_EXEMPT_STATIC_PREFIXES",
    "is_license_exempt_path",
]
