"""HTTP 条件请求（ETag / 304）的共享小工具。

展示页每次冷启动都会重新拉草稿与素材清单。这些响应不大但很稳定，服务端只要给出
强 ETag，浏览器就会用 `If-None-Match` 回源校验，命中时返回空 304，省掉 JSON
序列化、文档解析与传输。这里集中放生成/匹配逻辑，避免各路由各写一份。

只用于"已授权后仍必须每次校验"的私有数据：`Cache-Control: private, no-cache`
表示浏览器可以存，但每次使用前都要回源确认；不要把这里的结果标成 public。
"""
from __future__ import annotations

import hashlib

from fastapi import Request, Response

__all__ = [
    "etag_matches",
    "make_etag",
    "not_modified",
    "set_private_revalidate",
]


def make_etag(*parts: object) -> str:
    """由稳定字段生成强 ETag；字段顺序即语义顺序。"""
    joined = "\x1f".join(str(part) for part in parts)
    digest = hashlib.sha256(joined.encode("utf-8")).hexdigest()[:32]
    return f'"{digest}"'


def etag_matches(if_none_match: str | None, etag: str) -> bool:
    """RFC 9110 `If-None-Match` 匹配（逗号列表、W/ 前缀、*）。"""
    if not if_none_match:
        return False
    normalized = etag.removeprefix("W/")
    return any(
        value == "*" or value.removeprefix("W/") == normalized
        for value in (part.strip() for part in if_none_match.split(","))
    )


def request_etag_matches(request: Request, etag: str) -> bool:
    """条件请求是否命中；非 GET/HEAD 一律视为未命中。"""
    if request.method not in {"GET", "HEAD"}:
        return False
    return etag_matches(request.headers.get("if-none-match"), etag)


def set_private_revalidate(response: Response, etag: str) -> None:
    """给 200 响应挂上 ETag，并要求浏览器每次使用前回源校验。"""
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, no-cache"


def not_modified(etag: str) -> Response:
    """条件命中时的空 304，保留与 200 相同的校验器与缓存策略。"""
    return Response(
        status_code=304,
        headers={"ETag": etag, "Cache-Control": "private, no-cache"},
    )
