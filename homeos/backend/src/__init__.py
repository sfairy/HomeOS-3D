"""HomeOS Python 后端（NestJS → FastAPI 透明替换）。

包结构镜像仓库既有的 homeos-3d / homeos-store Python 约定：
- ``src.config``         运行期不可变配置（env 装配）
- ``src.core.*``         数据库、模型、错误、可观测性、迁移
- ``src.app``            FastAPI 应用工厂（lifespan / 中间件 / 路由 / 静态资源）
- ``src.run``            uvicorn 启动入口

与商店共用的两个叶子模块（``logging_noise`` / ``core.file_lock``）**不在本包内**：它们在
``packages/shared-py/homeos_shared``，由本包导入时挂好 ``sys.path``（见下）。

版本号：构建期烘进 ``src/_version.py``（见根 Dockerfile，且该文件在 ``.gitignore`` 中）；
源码 / CI 环境没有该模块时，回落到仓库 ``package.json`` / ``HOMEOS_APP_VERSION``。
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def _register_shared_python_root() -> Path | None:
    """源码态把 ``packages/shared-py`` 挂上 ``sys.path``，让 ``import homeos_shared`` 可用。

    镜像态**不做也不该做**：构建阶段已把 ``homeos_shared`` 内联进 ``/app``（见 Dockerfile 的
    ``COPY packages/shared-py/homeos_shared ./homeos_shared``），而 ``PYTHONPATH=/app`` 已经让它
    可解析。判据是「上溯祖先目录里有没有 ``packages/shared-py/homeos_shared/__init__.py``」——
    镜像里 ``__file__`` 是 ``/app/app/__init__*.so``，一路查到 ``/`` 都落空，自然无害跳过。

    为什么放在包入口而不是各启动脚本里：仓库里有二十来处脚本 / 迁移入口 / 门禁各自往
    ``sys.path`` 插后端目录（``ops/{check_schema,check_database,license_keys}.py``、
    两个 ``migrations/env.py``、``*/scripts/*_smoke.py`` …），逐个补一行必然漏；而它们**都**要
    ``import src.*``，所以包入口这一次注册就全覆盖了，将来新增脚本也不必再记得这件事。
    """
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "packages" / "shared-py"
        if (candidate / "homeos_shared" / "__init__.py").is_file():
            if str(candidate) not in sys.path:
                sys.path.append(str(candidate))
            return candidate
    return None


# 必须在任何 ``from .xxx import …`` 之前执行：下面这些子模块里会 ``import homeos_shared``。
_register_shared_python_root()

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
