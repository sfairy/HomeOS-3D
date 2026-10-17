"""控制台日志输出（进程级）：格式、等级与访问日志的**唯一来源**。

为什么要装两次
--------------
``run.py`` 起进程时先装一次（``basicConfig``），应用 lifespan 里再用 ``force=True`` 装一次。
reload 模式下 worker 是 spawn 出来的子进程，既不继承父进程的 handler，也没有人替它装；
lifespan 那次覆盖的是这条路径。

顺带接管 uvicorn 的日志器
-------------------------
不接管的话，同一份启动日志里会有**两套格式**：

    2026-10-17 08:38:57,066 INFO    src | 授权商店服务已启动：http://127.0.0.1:8898
    INFO:     Started server process [94945]
    INFO:     Uvicorn running on http://127.0.0.1:8898 (Press CTRL+C to quit)

下面那两行是 uvicorn 自己装配的 handler（``uvicorn.config.LOGGING_CONFIG``），没有时间戳、
没有进程身份，且是英文。后者尤其别扭：``Uvicorn running on …`` 和上一行自家那句说的是同一件事。
这里改成接管（``run.py`` 同时传 ``log_config=None``，否则 uvicorn 会在启动时把我们挂的 handler
换掉）：uvicorn 日志器走同一份格式，文案翻成中文（规则表在 ``homeos_shared.uvicorn_messages``，
与主应用共用，避免一边中文一边英文）。

重复状态日志去重
----------------
同一条告警按请求数刷屏是真事（实测：110 次错误请求 → 80 行逐字相同的 WARNING）。判定与
「按数量级放行 + 折叠注记」的取舍写在 ``homeos_shared.status_log_dedupe``，窗口由
``STORE_LOG_STATUS_DEDUPE_MS`` 选择（``0`` 关闭，默认 30 分钟）。
"""

from __future__ import annotations

import logging
import sys

from homeos_shared.status_log_dedupe import StatusLogDedupeFilter
from homeos_shared.uvicorn_messages import (
    is_uvicorn_logger,
    localize_uvicorn_context,
    localize_uvicorn_message,
)

#: 控制台行格式：时间、级别、logger 名、消息
FORMAT = "%(asctime)s %(levelname)-7s %(name)s | %(message)s"

#: 收到 WARNING 的第三方日志树：它们的 INFO 大多是「一行一次网络往返」
#: （``httpx`` 的 ``HTTP Request: POST https://… 200 OK``），每笔支付查单/退款各一条。
#: 这类往返有没有问题看状态码与业务结果就够，不必逐条铺在启动日志里。
QUIET_LOGGERS = ("httpx", "httpcore", "urllib3")

#: 需要一并接管的 uvicorn 日志器（不接管就会出现上文的「两套格式」）
UVICORN_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")

#: 重复状态去重的窗口变量（主应用侧是 ``LOG_STATUS_DEDUPE_MS``）
STATUS_DEDUPE_ENV_VAR = "STORE_LOG_STATUS_DEDUPE_MS"

#: **永不去重**的日志树：每一条都对应一笔真实资金动作或一条运营异常记录，
#: 条数本身就是信息（少一条都可能意味着少一笔钱）。其余日志仍按窗口折叠。
NEVER_FOLD_PREFIXES = ("src.payments", "src.ops.incidents")

#: 标记自建 handler，便于幂等判断
_HANDLER_FLAG = "_store_console_handler"


class StoreConsoleFormatter(logging.Formatter):
    """uvicorn 日志器名换成中文展示名，其余日志器原样（``src.*`` 保持可 grep）。"""

    def format(self, record: logging.LogRecord) -> str:
        context = localize_uvicorn_context(record.name)
        if context is None:
            return super().format(record)
        original = record.name
        record.name = context
        try:
            return super().format(record)
        finally:
            record.name = original


class UvicornMessageFilter(logging.Filter):
    """把 uvicorn 的英文启动/关闭文案翻成中文；未命中规则或不是 uvicorn 的日志器时原样放行。

    判 ``record.name`` 而不是只判文案：本过滤器挂在 root 与 uvicorn 的 handler 上，
    业务日志（``src.*``）也会流经这里；只按文案匹配的话，一条恰好等于
    ``Shutting down`` 的业务日志会被改写成中文，虽然罕见但没必要留这种可能。
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if not is_uvicorn_logger(record.name):
            return True
        try:
            message = record.getMessage()
        except Exception:
            return True
        localized = localize_uvicorn_message(message)
        if localized != message:
            record.msg = localized
            record.args = ()
        return True


def _console_handler(level: int) -> logging.Handler:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(StoreConsoleFormatter(FORMAT))
    # 去重判定缓存在记录上，与 root 的 handler 共享同一次判定（不会一边折叠一边漏出）
    handler.addFilter(
        StatusLogDedupeFilter(STATUS_DEDUPE_ENV_VAR, never_fold_prefixes=NEVER_FOLD_PREFIXES)
    )
    handler.addFilter(UvicornMessageFilter())
    setattr(handler, _HANDLER_FLAG, True)
    return handler


def _attach_uvicorn_handlers(level: int) -> None:
    """接管 uvicorn 日志器（幂等）：复用同一份格式与过滤器，并断开向 root 的传播。"""
    for name in UVICORN_LOGGERS:
        logger = logging.getLogger(name)
        for existing in list(logger.handlers):
            if not getattr(existing, _HANDLER_FLAG, False):
                # uvicorn 默认装配的 handler：不摘掉的话同一行会被两种格式各打一次
                logger.removeHandler(existing)
        if not any(getattr(item, _HANDLER_FLAG, False) for item in logger.handlers):
            logger.addHandler(_console_handler(level))
        logger.setLevel(level)
        logger.propagate = False


def configure_console_logging(level: int = logging.INFO) -> None:
    """（重）装 root 上的控制台 handler，并接管 uvicorn 的日志器。

    直接换 handler 而不是用 ``basicConfig(force=True)``：这里要的是「格式 + 过滤器 + 幂等」
    三件事一起成立，而 ``logging.basicConfig`` 在 root 已有 handler 时会**连同 ``format``
    一起忽略**（除非 ``force``），装完还得再补过滤器。

    写 **stdout** 而不是 stderr：商店的引导密钥横幅与容器启动提示都是 ``print``（stdout），
    两股流分开会让 ``docker logs`` 里的先后顺序失真（横幅本应紧跟在「服务已启动」之后）。
    主应用侧同样是 stdout。
    """
    root = logging.getLogger()
    for existing in list(root.handlers):
        if not getattr(existing, _HANDLER_FLAG, False):
            root.removeHandler(existing)
    if not any(getattr(item, _HANDLER_FLAG, False) for item in root.handlers):
        root.addHandler(_console_handler(level))
    root.setLevel(level)
    for name in QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
    _attach_uvicorn_handlers(level)


__all__ = [
    "FORMAT",
    "NEVER_FOLD_PREFIXES",
    "QUIET_LOGGERS",
    "STATUS_DEDUPE_ENV_VAR",
    "UVICORN_LOGGERS",
    "StoreConsoleFormatter",
    "UvicornMessageFilter",
    "configure_console_logging",
]
