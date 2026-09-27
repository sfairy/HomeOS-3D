"""启动授权商店服务：``python -m src.run``。
"""

from __future__ import annotations

import logging
import os

import uvicorn

from src.app import create_app
from src.config import STORE_ROOT, load_settings

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
            "src.app:create_app",
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
