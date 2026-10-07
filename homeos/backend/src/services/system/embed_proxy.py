"""内嵌页反向代理服务（对齐 ``modules/system/embed-proxy.service.ts``）。

HTTPS 父页无法内嵌 HTTP 站点（混合内容），由本服务充当同源反向代理：把
``/api/v1/embed-proxy/<id>`` 与 ``/api/v1/embed-proxy/<id>/*path`` 转发到真实上游，
并改写响应体中的 URL 维持同源链路。

关键策略：
- 上游目标来自 ``UiConfigService`` 的 ``layout.customEmbeds`` / ``moviePilotUrl``；
- 响应头按 ``EMBED_PROXY_STRIP_RESPONSE_HEADERS`` 清理，Set-Cookie / Location / Referer 重写；
- 同机内嵌时 ``/assets/*`` 走本地 dist，避免经 LAN/HTTPS 回环；
- 失败返回 502 友好 HTML，不向上游暴露内部堆栈。
"""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from fastapi import Request
from fastapi.responses import FileResponse, HTMLResponse, Response, StreamingResponse

from ...core.embed_proxy_util import (
    EMBED_PROXY_SKIP_REQUEST_HEADERS,
    EMBED_PROXY_STRIP_RESPONSE_HEADERS,
    STATIC_MIME,
    build_embed_forward_body,
    build_embed_proxy_prefix,
    build_embed_upstream_url,
    get_embed_upstream_origin,
    is_embed_rewriteable_content_type,
    is_embed_same_origin_as_request,
    is_frontend_dist_asset_path,
    is_html_content_type,
    rewrite_embed_asset_content,
    rewrite_embed_html,
    rewrite_embed_location,
    rewrite_embed_referer,
    rewrite_embed_set_cookie,
    strip_homeos_cookies,
    url_origin,
    validate_embed_target_url,
)
from ...core.errors import api_error, not_found
from ...security.cookies import is_request_secure
from ..system.ops.upstream import EMBED_TIMEOUT

logger = logging.getLogger("homeos.system.embed_proxy")


@dataclass
class EmbedTarget:
    """内嵌目标（origin + base 路径 + 原始 URL）。"""

    origin: str
    pathname: str
    url: str


@dataclass
class LayoutEmbed:
    id: str
    url: str


def _message(key: str, *args: Any) -> str:
    return api_error(key, *args)


def _target_from(url: str) -> EmbedTarget:
    parts = validate_embed_target_url(url)
    return EmbedTarget(origin=url_origin(url), pathname=parts.path or "/", url=url)


