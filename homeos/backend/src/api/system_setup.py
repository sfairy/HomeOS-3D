"""首装向导与实体同步路由（对齐 Nest ``SystemSetupController``）。

覆盖 ``/api/v1/system/*``：
- 首装向导：状态 / 校验实体 / 完成 / 降低灵敏度 / 引导任务清单 / 关闭清单提示；
- 实体同步：``entities/resync``（重新拉取全量实体刷新 state-store）；
- 配置健康：``bindings/gaps`` / ``config/health``。

鉴权：JwtAuthGuard + RolesGuard，仅 admin 可访问。
"""

from __future__ import annotations

from typing import Any

from fastapi import Body, Depends, Request

from .router import NestRouter
from ..core.errors import BusinessException, ErrorCode, api_error
from ..security.auth_context import require_roles

router = NestRouter(prefix="/system", tags=["system"])

def _wizard(request: Request):
    return request.app.state.setup_wizard

# ---------------------------------------------------------------------- #
# 首装向导
# ---------------------------------------------------------------------- #
@router.get("/setup-wizard/status")
async def get_setup_wizard_status(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return await _wizard(request).get_status()

@router.post("/setup-wizard/validate-entities")
async def validate_setup_entities(
    request: Request,
    body: dict[str, Any] = Body(default_factory=dict),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    entity_ids = body.get("entityIds") or []
    if not isinstance(entity_ids, list):
        entity_ids = []
    return await _wizard(request).validate_entities(entity_ids)

@router.post("/setup-wizard/complete")
async def complete_setup_wizard(
    request: Request,
    body: dict[str, Any] = Body(default_factory=dict),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _wizard(request).complete_wizard(body or None)

@router.post("/setup-wizard/reduce-sensitivity")
async def reduce_setup_security_sensitivity(
    request: Request,
    body: dict[str, Any] = Body(default_factory=dict),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _wizard(request).reduce_security_sensitivity(body or None)

@router.get("/setup-wizard/checklist")
async def get_setup_checklist(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return await _wizard(request).get_post_setup_checklist()

@router.post("/setup-wizard/checklist/dismiss")
async def dismiss_setup_checklist(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return await _wizard(request).dismiss_post_setup_checklist()

# ---------------------------------------------------------------------- #
# 实体同步
# ---------------------------------------------------------------------- #
@router.post("/entities/resync")
async def resync_entities(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    """向 HA 重新拉取全量实体并刷新 state-store；失败返回 503。"""
    try:
        return await request.app.state.ha_connector.resync_from_ha()
    except BusinessException:
        raise
    except Exception as err:
        raise BusinessException(
            ErrorCode.SERVICE_UNAVAILABLE,
            api_error("HA_STATE_RESYNC_FAILED", str(err) or "未知错误"),
        ) from err

# ---------------------------------------------------------------------- #
# 配置健康
# ---------------------------------------------------------------------- #
@router.get("/bindings/gaps")
async def get_binding_gaps(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return await _wizard(request).get_binding_gaps()

@router.get("/config/health")
async def get_config_health(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return await _wizard(request).get_config_health_score()

__all__ = ["router"]
