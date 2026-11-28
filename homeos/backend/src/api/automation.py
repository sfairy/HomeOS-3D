"""自动化草案路由（``/api/v1/automation/*``）。

草案的**创建/修订只走 Agent 工具**（``automation_draft_create`` / ``automation_draft_revise``），
避免出现第二条写入路径；这里只提供只读、作废，以及「用户显式确认后落成本机计划任务」。

落地刻意与预览分开：``POST /drafts/{id}/apply`` 会新建一条**计划任务**（不是写 HA 自动化），
计划任务到期仍走 ``control_device`` 的同一套权限与高危拦截。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, ConfigDict

from .router import NestRouter
from ..dependencies import license_feature
from ..domains.agent.runtime.agent_actor import AgentActor
from ..domains.license import features as feature_codes
from ..platform.core.http.errors import BusinessException, ErrorCode
from ..platform.security.auth_context import require_user

router = NestRouter(
    prefix="/automation",
    tags=["agent"],
    dependencies=[license_feature(feature_codes.FEATURE_AGENT)],
)

LOGGER = logging.getLogger("homeos.api.automation")


class ApplyDto(BaseModel):
    """落地请求：``acknowledgeConflicts`` 表示用户已看过确定性冲突仍要继续。"""

    model_config = ConfigDict(extra="forbid")

    acknowledgeConflicts: bool = False


class TargetsDto(BaseModel):
    """目标设备改写：设置页「编辑目标」/ 移除某个目标。"""

    model_config = ConfigDict(extra="forbid")

    entityIds: list[str] = []


def _service(request: Request) -> Any:
    service = getattr(request.app.state, "automation_drafts", None)
    if service is None:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "自动化草案未启用")
    return service


def _actor(user: dict[str, Any]) -> AgentActor:
    """鉴权用户 → 计划任务执行身份（落地后到期执行沿用同一份权限）。"""
    return AgentActor(
        restrictions=user.get("restrictions"),
        user_id=user.get("userId"),
        username=user.get("username"),
    )


@router.get("/drafts")
async def list_drafts(
    request: Request,
    sessionKey: str | None = Query(default=None),
    limit: int = Query(default=50),
    user: dict[str, Any] = Depends(require_user),
):
    service = _service(request)
    return {"items": await asyncio.to_thread(service.list_drafts, sessionKey, limit)}


@router.get("/drafts/{draft_id}")
async def get_draft(draft_id: str, request: Request, user: dict[str, Any] = Depends(require_user)):
    service = _service(request)
    payload = await asyncio.to_thread(service.get_draft, draft_id)
    if payload is None:
        raise BusinessException(ErrorCode.NOT_FOUND, "没有找到这份草案（可能已过期）。")
    return payload


@router.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: str, request: Request, user: dict[str, Any] = Depends(require_user)):
    service = _service(request)
    result = await asyncio.to_thread(service.discard, draft_id)
    if not result.get("success"):
        raise BusinessException(ErrorCode.NOT_FOUND, str(result.get("message") or "没有找到这份草案。"))
    return result


@router.post("/drafts/{draft_id}/apply")
async def apply_draft(
    draft_id: str,
    request: Request,
    dto: ApplyDto | None = None,
    user: dict[str, Any] = Depends(require_user),
):
    """把待确认草案落成一条本机计划任务（用户显式触发，不写 HA）。"""
    service = _service(request)
    scheduler = getattr(request.app.state, "agent_scheduler", None)
    if scheduler is None:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "计划任务未启用，无法落地草案")

    prepared = await asyncio.to_thread(service.prepare_apply, draft_id)
    if not prepared.get("ok"):
        reason = str(prepared.get("reason") or "")
        code = ErrorCode.NOT_FOUND if reason == "not_found" else ErrorCode.VALIDATION_FAILED
        raise BusinessException(code, str(prepared.get("message") or "草案不能落地"))
    certain = (prepared.get("conflicts") or {}).get("certain") or []
    if certain and not (dto is not None and dto.acknowledgeConflicts):
        raise BusinessException(
            ErrorCode.CONFLICT,
            f"这份草案与 {len(certain)} 条已有规则存在确定性冲突，确认继续后才能创建计划任务。",
        )

    claimed = await asyncio.to_thread(service.claim_for_apply, draft_id)
    if not claimed.get("ok"):
        raise BusinessException(ErrorCode.CONFLICT, str(claimed.get("message") or "草案不能落地"))

    result = await scheduler.create_task(prepared["task"], _actor(user))
    if not result.get("ok"):
        # 抢占失败要把草案退回 READY，否则用户重试永远被「正在落地」挡住。
        await asyncio.to_thread(service.release_claim, draft_id)
        raise BusinessException(ErrorCode.VALIDATION_FAILED, str(result.get("message") or "创建计划任务失败"))
    task = result.get("task") or {}
    applied = await asyncio.to_thread(service.mark_applied, draft_id, str(task.get("id") or ""))
    return {"success": True, "draftId": draft_id, "taskId": task.get("id"), "task": task, "draftMarked": applied}


@router.post("/drafts/{draft_id}/export-ha")
async def export_draft_to_ha(
    draft_id: str,
    request: Request,
    dto: ApplyDto | None = None,
    user: dict[str, Any] = Depends(require_user),
):
    """把草案**写成一条 HA 自动化**（写进 HA 自己的 automation 配置）。

    与本机计划任务的区别（UI 必须说清）：写进 HA 后由 HA 执行，自动化列表里可见，
    换机 / HA 重装后规则仍在；本机计划任务由 HomeOS 调度器执行。

    写入走 HA REST ``/api/config/automation/config/<id>``：``id`` 由 draft_id 派生，
    因此**重复执行是覆盖而不是新增**（幂等）；写完后调 ``automation.reload`` 让它生效。
    """
    service = _service(request)
    prepared = await asyncio.to_thread(service.prepare_ha_export, draft_id)
    if not prepared.get("ok"):
        reason = str(prepared.get("reason") or "")
        code = ErrorCode.NOT_FOUND if reason == "not_found" else ErrorCode.VALIDATION_FAILED
        raise BusinessException(code, str(prepared.get("message") or "草案不能导出到 HA"))
    certain = (prepared.get("conflicts") or {}).get("certain") or []
    if certain and not (dto is not None and dto.acknowledgeConflicts):
        raise BusinessException(
            ErrorCode.CONFLICT,
            f"这份草案与 {len(certain)} 条已有规则存在确定性冲突，确认继续后才能写入 HA。",
        )

    ha = getattr(request.app.state, "studio_ha", None)
    if ha is None:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "Home Assistant 未就绪，无法写入自动化")
    automation_id = prepared["automationId"]
    await ha.request_config_api("POST", f"/api/config/automation/config/{automation_id}", prepared["automation"])
    # reload 让新规则立即生效；失败不影响写入结果（HA 下次重启也会加载）。
    try:
        await ha.request_config_api("POST", "/api/services/automation/reload", {})
    except BusinessException:
        LOGGER.warning("HA 自动化已写入但 reload 失败：%s", automation_id, exc_info=True)
    await asyncio.to_thread(service.mark_exported, draft_id, automation_id)
    return {
        "success": True,
        "draftId": draft_id,
        "automationId": automation_id,
        "automation": prepared["automation"],
        "reloaded": True,
    }


@router.post("/drafts/{draft_id}/targets")
async def set_draft_targets(
    draft_id: str,
    dto: TargetsDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """改写草案的目标设备（新增 / 移除）。与 Agent 修订同一条校验路径。"""
    del user
    service = _service(request)
    payload = await asyncio.to_thread(service.set_targets, draft_id, dto.entityIds)
    if not payload.get("success"):
        raise BusinessException(
            ErrorCode.VALIDATION_FAILED,
            str(payload.get("message") or "目标设备更新失败"),
        )
    return payload


@router.post("/drafts/{draft_id}/split")
async def split_draft(draft_id: str, request: Request, user: dict[str, Any] = Depends(require_user)):
    """把多目标草案拆成每个目标一条的单目标草案（计划任务只承载单一实体）。"""
    del user
    service = _service(request)
    result = await asyncio.to_thread(service.split_draft, draft_id)
    if not result.get("ok"):
        raise BusinessException(ErrorCode.VALIDATION_FAILED, str(result.get("message") or "拆分失败"))
    return {"success": True, **result}


@router.get("/discover")
async def discover(
    request: Request,
    sources: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    service = _service(request)
    wanted = [part.strip() for part in (sources or "").split(",") if part.strip()] or None
    return await asyncio.to_thread(service.discover, wanted)
