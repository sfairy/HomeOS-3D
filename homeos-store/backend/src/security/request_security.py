"""请求来源解析与同源校验（真实客户端 IP / HTTPS 判定 / CSRF 同源闸门）。
"""
from __future__ import annotations

import secrets
from urllib.parse import urlsplit

from fastapi import Request

from homeos_shared.client_ip import (
    ClientAddress,
    parse_trusted_proxies,
    resolve_client_address,
)
from homeos_shared.client_ip import (
    normalize_ip as _normalize_ip,
)

FORWARDED_HEADERS = ("x-forwarded-for", "x-forwarded-proto", "x-real-ip", "forwarded")

__all__ = [
    "FORWARDED_HEADERS",
    "ClientAddress",
    "error_page_html",
    "expected_request_scheme",
    "forwarded_headers_present",
    "new_csp_nonce",
    "parse_trusted_proxies",
    "request_is_https",
    "resolve_client_ip",
    "same_origin_request",
    "secure_cookies_required",
]


def _peer_host(request: Request) -> str:
    """TCP 对端地址（规范化、小写）；拿不到时返回空串。"""
    client = getattr(request, "client", None)
    raw = str(getattr(client, "host", "") or "").strip()
    return _normalize_ip(raw) or raw.lower()


def _settings(request: Request):
    """取出应用配置；测试里可能用 SimpleNamespace 造请求，因此用 getattr 兜底。"""
    return getattr(getattr(getattr(request, "app", None), "state", None), "settings", None)


def resolve_client_ip(request: Request) -> ClientAddress:
    """解析本次请求的真实来源地址。

    判定逻辑（「先验 TCP 对端是否可信、再回退转发链」）的真源在
    ``homeos_shared.client_ip.resolve_client_address``，与主应用共用同一份实现 ——
    这是安全判据，两份副本迟早会分叉，且分叉方向一定是某一侧被放松。
    本函数只做 ``Request`` → 纯函数入参的映射。
    """
    settings = _settings(request)
    return resolve_client_address(
        peer=_peer_host(request),
        trusted_proxies=tuple(getattr(settings, "trusted_proxies", ()) or ()),
        forwarded_for=request.headers.get("x-forwarded-for", ""),
        real_ip=request.headers.get("x-real-ip", ""),
    )


def secure_cookies_required(request: Request) -> bool:
    """本次请求是否必须给 Cookie 加 ``Secure``。
    """
    return request_is_https(request)


def request_is_https(request: Request) -> bool:
    """本次请求是不是走 HTTPS（Cookie 的 ``Secure`` 与 HSTS 共用这一份判据）。
    """
    settings = _settings(request)
    if settings is not None and getattr(settings, "cookie_secure", False):
        return True
    base_url = str(getattr(settings, "public_base_url", "") or "").strip().lower()
    if base_url.startswith("https://"):
        return True
    address = resolve_client_ip(request)
    if address.via_proxy:
        forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
        if forwarded_proto == "https":
            return True
    return request.url.scheme == "https"


def _origin_from_referer(referer: str) -> str:
    """从 Referer 里取出 scheme://host；非法或为空时返回空串。"""
    parsed = urlsplit(referer)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def expected_request_scheme(request: Request) -> str:
    """本商店**应当**以哪个 scheme 被访问：只按部署形态钉，不看请求头里的 Origin。
    """
    settings = _settings(request)
    base_url = str(getattr(settings, "public_base_url", "") or "").strip().lower()
    for scheme in ("https", "http"):
        if base_url.startswith(f"{scheme}://"):
            return scheme
    address = resolve_client_ip(request)
    if address.via_proxy:
        forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
        if forwarded_proto in {"http", "https"}:
            return forwarded_proto
    return (request.url.scheme or "http").lower()


def _origin_allowed(request: Request, origin: str) -> bool:
    """给定一个 ``scheme://host`` 形态的来源，判断它是否属于本商店。"""
    parsed = urlsplit(origin)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        return False
    allowed = set()
    host = request.headers.get("host", "").strip().lower()
    if host:
        allowed.add(f"{expected_request_scheme(request)}://{host}")
    settings = _settings(request)
    base_origin = _origin_from_referer(str(getattr(settings, "public_base_url", "") or "").strip())
    if base_origin:
        allowed.add(base_origin.lower())
    return f"{parsed.scheme}://{parsed.netloc}".lower() in allowed


def same_origin_request(request: Request) -> bool:
    """改状态的请求是否来自本商店（CSRF 第二道闸）。

    Cookie 会话写操作必须带 Origin 或 Referer；无 Cookie 的服务端回调走豁免路径。
    """
    origin = request.headers.get("origin", "").strip()
    if origin:
        return _origin_allowed(request, origin)
    referer = request.headers.get("referer", "").strip()
    if referer:
        referer_origin = _origin_from_referer(referer)
        return bool(referer_origin) and _origin_allowed(request, referer_origin)
    return not bool(request.cookies)


