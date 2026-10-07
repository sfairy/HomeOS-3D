"""内嵌页反代工具集（对齐 ``common/embed/proxy.util.ts``、``proxy-forward.util.ts``、
``common/http-security/spa-fallback.middleware.ts`` 的 ``STATIC_MIME`` 与
``packages/shared/src/embed/fallback-core.util.ts``）。

覆盖：
- 目标 URL 安全校验（仅允许局域网，防 SSRF）；
- 反代前缀构造（HTTP / WebSocket）；
- 请求头改写（Referer / Origin / Cookie）；
- 响应头改写（Location 重定向 / Set-Cookie Path 收敛）；
- HTML / JS / CSS 内容改写（根相对路径 / 同源绝对地址 / base 前缀 / 运行时垫片）。
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import quote, unquote, urlsplit

from ..security.cookies import is_lan_origin
from .errors import api_error, bad_request

#: 静态资源扩展名 → MIME 类型（对齐 ``STATIC_MIME``）
STATIC_MIME: dict[str, str] = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".cjs": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".map": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".mp3": "audio/mpeg",
}

#: 转发上游响应时需剥离的响应头（CSP / referrer / 压缩相关）
EMBED_PROXY_STRIP_RESPONSE_HEADERS = frozenset(
    {
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "referrer-policy",
        "transfer-encoding",
        "connection",
        "content-encoding",
        "content-length",
    }
)

#: 转发给上游请求时需剔除的请求头（压缩协商 / 转发头 / HomeOS 注入头）
EMBED_PROXY_SKIP_REQUEST_HEADERS = frozenset(
    {
        "host",
        "connection",
        "content-length",
        "content-encoding",
        "transfer-encoding",
        "accept-encoding",
        "x-forwarded-for",
        "x-forwarded-proto",
        "x-forwarded-host",
        "x-forwarded-port",
        "x-forwarded-server",
        "forwarded",
        "x-real-ip",
    }
)

#: HomeOS 自身的鉴权/CSRF cookie，不可泄露给被反代的内嵌站
HOMEOS_PRIVATE_COOKIES = frozenset({"auth_token", "csrf_token"})
#: HomeOS 内部 Cookie 名前缀（内嵌上下文标记）
HOMEOS_PRIVATE_COOKIE_PREFIX = "embed_ctx__"
#: HomeOS 用户/UI 态 cookie，对内嵌站无意义
HOMEOS_NON_AUTH_COOKIES = frozenset(
    {"fusra_session_id", "fusra_user_info", "lastloginusername", "trim-mc-token"}
)

#: 根相对静态资源引用的扩展名（据扩展名识别 JS/CSS 里的资源引用）
EMBED_STATIC_ASSET_EXT = (
    "js|mjs|cjs|css|json|wasm|map|woff2?|ttf|otf|eot|png|jpe?g|svg|gif|webp|avif|ico|mp3|mp4|webm|ogg"
)

_HOMEOS_FRONTEND_RESOURCE_PREFIXES = (
    "/assets/",
    "/backgrounds/",
    "/icons/",
    "/sounds/",
    "/logo/",
)
_HOMEOS_FRONTEND_ROOT_FILES = frozenset({"/manifest.json", "/sw.js"})
_STATIC_RESOURCE_EXTENSIONS = frozenset(STATIC_MIME)

_DEFAULT_PORTS = {"http": 80, "https": 443, "ws": 80, "wss": 443}


def escape_reg_exp(text: str) -> str:
    """对齐 ``escapeRegExp``（正则元字符转义）。"""
    return re.sub(r"[.*+?^${}()|\[\]\\]", lambda m: "\\" + m.group(0), text)


# --------------------------------------------------------------------------- #
# URL 解析与安全校验
# --------------------------------------------------------------------------- #
def url_origin(url: str) -> str:
    """返回 ``scheme://host[:port]``（默认端口省略，等价 JS ``URL.origin``）。"""
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    host = parts.hostname or ""
    if not scheme or not host:
        return url
    if ":" in host:  # IPv6 需回填方括号
        host = f"[{host}]"
    port = parts.port
    if port is None or _DEFAULT_PORTS.get(scheme) == port:
        return f"{scheme}://{host}"
    return f"{scheme}://{host}:{port}"


