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

- ``declared=true``：商店显式配了 ``STORE_BASE_URL`` —— 那是运维的声明，**原样采信**；
- ``declared=false``：回答只是回显「你是怎么连上我的」—— 同机部署下它就是容器服务名，
  于是把主机名换成浏览器正在用的那个（见 :func:`resolve_browser_store_url`）。

显式配置了 ``APP_STORE_URL`` 时本模块不产生任何网络请求 —— 显式值永远优先。
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import time
from typing import NamedTuple
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger("homeos.store_discovery")

#: 商店侧的「我的对外地址」端点（相对商店根地址）。
STORE_BASE_URL_PATH = '/store/v1/base-url'

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


def browser_reachable(host: str) -> bool:
    """浏览器能不能靠这个主机名找到商店？

    否，只可能是两种「只有本机 / 容器网络内部才有意义」的写法：

    - 回环与未指定地址（``127.x`` / ``::1`` / ``localhost`` / ``0.0.0.0`` / ``::``）；
    - **不带点的单段名**（``homeos-store`` 这类 Docker Compose 服务名 / 容器别名）。

    是：其余 IP 字面量（含 IPv6）与带点的域名。注意判的是**语法**，不是可达性 ——
    判断不了的东西（跨网络的私网 IP、解析不到的域名）都算「是」，不在这个函数里纠正。

    单段名的例外：内网 DNS 里真有一个叫 ``store`` 的主机时这里会误判。那种部署应当在商店上
    显式配 ``STORE_BASE_URL``（``declared=true`` 时本函数不会被调用）。
    """
    name = host.strip().strip('[]').casefold()
    if not name:
        return False
    try:
        address = ipaddress.ip_address(name)
    except ValueError:
        return '.' in name
    return not (address.is_loopback or address.is_unspecified)


def resolve_browser_store_url(answer: StoreAnswer, browser_origin: str) -> str:
    """把商店的回答整理成**浏览器能用**的商店地址。

    商店回显的是「你是怎么连上我的」，于是：

    - 分机部署：调用方（客户机上的主应用容器）与浏览器的路径一致 —— 直接可用；
    - 同机部署：容器走的是 compose 服务名，拿到 ``http://homeos-store:8802``，
      浏览器解析不了 —— 这时把**主机名**换成浏览器自己访问主应用用的那个，端口与
      scheme 沿用商店的回答（``http://<宿主IP>:8802``）。

    只换主机名，不换端口 / 协议：那是商店自己的口径。宿主端口被改过（``18802:8802``）
    或商店另有一层只给浏览器的反代时，需要显式 ``APP_STORE_URL``。

    ``answer.declared`` 为真（商店配了 ``STORE_BASE_URL``）时原样返回 —— 运维的声明
    比我们的推断可信，也避免把单段名的内网域名当成容器服务名换掉。
    """
    text = _normalize(answer.url)
    if not text or answer.declared:
        return text
    parts = urlsplit(text)
    if browser_reachable(parts.hostname or ''):
        return text
    source = urlsplit(_normalize(browser_origin))
    host = source.hostname or ''
    if not host:
        return ''
    if ':' in host:  # IPv6 字面量要带方括号才是合法 URL
        host = f'[{host}]'
    port = f':{parts.port}' if parts.port else ''
    return f'{parts.scheme}://{host}{port}'


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
        """商店的对外地址，**浏览器的口径**：显式配置原样返回，问回来的值按需换主机名。"""
        explicit = self._explicit()
        if explicit:
            return explicit
        return resolve_browser_store_url(await self._discover(), browser_origin)

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
    'MAX_TIMEOUT_SECONDS',
    'RETRY_COOLDOWN_SECONDS',
    'STORE_BASE_URL_PATH',
    'StoreAnswer',
    'StoreBaseUrlResolver',
    'browser_reachable',
    'discover_store_base_url',
    'resolve_browser_store_url',
]
