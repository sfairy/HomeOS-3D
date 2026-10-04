"""Home Assistant 的底层访问客户端（REST + WebSocket）。"""

from __future__ import annotations

import asyncio
import json
import ssl
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Any
from urllib.parse import quote, urlparse, urlunparse

import httpx
import websockets


class HAClientError(RuntimeError):

    pass


def normalize_base_url(value: str) -> str:
    """把用户输入的 HA 地址归一成基地址，并在源头挡掉不可用的写法。

    去首尾空白与末尾斜杠；拒绝含空白字符、反斜杠或端口不在 1..65535 的写法；必须是
    http/https 且带主机名；不接受账号密码、查询串与锚点 —— 这些字段一旦混进基地址，
    后续拼接出来的 URL 会静默指向别处。
    """
    candidate = value.strip().rstrip('/')
    try:
        parsed = urlparse(candidate)
        port = parsed.port
    except ValueError as error:
        raw = '地址或端口格式不正确；IPv6 地址请放在方括号内。'
        raise HAClientError(raw) from error
    if (
        any(c.isspace() for c in candidate)
        or '\\' in candidate
        or (port is not None and not 1 <= port <= 65535)
    ):
        raise HAClientError('请填写有效地址，端口应在 1 到 65535 之间。')
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        raise HAClientError('Home Assistant 地址必须是完整的 http 或 https URL。')
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HAClientError('Home Assistant 地址不能包含账号、密码、查询参数或锚点。')
    path = parsed.path.rstrip('/')
    return urlunparse((parsed.scheme, parsed.netloc, path, '', '', ''))


def websocket_url(base_url: str) -> str:
    """由 REST 基地址推出 WebSocket 端点：同主机端口，协议换 ws/wss，路径加 ``/api/websocket``。"""
    parsed = urlparse(base_url)
    scheme = 'wss' if parsed.scheme == 'https' else 'ws'
    path = f"{parsed.path.rstrip('/')}/api/websocket"
    return urlunparse((scheme, parsed.netloc, path, '', '', ''))


def is_ipv6_literal(base_url: str) -> bool:
    """返回该 URL 是否直接指向 IPv6 地址。

    IPv6 字面量无法通过本地部署常用的仅 IPv4 代理访问，
    因此这些目标必须绕过环境代理。
    """
    hostname = urlparse(base_url).hostname
    if not hostname:
        return False
    try:
        return ip_address(hostname).version == 6
    except ValueError:
        return False


def bypass_env_proxy(base_url: str) -> bool:
    """返回该目标是否必须绕过环境代理直连。

    本机 / 局域网内的 Home Assistant 不应经由为公网设计的环境代理访问：环境里配置的
    代理（常见为 socks5）既到不了内网，还会让 websockets 直接报错 —— ws:// 的代理探测
    顺序是 ws → socks → https → http，一旦命中 socks 而环境又没装 python-socks，每一轮
    同步都会抛 ImportError。IPv6 字面量同样走不通仅 IPv4 的代理，保留原有行为。
    """
    hostname = urlparse(base_url).hostname
    if not hostname:
        return False
    if is_ipv6_literal(base_url):
        return True
    if hostname.lower() == 'localhost' or hostname.lower().endswith(('.local', '.lan')):
        return True
    try:
        address = ip_address(hostname)
    except ValueError:
        return False
    return address.is_private or address.is_loopback or address.is_link_local


@dataclass(slots=True)
class HASnapshot:
    """一次全量对账所需的全部 HA 侧数据。

    ``config`` 来自 ``test_connection``（版本、位置名、时区），``states`` 来自
    ``get_states``，其余四个字段是实体 / 设备 / 区域 / 服务注册表。

    注册表字段用「None 与 [] 区分语义」：None 表示这次没取到（HA 版本不支持该命令或
    调用失败），同步层据此跳过「标记缺失」，避免把整个目录误判为已删除；[] 是权威的空结果。
    """

    config: dict[str, Any]
    states: list[dict[str, Any]]
    entities: list[dict[str, Any]] | None
    devices: list[dict[str, Any]] | None
    areas: list[dict[str, Any]] | None
    services: list[dict[str, Any]] | None


