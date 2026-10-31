"""状态日志去重（主应用侧；真源见 ``homeos_shared.status_log_dedupe``）。

本模块只做一层薄绑定 + 钉住主应用这一侧的变量名：窗口由 ``LOG_STATUS_DEDUPE_MS`` 选择
（毫秒，``0`` 关闭，未设置默认 30 分钟；非法值回退默认）。

为什么留这一层而不是各处直接 import 共享包：判定细节（生命周期文案恒放行、``error`` 恒放行、
数量级放行折叠注记、多 handler 只判一次）写在共享模块里，两侧不该各存一份；而「读哪个环境变量、
对外暴露什么名字」是各后端自己的事 —— 商店读 ``STORE_LOG_STATUS_DEDUPE_MS``。

过滤器的两个挂载点都在主应用：控制台 handler（``platform/core/log.py``）与运行日志缓冲 handler
（``platform/core/runtime_logs.py``），二者共享同一次判定（判定缓存在 ``LogRecord`` 上），
所以控制台收掉的行不会在 ``/system/runtime-logs`` 里又冒出来。
"""

from __future__ import annotations

from homeos_shared.status_log_dedupe import (
    DEFAULT_DEDUPE_MS,
    FOLD_NOTE,
    FOLD_REPORT_AT,
    MAX_ENTRIES,
    DedupeDecision,
    reset_status_dedupe,
    stabilize_status_message,
)
from homeos_shared.status_log_dedupe import (
    StatusLogDedupeFilter as _StatusLogDedupeFilter,
)
from homeos_shared.status_log_dedupe import dedupe_decision as _dedupe_decision
from homeos_shared.status_log_dedupe import should_emit_status_log as _should_emit_status_log
from homeos_shared.status_log_dedupe import suppressed_count as _suppressed_count

#: 主应用这一侧的去重窗口变量（商店侧是 ``STORE_LOG_STATUS_DEDUPE_MS``）
ENV_VAR = "LOG_STATUS_DEDUPE_MS"


class StatusLogDedupeFilter(_StatusLogDedupeFilter):
    """主应用侧的去重过滤器：绑定 ``LOG_STATUS_DEDUPE_MS``（零参构造，便于 handler 直接挂）。"""

    def __init__(self) -> None:
        super().__init__(ENV_VAR)


def dedupe_decision(level: str, context: str, message: str) -> DedupeDecision:
    """判断该怎么处理（含折叠注记）；窗口取 ``LOG_STATUS_DEDUPE_MS``。"""
    return _dedupe_decision(level, context, message, ENV_VAR)


def should_emit_status_log(level: str, context: str, message: str) -> bool:
    """判断一条状态日志是否应输出。"""
    return _should_emit_status_log(level, context, message, ENV_VAR)


def suppressed_count(level: str, context: str, message: str) -> int:
    """查询某条状态消息当前被抑制的次数（诊断用）。"""
    return _suppressed_count(level, context, message)


__all__ = [
    "DEFAULT_DEDUPE_MS",
    "ENV_VAR",
    "FOLD_NOTE",
    "FOLD_REPORT_AT",
    "MAX_ENTRIES",
    "DedupeDecision",
    "StatusLogDedupeFilter",
    "dedupe_decision",
    "reset_status_dedupe",
    "should_emit_status_log",
    "stabilize_status_message",
    "suppressed_count",
]
