"""HomeOS Python 后端（NestJS → FastAPI 透明替换）。

包结构镜像仓库既有的 homeos-3d / homeos-store Python 约定：
- ``src.config``         运行期不可变配置（env 装配）
- ``src.core.*``         数据库、模型、错误、可观测性、迁移
- ``src.app``            FastAPI 应用工厂（lifespan / 中间件 / 路由 / 静态资源）
- ``src.run``            uvicorn 启动入口
"""

from ._version import __version__
from .core.log import configure_app_logging
from .env import load_env_files

# 与 Nest ``import 'dotenv/config'`` 对齐：进程启动即装载 .env，
# 保证任何子模块读取 os.environ 之前生效。
load_env_files()

# 在应用导入的最早时机初始化日志（幂等）：uvicorn 子进程只会导入 ``src.app``，
# 需在此挂好 ``homeos`` 与 uvicorn 日志器，保证「Started server process」等
# 早期日志也走 Nest 风格格式。
configure_app_logging()

__all__ = ["__version__"]
