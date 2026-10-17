"""通用日志降噪：丢掉「每次启动都出现、且不带任何信息」的两类噪音。

一、开发期重载提示（uvicorn 重载 + watchfiles 逐次改动）
------------------------------------------------------
热重载（主应用 ``HOMEOS_RELOAD=1`` / 商店 ``STORE_RELOAD=1``）下必然出现的两条噪音：

  - ``uvicorn.error`` 的 ``WARNING: WatchFiles detected changes in ... Reloading...``
    （``uvicorn/supervisors/basereload.py``），级别本身就是 WARNING，调 ``log_level``
    压不掉它；
  - ``watchfiles.main`` 的 ``INFO: N change detected``，经各后端 ``run.py`` 的
    ``basicConfig`` 打到 root。

线上容器由 ``ops/docker/start_app.py`` 直起 uvicorn（不带 ``--reload``），商店侧同样清掉
``STORE_RELOAD``，都走 ``run.py`` 的非重载分支，不会调用这里的安装函数。

二、alembic 的例行播报（每次启动两条常量）
----------------------------------------
``alembic upgrade`` 每次都会打这两行，内容恒定、与本次迁移毫无关系：

    INFO  [alembic.runtime.migration] Context impl SQLiteImpl.
    INFO  [alembic.runtime.migration] Will assume non-transactional DDL.

它们由 ``alembic.ini`` 的 ``[logger_alembic] handlers =``（空 → 交给 root）配上
``[handler_console]`` 的 ``%(levelname)-5.5s [%(name)s] %(message)s`` 输出，于是启动日志里
会多出两行**没有时间戳、与两侧自家格式都不同**的行 —— 稳态下（没有待应用的迁移）它们
就是启动日志里唯一的外来格式。真正有用的那行是 ``Running upgrade <from> -> <to>``
（只在**确实要迁移**时出现），予以保留。

两个后端共用本实现（真源 ``packages/shared-py``）：本模块不碰任何一方的配置或包名，
只依赖标准库 ``logging``，故可安全共享。
"""
from __future__ import annotations

import logging
import re

#: uvicorn 重载提示里的固定片段（见 ``basereload.py`` 的 ``"%s detected changes in %s"``）。
RELOAD_NOISE_MARKER = "detected changes in"

#: alembic 每次启动都打的常量行（``Context impl SQLiteImpl.`` / ``Context impl PostgresqlImpl.`` …）
ALEMBIC_ROUTINE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^Context impl \w+\.$"),
    re.compile(r"^Will assume non-transactional DDL\.$"),
)

#: 承载上述常量行的 alembic 日志器
ALEMBIC_ROUTINE_LOGGER = "alembic.runtime.migration"

_FILTER_NAME = "homeos-reload-noise"
_ALEMBIC_FILTER_NAME = "homeos-alembic-noise"


class ReloadNoiseFilter(logging.Filter):
    """按 message 内容丢弃记录：只挡重载提示，同 logger 的其余日志原样放行。"""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            # 取不到 message（格式化失败）时不要顺手把记录吞掉：交给下游按原样处理。
            return True
        return RELOAD_NOISE_MARKER not in message


def install_reload_noise_filter() -> ReloadNoiseFilter:
    """挂过滤器到 ``uvicorn.error``，并把 ``watchfiles`` 收到 WARNING（幂等）。

    必须在 ``uvicorn.run()`` **之前**调用：重载提示是 supervisor（即本进程）打的，而
    uvicorn 内部的 ``dictConfig`` 只重建 handler、不清 logger 上已有的 filter，所以这里
    挂上的过滤器能活过它自己的日志配置（这点已实测）。

    ``watchfiles`` 收档而不是禁用：纯 Python 回退路径会在 WARNING 上报「没找到 Rust
    notify」，那种真信息要留着。
    """
    logger = logging.getLogger("uvicorn.error")
    installed = next(
        (item for item in logger.filters if isinstance(item, ReloadNoiseFilter)), None
    )
    if installed is None:
        installed = ReloadNoiseFilter(_FILTER_NAME)
        logger.addFilter(installed)
    logging.getLogger("watchfiles").setLevel(logging.WARNING)
    return installed


class AlembicRoutineFilter(logging.Filter):
    """丢掉 alembic 的例行播报常量行（见模块 docstring 第二节）；其余一律放行。"""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            # 取不到 message（格式化失败）时不要顺手把记录吞掉：交给下游按原样处理。
            return True
        return not any(pattern.match(message) for pattern in ALEMBIC_ROUTINE_PATTERNS)


def install_alembic_noise_filter() -> AlembicRoutineFilter:
    """把 alembic 例行播报的过滤器挂到 ``alembic.runtime.migration`` 上（幂等）。

    在 ``migrations/env.py`` 里 ``fileConfig(...)`` **之后**调用：那两行常量正是 fileConfig
    打开 alembic INFO 档之后才露出来的。挂到 logger 上而不是 handler 上，是为了不依赖
    ``alembic.ini`` 里 handler 的具体装配（那份配置由 fileConfig 读入，可能被部署方改）。
    """
    logger = logging.getLogger(ALEMBIC_ROUTINE_LOGGER)
    installed = next(
        (item for item in logger.filters if isinstance(item, AlembicRoutineFilter)), None
    )
    if installed is None:
        installed = AlembicRoutineFilter(_ALEMBIC_FILTER_NAME)
        logger.addFilter(installed)
    return installed


__all__ = [
    "ALEMBIC_ROUTINE_LOGGER",
    "ALEMBIC_ROUTINE_PATTERNS",
    "RELOAD_NOISE_MARKER",
    "AlembicRoutineFilter",
    "ReloadNoiseFilter",
    "install_alembic_noise_filter",
    "install_reload_noise_filter",
]
