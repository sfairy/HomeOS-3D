"""智能管家学习与观测路由（``/api/v1/agent/*`` 的 learning / habits / metrics / intent）。

从 ``api/agent.py`` 拆出：那个文件承担对话、会话、家规、计划任务与诊断，已经接近文件规模
棘轮的上限；而这一族（命令缓存指标、意图门影子回放、已学配置、习惯候选）是「可观测性 +
学习结果的人工干预」，与对话主链路没有耦合，独立成模块更好读也更好测。

路由前缀与鉴权依赖与 ``agent.py`` 完全一致，因此拆出前后 ``(METHOD, PATH)`` 不变。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import Depends, Request
from pydantic import BaseModel, ConfigDict

from .router import NestRouter
from ..dependencies import license_feature
from ..domains.agent.learning.habits import habit_draft_spec
from ..domains.license import features as feature_codes
from ..platform.core.db.db_exec import run_db
from ..platform.core.http.errors import BusinessException, ErrorCode
from ..platform.security.auth_context import require_user

logger = logging.getLogger("homeos.api.agent_learning")

router = NestRouter(
    prefix="/agent",
    tags=["agent"],
    dependencies=[license_feature(feature_codes.FEATURE_AGENT)],
)


class LearningRefDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    configId: str
    revision: int | None = None


class LearningActiveDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    configId: str
    active: bool


def _missing(name: str) -> BusinessException:
    return BusinessException(ErrorCode.SERVICE_UNAVAILABLE, f"{name}未启用")


def _actor_id(user: dict[str, Any]) -> str:
    return str(user.get("userId") or user.get("username") or "")


@router.get("/metrics")
async def get_agent_metrics(request: Request, user: dict[str, Any] = Depends(require_user)):
    """命令缓存运行指标：命中率 / LLM 调用 / 成功率 / 纠正次数。"""
    del user
    cache = getattr(request.app.state, "agent_command_cache", None)
    if cache is None:
        raise _missing("命令缓存")
    return {"metrics": cache.metrics()}


@router.get("/command-cache")
async def list_command_cache(
    request: Request,
    limit: int = 100,
    user: dict[str, Any] = Depends(require_user),
):
    """列出当前账号已学会的「原话 → 工具」映射（设置页管理用）。"""
    cache = getattr(request.app.state, "agent_command_cache", None)
    if cache is None:
        raise _missing("命令缓存")
    return {"items": await run_db(cache.list_commands, _actor_id(user), limit)}


@router.delete("/command-cache")
async def delete_command_cache(
    request: Request,
    key: str,
    user: dict[str, Any] = Depends(require_user),
):
    """删除一条学错的指令映射；下次同一句话会重新走解析。"""
    cache = getattr(request.app.state, "agent_command_cache", None)
    if cache is None:
        raise _missing("命令缓存")
    if not str(key or "").strip():
        raise BusinessException(ErrorCode.VALIDATION_FAILED, "key 不能为空")
    return {"ok": await run_db(cache.delete_command, _actor_id(user), key)}


@router.get("/intent/replay")
async def replay_intent_shadow(
    request: Request,
    limit: int = 100,
    user: dict[str, Any] = Depends(require_user),
):
    """意图门影子回放：统计最近 N 条判定的 verdict / reason 分布与被拦样本。

    只读；样本来自 ``/agent/diagnostics`` 的 ``INTENT_VERDICT`` 记录。切 ``enforce``
    之前先看这里：如果 RULE 里有大量本该立即执行的口令，说明词表过宽。
    """
    del user
    diagnostics = getattr(request.app.state, "agent_diagnostics", None)
    if diagnostics is None:
        raise _missing("诊断日志")
    rows = diagnostics.query(kind="INTENT_VERDICT", limit=min(max(int(limit or 100), 1), 100))
    verdicts: dict[str, int] = {}
    reasons: dict[str, int] = {}
    blocked_samples: list[dict[str, Any]] = []
    for row in rows:
        context = row.get("context") if isinstance(row, dict) else None
        if not isinstance(context, dict):
            continue
        verdict = str(context.get("verdict") or "").strip()
        reason = str(context.get("reason") or "").strip()
        if verdict:
            verdicts[verdict] = verdicts.get(verdict, 0) + 1
        if reason:
            reasons[reason] = reasons.get(reason, 0) + 1
        if context.get("blocked") and len(blocked_samples) < 20:
            blocked_samples.append(
                {
                    "utterance": context.get("utterance"),
                    "verdict": verdict,
                    "reason": reason,
                    "mode": context.get("mode"),
                }
            )
    return {
        "total": len(rows),
        "verdicts": dict(sorted(verdicts.items(), key=lambda item: item[1], reverse=True)),
        "reasons": dict(sorted(reasons.items(), key=lambda item: item[1], reverse=True)),
        "blockedSamples": blocked_samples,
    }


@router.get("/learning")
async def list_learning(
    request: Request,
    scope: str = "",
    user: dict[str, Any] = Depends(require_user),
):
    """列出已学配置（别名 / 房间默认）。"""
    del user
    store = getattr(request.app.state, "agent_learning", None)
    if store is None:
        raise _missing("学习体系")
    return {"items": await run_db(store.list_configs, scope or None)}


@router.get("/learning/audit")
async def learning_audit(
    request: Request,
    configId: str,
    limit: int = 50,
    user: dict[str, Any] = Depends(require_user),
):
    """单条学习配置的变更审计（回滚依据）。"""
    del user
    store = getattr(request.app.state, "agent_learning", None)
    if store is None:
        raise _missing("学习体系")
    return {"items": await run_db(store.audit, configId, limit)}


@router.post("/learning/revert")
async def revert_learning(
    payload: LearningRefDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """按 revision 回滚一条学习配置（防止覆盖后续人工修改）。"""
    store = getattr(request.app.state, "agent_learning", None)
    if store is None:
        raise _missing("学习体系")
    return await run_db(store.revert, payload.configId, payload.revision, actor=_actor_id(user))


@router.post("/learning/active")
async def set_learning_active(
    payload: LearningActiveDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """暂停 / 恢复一条学习配置。"""
    store = getattr(request.app.state, "agent_learning", None)
    if store is None:
        raise _missing("学习体系")
    return await run_db(store.set_active, payload.configId, payload.active, actor=_actor_id(user))


@router.delete("/learning/{config_id}")
async def delete_learning(
    config_id: str,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """删除一条学习配置（设置页「删除」）。"""
    store = getattr(request.app.state, "agent_learning", None)
    if store is None:
        raise _missing("学习体系")
    return await run_db(store.delete, config_id, actor=_actor_id(user))


@router.get("/habits")
async def list_habits(
    request: Request,
    status: str = "",
    user: dict[str, Any] = Depends(require_user),
):
    """列出习惯候选（含证据数与状态）。"""
    del user
    habits = getattr(request.app.state, "agent_habits", None)
    if habits is None:
        raise _missing("习惯候选")
    return {"items": await run_db(habits.list, status or None)}


@router.post("/habits/{candidate_id}/{action}")
async def act_on_habit(
    candidate_id: str,
    action: str,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """处理习惯候选：``dismiss`` / ``accept`` / ``reset``。

    ``accept`` 除了标记已接受，还会把候选转成一份**自动化草案**（每天同一小时执行同一动作），
    用户在「自动化草案」里核对触发时间与目标后才落地 —— 不会凭一条习惯直接建定时任务。
    """
    habits = getattr(request.app.state, "agent_habits", None)
    if habits is None:
        raise _missing("习惯候选")
    if action not in ("dismiss", "accept", "reset"):
        raise BusinessException(ErrorCode.VALIDATION_FAILED, "action 须为 dismiss / accept / reset")
    if action != "accept":
        return await run_db({"dismiss": habits.dismiss, "reset": habits.reset}[action], candidate_id)

    candidate = await run_db(habits.get, candidate_id)
    if candidate is None:
        raise BusinessException(ErrorCode.NOT_FOUND, "没有找到这个习惯候选")
    result = await run_db(habits.graduate, candidate_id)
    drafts = getattr(request.app.state, "automation_drafts", None)
    spec = habit_draft_spec(candidate)
    if drafts is None or spec is None:
        return {**result, "draftId": None, "message": "已标记为接受；这条习惯暂时无法生成自动化草案。"}
    try:
        draft = await asyncio.to_thread(
            drafts.create_draft,
            spec,
            raw_prompt=f"习惯：{candidate.get('contextKey') or candidate_id}",
            session_key=f"habit:{candidate_id}",
            channel="web",
            principal_id=_actor_id(user) or None,
            identity_strength="STRONG" if _actor_id(user) else "NONE",
            utterance_kind="RULE",
        )
    except Exception as exc:  # 草案失败不影响「已接受」这一事实
        logger.warning("习惯候选生成草案失败: %s", exc)
        return {**result, "draftId": None, "message": "已标记为接受；生成自动化草案失败，可稍后重试。"}
    draft_id = str(draft.get("draftId") or "") or None
    return {
        **result,
        "draftId": draft_id,
        "message": "已生成自动化草案，请到「自动化草案」核对时间与目标后再落地。" if draft_id else "已标记为接受。",
    }


__all__ = ["router"]
