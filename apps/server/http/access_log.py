"""访问日志里「已知第三方噪音」的过滤。
"""
from __future__ import annotations

import logging
import re

NOISY_ACCESS_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r'"[A-Z]+ /sm/'),
        '浏览器侧第三方脚本按内容哈希取 source map（/sm/<sha256>.map）；'
        '本项目没有 /sm/ 路由，对它的响应是一条未知路径 404',
    ),
)

#: 过滤器名字：重复安装时靠它去重（lifespan 在热重载下会跑很多次）。
_FILTER_NAME = 'homeos-access-noise'


class AccessLogNoiseFilter(logging.Filter):
    """把命中 ``NOISY_ACCESS_PATTERNS`` 的访问日志丢掉，并在首次命中时说明一次。"""

    def __init__(self, patterns: tuple[tuple[re.Pattern[str], str], ...] = NOISY_ACCESS_PATTERNS) -> None:
        super().__init__(_FILTER_NAME)
        self._patterns = patterns
        self._suppressed = 0
        self._announced = False

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # noqa: BLE001 - 日志参数畸形不该让整条日志丢失
            return True
        for pattern, reason in self._patterns:
            if not pattern.search(message):
                continue
            self._suppressed += 1
            # 只说明一次：这不是「静默关闭」，但也不必为每一条噪音都刷一行。
            if not self._announced:
                self._announced = True
                logging.getLogger('uvicorn.error').info(
                    '访问日志已开始过滤已知的第三方噪音（累计 %d 条）。首个命中：%s\n  原因：%s',
                    self._suppressed,
                    message.strip(),
                    reason,
                )
            return False
        return True


def install_access_log_noise_filter() -> AccessLogNoiseFilter:
    """把过滤器挂到 ``uvicorn.access`` 上（幂等，可在每次 lifespan 启动时调用）。
    """
    logger = logging.getLogger('uvicorn.access')
    for existing in logger.filters:
        if isinstance(existing, AccessLogNoiseFilter):
            return existing
    installed = AccessLogNoiseFilter()
    logger.addFilter(installed)
    return installed
