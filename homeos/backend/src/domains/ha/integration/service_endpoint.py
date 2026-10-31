"""Home Assistant 端点探测、客户端构造、翻译表与历史缓存。"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from .client import (
    HAClient,
    HAClientError,
    bypass_environment_proxy,
)
from .connection_setup import HA_ENDPOINT_PROBE_TIMEOUT_SECONDS
from .control_pool import HAControlConfiguration
from .crypto import CredentialCipherError
from .endpoints import (
    HAEndpoint,
    connection_endpoints,
    endpoint_signature,
)
from .errors import endpoint_failure_reason
from .service_contract import HAConnectorHost
from .service_support import (
    ENDPOINT_PRIORITY_GRACE_SECONDS,
    HA_ENDPOINT_RECHECK_SECONDS,
    HISTORY_CACHE_SECONDS,
    LOGGER,
    TRANSLATION_CACHE_SECONDS,
)
from ....platform.core.db.models import HAConnection


class HAEndpointMixin(HAConnectorHost):
    """Home Assistant 端点探测、客户端构造、翻译表与历史缓存。"""

    def invalidate_endpoint(self) -> None:
        self._endpoint = None
        self._endpoint_signature = None
        self._endpoint_probed_at = 0.0

    def refresh_endpoint_in_background(self, connection_id: str | None) -> None:
        """连接失败后立刻作废端点缓存，并把重新探测挪到后台。

        旧实现只做 ``invalidate_endpoint()``：清缓存之后，**下一条控制命令**
        会先付一轮并发探测（内网不可达时约 2.5s）—— 用户体感就是「断网恢复后
        第一次点灯要转圈好几秒」。这里改成失败即后台探测，控制链路只读缓存结果。
        """
        self.invalidate_endpoint()
        if not connection_id:
            return
        running = getattr(self, '_endpoint_probe_task', None)
        if isinstance(running, asyncio.Task) and not running.done():
            return
        self._endpoint_probe_task = asyncio.create_task(
            self._probe_endpoint_background(connection_id), name = 'ha-endpoint-probe'
        )

    async def _probe_endpoint_background(self, connection_id: str) -> None:
        try:
            connection = await self._run_database(self._load_connection, connection_id)
            if connection is None:
                return
            await self.active_endpoint(connection)
        except asyncio.CancelledError:
            raise
        except Exception:
            # 探测失败与重连循环共用同一套日志/事件，这里只留 DEBUG 避免重复刷屏。
            LOGGER.debug('HA 端点后台探测失败', exc_info = True)

    async def _probe_endpoint(self, connection: HAConnection, endpoint: HAEndpoint, token: str) -> None:
        await HAClient(endpoint.base_url, token, verify_tls = endpoint.verify_tls, timeout = HA_ENDPOINT_PROBE_TIMEOUT_SECONDS, websocket_max_size_bytes = self.settings.ha_websocket_max_size_bytes, http_pool = self._http_pool).test_connection()

    async def _probe_endpoints(self, connection: HAConnection, token: str) -> tuple[HAEndpoint | None, dict[HAEndpoint, str]]:
        """并发探测所有候选端点，按配置顺序（内网优先）挑第一个可达的。

        顺序探测时，挂掉的内网端点必须把 HA_ENDPOINT_PROBE_TIMEOUT_SECONDS 等满才轮到外网，
        每次复探都白付一整个超时（实测内网不可达时 2.5s）；并发之后只需等「第一个成功」。
        命中之后仍留一个很短的追赶窗口，避免外网先答完就把本该优先的内网挤掉。
        """
        endpoints = connection_endpoints(connection)
        order = {endpoint: index for index, endpoint in enumerate(endpoints)}
        tasks = {
            asyncio.create_task(
                self._probe_endpoint(connection, endpoint, token),
                name = f'ha-probe-{endpoint.kind}',
            ): endpoint
            for endpoint in endpoints
        }
        pending = set(tasks)
        reachable: list[HAEndpoint] = []
        failures: dict[HAEndpoint, str] = {}
        deadline: float | None = None
        loop = asyncio.get_running_loop()
        try:
            while pending:
                timeout = None if deadline is None else max(0.0, deadline - loop.time())
                done, pending = await asyncio.wait(
                    pending, timeout = timeout, return_when = asyncio.FIRST_COMPLETED,
                )
                for task in done:
                    endpoint = tasks[task]
                    error = task.exception()
                    if error is None:
                        reachable.append(endpoint)
                    else:
                        failures[endpoint] = str(error)
                if not reachable:
                    continue
                # 最优候选已经确认可达，或者追赶窗口已用掉，就不用再等了。
                if min(order[endpoint] for endpoint in reachable) == 0 or deadline is not None:
                    break
                deadline = loop.time() + ENDPOINT_PRIORITY_GRACE_SECONDS
        finally:
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions = True)
        if reachable:
            return min(reachable, key = lambda endpoint: order[endpoint]), { }
        # 失败原因按端点返回原始异常文本：调用方要用 :func:`endpoint_failure_reason` 压成短句，
        # 多个端点拼在同一行日志里才读得动。
        return None, failures

    async def active_endpoint(self, connection: HAConnection) -> HAEndpoint:
        signature = endpoint_signature(connection)
        switched_from: HAEndpoint | None = None
        async with self._endpoint_lock:
            if (
                self._endpoint is not None
                and self._endpoint_signature == signature
                and time.monotonic() - self._endpoint_probed_at < HA_ENDPOINT_RECHECK_SECONDS
            ):
                return self._endpoint
            token = self.cipher.decrypt(connection.encrypted_access_token)
            reachable, failures = await self._probe_endpoints(connection, token)
            if reachable is None:
                self._endpoint = None
                self._endpoint_signature = signature
                candidates = [endpoint for endpoint in connection_endpoints(connection) if endpoint in failures]
                reasons = {
                    endpoint: endpoint_failure_reason(failures[endpoint])
                    for endpoint in candidates
                }
                if len(candidates) == 1:
                    raise HAClientError(f'Home Assistant 的{candidates[0].label}地址连不上：{reasons[candidates[0]]}。')
                detail = '；'.join(
                    f'{endpoint.label}（{endpoint.base_url}）：{reasons[endpoint]}'
                    for endpoint in candidates
                )
                raise HAClientError(f'Home Assistant 的内网与外网地址都连不上（{detail}）。')
            previous = self._endpoint
            self._endpoint = reachable
            self._endpoint_signature = signature
            self._endpoint_probed_at = time.monotonic()
            if previous is not None and previous.kind != reachable.kind:
                switched_from = previous
        if switched_from is not None:
            await self._log_event(
                'warning', '连接',
                f'Home Assistant 已从{switched_from.label}切到{reachable.label}（{reachable.base_url}）',
            )
        if str(connection.active_endpoint or '') != reachable.kind:
            await self._run_database(self._store_active_endpoint, connection.id, reachable.kind)
        return reachable

    def _store_active_endpoint(self, connection_id: str, kind: str) -> None:
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection is None:
                return
            connection.active_endpoint = kind
            database.commit()

    async def client_for(self, connection: HAConnection) -> HAClient:
        endpoint = await self.active_endpoint(connection)
        token = self.cipher.decrypt(connection.encrypted_access_token)
        connector = self._ha_tuning()['haConnector']
        try:
            ping_interval = max(int(connector.get('wsPingIntervalMs') or 15_000), 1_000) / 1000.0
            pong_timeout_ms = max(int(connector.get('wsPongTimeoutMs') or 10_000), 1_000)
            max_misses = max(int(connector.get('wsHeartbeatMaxMisses') or 2), 1)
        except (TypeError, ValueError):
            ping_interval, pong_timeout_ms, max_misses = 15.0, 10_000, 2
        # websockets 只暴露「单次 pong 等待窗口」，无法直接表达「连续 N 次未响应才断开」；
        # 用 wsPongTimeoutMs × wsHeartbeatMaxMisses 近似「容忍 N 次心跳未响应」的总窗口。
        ping_timeout = (pong_timeout_ms * max_misses) / 1000.0
        return HAClient(
            endpoint.base_url, token,
            verify_tls = endpoint.verify_tls,
            timeout = self.settings.ha_request_timeout_seconds,
            websocket_max_size_bytes = self.settings.ha_websocket_max_size_bytes,
            control_pool = self._control_pool,
            control_connection_id = connection.id,
            http_pool = self._http_pool,
            ws_ping_interval = ping_interval,
            ws_ping_timeout = ping_timeout,
            use_subscribe_entities = bool(connector.get('useSubscribeEntities')),
            subscribe_entities_shadow = bool(connector.get('subscribeEntitiesShadow')),
        )

    def _control_configuration(self) -> HAControlConfiguration | None:
        """给连接池解析「当前活跃连接」的租约参数；没有活跃连接时返回 ``None``。

        读库放在这里而不是构造时：活跃连接会被用户随时切换。

        这里必须与 :meth:`client_for` 交给 ``HAClient`` 的那一份逐字段一致：控制请求是
        ``client_for`` 造出的客户端拿去走池的，池会拿两份 ``HAControlConfiguration`` 做
        等值比较；只要 ``base_url`` / ``verify_tls`` / ``trust_env`` 有一项对不上，池就判定
        「配置已变化」，把**每一次**设备控制都拒掉。所以端点取最近一次探测出的
        ``self._endpoint``（即 ``client_for`` 实际使用的那一侧），``trust_env`` 也与
        ``HAClient.__init__`` 用同一个 ``bypass_environment_proxy`` 推导 —— 内网地址要绕开环境代理，
        外网地址才允许走代理。
        """
        connection = self.active_connection()
        if connection is None:
            return None
        try:
            token = self.cipher.decrypt(connection.encrypted_access_token)
        except CredentialCipherError:
            # 令牌解不开时视为「没有可用配置」：控制请求会拿到连接不可用的错误，
            # 而不是在池里留下一条永远不可能建成的租约。
            return None
        endpoint = self._endpoint
        base_url = endpoint.base_url if endpoint is not None else connection.base_url
        verify_tls = endpoint.verify_tls if endpoint is not None else bool(connection.verify_tls)
        return HAControlConfiguration(
            connection_id = connection.id,
            base_url = base_url,
            access_token = token,
            verify_tls = verify_tls,
            timeout = self.settings.ha_request_timeout_seconds,
            trust_env = not bypass_environment_proxy(base_url),
        )

    async def entity_translations(
        self,
        connection: HAConnection,
        integrations: set[str] | list[str] | tuple[str, ...],
        language: str = 'zh-Hans',
    ) -> dict[str, str]:
        """带 TTL 缓存的实体翻译表。

        HA 侧翻译要逐个集成各发一次 ``frontend/get_translations``（实测每次约 140ms，且是串行），
        而内容只在 HA 升级后才变，所以按「连接 + 语言 + 集成集合」缓存，页面加载之间直接复用。
        """
        requested = tuple(sorted({str(item).strip() for item in integrations if str(item).strip()}))
        cache_key = (str(connection.id), language, requested)
        async with self._translation_lock:
            cached = self._translation_cache.get(cache_key)
            if cached is not None and time.monotonic() - cached[0] < TRANSLATION_CACHE_SECONDS:
                self._translation_cache.move_to_end(cache_key)
                return dict(cached[1])
        resources = await (await self.client_for(connection)).fetch_entity_translations(
            requested, language = language,
        )
        async with self._translation_lock:
            self._translation_cache[cache_key] = (time.monotonic(), dict(resources))
            while len(self._translation_cache) > 32:
                self._translation_cache.popitem(last = False)
        return resources

    def _history_cache_limits(self) -> tuple[float, int]:
        """历史缓存 (TTL 秒, 最大条数)。

        TTL 取自 ``other.haHistoryCacheMin``（分钟 → 秒），容量取自
        ``haConnector.historyCacheMaxSize``；非法或缺失时回退默认。
        """
        tuning = self._ha_tuning()
        try:
            ttl_seconds = max(int(tuning['other'].get('haHistoryCacheMin') or 0), 1) * 60.0
        except (TypeError, ValueError):
            ttl_seconds = float(HISTORY_CACHE_SECONDS)
        try:
            max_size = max(int(tuning['haConnector'].get('historyCacheMaxSize') or 0), 1)
        except (TypeError, ValueError):
            max_size = 300
        return ttl_seconds, max_size

    async def fetch_history(self, connection: HAConnection, entity_id: str, start_time: str, hours: int) -> list[dict[str, Any]]:
        """限制并短暂缓存历史数据读取，避免图表大量并发请求 HA。"""
        cache_key = (str(connection.id), str(entity_id), int(hours))
        ttl_seconds, _ = self._history_cache_limits()
        now = time.monotonic()
        async with self._history_cache_lock:
            cached = self._history_cache.get(cache_key)
            if cached and now - cached[0] < ttl_seconds:
                self._history_cache.move_to_end(cache_key)
                return list(cached[1])
            fetch = self._history_fetches.get(cache_key)
            if fetch is None:
                fetch = asyncio.create_task(
                    self._fetch_and_cache_history(
                        connection,
                        entity_id,
                        start_time,
                        cache_key,
                        self._history_generation,
                    ),
                    name = f'ha-history-{entity_id}',
                )
                self._history_fetches[cache_key] = fetch
                fetch.add_done_callback(lambda completed, key = cache_key: self._discard_history_fetch(key, completed))
        return list(await asyncio.shield(fetch))

    def _discard_history_fetch(self, cache_key: tuple[str, str, int], fetch: asyncio.Task[list[dict[str, Any]]]) -> None:
        if self._history_fetches.get(cache_key) is fetch:
            self._history_fetches.pop(cache_key, None)

    async def _fetch_and_cache_history(
        self,
        connection: HAConnection,
        entity_id: str,
        start_time: str,
        cache_key: tuple[str, str, int],
        generation: int,
    ) -> list[dict[str, Any]]:
        async with self._history_semaphore:
            history = await (await self.client_for(connection)).fetch_history(entity_id, start_time)
        async with self._history_cache_lock:
            # 代不符：这次查询来自已经作废的缓存周期（停连 / 换连接），结果只回给调用方。
            if generation != self._history_generation:
                return list(history)
            self._history_cache[cache_key] = (time.monotonic(), list(history))
            _, max_size = self._history_cache_limits()
            while len(self._history_cache) > max_size:
                self._history_cache.popitem(last = False)
        return history
