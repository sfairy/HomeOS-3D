"""TTS 运行期配置：从既有 ``voice`` 分区解析，环境变量兜底。

为什么不新建配置分区：``voice`` 段本来就拥有 ``ttsEnabled / ttsOutputMode /
ttsMediaPlayerIds / language``，「设置 → 语音 → TTS」是用户找播报设置的既有通路；
另起 ``agentConfig.tts*`` 会让同一件事散落在两处。

掩码值（``********``）一律当「未配置」：前端回传脱敏占位符时不能拿它去请求上游。
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("homeos.agent.tts.config")

#: 引擎枚举
ENGINE_EDGE = "edge"
ENGINE_OPENAI = "openai"
SUPPORTED_ENGINES = (ENGINE_EDGE, ENGINE_OPENAI)

#: 默认音色（按引擎区分）
DEFAULT_VOICE = {ENGINE_EDGE: "zh-CN-XiaoxiaoNeural", ENGINE_OPENAI: "alloy"}

#: 默认模型（仅 openai 引擎使用）
DEFAULT_MODEL = "tts-1"

#: 掩码占位符（与 ``app_config.mask`` 保持一致）
_MASKED = ("********", "REDACTED_API_KEY")

#: ``+10%`` / ``-5%`` / ``10%`` / ``10``
_RE_RATE = re.compile(r"^[+-]?\d+(?:\.\d+)?\s*%?$")
#: ``+2Hz`` / ``-2Hz`` / ``2Hz`` / ``2``
_RE_PITCH = re.compile(r"^[+-]?\d+(?:\.\d+)?\s*(?:Hz)?$", re.IGNORECASE)

#: 结果文本最长朗读字数（规范化阶段已截断，这里只是兜底上限）
MAX_INPUT_CHARS = 600


def _text(value: Any) -> str:
    return str(value or "").strip()


def _is_masked(value: Any) -> bool:
    raw = _text(value)
    return not raw or raw in _MASKED


def _percent(value: Any, default: int = 0) -> int:
    """解析百分比参数（``"+10%"`` → ``10``）；非法值回落默认。"""
    raw = _text(value)
    if not raw or not _RE_RATE.match(raw):
        return default
    try:
        return round(float(raw.removesuffix("%").strip()))
    except ValueError as exc:
        logger.debug("语速参数无法解析，回落默认值 %s: %s（%s）", default, raw, exc)
        return default


def _hertz(value: Any, default: int = 0) -> int:
    """解析音调参数（``"+2Hz"`` → ``2``）。"""
    raw = _text(value).replace(" ", "")
    if not raw or not _RE_PITCH.match(raw):
        return default
    try:
        return round(float(raw[:-2] if raw.lower().endswith("hz") else raw))
    except ValueError as exc:
        logger.debug("音调参数无法解析，回落默认值 %s: %s（%s）", default, raw, exc)
        return default


@dataclass(frozen=True)
class TtsOptions:
    """一次合成所需的全部参数（不可变，便于缓存与签名）。"""

    enabled: bool = True
    engine: str = ENGINE_EDGE
    voice: str = DEFAULT_VOICE[ENGINE_EDGE]
    rate: int = 0
    pitch: int = 0
    model: str = DEFAULT_MODEL
    api_base: str = ""
    api_key: str = ""
    lang: str = "zh-CN"

    def cache_engine(self) -> str:
        """缓存键里的引擎段：openai 要把模型算进去（不同模型音色不同）。"""
        return f"openai:{self.model}" if self.engine == ENGINE_OPENAI else ENGINE_EDGE


def _pick(section: dict[str, Any], env: Any, key: str, env_key: str) -> Any:
    """配置优先、环境变量兜底、最后空串。"""
    value = section.get(key)
    if _text(value):
        return value
    return env.get(env_key, "") if env is not None else ""


def build_tts_options(section: Any = None, env: Any = None) -> TtsOptions:
    """把 ``voice`` 分区 + 环境变量归一成 :class:`TtsOptions`。"""
    voice_section = section if isinstance(section, dict) else {}
    engine = _text(_pick(voice_section, env, "ttsEngine", "AGENT_TTS_ENGINE")).lower() or ENGINE_EDGE
    if engine not in SUPPORTED_ENGINES:
        engine = ENGINE_EDGE
    default_voice = DEFAULT_VOICE[engine]
    voice = _pick(voice_section, env, "ttsVoice", "AGENT_TTS_VOICE")
    voice = _text(voice) or default_voice
    api_key = _pick(voice_section, env, "ttsApiKey", "AGENT_TTS_API_KEY")
    api_base = _pick(voice_section, env, "ttsApiBase", "AGENT_TTS_API_BASE")
    model = _pick(voice_section, env, "ttsModel", "AGENT_TTS_MODEL")
    enabled_raw = voice_section.get("ttsEnabled", True)
    return TtsOptions(
        enabled=enabled_raw is not False,
        engine=engine,
        voice=voice,
        rate=_percent(_pick(voice_section, env, "ttsRate", "AGENT_TTS_RATE")),
        pitch=_hertz(_pick(voice_section, env, "ttsPitch", "AGENT_TTS_PITCH")),
        model=_text(model) or DEFAULT_MODEL,
        api_base=_text(api_base),
        api_key="" if _is_masked(api_key) else _text(api_key),
        lang=_text(voice_section.get("language")) or "zh-CN",
    )


__all__ = [
    "DEFAULT_MODEL",
    "DEFAULT_VOICE",
    "ENGINE_EDGE",
    "ENGINE_OPENAI",
    "MAX_INPUT_CHARS",
    "SUPPORTED_ENGINES",
    "TtsOptions",
    "build_tts_options",
]
