"""系统访问路由（``/api/v1/system/*``）：访客临时密码 + 儿童模式。

对齐 Nest ``SystemAccessController`` 全量端点：
- ``guest/passes*``：访客临时密码 CRUD / 延期（``GuestAccessService``）；
- ``child-mode*``：儿童模式状态 / 配置 / 家长 override。
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import Depends, Request
from pydantic import BaseModel, BeforeValidator, ConfigDict

from ..security.auth_context import require_roles, require_user
from .router import NestRouter

router = NestRouter(prefix="/system", tags=["system"])

def _child_mode(request: Request):
    return request.app.state.child_mode

def _guest_access(request: Request):
    return request.app.state.guest_access

class StrictModel(BaseModel):
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

def _duration_field(value: Any) -> Any:
    """``CreateGuestPassDto.durationHours``：1–168 闭区间（对齐 @Min/@Max 文案）。"""
    if value is None:
        return value
    try:
        number = float(value)
    except (TypeError, ValueError) as err:
        raise ValueError("durationHours 须为数字") from err
    if number < 1:
        raise ValueError("durationHours 最小为 1")
    if number > 168:
        raise ValueError("durationHours 最大为 168")
    return number

def _number_field(value: Any) -> Any:
    if value is None:
        return value
    try:
        return float(value)
    except (TypeError, ValueError) as err:
        raise ValueError("hours 须为数字") from err

class CreateGuestPassDto(StrictModel):
    name: Annotated[str, BeforeValidator(_string_value("name 须为字符串"))]
    lockEntityId: Annotated[str, BeforeValidator(_string_value("lockEntityId 须为字符串"))]
    slot: float | None = None
    durationHours: Annotated[float | None, BeforeValidator(_duration_field)] = None
    code: Annotated[str | None, BeforeValidator(_string_value("code 须为字符串"))] = None

class ExtendGuestPassDto(StrictModel):
    hours: Annotated[float | None, BeforeValidator(_number_field)] = None

class ExtendGuestPassesDto(StrictModel):
    ids: Annotated[list[str], BeforeValidator(_string_list("ids 须为数组", "ids 每项须为字符串"))]
    hours: Annotated[float | None, BeforeValidator(_number_field)] = None

@router.get("/guest/passes")
async def list_guest_passes(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return await _guest_access(request).list()

@router.post("/guest/passes")
async def create_guest_pass(
    payload: CreateGuestPassDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _guest_access(request).create_pass(payload.model_dump(exclude_none=True))

@router.delete("/guest/passes/{pass_id}")
async def revoke_guest_pass(
    pass_id: str,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _guest_access(request).revoke_pass(pass_id)

@router.post("/guest/passes/extend-batch")
async def extend_guest_passes(
    payload: ExtendGuestPassesDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _guest_access(request).extend_many(payload.ids, payload.hours)

@router.post("/guest/passes/{pass_id}/extend")
async def extend_guest_pass(
    pass_id: str,
    request: Request,
    payload: ExtendGuestPassDto | None = None,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    hours = payload.hours if payload is not None else None
    return await _guest_access(request).extend_pass(pass_id, hours)

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class ChildModeTimeWindowDto(StrictModel):
    days: list[int] | Literal["weekday", "weekend"]
    start: str
    end: str

class UpdateChildModeDto(StrictModel):
    enabled: bool | None = None
    dailyMediaLimitMin: float | None = None
    deviceWhitelist: list[str] | None = None
    timeWindows: list[ChildModeTimeWindowDto] | None = None

class OverrideChildModeDto(StrictModel):
    minutes: float | None = None

@router.get("/child-mode")
async def get_child_mode(request: Request, user: dict[str, Any] = Depends(require_user)):
    return _child_mode(request).get_status()

@router.put("/child-mode")
async def update_child_mode(
    payload: UpdateChildModeDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    partial = payload.model_dump(exclude_none=True)
    return _child_mode(request).update_config(partial)

@router.post("/child-mode/override")
async def override_child_mode(
    payload: OverrideChildModeDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    minutes = int(payload.minutes) if payload.minutes is not None else 30
    return _child_mode(request).request_override(minutes)
