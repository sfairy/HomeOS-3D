"""访问日志降噪（商店侧）。

uvicorn 把每条请求都按 INFO 打进 ``uvicorn.access``，商店侧尤其吵：客户机的租约与心跳
轮询、编排里的 ``/healthz`` 探针、以及同容器内置反代的 HTTPS 健康检查各自按秒级节奏命中。
受害的是**只打印一次**的东西 —— 首装窗口的引导密钥横幅随启动出现，几秒之后就被顶出
``docker logs`` 的可见范围。这里挂两层过滤器：

1. ``HttpAccessLogFilter``（真源 ``homeos_shared.http_access_log``）：丢掉 ``2xx`` / ``3xx``，
   只留 ``4xx`` / ``5xx``，并把**同一来源的重复请求折叠**（实测：连打 80 次坏激活包 =
   60 条 ``400`` + 20 条 ``429``，逐字相同 —— 折叠后只剩首次与量级说明）；
   详略由 ``STORE_LOG_HTTP_ACCESS`` 选择（``errors`` 默认 / ``off`` 全静默 / ``all`` 不过滤，
   非法值回退 ``errors``；``all`` 同时关掉折叠，逐条可见）。与主应用的 ``LOG_HTTP_ACCESS``
   是同一份实现，避免两侧语义分叉。折叠窗口取 ``STORE_LOG_STATUS_DEDUPE_MS``。
2. ``AccessLogNoiseFilter``：丢掉**已知无信息量**的路径 —— 这类请求即便成交也永远不是
   ``2xx``，所以第 1 层按状态码的过滤拦不住它。

两层都 fail-open：取不到状态码 / 取不到文案时保留记录，宁可多打一条，也不静默吞日志。
"""
from __future__ import annotations

import logging
import re

from homeos_shared.http_access_log import MODE_OFF, HttpAccessLogFilter
from homeos_shared.http_access_log import (
    install_http_access_log_filter as _install_http_access_log_filter,
)

# 相对导入：`src/` 下的模块在镜像里被编译进 `app` 包（绝对 `src.` 导入在产物中不存在，
# 会被 ops/docker/compile_python.py 的 import 门禁挡下）。migrations/ 不受此限 —— 它不进镜像。
from ..core.console_log import STATUS_DEDUPE_ENV_VAR

#: 商店这一侧的访问日志详略变量（主应用侧是 ``LOG_HTTP_ACCESS``）
HTTP_ACCESS_ENV_VAR = "STORE_LOG_HTTP_ACCESS"

NOISY_ACCESS_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r'"[A-Z]+ /sm/'),
        (
            '浏览器侧第三方脚本按内容哈希取 source map（/sm/<sha256>.map）；'
            '本项目没有 /sm/ 路由，对它的响应是一条未知路径 404'
        ),
    ),
)

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
        except Exception:
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
    """把「已知第三方噪音」过滤器挂到 ``uvicorn.access`` 上（幂等，可在每次 lifespan 启动时调用）。"""
    logger = logging.getLogger('uvicorn.access')
    for existing in logger.filters:
        if isinstance(existing, AccessLogNoiseFilter):
            return existing
    installed = AccessLogNoiseFilter()
    logger.addFilter(installed)
    return installed


def install_access_log_filters() -> HttpAccessLogFilter:
    """挂上全部访问日志过滤器，返回状态码过滤器（拿得到生效的模式）。

    ``off`` 时顺手把 ``uvicorn.access`` 提到 WARNING：全静默模式下连格式化都不必做
    （与主应用 ``platform/core/log.py`` 的处理一致）。

    说明日志挂 ``uvicorn.error``：uvicorn 给这棵日志树配了自己的 handler，不依赖 root 的
    配置，因此这条「降噪已启用」在任何启动路径下都看得见。
    """
    installed = _install_http_access_log_filter(
        env_var=HTTP_ACCESS_ENV_VAR,
        announce_logger="uvicorn.error",
        dedupe_env_var=STATUS_DEDUPE_ENV_VAR,
    )
    install_access_log_noise_filter()
    if installed.mode == MODE_OFF:
        # 全静默：顺手抬高访问日志器级别，连格式化都省掉（与主应用一致）。
        logging.getLogger('uvicorn.access').setLevel(logging.WARNING)
    return installed


__all__ = [
    "HTTP_ACCESS_ENV_VAR",
    "AccessLogNoiseFilter",
    "HttpAccessLogFilter",
    "install_access_log_filters",
    "install_access_log_noise_filter",
]
