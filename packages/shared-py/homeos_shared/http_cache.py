"""条件请求判定：``ETag`` / ``If-None-Match`` 协商。

两个后端各有一份逐字相同的实现（主应用在 ``bootstrap/studio_shell.py``，商店在
``security/static_cache.py``）。差异只有引号风格与 docstring，因此收口到此，行为不变：

- 只处理 ``GET``/``HEAD`` 且响应为 200；
- 支持逗号分隔的多值、``*``、弱校验前缀 ``W/``；
- 任一侧缺失 ``etag`` 或 ``if-none-match`` 都视为不命中。
"""

from __future__ import annotations

from typing import Any


def etag_matches(request: Any, response: Any) -> bool:
    """GET/HEAD 条件请求的校验器是否命中此可缓存响应。"""
    if request.method not in {"GET", "HEAD"} or response.status_code != 200:
        return False
    etag = response.headers.get("etag")
    requested = request.headers.get("if-none-match")
    if not etag or not requested:
        return False
    normalized = etag.removeprefix("W/")
    return any(
        value == "*" or value.removeprefix("W/") == normalized
        for value in (part.strip() for part in requested.split(","))
    )
