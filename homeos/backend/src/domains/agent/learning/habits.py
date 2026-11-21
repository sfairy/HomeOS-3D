"""习惯候选：同一上下文反复出现后才提示用户固化为默认。

门槛（对齐参考实现）：

- 需要 **3 次实证**才提示；
- 同一会话 **10 分钟**内最多提示一次；
- 用户忽略 / 拒绝后 **24 小时**冷却，冷却过期回到 OBSERVING；
- 候选池上限 **200**，空闲 **14 天**淘汰；
- 满池时按 ``evidenceCount / (空闲天数 + 1)`` 升序淘汰 20 条（低证据 + 长期不出现先走）。

``stepId`` 去重：同一个工具步骤被重复回放时不能反复计数。
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select

from ....platform.core.db.learning_models import (
    HABIT_DISMISSED,
    HABIT_GRADUATED,
    HABIT_OBSERVING,
    HABIT_PROMPTED,
    AgentHabitCandidate,
)

logger = logging.getLogger("homeos.agent.habits")

PROMPT_THRESHOLD = 3
PROMPT_INTERVAL = timedelta(minutes=10)
DISMISS_COOLDOWN = timedelta(hours=24)
IDLE_EXPIRY = timedelta(days=14)
POOL_LIMIT = 200
EVICT_COUNT = 20
#: 去重窗口：同一 stepId 只计一次
MAX_STEP_HISTORY = 1000


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


#: 候选类型：同一设备 + 同一动作在同一小时反复出现（「每天 22 点关客厅灯」）
CANDIDATE_SCHEDULED_CONTROL = "scheduled_control"


def habit_observe_key(entity_id: str, service: str, hour: int) -> str:
    """候选的上下文字符串：设备 + 动作 + 小时（接受时据此生成定时草案）。"""
    return f"{entity_id}|{service}|{max(0, min(23, int(hour)))}"


def habit_draft_spec(candidate: dict[str, Any]) -> dict[str, Any] | None:
    """把习惯候选转成自动化草案 spec；格式不符返回 ``None``。

    候选的 ``contextKey`` 形如 ``light.living|turn_off|22``：同一台设备、同一个动作
    在同一小时里被用户手动执行过多次。接受时把它变成「每天 22:00 执行该动作」的草案，
    用户仍能在「自动化草案」里核对触发时间与目标后再落地。
    """
    if str(candidate.get("candidateType") or "") != CANDIDATE_SCHEDULED_CONTROL:
        return None
    parts = str(candidate.get("contextKey") or "").split("|")
    if len(parts) != 3:
        return None
    entity_id, service, hour_text = parts
    if "." not in entity_id or not service:
        return None
    try:
        hour = int(hour_text)
    except (TypeError, ValueError) as exc:
        logger.debug("习惯候选的小时字段无法解析，跳过: %r (%s)", hour_text, exc)
        return None
    if not 0 <= hour <= 23:
        return None
    domain = entity_id.split(".", 1)[0]
    return {
        "targets": [{"entityId": entity_id}],
        "triggers": [{"type": "time", "at": f"{hour:02d}:00"}],
        "action": {"service": f"{domain}.{service}"},
        "intentSummary": f"每天 {hour:02d}:00 对 {entity_id} 执行 {service}",
    }


class HabitCandidateService:
    """习惯候选的观察 / 提示 / 毕业 / 拒绝。"""

    def __init__(self, session_factory: Any) -> None:
        self._session_factory = session_factory
        self._steps: dict[str, None] = {}
        self._step_order: list[str] = []

    def observe(
        self,
        *,
        scope: str,
        candidate_type: str,
        context_key: str,
        entity_id: str,
        step_id: str | None = None,
    ) -> dict[str, Any] | None:
        """记一次实证；达到门槛且不在冷却期时返回候选（供上层提示）。"""
        if step_id:
            if step_id in self._steps:
                return None
            self._remember_step(step_id)
        key = (str(scope or "household"), str(candidate_type), str(context_key), str(entity_id))
        with self._session_factory() as session:
            row = session.scalars(
                select(AgentHabitCandidate).where(
                    AgentHabitCandidate.scope_key == key[0],
                    AgentHabitCandidate.candidate_type == key[1],
                    AgentHabitCandidate.context_key == key[2],
                    AgentHabitCandidate.entity_id == key[3],
                )
            ).first()
            now = _now()
            if row is None:
                row = AgentHabitCandidate(
                    scope_key=key[0],
                    candidate_type=key[1],
                    context_key=key[2],
                    entity_id=key[3],
                    evidence_count=1,
                    last_step_id=step_id,
                    status=HABIT_OBSERVING,
                    last_seen_at=now,
                )
                session.add(row)
                session.commit()
                return None
            row.evidence_count = int(row.evidence_count or 0) + 1
            row.last_step_id = step_id
            row.last_seen_at = now
            if row.status == HABIT_GRADUATED:
                session.commit()
                return None
            if row.status == HABIT_DISMISSED:
                dismissed_at = row.dismissed_at or now
                if now - dismissed_at >= DISMISS_COOLDOWN:
                    row.status = HABIT_OBSERVING
                else:
                    session.commit()
                    return None
            if row.evidence_count < PROMPT_THRESHOLD:
                session.commit()
                return None
            if row.status == HABIT_PROMPTED and row.last_prompt_at:
                if now - row.last_prompt_at < PROMPT_INTERVAL:
                    session.commit()
                    return None
            row.status = HABIT_PROMPTED
            row.last_prompt_at = now
            session.commit()
            payload = _row(row)
        self._evict_if_needed()
        return payload

    def dismiss(self, candidate_id: str) -> dict[str, Any]:
        return self._set_status(candidate_id, HABIT_DISMISSED)

    def graduate(self, candidate_id: str) -> dict[str, Any]:
        return self._set_status(candidate_id, HABIT_GRADUATED)

    def get(self, candidate_id: str) -> dict[str, Any] | None:
        """按 ID 读取单条候选（设置页「接受」要据此生成计划任务草案）。"""
        with self._session_factory() as session:
            row = session.get(AgentHabitCandidate, candidate_id)
            return _row(row) if row is not None else None

    def reset(self, candidate_id: str) -> dict[str, Any]:
        return self._set_status(candidate_id, HABIT_OBSERVING)

    def list(self, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            query = select(AgentHabitCandidate).order_by(AgentHabitCandidate.last_seen_at.desc())
            if status:
                query = query.where(AgentHabitCandidate.status == status)
            rows = session.scalars(query.limit(max(1, min(int(limit or 50), 200)))).all()
            return [_row(row) for row in rows]

    # ------------------------------------------------------------------ 内部
    def _set_status(self, candidate_id: str, status: str) -> dict[str, Any]:
        with self._session_factory() as session:
            row = session.get(AgentHabitCandidate, candidate_id)
            if row is None:
                return {"success": False, "message": "没有找到这个习惯候选。"}
            row.status = status
            if status == HABIT_DISMISSED:
                row.dismissed_at = _now()
            session.commit()
            payload = _row(row)
        return {"success": True, "candidate": payload}

    def _remember_step(self, step_id: str) -> None:
        self._steps[step_id] = None
        self._step_order.append(step_id)
        if len(self._step_order) > MAX_STEP_HISTORY:
            oldest = self._step_order.pop(0)
            self._steps.pop(oldest, None)

    def _evict_if_needed(self) -> None:
        with self._session_factory() as session:
            rows = session.scalars(select(AgentHabitCandidate)).all()
            now = _now()
            expired = [row for row in rows if now - (row.last_seen_at or now) > IDLE_EXPIRY]
            for row in expired:
                session.delete(row)
            if len(rows) - len(expired) > POOL_LIMIT:
                ranked = sorted(
                    (row for row in rows if row not in expired),
                    key=lambda row: int(row.evidence_count or 0) / ((now - (row.last_seen_at or now)).days + 1),
                )
                for row in ranked[:EVICT_COUNT]:
                    session.delete(row)
            session.commit()


def _row(row: AgentHabitCandidate) -> dict[str, Any]:
    return {
        "id": row.id,
        "scope": row.scope_key,
        "candidateType": row.candidate_type,
        "contextKey": row.context_key,
        "entityId": row.entity_id,
        "evidenceCount": int(row.evidence_count or 0),
        "status": row.status,
        "lastPromptAt": row.last_prompt_at.isoformat() if row.last_prompt_at else None,
        "lastSeenAt": row.last_seen_at.isoformat() if row.last_seen_at else None,
    }


__all__ = [
    "CANDIDATE_SCHEDULED_CONTROL",
    "DISMISS_COOLDOWN",
    "IDLE_EXPIRY",
    "POOL_LIMIT",
    "PROMPT_INTERVAL",
    "PROMPT_THRESHOLD",
    "HabitCandidateService",
    "habit_draft_spec",
    "habit_observe_key",
]
