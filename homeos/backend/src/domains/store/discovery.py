"""向商店问「你的对外地址是什么」，并把它缓存 / 退避。

分机部署里客户机只知道「本容器能连到的商店地址」（``APP_LICENSE_SERVER_URL``），
而登录页的「忘记密码 / 商店」链接要给**浏览器**用：同一台商店，容器可能走内网服务名或
内网 DNS，浏览器要走宿主 IP / 公网域名 —— 两个地址天然可以不同（同机部署那份
``docker-compose.yml`` 里就正是两种值）。

这个地址**不推导**（容器无从知道 NAT 之后的地址），而是问商店本人：
``GET /store/v1/base-url`` 由商店按 ``STORE_BASE_URL`` 或本次请求的 scheme + Host 回答
（见商店侧 ``security.request_security.request_origin``）。

显式配置了 ``APP_STORE_URL`` 时本模块不产生任何网络请求 —— 显式值永远优先。
"""

from __future__ import annotations

import asyncio
import logging
import time
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger(__name__)

#: 商店侧的「我的对外地址」端点（相对商店根地址）。
STORE_BASE_URL_PATH = '/store/v1/base-url'

#: 这一步的超时上限（秒）。它只服务登录页的两个链接，不该让容器启动 / 用户打开登录页
#: 等满授权请求的超时（默认 10s）—— 商店不可达时那是白等。
MAX_TIMEOUT_SECONDS = 5.0

#: 取回失败后的退避（秒）。没有它的话，商店长期不可达时**每次**打开登录页都要白等一次
#: 超时；有了它，最快每分钟只试一次。
RETRY_COOLDOWN_SECONDS = 60.0


def _normalize(value: object) -> str:
    """只接受 ``http(s)://`` 开头的字符串；其余（含空值、非字符串）一律当没回答。"""
    if not isinstance(value, str):
        return ''
    text = value.strip().rstrip('/')
    if not text.lower().startswith(('http://', 'https://')):
        return ''
    return text


#: 只在「本机」有意义的主机名（浏览器解析不到商店）。
_LOOPBACK_HOSTS = frozenset({'localhost', '::1', '0.0.0.0'})


def browser_reachable(host: str) -> bool:
    """浏览器能不能靠这个主机名找到商店？

    否，只可能是两种「只有本机 / 容器网络内部才有意义」的写法：

    - 回环（``127.x`` / ``::1`` / ``localhost``）；
    - **不带点的单段名**（``homeos-store`` 这类 Docker Compose 服务名 / 容器别名）。

    是：IP 字面量、带点的域名。注意判的是**语法**，不是可达性 —— 判断不了的东西
    （跨网络的私网 IP、域名解析不到）都算「是」，不在这里纠正。
    """
    name = host.strip().strip('[]').casefold()
    if not name or name in _LOOPBACK_HOSTS or name.startswith('127.'):
        return False
    return '.' in name


def resolve_browser_store_url(discovered: str, browser_origin: str) -> str:
    """把商店的回答整理成**浏览器能用**的商店地址。

    商店回答的口径是「你是怎么连上我的」（见商店侧 ``request_origin``）：

    - 分机部署：调用方（客户机上的主应用容器）与浏览器的路径一致 —— 直接可用；
    - 同机部署：容器走的是 compose 服务名，拿到 ``http://homeos-store:8802``，
      浏览器解析不了 —— 这时把**主机名**换成浏览器自己访问主应用用的那个，端口与
      scheme 沿用商店的回答（``http://<宿主IP>:8802``）。

    只换主机名，不换端口 / 协议：那是商店自己的口径。宿主端口被改过（``18802:8802``）
    这类情况需要显式 ``APP_STORE_URL``。
    """
    text = _normalize(discovered)
    if not text:
        return ''
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
) -> str:
    """问商店要它的对外地址；取不到（连不上 / 超时 / 回答不合法）返回空串。

    **绝不抛异常**：这一步失败只影响登录页的商店链接，与授权、验证码、启动都无关，
    不该让调用方额外包一层 try。
    """
    base = str(getattr(settings, 'license_server_url', '') or '').strip().rstrip('/')
    if not base:
        return ''
    configured = float(getattr(settings, 'license_request_timeout_seconds', MAX_TIMEOUT_SECONDS))
    timeout = min(max(1.0, configured), MAX_TIMEOUT_SECONDS)
    url = f'{base}{STORE_BASE_URL_PATH}'
    try:
        async with httpx.AsyncClient(transport=transport, timeout=timeout) as client:
            response = await client.get(url)
            if response.status_code >= 400:
                logger.info('商店未提供对外地址（HTTP %s）：%s', response.status_code, url)
                return ''
            payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        logger.info('未能向商店问取对外地址（%s）：%s', url, error)
        return ''
    if not isinstance(payload, dict):
        return ''
    return _normalize(payload.get('baseUrl'))


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
        self._value = ''
        self._next_attempt = 0.0

    def _explicit(self) -> str:
        return str(getattr(self._settings, 'store_url', '') or '').strip().rstrip('/')

    def cached(self) -> str:
        """当前已知的商店对外地址（显式配置 > 已取回的值 > 空串）。不联网。"""
        return self._explicit() or self._value

    async def resolve(self) -> str:
        """商店的对外地址（显式配置优先）；取不到返回空串。**机器对机器**口径。"""
        explicit = self._explicit()
        if explicit:
            return explicit
        return await self._discover()

    async def resolve_for_browser(self, browser_origin: str) -> str:
        """商店的对外地址，**浏览器的口径**：显式配置原样返回，问回来的值做主机名修正。

        修正只针对「浏览器解析不了」的主机名（见 :func:`resolve_browser_store_url`），
        所以显式 ``APP_STORE_URL`` 与分机部署的真实地址都不会被改动。
        """
        explicit = self._explicit()
        if explicit:
            return explicit
        return resolve_browser_store_url(await self._discover(), browser_origin)

    async def _discover(self) -> str:
        """带回缓存与失败退避的取回（对外接口都走上面那两个方法）。"""
        if self._value:
            return self._value
        if time.monotonic() < self._next_attempt:
            return ''
        async with self._lock:
            # 等锁期间可能已被并发的请求取回，复查一次。
            if self._value:
                return self._value
            discovered = await discover_store_base_url(self._settings)
            if discovered:
                self._value = discovered
            else:
                self._next_attempt = time.monotonic() + RETRY_COOLDOWN_SECONDS
            return self._value


__all__ = [
    'MAX_TIMEOUT_SECONDS',
    'RETRY_COOLDOWN_SECONDS',
    'STORE_BASE_URL_PATH',
    'StoreBaseUrlResolver',
    'browser_reachable',
    'discover_store_base_url',
    'resolve_browser_store_url',
]
