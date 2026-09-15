"""启动授权商店服务：``python -m store.run``。

默认监听 ``0.0.0.0:18082``，可用 ``STORE_HOST`` / ``STORE_PORT`` 覆盖。
本地联调可设 ``STORE_RELOAD=1`` 打开热重载：编辑 ``store/`` 下的代码后服务会
自动重启。不开热重载时进程会把启动那一刻的模块（含授权传输协议常量）一直留在
内存里，主应用已经重载到新代码、商店还跑着旧协议，就会出现「授权请求无法解密」。
"""

from __future__ import annotations

import logging
import os

import uvicorn

from store.app import create_app
from store.config import STORE_ROOT, load_settings

_TRUTHY = frozenset({'1', 'true', 'yes', 'on'})


def reload_enabled() -> bool:
    return os.getenv('STORE_RELOAD', '').strip().lower() in _TRUTHY


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
    )
    settings = load_settings()
    if reload_enabled():
        # 热重载要求用 import 字符串 + factory，子进程会重新执行 load_settings()。
        uvicorn.run(
            "store.app:create_app",
            factory=True,
            host=settings.host,
            port=settings.port,
            log_level="info",
            reload=True,
            reload_dirs=[str(STORE_ROOT)],
        )
        return
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level="info")


if __name__ == "__main__":
    main()
