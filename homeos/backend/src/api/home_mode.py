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
from ..domains.license import features as feature_codes
from ..platform.core.db.db_exec import run_db
from ..platform.core.db.pagination import parse_crud_pagination
from ..platform.security.auth_context import require_user

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

def _parse_pagination(page: str | None, limit: str | None) -> dict[str, Any]:
    """家庭模式列表分页：复用平台受控解析（缺省不分页，条数恒在 ``[5, 200]``）。"""
    return parse_crud_pagination(page, limit)

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
    service = _service(request)
    return await run_db(service.get_active_response)

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
    user: dict[str, Any] = Depends(require_user),
):
    return await _service(request).install_preset(
        preset_id, payload.entityOverrides or {}, payload.merge if payload.merge is not None else False
    )

@router.post("/reorder")
async def reorder_modes(
    payload: ReorderModesDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    items = [item.model_dump() for item in payload.items]
    return await _service(request).reorder(items)

@router.post("/deactivate")
async def deactivate(
    request: Request,
    modeId: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    # 多互斥组可同时激活：不带 modeId 时停用「当前主模式」，带则只停用该组的那一个。
    return await _service(request).deactivate(modeId or None)

@router.post("/seed")
async def seed(request: Request, user: dict[str, Any] = Depends(require_user)):
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
    user: dict[str, Any] = Depends(require_user),
):
    return await _service(request).create(payload.model_dump())

@router.put("/{mode_id}")
async def update_mode(
    mode_id: str,
    payload: UpdateHomeModeDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    return await _service(request).update(mode_id, _drop_none(payload.model_dump()))

@router.delete("/{mode_id}")
async def remove_mode(
    mode_id: str, request: Request, user: dict[str, Any] = Depends(require_user)
):
    return await _service(request).remove(mode_id)

@router.post("/{mode_id}/duplicate")
async def duplicate_mode(
    mode_id: str, request: Request, user: dict[str, Any] = Depends(require_user)
):
    return await _service(request).duplicate(mode_id)

@router.post("/{mode_id}/activate")
async def activate_mode(
    mode_id: str, request: Request, user: dict[str, Any] = Depends(require_user)
):
    return await _service(request).activate(
        mode_id, {"source": "manual", "reason": "手动切换", "actor": user}
    )
