"""服务端 TTS 的回归：文本规范化、缓存键、磁盘缓存、签发 / 验签、熔断。

这套测试刻意**不联网**：edge-tts 的 WebSocket 与 OpenAI 的 ``/audio/speech``
都由假 provider 顶替，校验的是「参数怎么流、失败怎么收」这条链路 —— 真连上游
的抖动不该让单测变红。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import asyncio
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.agent.speech import edge_tts
from src.domains.agent.speech import service as tts_service
from src.domains.agent.speech.cache import TtsCacheService, compute_cache_key
from src.domains.agent.speech.config import TtsOptions, build_tts_options
from src.domains.agent.speech.drm import obfuscated_gec_token, plain_gec_token
from src.domains.agent.speech.service import TtsService, TtsSynthesisError
from src.domains.agent.speech.text_normalizer import (
    MAX_SPEECH_CHARS,
    TRUNCATED_SUFFIX,
    build_ssml,
    normalize_for_speech,
)


class _Config:
    """最小 ``app_config`` 替身：只实现 ``get(section)``。"""

    def __init__(self, sections: dict[str, dict]) -> None:
        self._sections = sections

    def get(self, name: str) -> dict:
        return dict(self._sections.get(name) or {})


class _FakeProvider:
    """假合成器：记录调用参数，返回固定字节。"""

    def __init__(self, *, payload: bytes = b"ID3fake", fail: Exception | None = None) -> None:
        self.payload = payload
        self.fail = fail
        self.calls: list[dict] = []

    async def synthesize(self, text: str, **kwargs) -> bytes:
        self.calls.append({"text": text, **kwargs})
        if self.fail is not None:
            raise self.fail
        return self.payload


#: 单测用固定签名密钥（不是真实凭据，只为让签名可复现）
_TEST_SECRET = "unit-test-" + "secret"


def _service(tmp: Path, *, section: dict | None = None, **kwargs) -> TtsService:
    config = _Config({"voice": section or {}})
    return TtsService(config, tmp, secret=_TEST_SECRET, env={}, **kwargs)


class NormalizeTest(unittest.TestCase):
    def test_markdown_markers_disappear(self) -> None:
        raw = "## 客厅\n- **温度** 26℃\n> 记得关窗"
        spoken = normalize_for_speech(raw)
        for marker in ("#", "**", ">"):
            self.assertNotIn(marker, spoken)
        self.assertIn("客厅", spoken)
        self.assertIn("温度", spoken)

    def test_units_become_spoken_chinese(self) -> None:
        # 数字不转汉字：合成引擎念「26度」「百分之60」都是自然读法
        self.assertIn("26度", normalize_for_speech("26℃"))
        self.assertIn("百分之60", normalize_for_speech("湿度60%"))

    def test_emoji_are_dropped(self) -> None:
        self.assertEqual(normalize_for_speech("好的 😀🌤"), "好的")

    def test_long_reply_is_truncated_with_hint(self) -> None:
        spoken = normalize_for_speech("灯" * (MAX_SPEECH_CHARS * 2))
        self.assertTrue(spoken.endswith(TRUNCATED_SUFFIX))
        self.assertLessEqual(len(spoken), MAX_SPEECH_CHARS + len(TRUNCATED_SUFFIX))

    def test_empty_and_non_string_return_empty(self) -> None:
        for value in ("", "   ", None, 123, [], {}):
            with self.subTest(value=value):
                self.assertEqual(normalize_for_speech(value), "")

    def test_ssml_escapes_unsafe_characters(self) -> None:
        ssml = build_ssml("温度 < 26 & 湿度 > 60", voice="zh-CN-XiaoxiaoNeural", rate=10, pitch=-2)
        self.assertIn("&lt;", ssml)
        self.assertIn("&amp;", ssml)
        self.assertIn("rate='+10%'", ssml)
        self.assertIn("pitch='-2Hz'", ssml)
        self.assertEqual(ssml.count("<voice"), 1)


class ConfigTest(unittest.TestCase):
    def test_enabled_flag_is_respected(self) -> None:
        self.assertTrue(build_tts_options({}).enabled)
        self.assertFalse(build_tts_options({"ttsEnabled": False}).enabled)

    def test_rate_and_pitch_parse_from_display_strings(self) -> None:
        options = build_tts_options({"ttsRate": "+15%", "ttsPitch": "-3Hz"})
        self.assertEqual(options.rate, 15)
        self.assertEqual(options.pitch, -3)

    def test_masked_api_key_counts_as_unset(self) -> None:
        options = build_tts_options({"ttsEngine": "openai", "ttsApiKey": "********"})
        self.assertEqual(options.api_key, "")
        self.assertEqual(options.engine, "openai")

    def test_unknown_engine_falls_back_to_edge(self) -> None:
        options = build_tts_options({"ttsEngine": "azure"})
        self.assertEqual(options.engine, "edge")
        self.assertTrue(options.voice)

    def test_openai_cache_engine_includes_model(self) -> None:
        options = build_tts_options({"ttsEngine": "openai", "ttsModel": "tts-1-hd"})
        self.assertEqual(options.cache_engine(), "openai:tts-1-hd")


class CacheKeyTest(unittest.TestCase):
    def test_same_parameters_produce_same_key(self) -> None:
        args = ("edge", "zh-CN-XiaoxiaoNeural", 0, 0, "开灯")
        self.assertEqual(compute_cache_key(*args), compute_cache_key(*args))

    def test_any_parameter_change_changes_key(self) -> None:
        base = compute_cache_key("edge", "zh-CN-XiaoxiaoNeural", 0, 0, "开灯")
        variants = [
            compute_cache_key("edge", "zh-CN-YunxiNeural", 0, 0, "开灯"),
            compute_cache_key("edge", "zh-CN-XiaoxiaoNeural", 10, 0, "开灯"),
            compute_cache_key("edge", "zh-CN-XiaoxiaoNeural", 0, 2, "开灯"),
            compute_cache_key("edge", "zh-CN-XiaoxiaoNeural", 0, 0, "关灯"),
        ]
        for key in variants:
            with self.subTest(key=key):
                self.assertNotEqual(base, key)


class DiskCacheTest(unittest.TestCase):
    def test_audio_and_pending_roundtrip(self) -> None:
        cache = TtsCacheService(None)  # 无数据目录 → 纯内存
        cache.save("k1", b"audio")
        cache.write_pending("k1", {"text": "开灯", "engine": "edge"})
        self.assertEqual(cache.read("k1"), b"audio")
        self.assertEqual(cache.read_pending("k1")["text"], "开灯")
        self.assertTrue(cache.has("k1"))
        cache.prune()
        self.assertEqual(cache.read("k1"), b"audio")

    def test_expired_pending_is_pruned(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            cache = TtsCacheService(Path(raw))
            with patch("src.domains.agent.speech.cache.time.time", return_value=1000.0):
                cache.write_pending("k2", {"text": "开灯"})
            stale = 1000.0 + 86400
            with patch("src.domains.agent.speech.cache.time.time", return_value=stale):
                # 签名 URL 只有 10 分钟，30 分钟前的参数不可能再被合成
                self.assertIsNone(cache.read_pending("k2"))

    def test_missing_key_reads_empty(self) -> None:
        cache = TtsCacheService(None)
        self.assertEqual(cache.read("nope"), b"")
        self.assertIsNone(cache.read_pending("nope"))


class SigningTest(unittest.TestCase):
    def test_signed_url_is_verifiable(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            service = _service(Path(raw))
            result = service.generate_signed_url("把客厅的灯打开")
            self.assertIsNotNone(result)
            url, cache_key, exp = result.tts_url, result.cache_key, result.exp
            self.assertIn(cache_key, url)
            self.assertIn("sign=", url)
            sign = url.split("sign=", 1)[1]
            self.assertTrue(service.verify(cache_key, exp, sign))

    def test_tampered_signature_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            service = _service(Path(raw))
            result = service.generate_signed_url("把客厅的灯打开")
            assert result is not None
            sign = result.tts_url.split("sign=", 1)[1]
            flipped = ("0" if sign[0] != "0" else "1") + sign[1:]
            self.assertFalse(service.verify(result.cache_key, result.exp, flipped))
            self.assertFalse(service.verify("other-key", result.exp, sign))

    def test_expired_url_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            service = _service(Path(raw))
            result = service.generate_signed_url("把客厅的灯打开")
            assert result is not None
            sign = result.tts_url.split("sign=", 1)[1]
            self.assertFalse(service.verify(result.cache_key, result.exp - tts_service.URL_TTL_MS - 1000, sign))
            self.assertFalse(service.verify(result.cache_key, 0, sign))

    def test_disabled_tts_issues_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            service = _service(Path(raw), section={"ttsEnabled": False})
            self.assertIsNone(service.generate_signed_url("开灯"))

    def test_blank_reply_issues_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            service = _service(Path(raw))
            self.assertIsNone(service.generate_signed_url("   \n  "))


class SynthesisTest(unittest.IsolatedAsyncioTestCase):
    async def test_audio_is_synthesized_once_then_cached(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            provider = _FakeProvider(payload=b"ID3payload")
            service = _service(Path(raw), edge=provider)
            result = service.generate_signed_url("把客厅的灯打开")
            assert result is not None
            first = await service.get_audio(result.cache_key)
            second = await service.get_audio(result.cache_key)
            self.assertEqual(first, b"ID3payload")
            self.assertEqual(second, first)
            self.assertEqual(len(provider.calls), 1, "第二次应命中磁盘缓存，不再请求上游")

    async def test_unknown_key_raises(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            service = _service(Path(raw), edge=_FakeProvider())
            with self.assertRaises(TtsSynthesisError):
                await service.get_audio("deadbeef")

    async def test_provider_failure_surfaces_as_synthesis_error(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            service = _service(Path(raw), edge=_FakeProvider(fail=RuntimeError("上游 403")))
            result = service.generate_signed_url("开灯")
            assert result is not None
            with self.assertRaises(TtsSynthesisError):
                await service.get_audio(result.cache_key)

    async def test_circuit_opens_after_threshold_and_blocks_issuing(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            service = _service(Path(raw), edge=_FakeProvider(fail=RuntimeError("上游 403")))
            for _ in range(tts_service.CIRCUIT_FAILURE_THRESHOLD):
                result = service.generate_signed_url("开灯")
                assert result is not None
                with self.assertRaises(TtsSynthesisError):
                    await service.get_audio(result.cache_key)
            self.assertTrue(service.circuit_open())
            self.assertIsNone(service.generate_signed_url("开灯"))
            # 上游恢复并成功一次即复位
            service.record_success()
            self.assertFalse(service.circuit_open())
            self.assertIsNotNone(service.generate_signed_url("开灯"))

    async def test_openai_engine_routes_to_openai_provider(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            openai = _FakeProvider(payload=b"ID3oai")
            edge = _FakeProvider()
            service = _service(
                Path(raw),
                section={"ttsEngine": "openai", "ttsVoice": "alloy", "ttsModel": "tts-1"},
                edge=edge,
                openai_provider=openai,
            )
            result = service.generate_signed_url("hello")
            assert result is not None
            await service.get_audio(result.cache_key)
            self.assertEqual(len(openai.calls), 1)
            self.assertEqual(edge.calls, [])

    def test_snapshot_reports_engine_and_circuit(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            service = _service(Path(raw), section={"ttsEngine": "openai", "ttsVoice": "nova"})
            snapshot = service.snapshot()
            self.assertEqual(snapshot["engine"], "openai")
            self.assertEqual(snapshot["voice"], "nova")
            self.assertFalse(snapshot["circuitOpen"])

    def test_options_default_to_edge_voice(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            service = _service(Path(raw))
            options: TtsOptions = service.options()
            self.assertEqual(options.engine, "edge")
            self.assertEqual(options.voice, "zh-CN-XiaoxiaoNeural")


class DrmTokenTest(unittest.TestCase):
    def test_plain_token_is_uppercase_sha256(self) -> None:
        with patch("time.time", return_value=1_760_000_000.0):
            token = plain_gec_token()
        self.assertEqual(len(token), 64)
        self.assertEqual(token, token.upper())
        int(token, 16)  # 必须是合法十六进制

    def test_obfuscated_token_has_prefix_segment(self) -> None:
        with patch("time.time", return_value=1_760_000_000.0):
            token = obfuscated_gec_token()
        prefix, _, digest = token.partition("-")
        self.assertEqual(len(prefix), 16)
        self.assertEqual(len(digest), 64)

    def test_token_is_stable_inside_the_window(self) -> None:
        # 同一 300 秒窗口内的两个时刻必须得到相同 token，否则服务端会判过期
        self.assertEqual(plain_gec_token(1_760_000_000.0), plain_gec_token(1_760_000_050.0))
        self.assertNotEqual(plain_gec_token(1_760_000_000.0), plain_gec_token(1_760_000_300.0))

    def test_obfuscated_differs_from_plain(self) -> None:
        self.assertNotEqual(plain_gec_token(1_760_000_000.0), obfuscated_gec_token(1_760_000_000.0))


class EdgeProviderResilienceTest(unittest.IsolatedAsyncioTestCase):
    """跨境链路会偶发卡死：代理可选、失败重试一次，别让一次抖动变成 503。"""

    async def test_retry_turns_one_stall_into_success(self) -> None:
        provider = edge_tts.EdgeTtsProvider(env={})
        calls = {"n": 0}

        async def flaky(connect: object, origin: object, endpoint: str, version: str, ssml: str) -> bytes:
            calls["n"] += 1
            if calls["n"] == 1:
                raise TimeoutError("握手卡住")
            return b"ID3ok"

        with patch.object(provider, "_attempt", flaky), patch.object(edge_tts.asyncio, "sleep", _noop_sleep):
            audio = await provider.synthesize("开灯", voice="zh-CN-XiaoxiaoNeural")
        self.assertEqual(audio, b"ID3ok")
        self.assertEqual(calls["n"], 2, "第一次卡住后应重试而不是直接失败")

    async def test_exhausted_retries_raise_and_dedupe_message(self) -> None:
        provider = edge_tts.EdgeTtsProvider(env={})

        async def always_stall(*_: object) -> bytes:
            raise TimeoutError("握手卡住")

        with (
            patch.object(provider, "_attempt", always_stall),
            patch.object(edge_tts.asyncio, "sleep", _noop_sleep),
            self.assertRaises(edge_tts.EdgeTtsError) as ctx,
        ):
            await provider.synthesize("开灯", voice="zh-CN-XiaoxiaoNeural")
        # 重试会把同一条错误重复记下来，去重后只留一份
        self.assertEqual(str(ctx.exception).count("握手卡住"), 1)

    def test_proxy_is_passed_only_when_configured(self) -> None:
        self.assertEqual(edge_tts.EdgeTtsProvider(env={})._connect_extra(), {})
        self.assertEqual(
            edge_tts.EdgeTtsProvider(env={"AGENT_TTS_EDGE_PROXY": " http://127.0.0.1:33211 "})._connect_extra(),
            {"proxy": "http://127.0.0.1:33211"},
        )


class EdgeHedgeTest(unittest.IsolatedAsyncioTestCase):
    """对冲：卡住的首发不该让用户白等一整个超时（实测 16 秒）才轮到第二次。

    这条链路的故障形态是「握手 / 首帧无响应」，顺序重试等于把超时翻倍。对冲在
    短延迟后并发补发一次，取先回来的；明确拒绝（403）则不补发。
    """

    async def test_stalled_first_attempt_is_hedged_instead_of_awaited(self) -> None:
        provider = edge_tts.EdgeTtsProvider(env={})
        calls = {"n": 0}
        black_hole = asyncio.Event()  # 永不 set：模拟连上就再无音讯的握手

        async def attempt() -> bytes:
            calls["n"] += 1
            if calls["n"] == 1:
                await black_hole.wait()
            return b"ID3ok"

        with patch.object(edge_tts, "HEDGE_DELAY_SECONDS", 0.05):
            started = time.monotonic()
            audio = await provider._hedged(attempt)
            elapsed = time.monotonic() - started

        self.assertEqual(audio, b"ID3ok")
        self.assertEqual(calls["n"], 2, "首发卡住时应并发补发一次，而不是原地等超时")
        self.assertLess(elapsed, 1.0, f"对冲后不该等满一次超时，实际 {elapsed:.2f}s")

    async def test_fast_rejection_is_not_hedged(self) -> None:
        provider = edge_tts.EdgeTtsProvider(env={})
        calls = {"n": 0}

        async def rejected() -> bytes:
            calls["n"] += 1
            raise RuntimeError("上游 403")

        with patch.object(edge_tts, "HEDGE_DELAY_SECONDS", 0.5), self.assertRaises(RuntimeError):
            await provider._hedged(rejected)

        self.assertEqual(calls["n"], 1, "明确拒绝不该再补发一次：同样的请求结果一样")

    async def test_cancel_that_hangs_does_not_delay_the_return(self) -> None:
        # 真实故障链：取消握手时 websockets 的 close 又卡了约 10 秒，6 秒超时被拖成 16 秒。
        # 对冲已经拿到音频，就只该有限等待被取消的那个任务。
        provider = edge_tts.EdgeTtsProvider(env={})
        calls = {"n": 0}

        async def attempt() -> bytes:
            calls["n"] += 1
            if calls["n"] == 1:
                try:
                    await asyncio.sleep(30)
                except asyncio.CancelledError:
                    await asyncio.sleep(10)  # 取消清理同样卡住
                    raise
            return b"ID3ok"

        with patch.object(edge_tts, "HEDGE_DELAY_SECONDS", 0.02):
            started = time.monotonic()
            audio = await provider._hedged(attempt)
            elapsed = time.monotonic() - started

        self.assertEqual(audio, b"ID3ok")
        self.assertLess(elapsed, 2.0, f"不该被被取消的慢任务拖住，实际 {elapsed:.2f}s")

    async def test_total_budget_caps_the_overall_wait(self) -> None:
        provider = edge_tts.EdgeTtsProvider(env={})

        async def forever(*_: object) -> bytes:
            await asyncio.sleep(3600)
            return b""

        with (
            patch.object(edge_tts, "TOTAL_BUDGET_SECONDS", 0.2),
            patch.object(provider, "_attempt", forever),
            self.assertRaises(edge_tts.EdgeTtsError) as ctx,
        ):
            await provider.synthesize("开灯", voice="zh-CN-XiaoxiaoNeural")

        self.assertIn("总预算", str(ctx.exception))


async def _noop_sleep(_seconds: float) -> None:
    """跳过重试退避，单测不必真的等。"""


if __name__ == "__main__":
    unittest.main()
