"""请求来源解析与同源校验（真实客户端 IP / HTTPS 判定 / CSRF 同源闸门）。
"""
from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlsplit

from starlette.requests import Request

from ..config import Settings

#: 转发头：出现任一即说明「前面还有代理」。用于提示运维去配 APP_TRUSTED_PROXIES。
FORWARDED_HEADERS = ('x-forwarded-for', 'x-forwarded-proto', 'x-real-ip', 'forwarded')

#: 能代表「本机」的地址：既用作可信的**对端**地址，也用作可信的 ``Host`` 主机名。
LOOPBACK_HOSTS = frozenset({'127.0.0.1', '::1', 'localhost'})

WILDCARD_FORWARDED_ALLOW_IPS = frozenset({'*', '0.0.0.0/0', '::/0'})


def unsafe_forwarded_allow_ips(value: str | None) -> bool:
    """``--forwarded-allow-ips`` 的取值是否等于「谁的转发头都信」。
    """
    return any(
        piece.strip() in WILDCARD_FORWARDED_ALLOW_IPS
        for piece in str(value or '').split(',')
    )


def forwarded_allow_ips_warning(value: str | None) -> str:
    """取值会破坏来源地址可信性时给出告警文案；安全取值返回空串。
    """
    if not unsafe_forwarded_allow_ips(value):
        return ''
    return (
        f'UVICORN_FORWARDED_ALLOW_IPS={str(value).strip()!r} 等于信任任何对端的转发头：'
        'uvicorn 会据此改写对端地址，于是登录限流、配对码枚举预算与审计里的来源 IP '
        '都能被逐个请求伪造，等于没有预算。默认只该信任回环（127.0.0.1,::1）；'
        '前面确实有反向代理时，请填该代理自身的地址或它所在的网段。'
    )


@lru_cache(maxsize=32)
def parse_trusted_proxies(values: tuple[str, ...]) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    """把 ``APP_TRUSTED_PROXIES`` 解析成网段元组。
    """
    networks = []
    for raw in values:
        candidate = (raw or '').strip()
        if not candidate:
            continue
        try:
            networks.append(ipaddress.ip_network(candidate, strict=False))
        except ValueError as error:
            raise ValueError(
                f'APP_TRUSTED_PROXIES 里的 {candidate!r} 不是合法的 IP 或 CIDR 网段。'
            ) from error
    return tuple(networks)


@dataclass(frozen=True)
class ClientAddress:
    """一次请求的来源地址判定结果。"""

    #: 用于限流与审计的地址；取不到时为空串。
    ip: str
    #: 这个地址是否能代表「一个客户端」。False 表示只能拿到一个共享地址
    per_client: bool
    #: 是否由可信代理的转发头解析得出。
    via_proxy: bool


def _peer_host(request: Request) -> str:
    """TCP 对端地址（规范化、小写）；拿不到时返回空串。"""
    client = getattr(request, 'client', None)
    raw = str(getattr(client, 'host', '') or '').strip()
    return _normalize_ip(raw) or raw.lower()


def _normalize_ip(value: str) -> str:
    """把 IP 字面量规范化（去掉 IPv6 的方括号、统一压缩形式）；不是 IP 时返回空串。"""
    candidate = (value or '').strip().strip('[]')
    if not candidate:
        return ''
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return ''


def _host_header_name(request: Request) -> str:
    """``Host`` 头里的主机名：去端口、去 IPv6 方括号、转小写；读不到时返回空串。
    """
    raw = (request.headers.get('host') or '').strip().lower()
    if not raw:
        return ''
    if raw.startswith('['):
        # ``[::1]:8000`` / ``[::1]``：方括号之间就是主机名。
        return raw[1:].split(']', 1)[0].strip()
    if raw.count(':') == 1:
        # ``host:port``：冒号左边是主机名。
        return raw.split(':', 1)[0].strip()
    # 没有端口（``localhost``），或裸 IPv6 字面量（不合法但从宽原样处理）。
    return raw