def url_host(url: str) -> str:
    """返回 ``host[:port]``（默认端口省略，等价 JS ``URL.host``）。"""
    parts = urlsplit(url)
    host = parts.hostname or ""
    if ":" in host:
        host = f"[{host}]"
    port = parts.port
    if port is None or _DEFAULT_PORTS.get(parts.scheme.lower()) == port:
        return host
    return f"{host}:{port}"


def validate_embed_target_url(url_string: str):
    """校验内嵌反代目标 URL（仅允许 http(s) 局域网地址，防 SSRF）。"""
    trimmed = (url_string or "").strip()
    if not trimmed:
        bad_request(api_error("EMBED_URL_MISSING"))
    parts = urlsplit(trimmed)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        if not parts.scheme and not parts.hostname:
            bad_request(api_error("EMBED_URL_INVALID"))
        bad_request(api_error("EMBED_URL_PROTOCOL"))
    host = (parts.hostname or "").lower().replace("[", "").replace("]", "")
    if host in ("localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1"):
        bad_request(api_error("EMBED_URL_LOCALHOST"))
    if not is_lan_origin(url_origin(trimmed)):
        bad_request(api_error("EMBED_URL_LAN_ONLY"))
    return parts


def is_embed_same_origin_as_request(
    embed_base: str, req_host: str | None, req_secure: bool = False
) -> bool:
    """内嵌目标与当前请求是否同一 origin（用于本地 dist 伺服短路）。"""
    try:
        embed_origin = url_origin(embed_base)
        host = str(req_host or "").strip()
        if not host:
            return False
        protocol = "https" if req_secure else "http"
        req_origin = (
            url_origin(host) if "://" in host else url_origin(f"{protocol}://{host}")
        )
        return embed_origin == req_origin
    except Exception:  # noqa: BLE001
        return False


def is_frontend_dist_asset_path(sub_path: str) -> bool:
    """是否为前端 dist 下的静态资源路径（``/assets/...``）。"""
    path = (sub_path or "/").split("?")[0].split("#")[0]
    return path.startswith("/assets/")


def build_embed_upstream_url(base: str, sub_path: str, search: str) -> str:
    """拼接转发给上游的完整 URL：base + subPath + search。"""
    clean_base = base.rstrip("/") if base.endswith("/") else base
    path = sub_path or "/"
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{clean_base}{path}{search or ''}"


def build_embed_proxy_prefix(embed_id: str) -> str:
    """构造内嵌页 HTTP 反代前缀：``/api/v1/embed-proxy/<embedId>/``。"""
    return f"/api/v1/embed-proxy/{quote(str(embed_id), safe='')}/"


def build_embed_ws_proxy_prefix(embed_id: str) -> str:
    """内嵌页 WebSocket 反代前缀（无末尾斜杠，与 HTTP 前缀同根）。"""
    return f"/api/v1/embed-proxy/{quote(str(embed_id), safe='')}"


def get_embed_upstream_origin(embed_base: str) -> str:
    """上游内嵌站的 origin（协议+主机）。"""
    try:
        return url_origin(embed_base)
    except Exception:  # noqa: BLE001
        return embed_base


# --------------------------------------------------------------------------- #
# 请求头改写
# --------------------------------------------------------------------------- #
def rewrite_embed_referer(referer: str | None, embed_base: str, proxy_prefix: str) -> str:
    """把转发给上游的 Referer 由反代地址还原为内嵌站真实地址。"""
    upstream_origin = get_embed_upstream_origin(embed_base)
    if not referer:
        return f"{upstream_origin}/"
    prefix_no_slash = proxy_prefix[:-1] if proxy_prefix.endswith("/") else proxy_prefix
    index = referer.find(prefix_no_slash)
    if index >= 0:
        after = referer[index + len(prefix_no_slash) :]
        suffix = after if after.startswith("/") else f"/{after}"
        return f"{upstream_origin}{suffix}"
    return f"{upstream_origin}/"


