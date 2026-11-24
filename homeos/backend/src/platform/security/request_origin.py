"""针对不携带 JSON 请求体的写操作的浏览器来源防护。

CSRF 走「双提交 Cookie + 头部令牌」；对**无请求体**的写操作（如 ``/license/retry``）
额外要求浏览器来源校验：``Sec-Fetch-Site`` 必须同源，``Origin``/``Referer`` 必须与
当前站点一致。两者互补，本模块提供后者。

来源基准是「``settings.app_base_url``（反代 / 内网穿透部署时显式配置的对外地址）」**或**
「与本次请求的 Host 同站」—— 任一成立即放行同源。配置值不是唯一允许的地址：同一套服务
常同时被公网域名与局域网 IP 访问（用户就在现场），只认配置值会把另一个入口的写操作全拒掉。
"""

from __future__ import annotations

import logging
from ipaddress import ip_address
from urllib.parse import urlsplit

from fastapi import Request, WebSocket

from ..core.http.errors import RequestRejected
from ..core.http.hostnames import browser_reachable

logger = logging.getLogger(__name__)

_REJECTION = "此操作只允许从当前应用页面发起。"

#: 允许出现在主机名里的字符（IDNA 压缩后的形态）。出现其它字符一律判为非法来源。
_HOST_CHARS = frozenset("abcdefghijklmnopqrstuvwxyz0123456789-.")


def parse_origin(value: str, *, allow_path: bool = False) -> tuple[str, str, int] | None:
    """把浏览器来源规整成 ``(scheme, host, port)``；非法返回 ``None``。

    拒绝：凭据（``user:pass@``）、通配、逗号分隔的多来源、非 ASCII 主机名、
    越界端口，以及（``allow_path=False`` 时）任何路径 / 查询 / 片段。
    """
    if not value or "," in value or "\\" in value:
        return None
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    if parsed.username is not None or parsed.password is not None:
        return None
    if not allow_path and (parsed.path or parsed.query or parsed.fragment):
        return None
    host = (parsed.hostname or "").strip().lower()
    if not host or any(character not in _HOST_CHARS for character in host):
        return None
    try:
        port = parsed.port
    except ValueError:
        logger.debug("来源端口非法，按拒绝处理：%r", value)
        return None
    try:
        ip_address(host)
        normalized_host = host
    except ValueError:
        try:
            normalized_host = host.encode("idna").decode("ascii").casefold()
        except UnicodeError:
            logger.debug("来源主机名无法做 IDNA 规整，按拒绝处理：%r", value)
            return None
    scheme = parsed.scheme
    return scheme, normalized_host, port if port is not None else (443 if scheme == "https" else 80)


def _allowed_origins(settings) -> set[tuple[str, str, int]]:
    """允许来源集合 = 配置的额外来源 ∪ CORS 白名单 ∪ ``APP_BASE_URL``。"""
    candidates: list[str] = list(getattr(settings, "additional_public_origins", ()) or ())
    candidates.extend(getattr(settings, "allowed_origins", ()) or ())
    base = str(getattr(settings, "app_base_url", "") or "").strip()
    if base:
        candidates.append(base)
    parsed = {parse_origin(item) for item in candidates if isinstance(item, str)}
    return {item for item in parsed if item is not None}


