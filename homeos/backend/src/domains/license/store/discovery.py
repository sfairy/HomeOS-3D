"""向商店问「你的对外地址是什么」，并把它缓存 / 退避。

两种部署形态都要用同一个「登录页商店入口地址」，但它们**该取哪个值**不同：

- **同机部署**（``docker-compose.yml``：商店与主应用同一台机器）：主应用容器走 compose
  服务名 ``http://homeos-store:8802`` 连商店，而登录页的链接要给浏览器用 —— 服务名浏览器
  解析不了，得换成宿主 IP / 域名。
- **分机部署**（``docker-compose.app.yml``：客户机只有主应用，商店在厂商那台）：主应用
  容器连的就是商店的对外地址（``APP_LICENSE_SERVER_URL``），浏览器也用同一个 —— 不用改。

两者只差「问回来的主机名浏览器能不能解析」，而这个地址**不推导**（容器无从知道 NAT 之后
的地址），所以问商店本人：``GET /store/v1/base-url``（见商店侧
``security.request_security.request_origin``）。商店的回答带一个 ``declared`` 标记：

- ``declared=true``：显式配了 ``STORE_BASE_URL`` —— 运维的声明，**原样采信且优先于同机
  推断**：声明成公网域名就意味着注册 / 激活 / 商店入口一律走公网（默认 compose 只把商店
  发布到回环，``<局域网IP>:8802`` 反而打不开）；
- ``declared=false``：只是回显「你怎么连上我的」—— 没配对外地址时，同机部署的局域网用户
  才走「同一 IP 的商店端口」这条离线推断（见 :func:`resolve_browser_store_url`）。

显式配置了 ``APP_STORE_URL`` 时本模块不产生任何网络请求 —— 显式值永远优先。
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import NamedTuple
from urllib.parse import urlsplit

import httpx

from ....platform.core.http.hostnames import authority, browser_reachable, direct_port_host

logger = logging.getLogger("homeos.store_discovery")

#: 商店侧的「我的对外地址」端点（相对商店根地址）。
STORE_BASE_URL_PATH = '/store/v1/base-url'

#: 商店的 HTTP 端口默认值（与 ``ops/ports.mjs`` / compose 一致）。同机部署时，
#: 浏览器用 ``<IP>:<这个端口>`` 直连商店。
DEFAULT_STORE_PORT = 8802

#: 这一步的超时上限（秒）。它只服务登录页的两个链接，不该让容器启动 / 用户打开登录页
#: 等满授权请求的超时（默认 10s）—— 商店不可达时那是白等。
MAX_TIMEOUT_SECONDS = 5.0

#: 取回失败后的退避（秒）。没有它的话，商店长期不可达时**每次**打开登录页都要白等一次
#: 超时；有了它，最快每分钟只试一次。
RETRY_COOLDOWN_SECONDS = 60.0


class StoreAnswer(NamedTuple):
    """商店对「你的对外地址是什么」的回答。

    ``url`` 为空串表示没答上来；``declared`` 为真表示这个值来自商店显式配置的
    ``STORE_BASE_URL``（而不是回显调用方的 Host）。
    """

    url: str = ''
    declared: bool = False

    def __bool__(self) -> bool:
        return bool(self.url)


def _normalize(value: object) -> str:
    """只接受 ``http(s)://`` 开头的字符串；其余（含空值、非字符串）一律当没回答。"""
    if not isinstance(value, str):
        return ''
    text = value.strip().rstrip('/')
    if not text.lower().startswith(('http://', 'https://')):
        return ''
    return text


def store_port(settings: object) -> int:
    """商店的 HTTP 端口：从容器出站地址（``APP_LICENSE_SERVER_URL``）的端口取。

    同机部署时浏览器要用 ``<同一个 IP>:<这个端口>`` 直连商店。取不到就用默认 8802 ——
    这里绝不能猜成 443：商店没有 HTTPS 入口。
    """
    base = _normalize(str(getattr(settings, 'license_server_url', '') or ''))
    try:
        port = urlsplit(base).port
    except ValueError:
        port = None
    return port or DEFAULT_STORE_PORT


def same_machine_store(settings: object) -> bool:
    """商店是否与主应用跑在同一台机器上（同 IP、只差端口）？

    判据是**容器出站地址的主机名**：同机 compose 用服务名 ``homeos-store``（浏览器解析
    不了），分机部署用公网域名（浏览器解析得了）。这个判据不受 ``STORE_BASE_URL`` 影响 ——
    商店声明了公网域名也不会把「同机」这件事掩盖掉。
    """
    base = _normalize(str(getattr(settings, 'license_server_url', '') or ''))
    try:
        host = urlsplit(base).hostname or ''
    except ValueError:
        return False
    return bool(host) and not browser_reachable(host)