def rewrite_embed_location(location: str, embed_base: str, proxy_prefix: str) -> str:
    """改写上游响应的 Location 头（同源绝对地址 → 反代前缀下的相对路径）。"""
    try:
        base_origin = url_origin(embed_base + "/")
        proxy_root = proxy_prefix[:-1] if proxy_prefix.endswith("/") else proxy_prefix
        try:
            loc = _resolve_url(location, embed_base + "/")
        except ValueError:
            return rewrite_embed_same_origin_urls(location, embed_base, proxy_root)
        if loc is not None and url_origin(loc) == base_origin:
            suffix = _url_suffix(loc)
            path_part = suffix[1:] if suffix.startswith("/") else suffix
            return rewrite_embed_same_origin_urls(
                f"{proxy_prefix}{path_part}", embed_base, proxy_root
            )
        # 跨域跳转：地址本身不动，但其查询串里仍可能含上游同源地址
        return rewrite_embed_same_origin_urls(location, embed_base, proxy_root)
    except Exception:  # noqa: BLE001
        return location


def rewrite_embed_set_cookie(cookie: str, proxy_prefix: str, request_secure: bool = True) -> str:
    """改写上游 Set-Cookie（去 Domain、Path 收敛到反代前缀、HTTP 下剥离 Secure）。"""
    prefix_no_slash = proxy_prefix[:-1] if proxy_prefix.endswith("/") else proxy_prefix
    parts = [part.strip() for part in cookie.split(";") if part.strip()]
    out: list[str] = []
    has_path = False
    for part in parts:
        eq = part.find("=")
        key = (part[:eq] if eq >= 0 else part).strip().lower()
        if key == "domain":
            continue
        if key == "secure" and not request_secure:
            continue
        if key == "samesite" and not request_secure:
            raw_val = part[eq + 1 :].strip().lower() if eq >= 0 else ""
            out.append("SameSite=Lax" if raw_val == "none" else part)
            continue
        if key == "path":
            raw_val = part[eq + 1 :].strip() if eq >= 0 else "/"
            norm = raw_val if raw_val.startswith("/") else f"/{raw_val}"
            out.append(f"Path={prefix_no_slash}{norm}")
            has_path = True
            continue
        out.append(part)
    if not has_path:
        out.append(f"Path={prefix_no_slash}/")
    return "; ".join(out)


def strip_homeos_cookies(cookie_header: str | None) -> str | None:
    """仅剔除 HomeOS 自身的 cookie，保留内嵌站自身的会话 cookie。"""
    if not cookie_header:
        return None
    kept: list[str] = []
    for cookie in cookie_header.split(";"):
        cookie = cookie.strip()
        name = cookie.split("=")[0].strip().lower()
        if not name:
            continue
        if name in HOMEOS_PRIVATE_COOKIES:
            continue
        if name in HOMEOS_NON_AUTH_COOKIES:
            continue
        if name.startswith(HOMEOS_PRIVATE_COOKIE_PREFIX):
            continue
        kept.append(cookie)
    return "; ".join(kept) if kept else None


def build_embed_forward_body(
    method: str, content_type: str | None, body: Any, raw_body: bytes | None = None
) -> bytes | str | None:
    """按 content-type 重建转发给上游的请求体。"""
    upper = (method or "GET").upper()
    if upper in ("GET", "HEAD"):
        return None
    if body is None:
        return None
    ct = (content_type or "").lower()
    if raw_body is not None and len(raw_body) > 0 and "json" in ct:
        return raw_body
    if isinstance(body, str):
        return body if body else None
    if isinstance(body, (bytes, bytearray)):
        return bytes(body) if len(body) else None
    if isinstance(body, dict):
        if not body:
            return None
        if "application/x-www-form-urlencoded" in ct:
            from urllib.parse import urlencode  # noqa: PLC0415 - 仅表单路径需要

            encoded = urlencode(
                {str(k): "" if v is None else str(v) for k, v in body.items()}
            )
            return encoded or None
        return json.dumps(body, ensure_ascii=False)
    return None


# --------------------------------------------------------------------------- #
# 内容改写
# --------------------------------------------------------------------------- #
def rewrite_embed_same_origin_urls(content: str, embed_base: str, proxy_root: str) -> str:
    """把内嵌站的同源绝对 URL（含转义/百分号/协议相对形式）改写为反代根路径。"""
    try:
        origin = url_origin(embed_base + "/")
        host = url_host(embed_base + "/")
    except Exception:  # noqa: BLE001
        return content
    out = re.sub(escape_reg_exp(origin), proxy_root, content, flags=re.IGNORECASE)
    escaped_slash_origin = origin.replace("/", "\\/")
    out = re.sub(
        escape_reg_exp(escaped_slash_origin), proxy_root, out, flags=re.IGNORECASE
    )
    encoded_origin = quote(origin, safe="")
    out = re.sub(escape_reg_exp(encoded_origin), proxy_root, out, flags=re.IGNORECASE)
    out = re.sub(
        rf"(?<!:)//{escape_reg_exp(host)}", proxy_root, out, flags=re.IGNORECASE
    )
    return out


