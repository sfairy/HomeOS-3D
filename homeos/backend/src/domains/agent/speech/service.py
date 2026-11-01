"""TTS 签发与合成服务。

**签发不同步合成**是这里最重要的设计决定：

- ``generate_signed_url()`` 只做纯计算（规范化 → 缓存键 → HMAC），微秒级返回；
  对话响应因此永远不会因为上游 TTS 慢或被墙而变慢。
- 真正的合成发生在浏览器 ``GET /agent/tts/audio/{key}`` 时。合成失败只影响这一次
  播放，前端静默回落既有播报链路（本机 SpeechSynthesis / HA 音箱）。

**熔断**：连续 3 次合成失败后 5 分钟内不再签发 URL（``generate_signed_url`` 返回
``None``）。这样上游挂掉时不会让每个对话响应都带一个注定 503 的链接。
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from .cache import AUDIO_SUFFIX, TtsCacheService, compute_cache_key
from .config import (
    DEFAULT_VOICE,
    ENGINE_EDGE,
    ENGINE_OPENAI,
    MAX_INPUT_CHARS,
    TtsOptions,
    build_tts_options,
)
from .edge_tts import EdgeTtsProvider
from .openai_tts import OpenAiTtsProvider
from .signing import load_signing_secret
from .text_normalizer import normalize_for_speech

logger = logging.getLogger("homeos.agent.tts")

#: 签名 URL 有效期（毫秒），与参考实现一致
URL_TTL_MS = 10 * 60 * 1000

#: 连续失败多少次打开熔断
CIRCUIT_FAILURE_THRESHOLD = 3
#: 熔断持续时间（秒）
CIRCUIT_OPEN_SECONDS = 5 * 60

#: 默认路由前缀（与 ``api/router_registry`` 的挂载点一致）
DEFAULT_URL_PREFIX = "/api/v1/agent"


class TtsSynthesisError(RuntimeError):
    """合成失败（上游不可用、参数缺失、熔断中）。"""


@dataclass(frozen=True)
class TtsUrlResult:
    """一次签发的结果。"""

    tts_url: str
    cache_key: str
    exp: int

    def to_dict(self) -> dict[str, Any]:
        return {"ok": True, "ttsUrl": self.tts_url, "cacheKey": self.cache_key, "exp": self.exp}


def _sign(secret: str, cache_key: str, exp: int) -> str:
    return hmac.new(secret.encode("utf-8"), f"{cache_key}:{exp}".encode(), hashlib.sha256).hexdigest()


def _resolve_voice(options: TtsOptions) -> str:
    """引擎与音色可能不同步（用户切了引擎没换音色），这里兜一层。"""
    voice = str(options.voice or "").strip()
    if options.engine == ENGINE_EDGE and "-" not in voice:
        return DEFAULT_VOICE[ENGINE_EDGE]
    return voice or DEFAULT_VOICE.get(options.engine, DEFAULT_VOICE[ENGINE_EDGE])


class TtsService:
    """语音合成门面：签发 / 验签 / 按需合成 / 熔断。"""

    def __init__(
        self,
        app_config: Any = None,
        data_dir: Path | str | None = None,
        *,
        env: Any = None,
        secret: str | None = None,
        edge: EdgeTtsProvider | None = None,
        openai_provider: OpenAiTtsProvider | None = None,
        url_prefix: str = DEFAULT_URL_PREFIX,
    ) -> None:
        self._app_config = app_config
        root = Path(data_dir) / "tts" if data_dir is not None else None
        self._cache = TtsCacheService(root)
        self._secret = secret or load_signing_secret(Path(data_dir) / "secrets" if data_dir else None, env)
        self._edge = edge or EdgeTtsProvider(env=env)
        self._openai = openai_provider or OpenAiTtsProvider(env=env)
        self._url_prefix = url_prefix.rstrip("/")
        self._failures = 0
        self._circuit_open_until = 0.0

    # —— 配置 ——
    def options(self) -> TtsOptions:
        section = None
        if self._app_config is not None:
            try:
                section = self._app_config.get("voice")
            except Exception as exc:
                logger.debug("读取 voice 配置失败: %s", exc)
                section = None
        return build_tts_options(section)

    def enabled(self) -> bool:
        return self.options().enabled

    # —— 熔断 ——
    def circuit_open(self) -> bool:
        return time.monotonic() < self._circuit_open_until

    def record_success(self) -> None:
        self._failures = 0
        self._circuit_open_until = 0.0

    def record_failure(self, reason: str) -> None:
        self._failures += 1
        logger.warning("TTS 合成失败（%s/%s）：%s", self._failures, CIRCUIT_FAILURE_THRESHOLD, reason)
        if self._failures >= CIRCUIT_FAILURE_THRESHOLD:
            self._circuit_open_until = time.monotonic() + CIRCUIT_OPEN_SECONDS
            logger.error("TTS 熔断打开 %s 秒（连续失败 %s 次）", CIRCUIT_OPEN_SECONDS, self._failures)

    def snapshot(self) -> dict[str, Any]:
        """供 ``/agent/ping`` 与设置页试听提示用的状态快照。"""
        options = self.options()
        return {
            "enabled": options.enabled,
            "engine": options.engine,
            "voice": _resolve_voice(options),
            "circuitOpen": self.circuit_open(),
            "consecutiveFailures": self._failures,
        }

    # —— 签发 ——
    def generate_signed_url(self, raw_text: Any, override: TtsOptions | None = None) -> TtsUrlResult | None:
        """把回复文本签成一个短期可访问的音频 URL；不可用时返回 ``None``。"""
        options = override or self.options()
        if not options.enabled or self.circuit_open():
            return None
        text = normalize_for_speech(raw_text)
        if not text:
            return None
        text = text[:MAX_INPUT_CHARS]
        voice = _resolve_voice(options)
        cache_key = compute_cache_key(options.cache_engine(), voice, options.rate, options.pitch, text, "mp3")
        exp = int(time.time() * 1000) + URL_TTL_MS
        sign = _sign(self._secret, cache_key, exp)
        self._cache.write_pending(
            cache_key,
            {
                "engine": options.engine,
                "voice": voice,
                "rate": options.rate,
                "pitch": options.pitch,
                "model": options.model,
                "apiBase": options.api_base,
                "lang": options.lang,
                "text": text,
            },
        )
        return TtsUrlResult(
            tts_url=f"{self._url_prefix}/tts/audio/{cache_key}{AUDIO_SUFFIX}?exp={exp}&sign={sign}",
            cache_key=cache_key,
            exp=exp,
        )

    def verify(self, cache_key: str, exp_raw: Any, sign: str) -> bool:
        """校验签名与有效期（``hmac.compare_digest`` 防时序侧信道）。"""
        if not cache_key or not sign:
            return False
        try:
            exp = int(str(exp_raw))
        except TypeError, ValueError:
            logger.debug("TTS 签名里的过期时间非法: %r", exp_raw)
            return False
        if exp <= 0 or int(time.time() * 1000) > exp:
            return False
        expected = _sign(self._secret, cache_key, exp)
        if len(expected) != len(sign):
            return False
        return hmac.compare_digest(expected, sign)

    # —— 合成 ——
    def cached_audio(self, cache_key: str) -> bytes:
        return self._cache.read(cache_key)

    async def get_audio(self, cache_key: str) -> bytes:
        """取音频：命中缓存直接回读，否则按 sidecar 参数合成并落盘。"""
        cached = self._cache.read(cache_key)
        if cached:
            self._cache.touch(cache_key)
            return cached
        pending = self._cache.read_pending(cache_key)
        if not pending:
            raise TtsSynthesisError("音频已过期或不存在")
        if self.circuit_open():
            raise TtsSynthesisError("TTS 服务暂时不可用")
        options, text = self._options_from_pending(pending)
        try:
            audio = await self._synthesize(options, text)
        except Exception as exc:
            self.record_failure(str(exc))
            raise TtsSynthesisError(str(exc)) from exc
        self.record_success()
        self._cache.save(cache_key, audio)
        return audio

    def _options_from_pending(self, pending: dict[str, Any]) -> tuple[TtsOptions, str]:
        """sidecar 里没有密钥（避免把凭据落盘），密钥从当前配置补。"""
        current = self.options()
        options = replace(
            current,
            engine=str(pending.get("engine") or current.engine),
            voice=str(pending.get("voice") or current.voice),
            rate=int(pending.get("rate") or 0),
            pitch=int(pending.get("pitch") or 0),
            model=str(pending.get("model") or current.model),
            api_base=str(pending.get("apiBase") or current.api_base),
            lang=str(pending.get("lang") or current.lang),
        )
        return options, str(pending.get("text") or "")

    async def _synthesize(self, options: TtsOptions, text: str) -> bytes:
        if not text:
            raise TtsSynthesisError("没有可朗读的文本")
        if options.engine == ENGINE_OPENAI:
            return await self._openai.synthesize(
                text,
                voice=_resolve_voice(options),
                rate=options.rate,
                pitch=options.pitch,
                model=options.model,
                api_base=options.api_base,
                api_key=options.api_key,
            )
        return await self._edge.synthesize(
            text,
            voice=_resolve_voice(options),
            rate=options.rate,
            pitch=options.pitch,
            lang=options.lang,
        )


__all__ = [
    "CIRCUIT_FAILURE_THRESHOLD",
    "CIRCUIT_OPEN_SECONDS",
    "DEFAULT_URL_PREFIX",
    "URL_TTL_MS",
    "TtsService",
    "TtsSynthesisError",
    "TtsUrlResult",
]
