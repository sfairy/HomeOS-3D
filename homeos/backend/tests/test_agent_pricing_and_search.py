"""计费口径与联网搜索正文摘取的回归。

两条链路都容易「看起来对、其实错」：
- 计价：用户在设置里选了豆包，成本却按 DeepSeek 单价显示 —— 数字有，口径错；
- 搜索：只给标题 + 摘要时，主模型常把摘要里的半句话当结论（正文摘取解决这个）。

刻意不联网：搜索的上游由假 ``fetch_raw`` 顶替。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.agent.policy.pricing import (
    DEEPSEEK_PRICING,
    SOURCE_FALLBACK,
    estimate_cost_cny,
    normalize_provider,
    resolve_pricing,
    supported_providers,
)
from src.domains.agent.runtime.web_search import (
    MAX_PAGE_CHARS,
    AgentWebSearchService,
    html_to_text,
)


class PricingTest(unittest.TestCase):
    """provider → 单价：已知 provider 用自家价，未知 provider 明确标注是估算。"""

    def test_known_providers_have_own_rates(self) -> None:
        for provider in ("deepseek", "doubao", "qwen", "moonshot", "minimax", "glm", "openai"):
            with self.subTest(provider=provider):
                rate = resolve_pricing(provider, env={})
                self.assertEqual(rate.source, "provider-default")

        # 豆包与 DeepSeek 单价不同：这条断言就是「显示 deepseek 却在用豆包」的护栏
        doubao = resolve_pricing("doubao", env={})
        self.assertNotEqual(doubao.input_miss_cny, DEEPSEEK_PRICING.input_miss_cny)

    def test_provider_aliases_resolve_to_same_rates(self) -> None:
        cases = {
            "kimi": "moonshot",
            "tongyi": "qwen",
            "dashscope": "qwen",
            "ark": "doubao",
            "volcengine": "doubao",
            "zhipu": "glm",
            "chatglm": "glm",
        }
        for alias, expected in cases.items():
            with self.subTest(alias=alias):
                self.assertEqual(normalize_provider(alias), expected)
                self.assertEqual(
                    resolve_pricing(alias, env={}),
                    resolve_pricing(expected, env={}),
                )

    def test_model_name_prefix_matches_provider(self) -> None:
        self.assertEqual(normalize_provider("doubao-seed-1-6"), "doubao")
        self.assertEqual(normalize_provider("Qwen3-Max"), "qwen")
        self.assertEqual(normalize_provider("deepseek-v4-flash"), "deepseek")

    def test_unknown_provider_is_marked_as_fallback(self) -> None:
        rate = resolve_pricing("some-self-hosted", env={})
        self.assertEqual(rate.source, SOURCE_FALLBACK)
        self.assertEqual(rate.input_miss_cny, DEEPSEEK_PRICING.input_miss_cny)

    def test_global_env_override(self) -> None:
        rate = resolve_pricing("deepseek", env={"AGENT_PRICE_OUTPUT_CNY": "9"})
        self.assertEqual(rate.source, "env")
        self.assertEqual(rate.output_cny, 9.0)
        # 未覆盖的字段保留 provider 默认价
        self.assertEqual(rate.input_miss_cny, DEEPSEEK_PRICING.input_miss_cny)

    def test_per_provider_env_override_wins_over_global(self) -> None:
        rate = resolve_pricing(
            "doubao",
            env={
                "AGENT_PRICE_DOUBAO_OUTPUT_CNY": "5",
                "AGENT_PRICE_OUTPUT_CNY": "9",
            },
        )
        self.assertEqual(rate.output_cny, 5.0)

    def test_invalid_env_is_ignored(self) -> None:
        rate = resolve_pricing("doubao", env={"AGENT_PRICE_DOUBAO_OUTPUT_CNY": "abc"})
        self.assertEqual(rate.source, "provider-default")

    def test_cost_estimate_splits_cached_and_miss(self) -> None:
        rate = resolve_pricing("deepseek", env={})
        # 1M 输入（全未命中）+ 1M 输出 = 2 + 3 = 5 元（按默认价）
        self.assertAlmostEqual(estimate_cost_cny(1_000_000, 0, 1_000_000, rate), 5.0, places=6)
        # 命中缓存的输入按 hit 价：0.5 + 3 = 3.5
        self.assertAlmostEqual(estimate_cost_cny(0, 1_000_000, 1_000_000, rate), 3.5, places=6)

    def test_supported_providers_lists_rates(self) -> None:
        rows = supported_providers()
        providers = {row["provider"] for row in rows}
        self.assertIn("doubao", providers)
        self.assertIn("qwen", providers)


class _FakeResponse:
    """``UpstreamResponse`` 的最小替身。"""

    def __init__(self, status: int, body: bytes) -> None:
        self.status = status
        self.body = body

    def json(self) -> Any:
        import json

        return json.loads(self.body.decode("utf-8"))


class _FakeFetch:
    """记录请求并按 URL 返回预置响应。"""

    def __init__(self, pages: dict[str, bytes]) -> None:
        self.pages = pages
        self.calls: list[str] = []

    async def __call__(self, url: str, **kwargs: Any) -> _FakeResponse:
        self.calls.append(url)
        if url not in self.pages:
            return _FakeResponse(404, b"")
        return _FakeResponse(200, self.pages[url])


class WebSearchDetailTest(unittest.TestCase):
    """正文摘取：能取到就用正文，取不到不影响搜索本身成功。"""

    def _service(self, pages: dict[str, bytes]) -> tuple[AgentWebSearchService, _FakeFetch]:
        fetch = _FakeFetch(pages)
        # 配一个（假的）Tavily key：让降级链从 tavily 起，用例里替换成假实现即可
        service = AgentWebSearchService(http_fetch=fetch, env={"TAVILY_API_KEY": "test-key"})
        # DNS 判定注入：单测不真的解析域名
        service._host_checker = lambda host: True
        return service, fetch

    def test_html_to_text_strips_noise(self) -> None:
        raw = (
            "<html><head><style>.a{color:red}</style>"
            "<script>var x = '<p>no</p>';</script></head>"
            "<body><h1>标题</h1><p>第一段&nbsp;正文。</p><p>第二段。</p></body></html>"
        )
        text = html_to_text(raw)
        self.assertIn("标题", text)
        self.assertIn("第一段 正文。", text)
        self.assertNotIn("color:red", text)
        self.assertNotIn("var x", text)

    def test_detail_fetches_top_results(self) -> None:
        page = ("<html><body><article><p>" + "正文内容。" * 40 + "</p></article></body></html>").encode()

        async def run() -> dict[str, Any]:
            service, fetch = self._service(
                {
                    "https://example.com/a": page,
                    "https://example.com/b": page,
                }
            )

            async def fake_search(query: str, limit: int) -> list[dict[str, Any]]:
                return [
                    {"title": "A", "url": "https://example.com/a", "snippet": "a", "source": "test"},
                    {"title": "B", "url": "https://example.com/b", "snippet": "b", "source": "test"},
                    {"title": "C", "url": "https://example.com/c", "snippet": "c", "source": "test"},
                ]

            service._search_tavily = fake_search  # type: ignore[method-assign]
            result = await service.search("q", count=3, detail=2)
            self.assertTrue(result["ok"])
            self.assertEqual(len(fetch.calls), 2)  # 只抓前 2 条
            self.assertTrue(all(item.get("content") for item in result["results"][:2]))
            self.assertNotIn("content", result["results"][2])
            self.assertLessEqual(len(result["results"][0]["content"]), MAX_PAGE_CHARS)
            return result

        asyncio.run(run())

    def test_detail_zero_keeps_search_cheap(self) -> None:
        async def run() -> None:
            service, fetch = self._service({})

            async def fake_search(query: str, limit: int) -> list[dict[str, Any]]:
                return [{"title": "A", "url": "https://example.com/a", "snippet": "a", "source": "test"}]

            service._search_tavily = fake_search  # type: ignore[method-assign]
            result = await service.search("q", count=1, detail=0)
            self.assertTrue(result["ok"])
            self.assertEqual(fetch.calls, [])
            self.assertNotIn("content", result["results"][0])

        asyncio.run(run())

    def test_page_failure_does_not_break_search(self) -> None:
        async def run() -> None:
            service, _ = self._service({})  # 所有页面 404

            async def fake_search(query: str, limit: int) -> list[dict[str, Any]]:
                return [{"title": "A", "url": "https://example.com/a", "snippet": "a", "source": "test"}]

            service._search_tavily = fake_search  # type: ignore[method-assign]
            result = await service.search("q", count=1, detail=2)
            self.assertTrue(result["ok"])
            self.assertEqual(result["results"][0]["title"], "A")

        asyncio.run(run())

    def test_non_https_url_is_skipped(self) -> None:
        async def run() -> None:
            service, fetch = self._service({})

            async def fake_search(query: str, limit: int) -> list[dict[str, Any]]:
                return [{"title": "A", "url": "http://insecure/a", "snippet": "a", "source": "test"}]

            service._search_tavily = fake_search  # type: ignore[method-assign]
            await service.search("q", count=1, detail=1)
            self.assertEqual(fetch.calls, [])

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