def rewrite_embed_ws_urls(content: str, embed_base: str, ws_proxy_prefix: str) -> str:
    """将内嵌站 ws(s):// 绝对地址改写为同源反代路径。"""
    try:
        parts = urlsplit(embed_base + "/")
        scheme = "wss" if parts.scheme == "https" else "ws"
        ws_origin = f"{scheme}://{url_host(embed_base + '/')}"
    except Exception:  # noqa: BLE001
        return content
    return re.sub(
        rf"{escape_reg_exp(ws_origin)}([^\"'\s]*)",
        lambda m: f"{ws_proxy_prefix}{m.group(1) or ''}",
        content,
        flags=re.IGNORECASE,
    )


def rewrite_embed_root_relative_html(html: str, proxy_root: str) -> str:
    """改写 HTML 标签属性里的根相对 URL（须在注入 ``<base>`` 前执行）。"""

    def _attr(match: re.Match[str]) -> str:
        attr, quote_char, value = match.group(1), match.group(2), match.group(3)
        if value == proxy_root or value.startswith(f"{proxy_root}/"):
            return match.group(0)
        return f"{attr}={quote_char}{proxy_root}{value}{quote_char}"

    out = re.sub(
        r"\b(href|src|action|formaction|poster|data-src|data-href)\s*=\s*([\"'])(/(?!/)[^\"']*)\2",
        _attr,
        html,
        flags=re.IGNORECASE,
    )

    def _srcset(match: re.Match[str]) -> str:
        quote_char, value = match.group(1), match.group(2)
        rewritten = re.sub(
            r"(^|,\s*)/(?!/)", lambda m: f"{m.group(1)}{proxy_root}/", value
        )
        return f"srcset={quote_char}{rewritten}{quote_char}"

    return re.sub(r"\bsrcset\s*=\s*([\"'])([^\"']*)\1", _srcset, out, flags=re.IGNORECASE)


def rewrite_embed_root_relative_asset_paths(content: str, proxy_root: str) -> str:
    """改写 JS/CSS/HTML 中根相对的静态资源引用（按扩展名识别）。"""

    def _prefixed(path: str) -> bool:
        return f"/{path}" == proxy_root or f"/{path}".startswith(f"{proxy_root}/")

    def _quoted(match: re.Match[str]) -> str:
        quote_char, path = match.group(1), match.group(2)
        return match.group(0) if _prefixed(path) else f"{quote_char}{proxy_root}/{path}"

    out = re.sub(
        rf"([\"'`])/(?!/)([^\"'`\s?#]*?\.(?:{EMBED_STATIC_ASSET_EXT}))",
        _quoted,
        content,
        flags=re.IGNORECASE,
    )

    def _unquoted(match: re.Match[str]) -> str:
        prefix, path = match.group(1), match.group(2)
        return match.group(0) if _prefixed(path) else f"{prefix}{proxy_root}/{path}"

    return re.sub(
        rf"(url\(\s*)/(?!/)([^)'\"\s?#]*?\.(?:{EMBED_STATIC_ASSET_EXT}))",
        _unquoted,
        out,
        flags=re.IGNORECASE,
    )


def rewrite_embed_app_base_path(content: str, base_path: str | None, proxy_root: str) -> str:
    """把基路径型 SPA 的 base 前缀（如 ``/p``）重写到反代前缀之下。"""
    if not base_path:
        return content
    clean = base_path.split("?")[0].split("#")[0].rstrip("/")
    if not clean:
        return content
    escaped = escape_reg_exp(clean)
    return re.sub(
        rf"([\"'`]){escaped}(?=[/?#\"'`]|\$\{{)",
        lambda m: f"{m.group(1)}{proxy_root}{clean}",
        content,
    )


def build_embed_runtime_shim_script(prefix: str) -> str:
    """注入内嵌页的运行时垫片（拦截 fetch / XHR / SSE / WS 的根相对地址）。"""
    return _RUNTIME_SHIM_TEMPLATE.replace("__PREFIX__", prefix)


