"""请求来源解析与同源校验（真实客户端 IP / HTTPS 判定 / CSRF 同源闸门）。

与 ``backend/app/http_security.py`` 是同一套判定逻辑的两份实现：两个服务是独立部署、
独立配置的（商店跑在 18082，中控后台跑在另一个进程），因此刻意不互相 import，
免得一方的改动把另一方的启动也带崩。改这里时请同步改那边。

- ``resolve_client_ip``：在可信反向代理后面取出真实来源 IP。**不可信时宁可用
  对端地址，也绝不相信客户端自己写的 X-Forwarded-For** —— 后者等于让攻击者
  每次请求换一个 IP，限流形同虚设。
- ``secure_cookies_required``：自动判断这次请求是不是 HTTPS。漏配
  STORE_COOKIE_SECURE 时，商店后台的会话 Cookie（能看订单、能提现）会明文裸奔，
  这个开关不该靠「运维记得改环境变量」。
- ``same_origin_request``：改状态的请求必须同源，补上 SameSite=Lax 之外的一道闸。

对外只暴露纯函数：不读全局状态，代理配置从 StoreSettings 取。
"""
from __future__ import annotations

import ipaddress
import secrets
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlsplit

from fastapi import Request

#: 转发头：出现任一即说明「前面还有代理」。
FORWARDED_HEADERS = ("x-forwarded-for", "x-forwarded-proto", "x-real-ip", "forwarded")


@lru_cache(maxsize=32)
def parse_trusted_proxies(values: tuple[str, ...]) -> tuple:
    """把 ``STORE_TRUSTED_PROXIES`` 解析成网段元组。

    接受单个 IP 与 CIDR，逗号分隔。解析不了的值抛 ValueError：代理信任范围是
    安全配置，写错了必须当场暴露，而不是静默退化成「谁也不信」。
    """
    networks = []
    for raw in values:
        candidate = (raw or "").strip()
        if not candidate:
            continue
        try:
            networks.append(ipaddress.ip_network(candidate, strict=False))
        except ValueError as error:
            raise ValueError(
                f"STORE_TRUSTED_PROXIES 里的 {candidate!r} 不是合法的 IP 或 CIDR 网段。"
            ) from error
    return tuple(networks)


@dataclass(frozen=True)
class ClientAddress:
    """一次请求的来源地址判定结果。"""

    #: 用于限流与审计的地址；取不到时为空串。
    ip: str
    #: 这个地址是否能代表「一个客户端」。False 表示只能拿到一个共享地址
    #: （例如可信代理没传转发头），此时不能拿它当限流桶。
    per_client: bool
    #: 是否由可信代理的转发头解析得出。
    via_proxy: bool


def _normalize_ip(value: str) -> str:
    """把 IP 字面量规范化（去掉 IPv6 方括号、统一压缩形式）；不是 IP 时返回空串。"""
    candidate = (value or "").strip().strip("[]")
    if not candidate:
        return ""
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return ""


def _peer_host(request: Request) -> str:
    """TCP 对端地址（规范化、小写）；拿不到时返回空串。"""
    client = getattr(request, "client", None)
    raw = str(getattr(client, "host", "") or "").strip()
    return _normalize_ip(raw) or raw.lower()


def _is_trusted(host: str, networks) -> bool:
    """该地址是否落在可信代理网段内。"""
    if not host or not networks:
        return False
    address = _normalize_ip(host)
    if not address:
        return False
    parsed = ipaddress.ip_address(address)
    return any(parsed in network for network in networks)


def _forwarded_chain(request: Request) -> list[str]:
    """从转发头里取出地址链（左起第一个是原始客户端，最不可信）。

    只接受能解析成 IP 的片段：``X-Forwarded-For`` 里的 ``unknown``、主机名或
    任意垃圾值一律丢弃，不让它们参与「谁是不可信的下一跳」的判断。
    """
    chain = []
    for piece in request.headers.get("x-forwarded-for", "").split(","):
        address = _normalize_ip(piece)
        if address:
            chain.append(address)
    if not chain:
        single = _normalize_ip(request.headers.get("x-real-ip", ""))
        if single:
            chain.append(single)
    return chain


