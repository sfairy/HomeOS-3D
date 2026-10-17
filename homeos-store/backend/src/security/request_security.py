"""请求来源解析与同源校验（真实客户端 IP / HTTPS 判定 / CSRF 同源闸门）。
"""
from __future__ import annotations

import ipaddress
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
    "actual_request_scheme",
    "browser_trustworthy_origin",
    "cookie_secure_mode",
    "error_page_html",
    "expected_request_scheme",
    "forwarded_headers_present",
    "hsts_eligible_host",
    "new_csp_nonce",
    "parse_trusted_proxies",
    "request_is_https",
    "request_origin",
    "resolve_client_ip",
    "same_origin_request",
    "secure_cookies_required",
]

#: 会被浏览器当作「潜在可信来源」的主机名。回环 IP（``127.0.0.0/8`` / ``::1``）按地址判，
#: 见 :func:`browser_trustworthy_origin`。
TRUSTWORTHY_HOST_NAMES = frozenset({"localhost"})


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
    """本次请求是否必须给 Cookie 加 ``Secure`` —— 判据是**这一次请求**走的哪一层。

    双入口部署（公网穿透 + 内网直连）里，浏览器会用两条路同时访问同一个商店：

    ========================================  =========================  ============
    入口                                      本次请求的 scheme（实测）   Cookie Secure
    ========================================  =========================  ============
    ``https://<域名>``（隧道 / 反代）          https                      **带**
    ``http://<局域网IP>:8802``（现场直连）     http                       **不带**
    ========================================  =========================  ============

    （商店没有内置 HTTPS 端口，所以不存在「自签也算 https 入口」这条；公网 https 一律由
    隧道 / 反代在 80·443 终止。）

    不能按「部署形态是 https」（``STORE_COOKIE_SECURE=true`` / ``STORE_BASE_URL`` 是
    https）一刀切：那样明文直连也会拿到带 ``Secure`` 的会话 Cookie，浏览器直接丢弃，表现
    为「提示登录成功，刷新又变未登录」；反过来恒不带，公网那条的会话就能被明文重放。
    按请求判定是两条入口并存时唯一自洽的口径。

    前提是入口透传 ``X-Forwarded-Proto``（反代、隧道都会带）。漏传只是让该入口退化成
    「不带 Secure」，登录仍可用 —— 失败方向是「少一层保护」，不是「登不上」。

    ``STORE_COOKIE_SECURE`` 仍可覆盖这个判据（运营明确知道自己在做什么时）：

    - ``auto``（默认）—— 就是上面的按请求判定，双入口部署用它；
    - ``true``  —— 恒带 Secure。只适用于「只有 HTTPS 入口」的部署；内网明文直连会登录不上；
    - ``false`` —— 恒不带。只适用于「只有明文入口」的部署（公网会话可被明文重放）。
    """
    mode = cookie_secure_mode(request)
    if mode == "true":
        return True
    if mode == "false":
        return False
    return request_is_https(request)


def cookie_secure_mode(request: Request) -> str:
    """``STORE_COOKIE_SECURE`` 的三态值（``auto`` / ``true`` / ``false``，未知值按 auto）。"""
    settings = _settings(request)
    mode = str(getattr(settings, "cookie_secure_mode", "") or "").strip().lower()
    if mode in {"true", "false"}:
        return mode
    return "auto"


def request_is_https(request: Request) -> bool:
    """本次请求是不是**真的**走 HTTPS（``STORE_COOKIE_SECURE=auto`` 时 Cookie 的判据）。

    只看请求实际经过的那一层：可信代理声明的 ``X-Forwarded-Proto`` 优先，否则看请求自身。
    不再参考 ``STORE_COOKIE_SECURE`` / ``STORE_BASE_URL``：那两个描述的是「本商店对外的
    身份」，不是「这一条连接用的协议」。混用会让「https 域名 + http 局域网 IP」并存时，
    明文那条也被当成 https（见 :func:`secure_cookies_required` 的表格）。
    """
    return actual_request_scheme(request) == "https"


