"""真实客户端地址解析（可信代理链）：两个后端共用同一份实现。

为什么必须在共享包里
--------------------
这是**安全判据**，不是便利函数：限流按它分桶、审计按它记录、MCP 网关按它做 IP 白名单。
两边各写一份的代价不是「重复代码」，而是**两份判据会分叉**，且分叉方向是安全的那一侧被放松。
主应用此前根本没有这份判据 —— ``api/mcp.py`` 的 ``_client_ip`` 直接取 ``X-Forwarded-For``
第一个地址，任何客户端都能凭一个请求头把自己伪装成白名单内的 IP；而 ``.env.example`` 里
被文档化、compose 里被透出的 ``APP_TRUSTED_PROXIES`` 在整个后端**没有任何消费者**。
（商店侧的 ``security/request_security.py`` 早已实现正确的「先看 TCP 对端是否可信、再回退转发链」，
本模块就是把那份口径提炼成纯函数、两侧共用。）

口径（与商店既有实现逐条一致）
------------------------------
1. 取 **TCP 对端**（``peer``）作为基准地址。
2. 对端**不在**可信代理网段内 → 直接采信对端，**完全忽略**任何转发头（转发头是客户端可伪造的）。
3. 对端可信 → 从 ``X-Forwarded-For`` 链**右往左**找第一个不可信的地址（最右侧可信段是代理自己）。
4. 链上全是可信地址 → 退回链首（最接近原始客户端的一条）。
5. 拿不到任何地址 → ``per_client=False``，调用方应退化到**全局**桶而不是「按空串分桶」
   （否则所有无法识别来源的请求会共用一个桶，等于给攻击者一个廉价的全局拒绝服务开关）。

本模块**不 import FastAPI**：``Request`` → 本模块的入参映射由各自后端的薄包装完成
（主应用 ``platform/security/client_address.py``、商店 ``security/request_security.py``）。
"""
from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from functools import lru_cache

__all__ = [
    "ClientAddress",
    "forwarded_chain",
    "is_trusted",
    "normalize_ip",
    "parse_trusted_proxies",
    "resolve_client_address",
]


@dataclass(frozen=True)
class ClientAddress:
    """一次请求的来源地址判定结果。"""

    #: 判定出的客户端地址（规范化形式）；无法判定时为空串。
    ip: str
    #: 该地址是否可用于**按客户端**分桶。``False`` 表示调用方应使用全局桶。
    per_client: bool
    #: 是否经由可信代理解析得到（决定 ``X-Forwarded-Proto`` 这类头是否可采信）。
    via_proxy: bool


@lru_cache(maxsize=32)
def parse_trusted_proxies(values: tuple[str, ...]) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    """把可信代理配置（IP 或 CIDR，逗号分隔后逐项的元组）解析成网段元组。

    非法项**抛错**而不是跳过：一个写错的网段会让「可信代理」静默变成空集，
    于是真实客户端 IP 全部退化成对端地址 —— 这是安全侧失效，必须显式失败。

    ``lru_cache`` 的键是元组，调用方（两个后端）从配置里取出的就是元组，逐请求调用无开销。
    """
    networks = []
    for raw in values:
        candidate = (raw or "").strip()
        if not candidate:
            continue
        try:
            networks.append(ipaddress.ip_network(candidate, strict=False))
        except ValueError as error:
            raise ValueError(
                f"可信代理配置里的 {candidate!r} 不是合法的 IP 或 CIDR 网段。"
            ) from error
    return tuple(networks)


def normalize_ip(value: str) -> str:
    """把 IP 字面量规范化（去掉 IPv6 方括号 / ``::ffff:`` 前缀、统一压缩形式）。

    不是 IP 时返回空串 —— 调用方据此把「垃圾值」当成「没拿到地址」，
    而不是当成一个可用的分桶键（否则攻击者可以每请求换一个假 IP 撑爆限流器 key 表）。
    """
    candidate = (value or "").strip().strip("[]")
    if not candidate:
        return ""
    if candidate.lower().startswith("::ffff:") and "." in candidate:
        candidate = candidate[7:]
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return ""


def is_trusted(host: str, networks: tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]) -> bool:
    """该地址是否落在可信代理网段内。"""
    if not host or not networks:
        return False
    address = normalize_ip(host)
    if not address:
        return False
    parsed = ipaddress.ip_address(address)
    return any(parsed in network for network in networks)


def forwarded_chain(forwarded_for: str, real_ip: str = "") -> list[str]:
    """从转发头里取出地址链（左起第一个是原始客户端，**最不可信**）。

    非法的段被丢弃而不是占位：混入垃圾段时链会变短，判据退回更保守的一侧。
    """
    chain: list[str] = []
    for piece in (forwarded_for or "").split(","):
        address = normalize_ip(piece)
        if address:
            chain.append(address)
    if not chain:
        single = normalize_ip(real_ip)
        if single:
            chain.append(single)
    return chain


def resolve_client_address(
    *,
    peer: str,
    trusted_proxies: tuple[str, ...] = (),
    forwarded_for: str = "",
    real_ip: str = "",
) -> ClientAddress:
    """解析本次请求的真实来源地址（口径见模块 docstring）。"""
    networks = parse_trusted_proxies(tuple(trusted_proxies or ()))
    normalized_peer = normalize_ip(peer)
    if not is_trusted(normalized_peer, networks):
        # 对端不可信（或未配可信代理）→ 转发头一律不采信，但仍标记 per_client：
        # 对端地址是 TCP 连接的真实来源，客户端无法伪造。
        return ClientAddress(ip=normalized_peer, per_client=bool(normalized_peer), via_proxy=False)

    chain = forwarded_chain(forwarded_for, real_ip)
    for candidate in reversed(chain):
        if not is_trusted(candidate, networks):
            return ClientAddress(ip=candidate, per_client=True, via_proxy=True)
    if chain:
        # 整条链都在可信网段内：退回链首（最接近原始客户端的一条）。
        return ClientAddress(ip=chain[0], per_client=True, via_proxy=True)
    # 对端可信但没有任何转发头：无法定位客户端，交给调用方用全局桶。
    return ClientAddress(ip=normalized_peer, per_client=False, via_proxy=True)
