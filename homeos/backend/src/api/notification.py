"""通知路由（``/api/v1/notifications/*``）。

逐条对齐 Nest ``NotificationController``：通知列表 / 统计、全屋与用户级偏好、
标记已读 / 清空、告警规则 CRUD 与条件模拟。

守卫语义与 Nest 保持一致：
- 类级仅 ``JwtAuthGuard`` 的端点（列表 / 设置读取 / 已读 / 清空）使用 ``get_current_user``；
- 显式 ``@UseGuards(RolesGuard) @Roles(...)`` 的端点使用 ``require_roles(...)``；
- ``read-all`` / ``clear`` / ``:id/read`` 上的 ``@Roles`` 因缺少 ``RolesGuard`` 实际不生效，
  故此处同样只要求 JWT。
"""

from __future__ import annotations

import asyncio
from typing import Annotated, Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, BeforeValidator, ConfigDict
from sqlalchemy.orm import Session

from ..core.app_config import load_raw_config
from ..core.deps import get_session
from ..core.errors import api_error, forbidden
from ..security.auth_context import get_current_user, require_roles
from ..services.alerts.channels import resolve_notification_fetch_limit
from .router import NestRouter

router = NestRouter(prefix="/notifications", tags=["awareness"])

#: 告警级别枚举（对齐 DTO 的 ``ALERT_LEVELS``）。
_ALERT_LEVELS = ("info", "warn", "danger")

#: 校验失败文案（与 Nest DTO 的 message 逐字一致）。
_LEVEL_MESSAGE = "level 须为 info / warn / danger"

def _service(request: Request):
    return request.app.state.notification

class StrictModel(BaseModel):
    """等价 Nest ``ValidationPipe({ whitelist, forbidNonWhitelisted })``：拒绝未知字段。"""

    model_config = ConfigDict(extra="forbid", strict=True)

def _validate_level(value: Any) -> Any:
    """告警级别白名单校验（``@IsIn(ALERT_LEVELS)`` 等价）。"""
    if value is not None and value not in _ALERT_LEVELS:
        raise ValueError(_LEVEL_MESSAGE)
    return value

#: 兼容 ``CreateAlertRuleDto.level`` / ``UpdateAlertRuleDto.level`` 的注解类型。
LevelField = Annotated[str, BeforeValidator(_validate_level)]

class UpdateNotificationSettingsDto(StrictModel):
    dndStart: int | float | None = None
    dndEnd: int | float | None = None
    globalNotifyEnabled: bool | None = None
    importantNotifyEnabled: bool | None = None
    offlineNotifyEnabled: bool | None = None
    lowBatteryNotifyEnabled: bool | None = None

class UpdateUserNotificationPreferencesDto(StrictModel):
    globalNotifyEnabled: bool | None = None
    importantNotifyEnabled: bool | None = None
    offlineNotifyEnabled: bool | None = None
    lowBatteryNotifyEnabled: bool | None = None

class TestAlertRuleDto(StrictModel):
    condition: str
    entityId: str | None = None
    state: str | None = None
    attributes: dict[str, Any] | None = None

class CreateAlertRuleDto(StrictModel):
    id: str | None = None
    name: str
    entityId: str | None = None
    condition: str
    level: LevelField
    channels: list[str]
    cooldownMinutes: int | float
    enabled: bool
    messageTemplate: str | None = None
    title: str | None = None
    previousCondition: str | None = None

class UpdateAlertRuleDto(StrictModel):
    name: str | None = None
    entityId: str | None = None
    condition: str | None = None
    level: LevelField | None = None
    channels: list[str] | None = None
    cooldownMinutes: int | float | None = None
    enabled: bool | None = None
    messageTemplate: str | None = None
    title: str | None = None
    previousCondition: str | None = None

def parse_optional_int(value: str | None) -> int | None:
    """对齐 ``parseOptionalInt``（缺省 / 空串 / 非法值均回退 ``undefined``）。"""
    if not value:
        return None
    try:
        return int(value, 10)
    except (TypeError, ValueError):
        return None

@router.get("")
async def get_notifications(
    request: Request,
    limit: str | None = Query(default=None),
    source: str | None = Query(default=None),
    user: dict[str, Any] = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """获取通知列表（limit 受 frontend / notification 配置夹取）。"""
    raw = await asyncio.to_thread(load_raw_config, session)
    frontend = raw.get("frontend")
    notification = raw.get("notification")
    safe_limit = resolve_notification_fetch_limit(
        parse_optional_int(limit),
        frontend if isinstance(frontend, dict) else {},
        notification if isinstance(notification, dict) else {},
    )
    trimmed = (source or "").strip() or None
    return await _service(request).get_notifications(
        safe_limit, trimmed, user.get("restrictions")
    )

@router.get("/stats")
async def get_stats(
    request: Request,
    hours: str | None = Query(default=None),
    source: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """获取通知统计（总数 / 未读 / 已投递 / 来源 / 级别 / 时间序列）。"""
    trimmed = (source or "").strip() or None
    return await _service(request).get_stats(parse_optional_int(hours), trimmed)

@router.get("/settings")
async def get_settings(
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
):
    """获取当前用户的生效通知与 DND 设置（优先使用 JWT 预加载偏好）。"""
    return await _service(request).get_settings(
        user.get("userId"), user.get("notificationPrefs")
    )

@router.put("/settings")
async def update_settings(
    payload: UpdateNotificationSettingsDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """更新免打扰时段与全屋通知开关；DND 时段仅 admin 可改。"""
    if (payload.dndStart is not None or payload.dndEnd is not None) and user.get(
        "role"
    ) != "admin":
        forbidden(api_error("ACCESS_NOTIFY_DND_ADMIN"))
    return await _service(request).update_settings(
        payload.model_dump(exclude_unset=True), user.get("userId"), user.get("role")
    )

@router.put("/preferences")
async def update_preferences(
    payload: UpdateUserNotificationPreferencesDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    """更新当前用户通知开关（写入 ``User.preferences.notification``）。"""
    user_id = user.get("userId")
    if not user_id:
        forbidden(api_error("ACCESS_LOGIN_REQUIRED"))
    return await _service(request).update_user_preferences(
        user_id, payload.model_dump(exclude_unset=True)
    )

@router.post("/read-all")
async def mark_all_as_read(
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
):
    """全部标记为已读。"""
    return await _service(request).mark_all_as_read()

@router.post("/clear")
async def clear_all(
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
):
    """清空所有通知（不可恢复）。"""
    await _service(request).clear_all()
    return {"success": True}

@router.get("/rules")
async def get_rules(
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """获取全部告警规则。"""
    return await _service(request).get_rules()

@router.post("/rules/test")
async def test_rule(
    payload: TestAlertRuleDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """模拟测试告警条件（不会真正发通知）。"""
    return _service(request).test_condition(
        payload.condition or "", payload.state or "", payload.attributes
    )

@router.post("/rules")
async def create_rule(
    payload: CreateAlertRuleDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """创建告警规则。"""
    return await _service(request).add_rule(payload.model_dump())

@router.put("/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    payload: UpdateAlertRuleDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """更新告警规则（部分字段；未提供的字段保持不变）。"""
    return await _service(request).update_rule(
        rule_id, payload.model_dump(exclude_unset=True)
    )

@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """删除告警规则。"""
    return await _service(request).delete_rule(rule_id)

@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
):
    """标记单条通知为已读。"""
    await _service(request).mark_as_read(notification_id)
    return {"success": True}

__all__ = ["router"]
