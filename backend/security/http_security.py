"""请求来源解析与同源校验（真实客户端 IP / HTTPS 判定 / CSRF 同源闸门）。

三件事写在一起，是因为它们共用同一份「谁在代理、能不能相信转发头」的判断：

- ``resolve_client_ip``：在可信反向代理后面取出真实来源 IP。**不可信时宁可用对端地址，
  也绝不相信客户端自己写的 X-Forwarded-For** —— 后者等于让攻击者每次请求换一个 IP，
  限流形同虚设。
- ``secure_cookies_enabled``：自动判断这次请求是不是 HTTPS。漏配 APP_COOKIE_SECURE 时，
  管理员会话 Cookie 与十年期的中控令牌会明文裸奔，而这个开关靠「运维记得改环境变量」，
  本来就不该靠人。
- ``same_origin_request``：改状态的请求必须同源。SameSite=Lax + 只收 JSON 是第一道闸
  （挡住浏览器的跨站表单与 preflight 失败），这一道是显式的第二道，免得日后新增一个
  GET 写操作或 text/plain 接口就立刻可被 CSRF。

对外只暴露纯函数：不读全局状态，代理配置从 Settings 取。
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

#: 能代表「本机」的对端地址。用于区分「本机运维」与「外部来访者」。
LOOPBACK_HOSTS = frozenset({'127.0.0.1', '::1', 'localhost'})

#: uvicorn 的 ``--forwarded-allow-ips`` 里，这些写法等同于「任何对端都可以自称客户端」。
#:
#: 要把它和本模块的 ``APP_TRUSTED_PROXIES`` 区分开：两者是**两层独立配置**。
#: uvicorn 那一层决定 ``scope["client"]`` 会不会被 ``X-Forwarded-For`` 改写，而本模块
#: 的全部判断都建立在「``request.client`` 是真实对端、客户端伪造不了」之上。一旦
#: uvicorn 放开成通配，这一层前提就没了：攻击者给每个请求换一个 XFF 值，登录暴力
#: 破解预算、配对码枚举预算与审计里的来源 IP 会同时失效（等于没有预算）；还能把
#: 对端伪装成可信代理网段内的地址，把本模块的整条解析规则也一起接管。
WILDCARD_FORWARDED_ALLOW_IPS = frozenset({'*', '0.0.0.0/0', '::/0'})


def unsafe_forwarded_allow_ips(value: str | None) -> bool:
    """``--forwarded-allow-ips`` 的取值是否等于「谁的转发头都信」。

    支持逗号分隔的列表形态（``127.0.0.1,*`` 这种混写同样算不安全）。
    """
    return any(
        piece.strip() in WILDCARD_FORWARDED_ALLOW_IPS
        for piece in str(value or '').split(',')
    )


def forwarded_allow_ips_warning(value: str | None) -> str:
    """取值会破坏来源地址可信性时给出告警文案；安全取值返回空串。

    调用方有两处，用的是同一份文案：容器启动器（uvicorn 起来之前就喊）与主应用
    lifespan（写进全局日志，让只看管理界面的运维也能看到）。
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

    接受单个 IP（按 /32 或 /128 处理）与 CIDR 写法，逗号分隔。
    解析不了的值抛 ValueError：代理信任范围是安全配置，写错了必须当场暴露，
    而不是静默退化成「谁也不信」（那会让限流悄悄按代理地址统计）。
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
    #: （例如可信代理没传转发头），此时不能拿它当限流桶。
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


