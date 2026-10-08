"""HomeOS Python 后端（NestJS → FastAPI 透明替换）。

包结构镜像仓库既有的 homeos / homeos-store Python 约定：
- ``src.config``         运行期不可变配置（env 装配）
- ``src.core.*``         数据库、模型、错误、可观测性、迁移
- ``src.app``            FastAPI 应用工厂（lifespan / 中间件 / 路由 / 静态资源）
- ``src.run``            uvicorn 启动入口

版本号：构建期烘进 ``src/_version.py``（见根 Dockerfile，且该文件在 ``.gitignore`` 中）；
源码 / CI 环境没有该模块时，回落到仓库 ``package.json`` / ``HOMEOS_APP_VERSION``。
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from .core.log import configure_app_logging
from .env import load_env_files

# 与 Nest ``import 'dotenv/config'`` 对齐：进程启动即装载 .env，
# 保证任何子模块读取 os.environ 之前生效。
load_env_files()

# 在应用导入的最早时机初始化日志（幂等）：uvicorn 子进程只会导入 ``src.app``，
# 需在此挂好 ``homeos`` 与 uvicorn 日志器，保证「Started server process」等
# 早期日志也走 Nest 风格格式。
configure_app_logging()


def _read_baked_version() -> str:
    """构建期烘进镜像的版本号（Dockerfile 生成 ``_version.py`` 后编译成扩展）。

    源码 / CI 运行时这个模块不存在，返回空串让调用方回落到 ``package.json``。
    """
    try:
        from ._version import __version__ as baked  # type: ignore[import-not-found]
    except ImportError:
        return ""
    return str(baked).strip()


def _read_package_version() -> str:
    """仓库 ``package.json`` 的 ``version`` —— 源码运行时的权威源。"""
    here = Path(__file__).resolve()
    for candidate in (
        here.parents[3] / "package.json",  # 仓库根
        here.parents[2] / "package.json",  # homeos/
        here.parents[1] / "package.json",  # backend/
    ):
        try:
            payload = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        version = payload.get("version") if isinstance(payload, dict) else None
        if isinstance(version, str) and version.strip():
            return version.strip()
    return ""


def load_app_version() -> str:
    """解析对外暴露的应用版本号。

    优先级：
    1. ``HOMEOS_APP_VERSION`` 环境变量（部署显式注入）；
    2. 构建期烘入的 ``_version.__version__``；
    3. 邻近 ``VERSION`` 文件；
    4. 仓库 ``package.json`` 的 ``version``；
    5. ``"0.0.0"``。
    """
    override = os.getenv("HOMEOS_APP_VERSION", "").strip()
    if override:
        return override

    baked = _read_baked_version()
    if baked and baked != "0.0.0":
        return baked

    here = Path(__file__).resolve()
    for version_file in (here.parents[1] / "VERSION", here.parents[2] / "VERSION"):
        try:
            text = version_file.read_text(encoding="utf-8").strip()
            if text:
                return text
        except OSError:
            pass

    return _read_package_version() or "0.0.0"


__version__ = _read_baked_version() or _read_package_version() or "0.0.0"

__all__ = ["__version__", "load_app_version"]
