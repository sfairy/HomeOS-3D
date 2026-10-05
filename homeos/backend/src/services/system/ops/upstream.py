"""外部 HTTP 上游抓取统一入口（ops / moviepilot / embed-proxy 共用）。

对齐 Nest 侧 ``HttpService``（axios）与 ``fetchHaWithTimeout`` 的用法差异：
- ``fetch_raw``：返回状态码 + 响应头 + 字节体，供 ICS / 天气 / 图片代理透传；
- ``open_stream``：返回 ``httpx`` 流式响应上下文（内嵌反代大文件/媒体不落内存）。

统一约定：上游返回的非 2xx **不会**抛异常，按 ``status`` 交由调用方透传或降级；
仅连接失败/超时等无响应错误抛 ``httpx.HTTPError``（对齐 axios ``isAxiosError(e) && e.response``
的判定位置：有 response 透传，无 response 记 500/502）。
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger("homeos.system.upstream")

#: 默认上游超时（秒）
DEFAULT_TIMEOUT = 10.0
#: 内嵌反代超时（秒）：仅作用于连接 + 响应头阶段
EMBED_TIMEOUT = 30.0


@dataclass
class UpstreamResponse:
    """上游响应（已读取完成的形态）。"""

    status: int
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes = b""
    set_cookies: list[str] = field(default_factory=list)
    url: str = ""

    def header(self, name: str) -> str | None:
        lowered = name.lower()
        for key, value in self.headers.items():
            if key.lower() == lowered:
                return value
        return None

    def json(self) -> Any:
        import json  # noqa: PLC0415 - 仅反序列化时使用

        if not self.body:
            return None
        try:
            return json.loads(self.body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return None

    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")


def _collect_headers(response: httpx.Response) -> dict[str, str]:
    return {key: value for key, value in response.headers.items()}


def _collect_set_cookies(response: httpx.Response) -> list[str]:
    """多条 ``Set-Cookie`` 必须逐条保留（合并会破坏含逗号属性的 Cookie）。"""
    try:
        return list(response.headers.get_list("set-cookie"))
    except Exception:  # noqa: BLE001 - 老版本 httpx 无 get_list 时降级
        raw = response.headers.get("set-cookie")
        return [raw] if raw else []


async def fetch_raw(
    url: str,
    *,
    method: str = "GET",
    params: dict[str, Any] | None = None,
    headers: dict[str, Any] | None = None,
    content: bytes | str | None = None,
    json_body: Any = None,
    timeout: float = DEFAULT_TIMEOUT,
    follow_redirects: bool = False,
    verify: bool = True,
) -> UpstreamResponse:
    """执行一次上游请求并读取完整响应体。

    ``json_body`` 非空时序列化为 JSON 并自动补 ``Content-Type``。
    """
    if json_body is not None and content is None:
        import json  # noqa: PLC0415 - 仅序列化时使用

        content = json.dumps(json_body, ensure_ascii=False).encode("utf-8")
        headers = {**(headers or {})}
        headers.setdefault("Content-Type", "application/json")
    async with httpx.AsyncClient(
        timeout=timeout, follow_redirects=follow_redirects, verify=verify
    ) as client:
        response = await client.request(
            method.upper(), url, params=params, headers=headers, content=content
        )
        return UpstreamResponse(
            status=response.status_code,
            headers=_collect_headers(response),
            body=response.content,
            set_cookies=_collect_set_cookies(response),
            url=str(response.url),
        )


@asynccontextmanager
async def open_stream(
    url: str,
    *,
    method: str = "GET",
    params: dict[str, Any] | None = None,
    headers: dict[str, Any] | None = None,
    content: bytes | str | None = None,
    timeout: float = EMBED_TIMEOUT,
    verify: bool = True,
) -> AsyncIterator[httpx.Response]:
    """流式请求（内嵌反代透传大文件 / 媒体，不整体读入内存）。

    超时仅作用于连接 + 响应头阶段；已开始传输的 body 不受影响。
    """
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout, read=None),
        follow_redirects=False,
        verify=verify,
    ) as client:
        async with client.stream(
            method.upper(), url, params=params, headers=headers, content=content
        ) as response:
            yield response


__all__ = [
    "DEFAULT_TIMEOUT",
    "EMBED_TIMEOUT",
    "UpstreamResponse",
    "fetch_raw",
    "open_stream",
]
