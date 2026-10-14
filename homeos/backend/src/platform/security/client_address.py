"""FastAPI 侧的真实客户端地址解析（薄包装，判据真源在 ``homeos_shared.client_ip``）。

为什么单独一层：``homeos_shared`` 刻意不依赖 FastAPI（它同时被两个独立编译的后端内联），
所以 ``Request`` → 纯函数入参的映射留在各自后端。这一层**只做映射**，不含任何判定逻辑 ——
判定逻辑一旦在这里再写一遍，就等于又开了第二份判据。

``settings.trusted_proxies`` 缺失时（例如测试里用 ``SimpleNamespace`` 造的请求）退回空元组，
即「不信任任何代理」：与修复前的行为相反，但方向是安全的那一侧。
"""
from __future__ import annotations

from fastapi import Request

from homeos_shared.client_ip import ClientAddress, resolve_client_address

__all__ = ["ClientAddress", "client_ip_from_request", "resolve_client_address_from_request"]


def _trusted_proxies(request: Request) -> tuple[str, ...]:
    settings = getattr(getattr(request.app, "state", None), "settings", None)
    return tuple(getattr(settings, "trusted_proxies", ()) or ())


def resolve_client_address_from_request(request: Request) -> ClientAddress:
    """解析本次请求的真实来源地址（口径见 ``homeos_shared.client_ip``）。"""
    peer = ""
    client = getattr(request, "client", None)
    if client is not None:
        peer = str(getattr(client, "host", "") or "")
    return resolve_client_address(
        peer=peer,
        trusted_proxies=_trusted_proxies(request),
        forwarded_for=request.headers.get("x-forwarded-for", ""),
        real_ip=request.headers.get("x-real-ip", ""),
    )


def client_ip_from_request(request: Request) -> str | None:
    """便捷形态：只要地址（判不出时返回 ``None``）。"""
    address = resolve_client_address_from_request(request)
    return address.ip or None
