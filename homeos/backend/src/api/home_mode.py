"""家庭模式路由（``/api/v1/modes/*``）。

逐条对齐 Nest HomeModeController：CRUD、激活 / 停用、排序、复制、预设安装、
触发日志与执行历史查询、默认种子初始化。
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Query, Request

from .router import NestRouter
from .schemas.base import StrictModel
from ..dependencies import license_feature
from ..security.auth_context import require_roles, require_user
from ..services.license import features as feature_codes

router = NestRouter(
    prefix="/modes",
    tags=["orchestrate"],
    dependencies=[license_feature(feature_codes.FEATURE_HOME_MODE)],
)

def _service(request: Request):
    return request.app.state.home_mode

class InstallPresetDto(StrictModel):
    entityOverrides: dict[str, str] | None = None
    merge: bool | None = None

class ReorderModeItemDto(StrictModel):
    id: str
    sortOrder: float

class ReorderModesDto(StrictModel):
    items: list[ReorderModeItemDto]

class CreateHomeModeDto(StrictModel):
    name: str
    icon: str | None = None
    config: list[Any]
    triggers: list[Any] | None = None
    sortOrder: float | None = None
    exclusiveGroup: str | None = None
    priority: float | None = None

class UpdateHomeModeDto(StrictModel):
    name: str | None = None
    icon: str | None = None
    config: list[Any] | None = None
    triggers: list[Any] | None = None
    sortOrder: float | None = None
    exclusiveGroup: str | None = None
    priority: float | None = None

def _clamp_int(value: int, minimum: int, maximum: int) -> int:
    return min(max(int(value), minimum), maximum)

def _parse_pagination(page: str | None, limit: str | None) -> dict[str, Any]:
    try:
        page_num = max(1, int(page or "0"))
    except (TypeError, ValueError):
        page_num = 1
    try:
        parsed_limit = int(limit or "0")
    except (TypeError, ValueError):
        parsed_limit = 0
    page_size = _clamp_int(parsed_limit, 5, 200) if parsed_limit > 0 else 0
    return {"pageNum": page_num, "pageSize": page_size, "enabled": page_size > 0}

def _drop_none(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}

@router.get("")
async def list_modes(
    request: Request,
    page: str | None = Query(default=None),
    limit: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    pagination = _parse_pagination(page, limit)
    service = _service(request)
    if not pagination["enabled"]:
        return service.find_all()
    return service.find_all_paginated(pagination["pageNum"], pagination["pageSize"])

@router.get("/active")
async def get_active(request: Request, user: dict[str, Any] = Depends(require_user)):
    return _service(request).get_active()

@router.get("/context")
async def get_context(request: Request, user: dict[str, Any] = Depends(require_user)):
    return _service(request).get_mode_context()

@router.get("/trigger-logs")
async def get_trigger_logs(
    request: Request,
    page: str | None = Query(default=None),
    limit: str | None = Query(default=None),
    source: str | None = Query(default=None),
    result: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    pagination = _parse_pagination(page, limit)
    filters = {
        "source": str(source) if source else None,
        "success": True if result == "ok" else (False if result == "fail" else None),
    }
    service = _service(request)
    if pagination["enabled"]:
        return service.get_trigger_logs_paginated(
            pagination["pageNum"], pagination["pageSize"], filters
        )
    return service.get_trigger_logs(30)

@router.get("/execution-history")
async def get_execution_history(request: Request, user: dict[str, Any] = Depends(require_user)):
    return _service(request).get_execution_history(40)

@router.get("/templates")
async def get_templates(request: Request, user: dict[str, Any] = Depends(require_user)):
    return _service(request).get_action_templates()

@router.get("/presets")
async def get_presets(request: Request, user: dict[str, Any] = Depends(require_user)):
    return _service(request).get_presets()

@router.post("/presets/{preset_id}/install")
async def install_preset(
    preset_id: str,
    payload: InstallPresetDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _service(request).install_preset(
        preset_id, payload.entityOverrides or {}, payload.merge if payload.merge is not None else False
    )

@router.post("/reorder")
async def reorder_modes(
    payload: ReorderModesDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    items = [item.model_dump() for item in payload.items]
    return await _service(request).reorder(items)

@router.post("/deactivate")
async def deactivate(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin", "adult"))
):
    return await _service(request).deactivate()

@router.post("/seed")
async def seed(request: Request, user: dict[str, Any] = Depends(require_roles("admin"))):
    return await _service(request).seed_defaults()

@router.get("/{mode_id}")
async def find_one(
    mode_id: str, request: Request, user: dict[str, Any] = Depends(require_user)
):
    return _service(request).find_one(mode_id)

@router.post("")
async def create_mode(
    payload: CreateHomeModeDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    return await _service(request).create(payload.model_dump())

@router.put("/{mode_id}")
async def update_mode(
    mode_id: str,
    payload: UpdateHomeModeDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    return await _service(request).update(mode_id, _drop_none(payload.model_dump()))

@router.delete("/{mode_id}")
async def remove_mode(
    mode_id: str, request: Request, user: dict[str, Any] = Depends(require_roles("admin", "adult"))
):
    return await _service(request).remove(mode_id)

@router.post("/{mode_id}/duplicate")
async def duplicate_mode(
    mode_id: str, request: Request, user: dict[str, Any] = Depends(require_roles("admin", "adult"))
):
    return await _service(request).duplicate(mode_id)

@router.post("/{mode_id}/activate")
async def activate_mode(
    mode_id: str, request: Request, user: dict[str, Any] = Depends(require_roles("admin", "adult"))
):
    return await _service(request).activate(
        mode_id, {"source": "manual", "reason": "手动切换", "actor": user}
    )
