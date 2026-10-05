"""语音路由（``/api/v1/system/voice/*``）。

对齐 Nest ``SystemLifestyleController`` 的 voice 部分（感知域 ``VoiceService``）：

- ``GET  voice/stt-status``：STT 状态 + provider 列表 + 自动探测实体（JWT）；
- ``POST voice/transcribe``：HA 语音转文字（admin / adult / child）；
- ``POST voice/conversation``：HA Assistant 对话处理（admin / adult / child）；
- ``GET  voice/meta``：语音模块元信息（房间 / STT / TTS / 命令数，JWT）；
- ``GET  voice/presets``：全屋默认语音命令模板（JWT）；
- ``POST voice/execute``：执行语音指令（admin / adult / child）；
- ``POST voice/speak``：TTS 播报（admin / adult）；
- ``POST voice/speak-multiple``：TTS 多音箱播报（admin / adult）。
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Request
from pydantic import BaseModel, BeforeValidator, ConfigDict

from ..security.auth_context import require_roles, require_user
from .router import NestRouter

router = NestRouter(prefix="/system", tags=["system"])


class StrictModel(BaseModel):
    """等价 Nest ``ValidationPipe({ whitelist, forbidNonWhitelisted })``：拒绝未知字段。"""

    model_config = ConfigDict(extra="forbid")


def _string_value(message: str):
    def check(value: Any) -> Any:
        if value is None or isinstance(value, str):
            return value
        raise ValueError(message)

    return check


def _string_list(array_message: str, item_message: str):
    def check(value: Any) -> Any:
        if value is None:
            return value
        if not isinstance(value, list):
            raise ValueError(array_message)
        if any(not isinstance(item, str) for item in value):
            raise ValueError(item_message)
        return value

    return check


AudioField = Annotated[str, BeforeValidator(_string_value("audio 须为字符串"))]
FormatField = Annotated[str, BeforeValidator(_string_value("format 须为字符串"))]
TextField = Annotated[str, BeforeValidator(_string_value("text 须为字符串"))]
MessageField = Annotated[str, BeforeValidator(_string_value("message 须为字符串"))]
MediaPlayerField = Annotated[str, BeforeValidator(_string_value("mediaPlayer 须为字符串"))]
MediaPlayersField = Annotated[
    list[str], BeforeValidator(_string_list("mediaPlayers 须为数组", "mediaPlayers 每项须为字符串"))
]


class VoiceTranscribeDto(StrictModel):
    audio: AudioField | None = None
    format: FormatField | None = None


class VoiceTextDto(StrictModel):
    text: TextField | None = None


class VoiceSpeakDto(StrictModel):
    message: MessageField | None = None
    mediaPlayer: MediaPlayerField | None = None


class VoiceSpeakMultipleDto(StrictModel):
    message: MessageField | None = None
    mediaPlayers: MediaPlayersField | None = None


def _voice(request: Request):
    return request.app.state.voice


@router.get("/voice/stt-status")
async def get_voice_stt_status(request: Request, user: dict[str, Any] = Depends(require_user)):
    service = _voice(request)
    providers = await service.list_stt_providers()
    detected = await service.auto_detect_stt_entity()
    return {**service.get_stt_status(), "providers": providers, "detectedEntityId": detected}


@router.post("/voice/transcribe")
async def transcribe_voice(
    payload: VoiceTranscribeDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    return await _voice(request).transcribe(payload.audio or "", payload.format or "webm")


@router.post("/voice/conversation")
async def process_voice_conversation(
    payload: VoiceTextDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    return await _voice(request).process_conversation(payload.text or "")


@router.get("/voice/meta")
async def get_voice_meta(request: Request, user: dict[str, Any] = Depends(require_user)):
    return await _voice(request).get_voice_meta()


@router.get("/voice/presets")
async def get_voice_presets(request: Request, user: dict[str, Any] = Depends(require_user)):
    return {"presets": _voice(request).get_command_presets()}


@router.post("/voice/execute")
async def execute_voice_command(
    payload: VoiceTextDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    return await _voice(request).execute_command(payload.text or "", user)


@router.post("/voice/speak")
async def speak_voice(
    payload: VoiceSpeakDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    return await _voice(request).speak(payload.message or "", payload.mediaPlayer)


@router.post("/voice/speak-multiple")
async def speak_voice_multiple(
    payload: VoiceSpeakMultipleDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    return await _voice(request).speak_multiple(payload.message or "", payload.mediaPlayers)