def _settings(request: Request):
    """取出应用配置；测试里可能用 SimpleNamespace 造请求，因此用 getattr 兜底。"""
    return getattr(getattr(getattr(request, "app", None), "state", None), "settings", None)


def resolve_client_ip(request: Request) -> ClientAddress:
    """解析本次请求的真实来源地址。

    规则（顺序很重要）：
    1. 没配 ``STORE_TRUSTED_PROXIES``，或对端不在其中 —— 对端就是客户端，
       转发头**一律忽略**（否则任何人伪造一个 X-Forwarded-For 就能换 IP 绕过限流）；
    2. 对端是可信代理 —— 从 ``X-Forwarded-For`` 右往左跳过可信代理，
       第一个不可信的地址就是客户端（右侧由我们自己的代理追加，伪造不了）；
    3. 全程都是可信代理但链上没有客户端地址（例如代理没配转发头）——
       只能给出共享的对端地址，并标 ``per_client=False``。
    """
    settings = _settings(request)
    networks = parse_trusted_proxies(tuple(getattr(settings, "trusted_proxies", ()) or ()))
    peer = _peer_host(request)
    if not _is_trusted(peer, networks):
        return ClientAddress(ip=peer, per_client=True, via_proxy=False)
    chain = _forwarded_chain(request)
    for candidate in reversed(chain):
        if not _is_trusted(candidate, networks):
            return ClientAddress(ip=candidate, per_client=True, via_proxy=True)
    if chain:
        return ClientAddress(ip=chain[0], per_client=True, via_proxy=True)
    return ClientAddress(ip=peer, per_client=False, via_proxy=True)


def secure_cookies_required(request: Request) -> bool:
    """本次请求是否必须给 Cookie 加 ``Secure``。

    判定顺序（任一成立即加）：显式配了开关 → ``STORE_BASE_URL`` 是 https →
    可信代理转发了 ``X-Forwarded-Proto: https`` → 本连接自身就是 https。

    这样运维忘了配开关也不会明文下发；反之在纯 http 局域网里不会误加，
    免得浏览器直接丢弃 Cookie 导致「登录后又变回未登录」。

    判据与 :func:`request_is_https` 完全一致（它就是转调）：Cookie 加不加 ``Secure``
    与要不要下发 HSTS 描述的是同一个事实。两处各写一份，迟早会出现「Cookie 加了
    Secure、HSTS 却没发」这类不一致，而它们本该同进同出。
    """
    return request_is_https(request)


