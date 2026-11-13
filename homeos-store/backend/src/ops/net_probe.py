"""网络探测的门面（实现已下沉到 ``infra.net_probe``）。"""

from __future__ import annotations

from ..infra.net_probe import (
    LEVEL_FAIL,
    LEVEL_PASS,
    LEVEL_SKIP,
    LEVEL_WARN,
    check_result,
    host_from_url,
    is_private_host,
    probe_http,
    probe_tls,
    resolve_host,
)

__all__ = [
    "LEVEL_FAIL",
    "LEVEL_PASS",
    "LEVEL_SKIP",
    "LEVEL_WARN",
    "check_result",
    "host_from_url",
    "is_private_host",
    "probe_http",
    "probe_tls",
    "resolve_host",
]
