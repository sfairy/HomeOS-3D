"""go2rtc 目标地址白名单与归一（纯函数，无框架依赖）。

摄像头来源还是「用户手填属性」的阶段，这个中继绝不能被当成通用 SSRF 代理，
因此只接受**字面量**私有/回环/链路本地 IP + ``/stream.html?src=…``。

放在 ``domains`` 而非 ``api`` 是为了让配置校验（``modules/interaction3d/config.py``）
与中继路由（``api/go2rtc.py``）共用同一份判定，而不产生 ``modules → api`` 的导入环。

0.7.6 起面向对象的文案改成「网页播放地址 …」全称（旧版「试验版」措辞全部下线），
并补了非文本、超长、域名三类更早失败的判定。
"""

from __future__ import annotations

import ipaddress
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

#: 整条播放地址的长度上限。
MAX_URL_LENGTH = 2048
#: src 查询参数的长度上限与禁用字符（避免 CRLF / 参数注入）。
MAX_SRC_LENGTH = 128
FORBIDDEN_SRC_CHARS = "\r\n&"

#: 局域网字面量 IP 之外一律拒绝（域名、公网 IP 都不放行）。
_ALLOWED_SCHEMES = frozenset({"http", "https"})


def normalize_go2rtc_target(value: Any) -> str:
    """把 go2rtc ``stream.html`` 地址归一成它的信令 WebSocket 地址。

    失败一律抛 ``ValueError``，文案直接面向用户（会出现在前端提示里）。
    """
    if not isinstance(value, str):
        raise ValueError("go2rtc 网页播放地址必须是文本。")
    raw = value.strip()
    if not raw:
        raise ValueError(
            "go2rtc 网页播放地址不能为空，例如 "
            "http://192.168.1.100:1984/stream.html?src=camera1。"
        )
    if len(raw) > MAX_URL_LENGTH:
        raise ValueError(f"go2rtc 网页播放地址不能超过 {MAX_URL_LENGTH} 个字符。")
    try:
        parsed = urlsplit(raw)
    except ValueError as error:
        raise ValueError("go2rtc 网页播放地址格式不正确，请检查 IP 和端口。") from error
    hostname = parsed.hostname
    if parsed.scheme not in _ALLOWED_SCHEMES or not hostname:
        raise ValueError(
            "go2rtc 网页播放地址必须使用 http:// 或 https://，并填写完整 IP 地址。"
        )
    if parsed.username or parsed.password:
        raise ValueError("go2rtc 网页播放地址不能包含账号或密码。")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError as error:
        raise ValueError(
            "go2rtc 网页播放地址请使用 go2rtc 所在设备的局域网 IP，"
            "例如 192.168.1.100；暂不支持域名。"
        ) from error
    if not (address.is_private or address.is_loopback or address.is_link_local):
        raise ValueError("go2rtc 网页播放地址只支持局域网 IP，暂不支持公网 IP。")
    if parsed.path.rstrip("/") != "/stream.html":
        raise ValueError(
            "go2rtc 网页播放地址必须指向 /stream.html，例如 /stream.html?src=camera1。"
        )
    query = parse_qs(parsed.query, keep_blank_values=True)
    src = query.get("src", [""])[0].strip()
    if not src or len(src) > MAX_SRC_LENGTH or any(char in src for char in FORBIDDEN_SRC_CHARS):
        raise ValueError("go2rtc 网页播放地址必须包含有效的 src 流名称，例如 ?src=camera1。")
    try:
        explicit_port = parsed.port
    except ValueError as error:
        raise ValueError(
            "go2rtc 网页播放地址的端口无效，请填写 1–65535 之间的数字，例如 :1984。"
        ) from error
    default_port = 80 if parsed.scheme == "http" else 443
    if not 1 <= (explicit_port or default_port) <= 65535:
        raise ValueError(
            "go2rtc 网页播放地址的端口无效，请填写 1–65535 之间的数字，例如 :1984。"
        )
    host = hostname
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


__all__ = [
    "FORBIDDEN_SRC_CHARS",
    "MAX_SRC_LENGTH",
    "MAX_URL_LENGTH",
    "normalize_go2rtc_target",
]
