"""智能音箱路由（``/api/v1/agent/voice-devices`` 与 ``/agent/wake-words`` / ``/agent/voice-chat``）。

对齐参考实现的三个 controller：

- ``agent/voice-devices/*``：管理端生成配对码、列表、唤醒词权限、默认推送接收人、吊销；
  以及音箱侧的 ``pair`` / ``renew`` / ``unlink``（**设备凭证鉴权，不走登录 Cookie**）。
- ``agent/wake-words``：唤醒词网关读写（``PUT`` 仅管理员）。
- ``agent/voice-chat``：音箱对话入口（``Authorization: Bearer <accessToken>``）。

鉴权边界（与参考的注解一一对应）：管理端接口 ``OwnerOnlyUser``；音箱侧三个端点用
``Bearer`` 设备凭证，不看 Cookie —— 音箱上没有浏览器会话，也不该有。
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, NoReturn

from fastapi import Depends, Request
from pydantic import BaseModel, ConfigDict

from .router import NestRouter
from ..dependencies import license_feature, owner_only_user
from ..domains.license import features as feature_codes
from ..domains.voice_device import VoiceDeviceError, WakeWordError
from ..domains.voice_device.wake_word_flow import VoiceWakeWordFlow
from ..platform.core.http.errors import BusinessException, ErrorCode
from ..platform.security.auth_context import require_user

router = NestRouter(
    prefix="/agent",
    tags=["agent"],
    dependencies=[license_feature(feature_codes.FEATURE_AGENT)],
)

#: 音箱端的对话限流：按授权 id 20 次 / 60 秒。
#: 音箱的重试策略比浏览器激进（一次唤醒可能连发 2–3 次），但一分钟 20 次足够正常对话。
_VOICE_CHAT_LIMIT = 20
_VOICE_CHAT_WINDOW_SECONDS = 60.0
_voice_chat_hits: dict[str, list[float]] = {}


def _devices(request: Request) -> Any:
    service = getattr(request.app.state, "voice_devices", None)
    if service is None:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "音箱服务未启用")
    return service


def _gateway(request: Request) -> Any:
    gateway = getattr(request.app.state, "wake_word_gateway", None)
    if gateway is None:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "音箱网关未配置")
    return gateway


def _flow(request: Request) -> VoiceWakeWordFlow:
    flow = getattr(request.app.state, "voice_wake_word_flow", None)
    if flow is None:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "音箱服务未启用")
    return flow


_STATUS_TO_CODE = {
    400: ErrorCode.VALIDATION_FAILED,
    401: ErrorCode.UNAUTHORIZED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    409: ErrorCode.CONFLICT,
    503: ErrorCode.SERVICE_UNAVAILABLE,
}


def _raise(error: Exception) -> NoReturn:
    """把域内异常翻译成统一的 ``BusinessException``（按 ``status`` 选错误码）。

    标注 ``NoReturn``：本函数必定抛异常，调用处的 ``grant`` / 返回值等才不会被
    静态检查判成「可能未绑定」。
    """
    status = int(getattr(error, "status", 400) or 400)
    message = str(getattr(error, "message", None) or error)
    raise BusinessException(_STATUS_TO_CODE.get(status, ErrorCode.VALIDATION_FAILED), message, status)


def _bearer(request: Request) -> str:
    """取 ``Authorization: Bearer <token>``；缺失/形状不对按 401。"""
    header = str(request.headers.get("authorization") or "").strip()
    if not header.lower().startswith("bearer "):
        raise BusinessException(ErrorCode.UNAUTHORIZED, "设备授权无效", 401)
    token = header[7:].strip()
    if not token:
        raise BusinessException(ErrorCode.UNAUTHORIZED, "设备授权无效", 401)
    return token


def _rate_limit_voice_chat(grant_id: str) -> None:
    """按授权 id 的滑动窗口；超限回 429（与登录限流同一语义，只是键不同）。"""
    now = time.monotonic()
    hits = [ts for ts in _voice_chat_hits.get(grant_id, []) if now - ts < _VOICE_CHAT_WINDOW_SECONDS]
    if len(hits) >= _VOICE_CHAT_LIMIT:
        raise BusinessException(ErrorCode.VALIDATION_FAILED, "语音请求过于频繁，请稍后再试。", 429)
    hits.append(now)
    _voice_chat_hits[grant_id] = hits
    # 桶只保留最近活跃的一批：离线的音箱授权行不会永久占内存。
    if len(_voice_chat_hits) > 256:
        for key in list(_voice_chat_hits)[:64]:
            if key != grant_id and not _voice_chat_hits[key]:
                _voice_chat_hits.pop(key, None)


class PairingRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    memberId: Any = None


class PairRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    pairingCode: Any = None
    voiceGatewayId: Any = None
    voiceDeviceId: Any = None


class RenewRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    deviceCredential: Any = None


class WakeWordPermissionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    allowVoiceWakeWordAdd: Any = None


class NotifyMembersRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    memberIds: Any = None


class WakeWordsRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    words: Any = None
    expectedVersion: Any = None


# ── 管理端 ────────────────────────────────────────────────────
@router.post("/voice-devices/pairing")
async def create_pairing(
    request: Request,
    payload: PairingRequest | None = None,
    _owner: Any = Depends(owner_only_user),
):
    """生成一次性配对码（10 分钟有效）。"""
    member_id = payload.memberId if payload is not None else None
    try:
        return await asyncio.to_thread(_devices(request).create_pairing, member_id)
    except VoiceDeviceError as error:
        _raise(error)


@router.get("/voice-devices")
async def list_voice_devices(request: Request, _owner: Any = Depends(owner_only_user)):
    """已配对的音箱列表（不含任何凭据）。"""
    try:
        return await asyncio.to_thread(_devices(request).list_devices)
    except VoiceDeviceError as error:
        _raise(error)


@router.put("/voice-devices/{grant_id}/wake-word-permission")
async def set_wake_word_permission(
    grant_id: str,
    payload: WakeWordPermissionRequest,
    request: Request,
    _owner: Any = Depends(owner_only_user),
):
    try:
        return await asyncio.to_thread(
            _devices(request).set_wake_word_permission, grant_id, payload.allowVoiceWakeWordAdd
        )
    except VoiceDeviceError as error:
        _raise(error)


@router.put("/voice-devices/{grant_id}/notify-members")
async def set_notify_members(
    grant_id: str,
    payload: NotifyMembersRequest,
    request: Request,
    _owner: Any = Depends(owner_only_user),
):
    try:
        return await asyncio.to_thread(_devices(request).set_notify_members, grant_id, payload.memberIds)
    except VoiceDeviceError as error:
        _raise(error)


@router.delete("/voice-devices/{grant_id}")
async def revoke_voice_device(grant_id: str, request: Request, _owner: Any = Depends(owner_only_user)):
    try:
        return await asyncio.to_thread(_devices(request).revoke, grant_id)
    except VoiceDeviceError as error:
        _raise(error)


# ── 音箱侧（设备凭证鉴权）────────────────────────────────────
@router.post("/voice-devices/pair")
async def pair_device(payload: PairRequest, request: Request):
    """用配对码换设备凭证。"""
    try:
        return await asyncio.to_thread(
            _devices(request).pair,
            payload.pairingCode,
            payload.voiceGatewayId,
            payload.voiceDeviceId,
        )
    except VoiceDeviceError as error:
        _raise(error)


@router.post("/voice-devices/renew")
async def renew_access_token(payload: RenewRequest, request: Request):
    try:
        return await asyncio.to_thread(_devices(request).renew, payload.deviceCredential)
    except VoiceDeviceError as error:
        _raise(error)


@router.post("/voice-devices/unlink")
async def unlink_voice_device(payload: RenewRequest, request: Request):
    try:
        return await asyncio.to_thread(_devices(request).unlink, payload.deviceCredential)
    except VoiceDeviceError as error:
        _raise(error)


# ── 唤醒词 ───────────────────────────────────────────────────
@router.get("/wake-words")
async def get_wake_words(request: Request, _user: dict[str, Any] = Depends(require_user)):
    """读唤醒词：网关可用则直读（真源），未配置则回本地镜像并标注 ``source=local``。"""
    from ..domains.voice_device.wake_words import current_words_snapshot

    gateway = _gateway(request)
    try:
        return await asyncio.to_thread(gateway.read)
    except WakeWordError as error:
        if error.status == 503:
            return current_words_snapshot(request.app.state.app_config)
        _raise(error)


@router.put("/wake-words")
async def replace_wake_words(
    payload: WakeWordsRequest,
    request: Request,
    _owner: Any = Depends(owner_only_user),
):
    """整表替换唤醒词（带 ``expectedVersion`` CAS）。"""
    gateway = _gateway(request)
    try:
        return await asyncio.to_thread(gateway.update, "replace", payload.words, payload.expectedVersion)
    except WakeWordError as error:
        _raise(error)


# ── 语音对话 ─────────────────────────────────────────────────
@router.post("/voice-chat")
async def voice_chat(payload: dict[str, Any], request: Request):
    """音箱对话入口：设备凭证鉴权 + 语音上下文校验，再交 Agent 主链路。

    与 ``/agent/chat`` 的差别只有三处：鉴权来源（Bearer 凭证而不是 Cookie）、
    会话 key（按音箱 + 对话隔离）、响应可带 ``terminalActions``（自然结束）。
    """
    token = _bearer(request)
    try:
        grant = await asyncio.to_thread(_devices(request).authorize, "accessHash", token)
    except VoiceDeviceError as error:
        _raise(error)

    voice = payload.get("voiceContext")
    if not isinstance(voice, dict):
        raise BusinessException(ErrorCode.VALIDATION_FAILED, "voiceContext 缺失或格式不正确")
    if voice.get("protocolVersion") != 1:
        raise BusinessException(ErrorCode.VALIDATION_FAILED, "voiceContext.protocolVersion 须为 1")
    if str(voice.get("gatewayId") or "") != str(grant["voiceGatewayId"] or "") or str(
        voice.get("speakerId") or ""
    ) != str(grant["voiceDeviceId"] or ""):
        raise BusinessException(ErrorCode.FORBIDDEN, "语音设备与授权不匹配", 403)

    message = str(payload.get("message") or "").strip()
    if not message:
        raise BusinessException(ErrorCode.VALIDATION_FAILED, "message 不能为空")
    if len(message) > 500:
        raise BusinessException(ErrorCode.VALIDATION_FAILED, "message 最长 500 字符")

    _rate_limit_voice_chat(str(grant["id"]))

    conversation_id = str(voice.get("conversationId") or "")
    turn_id = str(voice.get("turnId") or "")
    # 记录「这段对话的最新轮次」，唤醒词确认槽据此判断旧轮次是否已被顶掉。
    mark_voice_turn(request, str(grant["id"]), conversation_id, turn_id)

    # 唤醒词添加流优先：它只回答「要不要加」，不该进 LLM（否则「确认添加」被当闲聊）。
    reply = await asyncio.to_thread(
        _flow(request).handle,
        message,
        str(grant["id"]),
        voice,
        lambda: _voice_turn_current(request, str(grant["id"]), conversation_id, turn_id),
    )
    if reply is not None:
        return reply

    return await _run_voice_turn(payload, request, grant)


async def _run_voice_turn(payload: dict[str, Any], request: Request, grant: dict[str, Any]) -> dict[str, Any]:
    """把设备授权映射成执行身份与会话语义，再走同一个 Agent 服务。

    放在本模块而不是 ``api/agent.py``：两边互相 import 会构成包环（`check:deps` 的 B4/B5）。
    依赖方向固定为「voice_device → agent」单向，只取 ``ChatDto`` 做同一份请求体校验。
    """
    from .agent import ChatDto, _validate_voice_context
    from ..domains.agent.runtime.agent_actor import AgentActor
    from ..domains.agent.runtime.service import AgentChatOptions
    from ..domains.voice_device.session import voice_session_key

    dto = ChatDto.model_validate(payload)
    voice = _validate_voice_context(dto.voiceContext)
    actor = AgentActor(
        user_id=str(grant["memberId"]),
        username=str(grant.get("memberName") or ""),
        role=str(grant.get("role") or "") or None,
    )
    session_id = voice_session_key(str(grant["id"]), str(grant["memberId"]), str(voice["conversationId"]))
    result = await request.app.state.agent_service.chat(
        dto.message,
        [],
        AgentChatOptions(
            actor=actor,
            session_id=session_id,
            entry="voice",
            voice_grant_id=str(grant["id"]),
            voice_context=voice,
        ),
    )
    return result.to_dict()


def _voice_turn_current(request: Request, grant_id: str, conversation_id: str, turn_id: str) -> bool:
    """这段对话的最新轮次是否就是当前这轮（旧轮次回写等于把过期意图执行两次）。"""
    current = getattr(request.app.state, "voice_current_turns", None)
    if not isinstance(current, dict):
        return True
    return current.get(f"{grant_id}:{conversation_id}") == turn_id


def mark_voice_turn(request: Request, grant_id: str, conversation_id: str, turn_id: str) -> None:
    """记录「这台音箱这段对话的最新轮次」。"""
    current = getattr(request.app.state, "voice_current_turns", None)
    if not isinstance(current, dict):
        current = {}
        request.app.state.voice_current_turns = current
    current[f"{grant_id}:{conversation_id}"] = turn_id
    # 简单容量控制：音箱数量 × 对话数不会很大，但长时间运行要防无限增长。
    if len(current) > 512:
        for key in list(current)[:128]:
            current.pop(key, None)


__all__ = [
    "mark_voice_turn",
    "router",
]
