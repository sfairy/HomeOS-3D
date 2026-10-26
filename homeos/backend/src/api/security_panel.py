"""安防面板路由（``/api/v1/security-panel/*``），对齐 Nest ``SecurityPanelController``。"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from .router import NestRouter
from ..dependencies import license_feature
from ..domains.license import features as feature_codes
from ..platform.core.errors import bad_request
from ..platform.security.auth_context import require_user

router = NestRouter(
    prefix="/security-panel",
    tags=["awareness"],
    dependencies=[license_feature(feature_codes.FEATURE_SECURITY)],
)

_ARMING_MODES = ("disarmed", "armed_home", "armed_away", "armed_night")
_MODE_MESSAGE = "mode 须为 disarmed | armed_home | armed_away | armed_night"

class SecurityZoneDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    sensors: list[str]
    armed: bool | None = None
    zoneType: str | None = None
    roomId: str | None = None

class ArmSecurityPanelDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: str
    zoneIds: list[str] | None = None
    #: 同模式重复布防时强制重跑联动（如手动开锁后希望重新上锁）。
    force: bool = False

class ConfigureSecurityZonesDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    zones: list[SecurityZoneDto]
    #: 空数组会清空全部防区；必须显式确认，避免一次误传把全屋防区删光。
    confirmClear: bool = False

class SecurityEmergencyDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str | None = None


class AckSecurityEventsDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    #: 事件 id（UUID 字符串）；只对未确认事件生效。
    eventIds: list[str] = Field(min_length=1)

class AwaySimEnableDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lights: list[str] | None = None
    activeStartHour: float | None = Field(default=None)
    activeEndHour: float | None = Field(default=None)

def _panel(request: Request):
    return request.app.state.security_panel


def _actor(user: dict[str, Any]) -> str | None:
    value = user.get("username") or user.get("email") or user.get("id")
    text = str(value or "").strip()
    return text or None

def _away_sim(request: Request):
    return request.app.state.away_sim

@router.get("/status")
async def get_status(
    request: Request, user: dict[str, Any] = Depends(require_user)
):
    panel = _panel(request)
    return {"mode": panel.get_mode(), "zones": panel.get_zones()}

@router.post("/arm")
async def arm(
    payload: ArmSecurityPanelDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    if payload.mode not in _ARMING_MODES:
        bad_request(_MODE_MESSAGE)
    if payload.zoneIds is not None and any(
        not isinstance(item, str) or not item.strip() for item in payload.zoneIds
    ):
        bad_request("zoneIds 元素须为非空字符串")
    return await _panel(request).arm(
        payload.mode,
        payload.zoneIds,
        {"force": payload.force, "source": "manual", "actor": _actor(user)},
    )


@router.post("/disarm")
async def disarm(request: Request, user: dict[str, Any] = Depends(require_user)):
    return await _panel(request).disarm({"source": "manual", "actor": _actor(user)})

@router.post("/zones")
async def configure_zones(
    payload: ConfigureSecurityZonesDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    await _panel(request).configure_zones(
        [zone.model_dump() for zone in payload.zones],
        confirm_clear=payload.confirmClear,
    )
    return {"success": True}

@router.post("/emergency")
async def emergency(
    payload: SecurityEmergencyDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    return await _panel(request).trigger_emergency(
        payload.action or "panic", source="manual", actor=_actor(user)
    )

@router.get("/events")
async def get_events(
    request: Request,
    type: str | None = Query(default=None),
    limit: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    return await _panel(request).get_events(type, limit)


@router.post("/events/ack")
async def ack_events(
    payload: AckSecurityEventsDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    actor = _actor(user)
    updated = await _panel(request).ack_events(payload.eventIds, actor)
    return {"success": True, "acknowledged": updated}

@router.get("/away-sim/status")
async def away_sim_status(
    request: Request, user: dict[str, Any] = Depends(require_user)
):
    return _away_sim(request).get_status()

@router.get("/away-sim/pattern")
async def away_sim_pattern(
    request: Request, user: dict[str, Any] = Depends(require_user)
):
    return await _away_sim(request).get_learned_pattern()

@router.post("/away-sim/enable")
async def away_sim_enable(
    payload: AwaySimEnableDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    opts = payload.model_dump(exclude_none=True)
    return await _away_sim(request).enable(opts)

@router.post("/away-sim/disable")
async def away_sim_disable(
    request: Request, user: dict[str, Any] = Depends(require_user)
):
    return await _away_sim(request).disable()
