'''Address discovery is setup-only; saved connections never run discovery.'''
from __future__ import annotations
import asyncio
import ipaddress
import json
import logging
from urllib.parse import urlparse, urlunparse
import httpx
import websockets
from .client import HAClient, HAClientError, is_ipv6_literal, normalize_base_url, websocket_url
from .errors import connection_error_message, is_certificate_error
LOGGER = logging.getLogger(__name__)

def address_candidates(value: str) -> list[str]:
    value = value.strip().rstrip('/')
    if not value or any(c.isspace() for c in value) or '\\' in value:
        raise HAClientError('请填写有效的 Home Assistant IP 或域名，可带端口。')
    if '://' in value:
        return [normalize_base_url(value)]
    try:
        parsed = urlparse('//' + value)
        host, port = parsed.hostname, parsed.port
    except ValueError as error:
        raise HAClientError('地址或端口格式不正确；IPv6 地址请放在方括号内。') from error
    if not host or parsed.username is not None or parsed.password is not None or parsed.query or parsed.fragment or parsed.params:
        raise HAClientError('地址不能包含账号、密码、查询参数或锚点。请填写 HA 服务地址。')
    if port is not None and not 1 <= port <= 65535:
        raise HAClientError('端口应在 1 到 65535 之间。')
    try:
        local = ipaddress.ip_address(host).is_private or ipaddress.ip_address(host).is_loopback
    except ValueError:
        local = host == 'localhost' or '.' not in host or host.endswith(('.local', '.lan'))
    schemes = ['http', 'https'] if local and port not in {443, 8443} else ['https', 'http']
    authorities = [parsed.netloc] if port is not None else [parsed.netloc, parsed.netloc + ':8123']
    return [normalize_base_url(urlunparse((scheme, authority, parsed.path, '', '', ''))) for authority in authorities for scheme in schemes]

def validate_address_input(value: str) -> str:
    candidates = address_candidates(value)
    return candidates[0] if '://' in value else value.strip().rstrip('/')

async def resolve_address(value: str, *, verify_tls: bool, timeout: float) -> str:
    candidates = address_candidates(value)
    if '://' in value:
        return candidates[0]
    failures = []
    for candidate in candidates:
        try:
            async with httpx.AsyncClient(verify=verify_tls, timeout=min(timeout, 2.5), trust_env=not is_ipv6_literal(candidate), follow_redirects=False) as client:
                response = await client.get(candidate + '/api/')
                possible_ha = response.status_code == 401
                if response.status_code == 200:
                    try:
                        body = response.json()
                    except ValueError:
                        body = None
                    if isinstance(body, dict) and body.get('message') == 'API running.':
                        possible_ha = True
                if possible_ha:
                    if await has_ha_greeting(candidate, verify_tls=verify_tls, timeout=min(timeout, 2.5)):
                        return candidate
                    failures.append(HAClientError('无法确认该服务是 Home Assistant，请填写完整的 HA 服务地址（包含协议和端口）。'))
                elif response.status_code != 200:
                    failures.append(HAClientError(f'Home Assistant 返回 HTTP {response.status_code}。'))
                else:
                    failures.append(HAClientError('该地址未返回 Home Assistant 接口，请确认服务地址、端口及反向代理路径。'))
        except httpx.HTTPError as error:
            message = connection_error_message(error)
            if is_certificate_error(error):
                raise HAClientError(message) from error
            failures.append(error)
    last = next((error for error in failures if isinstance(error, HAClientError)), failures[0])
    LOGGER.info('HA address discovery failed: %s', last)
    raise HAClientError(connection_error_message(last)) from last

async def has_ha_greeting(address: str, *, verify_tls: bool, timeout: float) -> bool:
    client = HAClient(address, '', verify_tls=verify_tls, timeout=timeout)
    try:
        async with asyncio.timeout(timeout):
            connection = websockets.connect(websocket_url(address), ssl=client._ssl_context(), proxy=None if is_ipv6_literal(address) else True, open_timeout=timeout, close_timeout=timeout, max_size=8192, max_queue=1, ping_interval=None)
            connection.process_redirect = lambda error: error
            async with connection as socket:
                greeting = json.loads(await socket.recv())
                return isinstance(greeting, dict) and greeting.get('type') == 'auth_required' and isinstance(greeting.get('ha_version'), str) and bool(greeting['ha_version'].strip())
    except (OSError, TimeoutError, websockets.WebSocketException, ValueError, TypeError) as error:
        if is_certificate_error(error):
            raise HAClientError(connection_error_message(error)) from error
        return False

async def check_connection(address: str, token: str, *, verify_tls: bool, timeout: float) -> dict:
    resolved = await resolve_address(address, verify_tls=verify_tls, timeout=timeout)
    client = HAClient(resolved, token, verify_tls=verify_tls, timeout=timeout)
    try:
        result = await client.test_connection()
        async with asyncio.timeout(timeout):
            socket = await client.connect_websocket()
            await socket.close()
    except Exception as error:
        LOGGER.warning('HA setup validation failed', exc_info=True)
        raise HAClientError(connection_error_message(error)) from error
    return {**result, 'baseUrl': resolved}
