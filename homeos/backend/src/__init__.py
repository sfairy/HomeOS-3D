"""HomeOS Python 后端包。

- ``src.config``         运行期不可变配置（env 装配）
- ``src.platform.core.{db,http,entity,ha,runtime}.*`` 数据库、错误、实体语义、HA 协议面、运行时
- ``src.domains.*``      业务域（含 ``ha/{integration,config}``）
- ``src.app``            FastAPI 应用工厂（lifespan / 中间件 / 路由 / 静态资源）
- ``src.run``            uvicorn 启动入口

与商店共用的叶子模块（``logging_noise`` / ``file_lock`` / ``schema_core`` / ``client_ip`` /
``rate_limit`` / ``license_transport``）**不在本包内**：它们在 ``packages/shared-py/homeos_shared``，
由本包导入时挂好 ``sys.path``（见下）。

版本号：构建期烘进 ``src/_version.py``（见根 Dockerfile，且该文件在 ``.gitignore`` 中）；
源码 / CI 环境没有该模块时，回落到仓库 ``package.json`` / ``HOMEOS_APP_VERSION``。
"""

from __future__ import annotations

import sys
from pathlib import Path


def _register_shared_python_root() -> Path | None:
    """源码态把 ``packages/shared-py`` 挂上 ``sys.path``，让 ``import homeos_shared`` 可用。

    镜像态**不做也不该做**：构建阶段已把 ``homeos_shared`` 内联进 ``/app``（见 Dockerfile 的
    ``COPY packages/shared-py/homeos_shared ./homeos_shared``），而 ``PYTHONPATH=/app`` 已经让它
    可解析。判据是「上溯祖先目录里有没有 ``packages/shared-py/homeos_shared/__init__.py``」——
    镜像里 ``__file__`` 是 ``/app/app/__init__*.so``，一路查到 ``/`` 都落空，自然无害跳过。

    为什么放在包入口而不是各启动脚本里：多个工具脚本各自往 ``sys.path`` 插后端目录
    （``ops/license_keys.py`` 等），逐个补一行必然漏；而它们**都**要 ``import src.*``，
    所以包入口这一次注册就全覆盖了。
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

from .env import load_env_files
from .platform.core.runtime.log import configure_app_logging

# 与 Nest ``import 'dotenv/config'`` 对齐：进程启动即装载 .env，
# 保证任何子模块读取 os.environ 之前生效。
load_env_files()

# 在应用导入的最早时机初始化日志（幂等）：uvicorn 子进程只会导入 ``src.app``，
# 需在此挂好 ``homeos`` 与 uvicorn 日志器，保证「Started server process」等
# 早期日志也走 Nest 风格格式。
configure_app_logging()


# 版本解析下沉到叶子模块 ``version``：``config`` 也要用它，而 ``config`` 由本包的
# ``.env`` 导入 —— 留在这里会形成 ``__init__ → env → config → __init__`` 的导入环。
from .version import __version__, load_app_version

__all__ = ["__version__", "load_app_version"]
