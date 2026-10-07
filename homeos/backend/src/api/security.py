"""安防路由（``/api/v1/security/*``），对齐 Nest ``SecurityController``。"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, ConfigDict

from ..core.errors import bad_request
from ..dependencies import license_feature
from ..security.auth_context import require_roles
from ..services.license import features as feature_codes
from .router import NestRouter

router = NestRouter(
    prefix="/security",
    tags=["awareness"],
    dependencies=[license_feature(feature_codes.FEATURE_SECURITY)],
)

class AckIdsDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ids: list[str] | None = None

class HazardDrillDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str | None = None

def _frigate(request: Request):
    return request.app.state.frigate

def _presence(request: Request):
    return request.app.state.presence

def _mmwave(request: Request):
    return request.app.state.mmwave

def _security_service(request: Request):
    return request.app.state.security_service

def _hazard_drill(request: Request):
    return request.app.state.hazard_drill

@router.get("/events")
async def get_events(request: Request, user: dict[str, Any] = Depends(require_roles("admin", "adult"))):
    return await _security_service(request).fetch_events()

@router.get("/events/validate")
async def validate_events(request: Request, user: dict[str, Any] = Depends(require_roles("admin"))):
    return await _security_service(request).validate_events_path()

@router.get("/frigate/events")
async def get_frigate_events(
    request: Request,
    limit: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    from ..services.security.config import load_security_config, parse_optional_int

    with request.app.state.database.session_factory() as session:
        default_limit = int(load_security_config(session).get("frigateMaxEvents") or 50)
    parsed = parse_optional_int(limit, default_limit)
    effective = parsed if parsed and parsed > 0 else default_limit
    return _frigate(request).get_recent_events(effective)

@router.post("/frigate/ack")
async def ack_frigate_events(
    payload: AckIdsDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    ids = payload.ids
    if ids is not None:
        if not isinstance(ids, list):
            bad_request("ids 须为数组")
        if any(not isinstance(item, str) for item in ids):
            bad_request("ids 每项须为字符串")
    return _frigate(request).ack_events(ids or [])

@router.get("/presence/home")
async def get_home_presence(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin", "adult"))
):
    return await _presence(request).get_home_presence_response()

@router.get("/presence/summary")
async def get_mmwave_summary(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin", "adult"))
):
    return _mmwave(request).get_summary()

@router.post("/hazard/drill")
async def run_hazard_drill(
    payload: HazardDrillDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    kind_raw = payload.kind
    if kind_raw is not None and kind_raw not in ("smoke", "gas", "leak"):
        bad_request("kind 须为 smoke / gas / leak")
    kind = kind_raw if kind_raw in ("gas", "leak") else "smoke"
    return await _hazard_drill(request).run_drill(kind)