def _accept_quality(accept: str, target: str) -> float:
    """``Accept`` 头里某一种媒体类型的 q 值；没有提到它则返回 ``-1``。
    """
    best = -1.0
    for item in accept.split(","):
        media, _, params = item.partition(";")
        if media.strip().lower() != target:
            continue
        quality = 1.0
        for param in params.split(";"):
            key, _, value = param.partition("=")
            if key.strip().lower() != "q":
                continue
            try:
                quality = float(value.strip())
            except ValueError:
                quality = 1.0
        best = max(best, quality)
    return best


def prefers_html(request: Request) -> bool:
    """调用方是否**明确**更想要 HTML（用于 500 该回页面还是回 JSON）。
    """
    accept = request.headers.get("accept", "").strip()
    if not accept:
        return False
    html_quality = _accept_quality(accept, "text/html")
    if html_quality < 0:
        return False
    return html_quality > _accept_quality(accept, "application/json")


def error_page_html() -> str:
    """500 页面。**不含**任何异常细节与外部资源。
    """
    return """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>服务暂时不可用</title>
<style>
/* 独立错误页调色板（**刻意不引 --hos-* / --hb-***）。
   与全站暗色主题相反，这一页是浅色的，理由有三：
     1. 它必须能在「任何站点 CSS 都读不到」的前提下渲染 —— 500 的常见成因之一就是
        静态资源读不出来，所以样式内联、不引用任何外部文件、字体走系统栈；
     2. 它不依赖操作系统的 prefers-color-scheme 判定（那条路要多写一套分支，
        而这一页越简单越可靠）；
     3. 浅底在整站暗色的语境里本身就是「这不是正常界面」的信号，
        不会和正常的暗色页面混在一起、被误认为「页面只是没加载完」。
   取值按角色命名，改的时候一眼看得出改的是哪一块 —— 原先这里是五个散落的
   十六进制（#f4f5f7 / #1f2430 / #fff / #e3e6ec / #4b5361），看不出各是什么角色。
   对比度：正文 #4b5361 压 #fff 8.05:1、标题 #1f2430 压 #fff 14.6:1、
   按钮 #fff 压 #1f2430 14.6:1，均达标。 */
:root {
  --err-page-bg: #f4f5f7;    /* 页面底 */
  --err-card-bg: #fff;       /* 卡片底 */
  --err-card-line: #e3e6ec;  /* 卡片描边 */
  --err-ink: #1f2430;        /* 标题 / 按钮实底 */
  --err-ink-soft: #4b5361;   /* 正文 */
  --err-on-ink: #fff;        /* 按钮上的文字 */
}
body { margin: 0; padding: 64px 20px; background: var(--err-page-bg); color: var(--err-ink);
       font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; }
main { max-width: 480px; margin: 0 auto; padding: 28px 32px; background: var(--err-card-bg);
       border: 1px solid var(--err-card-line); border-radius: 12px; }
h1 { margin: 0 0 12px; font-size: 19px; }
p { margin: 0 0 20px; font-size: 14px; line-height: 1.7; color: var(--err-ink-soft); }
a { display: inline-block; padding: 9px 18px; background: var(--err-ink); color: var(--err-on-ink);
    border-radius: 8px; font-size: 14px; text-decoration: none; }
</style>
</head>
<body>
<main>
  <h1>服务暂时不可用</h1>
  <p>服务器处理这个请求时出错了。请稍后重试；如果一直这样，请把发生时间和操作步骤发给客服。</p>
  <a href="/">返回首页</a>
</main>
</body>
</html>
"""


def forwarded_headers_present(request: Request) -> bool:
    """请求里是否带了转发头（用于提示「你前面有代理，但没配可信代理」）。"""
    return any(request.headers.get(name) for name in FORWARDED_HEADERS)


CSP_NONCE_PLACEHOLDER = "{{NONCE}}"


def new_csp_nonce() -> str:
    """生成一次性 CSP nonce。
    """
    return secrets.token_urlsafe(16)


def csp_header(nonce: str) -> str:
    """构造商店的 Content-Security-Policy。
    """
    script_src = f"'self' 'nonce-{nonce}'" if nonce else "'self'"
    return "; ".join(
        (
            "default-src 'self'",
            f"script-src {script_src}",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        )
    )


def security_headers(request: Request) -> dict[str, str]:
    """商店所有响应统一加的安全头。
    """
    nonce = str(getattr(request.state, "csp_nonce", "") or "")
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Content-Security-Policy": csp_header(nonce),
        "X-Frame-Options": "DENY",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
        "Cross-Origin-Opener-Policy": "same-origin",
    }
    if request_is_https(request):
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers


def render_template(text: str, request: Request) -> str:
    """把模板里的 CSP nonce 占位符替换成本次请求的 nonce。
    """
    nonce = str(getattr(request.state, "csp_nonce", "") or "")
    if not nonce or CSP_NONCE_PLACEHOLDER not in text:
        return text
    return text.replace(CSP_NONCE_PLACEHOLDER, nonce)