def build_embed_doc_base_href(proxy_prefix: str, doc_sub_path: str | None) -> str:
    """计算当前文档在反代下的 ``<base>`` 地址。"""
    root = proxy_prefix if proxy_prefix.endswith("/") else f"{proxy_prefix}/"
    path = (doc_sub_path or "/").split("?")[0].split("#")[0]
    if path.startswith("/"):
        path = path[1:]
    last_slash = path.rfind("/")
    directory = path[: last_slash + 1] if last_slash >= 0 else ""
    return f"{root}{directory}"


def rewrite_embed_html(
    html: str,
    embed_base: str,
    proxy_prefix: str,
    embed_id: str | None = None,
    doc_sub_path: str | None = None,
    base_path: str | None = None,
) -> str:
    """注入 base + 运行时垫片并改写同源绝对 URL（HTTPS 父页加载 HTTP 内嵌站）。"""
    ws_proxy_prefix = build_embed_ws_proxy_prefix(embed_id) if embed_id else ""
    proxy_root = proxy_prefix[:-1] if proxy_prefix.endswith("/") else proxy_prefix
    base_href = build_embed_doc_base_href(proxy_prefix, doc_sub_path)
    base_tag = f'<base href="{base_href}">'
    referrer_meta = '<meta name="referrer" content="unsafe-url">'
    ws_shim = build_embed_runtime_shim_script(proxy_root) if embed_id else ""
    head_injection = f"{base_tag}{referrer_meta}{ws_shim}"

    # 先在原始 HTML 上重写根相对属性 URL（须早于注入 <base>）
    out = rewrite_embed_root_relative_html(html, proxy_root)
    out = re.sub(
        r'<meta[^>]+name=["\']referrer["\'][^>]*>', "", out, flags=re.IGNORECASE
    )
    if re.search(r"<head[^>]*>", out, flags=re.IGNORECASE):
        out = re.sub(
            r"<head([^>]*)>",
            lambda m: f"<head{m.group(1)}>{head_injection}",
            out,
            count=1,
            flags=re.IGNORECASE,
        )
    elif re.search(r"<html[^>]*>", out, flags=re.IGNORECASE):
        out = re.sub(
            r"<html([^>]*)>",
            lambda m: f"<html{m.group(1)}><head>{head_injection}</head>",
            out,
            count=1,
            flags=re.IGNORECASE,
        )
    else:
        out = head_injection + out
    # ws(s):// 须先改写（其同源地址含 //host，避免被同源 URL 改写截断）
    if ws_proxy_prefix:
        out = rewrite_embed_ws_urls(out, embed_base, ws_proxy_prefix)
    out = rewrite_embed_same_origin_urls(out, embed_base, proxy_root)
    out = rewrite_embed_root_relative_asset_paths(out, proxy_root)
    return rewrite_embed_app_base_path(out, base_path, proxy_root)


def rewrite_embed_asset_content(
    content: str, embed_base: str, embed_id: str, base_path: str | None = None
) -> str:
    """改写静态资源（JS/CSS/JSON）内容（不注入 base / 垫片）。"""
    ws_proxy_prefix = build_embed_ws_proxy_prefix(embed_id)
    proxy_root = build_embed_proxy_prefix(embed_id)
    proxy_root = proxy_root[:-1] if proxy_root.endswith("/") else proxy_root
    out = rewrite_embed_ws_urls(content, embed_base, ws_proxy_prefix)
    out = rewrite_embed_same_origin_urls(out, embed_base, proxy_root)
    out = rewrite_embed_root_relative_asset_paths(out, proxy_root)
    return rewrite_embed_app_base_path(out, base_path, proxy_root)


def is_html_content_type(content_type: str | None) -> bool:
    """Content-Type 是否为 HTML（含 XHTML）。"""
    ct = (content_type or "").lower()
    return "text/html" in ct or "application/xhtml" in ct


def is_embed_rewriteable_content_type(content_type: str | None) -> bool:
    """Content-Type 是否需要内容改写（HTML / JS / CSS / JSON）。"""
    if not content_type:
        return False
    ct = content_type.lower()
    if is_html_content_type(ct):
        return True
    return any(
        key in ct for key in ("javascript", "ecmascript", "json", "css")
    )


# --------------------------------------------------------------------------- #
# 逃逸子资源兜底（对齐 shared/embed/fallback-core.util.ts）
# --------------------------------------------------------------------------- #
def _header_value(value: Any) -> str:
    if isinstance(value, (list, tuple)):
        return str(value[0]) if value else ""
    return str(value or "")


