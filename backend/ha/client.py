"""Home Assistant 的底层访问客户端（REST + WebSocket）。

只负责「怎么和 HA 说话」，不碰数据库、不认识项目的实体/设备模型：地址一律先过
normalize_base_url；REST 用于读配置、批量取状态、调服务、拉历史；WebSocket 用于鉴权、
订阅事件、读注册表与翻译资源。

所有失败都统一包成 HAClientError 并带中文提示，由上层决定是提示用户还是记连接器日志。
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


class HAClientError(RuntimeError):
    """与 Home Assistant 交互失败（地址非法、鉴权失败、网络异常、返回超限等）。

    异常消息面向用户，直接可展示，因此不要在消息里塞内部细节或堆栈。
    """
    pass


#: 云元数据端点：SSRF 里最经典的目标，任何情况下都不该被当成 HA 地址。
#: AWS/GCP/Azure 用 169.254.169.254，ECS 用 169.254.170.2，IPv6 侧是 fd00:ec2::254。
METADATA_HOSTS = frozenset({'169.254.169.254', '169.254.170.2', 'fd00:ec2::254'})


def _host_ip(base_url: str):
    """取出地址里的 IP 字面量；是域名或解析不出时返回 None。"""
    hostname = urlparse(base_url).hostname
    if not hostname:
        return None
    try:
        return ip_address(hostname)
    except ValueError:
        return None


def metadata_address(base_url: str) -> str:
    """该地址是否指向云元数据端点；是则返回命中的地址，否则空串。

    同时识别 IPv4 映射形式的 IPv6（``::ffff:169.254.169.254``），否则换个写法就能绕过去。
    """
    host = _host_ip(base_url)
    if host is None:
        return ''
    candidates = {str(host)}
    if host.version == 6 and host.ipv4_mapped is not None:
        candidates.add(str(host.ipv4_mapped))
    for candidate in candidates:
        if candidate in METADATA_HOSTS:
            return candidate
    return ''


def link_local_address(base_url: str) -> str:
    """该地址是否是链路本地地址（169.254.0.0/16、fe80::/10），是则返回它。"""
    host = _host_ip(base_url)
    if host is None or not host.is_link_local:
        return ''
    return str(host)


def normalize_base_url(value: str) -> str:
    """把用户填写的 HA 地址整形成规范形式。

    异常: HAClientError —— 不是完整 http(s) 地址、带了账号/密码/查询参数/锚点，
    或指向云元数据端点。
    """
    candidate = value.strip().rstrip('/')
    parsed = urlparse(candidate)
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        raise HAClientError('Home Assistant 地址必须是完整的 http 或 https URL。')
    # 拒绝嵌入的凭据与查询串：它们会被带进日志和后端请求，拼接 /api/... 时也易产生歧义地址。
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HAClientError('Home Assistant 地址不能包含账号、密码、查询参数或锚点。')
    # 元数据地址不是「家里的 HA」：放行等于白送一个能读到云上凭证的探针。
    metadata = metadata_address(candidate)
    if metadata:
        raise HAClientError(f'{metadata} 是云元数据地址，不能作为 Home Assistant 地址。')
    # 末尾斜杠统一去掉，后面所有接口路径都按 f'{base}/api/...' 拼接，避免出现 //。
    path = parsed.path.rstrip('/')
    return urlunparse((parsed.scheme, parsed.netloc, path, '', '', ''))


def websocket_url(base_url: str) -> str:
    """由 REST 基地址推出 HA 的 WebSocket 端点地址。

    HA 的 WS 端点在同一主机端口上，仅把协议换成 ws/wss 并附加固定路径 `/api/websocket`。
    """
    parsed = urlparse(base_url)
    scheme = 'wss' if parsed.scheme == 'https' else 'ws'
    path = f"{parsed.path.rstrip('/')}/api/websocket"
    return urlunparse((scheme, parsed.netloc, path, '', '', ''))


def is_ipv6_literal(base_url: str) -> bool:
    """判断地址是否直接指向 IPv6 字面量。

    本地部署常用的代理只监听了 IPv4，这类目标必须绕开环境变量里的代理
    （见 `websocket_proxy` 与各 REST 调用里的 trust_env）。主机名解析不出或不是 IP 时为 False。
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

    ``websockets`` 的 ``proxy=True`` 把 SOCKS 排在 HTTP 代理之前，而 SOCKS 需要可选的
    ``python-socks``；macOS 系统代理总带 SOCKS，于是即使有可用的 HTTP 代理也会在建连前中止。
    返回代理 URL、``None``（IPv6 字面量 / NO_PROXY / 没配代理），或 ``True``（只配了 SOCKS）。
    """
    parsed = urlparse(base_url)
    if is_ipv6_literal(base_url):
        return None
    hostname = parsed.hostname or ''
    if not hostname:
        return None
    try:
        # 未写端口时用协议默认端口判断 NO_PROXY，否则 proxy_bypass 的两种匹配结果可能不一致。
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        bypassed = urllib.request.proxy_bypass(f'{hostname}:{port}')
    except ValueError:
        # 端口非法（例如 https://host:abc）时不猜代理，直接直连。
        return None
    if bypassed:
        return None
    proxies = urllib.request.getproxies()
    # 顺序有意义：wss 专用的代理最优先，其次才是 https/http 通配，最后 all。
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

    三个注册表字段用「None 与 [] 区分语义」：None 表示这次没取到（HA 版本不支持该命令或
    调用失败），同步层据此跳过「标记缺失」，避免把整个目录误判为已删除；[] 是权威的空结果。
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

    客户端本身无状态、可反复创建：每次调用都新建 httpx 连接，由 httpx 内部的连接池复用 TCP。
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

        参数: access_token 为长期访问令牌（明文，仅存内存）；verify_tls 为 False 时不校验证书
        （自签名证书的本地部署）；timeout 为 REST 与 WebSocket 建连超时（秒）。
        """
        self.base_url = normalize_base_url(base_url)
        self.access_token = access_token
        self.verify_tls = verify_tls
        self.timeout = timeout
        # 下限 8 MiB 是硬性保底：`get_states` 会把全部实体打包成一条消息返回，
        # 实体多的实例轻松超过几 MB，配置得过小会让同步直接以 1009 失败。
        self.websocket_max_size_bytes = max(int(websocket_max_size_bytes), 8388608)
        # 预先算好，避免每次建连都重新解析地址。
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

        返回键名 camelCase，与前端约定一致（location_name 缺省回落到 Home Assistant）。
        异常: HAClientError —— 401/403 表示令牌无效，其它 HTTP 状态码原样带出。
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

        用于「补拉」：内存里缺某个实体状态时，点查比整份 ``get_states`` 便宜得多。
        ``entity_ids`` 接受 set / list / tuple；404 或非字典的项被丢弃，失败抛 ``HAClientError``。
        """
        # 去重 + 排序：既避免重复请求，也让并发顺序稳定，便于复现问题。
        requested = sorted({str(value) for value in entity_ids if str(value)})
        if not requested:
            return []
        # 并发上限 8：一次补拉的实体通常只有几十个，但 HA 端多为树莓派之类的
        # 小机器，无限并发会把它的 HTTP 服务打满。
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
                        # 实体 ID 里的「点」必须转义；safe='' 让 quote 把 . 也编码掉，避免被反代/HA 拆错路径段。
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

        返回: ws:// 直连时返回 None（不加密）；否则按 verify_tls 决定校验证书还是跳过校验。
        """
        if not websocket_url(self.base_url).startswith('wss://'):
            return None
        # ssl._create_unverified_context 虽是标准库内部方法，但它是构造「不校验证书」上下文最直接的方式。
        return ssl.create_default_context() if self.verify_tls else ssl._create_unverified_context()

    async def _authenticate(self, websocket) -> None:
        """完成 HA WebSocket 的握手鉴权。

        HA 的协议是「服务端先说话」：连上后服务端发 `auth_required`，客户端回
        `{type: auth, access_token: ...}`，服务端再回 `auth_ok` 或 `auth_invalid`。
        异常: HAClientError —— 首帧不是 `auth_required`，或最终不是 `auth_ok`。
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

        异常: HAClientError —— 建连或鉴权失败；单条消息超限时给出可操作的提示
        （提示调大 APP_HA_WEBSOCKET_MAX_SIZE_BYTES）。
        """
        try:
            websocket = await websockets.connect(
                websocket_url(self.base_url),
                ssl=self._ssl_context(),
                # 代理由本模块显式解析，避免 websockets 读环境变量时选中不可用的 SOCKS（见 websocket_proxy）。
                proxy=websocket_proxy(self.base_url),
                open_timeout=self.timeout,
                # 20 秒心跳：家用网络/路由器会静默掐掉闲置 TCP，
                # 有了心跳才能在几十秒内发现并触发重连，而不是等下一次对账。
                ping_interval=20,
                ping_timeout=20,
                max_size=self.websocket_max_size_bytes,
                # 接收缓冲只留 4 条：一旦消费端卡住，宁愿以断连+重连收场，
                # 也不让内存无限堆积事件消息。
                max_queue=4,
            )
            await self._authenticate(websocket)
            return websocket
        except HAClientError:
            raise
        except (OSError, TimeoutError, websockets.WebSocketException) as error:
            # 1009 是「消息过大」的关闭码；有些实现只给 message too big 文本，所以三种特征都判。
            if (
                getattr(error, 'code', None) == 1009
                or 'message too big' in str(error).lower()
                or '1009' in str(error)
            ):
                maximum_mb = self.websocket_max_size_bytes // 1048576
                raise HAClientError(
                    f'Home Assistant 返回的单条数据超过 {maximum_mb} MB，'
                    '请提高 APP_HA_WEBSOCKET_MAX_SIZE_BYTES 或减少异常庞大的实体属性。'
                ) from error
            raise HAClientError(f'无法建立 Home Assistant WebSocket：{error}') from error

    async def command(self, websocket, message_id: int, command_type: str, **payload) -> Any:
        """在已鉴权的连接上发一条命令并等它的结果。

        HA 的 WebSocket 单连接多路复用：订阅推送与命令返回值混在同一条流里，只能靠 ``id``
        认领回复，因此这里是「循环跳过无关消息直到命中本 id」。``message_id`` 由调用方保证不重复。
        """
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
            # 不是本次命令的回复（多为订阅事件或其它命令的返回），跳过继续等。
            if message.get('id') != message_id:
                continue
            if message.get('type') != 'result' or not message.get('success'):
                error = message.get('error') or {}
                # 优先用 HA 自己给的中文/英文错误描述，没有才用兜底文案。
                raise HAClientError(str(error.get('message') or f'HA 命令 {command_type} 执行失败。'))
            return message.get('result')

    @staticmethod
    async def subscribe_events(
        websocket,
        event_types: tuple[str, ...],
        start_id: int = 100,
        required_event_types: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        """批量订阅事件，并返回订阅期间已经推送过来的事件。

        必须把「订阅确认之前就到达的事件」一起返回：订阅逐条发出，后面的还没确认时前面可能
        已在推事件，而这些事件比随后的全量快照更新，调用方要先处理它们再做快照。
        ``required_event_types`` 里的订阅失败必须整体失败，非必需类型失败只跳过。
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
        # 必须等所有订阅都确认完才返回，否则调用方拿着「半订阅」的连接会漏掉后续事件。
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

        三条注册表查询放在同一个 WebSocket 里（id 依次 2/3/4），状态查询用 id 1；`config`
        走 REST 单独取。注册表失败时对应字段为 None（供上层跳过「标记缺失」），状态查询或
        `test_connection` 失败抛 HAClientError。
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
            # 无论成败都关闭连接，否则异常路径会泄漏 HA 侧的会话。
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

        与 `fetch_snapshot` 的区别是不取状态：注册表变更事件只需刷新元数据，没必要顺带拉
        全部状态。返回 (entities, devices, areas)；取不到的那份为 None。
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

        分两步：``entity_component`` 是各域通用称呼，``entity`` 要按集成逐个取。``language``
        默认 ``zh-Hans``；``integrations`` 来自实体注册表的 platform。任何一步失败只表示少
        一部分翻译，不会抛异常（界面回落到 HA 原始名称）。
        """
        # 去重排序后逐个请求：每个集成一次往返，顺序稳定便于排查，也避免重复请求。
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
            # 不同 HA 版本一个返回 {resources: {...}}，另一个直接返回扁平字典，两者都兼容。
            component_payload = (
                component_result.get('resources', component_result)
                if isinstance(component_result, dict)
                else {}
            )
            for key, value in component_payload.items():
                if isinstance(key, str) and isinstance(value, str):
                    resources[key] = value
            # id 从 2 开始，1 已经被 entity_component 用掉了。
            for message_id, integration in enumerate(requested, start=2):
                try:
                    result = await self.command(
                        websocket, message_id, 'frontend/get_translations',
                        language=language, category='entity', integration=integration,
                    )
                except HAClientError:
                    # 单个集成缺翻译是常态（自定义组件、未翻译的第三方集成），直接跳过。
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
        """调用 HA 服务（开灯、设温度、执行脚本等）。

        走 REST 而非 WebSocket：服务调用是一次性动作，不需要订阅推送。``data`` 是服务附加参数。
        返回 HA 给出的受影响实体列表（字段名由 HA 决定）；HTTP 错误或网络异常抛 ``HAClientError``。
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

        返回 HA 原生的浏览结果结构（children 树），由前端直接渲染 —— 刻意不做归一化，
        免得跟着 HA 的字段变化来回改。默认值 `media-source://` 是 HA 的媒体源根节点。
        """
        # HA 的 browse_media 只认 media_content_id，media_content_type 保留是为了不破坏调用签名。
        payload = {'media_content_id': media_content_id}
        websocket = await self.connect_websocket()
        try:
            return await self.command(websocket, 1, 'media_source/browse_media', **payload)
        finally:
            await websocket.close()

    async def fetch_history(self, entity_id: str, start_time: str) -> list[dict[str, Any]]:
        """读取某个实体的历史状态，用于图表。

        参数: start_time 为起始时间（ISO8601 字符串，作为路径段传入）。
        异常: HAClientError —— HTTP 错误或网络异常。
        """
        # 起始时间在 URL 路径里，其中的 : 和 + 必须转义；safe='' 保证整串被完整编码。
        encoded_start = quote(start_time, safe='')
        params = {
            'filter_entity_id': entity_id,
            # 历史接口默认带上每个点的 attributes，数据量翻几倍；图表只画 state 曲线，显式关掉。
            'no_attributes': '1',
            # 只取 recorder 认为「有意义的」变化点，去掉抖动噪声，图表更轻。
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
        # HA 返回「列表的列表」（每个实体一段）；结构不符预期时按空历史处理，不把脏数据抛给图表。
        if not isinstance(payload, list) or not payload or not isinstance(payload[0], list):
            return []
        return [item for item in payload[0] if isinstance(item, dict)]
