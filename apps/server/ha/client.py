"""Home Assistant 的底层访问客户端（REST + WebSocket）。
"""
from __future__ import annotations

import asyncio
import json
import ssl
import urllib.request
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Any
from urllib.parse import quote, urlparse, urlunparse

import httpx
import websockets
from websockets.exceptions import ConnectionClosed

# 地址整形与校验下沉在 core/ha_url.py（core.schemas 也要用它，留在本模块会形成包级环）；
from ..core.ha_url import HAClientError, host_ip, normalize_base_url


def link_local_address(base_url: str) -> str:
    """该地址是否是链路本地地址（169.254.0.0/16、fe80::/10），是则返回它。"""
    host = host_ip(base_url)
    if host is None or not host.is_link_local:
        return ''
    return str(host)


def websocket_url(base_url: str) -> str:
    """由 REST 基地址推出 HA 的 WebSocket 端点地址。
    """
    parsed = urlparse(base_url)
    scheme = 'wss' if parsed.scheme == 'https' else 'ws'
    path = f"{parsed.path.rstrip('/')}/api/websocket"
    return urlunparse((scheme, parsed.netloc, path, '', '', ''))


def is_message_too_large(error: BaseException) -> bool:
    """判断这个 ``websockets`` 异常是不是「单条消息过大」（关闭码 1009）。
    """
    return (
        getattr(error, 'code', None) == 1009
        or 'message too big' in str(error).lower()
        or '1009' in str(error)
    )


#: 「链路被掐掉」这一类关闭码：1006（没有正常关闭帧）、1011（心跳超时）、1012（对端重启）。
TRANSIENT_CLOSE_CODES = frozenset({1006, 1011, 1012})

_TRANSIENT_DISCONNECT_MARKERS = (
    'keepalive ping timeout',
    'no close frame received or sent',
    'connection reset',
    'connection aborted',
    'broken pipe',
    'network is unreachable',
    'temporary failure in name resolution',
    'service restart',
)


def is_transient_disconnect(error: BaseException) -> bool:
    """这个异常是不是「已经连上之后，链路被网络层掐掉」这一类。
    """
    seen: set[int] = set()
    current: BaseException | None = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if getattr(current, 'code', None) in TRANSIENT_CLOSE_CODES:
            return True
        text = str(current).lower()
        if any(marker in text for marker in _TRANSIENT_DISCONNECT_MARKERS):
            return True
        # 已经是「连接没了」或「等超时了」两类异常本身：走到这里说明长连早就建起来了。
        if isinstance(current, ConnectionClosed):
            return True
        if isinstance(current, (asyncio.TimeoutError, TimeoutError)):
            return True
        current = current.__cause__ or current.__context__
    return False


#: 翻译表分批并发时每批的命令数。太大不够礼貌（同时在途几十条命令），太小又会退化回串行。
TRANSLATION_FETCH_BATCH_SIZE = 8


def _merge_translation_payload(resources: dict[str, str], payload: Any) -> None:
    """把一条 ``frontend/get_translations`` 的结果并进 ``resources``。
    """
    if isinstance(payload, dict) and 'resources' in payload:
        payload = payload['resources']
    if not isinstance(payload, dict):
        return
    for key, value in payload.items():
        if isinstance(key, str) and isinstance(value, str):
            resources[key] = value


def is_ipv6_literal(base_url: str) -> bool:
    """判断地址是否直接指向 IPv6 字面量。
    """
    hostname = urlparse(base_url).hostname
    if not hostname:
        return False
    try:
        return ip_address(hostname).version == 6
    except ValueError:
        # 普通域名（含 mDNS 名）不是 IP 字面量，按 False 处理。
        return False


def websocket_proxy(base_url: str) -> str | bool | None:
    """给出连接 HA WebSocket 时应传的 ``proxy`` 参数。
    """
    parsed = urlparse(base_url)
    if is_ipv6_literal(base_url):
        return None
    hostname = parsed.hostname or ''
    if not hostname:
        return None
    try:
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        bypassed = urllib.request.proxy_bypass(f'{hostname}:{port}')
    except ValueError:
        # 端口非法（例如 https://host:abc）时不猜代理，直接直连。
        return None
    if bypassed:
        return None
    proxies = urllib.request.getproxies()
    for key in ('wss', 'https', 'http', 'all'):
        value = proxies.get(key)
        if value and not str(value).lower().startswith('socks'):
            return str(value)
    if any(str(value).lower().startswith('socks') for value in proxies.values()):
        # 只剩 SOCKS 代理：交给 websockets 自己处理，缺 python-socks 时它会抛出那条明确的错误。
        return True
    return None


