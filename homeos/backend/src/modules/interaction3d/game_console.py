"""游戏机主面板：三条指令 + 一张**不外泄凭据**的封面代理。

游戏机（Nintendo Switch）与 PlayStation 的差异集中在两处，所以单独成模块：

1. **指令面极窄**。主面板只允许 ``turn_on`` / ``turn_off`` / ``select_source``；
   音量的细粒度调节、播放控制都交给下面展开的媒体面板（走 ``speaker`` 模块）。
   窄口径的好处是：面板误触不会把正在运行的游戏退出。
2. **封面来自第三方**。Switch 的 ``Game Image URL`` 指向 nxapi 的封面服务，
   那是**用户设备之外**的地址。直接把它交给前端等于让浏览器带着内网 Cookie 去第三方，
   因此这里做同源代理：只允许固定的 host + 固定路径前缀，且不允许查询串/锚点/
   反斜杠/``.``/``..``，避免把它变成开放代理。

图片本体仍然要再取一次，但**不跟随重定向**：跟随会把上面校验过的 host 变成跳板。
"""

from __future__ import annotations

from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException, status

from .speaker import validate_speaker_command

#: 主面板允许的指令。
GAME_CONSOLE_SERVICES = frozenset({'turn_on', 'turn_off', 'select_source'})

#: 允许代理的封面来源（nxapi presence 的公开封面服务）。
ARTWORK_HOST = 'nxapi-presence.fancy.org.uk'

#: 封面路径前缀；只有这个前缀下的资源才允许转发。
ARTWORK_PATH_PREFIX = '/api/presence/resources/'

#: URL 长度上限（防把超长串塞进日志与响应）。
MAX_ARTWORK_URL = 2048

#: 图片体积上限 8 MiB：封面是 512px 左右的图，正常远小于此。
MAX_ARTWORK_BYTES = 8 * 1024 * 1024

#: 允许的图片类型。
ARTWORK_CONTENT_TYPES = frozenset({'image/gif', 'image/png', 'image/jpeg', 'image/webp'})


def validate_game_console_command(service: str, data: dict, state: dict | None) -> None:
    """校验一条游戏机指令。

    复用媒体实体的能力位校验（游戏机在 HA 里就是一个 ``media_player``），
    只把面向用户的文案里的「智能音响」换成「游戏机」——否则用户在游戏机面板上
    会读到"音响不支持"，完全对不上号。
    """
    if service not in GAME_CONSOLE_SERVICES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='游戏机主面板只支持唤醒、休眠和切换游戏或应用。',
        )
    try:
        validate_speaker_command(service, data, state)
    except HTTPException as error:
        message = str(error.detail)
        raise HTTPException(
            status_code=error.status_code,
            detail=message.replace('智能音响', '游戏机'),
        ) from error


def switch_artwork_url(state: dict | None, role: str) -> str:
    """从实体状态里取出可代理的封面地址；不合法一律 404（不是 403，避免探测）。"""
    if role not in ('game', 'avatar'):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='图片类型不存在。')
    if not isinstance(state, dict) or state.get('available') is False or state.get('state') in (
        None,
        '',
        'unknown',
        'unavailable',
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='游戏机图片暂不可用。')
    if role == 'game' and str(state.get('state', '')).upper() not in ('ONLINE', 'PLAYING'):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='当前没有运行中的游戏。')

    attributes = state.get('attributes') or {}
    if not isinstance(attributes, dict):
        attributes = {}
    value = attributes.get('Game Image URL' if role == 'game' else 'entity_picture')
    if not isinstance(value, str) or not value or len(value) > MAX_ARTWORK_URL:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='没有可显示的图片。')

    try:
        parsed = urlsplit(value)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='没有可显示的图片。') from error

    segments = parsed.path.split('/')
    valid = (
        parsed.scheme == 'https'
        and parsed.hostname == ARTWORK_HOST
        and parsed.port in (None, 443)
        and not parsed.username
        and not parsed.password
        and parsed.path.startswith(ARTWORK_PATH_PREFIX)
        and not parsed.query
        and not parsed.fragment
        and '\\' not in value
        # 任何 ``.`` / ``..`` 段都可能把请求带出前缀目录。
        and all(segment not in ('.', '..') for segment in segments)
    )
    if not valid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='没有可显示的图片。')
    return value


async def fetch_switch_artwork(url: str) -> tuple[bytes, str]:
    """取回封面本体，返回 ``(内容, media_type)``。

    不跟随重定向（见模块文档），并按 ``Content-Length`` 与累计读取量双重限流：
    chunked 响应没有 ``Content-Length``，只查头会被绕过。
    """
    try:
        async with (
            httpx.AsyncClient(timeout=8.0, follow_redirects=False) as client,
            client.stream('GET', url) as response,
        ):
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY, detail='游戏图片暂时无法读取。'
                    )
                raw_type = response.headers.get('content-type', '')
                media_type = raw_type.split(';')[0].strip().lower()
                if media_type not in ARTWORK_CONTENT_TYPES:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY, detail='游戏图片格式不可用。'
                    )
                declared = response.headers.get('content-length')
                if declared and declared.isdigit() and int(declared) > MAX_ARTWORK_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY, detail='游戏图片超过大小限制。'
                    )
                chunks: list[bytes] = []
                total = 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > MAX_ARTWORK_BYTES:
                        raise HTTPException(
                            status_code=status.HTTP_502_BAD_GATEWAY, detail='游戏图片超过大小限制。'
                        )
                    chunks.append(chunk)
                return b''.join(chunks), media_type
    except HTTPException:
        raise
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail='游戏图片暂时无法读取。'
        ) from error
