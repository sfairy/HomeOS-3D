"""Home Assistant 读取类请求的共享 HTTP 连接池。

``HAClient`` 的读取接口（``test_connection`` / ``fetch_states`` / ``fetch_history``）原来每个
方法都 ``async with httpx.AsyncClient(...)``：一次请求开关一条 TCP + TLS 连接。墙屏每分钟
数十次状态刷新、历史图表一次几百个实体，握手与 TIME_WAIT 全都白付。

这里按「传输参数」共享 ``httpx.AsyncClient``，把 keep-alive 复用起来；生命周期由
``HAConnectorService.start`` / ``stop`` 管理，和 :mod:`.control_pool` 同构。

和 ``HAControlPool`` 的分工：

* 控制类请求（调服务）按**连接**隔离 —— 不同 HA 实例不能共用同一条长连接；
* 读取类请求按**传输参数**（``verify_tls`` / ``trust_env``）共享 —— 令牌与
  ``Content-Type`` 走请求头（``HAClient.headers``），所以同一个池可以服务多条连接记录。
"""

from __future__ import annotations

import asyncio
import ssl
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass

import httpx

#: 并发上限：实时推送刷新 + 历史查询 + 端点探测共用，比控制池宽（读取都是短请求）。
HTTP_POOL_MAX_CONNECTIONS = 24
HTTP_POOL_KEEPALIVE_CONNECTIONS = 12
HTTP_POOL_KEEPALIVE_EXPIRY_SECONDS = 30.0
#: 关闭池时等待在途请求收尾的上限（秒）：收尾卡住也不能把停机拖住。
HTTP_POOL_CLOSE_TIMEOUT_SECONDS = 5.0


@dataclass(frozen=True)
class HAHttpConfiguration:
    """共享 client 的传输参数。

    刻意不含量级更高的东西（地址、令牌）：地址由每个请求自己拼，令牌走请求头，
    这样同一个池能给多条连接记录复用 —— 只有 TLS 校验与代理策略相同才能共用连接。
    """

    verify_tls: bool | ssl.SSLContext = True
    trust_env: bool = True


class HAHttpClientPool:
    """按传输参数共享 ``httpx.AsyncClient`` 的小池（线程模型：单事件循环）。

    用法与 ``HAControlPool`` 一致：``async with pool.lease(config) as client``。
    池关闭后不再接受新租约（``lease`` 抛 ``httpx.RequestError``），由调用方翻译成业务错误。
    """

    def __init__(
        self,
        *,
        max_connections: int = HTTP_POOL_MAX_CONNECTIONS,
        keepalive_expiry: float = HTTP_POOL_KEEPALIVE_EXPIRY_SECONDS,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._limits = httpx.Limits(
            max_connections=max(int(max_connections), 1),
            max_keepalive_connections=max(min(int(max_connections), HTTP_POOL_KEEPALIVE_CONNECTIONS), 1),
            keepalive_expiry=keepalive_expiry,
        )
        # 测试注入 ``httpx.MockTransport``：真实链路不需要动这一项。
        self._transport = transport
        self._clients: dict[HAHttpConfiguration, httpx.AsyncClient] = {}
        self._active = 0
        self._idle = asyncio.Event()
        self._idle.set()
        #: True 表示池已关闭（``aclose``），不能再用；重启时由 ``start`` 换新池。
        self.closed = False

    @property
    def client_count(self) -> int:
        """当前缓存的 client 数（按传输参数分组，正常是 1~2）。"""
        return len(self._clients)

    @asynccontextmanager
    async def lease(self, configuration: HAHttpConfiguration) -> AsyncGenerator[httpx.AsyncClient]:
        """借一个共享 client；同一个事件循环里并发租约共享同一个对象。"""
        if self.closed:
            raise httpx.RequestError('Home Assistant 连接已停止或已切换，请重新操作。')
        client = self._clients.get(configuration)
        if client is None:
            client = self._create_client(configuration)
            self._clients[configuration] = client
        self._active += 1
        self._idle.clear()
        try:
            yield client
        finally:
            self._active -= 1
            if self._active <= 0:
                self._idle.set()

    def _create_client(self, configuration: HAHttpConfiguration) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            verify=configuration.verify_tls,
            trust_env=configuration.trust_env,
            limits=self._limits,
            transport=self._transport,
        )

    def invalidate(self) -> None:
        """让后续租约立刻失败（停机第一步：别让新请求排在将要关闭的池后面）。"""
        self.closed = True

    async def aclose(self) -> None:
        """关闭全部 client；等在途租约收尾，超时也照关。"""
        self.invalidate()
        if self._active > 0:
            try:
                async with asyncio.timeout(HTTP_POOL_CLOSE_TIMEOUT_SECONDS):
                    await self._idle.wait()
            except TimeoutError:
                # 在途请求卡在网络上时不能把停机拖住：直接关，异常由调用方自己吞掉。
                pass
        clients = list(self._clients.values())
        self._clients.clear()
        for client in clients:
            try:
                await client.aclose()
            except Exception:
                # 关闭阶段的异常没有补救动作：继续关下一个。
                pass
