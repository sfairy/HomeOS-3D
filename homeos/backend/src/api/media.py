"""媒体路由（``/api/v1/media/*``）。

- ``POST /media/test-connection``：测 Music Assistant / MoviePilot 连通性；
- ``GET  /media/players``：MA 播放器列表；
- ``GET  /media/arrivals``：MoviePilot 入库列表；
- ``GET  /media/search`` / ``POST /media/play``：点歌（唯一命中才提交队列）；
- ``POST /media/arrivals/poll``：手动触发一次入库轮询。
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from .router import NestRouter
from ..dependencies import license_feature
from ..domains.license import features as feature_codes
from ..platform.core.http.errors import BusinessException, ErrorCode
from ..platform.security.auth_context import require_user

router = NestRouter(
    prefix="/media",
    tags=["agent"],
    dependencies=[license_feature(feature_codes.FEATURE_AGENT)],
)


def _service(request: Request) -> Any:
    service = getattr(request.app.state, "media_service", None)
    if service is None:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "媒体服务未启用")
    return service


class TestConnectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str = Field(min_length=1, max_length=16)


class PlayMusicRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    artist: str = ""
    track: str = Field(min_length=1, max_length=160)
    areaId: str = ""


@router.post("/test-connection")
async def test_connection(
    payload: TestConnectionRequest, request: Request, user: dict[str, Any] = Depends(require_user)
):
    return await _service(request).test_connection(payload.kind)


@router.get("/players")
async def list_players(request: Request, user: dict[str, Any] = Depends(require_user)):
    return await _service(request).players()


@router.get("/arrivals")
async def list_arrivals(request: Request, limit: int = Query(default=50), user: dict[str, Any] = Depends(require_user)):
    service = _service(request)
    return {"items": await asyncio.to_thread(service.list_arrivals, limit)}


@router.post("/arrivals/poll")
async def poll_arrivals(request: Request, user: dict[str, Any] = Depends(require_user)):
    service = _service(request)
    result = await service.poll_arrivals()
    notified = await service.notify_pending_arrivals()
    return {**result, "notified": notified}


@router.get("/search")
async def search_music(
    request: Request,
    query: str = Query(min_length=1, max_length=160),
    type: str = Query(default="track"),
    limit: int = Query(default=10),
    user: dict[str, Any] = Depends(require_user),
):
    return await _service(request).search_music(query, media_type=type, limit=limit)


@router.post("/play")
async def play_music(payload: PlayMusicRequest, request: Request, user: dict[str, Any] = Depends(require_user)):
    return await _service(request).play_music(artist=payload.artist, track=payload.track, area_id=payload.areaId)