def is_homeos_frontend_resource_path(url_path: str) -> bool:
    """路径是否为 HomeOS 前端自有静态资源（不应被兜底重定向劫持）。"""
    path = str(url_path or "").split("?")[0]
    if not path.startswith("/"):
        return False
    if path in _HOMEOS_FRONTEND_ROOT_FILES:
        return True
    return any(path.startswith(prefix) for prefix in _HOMEOS_FRONTEND_RESOURCE_PREFIXES)


def path_extname(url_path: str) -> str:
    """URL 路径扩展名（剔除 query；无扩展名返回空串）。"""
    clean = str(url_path or "").split("?")[0]
    slash = clean.rfind("/")
    dot = clean.rfind(".")
    if dot <= slash:
        return ""
    return clean[dot:].lower()


def is_embed_fallback_navigation_dest(method: str, path: str, headers: dict[str, Any]) -> bool:
    """顶层文档/子框架导航不应被内嵌反代兜底劫持。"""
    dest = _header_value(headers.get("sec-fetch-dest")).lower()
    if dest in ("document", "iframe", "frame"):
        return True
    if not dest and (method or "GET").upper() == "GET":
        return path_extname(path) not in _STATIC_RESOURCE_EXTENSIONS
    return False


def parse_embed_id_from_referer(referer: str) -> str | None:
    """从 Referer 头解析内嵌反代 embedId。"""
    match = re.search(r"/api/v1/embed-proxy/([^/?#]+)", str(referer or ""))
    if not match:
        return None
    raw = match.group(1)
    try:
        return unquote(raw)
    except Exception:  # noqa: BLE001
        return raw


def parse_embed_id_from_context_cookie(cookie_header: str | None) -> str | None:
    """从 ``embed_ctx__{id}`` Cookie 解析内嵌上下文 embedId。"""
    match = re.search(r"(?:^|;\s*)embed_ctx__([^=;]+)=", str(cookie_header or ""))
    if not match:
        return None
    raw = match.group(1)
    try:
        return unquote(raw)
    except Exception:  # noqa: BLE001
        return raw


def resolve_embed_proxy_fallback_redirect(
    method: str, path: str, original_url: str, headers: dict[str, Any]
) -> dict[str, str] | None:
    """非 /api 的逃逸子资源请求是否应 307 重定向回内嵌反代前缀。"""
    if is_embed_fallback_navigation_dest(method, path, headers):
        return None
    if is_homeos_frontend_resource_path(path):
        return None

    original = original_url or path
    ref_embed_id = parse_embed_id_from_referer(_header_value(headers.get("referer")))
    if ref_embed_id:
        return {
            "embedId": ref_embed_id,
            "targetUrl": f"/api/v1/embed-proxy/{ref_embed_id}{original}",
        }

    referer = _header_value(headers.get("referer"))
    if not referer:
        cookie_embed_id = parse_embed_id_from_context_cookie(
            _header_value(headers.get("cookie"))
        )
        if cookie_embed_id:
            return {
                "embedId": cookie_embed_id,
                "targetUrl": f"/api/v1/embed-proxy/{cookie_embed_id}{original}",
            }
    return None


# --------------------------------------------------------------------------- #
# 内部工具
# --------------------------------------------------------------------------- #
def _resolve_url(location: str, base: str) -> str | None:
    """相对 location 基于 base 解析为绝对 URL（无法解析返回 ``None``）。"""
    parts = urlsplit(location)
    if parts.scheme and parts.hostname:
        return location
    from urllib.parse import urljoin  # noqa: PLC0415 - 仅此路径需要

    joined = urljoin(base, location)
    return joined if urlsplit(joined).hostname else None


def _url_suffix(url: str) -> str:
    parts = urlsplit(url)
    query = f"?{parts.query}" if parts.query else ""
    fragment = f"#{parts.fragment}" if parts.fragment else ""
    return f"{parts.path or '/'}{query}{fragment}"


