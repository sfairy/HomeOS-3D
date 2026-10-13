"""go2rtc 目标地址白名单与归一（纯函数，无框架依赖）。

摄像头来源还是「用户手填属性」的阶段，这个中继绝不能被当成通用 SSRF 代理，
因此只接受**字面量**私有/回环/链路本地 IP + ``/stream.html?src=…``。

放在 ``domains`` 而非 ``api`` 是为了让配置校验（``modules/interaction3d/config.py``）
与中继路由（``api/go2rtc.py``）共用同一份判定，而不产生 ``modules → api`` 的导入环。
"""

from __future__ import annotations

import ipaddress
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

#: src 查询参数的长度上限与禁用字符（避免 CRLF / 参数注入）。
MAX_SRC_LENGTH = 128
FORBIDDEN_SRC_CHARS = "\r\n&"


def normalize_go2rtc_target(value: Any) -> str:
    """把 go2rtc ``stream.html`` 地址归一成它的信令 WebSocket 地址。

    失败一律抛 ``ValueError``，文案直接面向用户（会出现在前端提示里）。
    """
    raw = str(value or "").strip()
    parsed = urlsplit(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("go2rtc 地址必须使用 http:// 或 https://。")
    if parsed.username or parsed.password:
        raise ValueError("go2rtc 地址不能包含账号或密码。")
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError as error:
        raise ValueError("试验版 go2rtc 地址必须使用局域网 IP。") from error
    if not (address.is_private or address.is_loopback or address.is_link_local):
        raise ValueError("试验版只允许连接局域网 go2rtc 地址。")
    if parsed.path.rstrip("/") != "/stream.html":
        raise ValueError("go2rtc 地址必须指向 /stream.html。")
    query = parse_qs(parsed.query, keep_blank_values=True)
    src = query.get("src", [""])[0].strip()
    if not src or len(src) > MAX_SRC_LENGTH or any(char in src for char in FORBIDDEN_SRC_CHARS):
        raise ValueError("go2rtc 地址必须包含有效的 src。")
    try:
        explicit_port = parsed.port
    except ValueError as error:
        raise ValueError("go2rtc 端口无效。") from error
    default_port = 80 if parsed.scheme == "http" else 443
    if not 1 <= (explicit_port or default_port) <= 65535:
        raise ValueError("go2rtc 端口无效。")
    host = parsed.hostname
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    netloc = host if explicit_port in {None, default_port} else f"{host}:{explicit_port}"
    return urlunsplit(
        (
            "wss" if parsed.scheme == "https" else "ws",
            netloc,
            "/api/ws",
            urlencode({"src": src}),
            "",
        )
    )


__all__ = ["FORBIDDEN_SRC_CHARS", "MAX_SRC_LENGTH", "normalize_go2rtc_target"]