def request_is_https(request: Request) -> bool:
    """本次请求是不是走 HTTPS（Cookie 的 ``Secure`` 与 HSTS 共用这一份判据）。

    **只采信可信代理的转发头**：直接读 ``X-Forwarded-Proto`` 会让任何调用方用一个
    请求头把自己伪装成 https，进而骗到 HSTS 或 Secure Cookie。
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

    判定顺序（与 :func:`request_is_https` 同源，只是这里要的是「是哪个」而不是「是不是」）：

    1. 显式配了 ``STORE_BASE_URL`` 就以它的 scheme 为准 —— 反代没转发
       ``X-Forwarded-Proto`` 时，这是唯一知道「对外是 https」的地方；
    2. 否则若对端是可信代理且它转发了 ``X-Forwarded-Proto``，采信它；
    3. 再否则看本连接自身的 scheme。

    刻意**不看** ``cookie_secure`` 开关：那个开关的语义是「一律加 Secure」，
    不表示「本次请求是 https」，拿它当 scheme 会凭空放行明文来源。

    B28：``_origin_allowed`` 原先拿 **Origin 自己带的 scheme** 去拼白名单
    （``f"{parsed.scheme}://{host}"``），等于让攻击者页面自己声明「我是 https 同源」。
    同主机的明文页面因此能驱动 HTTPS 站点的带 Cookie 写请求。scheme 是攻击者能决定的，
    Host 不是，所以必须由部署形态给出。与 ``backend/app/http_security.py`` 的同名函数
    是刻意重复的两份，改一处必须同步改另一处。
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
    # Origin 必须是裸的 scheme://host：``http://evil@本机地址/`` 这类写法会让
    # 朴素的字符串比较误判为同源，因此带 userinfo / 路径 / 查询的一律拒绝。
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
        # 浏览器用 Host 寻址，攻击者的页面改不了它，这是最可靠的同源依据。
        # scheme 则取自部署形态（B28），不能取 Origin 自己声明的那个。
        allowed.add(f"{expected_request_scheme(request)}://{host}")
    settings = _settings(request)
    base_origin = _origin_from_referer(str(getattr(settings, "public_base_url", "") or "").strip())
    if base_origin:
        # 反代部署下 Host 可能是内网地址，显式配置的基址同样算合法来源。
        allowed.add(base_origin.lower())
    return f"{parsed.scheme}://{parsed.netloc}".lower() in allowed


def same_origin_request(request: Request) -> bool:
    """改状态的请求是否来自本商店（CSRF 第二道闸）。

    有 ``Origin`` 就比它；只有 ``Referer`` 就比 Referer 的来源；两个都没有则放行
    —— 浏览器发起的跨站写请求一定带 Origin，缺头说明是脚本 / 本机工具
    （支付回调、命令行工具、监控探活），它们本来也带不上受害者的 Cookie。
    """
    origin = request.headers.get("origin", "").strip()
    if origin:
        return _origin_allowed(request, origin)
    referer = request.headers.get("referer", "").strip()
    if not referer:
        return True
    referer_origin = _origin_from_referer(referer)
    return bool(referer_origin) and _origin_allowed(request, referer_origin)


def _accept_quality(accept: str, target: str) -> float:
    """``Accept`` 头里某一种媒体类型的 q 值；没有提到它则返回 ``-1``。

    只做「提取 q 值」这一件事，不实现完整的 RFC 7231 内容协商：这里只需要在
    ``text/html`` 与 ``application/json`` 之间比大小。
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

    判据刻意收得很紧：必须 ``Accept`` 里**显式**写了 ``text/html`` 且它排在
    ``application/json`` 之前才算。理由是浏览器永远会显式带上 ``text/html``，
    而所有程序化调用方（fetch/axios/curl/监控探活）带的是 ``*/*`` 或
    ``application/json``，于是「显式偏好 HTML」正好等价于「这是个浏览器」。

    对 ``*/*`` 一律给 JSON：用 curl 调 ``/admin`` 的人本身就是开发者，
    500 时看到结构化错误比看到一个没有细节的页面更有用。
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

    不引用 ``/store-static`` 的样式表：500 的常见成因之一就是静态资源或模板读不到，
    那种时候再让页面依赖外部 CSS 只会得到一片白。所以样式内联、字体用系统栈。
    也不放内联脚本 —— 这个页面除了「返回首页」不需要任何行为。
    """
    return """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>服务暂时不可用</title>
<style>
body { margin: 0; padding: 64px 20px; background: #f4f5f7; color: #1f2430;
       font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; }
