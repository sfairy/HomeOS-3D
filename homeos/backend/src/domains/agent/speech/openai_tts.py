"""OpenAI 兼容的 TTS provider（``POST /audio/speech``）。

给「不想用微软免费接口」或「已有自建 OpenAI 兼容网关」的部署留一条路：设置里把
引擎切到 ``openai``，填上 API Base / Key / Model 即可。默认引擎仍是 edge。

注意两家的能力差异：OpenAI 只支持 ``speed``（0.25–4.0），没有音调参数，
也没有 SSML —— 所以 ``rate`` 按百分比折算成 ``speed``，``pitch`` 直接忽略。
"""

from __future__ import annotations

import logging
from collections.abc import Mapping

import httpx

logger = logging.getLogger("homeos.agent.tts.openai")

#: 默认 API Base（OpenAI 官方；自建网关填自己的，如 ``https://api.deepseek.com/v1`` 兼容网关）
DEFAULT_API_BASE = "https://api.openai.com/v1"

#: 默认模型与音色
DEFAULT_MODEL = "tts-1"
DEFAULT_VOICE = "alloy"

#: 单次请求超时（秒）
REQUEST_TIMEOUT_SECONDS = 15.0

#: ``speed`` 的合法区间（OpenAI 文档口径）
MIN_SPEED = 0.25
MAX_SPEED = 4.0


class OpenAiTtsError(RuntimeError):
    """OpenAI 兼容接口合成失败。"""


def rate_to_speed(rate: int) -> float:
    """``+20%`` → ``1.2``；越界时夹到合法区间。"""
    speed = 1.0 + (int(rate) / 100.0)
    return max(MIN_SPEED, min(MAX_SPEED, speed))


def _endpoint(api_base: str) -> str:
    base = str(api_base or "").strip().rstrip("/") or DEFAULT_API_BASE
    return f"{base}/audio/speech"


class OpenAiTtsProvider:
    """OpenAI 兼容合成器。"""

    id = "openai"

    def __init__(self, env: Mapping[str, str] | None = None, timeout: float = REQUEST_TIMEOUT_SECONDS) -> None:
        self._env = env
        self._timeout = max(1.0, float(timeout))

    async def synthesize(
        self,
        text: str,
        *,
        voice: str,
        rate: int = 0,
        pitch: int = 0,
        model: str = DEFAULT_MODEL,
        api_base: str = DEFAULT_API_BASE,
        api_key: str = "",
    ) -> bytes:
        """请求合成；``pitch`` 仅用于对齐调用契约，OpenAI 侧忽略。"""
        del pitch
        key = str(api_key or "").strip()
        if not key:
            raise OpenAiTtsError("未配置 TTS API Key")
        payload = {
            "model": str(model or DEFAULT_MODEL).strip() or DEFAULT_MODEL,
            "input": text,
            "voice": str(voice or DEFAULT_VOICE).strip() or DEFAULT_VOICE,
            "speed": rate_to_speed(rate),
            "response_format": "mp3",
        }
        url = _endpoint(api_base)
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                )
                response.raise_for_status()
                audio = response.content
        except httpx.HTTPStatusError as exc:
            raise OpenAiTtsError(f"OpenAI TTS 返回 {exc.response.status_code}") from exc
        except httpx.HTTPError as exc:
            raise OpenAiTtsError(f"OpenAI TTS 请求失败: {exc}") from exc
        if not audio:
            raise OpenAiTtsError("OpenAI TTS 返回空音频")
        return audio


__all__ = [
    "DEFAULT_API_BASE",
    "DEFAULT_MODEL",
    "DEFAULT_VOICE",
    "OpenAiTtsError",
    "OpenAiTtsProvider",
    "rate_to_speed",
]
