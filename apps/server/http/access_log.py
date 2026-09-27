"""访问日志里「已知第三方噪音」的过滤。

**为什么需要**：本项目的两张入口页上会挂进浏览器侧的第三方脚本（最典型的是扩展挂钩主世界
的 XHR —— ``frontend/static/logging/client-log.js`` 里那条 ``EXTENSION_CONSOLE_NOISE_PREFIX``
就是为它留的）。这类脚本会按**内容哈希**去当前源取 source map，也就是
``GET /sm/<sha256>.map``。本项目根本没有 ``/sm/`` 路由，于是它每次都落成一条
``404 Not Found`` 的访问日志 —— 而访问日志里既没有发起方、也没有 User-Agent，
排查的人只能看到一串毫无线索的哈希，很容易误以为是自己这边漏了路由。

**这不是把错误藏起来**，只是把「已知与业务无关、且已经确认查无此路由」的那一类挡在访问日志外：
业务路由、``/api/``（含 5xx）、页面与静态资源一律照旧记录；被过滤的条目在**首次命中时**
往 ``uvicorn.error`` 写一条 INFO 说明，所以「日志里少了什么」本身仍然可查。

**为什么装在 lifespan 里而不是模块导入时**：uvicorn 的 ``Config.__init__`` 会先跑
``configure_logging()``（``dictConfig`` 会**清掉**已配置 logger 上的过滤器），之后才导入应用、
再跑 lifespan。所以导入期装的过滤器会被抹掉（``apps/store/run.py`` 正是这种顺序），
只有 lifespan 这一层能稳定生效 —— 它同时覆盖 ``python -m uvicorn``、容器里的程序化
``uvicorn.run()`` 与 gunicorn+uvicorn worker 三种启动方式。
"""
from __future__ import annotations

import logging
import re

#: 已知的第三方客户端噪音：正则 → 为什么不记。
#: 新增一类只加一行，并写清「为什么它一定不是我们的请求」—— 没有理由的一律不要加进来，
#: 否则这张表会退化成「把看不懂的日志都关掉」。
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

    返回装上去的那个实例，便于调用方读 ``_suppressed``（测试与排障用）。
    """
    logger = logging.getLogger('uvicorn.access')
    for existing in logger.filters:
        if isinstance(existing, AccessLogNoiseFilter):
            return existing
    installed = AccessLogNoiseFilter()
    logger.addFilter(installed)
    return installed
