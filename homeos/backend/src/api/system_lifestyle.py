"""影音场景路由（``/api/v1/system/media/*``）。

对齐 Nest ``SystemLifestyleController`` 的 media 部分（voice 路由属感知域，
Phase 6 接入 ``AwarenessModule`` 后挂载到同一 router）。

守卫语义与 Nest 一致：
- ``GET media/scene/presets`` / ``GET media/playlist`` 仅需 JWT；
- 其余写操作叠加 ``RolesGuard`` + ``@Roles('admin','adult')``。
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, BeforeValidator, ConfigDict

from ..security.auth_context import require_roles, require_user
from .router import NestRouter

router = NestRouter(prefix="/system", tags=["system"])

#: 媒体场景预设白名单（对齐 DTO 的 ``MEDIA_SCENE_PRESETS``）。
_MEDIA_SCENE_PRESETS = ("movie", "music", "gaming", "party", "sleep", "morning")

class StrictModel(BaseModel):
    """等价 Nest ``ValidationPipe({ whitelist, forbidNonWhitelisted })``：拒绝未知字段。"""

    model_config = ConfigDict(extra="forbid")

def _scene_service(request: Request):
    return request.app.state.media_scene

def _string_list(array_message: str, item_message: str):
    """``@IsArray`` + ``@IsString({each:true})`` 等价校验（区分两条文案）。"""

    def check(value: Any) -> Any:
        if value is None:
            return value
        if not isinstance(value, list):
            raise ValueError(array_message)
        if any(not isinstance(item, str) for item in value):
            raise ValueError(item_message)
        return value

    return check

def _list_field(array_message: str):
    """``@IsArray`` 等价校验（嵌套 DTO 数组，元素由子 DTO 负责校验）。"""

    def check(value: Any) -> Any:
        if value is None:
            return value
        if not isinstance(value, list):
            raise ValueError(array_message)
        return value

    return check

def _string_value(message: str):
    def check(value: Any) -> Any:
        if value is None or isinstance(value, str):
            return value
        raise ValueError(message)

    return check

def _validate_preset(value: Any) -> Any:
    if value is not None and value not in _MEDIA_SCENE_PRESETS:
        raise ValueError("preset 无效")
    return value

PresetField = Annotated[str, BeforeValidator(_validate_preset)]
MediaPlayersField = Annotated[
    list[str], BeforeValidator(_string_list("mediaPlayers 须为数组", "mediaPlayers 每项须为字符串"))
]
LightsField = Annotated[
    list[str], BeforeValidator(_string_list("lights 须为数组", "lights 每项须为字符串"))
]
PlayerField = Annotated[str, BeforeValidator(_string_value("player 须为字符串"))]
PlaylistItemsField = Annotated[
    list["MediaPlaylistItemDto"], BeforeValidator(_list_field("items 须为数组"))
]

class MediaSceneApplyDto(StrictModel):
    preset: PresetField
    mediaPlayers: MediaPlayersField | None = None
    lights: LightsField | None = None

class MediaPlaylistItemDto(StrictModel):
    mediaContentId: str
    mediaContentType: str
    title: str | None = None

class MediaPlaylistStartDto(StrictModel):
    player: PlayerField
    items: PlaylistItemsField

class MediaPlayerRefDto(StrictModel):
    player: PlayerField

class MediaGroupPlayersDto(StrictModel):
    players: Annotated[
        list[str], BeforeValidator(_string_list("players 须为数组", "players 每项须为字符串"))
    ]

@router.get("/media/scene/presets")
async def list_media_scene_presets(
    request: Request, user: dict[str, Any] = Depends(require_user)
):
    return {"presets": _scene_service(request).list_presets()}

@router.post("/media/scene")
async def apply_media_scene(
    payload: MediaSceneApplyDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    return await _scene_service(request).apply_scene(
        payload.preset,
        {"mediaPlayers": payload.mediaPlayers, "lights": payload.lights},
    )

@router.post("/media/playlist/start")
async def start_playlist(
    payload: MediaPlaylistStartDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    items = [item.model_dump(exclude_none=True) for item in payload.items]
    return await _scene_service(request).start_playlist(payload.player, items)

@router.post("/media/playlist/next")
async def next_track(
    payload: MediaPlayerRefDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    return await _scene_service(request).next_track(payload.player)

@router.get("/media/playlist")
async def get_playlist(
    request: Request,
    player: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    return _scene_service(request).get_playlist(player)

@router.post("/media/group/sync")
async def media_group_sync(
    payload: MediaGroupPlayersDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    return await _scene_service(request).group_sync(payload.players)

@router.post("/media/group/unjoin")
async def media_group_unjoin(
    payload: MediaGroupPlayersDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    return await _scene_service(request).unjoin(payload.players)