main { max-width: 480px; margin: 0 auto; padding: 28px 32px; background: #fff;
       border: 1px solid #e3e6ec; border-radius: 12px; }
h1 { margin: 0 0 12px; font-size: 19px; }
p { margin: 0 0 20px; font-size: 14px; line-height: 1.7; color: #4b5361; }
a { display: inline-block; padding: 9px 18px; background: #1f2430; color: #fff;
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


#: 页面模板里内联 ``<script>`` 用来占位 nonce 的记号。渲染时替换成一次性随机值。
#:
#: 用占位符替换而不是正则改 HTML：模板是我们自己的静态文件，一个纯字符串替换
#: 不可能解析错；正则去「找 script 标签」则会在属性顺序、自闭合、注释这些地方出错，
#: 而它出错的方式是**静默漏掉**某个内联脚本 —— 那正好是 CSP 要防的东西。
CSP_NONCE_PLACEHOLDER = "{{NONCE}}"


def new_csp_nonce() -> str:
    """生成一次性 CSP nonce。

    必须**每响应一个新值**：复用同一个值等于把 nonce 变成常量，攻击者只要从任意
    一个响应里读到它，注入的内联脚本就能带着同样的 nonce 通过校验。
    """
    return secrets.token_urlsafe(16)


def csp_header(nonce: str) -> str:
    """构造商店的 Content-Security-Policy。

    逐条都是「挡一类实际存在的注入」：

    * ``script-src 'self' 'nonce-...'`` —— 只放行本站脚本与**带本次 nonce** 的内联
      脚本。这一条是重点：两个模板里各有一段内联 ``<script>``，不用 nonce 就只能
      开 ``'unsafe-inline'``，而 ``'unsafe-inline'`` 等于对 ``<img onerror>`` 这类
      注入完全不设防。注意这里**没有任何** ``'unsafe-inline'``/``'unsafe-eval'``，
      所以注入的 ``<script src="//evil">``、内联 ``<script>``、``onerror=`` 全部被拒。
    * ``style-src 'self' 'unsafe-inline'`` —— 唯一放宽的一处，且是有意的：推荐码
      二维码是 ``jquery.qrcode`` 用 ``<table>`` + 行内 ``style="background:..."``
      画出来的，行内样式**没有** nonce 可用（CSP 不为 style 属性提供 nonce）。
      CSS 注入的危害等级与脚本注入不同：它拿不到执行能力。
    * ``frame-ancestors 'none'`` + ``X-Frame-Options: DENY`` —— 挡点击劫持。
      后者是给不认 CSP 的老浏览器兜底，两者不重复。
    * ``object-src 'none'`` —— 挡 ``<object>`` / ``<embed>`` / ``<applet>`` 这条老的脚本执行路径。
    * ``base-uri 'self'`` —— 挡「注入一个 ``<base>`` 把站内相对路径全部改指到攻击者
      域名」：那种注入不执行任何脚本，却能把表单提交与脚本加载整体劫持。
    * ``form-action 'self'`` —— 挡「注入一个指向外部域名的表单」把邮箱/密码送出去。
    * ``img-src 'self' data:`` —— 商品图与内联 ``data:`` 图标；不放行任意外部图片，
      免得页面里的 ``<img>`` 成为出网探测通道。
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
    """商店所有响应统一加的安全头（审计 S16）。

    放在中间件里统一加，而不是逐个端点写：漏掉一个端点就是漏掉一条 —— 而这个
    商店里有大量 ``innerHTML`` 拼装，真正兜住它们的不是「记得转义」，是这一层。

    HSTS 只在本次请求确实是 HTTPS 时下发（判据见 :func:`request_is_https`）：
    在纯 http 的局域网部署上硬发 ``Strict-Transport-Security``，浏览器会把之后
    所有 http 访问都改写成 https 并直接失败 —— 那是把用户挡在门外，不是加固。
    """
    nonce = str(getattr(request.state, "csp_nonce", "") or "")
    headers = {
        # 不让浏览器猜类型：否则一个被上传的「图片」可能按 HTML 解析并执行脚本。
        "X-Content-Type-Options": "nosniff",
        # 出站请求不带完整路径（避免把订单号/令牌这类出现在 URL 里的东西泄给第三方），
        # 但同站请求仍然带上完整来源，免得破坏站内的 Referer 依赖。
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Content-Security-Policy": csp_header(nonce),
        # 点击劫持兜底：CSP 的 frame-ancestors 已覆盖现代浏览器，这条照顾老浏览器。
        "X-Frame-Options": "DENY",
        # 商店用不到这些能力，全部显式关闭，避免「某个依赖悄悄调用」变成许可。
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
        # 跨源打开时切断 opener 引用：本商店没有任何需要保留 opener 的流程。
        "Cross-Origin-Opener-Policy": "same-origin",
    }
    if request_is_https(request):
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers


def render_template(text: str, request: Request) -> str:
    """把模板里的 CSP nonce 占位符替换成本次请求的 nonce。

    没有占位符的模板原样返回（替换是空操作）—— 所以「给某个页面加一段内联脚本」
    这件事的代价就是写上 ``nonce="{{NONCE}}"``，不写就会被 CSP 拒掉并在控制台
    报错。这个失败模式是**显式且局部**的，比静默放行整类注入好得多。
    """
    nonce = str(getattr(request.state, "csp_nonce", "") or "")
    if not nonce or CSP_NONCE_PLACEHOLDER not in text:
        return text
    return text.replace(CSP_NONCE_PLACEHOLDER, nonce)

