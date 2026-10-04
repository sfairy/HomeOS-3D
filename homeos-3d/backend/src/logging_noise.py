"""开发期日志降噪：丢掉 uvicorn 重载器的「检测到改动，正在重载」提示。

这条提示来自 ``uvicorn/supervisors/basereload.py`` 的 ``logger.warning(...)``，
logger 名是 ``uvicorn.error``、级别就是 WARNING —— 所以 ``--log-level warning`` 压不掉
它，只有 ``log_level=error`` 能，但那样会把 ``uvicorn.access`` 也设成 ERROR，请求日志和
``Started server process`` / ``Application startup complete`` 一起消失。

线上由容器直接起 uvicorn，不带 ``--reload``，这条日志本来就不会出现。过滤器只挂在开发
启动加的那个 ``--log-config``（``ops/dev_logging.json``）上，生产路径不受影响。
"""
from __future__ import annotations

import logging

#: uvicorn 重载提示里的固定片段（见 ``basereload.py`` 的 ``"%s detected changes in %s"``）。
RELOAD_NOISE_MARKER = "detected changes in"


class ReloadNoiseFilter(logging.Filter):
    """按 message 内容丢弃记录：只挡重载提示，同 logger 的其余日志原样放行。

    过滤器由 ``ops/dev_logging.json`` 以 ``backend.src.logging_noise.ReloadNoiseFilter``
    这个点分路径实例化（``logging.config.dictConfig`` 的 ``"()"`` 工厂），所以构造函数
    只接受 ``logging.Filter`` 的 ``name`` 参数、不额外要求入参。
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            # 取不到 message（格式化失败）时不要顺手把记录吞掉：交给下游按原样处理。
            return True
        return RELOAD_NOISE_MARKER not in message