@dataclass(slots=True)
class HASnapshot:
    """一次全量对账所需的全部 HA 侧数据。
    """

    config: dict[str, Any]
    # `test_connection` 归一后的 HA 基本信息（版本、位置名、时区）。
    states: list[dict[str, Any]]
    # `get_states` 返回的全部实体状态。
    entities: list[dict[str, Any]] | None
    # 实体注册表（`config/entity_registry/list`），None 表示本次未取到。
    devices: list[dict[str, Any]] | None
    # 设备注册表（`config/device_registry/list`），None 表示本次未取到。
    areas: list[dict[str, Any]] | None
    # 区域注册表（`config/area_registry/list`），None 表示本次未取到。


class HAClient:
    """一个 HA 连接的服务端视图（基地址 + 令牌 + 传输选项）。
    """

    def __init__(
        self,
        base_url: str,
        access_token: str,
        verify_tls: bool = True,
        timeout: float = 10,
        websocket_max_size_bytes: int = 67108864,
    ) -> None:
        """构造一个 HA 客户端（不发起任何网络请求）。
        """
        self.base_url = normalize_base_url(base_url)
        self.access_token = access_token
        self.verify_tls = verify_tls
        self.timeout = timeout
        # 下限 8 MiB 是硬性保底：`get_states` 会把全部实体打包成一条消息返回，
        self.websocket_max_size_bytes = max(int(websocket_max_size_bytes), 8388608)
        self._is_ipv6_literal = is_ipv6_literal(self.base_url)

    @property
    def headers(self) -> dict[str, str]:
        """REST 请求头。HA 的长期访问令牌用 `Authorization: Bearer` 传递。"""
        return {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json',
        }

    async def test_connection(self) -> dict[str, Any]:
        """调用 `/api/config` 验证连通性与令牌权限。
        """
        try:
            async with httpx.AsyncClient(
                verify=self.verify_tls,
                timeout=self.timeout,
                headers=self.headers,
                # IPv6 字面量绕开环境代理：本地代理通常只监听 IPv4。
                trust_env=not self._is_ipv6_literal,
            ) as client:
                response = await client.get(f'{self.base_url}/api/config')
                response.raise_for_status()
                config = response.json()
        except httpx.HTTPStatusError as error:
            # 401/403 是「令牌不对」，这是用户最常遇到的错误，单独给一句可照做的提示。
            if error.response.status_code in {401, 403}:
                raise HAClientError('Home Assistant Token 无效或权限不足。') from error
            raise HAClientError(f'Home Assistant 返回 HTTP {error.response.status_code}。') from error
        except (httpx.HTTPError, ValueError) as error:
            raise HAClientError(f'无法连接 Home Assistant：{error}') from error
        return {
            'version': str(config.get('version', '')),
            'locationName': str(config.get('location_name', 'Home Assistant')),
            'timeZone': str(config.get('time_zone', '')),
        }

    async def fetch_states(
        self,
        entity_ids: set[str] | list[str] | tuple[str, ...],
    ) -> list[dict[str, Any]]:
        """按实体 ID 逐个拉取当前状态（并发 + 去重）。
        """
        requested = sorted({str(value) for value in entity_ids if str(value)})
        if not requested:
            return []
        # 并发上限 8：一次补拉的实体通常只有几十个，但 HA 端多为树莓派之类的
        semaphore = asyncio.Semaphore(8)
        async with httpx.AsyncClient(
            verify=self.verify_tls,
            timeout=self.timeout,
            headers=self.headers,
            trust_env=not self._is_ipv6_literal,
        ) as client:

            async def fetch_one(entity_id: str) -> dict[str, Any] | None:
                """拉取单个实体的状态；实体已不存在时返回 None 而不是抛错。"""
                async with semaphore:
                    try:
                        response = await client.get(
                            f'{self.base_url}/api/states/{quote(entity_id, safe="")}'
                        )
                        if response.status_code == 404:
                            return None
                        response.raise_for_status()
                        payload = response.json()
                    except httpx.HTTPStatusError as error:
                        if error.response.status_code in {401, 403}:
                            raise HAClientError('Home Assistant Token 无效或权限不足。') from error
                        raise HAClientError(f'Home Assistant 返回 HTTP {error.response.status_code}。') from error
                    except (httpx.HTTPError, ValueError) as error:
                        raise HAClientError(f'无法获取 Home Assistant 实体 {entity_id}：{error}') from error
                    # 兜底类型判断：HA 某些错误页返回 JSON 字符串/数组，放进状态表会污染下游，当没取到。
                    return payload if isinstance(payload, dict) else None

            results = await asyncio.gather(*(fetch_one(entity_id) for entity_id in requested))
        return [item for item in results if item is not None]

    def _ssl_context(self):
        """按需构造 WebSocket 的 TLS 上下文。
        """
        if not websocket_url(self.base_url).startswith('wss://'):
            return None
        return ssl.create_default_context() if self.verify_tls else ssl._create_unverified_context()

    async def _authenticate(self, websocket) -> None:
        """完成 HA WebSocket 的握手鉴权。
        """
        try:
            required = json.loads(await websocket.recv())
            if required.get('type') != 'auth_required':
                raise HAClientError('Home Assistant WebSocket 未返回鉴权请求。')
            await websocket.send(json.dumps({
                'type': 'auth',
                'access_token': self.access_token,
            }))
            result = json.loads(await websocket.recv())
        except (json.JSONDecodeError, websockets.WebSocketException) as error:
            raise HAClientError(f'Home Assistant WebSocket 鉴权失败：{error}') from error
        # 鉴权结果单独判断，不走上面的 try，免得把 HAClientError 再包一层。
        if result.get('type') != 'auth_ok':
            raise HAClientError('Home Assistant WebSocket Token 无效或鉴权失败。')

    async def connect_websocket(self):
        """建立并完成鉴权的 HA WebSocket 连接。
        """
        try:
            websocket = await websockets.connect(
                websocket_url(self.base_url),
                ssl=self._ssl_context(),
                proxy=websocket_proxy(self.base_url),
                open_timeout=self.timeout,
                # 20 秒心跳：家用网络 / 路由器会静默掐掉闲置 TCP，有了心跳才能在几十秒内
                ping_interval=20,
                ping_timeout=20,
                max_size=self.websocket_max_size_bytes,
                # 接收缓冲只留 4 条：一旦消费端卡住，宁愿以断连+重连收场，
                max_queue=4,
            )
            await self._authenticate(websocket)
            return websocket
        except HAClientError:
            raise
        except (OSError, TimeoutError, websockets.WebSocketException) as error:
            if is_message_too_large(error):
                maximum_mb = self.websocket_max_size_bytes // 1048576
                raise HAClientError(
                    f'Home Assistant 返回的单条数据超过 {maximum_mb} MB，'
                    '请提高 APP_HA_WEBSOCKET_MAX_SIZE_BYTES 或减少异常庞大的实体属性。'
                ) from error
            raise HAClientError(f'无法建立 Home Assistant WebSocket：{error}') from error

    async def command(self, websocket, message_id: int, command_type: str, **payload) -> Any:
        """在已鉴权的连接上发一条命令并等它的结果。
        """
        await websocket.send(json.dumps({'id': message_id, 'type': command_type, **payload}))
        while True:
            try:
                message = json.loads(await websocket.recv())
            except websockets.WebSocketException as error:
                if is_message_too_large(error):
                    maximum_mb = self.websocket_max_size_bytes // 1048576
                    raise HAClientError(
                        f'Home Assistant 命令 {command_type} 返回的单条数据超过 {maximum_mb} MB，'
                        '请提高 APP_HA_WEBSOCKET_MAX_SIZE_BYTES 或减少异常庞大的实体属性。'
                    ) from error
                raise HAClientError(
                    f'Home Assistant 命令 {command_type} 连接中断：{error}'
                ) from error
            # 不是本次命令的回复（多为订阅事件或其它命令的返回），跳过继续等。
            if message.get('id') != message_id:
                continue
            if message.get('type') != 'result' or not message.get('success'):
                error = message.get('error') or {}
                # 优先用 HA 自己给的中文/英文错误描述，没有才用兜底文案。
                raise HAClientError(str(error.get('message') or f'HA 命令 {command_type} 执行失败。'))
            return message.get('result')

    async def _collect_commands(
        self,
        websocket,
        requests: list[tuple[int, str, dict[str, Any]]],
    ) -> tuple[dict[int, Any], dict[int, HAClientError]]:
        """并发发出多条命令并收齐结果（HA WebSocket 单连接多路复用，返回顺序不保证）。
        """
        pending = {
            message_id: command_type for message_id, command_type, _ in requests
        }
        await asyncio.gather(*(
            websocket.send(json.dumps({'id': message_id, 'type': command_type, **payload}))
            for message_id, command_type, payload in requests
        ))
        results: dict[int, Any] = {}
        errors: dict[int, HAClientError] = {}
        while pending:
            try:
                message = json.loads(await websocket.recv())
            except websockets.WebSocketException as error:
                if is_message_too_large(error):
                    maximum_mb = self.websocket_max_size_bytes // 1048576
                    raise HAClientError(
                        f'Home Assistant 批量命令返回的单条数据超过 {maximum_mb} MB，'
                        '请提高 APP_HA_WEBSOCKET_MAX_SIZE_BYTES 或减少异常庞大的实体属性。'
                    ) from error
                raise HAClientError(f'Home Assistant 批量命令连接中断：{error}') from error
            message_id = message.get('id')
            # 不是本批次的回复（订阅推送或其它命令的返回），跳过继续等。
            if message_id not in pending:
                continue
            command_type = pending.pop(message_id)
            if message.get('type') != 'result' or not message.get('success'):
                error_payload = message.get('error') or {}
                errors[message_id] = HAClientError(
                    str(error_payload.get('message') or f'HA 命令 {command_type} 执行失败。')
                )
                continue
            results[message_id] = message.get('result')
        return results, errors

    @staticmethod
    async def subscribe_events(
        websocket,
        event_types: tuple[str, ...],
        start_id: int = 100,
        required_event_types: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        """批量订阅事件，并返回订阅期间已经推送过来的事件。
        """
        required = required_event_types if required_event_types is not None else set(event_types)
        # id -> 事件类型：用来认领各自的订阅确认。
        pending = {}
        for message_id, event_type in enumerate(event_types, start=start_id):
            pending[message_id] = event_type
            await websocket.send(json.dumps({
                'id': message_id,
                'type': 'subscribe_events',
                'event_type': event_type,
            }))
        buffered_events = []
        while pending:
            message = json.loads(await websocket.recv())
            # 订阅确认与事件推送混在同一条流里，事件先攒着最后一起交出去。
            if message.get('type') == 'event':
                buffered_events.append(message)
                continue
            message_id = message.get('id')
            if message_id not in pending:
                continue
            event_type = pending.pop(message_id)
            if message.get('type') != 'result' or not message.get('success'):
                if event_type not in required:
                    continue
                error = message.get('error') or {}
                raise HAClientError(str(error.get('message') or f'订阅 HA 事件 {event_type} 失败。'))
        return buffered_events

    async def fetch_snapshot(self) -> HASnapshot:
        """拉取一次全量对账所需的全部数据。
        """
        websocket = await self.connect_websocket()
        try:
            states = await self.command(websocket, 1, 'get_states')
            optional_results = []
            for message_id, command_type in (
                (2, 'config/entity_registry/list'),
                (3, 'config/device_registry/list'),
                (4, 'config/area_registry/list'),
            ):
                try:
                    optional_results.append(await self.command(websocket, message_id, command_type))
                except HAClientError:
                    # 注册表是可选增强：老版本 HA 或权限不足时取不到，记成 None 让同步层保持旧数据。
                    optional_results.append(None)
            entities, devices, areas = optional_results
        finally:
            await websocket.close()
        config = await self.test_connection()
        return HASnapshot(
            config=config,
            states=list(states or []),
            # None 原样保留（表示未取到），取到时才把结果转成列表。
            entities=list(entities or []) if entities is not None else None,
            devices=list(devices or []) if devices is not None else None,
            areas=list(areas or []) if areas is not None else None,
        )

    async def fetch_registries(
        self,
    ) -> tuple[
        list[dict[str, Any]] | None,
        list[dict[str, Any]] | None,
        list[dict[str, Any]] | None,
    ]:
        """单独拉取实体 / 设备 / 区域三份注册表。
        """
        websocket = await self.connect_websocket()
        results = []
        try:
            for message_id, command_type in (
                (2, 'config/entity_registry/list'),
                (3, 'config/device_registry/list'),
                (4, 'config/area_registry/list'),
            ):
                try:
                    results.append(await self.command(websocket, message_id, command_type))
                except HAClientError:
                    # 与 fetch_snapshot 一致：单份注册表失败不拖垮整次刷新。
                    results.append(None)
        finally:
            await websocket.close()
        entities, devices, areas = results
        return (
            list(entities or []) if entities is not None else None,
            list(devices or []) if devices is not None else None,
            list(areas or []) if areas is not None else None,
        )

    async def fetch_entity_translations(
        self,
        integrations: set[str] | list[str] | tuple[str, ...],
        language: str = 'zh-Hans',
    ) -> dict[str, str]:
        """取 HA 官方的实体名称翻译表，供界面显示中文名。
        """
        requested = sorted({str(item).strip() for item in integrations if str(item).strip()})
        websocket = await self.connect_websocket()
        resources: dict[str, str] = {}
        try:
            try:
                component_result = await self.command(
                    websocket, 1, 'frontend/get_translations',
                    language=language, category='entity_component',
                )
            except HAClientError:
                component_result = {}
            _merge_translation_payload(resources, component_result)
            # id 从 2 开始：1 已经被 entity_component 用掉了。
            next_message_id = 2
            for batch_start in range(0, len(requested), TRANSLATION_FETCH_BATCH_SIZE):
                batch = requested[batch_start:batch_start + TRANSLATION_FETCH_BATCH_SIZE]
                batch_results, _batch_errors = await self._collect_commands(
                    websocket,
                    [
                        (
                            next_message_id + offset,
                            'frontend/get_translations',
                            {
                                'language': language,
                                'category': 'entity',
                                'integration': integration,
                            },
                        )
                        for offset, integration in enumerate(batch)
                    ],
                )
                next_message_id += len(batch)
                # 本批里失败的那几个没有结果，直接体现成「少一部分翻译」。
                for result in batch_results.values():
                    _merge_translation_payload(resources, result)
        finally:
            await websocket.close()
        return resources

    async def call_service(
        self,
        domain: str,
        service: str,
        entity_id: str,
        data: dict[str, Any],
    ) -> Any:
        """调用 HA 服务（开灯、设温度、执行脚本等）。
        """
        # entity_id 放在展开之后：强制以本参数为准，防止 data 里夹带另一个实体。
        payload = {**data, 'entity_id': entity_id}
        try:
            async with httpx.AsyncClient(
                verify=self.verify_tls,
                timeout=self.timeout,
                headers=self.headers,
                trust_env=not self._is_ipv6_literal,
            ) as client:
                response = await client.post(
                    f'{self.base_url}/api/services/{domain}/{service}',
                    json=payload,
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as error:
            raise HAClientError(
                f'Home Assistant 服务调用返回 HTTP {error.response.status_code}。'
            ) from error
        except (httpx.HTTPError, ValueError) as error:
            raise HAClientError(f'Home Assistant 服务调用失败：{error}') from error

    async def browse_media(
        self,
        entity_id: str,
        media_content_id: str = 'media-source://',
        media_content_type: str | None = None,
    ) -> Any:
        """浏览媒体源，供媒体播放器控件选择要播放的内容。
        """
        payload = {'media_content_id': media_content_id}
        websocket = await self.connect_websocket()
        try:
            return await self.command(websocket, 1, 'media_source/browse_media', **payload)
        finally:
            await websocket.close()

    async def fetch_history(self, entity_id: str, start_time: str) -> list[dict[str, Any]]:
        # 起始时间在 URL 路径里，其中的 : 和 + 必须转义；safe='' 保证整串被完整编码。
        encoded_start = quote(start_time, safe='')
        params = {
            'filter_entity_id': entity_id,
            'no_attributes': '1',
            'significant_changes_only': '1',
        }
        try:
            async with httpx.AsyncClient(
                verify=self.verify_tls,
                timeout=self.timeout,
                headers=self.headers,
                trust_env=not self._is_ipv6_literal,
            ) as client:
                response = await client.get(
                    f'{self.base_url}/api/history/period/{encoded_start}',
                    params=params,
                )
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPStatusError as error:
            raise HAClientError(
                f'Home Assistant 历史数据返回 HTTP {error.response.status_code}。'
            ) from error
        except (httpx.HTTPError, ValueError) as error:
            raise HAClientError(f'无法读取 Home Assistant 历史数据：{error}') from error
        if not isinstance(payload, list) or not payload or not isinstance(payload[0], list):
            return []
        return [item for item in payload[0] if isinstance(item, dict)]
