"""HA 摄像头 WebRTC 信令桥（``/api/v1/ha/webrtc/*``）。

阶段 3 下线了 homeos 旧的 WebRTC REST 面后，前端 ``useHaWebRtcPlayer`` 仍调用
``/ha/webrtc/client-config|negotiate|candidate|close``，但后端没有实现 —— H265 摄像头
的 HLS（hev1）在部分浏览器播不了，必须走 WebRTC。本模块用 ``studio_ha`` 的 WebSocket
把上述 REST 转成 HA ``camera/webrtc/*`` 命令，会话期内保持上游连接以便补 ICE。
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..dependencies import ShortLivedLicensedViewer
from ..ha.client import HAClientError
from ..ha.crypto import CredentialCipherError
from .ha import active_connection
from .ha_proxy import _camera_license_allows

logger = logging.getLogger('homeos.ha_webrtc')

router = APIRouter(prefix='/ha/webrtc', tags=['ha-webrtc'], include_in_schema=False)

NEGOTIATE_TIMEOUT_SECONDS = 30.0
CANDIDATE_DRAIN_SECONDS = 1.0
SESSION_TTL_SECONDS = 120.0
DEFAULT_ICE_SERVERS = [
    {'urls': ['stun:stun.home-assistant.io:3478', 'stun:stun.home-assistant.io:80']},
]


class WebRtcNegotiateBody(BaseModel):
    entity_id: str = Field(min_length=1)
    offer: str = Field(min_length=1)


class WebRtcCandidateBody(BaseModel):
    entity_id: str = Field(min_length=1)
    session_id: str = Field(min_length=1)
    candidate: dict[str, Any]


class WebRtcCloseBody(BaseModel):
    entity_id: str | None = None
    session_id: str | None = None
    subscription_id: int | None = None


@dataclass
class WebRtcSession:
    """一条尚未关闭的 HA WebRTC 协商会话（持有上游 WebSocket）。"""

    entity_id: str
    session_id: str
    subscription_id: int
    websocket: Any
    client: Any
    next_message_id: int
    created_at: float = field(default_factory=time.monotonic)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_sessions: dict[str, WebRtcSession] = {}
_sessions_lock = asyncio.Lock()


async def _require_camera_license(request: Request) -> None:
    if not await _camera_license_allows(request):
        raise HTTPException(
            status_code=403,
            detail={
                'code': 'LICENSE_RESTRICTED',
                'message': '当前授权状态不允许读取摄像头。',
            },
        )


def _load_active_connection(database_manager) -> Any:
    with database_manager.session_factory() as database:
        connection = active_connection(database)
        if connection is not None:
            database.expunge(connection)
        return connection


async def _ha_client(request: Request):
    connection = await asyncio.to_thread(_load_active_connection, request.app.state.database)
    if connection is None:
        raise HTTPException(status_code=409, detail='请先配置 Home Assistant 连接。')
    try:
        return await request.app.state.studio_ha.client_for(connection)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


async def _purge_expired_sessions() -> None:
    now = time.monotonic()
    async with _sessions_lock:
        expired = [
            sid
            for sid, session in _sessions.items()
            if now - session.created_at > SESSION_TTL_SECONDS
        ]
        for sid in expired:
            session = _sessions.pop(sid, None)
            if session is None:
                continue
            await _close_session_ws(session)


async def _close_session_ws(session: WebRtcSession) -> None:
    try:
        async with session.lock:
            try:
                await session.websocket.send(
                    json.dumps(
                        {
                            'id': session.next_message_id,
                            'type': 'unsubscribe_events',
                            'subscription': session.subscription_id,
                        }
                    )
                )
            except Exception:
                pass
            try:
                await session.websocket.close()
            except Exception:
                pass
    except Exception:
        logger.debug('关闭 WebRTC 会话失败 session=%s', session.session_id, exc_info=True)


@router.get('/ice-servers')
async def webrtc_ice_servers(
    request: Request, _viewer: ShortLivedLicensedViewer
) -> dict[str, Any]:
    await _require_camera_license(request)
    return {'iceServers': DEFAULT_ICE_SERVERS}


@router.get('/client-config')
async def webrtc_client_config(
    request: Request,
    _viewer: ShortLivedLicensedViewer,
    entity_id: str = Query(min_length=1),
) -> dict[str, Any]:
    await _require_camera_license(request)
    client = await _ha_client(request)
    websocket = await client.connect_websocket()
    try:
        result = await client.command(
            websocket, 1, 'camera/webrtc/get_client_config', entity_id=entity_id
        )
    except HAClientError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    finally:
        await websocket.close()
    if not isinstance(result, dict):
        return {'configuration': {'iceServers': DEFAULT_ICE_SERVERS}}
    return result if 'configuration' in result else {'configuration': result}


@router.post('/negotiate')
async def webrtc_negotiate(
    body: WebRtcNegotiateBody,
    request: Request,
    _viewer: ShortLivedLicensedViewer,
) -> dict[str, Any]:
    await _require_camera_license(request)
    await _purge_expired_sessions()
    client = await _ha_client(request)
    websocket = await client.connect_websocket()
    subscription_id = 1
    try:
        await websocket.send(
            json.dumps(
                {
                    'id': subscription_id,
                    'type': 'camera/webrtc/offer',
                    'entity_id': body.entity_id,
                    'offer': body.offer,
                }
            )
        )
        # 先等 result（订阅建立），再等 session / answer / error 事件。
        deadline = time.monotonic() + NEGOTIATE_TIMEOUT_SECONDS
        session_id = ''
        answer = ''
        candidates: list[dict[str, Any]] = []
        saw_result = False
        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            message = json.loads(await asyncio.wait_for(websocket.recv(), timeout=remaining))
            if message.get('id') != subscription_id:
                continue
            if message.get('type') == 'result':
                if not message.get('success'):
                    error = message.get('error') or {}
                    raise HTTPException(
                        status_code=502,
                        detail=str(error.get('message') or 'WebRTC offer 被 Home Assistant 拒绝。'),
                    )
                saw_result = True
                continue
            if message.get('type') != 'event':
                continue
            event = message.get('event') or {}
            event_type = event.get('type')
            if event_type == 'session':
                session_id = str(event.get('session_id') or '')
            elif event_type == 'answer':
                answer = str(event.get('answer') or '')
                break
            elif event_type == 'candidate':
                candidate = event.get('candidate')
                if isinstance(candidate, dict):
                    candidates.append(candidate)
            elif event_type == 'error':
                raise HTTPException(
                    status_code=502,
                    detail=str(event.get('message') or event.get('code') or 'WebRTC 协商失败'),
                )
        if not saw_result:
            raise HTTPException(status_code=502, detail='Home Assistant 未确认 WebRTC 订阅。')
        if not answer:
            raise HTTPException(status_code=502, detail='Home Assistant 未返回 WebRTC answer。')
        # 短暂排空后续 ICE 候选，减少首帧前黑洞。
        drain_deadline = time.monotonic() + CANDIDATE_DRAIN_SECONDS
        while time.monotonic() < drain_deadline:
            try:
                message = json.loads(
                    await asyncio.wait_for(
                        websocket.recv(), timeout=max(0.05, drain_deadline - time.monotonic())
                    )
                )
            except TimeoutError:
                break
            if message.get('id') != subscription_id or message.get('type') != 'event':
                continue
            event = message.get('event') or {}
            if event.get('type') == 'candidate' and isinstance(event.get('candidate'), dict):
                candidates.append(event['candidate'])
            elif event.get('type') == 'error':
                raise HTTPException(
                    status_code=502,
                    detail=str(event.get('message') or event.get('code') or 'WebRTC 协商失败'),
                )
        if not session_id:
            raise HTTPException(status_code=502, detail='Home Assistant 未返回 WebRTC session_id。')
        session = WebRtcSession(
            entity_id=body.entity_id,
            session_id=session_id,
            subscription_id=subscription_id,
            websocket=websocket,
            client=client,
            next_message_id=subscription_id + 1,
        )
        async with _sessions_lock:
            _sessions[session_id] = session
        # 所有权已交给会话表，勿在 finally 里关掉。
        websocket = None
        return {
            'session_id': session_id,
            'answer': answer,
            'candidates': candidates,
            'subscription_id': subscription_id,
        }
    except HTTPException:
        raise
    except TimeoutError as error:
        raise HTTPException(status_code=504, detail='WebRTC 协商超时。') from error
    except (HAClientError, CredentialCipherError, OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=502, detail=f'WebRTC 协商失败：{error}') from error
    finally:
        if websocket is not None:
            try:
                await websocket.close()
            except Exception:
                pass


@router.post('/candidate')
async def webrtc_candidate(
    body: WebRtcCandidateBody,
    request: Request,
    _viewer: ShortLivedLicensedViewer,
) -> dict[str, Any]:
    await _require_camera_license(request)
    async with _sessions_lock:
        session = _sessions.get(body.session_id)
    if session is None or session.entity_id != body.entity_id:
        raise HTTPException(status_code=404, detail='WebRTC 会话不存在或已过期。')
    async with session.lock:
        message_id = session.next_message_id
        session.next_message_id += 1
        try:
            await session.websocket.send(
                json.dumps(
                    {
                        'id': message_id,
                        'type': 'camera/webrtc/candidate',
                        'entity_id': body.entity_id,
                        'session_id': body.session_id,
                        'candidate': body.candidate,
                    }
                )
            )
        except Exception as error:
            raise HTTPException(status_code=502, detail=f'上报 ICE 候选失败：{error}') from error
    return {'ok': True}


@router.post('/close')
async def webrtc_close(
    body: WebRtcCloseBody,
    request: Request,
    _viewer: ShortLivedLicensedViewer,
) -> dict[str, Any]:
    await _require_camera_license(request)
    session: WebRtcSession | None = None
    async with _sessions_lock:
        if body.session_id and body.session_id in _sessions:
            session = _sessions.pop(body.session_id)
        elif body.subscription_id is not None:
            for sid, item in list(_sessions.items()):
                if item.subscription_id == body.subscription_id:
                    session = _sessions.pop(sid)
                    break
    if session is not None:
        await _close_session_ws(session)
    return {'ok': True}
