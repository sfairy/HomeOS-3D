"""启动授权商店服务。

源码布局用 ``python -m src.run``，发行产物里包名是 ``app``（构建时把 src 映射成 app），
入口都是 ``python -m <包>.run``。
"""

from __future__ import annotations

import os

import uvicorn

from homeos_shared.logging_noise import install_reload_noise_filter

from .app import create_app
from .config import STORE_ROOT, load_settings
from .core.console_log import configure_console_logging

_TRUTHY = frozenset({'1', 'true', 'yes', 'on'})


def reload_enabled() -> bool:
    return os.getenv('STORE_RELOAD', '').strip().lower() in _TRUTHY


def main() -> None:
    # 唯一来源在 core/console_log.py：迁移里的 alembic fileConfig 会顶掉这里装的东西，
    # 所以 lifespan 还会再装一次（reload 的 worker 也只能靠那一次）。
    configure_console_logging()
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
            # log_config=None：别让 uvicorn 用它自己那套 handler 顶掉 console_log 装好的
            # （否则启动日志里会同时出现「带时间戳的中文行」与「INFO:  Started server process」两套格式）。
            log_config=None,
        )
        return
    uvicorn.run(
        create_app(settings),
        host=settings.host,
        port=settings.port,
        log_level="info",
        log_config=None,
    )


if __name__ == "__main__":
    main()
