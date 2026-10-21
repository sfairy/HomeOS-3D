"""Home Assistant 的底层访问客户端（REST + WebSocket）。"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import ssl
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Any
from urllib.parse import quote, urlparse, urlunparse

import httpx

from .control_pool import HAControlConfiguration, HAControlPool
from .errors import endpoint_failure_reason
from .http_pool import HAHttpClientPool, HAHttpConfiguration


def _websockets():
    """延迟导入 ``websockets``。

    只有真正建立 / 复用 HA WebSocket 连接时才需要它，但模块级 import 会把它约 20 ms
    的导入链（asyncio client + exceptions + typing）算进每次冷启动；REST-only 的部署
    根本用不到。异常元组里的调用只在异常真正抛出时才求值，因此不会在热路径上反复导入
    （首次之后就是 ``sys.modules`` 字典命中）。
    """
    import websockets

    return websockets


#: 必须挂在 ``homeos`` 树下：主应用的控制台 handler 只装在 ``homeos.*`` 与 uvicorn 上，
#: 用 ``__name__`` 会得到 ``src.*``，冒到没有 handler 的 root 后走 ``logging.lastResort``
#: （裸消息写 stderr、只放行 WARNING 以上）。
LOGGER = logging.getLogger("homeos.ha_rest")


class HAClientError(RuntimeError):

    pass


class HAAuthError(HAClientError):
    """凭据层面的失败：令牌无效 / 权限不足（HTTP 401/403、WS auth_invalid）。

    单独成类是为了让重连循环能区分「换令牌才有救」和「网络恢复就好」——两者的提示语
    与用户动作完全不同。继承 ``HAClientError``，既有的捕获点语义不变。
    """


class HAProtocolError(HAClientError):
    """协议层面的失败：对端答非所问（缺 auth_required、单条数据超限）。

    通常意味着地址指向的不是 HA 本体（反代登录页）或版本/配置不匹配，重试无用。
    """


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


def _response_reports_unavailable(body: Any, entity_id: str) -> bool:
    """判断服务调用响应是否显示目标实体处于 ``unavailable``。

    HA 的 ``/api/services`` 对不可用实体同样返回 200，只是把该实体跳过；响应体是
    「受本次调用影响的实体」状态列表（元素可能包在 ``states`` / ``changed_states`` 键里）。
    """
    if not entity_id:
        return False

    def _iter_states(value: Any):
        if isinstance(value, list):
            for item in value:
                yield from _iter_states(item)
        elif isinstance(value, dict):
            for key in ("states", "changed_states"):
                nested = value.get(key)
                if isinstance(nested, list):
                    yield from _iter_states(nested)
            if "entity_id" in value or "state" in value:
                yield value

    for state in _iter_states(body):
        if not isinstance(state, dict) or state.get("entity_id") != entity_id:
            continue
        # 仅把 unavailable 视为失败：button/script 等实体的正常态就是 unknown，
        # 一律判失败会误伤合法调用。
        if str(state.get("state") or "").lower() == "unavailable":
            return True
    return False


def bypass_environment_proxy(base_url: str) -> bool:
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


#: 走 HA **WebSocket 命令**（而不是 ``/api/services``）的操作。
#:
#: 这些动作在 HA 里只有 WS 命令、没有同名服务；0.7.8 把它们统一收进
#: :meth:`HAClient.call_service`，于是前端不需要知道"这个服务其实走 WS"。
WEBSOCKET_OPERATIONS: dict[tuple[str, str], str] = {
    ('calendar', 'delete_event'): 'calendar/event/delete',
    ('calendar', 'update_event'): 'calendar/event/update',
    ('todo', 'move_item'): 'todo/item/move',
    ('update', 'release_notes'): 'update/release_notes',
    ('media_player', 'search_media'): 'media_player/search_media',
    ('wake_word', 'info'): 'wake_word/info',
    ('stt', 'info'): 'stt/engine/list',
    ('radio_frequency', 'info'): 'radio_frequency/list',
}
#: 需要 ``?return_response`` 的服务：HA 只对列表里的服务返回响应体。
RESPONSE_SERVICES = frozenset(
    {
        ('todo', 'get_items'),
        ('ai_task', 'generate_data'),
        ('ai_task', 'generate_image'),
        ('weather', 'get_forecasts'),
        ('calendar', 'get_events'),
        ('conversation', 'process'),
        ('assist_satellite', 'ask_question'),
    }
)
#: 慢服务统一超时（秒）：AI 生成、语音提问、固件安装都可能跑几十秒。
SLOW_SERVICE_TIMEOUT = 115
#: 生成图片允许回传的最大字节数（再大就不是"预览"了）。
GENERATED_IMAGE_MAX_BYTES = 4194304
#: 生成图片允许的 MIME。
GENERATED_IMAGE_TYPES = frozenset({'image/gif', 'image/png', 'image/jpeg', 'image/webp'})
#: 生成图片 URL 只允许 HA 自己的相对路径（防 SSRF / 路径穿越）。
GENERATED_IMAGE_PREFIXES = ('/ai_task/', '/media/', '/api/ai_task/')


#: 动作型服务：每次执行都会改变状态，传输层失败后重放可能把用户意图反转。
_NON_IDEMPOTENT_SERVICES = frozenset({
    'play_pause',
    'media_play_pause',
    'next',
    'previous',
    'next_track',
    'previous_track',
    'shuffle_set',
    'cycle',
    'increase_speed',
    'decrease_speed',
    'open_cover',
    'close_cover',
    'stop_cover',
    'lock',
    'unlock',
    'open',
    'close',
})


def _service_call_retry_safe(domain: str, service: str) -> bool:
    """该服务在 HA 层面是否幂等（重复下发不会产生额外副作用）。

    只有幂等调用才允许在传输层失败后重放一次。``toggle`` / ``play_pause`` 等动作型
    服务每次执行都会改变状态，重放会把「开」变「关」，因此一律不重试。
    """
    if service in _NON_IDEMPOTENT_SERVICES:
        return False
    return not service.startswith('toggle')


def _remote_learning_timeout(data: dict[str, Any]) -> float:
    """学习红外/射频指令的超时：一条指令码通常要按下再等待，按条数放大。

    与前端 ``control-timeout.ts`` 同一套算法（前端用来决定"按钮转圈多久"，
    后端用来决定"HTTP 请求等多久"），差一个常数就出现"前端已超时、后端还在等"。
    """
    wait = data.get('timeout')
    if not isinstance(wait, (int, float)) or isinstance(wait, bool) or not math.isfinite(wait) or wait <= 0:
        wait = 60
    commands = data.get('command')
    count = max(1, min(64, len(commands))) if isinstance(commands, list) else 1
    phases = 2 if data.get('command_type') == 'rf' else 1
    return min(60, wait) * count * phases + 15


class HAClient:

    def __init__(
        self,
        base_url: str,
        access_token: str,
        verify_tls: bool = True,
        timeout: float = 10,
        websocket_max_size_bytes: int = 67108864,
        *,
        control_pool: HAControlPool | None = None,
        control_connection_id: str | None = None,
        http_pool: HAHttpClientPool | None = None,
        ws_ping_interval: float | None = None,
        ws_ping_timeout: float | None = None,
        use_subscribe_entities: bool = False,
        subscribe_entities_shadow: bool = False,
    ) -> None:
        self.base_url = normalize_base_url(base_url)
        self.access_token = access_token
        self.verify_tls = verify_tls
        self.timeout = timeout
        self.websocket_max_size_bytes = max(int(websocket_max_size_bytes), 8388608)
        self._bypass_environment_proxy = bypass_environment_proxy(self.base_url)
        # WebSocket 应用层心跳（秒），由 haConnector 高级参数注入
        # （wsPingIntervalMs / wsPongTimeoutMs，见 HAConnectorService.client_for）。
        # None 表示沿用 websockets 库默认（20s / 20s）。
        self.ws_ping_interval = ws_ping_interval
        self.ws_ping_timeout = ws_ping_timeout
        # ``subscribe_entities`` 压缩协议（haConnector.useSubscribeEntities）：
        # 关闭时沿用 subscribe_events(state_changed)，这是可回滚的 feature flag。
        self.use_subscribe_entities = bool(use_subscribe_entities)
        #: 诊断期影子对比：额外订阅 state_changed，仅用于校验压缩解码，不参与下游派发。
        self.subscribe_entities_shadow = bool(subscribe_entities_shadow)
        # control_pool 非空时，控制类请求（调服务）走共享连接池，由 HAControlPool 决定
        # 是否复用已有连接、何时淘汰；缺省 None 表示每次新建（测试与一次性脚本的用法）。
        self._control_pool = control_pool
        # 连接池按「连接」隔离：同一个 HA 实例的两条连接记录不能共用同一条长连接。
        self._control_connection_id = control_connection_id
        # http_pool 非空时，读取类请求（探测 / 状态 / 历史）复用共享 client（keep-alive）；
        # 缺省 None 表示每次新建，保持测试与一次性脚本的既有语义。
        self._http_pool = http_pool

    @property
    def headers(self) -> dict[str, str]:
        return {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json',
        }

    @property
    def http_configuration(self) -> HAHttpConfiguration:
        """读取类请求的共享池租约参数（令牌走请求头，不进池键）。"""
        return HAHttpConfiguration(
            verify_tls=self.verify_tls,
            trust_env=not self._bypass_environment_proxy,
        )

    @asynccontextmanager
    async def _http_client(self) -> AsyncGenerator[httpx.AsyncClient]:
        """读取类请求的客户端来源：有池走池（keep-alive 复用），无池每次新建。

        池里的 client 只固定传输参数（TLS / 代理 / 连接数上限），因此 ``headers`` 与
        ``timeout`` 必须逐请求传 —— 一次性客户端路径也照此写，两条路径的语义才一致。
        """
        if self._http_pool is not None:
            async with self._http_pool.lease(self.http_configuration) as client:
                yield client
            return
        async with httpx.AsyncClient(
            verify=self.verify_tls,
            timeout=self.timeout,
            headers=self.headers,
            trust_env=not self._bypass_environment_proxy,
        ) as client:
            yield client

    async def test_connection(
        self, *, include_temperature_unit: bool = False
    ) -> dict[str, Any]:
        try:
            async with self._http_client() as client:
                response = await client.get(
                    f'{self.base_url}/api/config',
                    headers=self.headers,
                    timeout=self.timeout,
                )
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
                raise HAAuthError('Home Assistant Token 无效或权限不足。') from error
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
        """批量拉取实体状态（逐实体容错）。

        单个实体拉取失败（读超时 / 5xx / 瞬时网络错误）只记日志并跳过该实体，**不再让异常冒泡**。

        为什么必须逐实体容错：调用方 ``HAConnectionService.ensure_entity_states`` 处在实时推送
        链路上（``api/ha.py`` 的 ``send_updates``）。曾经一次针对单个实体的 ReadTimeout 经
        ``asyncio.gather`` 冒泡后，会把整条 runtime WebSocket 拆掉——客户端重连、**全部**实体的
        推送都断掉；而真正损失的只是那一个实体的一次刷新，下一轮重试或 HA 的事件推送都会补上。
        ``asyncio.gather`` 默认在首个异常处短路，其余并发请求的返回值一并被丢弃，因此这里显式用
        ``return_exceptions=True`` 收集，再逐条判定。

        注：实体已不存在（404）返回 ``None`` 并跳过，与失败同样不产生异常。
        """
        requested = sorted({str(value) for value in entity_ids if str(value)})
        if not requested:
            return []
        wanted = set(requested)
        # 批量路径：一次 GET /api/states，再本地过滤。实体较多时显著减少 HA 往返。
        if len(requested) >= 4:
            try:
                async with self._http_client() as client:
                    response = await client.get(
                        f'{self.base_url}/api/states',
                        headers=self.headers,
                        timeout=self.timeout,
                    )
                    if response.status_code in {401, 403}:
                        raise HAAuthError('Home Assistant Token 无效或权限不足。')
                    response.raise_for_status()
                    payload = response.json()
                if isinstance(payload, list):
                    return [
                        item
                        for item in payload
                        if isinstance(item, dict) and str(item.get('entity_id') or '') in wanted
                    ]
            except HAClientError:
                raise
            except (httpx.HTTPError, ValueError) as error:
                # 回退成功时没有用户可操作的信息；真失败会在下面聚合成一行 WARNING。
                LOGGER.debug('批量拉取 /api/states 失败，回退逐实体：%s', error)

        semaphore = asyncio.Semaphore(8)
        async with self._http_client() as client:

            async def fetch_one(entity_id: str) -> dict[str, Any] | None:
                """拉取单个实体的状态；实体已不存在时返回 None 而不是抛错。"""
                async with semaphore:
                    try:
                        response = await client.get(
                            f'{self.base_url}/api/states/{quote(entity_id, safe="")}',
                            headers=self.headers,
                            timeout=self.timeout,
                        )
                        if response.status_code == 404:
                            return None
                        response.raise_for_status()
                        payload = response.json()
                    except httpx.HTTPStatusError as error:
                        if error.response.status_code in {401, 403}:
                            raise HAAuthError('Home Assistant Token 无效或权限不足。') from error
                        raise HAClientError(f'Home Assistant 返回 HTTP {error.response.status_code}。') from error
                    except (httpx.HTTPError, ValueError) as error:
                        raise HAClientError(f'无法获取 Home Assistant 实体 {entity_id}：{error}') from error
                    return payload if isinstance(payload, dict) else None

            results = await asyncio.gather(
                *(fetch_one(entity_id) for entity_id in requested),
                return_exceptions=True,
            )

        states: list[dict[str, Any]] = []
        failed: list[tuple[str, BaseException]] = []
        for entity_id, result in zip(requested, results, strict=True):
            if isinstance(result, BaseException):
                failed.append((entity_id, result))
                continue
            if result is not None:
                states.append(result)
        if failed:
            # 逐实体刷 WARNING 会在大批量实体时刷满控制台（一次 400 条），这里压成一行：
            # 列前三个实体 + 总数 + 一句原因，逐实体明细留在 DEBUG。
            causes = {reason.__cause__ or reason for _, reason in failed}
            detail = (
                endpoint_failure_reason(next(iter(causes))) if len(causes) == 1 else '原因不一，详见 DEBUG 日志'
            )
            sample = '、'.join(entity_id for entity_id, _ in failed[:3])
            count = f' 等 {len(failed)} 个实体' if len(failed) > 3 else ''
            LOGGER.warning('拉取 Home Assistant 实体状态失败，已跳过%s%s（%s）', sample, count, detail)
            for entity_id, reason in failed:
                LOGGER.debug('实体状态拉取失败：%s（%s）', entity_id, reason)
        return states

    def _ssl_context(self):
        if not websocket_url(self.base_url).startswith('wss://'):
            return None
        # verify_tls=False 是用户在高级设置中针对自签名证书的显式选择，默认路径使用 create_default_context。
        return ssl.create_default_context() if self.verify_tls else ssl._create_unverified_context()  # noqa: S323

    async def _authenticate(self, websocket) -> None:
        try:
            required = json.loads(await websocket.recv())
            if not isinstance(required, dict) or required.get('type') != 'auth_required':
                raise HAProtocolError('Home Assistant WebSocket 未返回鉴权请求。')
            await websocket.send(json.dumps({
                'type': 'auth',
                'access_token': self.access_token,
            }))
            result = json.loads(await websocket.recv())
        except (json.JSONDecodeError, _websockets().WebSocketException) as error:
            raise HAClientError(f'Home Assistant WebSocket 鉴权失败：{error}') from error
        if not isinstance(result, dict) or result.get('type') != 'auth_ok':
            raise HAAuthError('Home Assistant WebSocket Token 无效或鉴权失败。')

    async def connect_websocket(self):
        try:
            websocket = await _websockets().connect(
                websocket_url(self.base_url),
                ssl=self._ssl_context(),
                proxy=None if self._bypass_environment_proxy else True,
                open_timeout=self.timeout,
                ping_interval=20 if self.ws_ping_interval is None else self.ws_ping_interval,
                ping_timeout=20 if self.ws_ping_timeout is None else self.ws_ping_timeout,
                max_size=self.websocket_max_size_bytes,
                max_queue=4,
            )
        except ImportError as error:
            # 命中 SOCKS 代理但环境缺 python-socks（见 bypass_environment_proxy 的说明）。
            raise HAClientError(
                '当前环境通过 SOCKS 代理连接 Home Assistant，但缺少 python-socks 依赖；'
                '内网地址应直连，请检查代理设置。'
            ) from error
        except (OSError, TimeoutError, _websockets().WebSocketException) as error:
            if 'message too big' in str(error).lower() or '1009' in str(error):
                maximum_mb = self.websocket_max_size_bytes // 1048576
                raise HAProtocolError(
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
            except _websockets().WebSocketException as error:
                if (
                    getattr(error, 'code', None) == 1009
                    or 'message too big' in str(error).lower()
                    or '1009' in str(error)
                ):
                    maximum_mb = self.websocket_max_size_bytes // 1048576
                    raise HAProtocolError(
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

    async def subscribe_entities(self, websocket, start_id: int = 200) -> list[dict[str, Any]]:
        """订阅压缩状态流（``subscribe_entities``）。

        返回握手期间读到的其它事件（例如同时订阅的注册表事件），交给调用方按原路径分派；
        首帧全量 ``a`` 事件会正常落在后续的 ``recv`` 循环里。

        协议细节：HA 先回 ``result``，紧接着在同一回调里推送首帧全量状态，
        因此这里只需要等到 ``result``；把期间读到的 ``event`` 消息一并带回即可。
        """
        message_id = start_id
        await websocket.send(json.dumps({'id': message_id, 'type': 'subscribe_entities'}))
        buffered_events: list[dict[str, Any]] = []
        while True:
            try:
                message = json.loads(await websocket.recv())
            except _websockets().WebSocketException as error:
                raise HAClientError(f'订阅 HA 压缩状态流中断：{error}') from error
            except (TypeError, ValueError) as error:
                raise HAProtocolError('订阅 HA 压缩状态流时收到非法 JSON。') from error
            if not isinstance(message, dict):
                continue
            if message.get('type') == 'event':
                buffered_events.append(message)
                continue
            if message.get('id') != message_id:
                continue
            if message.get('type') != 'result' or not message.get('success'):
                error = message.get('error') or {}
                raise HAClientError(str(error.get('message') or '订阅 HA 压缩状态流失败。'))
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

    @property
    def control_configuration(self) -> HAControlConfiguration:
        """本客户端对应的连接池租约参数（由 ``HAControlPool`` 消费）。"""
        return HAControlConfiguration(
            connection_id=self._control_connection_id,
            base_url=self.base_url,
            access_token=self.access_token,
            verify_tls=self.verify_tls,
            timeout=self.timeout,
            trust_env=not self._bypass_environment_proxy,
        )

    @asynccontextmanager
    async def _control_http_client(self):
        """控制类请求的 httpx 客户端来源：有池走池，无池每次新建。"""
        if self._control_pool is not None:
            async with self._control_pool.lease(self.control_configuration) as client:
                yield client
            return
        async with httpx.AsyncClient(
            verify=self.verify_tls,
            timeout=self.timeout,
            headers=self.headers,
            trust_env=not self._bypass_environment_proxy,
        ) as client:
            yield client

    async def call_service(
        self,
        domain: str,
        service: str,
        entity_id: str,
        data: dict[str, Any],
        return_response: bool = False,
    ) -> Any:
        """调用 HA 服务（开灯、设温度、执行脚本等）。

        ``entity_id`` 在展开之后覆盖：强制以本参数为准，防止 ``data`` 里夹带另一个实体。

        ``return_response`` 供**只返回响应型**服务使用（如 ``weather.get_forecasts``）：
        HA 要求以 ``?return_response`` 查询参数发起，缺失时直接回 HTTP 400。注意它必须是
        查询参数而非 body 字段，否则会被当成 service_data 的多余键而校验失败。

        0.7.8 起还兜住三类"非标准 REST"的服务：

        - **WS 命令**（``WEBSOCKET_OPERATIONS``）：日历删除/更新、待办移动、更新说明、
          媒体搜索、语音引擎列表；
        - **慢服务**（AI 生成 / 语音提问 / 固件安装）：超时放大到 ``SLOW_SERVICE_TIMEOUT``；
        - **``ai_task.generate_image``**：HA 只回一个相对 URL，图片本体要再取一次并按
          ``data:`` URL 塞回 ``service_response["image"]``（4 MiB 上限，防误把大文件塞进前端）。
        """
        operation = WEBSOCKET_OPERATIONS.get((domain, service))
        if operation is not None:
            return await self._call_websocket_operation(
                operation, domain, service, entity_id, data
            )
        if (domain, service) == ('calendar', 'list_events'):
            # 日历查询在 HA 里是 REST 端点（``/api/calendars/<entity>``），不是服务。
            async with self._control_http_client() as client:
                response = await client.get(
                    f'{self.base_url}/api/calendars/{entity_id}', params=data
                )
                response.raise_for_status()
                return response.json()
        payload = {**data}
        # ``conversation.process`` 认的是 ``agent_id`` 而不是 ``entity_id``。
        payload['agent_id' if domain == 'conversation' else 'entity_id'] = entity_id
        suffix = '?return_response' if (domain, service) in RESPONSE_SERVICES else ''
        url = f'{self.base_url}/api/services/{domain}/{service}{suffix}'
        timeout: float = self.timeout
        if domain == 'ai_task' or (domain == 'assist_satellite' and service == 'ask_question') or (
            domain == 'update' and service == 'install'
        ):
            timeout = max(self.timeout, SLOW_SERVICE_TIMEOUT)
        if (domain, service) == ('remote', 'learn_command'):
            timeout = max(self.timeout, _remote_learning_timeout(data))
        try:
            # 安全重试一次：连接池复用到「对端已关闭」的 keep-alive 时，httpcore 会在
            # 读响应阶段抛 RemoteProtocolError —— 用户看到的就是「闲置一段时间后
            # 第一次点击失败」。这类失败**可能**已经把请求写出去了，所以只对 HA 层面
            # 幂等的服务重试（toggle / play_pause 这类动作型服务绝不重放）。
            for attempt in range(2):
                try:
                    async with self._control_http_client() as client:
                        response = await client.post(url, json=payload, timeout=timeout)
                        response.raise_for_status()
                        result = response.json()
                        if (domain, service) == ('ai_task', 'generate_image'):
                            result = await self._inline_generated_image(client, result)
                    break
                except (httpx.ConnectError, httpx.RemoteProtocolError) as transport_error:
                    if attempt == 0 and _service_call_retry_safe(domain, service):
                        LOGGER.debug(
                            'HA 服务调用复用了已断开的连接，重试一次：%s.%s', domain, service
                        )
                        continue
                    raise HAClientError(
                        f'Home Assistant 服务调用失败：{transport_error}'
                    ) from transport_error
        except httpx.HTTPStatusError as error:
            if error.response.status_code in {401, 403}:
                raise HAAuthError('Home Assistant Token 无效或权限不足。') from error
            raise HAClientError(
                f'Home Assistant 服务调用返回 HTTP {error.response.status_code}。'
            ) from error
        except TimeoutError as error:
            raise HAClientError('Home Assistant 操作超时。') from error
        except (httpx.HTTPError, ValueError) as error:
            raise HAClientError(f'Home Assistant 服务调用失败：{error}') from error
        # HA 对不可用实体同样返回 HTTP 200（只是把该实体跳过），仅看状态码会把
        # 「设备离线、指令根本没执行」误判为成功；这里按响应中的实体状态复核，
        # 命中 unavailable 直接判失败，交由上层重试/回滚/提示。
        if _response_reports_unavailable(result, entity_id):
            raise HAClientError(f'实体 {entity_id} 当前不可用（unavailable），服务 {domain}.{service} 未生效。')
        return result

    async def _call_websocket_operation(
        self,
        operation: str,
        domain: str,
        service: str,
        entity_id: str,
        data: dict[str, Any],
    ) -> Any:
        """执行一条 HA WebSocket 命令，并保留 REST 通道的错误语义。"""
        # ``calendar.update_event`` 的 ``start``/``end`` 在 WS 命令里叫
        # ``dtstart``/``dtend``；两者同时出现说明前端传了两套时间，直接拒。
        if (domain, service) == ('calendar', 'update_event') and isinstance(data.get('event'), dict):
            event = data['event']
            if 'start' in event or 'end' in event:
                if 'dtstart' in event or 'dtend' in event:
                    raise HAClientError('日程时间字段重复，请检查输入。')
                data = {
                    **data,
                    'event': {
                        {'start': 'dtstart', 'end': 'dtend'}.get(key, key): value
                        for key, value in event.items()
                    },
                }
        # ``stt`` / ``radio_frequency`` 的列表命令返回整张表，需要按实体筛出一行。
        scoped = domain not in {'stt', 'radio_frequency'}
        websocket = await self.connect_websocket()
        try:
            async with asyncio.timeout(self.timeout):
                result = await self.command(
                    websocket,
                    1,
                    operation,
                    **({'entity_id': entity_id} if scoped else {}),
                    **data,
                )
        except TimeoutError as error:
            raise HAClientError('Home Assistant 操作超时。') from error
        finally:
            await websocket.close()
        if scoped:
            return result
        key = 'providers' if domain == 'stt' else 'transmitters'
        rows = result.get(key, []) if isinstance(result, dict) else []
        return next(
            (
                row
                for row in rows
                if isinstance(row, dict)
                and (
                    row.get('engine_id') == entity_id.partition('.')[2]
                    if domain == 'stt'
                    else row.get('entity_id') == entity_id
                )
            ),
            {},
        )

    async def _inline_generated_image(self, client: httpx.AsyncClient, result: Any) -> Any:
        """把 ``ai_task.generate_image`` 返回的相对 URL 取成 ``data:`` URL。

        HA 只回一个 ``/ai_task/...`` 或 ``/media/...`` 路径：直接交给前端会要求浏览器
        带着 HA 令牌去取，等于把令牌暴露给页面。这里在服务端取回（限 4 MiB、
        只接受图片 MIME），转成 base64 塞回响应。
        """
        generated = result.get('service_response', {}) if isinstance(result, dict) else {}
        image_url = generated.pop('url', None) if isinstance(generated, dict) else None
        if (
            not isinstance(image_url, str)
            or not image_url.startswith(GENERATED_IMAGE_PREFIXES)
            or '..' in image_url
            or '\\' in image_url
        ):
            raise HAClientError('Home Assistant 未返回可读取的生成图片。')
        async with client.stream('GET', f'{self.base_url}{image_url}') as picture:
            picture.raise_for_status()
            mime = picture.headers.get('content-type', '').split(';')[0].strip().lower()
            if mime not in GENERATED_IMAGE_TYPES:
                raise HAClientError('生成结果不是可显示的图片。')
            content = bytearray()
            async for chunk in picture.aiter_bytes():
                content.extend(chunk)
                if len(content) > GENERATED_IMAGE_MAX_BYTES:
                    raise HAClientError('生成图片超过预览大小限制。')
        generated['image'] = f'data:{mime};base64,' + base64.b64encode(content).decode('ascii')
        return result

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
            async with self._http_client() as client:
                response = await client.get(
                    f'{self.base_url}/api/history/period/{encoded_start}',
                    params=params,
                    headers=self.headers,
                    timeout=self.timeout,
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
