"""HA 读取类共享 HTTP 池：复用、按传输参数分组、关闭与鉴权错误语义。"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

import httpx
from src.config import Settings
from src.domains.ha.integration.client import (
    HAAuthError,
    HAClient,
    HAClientError,
)
from src.domains.ha.integration.http_pool import (
    HAHttpClientPool,
    HAHttpConfiguration,
)
from src.domains.ha.integration.service import HAConnectorService
from src.platform.core.database import Database
from src.platform.core.schema import prepare_schema

BASE_URL = 'http://homeassistant.local:8123'


def _state(entity_id: str, value: str = 'on') -> dict:
    return {
        'entity_id': entity_id,
        'state': value,
        'attributes': {'friendly_name': entity_id},
        'last_changed': '2026-01-01T00:00:00+00:00',
    }


class _Recorder:
    """记录每个请求，并按 handler 返回响应（等价于真实链路里的 HA）。"""

    def __init__(self, handler) -> None:
        self.handler = handler
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.handler(request)


def _pool(handler, **kwargs) -> tuple[HAHttpClientPool, _Recorder]:
    recorder = _Recorder(handler)
    return HAHttpClientPool(transport=httpx.MockTransport(recorder), **kwargs), recorder


class SharedHttpClientPoolTest(unittest.IsolatedAsyncioTestCase):
    async def test_reads_reuse_one_client_and_keep_request_headers_and_timeout(self) -> None:
        pool, recorder = _pool(lambda request: httpx.Response(200, json=_state('light.kitchen')))
        client = HAClient(BASE_URL, 'secret-token', timeout=5.0, http_pool=pool)
        try:
            first = await client.fetch_states({'light.kitchen'})
            second = await client.fetch_states({'light.kitchen'})
            # 两次请求共用同一个 AsyncClient —— keep-alive 复用才有意义。
            self.assertEqual(pool.client_count, 1)
        finally:
            await pool.aclose()
        self.assertEqual(first[0]['entity_id'], 'light.kitchen')
        self.assertEqual(second[0]['entity_id'], 'light.kitchen')
        self.assertEqual(len(recorder.requests), 2)
        for request in recorder.requests:
            # 池只固定传输参数，令牌必须逐请求带上，否则多条连接记录会串号。
            self.assertEqual(request.headers['authorization'], 'Bearer secret-token')
            # 超时同样逐请求传：池级 client 没有自己的 timeout。
            self.assertEqual(request.extensions['timeout']['read'], 5.0)

    async def test_transport_configuration_groups_clients(self) -> None:
        pool, _ = _pool(lambda request: httpx.Response(200, json={'version': '2024.1.0'}))
        plain = HAClient(BASE_URL, 'token', http_pool=pool)
        insecure = HAClient(BASE_URL, 'token', verify_tls=False, http_pool=pool)
        try:
            await plain.test_connection()
            await insecure.test_connection()
            self.assertEqual(pool.client_count, 2)
        finally:
            await pool.aclose()
        self.assertTrue(pool.closed)

    async def test_closed_pool_rejects_leases_with_business_error(self) -> None:
        pool, recorder = _pool(lambda request: httpx.Response(200, json={'version': '2024.1.0'}))
        await pool.aclose()
        client = HAClient(BASE_URL, 'token', http_pool=pool)
        with self.assertRaises(HAClientError) as caught:
            await client.test_connection()
        self.assertIn('无法连接 Home Assistant', str(caught.exception))
        self.assertEqual(recorder.requests, [])

    async def test_unauthorized_maps_to_auth_error(self) -> None:
        pool, _ = _pool(lambda request: httpx.Response(401, json={}))
        client = HAClient(BASE_URL, 'expired-token', http_pool=pool)
        try:
            with self.assertRaises(HAAuthError):
                await client.test_connection()
        finally:
            await pool.aclose()


class HttpPoolUnitTest(unittest.IsolatedAsyncioTestCase):
    async def test_lease_returns_same_client_until_close(self) -> None:
        pool = HAHttpClientPool(transport=httpx.MockTransport(lambda request: httpx.Response(200)))
        configuration = HAHttpConfiguration(verify_tls=True, trust_env=False)
        try:
            async with pool.lease(configuration) as first, pool.lease(configuration) as second:
                self.assertIs(first, second)
            self.assertEqual(pool.client_count, 1)
        finally:
            await pool.aclose()
        self.assertTrue(pool.closed)
        with self.assertRaises(httpx.RequestError):
            async with pool.lease(configuration):
                pass

    async def test_aclose_is_idempotent(self) -> None:
        pool = HAHttpClientPool(transport=httpx.MockTransport(lambda request: httpx.Response(200)))
        await pool.aclose()
        await pool.aclose()
        self.assertEqual(pool.client_count, 0)


class ServicePoolLifecycleTest(unittest.IsolatedAsyncioTestCase):
    """连接器的 start / stop 必须管住共享池：关闭后不可再用，重启换新池。"""

    async def test_start_stop_manages_both_pools(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        settings = Settings(data_dir = Path(tmp.name))
        prepare_schema(settings)
        database = Database(settings.database_url)
        self.addCleanup(database.engine.dispose)
        service = HAConnectorService(settings, database)
        service.start()
        await asyncio.sleep(0.1)
        control_pool = service._control_pool
        http_pool = service._http_pool
        await service.stop()
        self.assertTrue(control_pool.closed)
        self.assertTrue(http_pool.closed)
        # 重启后池必须是新的、可用的（aclose 过的池不能再接受租约）。
        service.start()
        await asyncio.sleep(0.1)
        try:
            self.assertIsNot(service._http_pool, http_pool)
            self.assertFalse(service._http_pool.closed)
        finally:
            await service.stop()
