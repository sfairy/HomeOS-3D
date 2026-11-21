"""网络信息探测（对齐参考实现的 ``GET /system/network-info``）。

只做三件事：

1. 本机内网 IPv4 / IPv6（跳过回环、链路本地与 Docker 网卡）；
2. 公网 IPv4 / IPv6（ipify，2.5s 超时，失败留空 —— 离线部署是常态，不能报错）；
3. 拼出 ``internalUrl`` / ``externalUrl``（外部地址来自布局里的 ``externalUrl``）。

公网探测刻意只保留 ipify 一个来源：参考实现列了 4 个纯 HTTP 端点，其中 3 个是
明文 HTTP（可被中间人篡改）。离线部署下多探几个也只增加 2.5s×N 的启动/请求延迟。
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import socket
from typing import Any

import httpx

logger = logging.getLogger("homeos.system.network")

PROBE_TIMEOUT_SECONDS = 2.5
_IPV4_PROBE = "https://api4.ipify.org?format=json"
_IPV6_PROBE = "https://api6.ipify.org?format=json"


def _is_private_v4(value: str) -> bool:
    try:
        address = ipaddress.IPv4Address(value)
    except ValueError:
        return False
    return address.is_private and not address.is_loopback and not address.is_link_local


def _is_public_v6(value: str) -> bool:
    try:
        address = ipaddress.IPv6Address(value.split("%", 1)[0])
    except ValueError:
        return False
    return not (address.is_loopback or address.is_link_local or address.is_private)


def local_ipv4() -> str:
    """本机内网 IPv4：优先 192.168 / 10 段（用户最可能用它访问墙屏）。"""
    candidates: list[str] = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            candidates.append(info[4][0])
    except OSError:
        pass
    try:
        # UDP connect 不实际发包，只让内核选一条出口地址。
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("192.0.2.1", 9))
            candidates.append(probe.getsockname()[0])
    except OSError:
        pass
    preferred = [ip for ip in candidates if ip.startswith(("192.168.", "10.")) and _is_private_v4(ip)]
    fallback = [ip for ip in candidates if _is_private_v4(ip)]
    return (preferred or fallback or [""])[0]


def local_ipv6() -> str:
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET6):
            address = str(info[4][0]).split("%", 1)[0]
            if _is_public_v6(address) or address.startswith(("fd", "fc")):
                return address
    except OSError:
        pass
    return ""


async def _probe(url: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=PROBE_TIMEOUT_SECONDS, follow_redirects=False) as client:
            response = await client.get(url, headers={"user-agent": "homeos"})
            if response.status_code != 200:
                return ""
            payload = response.json()
            return str(payload.get("ip") or "").strip()
    except Exception as exc:
        logger.debug("公网地址探测失败 %s: %s", url, exc)
        return ""


async def public_addresses() -> tuple[str, str]:
    return await asyncio.gather(_probe(_IPV4_PROBE), _probe(_IPV6_PROBE))


def _port(name: str, fallback: int) -> int:
    try:
        return int(os.getenv(name, "") or fallback)
    except (TypeError, ValueError):  # fmt: skip
        return fallback


def _external_url(layout: dict[str, Any] | None) -> str:
    raw = (layout or {}).get("externalUrl")
    return str(raw or "").strip().rstrip("/")


async def build_network_info(
    *, host_header: str, external_url: str = "", layout: dict[str, Any] | None = None
) -> dict[str, Any]:
    """组装 ``/system/network-info`` 的响应。"""
    backend_port = _port("HOMEOS_PORT", _port("APP_PORT", 8801))
    frontend_port = _port("APP_PUBLISH_PORT", backend_port)
    lan_ip = local_ipv4()
    public_v4, public_v6 = await public_addresses()
    # Host 头只在不是 localhost / 容器名时才算「用户在用的地址」。
    host = host_header.split(":", 1)[0].strip()
    if host and host.lower() not in {"localhost", "127.0.0.1"} and "docker" not in host.lower():
        lan_ip = host
    internal_url = f"http://{lan_ip}:{frontend_port}" if lan_ip else ""
    return {
        "port": backend_port,
        "frontendPort": frontend_port,
        "backendPort": backend_port,
        "localIp": lan_ip,
        "localIpv6": local_ipv6(),
        "internalUrl": internal_url,
        "externalUrl": _external_url(layout) or external_url,
        "publicIpv4": public_v4,
        "publicIpv6": public_v6,
    }


__all__ = ["PROBE_TIMEOUT_SECONDS", "build_network_info", "local_ipv4", "local_ipv6", "public_addresses"]