def resolve_browser_store_url(
    answer: StoreAnswer,
    browser_origin: str,
    *,
    same_machine: bool = False,
    port: int = DEFAULT_STORE_PORT,
) -> str:
    """把商店的回答整理成**浏览器能用**的商店地址。

    三种情形，按优先级：

    1. 商店声明了 ``STORE_BASE_URL``（``declared=true``）：原样采信，**优先于同机推断**
       —— 声明成公网域名就意味着注册 / 激活 / 商店入口一律走公网，局域网访问也不例外。
    2. 同机 + 浏览器在用 IP/端口访问，且商店**没声明**对外地址：商店就在同一台机器的
       ``:8802`` 上，直接用 ``http://<同一 IP>:<port>``（离线也成立，纯内网现场的兜底；
       scheme 固定 ``http``，商店没有 HTTPS 入口，从 ``:8803`` 自签页点过去是顶层跳转）。
    3. 否则（商店回显「你怎么连上我的」）：主机名浏览器能用就原样用；不能用（同机部署的
       容器服务名）且当前是公网域名访问时返回空串 —— 让前端隐藏入口，而不是给 404 链接。
    """
    text = _normalize(answer.url)
    if answer.declared and text:
        return text

    source = urlsplit(_normalize(browser_origin))
    host = source.hostname or ''
    if same_machine and host and direct_port_host(host):
        return f'http://{authority(host, port)}'

    if not text:
        return ''
    if same_machine and host and browser_reachable(host):
        # 同机但走的是公网域名，而商店没声明自己的公网地址：`<这个域名>:8802` 几乎肯定
        # 没被发布（公网只开 443）。宁可返回空串让前端隐藏入口，也不给一个 404 链接。
        logger.info(
            '商店未声明 STORE_BASE_URL，无法推断域名入口（当前浏览器来源 %s）', browser_origin
        )
        return ''
    parts = urlsplit(text)
    if browser_reachable(parts.hostname or ''):
        return text
    if not host:
        return ''
    return f'{parts.scheme}://{authority(host, parts.port)}'


async def discover_store_base_url(
    settings: object, *, transport: httpx.AsyncBaseTransport | None = None
) -> StoreAnswer:
    """问商店要它的对外地址；取不到（连不上 / 超时 / 回答不合法）返回空回答。

    **绝不抛异常**：这一步失败只影响登录页的商店链接，与授权、验证码、启动都无关，
    不该让调用方额外包一层 try。
    """
    base = str(getattr(settings, 'license_server_url', '') or '').strip().rstrip('/')
    if not base:
        return StoreAnswer()
    configured = float(getattr(settings, 'license_request_timeout_seconds', MAX_TIMEOUT_SECONDS))
    timeout = min(max(1.0, configured), MAX_TIMEOUT_SECONDS)
    url = f'{base}{STORE_BASE_URL_PATH}'
    try:
        async with httpx.AsyncClient(transport=transport, timeout=timeout) as client:
            response = await client.get(url)
            if response.status_code >= 400:
                logger.info('商店未提供对外地址（HTTP %s）：%s', response.status_code, url)
                return StoreAnswer()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        logger.info('未能向商店问取对外地址（%s）：%s', url, error)
        return StoreAnswer()
    if not isinstance(payload, dict):
        return StoreAnswer()
    return StoreAnswer(
        url=_normalize(payload.get('baseUrl')),
        declared=payload.get('declared') is True,
    )


class StoreBaseUrlResolver:
    """商店对外地址的「取回一次、缓存、失败退避」。

    每个进程一份（在 ``bootstrap/lifespan`` 里建好挂到 ``app.state``，**启动时不联网**）。
    唯一的调用时机是登录页取公开配置（``api/public_config``）—— 那是唯一需要
    「浏览器能打开的商店地址」的地方。

    失败**不缓存空值**，而是退避 ``RETRY_COOLDOWN_SECONDS`` 再试；成功即长期有效
    （商店地址不会中途变，真变了重启容器即可）。
    """

    def __init__(self, settings: object) -> None:
        self._settings = settings
        self._lock = asyncio.Lock()
        self._answer = StoreAnswer()
        self._next_attempt = 0.0

    def _explicit(self) -> str:
        return str(getattr(self._settings, 'store_url', '') or '').strip().rstrip('/')

    async def resolve_for_browser(self, browser_origin: str) -> str:
        """商店的对外地址，**浏览器的口径**。

        显式 ``APP_STORE_URL`` 优先；其次商店声明（``STORE_BASE_URL``，优先于同机推断）；
        都没答时才走「同机 + IP → 拼商店端口」的离线兜底（见 :func:`resolve_browser_store_url`）。
        回答带缓存与失败退避（见 :meth:`_discover`），稳态下不会每次请求都联网。
        """
        explicit = self._explicit()
        if explicit:
            return explicit
        same_machine = same_machine_store(self._settings)
        port = store_port(self._settings)
        answer = await self._discover()
        if same_machine and not answer.declared:
            source = urlsplit(_normalize(browser_origin))
            host = source.hostname or ''
            if host and direct_port_host(host):
                # 商店没声明对外地址 + 浏览器在用 IP 直连：拼同机端口。
                return f'http://{authority(host, port)}'
        return resolve_browser_store_url(
            answer, browser_origin, same_machine=same_machine, port=port
        )

    async def _discover(self) -> StoreAnswer:
        """带回缓存与失败退避的取回。"""
        if self._answer:
            return self._answer
        if time.monotonic() < self._next_attempt:
            return StoreAnswer()
        async with self._lock:
            # 等锁期间可能已被并发的请求取回，复查一次。
            if self._answer:
                return self._answer
            answer = await discover_store_base_url(self._settings)
            if answer:
                self._answer = answer
            else:
                self._next_attempt = time.monotonic() + RETRY_COOLDOWN_SECONDS
            return self._answer


__all__ = [
    'DEFAULT_STORE_PORT',
    'MAX_TIMEOUT_SECONDS',
    'RETRY_COOLDOWN_SECONDS',
    'STORE_BASE_URL_PATH',
    'StoreAnswer',
    'StoreBaseUrlResolver',
    'browser_reachable',
    'direct_port_host',
    'discover_store_base_url',
    'resolve_browser_store_url',
    'same_machine_store',
    'store_port',
]
