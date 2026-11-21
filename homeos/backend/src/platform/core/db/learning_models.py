"""学习体系的 ORM 表（别名 / 房间默认 / 审计 / 习惯候选）。

单独成文件而不是塞进 ``models.py``：那边被文件规模棘轮锁住，且这三张表属于
「Agent 学习」而不是主干业务表。只要 ``models.py`` 在末尾导入本模块，SQLAlchemy
的 ``Base.metadata`` 就会把它们一起建出来。

设计要点：

- **单一配置表 + 审计表**：别名与房间默认共用 ``agent_learning_config``，
  用 ``kind`` 区分；每次写操作都落一条审计，支持按 revision 精确回滚。
- **CAS 并发控制**：``revision`` 每次写 +1；回滚要求 ``expectedRevision`` 匹配，
  避免把用户后续的人工修改覆盖掉。
- **习惯候选独立表**：候选状态（OBSERVING / PROMPTED / DISMISSED / GRADUATED）
  与计数分开存，池满时按 ``evidenceCount / (空闲天数 + 1)`` 淘汰。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import new_uuid, utc_now

#: 配置种类
KIND_ALIAS = "DEVICE_ALIAS"
KIND_AREA_DEFAULT = "AREA_DEFAULT_TARGET"

#: 审计动作
ACTION_CREATE = "CREATE"
ACTION_UPDATE = "UPDATE"
ACTION_REVERT = "REVERT"
ACTION_DELETE = "DELETE"
ACTION_PAUSE = "PAUSE"
ACTION_RESUME = "RESUME"

#: 习惯候选状态
HABIT_OBSERVING = "OBSERVING"
HABIT_PROMPTED = "PROMPTED"
HABIT_DISMISSED = "DISMISSED"
HABIT_GRADUATED = "GRADUATED"


class AgentLearningConfig(Base):
    """一条学习配置（别名或房间默认设备）。"""

    __tablename__ = "agent_learning_config"
    __table_args__ = (
        UniqueConstraint("scopeKey", "kind", "configKey", name="agent_learning_config_key"),
        Index("agent_learning_config_kind_idx", "kind"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    #: ``household`` 或 ``area:<id>``
    scope_key: Mapped[str] = mapped_column("scopeKey", String(128), nullable=False, default="household")
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    config_key: Mapped[str] = mapped_column("configKey", String(255), nullable=False)
    #: 目标实体（别名 → entityId；房间默认 → entityId）
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    #: 附加信息（如房间默认的 domain、来源 USER/HA_SYNC）
    value_json: Mapped[str | None] = mapped_column("valueJson", Text, nullable=True)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class AgentLearningAudit(Base):
    """学习配置的变更审计（可回滚）。"""

    __tablename__ = "agent_learning_audit"
    __table_args__ = (Index("agent_learning_audit_config_idx", "configId", "createdAt"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    config_id: Mapped[str] = mapped_column("configId", String(36), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    from_revision: Mapped[int] = mapped_column("fromRevision", Integer, nullable=False, default=0)
    to_revision: Mapped[int] = mapped_column("toRevision", Integer, nullable=False, default=0)
    from_entity_id: Mapped[str | None] = mapped_column("fromEntityId", String(255), nullable=True)
    to_entity_id: Mapped[str | None] = mapped_column("toEntityId", String(255), nullable=True)
    execution_id: Mapped[str | None] = mapped_column("executionId", String(64), nullable=True)
    actor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, nullable=False, default=utc_now)


class AgentHabitCandidate(Base):
    """习惯候选：同一上下文反复出现后才提示用户固化为默认。"""

    __tablename__ = "agent_habit_candidate"
    __table_args__ = (
        UniqueConstraint("scopeKey", "candidateType", "contextKey", "entityId", name="agent_habit_candidate_key"),
        Index("agent_habit_candidate_status_idx", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    scope_key: Mapped[str] = mapped_column("scopeKey", String(128), nullable=False, default="household")
    candidate_type: Mapped[str] = mapped_column("candidateType", String(32), nullable=False)
    context_key: Mapped[str] = mapped_column("contextKey", String(128), nullable=False)
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    evidence_count: Mapped[int] = mapped_column("evidenceCount", Integer, nullable=False, default=0)
    #: 最近一次计入证据的 stepId / contextId（去重）
    last_step_id: Mapped[str | None] = mapped_column("lastStepId", String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=HABIT_OBSERVING)
    last_prompt_at: Mapped[datetime | None] = mapped_column("lastPromptAt", DateTime, nullable=True)
    dismissed_at: Mapped[datetime | None] = mapped_column("dismissedAt", DateTime, nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column("lastSeenAt", DateTime, nullable=False, default=utc_now)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, nullable=False, default=utc_now)


__all__ = [
    "ACTION_CREATE",
    "ACTION_DELETE",
    "ACTION_PAUSE",
    "ACTION_RESUME",
    "ACTION_REVERT",
    "ACTION_UPDATE",
    "HABIT_DISMISSED",
    "HABIT_GRADUATED",
    "HABIT_OBSERVING",
    "HABIT_PROMPTED",
    "KIND_ALIAS",
    "KIND_AREA_DEFAULT",
    "AgentHabitCandidate",
    "AgentLearningAudit",
    "AgentLearningConfig",
]
