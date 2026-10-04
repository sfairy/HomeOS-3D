"""启动授权商店服务。

源码布局用 ``python -m src.run``，发行产物里包名是 ``app``（构建时把 src 映射成 app），
入口都是 ``python -m <包>.run``。
"""

from __future__ import annotations

import logging
import os

import uvicorn

from .app import create_app
from .config import STORE_ROOT, load_settings
from .logging_noise import install_reload_noise_filter

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
        install_reload_noise_filter()
        uvicorn.run(
            # 用 __package__ 而不是写死包名：源码下是 src，发行产物里是 app。
            f"{__package__}.app:create_app",
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
