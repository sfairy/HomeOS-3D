"""联网搜索：多引擎降级 + SSRF 防护。

对齐 Nest ``WebSearchService`` 的降级链，但把「能访问哪里」收紧成白名单：

``Tavily``（``TAVILY_API_KEY``）→ ``Brave``（``BRAVE_SEARCH_API_KEY``）→
``DuckDuckGo Instant Answer`` → ``Wikipedia``。后两级无需密钥，因此「没配搜索 Key」
不等于「不能用联网搜索」。

安全约束（缺一不可）：

- 只允许 https，且 host 必须命中白名单（请求 URL 由本模块拼装，不接受外部传入）；
- 解析 DNS 后拒绝回环 / 私有 / 链路本地 / 保留地址（防白名单域名被投毒到内网）；
- 不跟随重定向（3xx 直接视为失败，避免跳到非白名单地址）；
- 单次超时 5 秒、响应体上限 512 KiB，超限按失败处理；
- 密钥只从进程环境变量读取，不落在任何配置 / 日志里。
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import socket
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote

from ...system.ops.upstream import UpstreamResponse, fetch_raw

logger = logging.getLogger("homeos.agent.web_search")

#: 允许访问的外部主机（含搜索 API 与降级站点）
ALLOWED_HOSTS = frozenset(
    {
        "api.tavily.com",
        "api.search.brave.com",
        "api.duckduckgo.com",
        "lite.duckduckgo.com",
        "zh.wikipedia.org",
        "en.wikipedia.org",
    }
)
#: 单次搜索超时（秒）
SEARCH_TIMEOUT = 5.0
#: 响应体上限（字节）
MAX_RESPONSE_BYTES = 512 * 1024
#: 关键词最长字符数
MAX_QUERY_CHARS = 200
#: 单次返回条数上限
MAX_RESULTS = 8


def _clean_query(raw: Any) -> str:
    text = str(raw or "")
    # 去掉控制字符与换行，压缩空白；超长截断（搜索引擎对超长 query 也会 400）
    cleaned = "".join(ch if ch.isprintable() else " " for ch in text)
    return " ".join(cleaned.split())[:MAX_QUERY_CHARS]


def _is_public_address(host: str) -> bool:
    """解析域名并确认所有解析结果都是公网地址。"""
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError as exc:
        logger.info("搜索域名解析失败，按不可信处理: %s (%s)", host, exc)
        return False
    for info in infos:
        address = info[4][0]
        try:
            ip = ipaddress.ip_address(str(address).split("%", 1)[0])
        except ValueError as exc:
            logger.info("搜索结果里的地址不可解析，按不可信处理: %s (%s)", address, exc)
            return False
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return False
    return bool(infos)


class AgentWebSearchService:
    """联网搜索服务（按顺序降级，任一成功即返回）。"""

    def __init__(
        self,
        http_fetch: Any = None,
        env: Mapping[str, str] | None = None,
        enabled: bool = True,
    ) -> None:
        self._http_fetch = http_fetch or fetch_raw
        self._env = env
        self._enabled = enabled
        #: 允许测试注入 DNS 判定（避免单测真的解析域名）
        self._host_checker = _is_public_address

    @property
    def env(self) -> Mapping[str, str]:
        return self._env if self._env is not None else os.environ

    def set_enabled(self, enabled: bool) -> None:
        """热更新开关（设置页保存后生效）。"""
        self._enabled = bool(enabled)

    @property
    def enabled(self) -> bool:
        return bool(self._enabled)

    def _key(self, name: str) -> str:
        return str(self.env.get(name, "")).strip()

    async def search(self, query: str, count: int = 5) -> dict[str, Any]:
        """执行一次联网搜索。

        返回 ``{"ok": bool, "provider": str, "results": [...], "message": str}``。
        全部引擎失败时 ``ok=False``，并带上最后一次失败原因（便于主模型如实告知用户）。
        """
        if not self._enabled:
            return {"ok": False, "provider": "", "results": [], "message": "联网搜索已在设置中关闭"}
        cleaned = _clean_query(query)
        if not cleaned:
            return {"ok": False, "provider": "", "results": [], "message": "搜索关键词为空"}
        limit = max(1, min(MAX_RESULTS, int(count or 5)))

        attempts: list[tuple[str, Any]] = []
        if self._key("TAVILY_API_KEY"):
            attempts.append(("tavily", self._search_tavily))
        if self._key("BRAVE_SEARCH_API_KEY"):
            attempts.append(("brave", self._search_brave))
        attempts.append(("duckduckgo", self._search_duckduckgo))
        attempts.append(("wikipedia", self._search_wikipedia))

        last_error = ""
        for provider, handler in attempts:
            try:
                results = await handler(cleaned, limit)
            except Exception as exc:
                last_error = f"{provider}: {exc}"
                logger.info("联网搜索降级（%s）: %s", provider, exc)
                continue
            if results:
                return {
                    "ok": True,
                    "provider": provider,
                    "query": cleaned,
                    "results": results[:limit],
                    "message": "",
                }
        return {
            "ok": False,
            "provider": "",
            "query": cleaned,
            "results": [],
            "message": last_error or "所有搜索源均未返回结果",
        }

    # 请求封装
    async def _request(
        self,
        host: str,
        path: str,
        *,
        method: str = "GET",
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        json_body: Any = None,
        form_body: str | None = None,
    ) -> Any:
        """向白名单主机发一次请求并解析 JSON；任何越界都抛 ``ValueError``。"""
        if host not in ALLOWED_HOSTS:
            raise ValueError(f"主机不在搜索白名单: {host}")
        allowed = await asyncio.to_thread(self._host_checker, host)
        if not allowed:
            raise ValueError(f"主机解析到非公网地址，已拒绝: {host}")
        url = f"https://{host}{path}"
        request_headers = {"Accept": "application/json", **(headers or {})}
        content: bytes | None = None
        if form_body is not None:
            content = form_body.encode("utf-8")
            request_headers["Content-Type"] = "application/x-www-form-urlencoded"
        response: UpstreamResponse = await self._http_fetch(
            url,
            method=method,
            params=params,
            headers=request_headers,
            json_body=json_body,
            content=content,
            timeout=SEARCH_TIMEOUT,
            follow_redirects=False,
        )
        if response.status >= 300:
            raise ValueError(f"上游返回 {response.status}")
        if len(response.body) > MAX_RESPONSE_BYTES:
            raise ValueError("上游响应体超过上限")
        payload = response.json()
        if payload is None:
            raise ValueError("上游返回非 JSON")
        return payload

    # 各引擎
    async def _search_tavily(self, query: str, limit: int) -> list[dict[str, Any]]:
        payload = await self._request(
            "api.tavily.com",
            "/search",
            method="POST",
            json_body={
                "api_key": self._key("TAVILY_API_KEY"),
                "query": query,
                "max_results": limit,
                "search_depth": "basic",
                "include_answer": False,
            },
        )
        items = payload.get("results") if isinstance(payload, dict) else None
        out: list[dict[str, Any]] = []
        for item in items or []:
            if not isinstance(item, dict):
                continue
            out.append(
                {
                    "title": str(item.get("title") or "").strip(),
                    "url": str(item.get("url") or "").strip(),
                    "snippet": str(item.get("content") or "").strip()[:400],
                    "source": "tavily",
                }
            )
        return [item for item in out if item["url"]]

    async def _search_brave(self, query: str, limit: int) -> list[dict[str, Any]]:
        payload = await self._request(
            "api.search.brave.com",
            "/res/v1/web/search",
            params={"q": query, "count": limit},
            headers={"X-Subscription-Token": self._key("BRAVE_SEARCH_API_KEY")},
        )
        web = payload.get("web") if isinstance(payload, dict) else None
        items = web.get("results") if isinstance(web, dict) else None
        out: list[dict[str, Any]] = []
        for item in items or []:
            if not isinstance(item, dict):
                continue
            out.append(
                {
                    "title": str(item.get("title") or "").strip(),
                    "url": str(item.get("url") or "").strip(),
                    "snippet": str(item.get("description") or "").strip()[:400],
                    "source": "brave",
                }
            )
        return [item for item in out if item["url"]]

    async def _search_duckduckgo(self, query: str, limit: int) -> list[dict[str, Any]]:
        payload = await self._request(
            "api.duckduckgo.com",
            "/",
            params={"q": query, "format": "json", "no_html": 1, "skip_disambig": 1},
        )
        if not isinstance(payload, dict):
            return []
        out: list[dict[str, Any]] = []
        abstract = str(payload.get("AbstractText") or "").strip()
        abstract_url = str(payload.get("AbstractURL") or "").strip()
        heading = str(payload.get("Heading") or "").strip()
        if abstract and abstract_url:
            out.append(
                {
                    "title": heading or query,
                    "url": abstract_url,
                    "snippet": abstract[:400],
                    "source": "duckduckgo",
                }
            )
        related = payload.get("RelatedTopics")
        for entry in related if isinstance(related, list) else []:
            if len(out) >= limit:
                break
            if not isinstance(entry, dict):
                continue
            # RelatedTopics 可能是分组（含 Topics 子列表）
            nested = entry.get("Topics")
            candidates = nested if isinstance(nested, list) else [entry]
            for candidate in candidates:
                if len(out) >= limit:
                    break
                if not isinstance(candidate, dict):
                    continue
                text = str(candidate.get("Text") or "").strip()
                url = str(candidate.get("FirstURL") or "").strip()
                if text and url:
                    out.append(
                        {
                            "title": text.split(" - ", 1)[0][:120] or query,
                            "url": url,
                            "snippet": text[:400],
                            "source": "duckduckgo",
                        }
                    )
        return out

    async def _search_wikipedia(self, query: str, limit: int) -> list[dict[str, Any]]:
        """Wikipedia 搜索 API：先中文站，失败再英文站。"""
        for host, lang in (("zh.wikipedia.org", "zh"), ("en.wikipedia.org", "en")):
            try:
                payload = await self._request(
                    host,
                    "/w/api.php",
                    params={
                        "action": "query",
                        "list": "search",
                        "srsearch": query,
                        "srlimit": limit,
                        "format": "json",
                        "utf8": 1,
                    },
                )
            except Exception as exc:
                logger.debug("Wikipedia(%s) 搜索失败: %s", lang, exc)
                continue
            query_obj = payload.get("query") if isinstance(payload, dict) else None
            items = query_obj.get("search") if isinstance(query_obj, dict) else None
            out: list[dict[str, Any]] = []
            for item in items or []:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title") or "").strip()
                if not title:
                    continue
                # snippet 里带 HTML 高亮标签，去掉标签只留文本
                snippet = _strip_tags(str(item.get("snippet") or ""))
                out.append(
                    {
                        "title": title,
                        "url": f"https://{host}/wiki/{quote(title.replace(' ', '_'))}",
                        "snippet": snippet[:400],
                        "source": f"wikipedia-{lang}",
                    }
                )
            if out:
                return out
        return []


def _strip_tags(text: str) -> str:
    """去掉 Wikipedia snippet 里的 ``<span class="searchmatch">`` 之类标签。"""
    out: list[str] = []
    depth = 0
    for ch in text:
        if ch == "<":
            depth += 1
            continue
        if ch == ">" and depth:
            depth -= 1
            continue
        if depth == 0:
            out.append(ch)
    return " ".join("".join(out).split())


__all__ = [
    "ALLOWED_HOSTS",
    "MAX_RESPONSE_BYTES",
    "SEARCH_TIMEOUT",
    "AgentWebSearchService",
]
