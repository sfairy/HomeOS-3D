"""HTTP 访问日志降噪（主应用侧；真源见 ``homeos_shared.http_access_log``）。

本模块只做一层薄转发 + 钉住主应用这一侧的变量名与说明日志的挂载点：

- 详略由 ``LOG_HTTP_ACCESS`` 选择（``errors`` 默认 / ``off`` / ``all``，非法值回退 ``errors``）；
  折叠重复请求的窗口取 ``LOG_STATUS_DEDUPE_MS``（与状态日志同一个窗口，``0`` 关闭折叠）；
- 模式说明只在用户**显式**设过 ``LOG_HTTP_ACCESS`` 时打一行，挂到 ``homeos`` 日志树上；
  默认配置下不打 —— 每个进程启动都播报一遍「降噪已启用」，恰好会把这个模块想保护的
  「只打印一次的启动横幅」顶出可见范围。

WebSocket 握手行（``uvicorn.error`` 上的 ``<来源> - "WebSocket <路径>" [accepted]``）也走
同一套详略：前端每次重连都打一行，端口与 ``sid`` 又各不相同，逐字去重无效。它由共享模块的
``WebSocketHandshakeLogFilter`` 按「来源 IP + 路径 + 结果」折叠，真正的服务端错误不受影响。

实现必须与商店共用一份（商店读 ``STORE_LOG_HTTP_ACCESS``）：两侧逐字相同的逻辑各存一份，
改动就会漏掉另一侧。判定细节、fail-open 取舍、以及要「给只打印一次的启动横幅让出可读范围」
这个动机都写在共享模块里。

只在控制台侧生效：运行日志缓冲 handler（``/system/runtime-logs``）只挂在 ``homeos``
日志树上，本就不会镜像 ``uvicorn.access``。
"""

from __future__ import annotations

from homeos_shared.http_access_log import (
    MODE_ALL,
    MODE_ERRORS,
    MODE_OFF,
    HttpAccessLogFilter,
    WebSocketHandshakeLogFilter,
    mode_label,
)
from homeos_shared.http_access_log import (
    install_http_access_log_filter as _install_http_access_log_filter,
)
from homeos_shared.http_access_log import (
    install_websocket_handshake_log_filter as _install_websocket_handshake_log_filter,
)
from homeos_shared.http_access_log import (
    resolve_http_access_mode as _resolve_http_access_mode,
)

#: 主应用这一侧的变量名（商店侧是 ``STORE_LOG_HTTP_ACCESS``）
ENV_VAR = "LOG_HTTP_ACCESS"

#: 保留的 4xx/5xx 用哪个窗口折叠重复（与状态日志共用，``0`` 关闭折叠）
DEDUPE_ENV_VAR = "LOG_STATUS_DEDUPE_MS"

#: 展示用说明（安装时打一行，方便确认降噪已生效）
MODE_LABEL = {
    MODE_ERRORS: mode_label(MODE_ERRORS, ENV_VAR),
    MODE_OFF: mode_label(MODE_OFF, ENV_VAR),
}


def resolve_http_access_mode() -> str:
    """解析 ``LOG_HTTP_ACCESS``：``all`` / ``off`` 原样返回，其余一律按 ``errors``。"""
    return _resolve_http_access_mode(ENV_VAR)


def install_http_access_log_filter() -> HttpAccessLogFilter:
    """把过滤器挂到 ``uvicorn.access``（幂等，可在每次启动时调用）。"""
    return _install_http_access_log_filter(
        env_var=ENV_VAR,
        announce_logger="homeos",
        dedupe_env_var=DEDUPE_ENV_VAR,
    )


def install_websocket_handshake_log_filter() -> WebSocketHandshakeLogFilter:
    """把 WebSocket 握手折叠过滤器挂到 ``uvicorn.error``（幂等，可在每次启动时调用）。

    详略沿用 ``LOG_HTTP_ACCESS``：握手行与 HTTP 访问日志在用户眼里是同一类「连接噪音」，
    让它们共用一套开关，比多记一个变量更友好。
    """
    return _install_websocket_handshake_log_filter(
        env_var=ENV_VAR,
        dedupe_env_var=DEDUPE_ENV_VAR,
    )


__all__ = [
    "DEDUPE_ENV_VAR",
    "ENV_VAR",
    "MODE_ALL",
    "MODE_ERRORS",
    "MODE_LABEL",
    "MODE_OFF",
    "HttpAccessLogFilter",
    "WebSocketHandshakeLogFilter",
    "install_http_access_log_filter",
    "install_websocket_handshake_log_filter",
    "resolve_http_access_mode",
]