def _origin_from_referer(referer: str) -> str:
    """从 Referer 里取出 scheme://host；非法或为空时返回空串。"""
    parsed = urlsplit(referer)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def request_origin(request: Request) -> str:
    """本商店**对调用方而言**的访问来源 ``scheme://host``；判不出来时返回空串。

    与 :func:`expected_request_scheme` 的分工：那个只回答 scheme，且以「部署形态」为准；
    这个回答完整来源，取值顺序是

    1. 显式配置的 ``STORE_BASE_URL``（权威：公网接入时就是它，不看请求头）；
    2. 否则回显请求里的 scheme + ``Host`` —— 也就是「调用方是怎么连上我的」。

    第 2 条是给**机器对机器**的场景用的：客户机上的主应用只知道自己容器能连到的商店地址
    （``APP_LICENSE_SERVER_URL``），而登录页的商店链接要给浏览器用；同机部署时这两者必然
    不同（容器走服务名、浏览器走宿主 IP），分机部署时则通常一致 —— 所以让商店把
    「你是怎么连上我的」回显回去，客户机就不必手填第二处（见 ``/store/v1/base-url``）。

    注意它回显的是**调用方给的 Host**，不要直接用于安全判据（同源校验有自己的
    :func:`_origin_allowed`）。
    """
    settings = _settings(request)
    explicit = str(getattr(settings, "base_url", "") or "").strip().rstrip("/")
    if explicit:
        return explicit
    host = request.headers.get("host", "").strip()
    if not host:
        return ""
    return f"{expected_request_scheme(request)}://{host}"


def actual_request_scheme(request: Request) -> str:
    """**客户端实际用的** scheme：可信代理报的 ``X-Forwarded-Proto`` 优先，否则看请求自身。

    与 :func:`expected_request_scheme` 的分工：那个是「本商店应当以哪个 scheme 对外」，可能
    来自 ``STORE_BASE_URL`` 的声明；这个是「这一次请求真的从哪种 scheme 来的」。公网接入后
    两者都是 ``https``，但本机直接开 ``http://127.0.0.1:8802`` 调试时只有它会是 ``http``。
    """
    address = resolve_client_ip(request)
    if address.via_proxy:
        forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
        if forwarded_proto in {"http", "https"}:
            return forwarded_proto
    return (request.url.scheme or "http").lower()


def browser_trustworthy_origin(request: Request) -> bool:
    """浏览器是否会把本次响应当作「潜在可信来源」（potentially trustworthy origin）。

    用来决定**哪些只在可信来源上生效的安全头值得发** —— 目前只有 ``Cross-Origin-Opener-Policy``：

    - 判为可信（HTTPS，或 ``localhost`` / 回环地址 —— 这两个在明文下也算可信）：正常发送；
    - 判为不可信（明文访问局域网 IP / 域名）：浏览器**会直接忽略**该头，并在控制台留一条
      ``The Cross-Origin-Opener-Policy header has been ignored, because the URL's origin was
      untrustworthy`` —— 发出去换不来任何防护，只会让看控制台的人以为部署配错了。

    为什么不能用 :func:`request_is_https` 当判据：那个回答的是「本商店应当按 HTTPS 对待」，
    在 ``STORE_COOKIE_SECURE=true`` 或 ``STORE_BASE_URL`` 是 ``https://`` 时**恒为真**
    （公网接入的本机调试正是这种形态），拿它判断等于没判断。这里要的是「浏览器真正用的是哪一层」，
    所以取 :func:`actual_request_scheme`（可信代理声明的 scheme 优先，否则看请求自身）。

    已知边界：反代终止 TLS 却不同时透传 ``X-Forwarded-Proto`` 时，这里会判成明文而少发一个 COOP。
    这种拓扑下浏览器大概率同样没把它当可信来源（同一份信息缺失），本项目也不依赖跨源隔离
    （没有 ``SharedArrayBuffer``），故代价可接受；何况「透传 X-Forwarded-Proto」本就是公网接入的
    硬要求（同源判定、Cookie 的 ``Secure`` 都读它，两份示例入口配置里都写明了必须透传）。
    """
    if actual_request_scheme(request) == "https":
        return True
    host = (request.url.hostname or "").strip().lower()
    if not host:
        return False
    if host in TRUSTWORTHY_HOST_NAMES:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def expected_request_scheme(request: Request) -> str:
    """本商店**应当**以哪个 scheme 被访问。

    只有显式配了 ``STORE_BASE_URL`` 时才按它钉死 —— 那是运维的明确声明，公网接入就该是
    ``https://``。没配时不能拿 ``public_base_url`` 顶替：它只是「host/port 推导出来的兜底」
    （默认就是 ``http://127.0.0.1:8802``），把它当成声明会让整个公网 HTTPS 部署被当成
    http —— 后果不只是链接少了 s，而是同源判定把浏览器的 ``https://<域名>`` 判为异源，
    于是商店的注册 / 登录 / 下单（所有带 Cookie 的写操作）一律 403。所以这里退回
    「可信代理告诉我们的 scheme」再退「请求自身的 scheme」。
    """
    settings = _settings(request)
    declared = str(getattr(settings, "base_url", "") or "").strip().lower()
    for scheme in ("https", "http"):
        if declared.startswith(f"{scheme}://"):
            return scheme
    return actual_request_scheme(request)


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
        # 两种 scheme 都收：声明口径（可能是 https）+ 客户端实际用的那个。
        # 为什么收 actual 这一种：配了 STORE_BASE_URL=https://… 之后，管理员从本机
        # http://127.0.0.1:8802 打开商店后台做任何写操作都会被判异源 —— 那不是攻击，
        # 只是同源判定把「客户端真的在用 http」这一事实丢了。放宽的是**同一个 host**，
        # 跨站请求（Origin 是别的站点）依旧进不来，所以这不削弱 CSRF 防护。
        allowed.add(f"{expected_request_scheme(request)}://{host}")
        allowed.add(f"{actual_request_scheme(request)}://{host}")
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