class EmbedProxyService:
    """内嵌页反向代理服务。"""

    def __init__(
        self,
        ui_config: Any,
        settings: Any = None,
        *,
        frontend_dist_path: Path | None = None,
    ) -> None:
        self._ui_config = ui_config
        if frontend_dist_path is not None:
            self._frontend_dist_path = Path(frontend_dist_path)
        elif settings is not None:
            self._frontend_dist_path = Path(settings.frontend_dir)
        else:
            self._frontend_dist_path = Path("dist")

    # ------------------------------------------------------------------ #
    # 目标解析
    # ------------------------------------------------------------------ #
    def load_layout(self) -> dict[str, Any]:
        """读取当前工程布局（解析失败返回空布局）。"""
        try:
            project_id = self._ui_config.resolve_active_project_id()
            config = self._ui_config.get_config(project_id)
        except Exception as exc:  # noqa: BLE001 - 布局不可用按空处理
            logger.debug("读取布局失败: %s", exc)
            return {}
        if not config or not config.get("layout"):
            return {}
        layout, parse_error = self._ui_config.parse_layout_field(config.get("layout"))
        return {} if parse_error else layout

    def resolve_embed_configured_url(self, embed_id: str) -> EmbedTarget:
        """解析内嵌目标配置 URL（含路径），供反代取 origin 与 base 路径使用。"""
        layout = self.load_layout()
        raw_embeds = layout.get("customEmbeds") if isinstance(layout.get("customEmbeds"), list) else []
        custom_embeds = [
            LayoutEmbed(id=str(item.get("id") or ""), url=str(item.get("url") or ""))
            for item in raw_embeds
            if isinstance(item, dict)
        ]

        if embed_id == "movie-pilot":
            from_list = next((item.url for item in custom_embeds if item.id == "movie-pilot"), "")
            url = from_list or str(layout.get("moviePilotUrl") or "")
            if not url.strip():
                not_found(_message("EMBED_MOVIEPILOT_URL_MISSING"))
            return _target_from(url)

        embed = next((item for item in custom_embeds if item.id == embed_id), None)
        if embed is None or not embed.url.strip():
            not_found(_message("EMBED_NOT_FOUND", embed_id))
        return _target_from(embed.url)

    def resolve_embed_base_url(self, embed_id: str) -> str:
        return self.resolve_embed_configured_url(embed_id).origin

    # ------------------------------------------------------------------ #
    # 本地 dist 资源
    # ------------------------------------------------------------------ #
    def resolve_local_asset_path(self, sub_path: str) -> Path | None:
        """解析本地 dist 下的静态资源路径（防绝对路径覆盖与 ``..`` 穿越）。"""
        if not is_frontend_dist_asset_path(sub_path):
            return None
        clean_path = sub_path.split("?")[0].split("#")[0]
        relative = clean_path.lstrip("/")
        if not relative or ".." in relative:
            return None
        root = self._frontend_dist_path.resolve()
        local_path = (root / relative).resolve()
        if local_path == root or root not in local_path.parents:
            return None
        if not local_path.is_file():
            return None
        return local_path

    def _try_serve_local_frontend_asset(
        self,
        embed_id: str,
        embed_base: str,
        base_path: str | None,
        sub_path: str,
        request: Request,
    ) -> Response | None:
        """同机内嵌时从本地 dist 直接伺服 ``/assets/*``（避免经 LAN/HTTPS 回环）。"""
        req_secure = is_request_secure(request)
        if not is_embed_same_origin_as_request(
            embed_base, request.headers.get("host"), req_secure
        ):
            return None
        local_path = self.resolve_local_asset_path(sub_path)
        if local_path is None:
            return None

        mime = STATIC_MIME.get(local_path.suffix.lower(), "application/octet-stream")
        headers: dict[str, str] = {}
        if "/assets/" in str(local_path):
            headers["Cache-Control"] = "public, max-age=31536000, immutable"
        if is_embed_rewriteable_content_type(mime):
            text = local_path.read_text(encoding="utf-8", errors="replace")
            return Response(
                content=rewrite_embed_asset_content(text, embed_base, embed_id, base_path),
                media_type=mime,
                headers=headers,
            )
        return FileResponse(local_path, media_type=mime, headers=headers)

    def _respond_asset_not_found(self, sub_path: str) -> Response:
        """上游对静态资源返回 HTML（SPA 回退）时，返回正确 MIME 的 404。"""
        clean_path = sub_path.split("?")[0].split("#")[0]
        mime = STATIC_MIME.get(Path(clean_path).suffix.lower(), "text/plain")
        return Response(content=b"", status_code=404, media_type=mime)

    def _respond_upstream_unreachable(self, upstream_url: str, err: Exception) -> Response:
        """上游不可达时返回可读 HTML（iframe 内嵌），避免冒成 500 UNKNOWN。"""
        raw = str(err)
        timed_out = bool(re.search(r"abort|timeout|timed?\s*out", raw, re.IGNORECASE))
        message = _message(
            "EMBED_UPSTREAM_TIMEOUT" if timed_out else "EMBED_UPSTREAM_UNREACHABLE", upstream_url
        )
        safe_msg = (
            message.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )
        logger.warning("内嵌代理上游不可达 %s: %s", upstream_url, raw)
        html = (
            '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>内嵌页不可达</title>'
            # 样式必须外链：本路径受外壳页 CSP 的 `style-src 'self'` 约束，行内 <style>
            # 会被浏览器拦下（见 frontend/public/static/embed-offline.css 的说明）。
            '<link rel="stylesheet" href="/static/embed-offline.css">'
            f"</head><body><main><h1>内嵌页无法连接</h1><p>{safe_msg}</p></main></body></html>"
        )
        return HTMLResponse(content=html, status_code=502)

    def filter_request_headers(
        self, headers: dict[str, Any], embed_base: str, proxy_prefix: str
    ) -> dict[str, str]:
        """过滤转发给上游的请求头（Origin/Referer 还原、Cookie 剥离子集）。"""
        out: dict[str, str] = {}
        for key, value in headers.items():
            lower = key.lower()
            if lower in EMBED_PROXY_SKIP_REQUEST_HEADERS:
                continue
            if lower == "cookie":
                raw = (
                    value
                    if isinstance(value, str)
                    else "; ".join(value)
                    if isinstance(value, (list, tuple))
                    else None
                )
                stripped = strip_homeos_cookies(raw)
                if stripped:
                    out[key] = stripped
                continue
            # Origin/Referer 还原为内嵌站真实地址，否则上游同源/CSRF 校验会拒绝登录提交
            if lower == "origin":
                out[key] = get_embed_upstream_origin(embed_base)
                continue
            if lower == "referer":
                raw = value if isinstance(value, str) else (value[0] if value else None)
                out[key] = rewrite_embed_referer(raw, embed_base, proxy_prefix)
                continue
            if isinstance(value, str):
                out[key] = value
            elif isinstance(value, (list, tuple)) and value:
                out[key] = str(value[0])
        return out

    # ------------------------------------------------------------------ #
    # 代理主流程
    # ------------------------------------------------------------------ #
    async def proxy(self, embed_id: str, request: Request) -> Response:
        target = self.resolve_embed_configured_url(embed_id)
        embed_base = target.origin
        # 配置 URL 的 base 路径（如 /p）；基路径型 SPA 的 basename 据此重定位到反代前缀下
        base_path = target.pathname if target.pathname and target.pathname != "/" else None
        proxy_prefix = build_embed_proxy_prefix(embed_id)

        path_only = request.url.path
        mount = f"/api/v1/embed-proxy/{embed_id}"
        sub_path = path_only[len(mount) :] if len(path_only) > len(mount) else "/"
        if not sub_path:
            sub_path = "/"
        query = f"?{request.url.query}" if request.url.query else ""
        upstream_url = build_embed_upstream_url(embed_base, sub_path, query)

        local_response = self._try_serve_local_frontend_asset(
            embed_id, embed_base, base_path, sub_path, request
        )
        if local_response is not None:
            return local_response

        logger.debug("内嵌代理 %s %s", request.method, upstream_url)

        raw_body = await request.body()
        forward_body = build_embed_forward_body(
            request.method,
            request.headers.get("content-type"),
            _maybe_json(raw_body),
            raw_body if request.method.upper() not in ("GET", "HEAD") else None,
        )

        # 内嵌反代目标已限定为局域网地址（validate_embed_target_url），其 HTTPS 站点
        # 常用自签证书；放行证书校验，避免反代 HTTPS 内嵌页时握手失败。
        upstream_is_https = upstream_url.lower().startswith("https:")
        headers = self.filter_request_headers(dict(request.headers), embed_base, proxy_prefix)

        client: httpx.AsyncClient | None = None
        upstream: httpx.Response | None = None
        try:
            client, upstream = await _open_upstream(
                upstream_url,
                method=request.method,
                headers=headers,
                content=forward_body,
                verify=not upstream_is_https,
            )
        except Exception as err:  # noqa: BLE001 - 连接失败 / 超时 → 502 可读 HTML
            if client is not None:
                await client.aclose()
            return self._respond_upstream_unreachable(upstream_url, err)

        req_secure = is_request_secure(request)
        status = upstream.status_code
        set_cookies = [_decode(value) for value in upstream.headers.get_list("set-cookie")]

        def forward_set_cookies(response: Response) -> None:
            for cookie in set_cookies:
                response.headers.append(
                    "set-cookie", rewrite_embed_set_cookie(cookie, proxy_prefix, req_secure)
                )

        location = upstream.headers.get("location")
        if location and 300 <= status < 400:
            response = Response(status_code=status)
            forward_set_cookies(response)
            response.headers["Location"] = rewrite_embed_location(location, embed_base, proxy_prefix)
            await _close_upstream(client, upstream)
            return response

        response_headers = _filter_response_headers(upstream)
        content_type = upstream.headers.get("content-type")

        if is_html_content_type(content_type):
            if is_frontend_dist_asset_path(sub_path):
                await _close_upstream(client, upstream)
                local_response = self._try_serve_local_frontend_asset(
                    embed_id, embed_base, base_path, sub_path, request
                )
                if local_response is not None:
                    return local_response
                return self._respond_asset_not_found(sub_path)
            html = (await upstream.aread()).decode("utf-8", errors="replace")
            await _close_upstream(client, upstream)
            rewritten = rewrite_embed_html(
                html, embed_base, proxy_prefix, embed_id, sub_path, base_path
            )
            response = Response(content=rewritten, status_code=status)
            for key, value in response_headers.items():
                response.headers[key] = value
            forward_set_cookies(response)
            # 设置内嵌上下文 Cookie（Path=/），使子资源请求在 Referer 缺失时仍可被识别
            embed_secure_part = "; Secure" if req_secure else ""
            embed_cookie = (
                f"embed_ctx__{_encode(embed_id)}=1; Path=/; SameSite=Lax{embed_secure_part}"
            )
            response.headers.append("set-cookie", embed_cookie)
            return response

        if status == 404 and is_frontend_dist_asset_path(sub_path):
            await _close_upstream(client, upstream)
            local_response = self._try_serve_local_frontend_asset(
                embed_id, embed_base, base_path, sub_path, request
            )
            if local_response is not None:
                return local_response
            return self._respond_asset_not_found(sub_path)

        if is_embed_rewriteable_content_type(content_type):
            text = (await upstream.aread()).decode("utf-8", errors="replace")
            await _close_upstream(client, upstream)
            response = Response(
                content=rewrite_embed_asset_content(text, embed_base, embed_id, base_path),
                status_code=status,
                media_type=content_type,
            )
            for key, value in response_headers.items():
                response.headers[key] = value
            forward_set_cookies(response)
            return response

        # 二进制 / 其他：流式透传（大文件、媒体下载不落内存）
        assert client is not None and upstream is not None

        async def body_iterator() -> AsyncIterator[bytes]:
            try:
                async for chunk in upstream.aiter_bytes():
                    yield chunk
            finally:
                await _close_upstream(client, upstream)

        response = StreamingResponse(body_iterator(), status_code=status, media_type=content_type)
        for key, value in response_headers.items():
            response.headers[key] = value
        forward_set_cookies(response)
        return response


