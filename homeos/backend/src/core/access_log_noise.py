"""HTTP 访问日志降噪（主应用侧）。

uvicorn 默认把**每一条**请求（含静态资源 ``200`` / ``304``）都按 INFO 打进
``uvicorn.access``，开发时刷屏、生产上也把真正有用的信息淹掉。这里在
``uvicorn.access`` 的 logger 上挂一个按状态码判定的过滤器，只保留「值得看」的请求：

- ``errors``（默认）：丢弃 ``2xx`` / ``3xx``（成功与重定向），保留 ``4xx`` / ``5xx``；
- ``off``：整条链路静默（排障想完全安静时用）；
- ``all``：不做过滤，恢复 uvicorn 原样。

由环境变量 ``LOG_HTTP_ACCESS`` 选择，非法 / 未设置回退 ``errors``。解析不到状态码时
**保留**记录（fail-open），避免误吞未知格式的日志。

只在控制台侧生效：运行日志缓冲 handler（``/system/runtime-logs``）只挂在 ``homeos``
日志树上，本就不会镜像 ``uvicorn.access``。
"""

from __future__ import annotations

import logging
import os
import re

#: 过滤模式
MODE_ALL = "all"
MODE_ERRORS = "errors"
MODE_OFF = "off"

#: 展示用说明（安装时打一行，方便确认降噪已生效）
MODE_LABEL = {
    MODE_ERRORS: "仅保留 4xx/5xx（LOG_HTTP_ACCESS=all 恢复全部，=off 全部静默）",
    MODE_OFF: "已全部静默（LOG_HTTP_ACCESS=all 恢复全部）",
}

#: 状态码提取兜底：uvicorn access 文案形如 ``... "GET /x HTTP/1.1" 200``
_STATUS_RE = re.compile(r'"\s+(\d{3})(?:\s|$)')

_FILTER_NAME = "homeos-http-access"


def resolve_http_access_mode() -> str:
    """解析 ``LOG_HTTP_ACCESS``：``all`` / ``off`` 原样返回，其余一律按 ``errors``。"""
    raw = (os.getenv("LOG_HTTP_ACCESS") or "").strip().lower()
    return raw if raw in (MODE_ALL, MODE_OFF) else MODE_ERRORS


def _extract_status(record: logging.LogRecord) -> int | None:
    """从日志记录里取出 HTTP 状态码；取不到返回 ``None``。

    优先读 ``record.args``（uvicorn 用 ``logger.info('%s - "%s %s HTTP/%s" %d', ...)``
    打日志，末位参数即状态码），失败再退回正则解析已格式化的文案。
    """
    args = record.args
    if isinstance(args, tuple) and args:
        try:
            return int(args[-1])
        except (TypeError, ValueError):
            pass
    try:
        message = record.getMessage()
    except Exception:  # noqa: BLE001 - 格式化失败时交给调用方按 fail-open 处理
        return None
    match = _STATUS_RE.search(message)
    return int(match.group(1)) if match else None


class HttpAccessLogFilter(logging.Filter):
    """按状态码丢弃「正常」访问日志；判定规则见模块 docstring。"""

    def __init__(self, mode: str | None = None) -> None:
        super().__init__(_FILTER_NAME)
        self._mode = mode or resolve_http_access_mode()

    @property
    def mode(self) -> str:
        return self._mode

    def filter(self, record: logging.LogRecord) -> bool:
        if self._mode == MODE_ALL:
            return True
        if self._mode == MODE_OFF:
            return False
        status = _extract_status(record)
        # 取不到状态码时保留，宁可多打一条也不吞掉未知格式的日志
        return status is None or status >= 400


def install_http_access_log_filter() -> HttpAccessLogFilter:
    """把过滤器挂到 ``uvicorn.access``（幂等，可在每次启动时调用）。"""
    logger = logging.getLogger("uvicorn.access")
    installed = next(
        (item for item in logger.filters if isinstance(item, HttpAccessLogFilter)), None
    )
    if installed is None:
        installed = HttpAccessLogFilter()
        logger.addFilter(installed)
        if installed.mode != MODE_ALL:
            logging.getLogger("homeos").info(
                "HTTP 访问日志降噪已启用: %s", MODE_LABEL[installed.mode]
            )
    return installed


__all__ = [
    "MODE_ALL",
    "MODE_ERRORS",
    "MODE_LABEL",
    "MODE_OFF",
    "HttpAccessLogFilter",
    "install_http_access_log_filter",
    "resolve_http_access_mode",
]
