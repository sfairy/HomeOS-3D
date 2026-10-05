"""MoviePilot 透明代理服务（对齐 ``ops/system-moviepilot-proxy.service.ts``）。

职责：把前端的图片 / 接口请求透明转发到外部 MoviePilot 服务，解决跨域问题。
安全：代理路径防目录穿越 + 图片 URL 防 SSRF（DNS 解析后逐地址校验私网/回环）。

与 Nest 的差异：Nest 直接写 Express ``res``；此处返回 ``ProxyResult``，由路由层
转成 Starlette ``Response``，保持服务层不依赖具体 Web 框架。
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import posixpath
import re
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urlparse

from ....core.errors import (
    BusinessException,
    ErrorCode,
    api_error,
    bad_request,
    not_found,
)
from .upstream import UpstreamResponse, fetch_raw

logger = logging.getLogger("homeos.system.ops.moviepilot")

#: 解析 IP 的回调签名（返回 ``None`` 表示解析失败，保守拒绝）
ResolveHost = Callable[[str], Awaitable[list[str] | None]]

_IPV4_MAPPED_DOTTED = re.compile(r"^::ffff:(?:\d+:)?(\d{1,3}(?:\.\d{1,3}){3})$", re.IGNORECASE)


@dataclass
class ProxyResult:
    """代理结果（状态码 + 字节体 + 待透传响应头）。"""

    status: int
    body: bytes = b""
    headers: dict[str, str] | None = None


def _internal_error(message: str) -> BusinessException:
    """Nest ``InternalServerErrorException(message)`` 等价（errorCode=UNKNOWN / 500）。"""
    return BusinessException(ErrorCode.UNKNOWN, message, 500)


def _not_found_error(message: str) -> BusinessException:
    """Nest ``notFound(message)`` 等价（errorCode=NOT_FOUND / 404）。"""
    return BusinessException(ErrorCode.NOT_FOUND, message)


def _js_truthy(value: Any) -> bool:
    """对齐 JS 真值判定：``{}`` / ``[]`` 为真，``None`` / ``False`` / ``0`` / ``''`` 为假。"""
    if value is None or value is False:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0 and value == value  # 0 与 NaN 为假
    if isinstance(value, str):
        return value != ""
    return True


def is_safe_proxy_path(sub_path: str) -> bool:
    """校验代理子路径安全性（防目录穿越）。"""
    if any(segment in ("..", ".", "") for segment in sub_path.split("/")):
        return False
    normalized = posixpath.normpath("/" + sub_path)
    expected = "/" + sub_path.rstrip("/")
    return normalized in (expected, posixpath.normpath(expected))


def is_unsafe_ip(ip: str) -> bool:
    """单个 IP 是否为回环/私网/链路本地/保留地址（覆盖 IPv4 与 IPv6）。"""
    mapped = _IPV4_MAPPED_DOTTED.match(ip)
    addr = mapped.group(1) if mapped else ip
    try:
        parsed = ipaddress.ip_address(addr)
    except ValueError:
        return False
    if parsed.version == 4:
        parts = [int(part) for part in addr.split(".")]
        a, b, c = parts[0], parts[1], parts[2]
        if a == 0:  # 0.0.0.0/8 本网络
            return True
        if a == 10:  # 10.0.0.0/8 私网
            return True
        if a == 100 and 64 <= b <= 127:  # 100.64.0.0/10 运营商级 NAT
            return True
        if a == 127:  # 127.0.0.0/8 回环
            return True
        if a == 169 and b == 254:  # 169.254.0.0/16 链路本地
            return True
        if a == 172 and 16 <= b <= 31:  # 172.16.0.0/12 私网
            return True
        if a == 192 and b == 0:  # 192.0.0.0/16（含 TEST-NET-1）
            return True
        if a == 192 and b == 168:  # 192.168.0.0/16 私网
            return True
        if a == 198 and b in (18, 19):  # 198.18.0.0/15 基准测试
            return True
        if a == 198 and b == 51 and c == 100:  # 198.51.100.0/24 TEST-NET-2
            return True
        if a == 203 and b == 0 and c == 113:  # 203.0.113.0/24 TEST-NET-3
            return True
        return a >= 224  # 组播 / 保留
    text = addr.lower()
    if text in ("::", "::1"):
        return True
    if re.match(r"^fe[89ab]", text):  # fe80::/10 链路本地
        return True
    if re.match(r"^f[cd]", text):  # fc00::/7 唯一本地
        return True
    if text.startswith("2001:db8:"):  # 2001:db8::/32 文档保留
        return True
    return text.startswith("ff")  # ff00::/8 组播


class MoviePilotProxyService:
    """MoviePilot 代理服务。"""

    def __init__(
        self,
        ui_config: Any,
        *,
        http_fetch: Callable[..., Awaitable[UpstreamResponse]] | None = None,
        resolve_host: ResolveHost | None = None,
    ) -> None:
        self._ui_config = ui_config
        self._http_fetch = http_fetch or fetch_raw
        self._resolve_host = resolve_host or _default_resolve_host

    # ------------------------------------------------------------------ #
    # 目标解析
    # ------------------------------------------------------------------ #
    def get_moviepilot_url(self) -> str:
        """读取 UI 配置 ``layout.moviePilotUrl``（去末尾斜杠）。"""
        project_id = self._ui_config.resolve_active_project_id()
        config = self._ui_config.get_config(project_id)
        # 与 Nest 一致：`!config || !config.layout` 走 JS 真值判定（空对象 {} 视为真值）
        if not _js_truthy(config) or not _js_truthy(
            config.get("layout") if isinstance(config, dict) else None
        ):
            raise _internal_error(api_error("SYSTEM_CONFIG_NOT_FOUND"))

        try:
            layout, parse_error = self._ui_config.parse_layout_field(config.get("layout"))
            if parse_error:
                raise _internal_error(api_error("SYSTEM_INVALID_LAYOUT"))
            url = layout.get("moviePilotUrl")
            if not url:
                not_found(api_error("MOVIEPILOT_URL_NOT_CONFIGURED"))
            return str(url).rstrip("/")
        except BusinessException:
            raise
        except Exception as exc:  # noqa: BLE001 - 解析失败统一 500
            logger.error("解析布局配置失败:%s", exc)
            raise _internal_error(api_error("SYSTEM_INVALID_LAYOUT")) from exc

    async def is_safe_img_url(self, url: str) -> bool:
        """图片 URL 安全性校验（防 SSRF）。"""
        if not url:
            return False
        try:
            parsed = urlparse(url)
        except ValueError:
            return False
        if parsed.scheme not in ("http", "https"):
            return False
        raw_hostname = parsed.hostname or ""
        hostname = (
            raw_hostname[1:-1]
            if raw_hostname.startswith("[") and raw_hostname.endswith("]")
            else raw_hostname
        )
        if hostname in ("localhost", "127.0.0.1", "::1"):
            return False
        addresses = await self._resolve_host(hostname)
        if not addresses:
            # DNS 无法解析时保守拒绝，避免通过解析绕过
            return False
        return all(not is_unsafe_ip(address) for address in addresses)

    # ------------------------------------------------------------------ #
    # 代理
    # ------------------------------------------------------------------ #
    async def proxy_image(
        self, img_url: str, incoming_headers: dict[str, Any] | None = None
    ) -> ProxyResult:
        """代理 MoviePilot 图像请求（SSRF 校验 → 拉取二进制 → 透传内容类型）。"""
        if not await self.is_safe_img_url(img_url):
            bad_request(api_error("SYSTEM_INVALID_IMAGE_URL"))
        base_url = self.get_moviepilot_url()
        target_url = (
            f"{base_url}/api/v1/system/img/0?imgurl={quote(str(img_url), safe='')}"
        )
        logger.debug("正在代理图像请求到:%s", target_url)

        headers = filter_forward_headers(incoming_headers)
        try:
            response = await self._http_fetch(
                target_url, headers=headers, timeout=10.0, follow_redirects=False
            )
        except Exception as exc:  # noqa: BLE001 - 网络中断 → 404（对齐 Nest catch）
            logger.error("从 %s 代理图像失败:%s", target_url, exc)
            raise _not_found_error(api_error("MOVIEPILOT_PROXY_IMAGE_FAILED")) from exc
        if response.status >= 400:
            logger.error("从 %s 代理图像失败:HTTP %s", target_url, response.status)
            raise _not_found_error(api_error("MOVIEPILOT_PROXY_IMAGE_FAILED"))

        out_headers: dict[str, str] = {}
        content_type = response.header("content-type")
        if content_type:
            out_headers["Content-Type"] = content_type
        cache_control = response.header("cache-control")
        out_headers["Cache-Control"] = cache_control or "public, max-age=3600"
        return ProxyResult(status=200, body=response.body, headers=out_headers)

    async def proxy_system_api(
        self,
        path: str,
        method: str,
        query: dict[str, Any] | None = None,
        body: Any = None,
        incoming_headers: dict[str, Any] | None = None,
    ) -> ProxyResult:
        """通用 GET/POST 转发（透传目标状态码与响应体）。"""
        if not is_safe_proxy_path(path):
            bad_request(api_error("SYSTEM_INVALID_API_PATH"))
        base_url = self.get_moviepilot_url()
        target_url = f"{base_url}/api/v1/system/{path}"
        logger.debug("代理 %s 请求到:%s", method, target_url)

        headers = filter_forward_headers(incoming_headers)
        params = {str(key): value for key, value in (query or {}).items()}
        try:
            response = await self._http_fetch(
                target_url,
                method=method,
                params=params,
                json_body=body,
                headers=headers,
                timeout=5.0,
                follow_redirects=False,
            )
        except Exception as exc:  # noqa: BLE001 - 非响应型错误 → 502
            logger.error("从 %s 代理 API 失败 [UNKNOWN]:%s", target_url, exc)
            raise BusinessException(
                ErrorCode.EXTERNAL_ERROR, api_error("MOVIEPILOT_PROXY_IMAGE_FAILED")
            ) from exc

        # 透传目标服务的状态码 + 响应体
        return ProxyResult(
            status=response.status,
            body=response.body,
            headers={"Content-Type": response.header("content-type") or "application/json"},
        )


#: 不应转发的请求头（避免干扰目标服务）
FORWARD_HEADER_EXCLUDE = frozenset(
    {"host", "connection", "content-length", "content-encoding", "transfer-encoding"}
)


def filter_forward_headers(incoming_headers: dict[str, Any] | None) -> dict[str, str]:
    """过滤待转发的请求头（移除 host / connection 等）。"""
    out: dict[str, str] = {}
    for key, value in (incoming_headers or {}).items():
        if key.lower() in FORWARD_HEADER_EXCLUDE:
            continue
        if isinstance(value, str):
            out[key] = value
        elif isinstance(value, (list, tuple)) and value:
            out[key] = str(value[0])
    return out


async def _default_resolve_host(host: str) -> list[str] | None:
    """解析主机名的全部地址（失败返回 ``None``，对齐 ``dns.promises.lookup`` 抛错）。"""
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except (socket.gaierror, OSError, UnicodeError):
        return None
    return sorted({info[4][0] for info in infos})


__all__ = [
    "FORWARD_HEADER_EXCLUDE",
    "MoviePilotProxyService",
    "ProxyResult",
    "filter_forward_headers",
    "is_safe_proxy_path",
    "is_unsafe_ip",
]
