"""支付网关的 HTTP 出口：进程内复用一条 keep-alive 连接池。

为什么需要它
------------
支付宝 / 微信的每一次网关调用过去都是「新建一次请求」：

    httpx.post(url, ...) / httpx.request("POST", url, ...)

httpx 的顶层便捷函数每次都会新建并关闭一个临时客户端 —— 也就是每笔查单、每笔退款、
每次关单都要重新做一次 TCP（含 TLS）握手。单次请求看不出代价，但两处会放大它：

* 账户中心订单列表会对**每笔在途订单串行查单**（一次请求里最多 20 笔）；
* 巡检线程按轮次对一批订单查单、关单，且与前台请求并发。

这里收敛成进程级 ``httpx.Client``：连接复用、连接池有上限、退出时统一关闭。
行为不变 —— 超时依旧按调用方传入（默认 15s），``trust_env=True`` 依旧遵循代理环境变量，
异常类型仍是 ``httpx.HTTPError`` 家族，所以 ``except httpx.HTTPError`` 的既有分支继续生效。
"""

from __future__ import annotations

import atexit
import threading

import httpx

#: 与各 provider 原本的字面量超时保持一致。
DEFAULT_TIMEOUT_SECONDS = 15.0

_client: httpx.Client | None = None
_lock = threading.Lock()


def shared_client() -> httpx.Client:
    """进程级客户端（懒加载 + 双检锁）；线程安全，可被 FastAPI 线程池并发使用。"""
    global _client
    client = _client
    if client is None:
        with _lock:
            if _client is None:
                created = httpx.Client(
                    timeout=DEFAULT_TIMEOUT_SECONDS,
                    limits=httpx.Limits(max_keepalive_connections=8, max_connections=16),
                )
                atexit.register(created.close)
                _client = created
            client = _client
    return client


def close_shared_client() -> None:
    """关闭并丢弃共享客户端（供进程收尾 / 测试复位使用）。"""
    global _client
    with _lock:
        client, _client = _client, None
    if client is not None:
        client.close()


def request(
    method: str,
    url: str,
    *,
    content: bytes | None = None,
    data: dict | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> httpx.Response:
    """共享客户端上的单次请求；参数语义与 ``httpx.request`` 一致。"""
    return shared_client().request(
        method,
        url,
        content=content,
        data=data,
        headers=headers,
        timeout=timeout,
    )