#: 局域网 / 本机专用后缀：这些名字下同一台机器对外只提供明文 8802（商店没有 HTTPS 端口），
#: 给它们发 HSTS 会把「http://name:8802」也一并升级到 https，而那个端口没有 TLS。
LAN_HOST_SUFFIXES = (".local", ".localhost", ".localdomain", ".lan", ".home", ".internal")


def hsts_eligible_host(request: Request) -> bool:
    """是否值得给这个主机发 ``Strict-Transport-Security``。

    只给**公网 FQDN** 发。内网 IP 字面量与 ``*.local`` 这类名字要排除，理由是双入口：

    - 同一台机器上明文端口（``:8802``）与 https 域名（隧道 / 反代）并存；
    - 浏览器一旦收下 HSTS，会把该主机的**所有端口**升级到 https，``:8802`` 立刻打不开
      （表现为「昨天还能用的内网 http 入口今天直接连不上」，且清除很麻烦）。

    IP 字面量按规范本来就会被浏览器忽略，这里一并排除，省得响应头与实际行为不一致。
    """
    host = (request.url.hostname or "").strip().lower()
    if not host or "." not in host:
        # 单标签主机名（localhost / 机器名）都属于「内网」，不发。
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not host.endswith(LAN_HOST_SUFFIXES)


def security_headers(request: Request) -> dict[str, str]:
    """商店所有响应统一加的安全头。

    除 COOP 外都与来源可信与否无关（``nosniff`` / CSP / ``frame-ancestors`` / 权限策略等在明文
    下同样生效），所以只有 COOP 需要按 :func:`browser_trustworthy_origin` 判断：它只在可信来源
    上被浏览器采纳，明文访问局域网地址时发了也只会换来一条「origin was untrustworthy」提示。
    """
    nonce = str(getattr(request.state, "csp_nonce", "") or "")
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Content-Security-Policy": csp_header(nonce),
        "X-Frame-Options": "DENY",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    }
    if browser_trustworthy_origin(request):
        headers["Cross-Origin-Opener-Policy"] = "same-origin"
    # HSTS 只在「会话 Cookie 也带 Secure」时发，否则等于承诺了一个自己没做到的口径。
    if secure_cookies_required(request) and hsts_eligible_host(request):
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers


def render_template(text: str, request: Request) -> str:
    """把模板里的 CSP nonce 占位符替换成本次请求的 nonce。
    """
    nonce = str(getattr(request.state, "csp_nonce", "") or "")
    if not nonce or CSP_NONCE_PLACEHOLDER not in text:
        return text
    return text.replace(CSP_NONCE_PLACEHOLDER, nonce)

