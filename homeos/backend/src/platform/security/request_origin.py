"""针对不携带 JSON 请求体的写操作的浏览器来源防护。

CSRF 走「双提交 Cookie + 头部令牌」；对**无请求体**的写操作（如 ``/license/retry``）
额外要求浏览器来源校验：``Sec-Fetch-Site`` 必须同源，``Origin``/``Referer`` 必须与
当前站点一致。两者互补，本模块提供后者。

来源基准是「``settings.app_base_url``（反代 / 内网穿透部署时显式配置的对外地址）」**或**
「与本次请求的 Host 同站」—— 任一成立即放行同源。配置值不是唯一允许的地址：同一套服务
常同时被公网域名与局域网 IP 访问（用户就在现场），只认配置值会把另一个入口的写操作全拒掉。
"""

from __future__ import annotations

from urllib.parse import urlsplit

from fastapi import Request

from ..core.errors import RequestRejected

_REJECTION = "此操作只允许从当前应用页面发起。"


def browser_origin(request: Request) -> str:
    """浏览器**正在用**的站点来源 ``scheme://host[:port]``；判不出来时返回空串。

    与 :func:`require_same_origin_write` 取的是同一份基准（``APP_BASE_URL`` 优先，
    否则请求的 scheme + ``Host``）—— 这样「同源校验认可的那个来源」与「拼绝对链接时
    用的那个来源」永远一致：两处一旦分叉，就会出现「校验通过、但链接指向别处」。

    用途：拼那种**必须由浏览器打开**的绝对地址（如商店入口）。这类地址不能用容器自己
    看到的地址来填 —— 容器走的是内网服务名，浏览器走的是宿主 IP / 域名。
    """
    settings = getattr(getattr(request, "app", None), "state", None)
    configured = str(getattr(getattr(settings, "settings", None), "app_base_url", "") or "").strip()
    if configured:
        return configured.rstrip("/")
    host = request.headers.get("host", "").strip()
    if not host:
        return ""
    return f"{request.url.scheme}://{host}"


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
        host = request.headers.get("host", "").strip()
        # 浏览器用的 Host 就是本请求的 Host —— 这本身就是同源，与「配没配 APP_BASE_URL」无关。
        same_host = bool(host) and source.netloc.casefold() == host.casefold()
        if not same_host and site == "same-origin" and host:
            # 入口层把 Host 的端口摘掉时（Caddy 的 {host}、nginx 的 $host 都只保留主机名），
            # 上面的 netloc 逐字比对必然对不上：Origin 是浏览器按真实地址写的
            # ``https://192.168.1.20:8803``，而 Host 只剩 ``192.168.1.20``，于是登录 / 备份 /
            # 授权在 8803（内置 HTTPS）这类非默认端口入口上全部 403。
            # ``Sec-Fetch-Site: same-origin`` 是浏览器自己按「协议 + 主机 + 端口」算出来的，
            # 跨站页面无法伪造；再叠加主机名一致，就足以认定同源，且不比原判定宽松到危险的
            # 程度（攻击页面的 Origin 主机名不可能等于它正在请求的 Host）。
            try:
                host_name = (urlsplit(f"//{host}").hostname or "").casefold()
            except ValueError:
                host_name = ""
            same_host = bool(host_name) and source.hostname == host_name
        if configured:
            expected = urlsplit(configured)
            valid = valid and (
                (source.scheme, source.netloc.casefold())
                == (expected.scheme, expected.netloc.casefold())
                # ``APP_BASE_URL`` 是「主用对外地址」，不是「唯一允许的地址」。内网穿透部署
                # 里它写公网域名，但同一套服务仍然会被局域网 IP 直接访问（用户就在现场），
                # 只认配置值会让登录 / 备份 / 授权重试在这些入口下一起被拒（403）。
                # 放行 same_host 不会放宽 CSRF 面：攻击页面发来的 Origin 是攻击者的源，
                # 不可能等于它请求的 Host。
                or same_host
            )
        else:
            valid = (
                valid
                and same_host
                and (source.scheme == request.url.scheme or site == "same-origin")
            )
    except ValueError:
        valid = False
    if not valid:
        raise RequestRejected(_REJECTION)


__all__ = ["browser_origin", "require_same_origin_write"]