#: 运行时垫片脚本（占位符 ``__PREFIX__`` 由 ``build_embed_runtime_shim_script`` 替换）
_RUNTIME_SHIM_TEMPLATE = (
    '<script data-homeos-embed-shim>(function(){if(window.__homeos_embed_patched)return;'
    "window.__homeos_embed_patched=1;var P='__PREFIX__';"
    "function A(u){if(typeof u!=='string'||!u)return u;"
    "if(u.charAt(0)==='/'&&u.charAt(1)!=='/'&&u!==P&&u.lastIndexOf(P+'/',0)!==0)return P+u;"
    "try{if(/^https?:\\/\\//i.test(u)){var x=new URL(u);"
    "if(x.origin===location.origin&&x.pathname!==P&&x.pathname.lastIndexOf(P+'/',0)!==0)"
    "return P+x.pathname+x.search+x.hash;}}catch(e){}return u;}"
    "function csrf(){try{var m=document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);"
    "return m?decodeURIComponent(m[1]):'';}catch(e){return '';}}"
    "function withCsrf(o){var t=csrf();if(!t)return o;"
    "o=o&&typeof o==='object'?Object.assign({},o):{};var h=o.headers;"
    "if(typeof Headers!=='undefined'&&h instanceof Headers){"
    "if(!h.has('X-CSRF-Token')&&!h.has('x-csrf-token'))h.set('X-CSRF-Token',t);return o;}"
    "var n={};if(h&&typeof h==='object'&&!Array.isArray(h)){for(var k in h)n[k]=h[k];}"
    "if(!n['X-CSRF-Token']&&!n['x-csrf-token'])n['X-CSRF-Token']=t;o.headers=n;return o;}"
    "if(window.fetch){var F=window.fetch;window.fetch=function(i,o){try{"
    "if(typeof i==='string')i=A(i);else if(i&&typeof i.url==='string'){var n=A(i.url);"
    "if(n!==i.url)i=new Request(n,i);}}catch(e){}return F.call(this,i,withCsrf(o));};}"
    "try{if(navigator&&typeof navigator.sendBeacon==='function'){"
    "var SB=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){"
    "try{u=A(u);}catch(e){}return SB(u,d);};}}catch(e){}"
    "try{var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){"
    "var a=[].slice.call(arguments);try{if(typeof u==='string')a[1]=A(u);}catch(e){}"
    "return XO.apply(this,a);};var XS=XMLHttpRequest.prototype.send;"
    "XMLHttpRequest.prototype.send=function(){try{var t=csrf();if(t)this.setRequestHeader('X-CSRF-Token',t);}"
    "catch(e){}return XS.apply(this,arguments);};}catch(e){}"
    "if(window.EventSource){var ES=window.EventSource;var NE=function(u,c){return new ES(A(u),c);};"
    "NE.prototype=ES.prototype;try{NE.CONNECTING=ES.CONNECTING;NE.OPEN=ES.OPEN;NE.CLOSED=ES.CLOSED;}"
    "catch(e){}window.EventSource=NE;}"
    "var WS=window.WebSocket;function W(u){if(typeof u!=='string'||!u.length)return u;"
    "if(u.charAt(0)==='/'&&u.lastIndexOf(P,0)!==0){"
    "var h=location.protocol==='https:'?'wss:':'ws:';return h+'//'+location.host+P+u;}return u;}"
    "var NW=function(u,p){u=W(u);return p!==undefined?new WS(u,p):new WS(u);};"
    "NW.prototype=WS.prototype;NW.CONNECTING=WS.CONNECTING;NW.OPEN=WS.OPEN;NW.CLOSING=WS.CLOSING;"
    "NW.CLOSED=WS.CLOSED;window.WebSocket=NW;})();</script>"
)


__all__ = [
    "EMBED_PROXY_SKIP_REQUEST_HEADERS",
    "EMBED_PROXY_STRIP_RESPONSE_HEADERS",
    "STATIC_MIME",
    "build_embed_forward_body",
    "build_embed_proxy_prefix",
    "build_embed_upstream_url",
    "build_embed_ws_proxy_prefix",
    "escape_reg_exp",
    "get_embed_upstream_origin",
    "is_embed_rewriteable_content_type",
    "is_embed_same_origin_as_request",
    "is_frontend_dist_asset_path",
    "is_html_content_type",
    "resolve_embed_proxy_fallback_redirect",
    "rewrite_embed_asset_content",
    "rewrite_embed_html",
    "rewrite_embed_location",
    "rewrite_embed_referer",
    "rewrite_embed_set_cookie",
    "strip_homeos_cookies",
    "url_host",
    "url_origin",
    "validate_embed_target_url",
]
