"""条件请求判定：``ETag`` / ``If-None-Match`` 协商。

两个后端各有一份逐字相同的实现（主应用在 ``bootstrap/studio_shell.py``，商店在
``security/static_cache.py``）。差异只有引号风格与 docstring，因此收口到此，行为不变：

- 只处理 ``GET``/``HEAD`` 且响应为 200；
- 支持逗号分隔的多值、``*``、弱校验前缀 ``W/``；
- 任一侧缺失 ``etag`` 或 ``if-none-match`` 都视为不命中。
"""

from __future__ import annotations

from typing import Any


def etag_value_matches(if_none_match: str | None, etag: str) -> bool:
    """纯字符串版的条件匹配：``If-None-Match`` 是否命中给定强 ETag。

    两个后端都有「已经在手里握着一份缓存字节，只想问一句要不要回 304」的场景
    （商店的 ``products_cache`` 就是），它们拿不到 ``Response`` 对象，也不该为了问这一句
    去构造一个。RFC 9110 的匹配规则只有一套，因此拆成纯函数，由 :func:`etag_matches`
    与调用方共用。
    """
    if not if_none_match or not etag:
        return False
    normalized = etag.removeprefix("W/")
    return any(
        value == "*" or value.removeprefix("W/") == normalized
        for value in (part.strip() for part in if_none_match.split(","))
    )


def etag_matches(request: Any, response: Any) -> bool:
    """GET/HEAD 条件请求的校验器是否命中此可缓存响应。"""
    if request.method not in {"GET", "HEAD"} or response.status_code != 200:
        return False
    return etag_value_matches(
        request.headers.get("if-none-match"), response.headers.get("etag") or ""
    )
