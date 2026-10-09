"""语音转写（STT）helper（对齐 ``awareness/voice-stt.helper.ts``）。

按配置选择前端 Web Speech / HA 实体 / 自动回退三种模式：

- ``resolve_stt_entity``：优先配置的 STT 实体，缺省取首个非 unavailable 的 provider；
- ``transcribe_voice_audio``：校验音频 → 解析 STT 实体 → 调 HA ``stt.speech_to_text``（base64 data URL）；
- ``process_ha_conversation``：调用 HA ``/api/conversation/process`` 完成语义解析（12s 超时，失败静默降级）。
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

import httpx

from ...core.errors import BusinessException, ErrorCode, api_error, bad_request

logger = logging.getLogger("homeos.awareness.stt")

#: STT 识别模式
SttMode = str  # 'browser' | 'ha' | 'auto'


@dataclass
class VoiceSttConfig:
    """STT 相关 voice 配置快照。"""

    language: str = "zh-CN"
    stt_mode: str = "auto"
    stt_entity_id: str = ""
    use_ha_conversation: bool = True


@dataclass
class VoiceSttDeps:
    """STT helper 依赖注入（对齐 Nest ``VoiceSttDeps``）。"""

    ha_connector: Any
    get_voice_config: Callable[[], VoiceSttConfig]
    list_stt_providers: Callable[[], Awaitable[list[dict[str, Any]]]]
    get_ha_rest_config: Callable[[], Awaitable[dict[str, Any]]] | None = None
    logger: logging.Logger = field(default_factory=lambda: logger)


_MIME_BY_FORMAT = {"wav": "audio/wav", "ogg": "audio/ogg"}
_DEFAULT_MIME = "audio/webm"


async def resolve_stt_entity(deps: VoiceSttDeps) -> str | None:
    """优先使用配置的 STT 实体；缺省取首个非 ``unavailable`` 的 provider。"""
    configured = str(deps.get_voice_config().stt_entity_id or "").strip()
    if configured:
        return configured
    providers = await deps.list_stt_providers()
    online = next(
        (p for p in providers if str(p.get("state") or "") != "unavailable"), None
    )
    if online is not None:
        return str(online.get("entity_id") or "") or None
    if providers:
        return str(providers[0].get("entity_id") or "") or None
    return None


async def transcribe_voice_audio(
    audio_base64: str, format: str, deps: VoiceSttDeps
) -> dict[str, Any]:
    """调用 HA STT 实体将 base64 音频转写为文本。"""
    if not str(audio_base64 or "").strip():
        bad_request(str(api_error("VOICE_AUDIO_EMPTY")))

    voice = deps.get_voice_config()
    entity_id = await resolve_stt_entity(deps)
    if not entity_id:
        bad_request(str(api_error("VOICE_STT_NOT_CONFIGURED")))

    mime = _MIME_BY_FORMAT.get(format, _DEFAULT_MIME)
    stripped = _strip_data_url(str(audio_base64))
    media_content_id = f"data:{mime};base64,{stripped}"

    try:
        result = await deps.ha_connector.call_service_via_rest(
            "stt",
            "speech_to_text",
            entity_id,
            {
                "language": voice.language or "zh-CN",
                "media": {"media_content_id": media_content_id, "media_content_type": mime},
            },
        )
        text = _extract_transcript(result)
        if not text:
            raise BusinessException(
                ErrorCode.EXTERNAL_ERROR, str(api_error("VOICE_STT_NO_TEXT"))
            )
        deps.logger.info("HA 语音识别 [%s]: %s...", entity_id, text[:40])
        return {"text": text, "provider": entity_id}
    except BusinessException:
        raise
    except Exception as exc:
        message = str(exc)
        deps.logger.warning("HA 语音识别失败 [%s]: %s", entity_id, message)
        detail = api_error("VOICE_STT_FAILED", message)
        raise BusinessException(ErrorCode.EXTERNAL_ERROR, detail) from exc


async def process_ha_conversation(text: str, deps: VoiceSttDeps) -> dict[str, Any]:
    """调用 HA Assist 对话接口（``/api/conversation/process``），失败时静默降级。"""
    trimmed = str(text or "").strip()
    if not trimmed:
        return {"text": "", "response": None}
    if not deps.get_voice_config().use_ha_conversation:
        return {"text": trimmed, "response": None}

    get_rest = deps.get_ha_rest_config
    if get_rest is None:
        return {"text": trimmed, "response": None}
    rest = await get_rest()
    ha_url = rest.get("haUrl") if isinstance(rest, dict) else None
    token = rest.get("token") if isinstance(rest, dict) else None
    if not ha_url or not token:
        return {"text": trimmed, "response": None}

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            res = await client.post(
                f"{str(ha_url).rstrip('/')}/api/conversation/process",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={
                    "text": trimmed,
                    "language": deps.get_voice_config().language or "zh-CN",
                },
            )
            if res.status_code >= 400:
                snippet = (res.text or "")[:120]
                detail = api_error("VOICE_HA_CONVERSATION_FAILED", res.status_code, snippet)
                raise BusinessException(ErrorCode.EXTERNAL_ERROR, detail)
            data = res.json()
        return {"text": trimmed, "response": data if isinstance(data, dict) else {}}
    except Exception as exc:
        deps.logger.debug("HA 对话跳过: %s", exc)
        return {"text": trimmed, "response": None}


def _strip_data_url(value: str) -> str:
    marker = ";base64,"
    if value.startswith("data:") and marker in value:
        return value.split(marker, 1)[1]
    return value


def _extract_transcript(result: Any) -> str:
    if isinstance(result, str):
        return result.strip()
    if isinstance(result, dict):
        direct = result.get("text") or result.get("speech")
        if direct:
            return str(direct).strip()
        nested = result.get("result")
        if isinstance(nested, dict) and nested.get("text"):
            return str(nested["text"]).strip()
    return ""


__all__ = [
    "SttMode",
    "VoiceSttConfig",
    "VoiceSttDeps",
    "process_ha_conversation",
    "resolve_stt_entity",
    "transcribe_voice_audio",
]