def browser_origin_allowed(
    connection: Request | WebSocket,
    *,
    websocket: bool = False,
    public_report: bool = False,
) -> bool:
    """统一的浏览器来源判定（HTTP 写操作 / WebSocket 握手 / 匿名上报共用）。

    ``connection`` 允许 ``Request`` 或 ``WebSocket``：本函数只读 ``headers``、
    ``url.scheme`` 与 ``app.state.settings``，这两个类都有（Starlette 的 ``HTTPConnection``
    就是它们的公共基类）。原先只标 ``Request``，于是 WS 握手那条调用点必然被类型检查判成
    不兼容 —— 运行时一直是对的，错的只是标注。

    判据按强度递进：

    1. ``Sec-Fetch-Site`` 存在且不是 ``same-origin`` → 直接拒绝（浏览器自己算的，跨站伪造不了）；
    2. 取 ``Origin``（WS 必带；匿名上报允许只带 ``Referer``）；
    3. 无任何来源头 → 脚本 / 测试客户端放行，但**匿名上报与 WS 必须带**；
    4. 主机名等于本次请求的 ``Host`` → 同源，放行（覆盖反代把端口摘掉的部署）；
    5. 否则要求 ``(scheme, host, port)`` 命中配置的额外来源 / 白名单 / ``APP_BASE_URL``。
    """
    site = (connection.headers.get("sec-fetch-site") or "").strip().lower()
    if site and site != "same-origin":
        return False
    origin = connection.headers.get("origin")
    source = origin if origin is not None else connection.headers.get("referer")
    if not source:
        # 脚本 / 测试客户端没有来源头：HTTP 写操作放行（CSRF 另有双提交 Cookie 兜底）。
        # 匿名上报要求「带来源或至少带同源标记」——只靠网络层证据时，sendBeacon 在部分
        # 浏览器会省掉 Origin，此时 `Sec-Fetch-Site: same-origin` 是浏览器自己算的，够用。
        return not websocket and (not public_report or site == "same-origin")
    parsed = parse_origin(source, allow_path=origin is None)
    if parsed is None:
        return False
    scheme, host, port = parsed
    request_host = (connection.headers.get("host") or "").strip()
    if request_host and _same_host(host, port, request_host, scheme, connection.url.scheme):
        return True
    configured = _allowed_origins(connection.app.state.settings)
    return parsed in configured


def _same_host(host: str, port: int, request_host: str, scheme: str, request_scheme: str) -> bool:
    """来源主机是否就是本次请求的主机（端口缺失时按目标 scheme 的默认端口比对）。"""
    try:
        target = urlsplit(f"//{request_host}")
        target_host = (target.hostname or "").strip().lower()
        target_port = target.port
    except ValueError:
        logger.debug("请求 Host 无法解析，按不同源处理：%r", request_host)
        return False
    if target_host != host:
        return False
    expected_port = target_port if target_port is not None else (443 if scheme == "https" else 80)
    if port != expected_port:
        # 反代会把 Host 的端口摘掉，此时浏览器 Origin 带的是真实外部端口；
        # 只要 scheme 与请求协议一致（或 Sec-Fetch-Site 已判同源）就认。
        return scheme == request_scheme
    return True


def require_same_origin_write(request: Request) -> None:
    if not browser_origin_allowed(request):
        raise RequestRejected(_REJECTION)


def browser_origin(request: Request) -> str:
    """浏览器**正在用**的站点来源 ``scheme://host[:port]``；判不出来时返回空串。

    取值顺序变了，原因是这套系统同时有三个入口（局域网 HTTP、内置自签 HTTPS、公网域名），
    而 ``APP_BASE_URL`` 只能描述其中一个。原来的「配置值优先」会让局域网用户拿到的商店
    入口是公网域名 —— 穿透抖一下或离线时，明明同机的 ``:8802`` 就在旁边却点不开。

    所以：

    1. 请求的 ``Host`` 浏览器**可能**用（IP / 带点域名）→ 就用它 —— 这是用户此刻真实
       在用的那个地址，也是唯一能保证「点了就能打开」的那个；
    2. ``Host`` 只是容器内部名（反代没透传 ``Host`` 时会变成 ``homeos`` / ``127.0.0.1``）
       → 退回 ``APP_BASE_URL``；
    3. 两者都没有 → 空串。

    这个值只用于**拼给浏览器打开的绝对地址**（商店入口），不参与安全判定 —— 来源校验在
    :func:`require_same_origin_write` 里另有更严格的判据。
    """
    state = getattr(getattr(request, "app", None), "state", None)
    configured = str(getattr(getattr(state, "settings", None), "app_base_url", "") or "").strip()
    host = request.headers.get("host", "").strip()
    if host:
        try:
            hostname = (urlsplit(f"//{host}").hostname or "").strip()
        except ValueError:
            hostname = ""
        if hostname and browser_reachable(hostname):
            return f"{request.url.scheme}://{host}"
    if configured:
        return configured.rstrip("/")
    return f"{request.url.scheme}://{host}" if host else ""


__all__ = ["browser_origin", "browser_origin_allowed", "parse_origin", "require_same_origin_write"]
