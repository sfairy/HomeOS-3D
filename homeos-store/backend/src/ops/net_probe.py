"""网络可达性探测：给后台「站点配置」的自检按钮提供最小的探测原语。
"""

from __future__ import annotations

import ipaddress
import logging
import os
import socket
import ssl
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger("src.ops.net_probe")

DEFAULT_TIMEOUT_SECONDS = 5.0

LEVEL_PASS = "pass"
LEVEL_WARN = "warn"
LEVEL_FAIL = "fail"
LEVEL_SKIP = "skip"

PASSING_LEVELS = frozenset({LEVEL_PASS})


def check_result(check_id: str, label: str, level: str, detail: str = "") -> dict:
    """构造一条诊断结论（``mailer`` 与 ``payments.alipay`` 共用同一份结构）。"""
    return {"id": check_id, "label": label, "level": level, "detail": detail}

_PRIVATE_NETWORKS = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
)

_BLOCKED_NETWORKS = (
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("fe80::/10"),
)


def host_from_url(url: str) -> str:
    """从 URL 里取出主机名（小写）。URL 不合法时返回空串。"""
    try:
        return (urlsplit((url or "").strip()).hostname or "").lower()
    except ValueError:
        return ""


def is_private_host(host: str) -> bool:
    """主机名是否指向本机 / 内网（含直接写 IP 与 ``localhost``）。
    """
    text = (host or "").strip().strip("[]").lower()
    if not text:
        return False
    if text == "localhost" or text.endswith(".localhost"):
        return True
    try:
        address = ipaddress.ip_address(text)
    except ValueError:
        return False
    return any(address in network for network in _PRIVATE_NETWORKS)


_BLOCKED_MESSAGE = (
    "{host} 是链路本地地址（云厂商的元数据服务就在这一档），不探测：它不提供"
    "邮件/回调/网关能力，只提供这台机器的临时凭据，而本模块会回报可达性与失败原因，"
    "足够把它当内网探针用。请换成一个真实的外部可达地址。"
)


def resolve_host(host: str) -> tuple[bool, str, tuple[str, ...]]:
    """解析主机名，返回 ``(是否成功, 说明文案, 解析到的地址)``。
    """
    text = (host or "").strip()
    if not text:
        return False, "未填写主机名。", ()
    try:
        infos = socket.getaddrinfo(text, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as error:
        return False, f"域名解析失败：{error}（请检查是否拼写错误，或该域名在公网不存在）。", ()
    except OSError as error:
        return False, f"域名解析失败：{error}", ()
    addresses = tuple(sorted({str(info[4][0]) for info in infos if info[4]}))
    if not addresses:
        return False, "域名解析没有返回任何地址。", ()
    return True, "解析到 " + "、".join(addresses), addresses


def _allow_private_probes() -> bool:
    """本地 mock 诊断的显式逃生门；默认拦截 loopback/私网，避免诊断变内网探针。"""
    return (os.getenv("STORE_NET_PROBE_ALLOW_PRIVATE", "") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _blocked_probe_reason(host: str) -> str:
    text = (host or "").strip().strip("[]").lower()
    if not text:
        return ""
    blocked_networks = _BLOCKED_NETWORKS if _allow_private_probes() else _PRIVATE_NETWORKS

    def blocked(value: str) -> bool:
        try:
            address = ipaddress.ip_address(value.strip().strip("[]"))
        except ValueError:
            return False
        mapped = getattr(address, "ipv4_mapped", None)
        if mapped is not None:
            address = mapped
        return any(
            address.version == network.version and address in network
            for network in blocked_networks
        )

    if blocked(text):
        return _BLOCKED_MESSAGE.format(host=text)

    try:
        ipaddress.ip_address(text)
    except ValueError:
        resolved, _detail, addresses = resolve_host(text)
        if resolved and any(blocked(item) for item in addresses):
            return _BLOCKED_MESSAGE.format(host=text)
    return ""


def _request_http(
    method: str, url: str, *, timeout: float, trust_env: bool
) -> httpx.Response:
    return httpx.request(
        method,
        url,
        timeout=timeout,
        follow_redirects=False,
        trust_env=trust_env,
    )


def probe_http(
    url: str,
    *,
    method: str = "GET",
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> tuple[bool, str]:
    """探测一个 http(s) 地址是否可达。返回 ``(是否可达, 说明文案)``。

    代理环境变量里出现 httpx 解析不了的写法时（真实踩过：``NO_PROXY="...,::1,[::1]"``），
    ``httpx.request`` 在构造临时客户端阶段就抛 ``InvalidURL``。后台「自检」按钮不该因此
    变成 500，这里降级为 ``trust_env=False`` 重试一次；代理正常工作时行为不变。
    """
    target = (url or "").strip()
    if not target:
        return False, "未填写地址。"
    blocked = _blocked_probe_reason(host_from_url(target))
    if blocked:
        return False, blocked
    try:
        response = _request_http(method, target, timeout=timeout, trust_env=True)
    except httpx.InvalidURL as error:
        logger.warning("网络探测的代理环境变量异常，降级为直连重试：%s", error)
        try:
            response = _request_http(method, target, timeout=timeout, trust_env=False)
        except httpx.HTTPError as inner:
            logger.info("网络探测直连重试失败：%s: %s", inner.__class__.__name__, inner)
            return False, f"连接失败：{inner.__class__.__name__}: {inner}"
        except ValueError as inner:
            logger.info("网络探测直连重试地址不合法：%s", inner)
            return False, f"地址不合法：{inner}"
    except httpx.HTTPError as error:
        return False, f"连接失败：{error.__class__.__name__}: {error}"
    except ValueError as error:
        return False, f"地址不合法：{error}"
    return True, f"已建立连接（HTTP {response.status_code}）"


def probe_tls(
    host: str,
    port: int = 443,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> tuple[bool, str]:
    """探测 TCP 连通性 + TLS 握手，返回 ``(是否成功, 说明文案)``。
    """
    text = (host or "").strip()
    if not text:
        return False, "未填写主机名。"
    blocked = _blocked_probe_reason(text)
    if blocked:
        return False, blocked
    try:
        with socket.create_connection((text, int(port)), timeout=timeout) as raw:
            context = ssl.create_default_context()
            with context.wrap_socket(raw, server_hostname=text) as tls:
                version = tls.version() or "未知"
        return True, f"TCP 与 TLS 握手成功（{version}）"
    except ssl.SSLCertVerificationError as error:
        return False, f"TLS 证书校验失败：{error}"
    except ssl.SSLError as error:
        return False, f"TLS 握手失败：{error}"
    except TimeoutError:
        return False, f"连接 {text}:{port} 超时。"
    except OSError as error:
        return False, f"连接 {text}:{port} 失败：{error}"
