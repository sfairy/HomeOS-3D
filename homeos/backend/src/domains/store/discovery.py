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

    每个进程一份（挂在 ``app.state`` 上）。两个调用时机：

    - 启动时（``bootstrap/lifespan``）：结果同时喂给版本更新检查端点 —— 客户机在内网
      「只问商店」，没有它就只能回落到 ``UpdateChecker`` 自己写死的回环地址；
    - 登录页取公开配置时（``api/public_config``）：覆盖「商店比主应用晚起」的情形。

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
        """取回商店对外地址；取不到返回空串。显式配了 ``APP_STORE_URL`` 时不联网。"""
        explicit = self._explicit()
        if explicit:
            return explicit
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
    'discover_store_base_url',
]