def _maybe_json(raw_body: bytes) -> Any:
    """把原始请求体解析为 JSON（用于按 content-type 重建 body）。"""
    if not raw_body:
        return None
    import json  # noqa: PLC0415 - 仅此路径需要

    try:
        return json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None


def _decode(value: Any) -> str:
    if isinstance(value, (bytes, bytearray)):
        return value.decode("latin-1")
    return str(value)


def _encode(value: str) -> str:
    from urllib.parse import quote  # noqa: PLC0415 - 仅此路径需要

    return quote(str(value), safe="")


def _filter_response_headers(upstream: httpx.Response) -> dict[str, str]:
    """按剥离清单过滤上游响应头（Set-Cookie / Location 单独处理）。"""
    out: dict[str, str] = {}
    for key, value in upstream.headers.items():
        lower = key.lower()
        if lower in EMBED_PROXY_STRIP_RESPONSE_HEADERS:
            continue
        if lower in ("set-cookie", "location"):
            continue
        out[key] = value
    return out


async def _open_upstream(
    url: str,
    *,
    method: str,
    headers: dict[str, str],
    content: Any,
    verify: bool,
) -> tuple[httpx.AsyncClient, httpx.Response]:
    """建立流式上游连接（超时仅作用于连接 + 响应头阶段）。"""
    client = httpx.AsyncClient(
        timeout=httpx.Timeout(EMBED_TIMEOUT, read=None),
        follow_redirects=False,
        verify=verify,
    )
    request = client.build_request(method.upper(), url, headers=headers, content=content)
    response = await client.send(request, stream=True)
    return client, response


async def _close_upstream(client: httpx.AsyncClient | None, response: httpx.Response | None) -> None:
    """关闭上游响应与客户端（短路与本地伺服时避免连接泄漏）。"""
    if response is not None:
        try:
            await response.aclose()
        except Exception:  # noqa: BLE001
            pass
    if client is not None:
        try:
            await client.aclose()
        except Exception:  # noqa: BLE001
            pass


__all__ = ["EmbedProxyService", "EmbedTarget"]
