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
    """本次请求是否必须给 Cookie 加 Secure。

    判定顺序（任一成立即加）：显式配了开关 → ``STORE_BASE_URL`` 是 https →
    可信代理转发了 ``X-Forwarded-Proto: https`` → 本连接自身就是 https。

    这样运维忘了配开关也不会明文下发；反之在纯 http 局域网里不会误加，
    免得浏览器直接丢弃 Cookie 导致「登录后又变回未登录」。
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
        allowed.add(f"{parsed.scheme}://{host}")
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
    （支付回调、自检脚本、监控探活），它们本来也带不上受害者的 Cookie。
    """
    origin = request.headers.get("origin", "").strip()
    if origin:
        return _origin_allowed(request, origin)
    referer = request.headers.get("referer", "").strip()
    if not referer:
        return True
    referer_origin = _origin_from_referer(referer)
    return bool(referer_origin) and _origin_allowed(request, referer_origin)


def forwarded_headers_present(request: Request) -> bool:
    """请求里是否带了转发头（用于提示「你前面有代理，但没配可信代理」）。"""
    return any(request.headers.get(name) for name in FORWARDED_HEADERS)
