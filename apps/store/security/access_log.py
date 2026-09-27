"""访问日志里「已知第三方噪音」的过滤（商店侧）。

**为什么需要**：商店的页面同样会被浏览器侧的第三方脚本挂钩，它们会按**内容哈希**去当前源取
source map，也就是 ``GET /sm/<sha256>.map``。商店没有 ``/sm/`` 路由，于是它每次都落成一条
``404 Not Found`` 的访问日志 —— 而访问日志里既没有发起方也没有 User-Agent，
排查的人只能看到一串哈希，容易误以为是自己漏了路由。

**这不是把错误藏起来**：``/api/``（含 5xx）、页面与静态资源一律照旧记录；被过滤的条目在
**首次命中时**往 ``uvicorn.error`` 写一条 INFO 说明，所以「日志里少了什么」本身仍然可查。

**为什么单独一份**：商店与主应用是两个独立部署的项目，各自只 ``import`` 自己的包
（见 ``apps/store/core/static_revision.py`` 的同款说明）。这与 ``apps/store/security/body_guard.py``、
``apps/store/security/compression.py`` 是同一类做法：概念共享、实现各留一份。

**为什么装在 lifespan 里而不是模块导入时**：uvicorn 的 ``Config.__init__`` 会先跑
``configure_logging()``（``dictConfig`` 会清掉已配置 logger 上的过滤器），之后才导入应用、
再跑 lifespan。``apps/store/run.py`` 正是在 ``uvicorn.run()`` **之前**就 import 了本包，
导入期装的过滤器会被抹掉；只有 lifespan 这一层稳定生效，且同时覆盖命令行与程序化启动。
"""
from __future__ import annotations

import logging
import re

#: 已知的第三方客户端噪音：正则 → 为什么不记。
#: 新增一类只加一行，并写清「为什么它一定不是我们的请求」。
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
    """把过滤器挂到 ``uvicorn.access`` 上（幂等，可在每次 lifespan 启动时调用）。"""
    logger = logging.getLogger('uvicorn.access')
    for existing in logger.filters:
        if isinstance(existing, AccessLogNoiseFilter):
            return existing
    installed = AccessLogNoiseFilter()
    logger.addFilter(installed)
    return installed