class HAClient:

    def __init__(
        self,
        base_url: str,
        access_token: str,
        verify_tls: bool = True,
        timeout: float = 10,
        websocket_max_size_bytes: int = 67108864,
    ) -> None:
        self.base_url = normalize_base_url(base_url)
        self.access_token = access_token
        self.verify_tls = verify_tls
        self.timeout = timeout
        self.websocket_max_size_bytes = max(int(websocket_max_size_bytes), 8388608)
        self._bypass_env_proxy = bypass_env_proxy(self.base_url)

    @property
    def headers(self) -> dict[str, str]:
        return {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json',
        }

    async def test_connection(
        self, *, include_temperature_unit: bool = False
    ) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(
                verify=self.verify_tls,
                timeout=self.timeout,
                headers=self.headers,
                trust_env=not self._bypass_env_proxy,
            ) as client:
                response = await client.get(f'{self.base_url}/api/config')
                response.raise_for_status()
                try:
                    config = response.json()
                except ValueError as error:
                    raise HAClientError(
                        '该地址返回了网页或无效数据，请填写 Home Assistant 服务地址，并检查反向代理登录限制。'
                    ) from error
                if not isinstance(config, dict) or not config.get('version'):
                    raise HAClientError('该地址未返回有效的 Home Assistant 配置，请检查服务地址及反向代理。')
        except httpx.HTTPStatusError as error:
            if error.response.status_code in {401, 403}:
                raise HAClientError('Home Assistant Token 无效或权限不足。') from error
            raise HAClientError(f'Home Assistant 返回 HTTP {error.response.status_code}。') from error
        except (httpx.HTTPError, ValueError) as error:
            raise HAClientError(f'无法连接 Home Assistant：{error}') from error
        return {
            'version': str(config.get('version', '')),
            'locationName': str(config.get('location_name', 'Home Assistant')),
            'timeZone': str(config.get('time_zone', '')),
            **(
                {'temperatureUnit': (config.get('unit_system') or {}).get('temperature')}
                if include_temperature_unit
                else {}
            ),
        }

    async def fetch_states(
        self,
        entity_ids: set[str] | list[str] | tuple[str, ...],
    ) -> list[dict[str, Any]]:
        requested = sorted({str(value) for value in entity_ids if str(value)})
        if not requested:
            return []
        semaphore = asyncio.Semaphore(8)
        async with httpx.AsyncClient(
            verify=self.verify_tls,
            timeout=self.timeout,
            headers=self.headers,
            trust_env=not self._bypass_env_proxy,
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
                    return payload if isinstance(payload, dict) else None

            results = await asyncio.gather(*(fetch_one(entity_id) for entity_id in requested))
        return [item for item in results if item is not None]

    def _ssl_context(self):
        if not websocket_url(self.base_url).startswith('wss://'):
            return None
        # verify_tls=False 是用户在高级设置中针对自签名证书的显式选择，默认路径使用 create_default_context。
        return ssl.create_default_context() if self.verify_tls else ssl._create_unverified_context()  # noqa: S323

    async def _authenticate(self, websocket) -> None:
        try:
            required = json.loads(await websocket.recv())
            if not isinstance(required, dict) or required.get('type') != 'auth_required':
                raise HAClientError('Home Assistant WebSocket 未返回鉴权请求。')
            await websocket.send(json.dumps({
                'type': 'auth',
                'access_token': self.access_token,
            }))
            result = json.loads(await websocket.recv())
        except (json.JSONDecodeError, websockets.WebSocketException) as error:
            raise HAClientError(f'Home Assistant WebSocket 鉴权失败：{error}') from error
        if not isinstance(result, dict) or result.get('type') != 'auth_ok':
            raise HAClientError('Home Assistant WebSocket Token 无效或鉴权失败。')

    async def connect_websocket(self):
        try:
            websocket = await websockets.connect(
                websocket_url(self.base_url),
                ssl=self._ssl_context(),
                proxy=None if self._bypass_env_proxy else True,
                open_timeout=self.timeout,
                ping_interval=20,
                ping_timeout=20,
                max_size=self.websocket_max_size_bytes,
                max_queue=4,
            )
        except ImportError as error:
            # 命中 SOCKS 代理但环境缺 python-socks（见 bypass_env_proxy 的说明）。
            raise HAClientError(
                '当前环境通过 SOCKS 代理连接 Home Assistant，但缺少 python-socks 依赖；'
                '内网地址应直连，请检查代理设置。'
            ) from error
        except (OSError, TimeoutError, websockets.WebSocketException) as error:
            if 'message too big' in str(error).lower() or '1009' in str(error):
                maximum_mb = self.websocket_max_size_bytes // 1048576
                raise HAClientError(
                    f'Home Assistant 返回的单条数据超过 {maximum_mb} MB，'
                    '请提高 APP_HA_WEBSOCKET_MAX_SIZE_BYTES 或减少异常庞大的实体属性。'
                ) from error
            raise HAClientError(f'无法建立 Home Assistant WebSocket：{error}') from error

        try:
            async with asyncio.timeout(self.timeout):
                await self._authenticate(websocket)
        except BaseException:
            await websocket.close()
            raise
        return websocket

    async def command(self, websocket, message_id: int, command_type: str, **payload) -> Any:
        await websocket.send(json.dumps({'id': message_id, 'type': command_type, **payload}))
        while True:
            try:
                message = json.loads(await websocket.recv())
            except websockets.WebSocketException as error:
                if (
                    getattr(error, 'code', None) == 1009
                    or 'message too big' in str(error).lower()
                    or '1009' in str(error)
                ):
                    maximum_mb = self.websocket_max_size_bytes // 1048576
                    raise HAClientError(
                        f'Home Assistant 命令 {command_type} 返回的单条数据超过 {maximum_mb} MB，'
                        '请提高 APP_HA_WEBSOCKET_MAX_SIZE_BYTES 或减少异常庞大的实体属性。'
                    ) from error
                raise HAClientError(
                    f'Home Assistant 命令 {command_type} 连接中断：{error}'
                ) from error
            if message.get('id') != message_id:
                continue
            if message.get('type') != 'result' or not message.get('success'):
                error = message.get('error') or {}
                raise HAClientError(str(error.get('message') or f'HA 命令 {command_type} 执行失败。'))
            return message.get('result')

    @staticmethod
    async def subscribe_events(
        websocket,
        event_types: tuple[str, ...],
        start_id: int = 100,
        required_event_types: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        required = required_event_types if required_event_types is not None else set(event_types)
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

    async def fetch_all_states(self) -> list[dict[str, Any]]:
        websocket = await self.connect_websocket()
        try:
            states = await self.command(websocket, 1, 'get_states')
            return [item for item in (states or []) if isinstance(item, dict)]
        finally:
            await websocket.close()

    async def fetch_snapshot(self) -> HASnapshot:
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
                    optional_results.append(None)
            entities, devices, areas = optional_results
        finally:
            await websocket.close()
        config = await self.test_connection()
        return HASnapshot(
            config=config,
            states=list(states or []),
            entities=list(entities or []) if entities is not None else None,
            devices=list(devices or []) if devices is not None else None,
            areas=list(areas or []) if areas is not None else None,
            services=None,
        )

    async def fetch_registries(
        self,
    ) -> tuple[
        list[dict[str, Any]] | None,
        list[dict[str, Any]] | None,
        list[dict[str, Any]] | None,
    ]:
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
        requested = sorted({str(item).strip() for item in integrations if str(item).strip()})
        websocket = await self.connect_websocket()
        resources = {}
        try:
            try:
                component_result = await self.command(
                    websocket, 1, 'frontend/get_translations',
                    language=language, category='entity_component',
                )
            except HAClientError:
                component_result = {}
            component_payload = (
                component_result.get('resources', component_result)
                if isinstance(component_result, dict)
                else {}
            )
            for key, value in component_payload.items():
                if isinstance(key, str) and isinstance(value, str):
                    resources[key] = value
            for message_id, integration in enumerate(requested, start=2):
                try:
                    result = await self.command(
                        websocket, message_id, 'frontend/get_translations',
                        language=language, category='entity', integration=integration,
                    )
                except HAClientError:
                    continue
                payload = result.get('resources', result) if isinstance(result, dict) else {}
                for key, value in payload.items():
                    if isinstance(key, str) and isinstance(value, str):
                        resources[key] = value
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
        payload = {**data, 'entity_id': entity_id}
        try:
            async with httpx.AsyncClient(
                verify=self.verify_tls,
                timeout=self.timeout,
                headers=self.headers,
                trust_env=not self._bypass_env_proxy,
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
        """浏览 Home Assistant 中某个媒体播放器实体的媒体源。"""
        payload = {'media_content_id': media_content_id}
        websocket = await self.connect_websocket()
        try:
            return await self.command(websocket, 1, 'media_source/browse_media', **payload)
        finally:
            await websocket.close()

    async def browse_player_media(
        self,
        entity_id: str,
        media_content_id: str = '',
        media_content_type: str | None = None,
    ) -> Any:
        """使用集成自带的媒体库；content id 为空时请求其根目录。"""
        payload = {'entity_id': entity_id}
        if media_content_id:
            payload['media_content_id'] = media_content_id
        if media_content_type:
            payload['media_content_type'] = media_content_type
        websocket = await self.connect_websocket()
        try:
            return await self.command(websocket, 1, 'media_player/browse_media', **payload)
        finally:
            await websocket.close()

    async def fetch_history(self, entity_id: str, start_time: str) -> list[dict[str, Any]]:
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
                trust_env=not self._bypass_env_proxy,
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
