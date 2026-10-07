"""uvicorn 启动入口：``python -m src.run``。

与 Nest ``backend/src/main.ts`` 对齐：HTTP + Socket.IO 同端口（默认 8801，
Caddy ``reverse_proxy homeos:8801`` 可无缝切换），端口/主机解析顺序：

1. ``PORT``（与 Nest 完全一致，容器编排里通常只注入这一个）；
2. ``HOMEOS_PORT`` / ``HOMEOS_HOST``（本仓库 Python 侧约定）；
3. 默认 ``0.0.0.0:8801``。

``HOMEOS_RELOAD=1`` 时启用热重载（开发态），生产态保持单进程。
"""

from __future__ import annotations

import logging
import os

import uvicorn

from ._version import load_app_version
from .app import create_asgi_app


def _resolve_port() -> int:
    for name in ("PORT", "HOMEOS_PORT"):
        raw = os.getenv(name, "").strip()
        if raw.isdigit():
            return int(raw)
    return 8801


def _resolve_host() -> str:
    return os.getenv("HOMEOS_HOST", "").strip() or os.getenv("HOST", "").strip() or "0.0.0.0"


def _resolve_shutdown_timeout() -> int:
    """优雅关闭上限(秒)。

    常驻 WebSocket / socket.io 连接不会自行释放，若不设上限 uvicorn 会无限等待
    ("Waiting for connections to close")，导致热重载卡死：旧 worker 不退出、
    新 worker 无法接管端口，最终表现为服务无响应 + 重复启动报 Address already in use。
    """
    raw = os.getenv("HOMEOS_SHUTDOWN_TIMEOUT", "").strip()
    try:
        value = int(raw)
    except ValueError:
        return 10
    return value if value > 0 else 10


def main() -> None:
    host = _resolve_host()
    port = _resolve_port()
    reload_enabled = os.getenv("HOMEOS_RELOAD", "").strip().lower() in {"1", "on", "yes", "true"}
    logging.getLogger("homeos.bootstrap").info(
        "HomeOS 后端 v%s 运行在 http://%s:%s", load_app_version(), host, port
    )
    if reload_enabled:
        # 开发期降噪：重载提示与 watchfiles 的逐次改动日志（必须在 uvicorn.run 之前挂）。
        from .logging_noise import install_reload_noise_filter

        install_reload_noise_filter()
        uvicorn.run(
            "src.app:create_asgi_app",
            factory=True,
            host=host,
            port=port,
            reload=True,
            log_level=os.getenv("LOG_LEVEL", "info"),
            log_config=None,
            timeout_graceful_shutdown=_resolve_shutdown_timeout(),
        )
        return
    uvicorn.run(
        create_asgi_app(),
        host=host,
        port=port,
        log_level=os.getenv("LOG_LEVEL", "info"),
        log_config=None,
        timeout_graceful_shutdown=_resolve_shutdown_timeout(),
    )


if __name__ == "__main__":
    main()
