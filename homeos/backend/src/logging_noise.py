"""开发期日志降噪（主应用侧）：丢掉 uvicorn 重载提示与 watchfiles 的逐次改动日志。

只在 ``HOMEOS_RELOAD=1`` 的热重载下才会出现的两条噪音：

  - ``uvicorn.error`` 的 ``WARNING: WatchFiles detected changes in ... Reloading...``
    （``uvicorn/supervisors/basereload.py``），级别本身就是 WARNING，调 ``log_level``
    压不掉它；
  - ``watchfiles.main`` 的 ``INFO: N change detected``，经 ``run.py`` 的
    ``basicConfig`` 打到 root。

线上容器由 ``ops/docker/start_app.py`` 直起 uvicorn（不带 ``--reload``），走 ``run.py``
的非重载分支，不会调用这里的安装函数。
"""
from __future__ import annotations

import logging

#: uvicorn 重载提示里的固定片段（见 ``basereload.py`` 的 ``"%s detected changes in %s"``）。
RELOAD_NOISE_MARKER = "detected changes in"

_FILTER_NAME = "homeos-reload-noise"


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
