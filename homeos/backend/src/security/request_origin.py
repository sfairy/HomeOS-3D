"""针对不携带 JSON 请求体的写操作的浏览器来源防护（并入 homeos-3d）。

homeos 原有 CSRF 走「双提交 Cookie + 头部令牌」；homeos-3d 对**无请求体**的写操作
（如 ``/license/retry``）改用浏览器来源校验：``Sec-Fetch-Site`` 必须同源，
``Origin``/``Referer`` 必须与当前站点一致。两者互补，本模块提供后者。

来源基准优先取 ``settings.app_base_url``（反代部署时显式配置）；未配置时退回
「与请求 Host 同站」判断。
"""

from __future__ import annotations

from urllib.parse import urlsplit

from fastapi import Request

from ..core.errors import RequestRejected

_REJECTION = "此操作只允许从当前应用页面发起。"


def require_same_origin_write(request: Request) -> None:
    site = request.headers.get("sec-fetch-site", "").strip().lower()
    if site and site != "same-origin":
        raise RequestRejected(_REJECTION)
    origin = request.headers.get("origin")
    referer = request.headers.get("referer") if origin is None else None
    raw_source = origin if origin is not None else referer
    if raw_source is None:
        # 无 Origin/Referer：脚本 / 测试客户端放行；若已带 Sec-Fetch-Site 则上面已校验同源。
        return
    try:
        source = urlsplit(raw_source.strip())
        valid = (
            source.scheme in {"http", "https"}
            and bool(source.netloc)
            and source.username is None
            and source.password is None
        )
        if origin is not None:
            valid = valid and not (source.path or source.query or source.fragment)
        configured = getattr(getattr(request.app.state, "settings", None), "app_base_url", "") or ""
        if configured:
            expected = urlsplit(configured)
            valid = valid and (source.scheme, source.netloc.casefold()) == (
                expected.scheme,
                expected.netloc.casefold(),
            )
        else:
            valid = (
                valid
                and source.netloc.casefold() == request.headers.get("host", "").casefold()
                and (source.scheme == request.url.scheme or site == "same-origin")
            )
    except ValueError:
        valid = False
    if not valid:
        raise RequestRejected(_REJECTION)


__all__ = ["require_same_origin_write"]
