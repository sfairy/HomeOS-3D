"""安防面板路由（``/api/v1/security-panel/*``），对齐 Nest ``SecurityPanelController``。"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from ..core.errors import bad_request
from ..dependencies import license_feature
from ..security.auth_context import require_roles
from ..services.license import features as feature_codes
from .router import NestRouter

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

class ConfigureSecurityZonesDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    zones: list[SecurityZoneDto]

class SecurityEmergencyDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str | None = None

class AwaySimEnableDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lights: list[str] | None = None
    activeStartHour: float | None = Field(default=None)
    activeEndHour: float | None = Field(default=None)

def _panel(request: Request):
    return request.app.state.security_panel

def _away_sim(request: Request):
    return request.app.state.away_sim

@router.get("/status")
async def get_status(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin", "adult"))
):
    panel = _panel(request)
    return {"mode": panel.get_mode(), "zones": panel.get_zones()}

@router.post("/arm")
async def arm(
    payload: ArmSecurityPanelDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    if payload.mode not in _ARMING_MODES:
        bad_request(_MODE_MESSAGE)
    if payload.zoneIds is not None and any(not isinstance(item, str) for item in payload.zoneIds):
        bad_request("zoneIds 元素须为字符串")
    return await _panel(request).arm(payload.mode, payload.zoneIds)

@router.post("/disarm")
async def disarm(request: Request, user: dict[str, Any] = Depends(require_roles("admin"))):
    return await _panel(request).disarm()

@router.post("/zones")
async def configure_zones(
    payload: ConfigureSecurityZonesDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    _panel(request).configure_zones([zone.model_dump() for zone in payload.zones])
    return {"success": True}

@router.post("/emergency")
async def emergency(
    payload: SecurityEmergencyDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _panel(request).trigger_emergency(payload.action or "panic")

@router.get("/events")
async def get_events(
    request: Request,
    type: str | None = Query(default=None),
    limit: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    return await _panel(request).get_events(type, limit)

@router.get("/away-sim/status")
async def away_sim_status(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin", "adult"))
):
    return _away_sim(request).get_status()

@router.get("/away-sim/pattern")
async def away_sim_pattern(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin", "adult"))
):
    return await _away_sim(request).get_learned_pattern()

@router.post("/away-sim/enable")
async def away_sim_enable(
    payload: AwaySimEnableDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    opts = payload.model_dump(exclude_none=True)
    return await _away_sim(request).enable(opts)

@router.post("/away-sim/disable")
async def away_sim_disable(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return await _away_sim(request).disable()
