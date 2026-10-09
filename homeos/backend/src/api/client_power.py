"""客户端系统信息与充电器联动路由（``/api/v1/system/client-power/*``）。

对齐 Nest ``ClientPowerController``（``@Controller('system')`` + ``client-power/*``）：
- ``POST /system/client-power/report``            上报系统信息（admin/adult/child，Nest 默认 201）
- ``GET  /system/client-power/status``            状态快照（登录即可）
- ``GET  /system/client-power/pending``           待配对列表（admin）
- ``POST /system/client-power/pending/dismiss``   清除单个离线待配对（admin）
- ``POST /system/client-power/pending/dismiss-offline`` 批量清除离线待配对（admin）

``reportToken`` 经 HttpOnly Cookie ``homeos_cprt`` 下发与回传；响应体不返回明文 token。
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Request, Response
from pydantic import BaseModel, ConfigDict, model_validator

from .router import NestRouter
from ..security.auth_context import require_roles, require_user
from ..security.cookies import resolve_cookie_secure_for_request

router = NestRouter(prefix="/system", tags=["system"])

#: Cookie 名：客户端上报密钥（HttpOnly，与 body.reportToken 二选一）
CLIENT_REPORT_TOKEN_COOKIE = "homeos_cprt"

#: Cookie 有效期：10 年（毫秒）
_TOKEN_COOKIE_MAX_AGE_SECONDS = 10 * 365 * 24 * 60 * 60

#: 顶层允许字段（等价 ``forbidNonWhitelisted``）
_REPORT_ALLOWED = {"clientId", "systemInfo", "reportToken"}
#: systemInfo 允许字段
_SYSTEM_INFO_ALLOWED = {
    "hardware",
    "platform",
    "display",
    "capabilities",
    "network",
    "battery",
    "reportedAt",
}
#: battery 允许字段
_BATTERY_ALLOWED = {
    "supported",
    "level",
    "charging",
    "chargingTime",
    "dischargingTime",
    "unsupportedReason",
}


def _is_object(value: Any) -> bool:
    return isinstance(value, dict)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _opt(value: Any) -> bool:
    """对齐 ``@IsOptional()``：null / undefined 跳过后续校验。"""
    return value is None


def _validate_battery(battery: Any, errors: list[str]) -> None:
    if not _is_object(battery):
        errors.append("systemInfo.battery 格式无效")
        return
    for key in battery:
        if key not in _BATTERY_ALLOWED:
            errors.append(f"property {key} should not exist")
    supported = battery.get("supported")
    if not _opt(supported) and not isinstance(supported, bool):
        errors.append("battery.supported 须为布尔值")
    level = battery.get("level")
    if not _opt(level):
        if not _is_number(level):
            errors.append("battery.level 须为数字")
        else:
            if level < 0:
                errors.append("battery.level 不能小于 0")
            if level > 100:
                errors.append("battery.level 不能大于 100")
    charging = battery.get("charging")
    if not _opt(charging) and not isinstance(charging, bool):
        errors.append("battery.charging 须为布尔值")
    charging_time = battery.get("chargingTime")
    if not _opt(charging_time):
        if not _is_number(charging_time):
            errors.append("battery.chargingTime 须为数字")
        elif charging_time < 0:
            errors.append("battery.chargingTime 不能小于 0")
    discharging_time = battery.get("dischargingTime")
    if not _opt(discharging_time):
        if not _is_number(discharging_time):
            errors.append("battery.dischargingTime 须为数字")
        elif discharging_time < 0:
            errors.append("battery.dischargingTime 不能小于 0")
    reason = battery.get("unsupportedReason")
    if not _opt(reason):
        if not isinstance(reason, str):
            errors.append("battery.unsupportedReason 须为字符串")
        elif len(reason) > 32:
            errors.append("battery.unsupportedReason 最长 32 字符")


def _validate_system_info(system_info: Any, errors: list[str]) -> None:
    if not _is_object(system_info):
        errors.append("systemInfo 格式无效")
        return
    for key in system_info:
        if key not in _SYSTEM_INFO_ALLOWED:
            errors.append(f"property {key} should not exist")
    for field, label in (
        ("hardware", "systemInfo.hardware"),
        ("platform", "systemInfo.platform"),
        ("display", "systemInfo.display"),
        ("capabilities", "systemInfo.capabilities"),
        ("network", "systemInfo.network"),
    ):
        if not _opt(system_info.get(field)) and not _is_object(system_info.get(field)):
            errors.append(f"{label} 须为对象")
    if not _opt(system_info.get("battery")):
        _validate_battery(system_info.get("battery"), errors)
    reported_at = system_info.get("reportedAt")
    if not _opt(reported_at):
        if not isinstance(reported_at, str):
            errors.append("systemInfo.reportedAt 须为字符串")
        elif len(reported_at) > 64:
            errors.append("systemInfo.reportedAt 最长 64 字符")


class ClientSystemReportDto(BaseModel):
    """``POST /system/client-power/report`` 请求体（校验文案与 Nest DTO 一致）。"""

    model_config = ConfigDict(extra="ignore")

    clientId: Any = None
    systemInfo: Any = None
    reportToken: Any = None

    @model_validator(mode="before")
    @classmethod
    def _validate_like_nest(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        errors: list[str] = []
        # 声明顺序：clientId → systemInfo（含嵌套）→ reportToken（class-validator 顺序）
        client_id = data.get("clientId")
        if not isinstance(client_id, str):
            errors.append("clientId 须为字符串")
        elif len(client_id) > 128:
            errors.append("clientId 最长 128 字符")
        for key in data:
            if key not in _REPORT_ALLOWED:
                errors.append(f"property {key} should not exist")
        if not _opt(data.get("systemInfo")):
            _validate_system_info(data.get("systemInfo"), errors)
        report_token = data.get("reportToken")
        if not _opt(report_token):
            if not isinstance(report_token, str):
                errors.append("reportToken 须为字符串")
            elif len(report_token) > 128:
                errors.append("reportToken 最长 128 字符")
        if errors:
            raise ValueError("；".join(errors))
        return data


class DismissPendingDto(BaseModel):
    """``POST /system/client-power/pending/dismiss`` 请求体。"""

    model_config = ConfigDict(extra="ignore")

    clientId: Any = None


def _service(request: Request):
    return request.app.state.client_power


@router.post("/client-power/report")
async def report(
    dto: ClientSystemReportDto,
    request: Request,
    response: Response,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    """上报客户端系统信息（含电量）；未配对终端仅记录为待配对，不执行联动。"""
    _ = user
    from_cookie = str(request.cookies.get(CLIENT_REPORT_TOKEN_COOKIE) or "").strip()
    from_body = str(dto.reportToken or "").strip()
    merged = {
        "clientId": dto.clientId,
        "systemInfo": dto.systemInfo,
        "reportToken": from_body or from_cookie or None,
    }
    result = await _service(request).report(merged)

    deliver_token = result.pop("deliverToken", None)
    if deliver_token:
        response.set_cookie(
            key=CLIENT_REPORT_TOKEN_COOKIE,
            value=deliver_token,
            max_age=_TOKEN_COOKIE_MAX_AGE_SECONDS,
            httponly=True,
            samesite="lax",
            secure=resolve_cookie_secure_for_request(request),
            path="/",
        )
    return result


@router.get("/client-power/status")
async def get_status(request: Request, user: dict[str, Any] = Depends(require_user)):
    """获取客户端系统信息状态快照（含在线状态、电量、待配对列表等）。"""
    _ = user
    return _service(request).get_status_snapshot()


@router.get("/client-power/pending")
async def get_pending(request: Request, user: dict[str, Any] = Depends(require_roles("admin"))):
    """获取待配对客户端列表（仅管理员）。"""
    _ = user
    return {"pending": _service(request).get_pending_clients()}


@router.post("/client-power/pending/dismiss")
async def dismiss_pending(
    dto: DismissPendingDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """清除指定离线待配对终端的发现记录（仅管理员）。"""
    _ = user
    return await _service(request).dismiss_pending(str(dto.clientId or ""))


@router.post("/client-power/pending/dismiss-offline")
async def dismiss_all_offline_pending(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    """批量清除所有离线待配对终端的发现记录（仅管理员）。"""
    _ = user
    return await _service(request).dismiss_all_offline_pending()


__all__ = ["ClientSystemReportDto", "router"]
