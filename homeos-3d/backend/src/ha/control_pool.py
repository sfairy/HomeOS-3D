"""设备控制请求的连接复用池。

控制类请求（``call_service``）原本每次调用都新建一个 ``httpx.AsyncClient``，也就是每次
下发指令都要重做一遍 TCP + TLS 握手。设备多、批量下发（一个场景一次点亮几十盏灯）时，
这些握手会明显拖慢交互，也会在 HA 侧堆出大量短连接。

本模块把「控制连接」收敛成按 HA 连接隔离的长连接：同一份连接配置共享一个
``AsyncClient``，由并发上限与保活时间控制资源占用。只服务控制类请求 ——
读取（states / history）与 WebSocket 各有自己的通道，不走这里。
"""

from __future__ import annotations

import asyncio
import ssl
from collections.abc import Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

import httpx

CONTROL_MAX_CONNECTIONS = 16
CONTROL_KEEPALIVE_CONNECTIONS = 8
CONTROL_KEEPALIVE_EXPIRY_SECONDS = 30


@dataclass(frozen=True)
class HAControlConfiguration:
    """一份控制连接的身份与参数。

    ``connection_id`` 参与等值比较：同一个 HA 实例的两条连接记录（例如局域网地址与
    外网地址各存一条）不能共用同一条长连接，否则授权头与目标地址会串。
    """

    connection_id: str | None
    base_url: str
    access_token: str = field(repr=False)
    verify_tls: bool | ssl.SSLContext = True
    timeout: float = 10
    trust_env: bool = True


class HAControlPool:
    """某一代连接配置的 HTTP 传输层；从不重试指令。

    池按「当前活跃连接」解析配置，而不是调用方手里那份可能已经过期的数据库快照 ——
    用户切换地址后，旧协程不该继续拿着旧地址发指令。所有生命周期与准入操作都在
    连接器的事件循环上执行。
    """

    def __init__(
        self,
        configuration: Callable[[], HAControlConfiguration | None],
        *,
        max_connections: int = CONTROL_MAX_CONNECTIONS,
        keepalive_expiry: float = CONTROL_KEEPALIVE_EXPIRY_SECONDS,
    ) -> None:
        self._resolve_configuration = configuration
        self._configuration = None
        self._configuration_loaded = False
        self._client = None
        self._max_connections = max(1, max_connections)
        self._keepalive_expiry = keepalive_expiry
        self._active = 0
        self._capacity_changed = asyncio.Event()
        self._idle = asyncio.Event()
        self._idle.set()
        self._close_lock = asyncio.Lock()
        self._loop = None
        self.closed = False

    def _check_configuration(self, configuration: HAControlConfiguration) -> None:
        """置灰已失效的池，并保证同一代配置只在同一事件循环上使用。"""
        if self.closed:
            raise httpx.RequestError('Home Assistant 连接已停止或已切换，请重新操作。')
        loop = asyncio.get_running_loop()
        if self._loop is not None and self._loop is not loop:
            raise httpx.RequestError('Home Assistant 控制连接不属于当前运行环境。')
        self._loop = loop
        if not self._configuration_loaded:
            self._configuration = self._resolve_configuration()
            self._configuration_loaded = True
        if configuration != self._configuration:
            # 配置在池建好之后被换掉了：拒绝这次租约，让调用方按新配置重来。
            raise httpx.RequestError('Home Assistant 连接配置已变化，请重新操作。')

    @asynccontextmanager
    async def lease(self, configuration: HAControlConfiguration):
        """借出一条控制连接；并发超上限时排队等待，超时抛 ``httpx.PoolTimeout``。"""
        try:
            async with asyncio.timeout(configuration.timeout):
                while True:
                    self._check_configuration(configuration)
                    if self._active < self._max_connections:
                        self._active += 1
                        self._idle.clear()
                        break
                    # 先清再等：避免刚判断完就漏掉释放通知。
                    self._capacity_changed.clear()
                    await self._capacity_changed.wait()
        except TimeoutError as error:
            raise httpx.PoolTimeout('Home Assistant 控制请求等待连接超时。') from error

        try:
            if self._client is None:
                self._client = httpx.AsyncClient(
                    verify=configuration.verify_tls,
                    timeout=configuration.timeout,
                    headers={
                        'Authorization': f'Bearer {configuration.access_token}',
                        'Content-Type': 'application/json',
                    },
                    trust_env=configuration.trust_env,
                    limits=httpx.Limits(
                        max_connections=self._max_connections,
                        max_keepalive_connections=min(
                            self._max_connections, CONTROL_KEEPALIVE_CONNECTIONS
                        ),
                        keepalive_expiry=self._keepalive_expiry,
                    ),
                )
            yield self._client
        finally:
            self._active -= 1
            self._capacity_changed.set()
            if self._active == 0:
                self._idle.set()

    def invalidate(self) -> None:
        """先关门再等收尾：让排队中的指令立刻失败，而不是排在即将关闭的池后面干等。"""
        self.closed = True
        self._capacity_changed.set()

    async def aclose(self) -> None:
        """等所有在途租约归还后关掉底层连接。"""
        self.invalidate()
        async with self._close_lock:
            if self._client is None:
                return
            timeout = self._configuration.timeout if self._configuration else 10
            try:
                async with asyncio.timeout(timeout):
                    await self._idle.wait()
            except TimeoutError:
                # 有请求卡住不还，也不能无限等：直接关连接，让它们的重试路径接手。
                pass
            finally:
                await self._client.aclose()
                self._client = None
