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
import html as html_module
import ipaddress
import logging
import os
import re
import socket
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote, urlsplit

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
#: 正文摘取：单页超时（秒）——比搜索本身更紧，宁可少一段正文也不拖住整轮对话
PAGE_TIMEOUT = 4.0
#: 正文摘取：单页响应体上限（字节）
MAX_PAGE_BYTES = 384 * 1024
#: 正文摘取：每页保留字符数（约 300 字中文，够主模型判断相关性）
MAX_PAGE_CHARS = 1200
#: 正文摘取：一次最多额外取多少个页面（并发、且只取前几个结果）
MAX_DETAIL_RESULTS = 3
#: 正文摘取：默认取几个（0 = 只返回搜索摘要）
DEFAULT_DETAIL_RESULTS = 2
#: 需要整段丢弃的标签内容（脚本 / 样式 / 导航等噪声）
_NOISE_TAGS = ("script", "style", "noscript", "svg", "template", "iframe")
#: 噪声块匹配：``<script ...>...</script>`` 之类整段删除
_NOISE_RE = re.compile(r"<(" + "|".join(_NOISE_TAGS) + r")\b[^>]*>.*?</\1\s*>", re.IGNORECASE | re.DOTALL)
#: 注释
_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
#: 任意标签
_TAG_RE = re.compile(r"<[^>]+>")
#: 块级标签断开处补空格，避免「上一段末尾 + 下一段开头」粘连成生造词
_BLOCK_RE = re.compile(
    r"</?(?:p|div|br|li|tr|td|th|h[1-6]|section|article|header|footer|nav|main|ul|ol|table)\b[^>]*>",
    re.IGNORECASE,
)


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

    async def search(self, query: str, count: int = 5, detail: int = 0) -> dict[str, Any]:
        """执行一次联网搜索。

        返回 ``{"ok": bool, "provider": str, "results": [...], "message": str}``。
        全部引擎失败时 ``ok=False``，并带上最后一次失败原因（便于主模型如实告知用户）。

        ``detail`` 为需要正文摘取的结果条数（0 = 只给标题 + 摘要）：命中后会对前几条
        结果并发抓取页面正文并压成纯文本，塞进 ``content`` 字段。抓取失败只是少一段
        正文，不影响 ``ok`` —— 摘要已经够回答大部分问题。
        """
        if not self._enabled:
            return {"ok": False, "provider": "", "results": [], "message": "联网搜索已在设置中关闭"}
        cleaned = _clean_query(query)
        if not cleaned:
            return {"ok": False, "provider": "", "results": [], "message": "搜索关键词为空"}
        limit = max(1, min(MAX_RESULTS, int(count or 5)))
        detail_limit = max(0, min(MAX_DETAIL_RESULTS, int(detail or 0)))

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
                payload = results[:limit]
                if detail_limit:
                    payload = await self._attach_content(payload, detail_limit)
                return {
                    "ok": True,
                    "provider": provider,
                    "query": cleaned,
                    "results": payload,
                    "message": "",
                }
        return {
            "ok": False,
            "provider": "",
            "query": cleaned,
            "results": [],
            "message": last_error or "所有搜索源均未返回结果",
        }

    # 正文摘取
    async def _attach_content(
        self,
        results: list[dict[str, Any]],
        detail_limit: int,
    ) -> list[dict[str, Any]]:
        """给前 ``detail_limit`` 条结果补 ``content``（已有正文的跳过）。"""
        targets = [item for item in results if not item.get("content")][:detail_limit]
        texts = await asyncio.gather(
            *(self._fetch_page_text(str(item.get("url") or "")) for item in targets),
            return_exceptions=True,
        )
        for item, text in zip(targets, texts, strict=True):
            if isinstance(text, BaseException):
                logger.debug("正文摘取失败: %s (%s)", item.get("url"), text)
                continue
            if text:
                item["content"] = _trim_page_text(text)
        return results

    async def _fetch_page_text(self, url: str) -> str:
        """抓取一条搜索结果的正文纯文本；任何越界或失败都返回空串。"""
        parts = urlsplit(str(url or "").strip())
        if parts.scheme != "https" or not parts.hostname:
            return ""
        if len(url) > 2048:
            return ""
        host = parts.hostname
        allowed = await asyncio.to_thread(self._host_checker, host)
        if not allowed:
            logger.info("正文摘取命中非公网地址，已跳过: %s", host)
            return ""
        response: UpstreamResponse = await self._http_fetch(
            url,
            method="GET",
            headers={"Accept": "text/html,application/xhtml+xml"},
            timeout=PAGE_TIMEOUT,
            follow_redirects=False,
        )
        if response.status >= 300:
            return ""
        if len(response.body) > MAX_PAGE_BYTES:
            return ""
        return html_to_text(response.body.decode("utf-8", errors="ignore"))

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
                # Tavily 直接回正文（markdown）：不用再逐页抓，省一轮外网往返
                "include_raw_content": True,
            },
        )
        items = payload.get("results") if isinstance(payload, dict) else None
        out: list[dict[str, Any]] = []
        for item in items or []:
            if not isinstance(item, dict):
                continue
            entry = {
                "title": str(item.get("title") or "").strip(),
                "url": str(item.get("url") or "").strip(),
                "snippet": str(item.get("content") or "").strip()[:400],
                "source": "tavily",
            }
            raw = _trim_page_text(html_to_text(str(item.get("raw_content") or "")))
            if raw:
                entry["content"] = raw
            out.append(entry)
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


def html_to_text(raw: str) -> str:
    """把一段 HTML 压成纯文本（去脚本 / 样式 / 注释，块级标签补空格）。

    不做完整的 DOM 解析：搜索结果的正文只需要「够主模型判断相关性」的一段，
    引入解析器（或额外的依赖）换不来更好的判断质量。
    """
    cleaned = _NOISE_RE.sub(" ", raw or "")
    cleaned = _COMMENT_RE.sub(" ", cleaned)
    cleaned = _BLOCK_RE.sub(" ", cleaned)
    cleaned = _TAG_RE.sub(" ", cleaned)
    return " ".join(html_module.unescape(cleaned).split())


def _trim_page_text(text: str) -> str:
    """截断正文到 ``MAX_PAGE_CHARS``，尽量断在句末，避免半句造成误读。"""
    value = (text or "").strip()
    if len(value) <= MAX_PAGE_CHARS:
        return value
    head = value[:MAX_PAGE_CHARS]
    for mark in ("。", ". ", "！", "？", "\n"):
        cut = head.rfind(mark)
        if cut >= MAX_PAGE_CHARS // 2:
            return head[: cut + len(mark)].strip()
    return head.strip()


__all__ = [
    "ALLOWED_HOSTS",
    "DEFAULT_DETAIL_RESULTS",
    "MAX_DETAIL_RESULTS",
    "MAX_PAGE_BYTES",
    "MAX_PAGE_CHARS",
    "MAX_RESPONSE_BYTES",
    "PAGE_TIMEOUT",
    "SEARCH_TIMEOUT",
    "AgentWebSearchService",
    "html_to_text",
]