def is_direct_local(request: Request) -> bool:
    """是否是「本机直连」：loopback 对端，且请求没带任何转发头。

    两个条件缺一不可：只看对端地址不够 —— 反向代理与主应用同机部署（compose 的默认形态）时
    所有外部请求经代理进来，对端同样是 127.0.0.1；只看有没有转发头也不够 —— 那正是客户端
    自己就能写的字段。

    它回答的是「这次请求是不是本机运维亲手发的」，因此只能用于**放宽**本机操作的门槛
    （首次初始化窗口放行、健康探针回详情），绝不能用来放宽任何认证判定。

    用途见 ``setup_guard.SetupGuard.authorize`` 与 ``main.create_app`` 里的 ``/health/*``：
    前者靠它区分本机运维与远程抢建，后者靠它决定要不要回版本号（B61）。
    """
    if any(request.headers.get(name) for name in FORWARDED_HEADERS):
        return False
    return _peer_host(request) in LOOPBACK_HOSTS


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

    只接受能解析成 IP 的片段：``X-Forwarded-For`` 里出现 ``unknown``、
    主机名或任意垃圾值时一律丢弃，不让它们参与「谁是不可信的下一跳」的判断。
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

    规则（顺序很重要）：
    1. 没配 ``APP_TRUSTED_PROXIES``，或对端不在其中 —— 对端就是客户端，
       转发头**一律忽略**（否则任何人伪造一个 X-Forwarded-For 就能换 IP 绕过限流）；
    2. 对端是可信代理 —— 从 ``X-Forwarded-For`` 右往左跳过可信代理，
       第一个不可信的地址就是客户端（右侧由我们自己的代理追加，伪造不了）；
    3. 全程都是可信代理但链上没有客户端地址（例如代理没配转发头）——
       只能给出共享的对端地址，并标 ``per_client=False``。
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

    判定顺序（任一成立即加）：
    1. 显式配了 APP_COOKIE_SECURE=1（永远优先，可强制开启）；
    2. ``APP_BASE_URL`` 是 https（部署形态本身就说明了）；
    3. 可信代理明确转发了 ``X-Forwarded-Proto: https``；
    4. 本连接自身就是 https。

    这样运维忘了配开关也不会明文下发会话；反之在纯 http 局域网里不会误加，
    免得浏览器直接丢弃 Cookie 导致「登录后又变回未登录」。
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


def expected_request_scheme(request: Request) -> str:
    """本应用**应当**以哪个 scheme 被访问：只按部署形态钉，不看请求头里的 Origin。

    判定顺序与 :func:`secure_cookies_enabled` 一致（配置 → 可信代理转发头 → 本连接）：
    显式配了 ``APP_BASE_URL`` 就以它的 scheme 为准（反代没转发 ``X-Forwarded-Proto`` 时，
    这是唯一知道「对外是 https」的地方）；否则若对端是可信代理且转发了
    ``X-Forwarded-Proto`` 就采信它（浏览器脚本改不了这个头：``no-cors`` 下加它会触发
    preflight，普通表单更加不了头）；再否则看本连接自身的 scheme。

    B28：``_origin_allowed`` 原先拿 **Origin 自己带的 scheme** 去拼白名单
    （``f'{parsed.scheme}://{host}'``），等于让攻击者页面自己声明「我是 https 同源」，同主机的
    明文页面（例如劫持了 80 端口的中间人）因此能驱动 HTTPS 站点的带 Cookie 写请求。scheme 是
    攻击者能决定的、Host 不是，所以 scheme 必须由部署形态给出，并在这一处集中判定一次。
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
    return (request.url.scheme or 'http').lower()


def _origin_allowed(request: Request, origin: str) -> bool:
    """给定一个 ``scheme://host`` 形态的来源，判断它是否属于本应用。"""
    parsed = urlsplit(origin)
    # Origin 必须是裸的 scheme://host：``http://evil@本机地址/`` 这类写法会让
    # 朴素的字符串比较误判为同源，因此带 userinfo / 路径 / 查询的一律拒绝。
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
        # scheme 则取自部署形态（B28），不能取 Origin 自己声明的那个。
        allowed.add(f'{expected_request_scheme(request)}://{host}')
    settings = _settings(request)
    base_origin = _origin_from_referer(str(getattr(settings, 'app_base_url', '') or '').strip())
    if base_origin:
        # 反代部署下 Host 可能是内网地址，显式配置的基址同样算合法来源。
        allowed.add(base_origin.lower())
    return f'{parsed.scheme}://{parsed.netloc}'.lower() in allowed


def same_origin_request(request: Request) -> bool:
    """改状态的请求是否来自本应用（CSRF 第二道闸）。

    判定依据是浏览器无法伪造的这两个头：
    - 有 ``Origin``：用 :func:`_origin_allowed` 比较；
    - 只有 ``Referer``：取它的 scheme://host 做同样的比较（老浏览器表单提交）；
    - 两个都没有：放行。浏览器发起的跨站写请求一定带 Origin，缺头说明是
      脚本 / 本机工具（curl、健康检查、内部调用），它们本来也带不上受害者的 Cookie。
    """
    origin = request.headers.get('origin', '').strip()
    if origin:
        return _origin_allowed(request, origin)
    referer = request.headers.get('referer', '').strip()
    if not referer:
        return True
    referer_origin = _origin_from_referer(referer)
    return bool(referer_origin) and _origin_allowed(request, referer_origin)


def forwarded_headers_present(request: Request) -> bool:
    """请求里是否带了转发头（用于提示「你前面有代理，但没配可信代理」）。"""
    return any(request.headers.get(name) for name in FORWARDED_HEADERS)
