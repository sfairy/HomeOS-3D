"""进程级共享 ``httpx.AsyncClient``：复用连接池，避免每次上游请求都新建客户端。

旧实现（B14/B4 审查发现）在每次请求处 ``async with httpx.AsyncClient(...)``：新建又销毁，
连接池、TLS 会话每次重建，语音/TTS/LLM 这类高频调用白付握手成本。这里给 agent 域提供
按需懒加载的进程级客户端；**超时仍按请求传入**，代理等语义沿用 httpx 约定，不改变调用方行为。

关闭：应用关闭流程应 ``await close_shared_http_client()``。当前 ``bootstrap/lifespan.py``
不在本次改动范围，未挂载关闭钩子 —— 接入方在停服前补一行 await 即可（未关闭时进程退出由
操作系统回收，不影响功能，只是测试/热重载会留 unclosed 警告）。
"""

from __future__ import annotations

import httpx

_shared_client: httpx.AsyncClient | None = None


def shared_http_client() -> httpx.AsyncClient:
    """返回进程级共享客户端（懒加载；已被关闭时自动重建）。

    不要在调用方 ``async with`` 它：那会在退出时把共享客户端关掉，后续调用全部失败。
    请求级超时请用 ``client.get/post(..., timeout=...)`` 传入，避免并发请求互相改超时。
    """
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient()
    return _shared_client


async def close_shared_http_client() -> None:
    """关闭并清空共享客户端（可重复调用）。"""
    global _shared_client
    client = _shared_client
    _shared_client = None
    if client is not None and not client.is_closed:
        await client.aclose()


__all__ = ["close_shared_http_client", "shared_http_client"]