def is_direct_local(request: Request) -> bool:
    """是否是「本机直连」：loopback 对端 + loopback ``Host`` + 没有任何转发头。
    """
    if any(request.headers.get(name) for name in FORWARDED_HEADERS):
        return False
    if _peer_host(request) not in LOOPBACK_HOSTS:
        return False
    return _host_header_name(request) in LOOPBACK_HOSTS


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
    """
    chain = []
    for piece in request.headers.get('x-forwarded-for', '').split(','):
        address = _normalize_ip(piece)
        if address:
            chain.append(address)
    if not chain:
        single = _normalize_ip(request.headers.get('x-real-ip', ''))
        if single:
            chain.append(single)
    return chain


def resolve_client_ip(request: Request) -> ClientAddress:
    """解析本次请求的真实来源地址。
    """
    settings = _settings(request)
    networks = parse_trusted_proxies(tuple(getattr(settings, 'trusted_proxies', ()) or ()))
    peer = _peer_host(request)
    if not _is_trusted(peer, networks):
        return ClientAddress(ip=peer, per_client=True, via_proxy=False)
    chain = _forwarded_chain(request)
    for candidate in reversed(chain):
        if not _is_trusted(candidate, networks):
            return ClientAddress(ip=candidate, per_client=True, via_proxy=True)
    if chain:
        # 整条链都是可信代理（少见但合法）：最左边那个就是客户端。
        return ClientAddress(ip=chain[0], per_client=True, via_proxy=True)
    return ClientAddress(ip=peer, per_client=False, via_proxy=True)


def _settings(request: Request) -> Settings:
    """取出应用配置；测试里可能用 SimpleNamespace 造请求，因此用 getattr 兜底。"""
    state = getattr(request, 'app', None)
    return getattr(getattr(state, 'state', None), 'settings', None)


def secure_cookies_enabled(request: Request) -> bool:
    """本次请求是否必须给 Cookie 加 Secure。
    """
    settings = _settings(request)
    if settings is not None and getattr(settings, 'cookie_secure', False):
        return True
    base_url = str(getattr(settings, 'app_base_url', '') or '').strip().lower()
    if base_url.startswith('https://'):
        return True
    address = resolve_client_ip(request)
    if address.via_proxy:
        forwarded_proto = request.headers.get('x-forwarded-proto', '').split(',')[0].strip().lower()
        if forwarded_proto == 'https':
            return True
    return request.url.scheme == 'https'


def _origin_from_referer(referer: str) -> str:
    """从 Referer 里取出 scheme://host；非法或为空时返回空串。"""
    parsed = urlsplit(referer)
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        return ''
    return f'{parsed.scheme}://{parsed.netloc}'


def configured_base_origin(settings) -> str:
    """``APP_BASE_URL`` 归一化出的 ``scheme://host``；未配置或写错时返回空串。
    """
    return _origin_from_referer(str(getattr(settings, 'app_base_url', '') or '').strip())


def expected_request_scheme(request: Request) -> str:
    """本应用**应当**以哪个 scheme 被访问：只按部署形态钉，不看请求头里的 Origin。
    """
    settings = _settings(request)
    base_url = str(getattr(settings, 'app_base_url', '') or '').strip().lower()
    for scheme in ('https', 'http'):
        if base_url.startswith(f'{scheme}://'):
            return scheme
    address = resolve_client_ip(request)
    if address.via_proxy:
        forwarded_proto = request.headers.get('x-forwarded-proto', '').split(',')[0].strip().lower()
        if forwarded_proto in {'http', 'https'}:
            return forwarded_proto
    return _http_scheme((request.url.scheme or 'http').lower())


def _http_scheme(scheme: str) -> str:
    """把连接层的 scheme 归一到 ``http`` / ``https``。
    """
    return {'ws': 'http', 'wss': 'https'}.get(scheme, scheme)


def origin_allowed(request: Request, origin: str) -> bool:
    """给定一个 ``scheme://host`` 形态的来源，判断它是否属于本应用。
    """
    parsed = urlsplit(origin)
    # Origin 必须是裸的 scheme://host：``http://evil@本机地址/`` 这类写法会让
    if (
        parsed.scheme not in {'http', 'https'}
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {'', '/'}
        or parsed.query
        or parsed.fragment
    ):
        return False
    allowed = set()
    host = request.headers.get('host', '').strip().lower()
    if host:
        # 浏览器用 Host 寻址，攻击者的页面改不了它，这是最可靠的同源依据。
        allowed.add(f'{expected_request_scheme(request)}://{host}')
    base_origin = configured_base_origin(_settings(request))
    if base_origin:
        # 反代部署下 Host 可能是内网地址，显式配置的基址同样算合法来源。
        allowed.add(base_origin.lower())
    return f'{parsed.scheme}://{parsed.netloc}'.lower() in allowed


def same_origin_request(request: Request) -> bool:
    """改状态的请求是否来自本应用（CSRF 第二道闸）。
    """
    origin = request.headers.get('origin', '').strip()
    if origin:
        return origin_allowed(request, origin)
    referer = request.headers.get('referer', '').strip()
    if not referer:
        return True
    referer_origin = _origin_from_referer(referer)
    return bool(referer_origin) and origin_allowed(request, referer_origin)


def forwarded_headers_present(request: Request) -> bool:
    """请求里是否带了转发头（用于提示「你前面有代理，但没配可信代理」）。"""
    return any(request.headers.get(name) for name in FORWARDED_HEADERS)
