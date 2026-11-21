"""自动化草案表（Phase 1：只预览，不写入 HA）。

- ``AutomationDraft``：一个用户意图的最新状态（TTL 30 分钟、每会话最多 10 条）；
- ``AutomationDraftRevision``：不可变追加版本（``revSeq`` 递增），修订只新增行。

草案**不会**被自动执行：``specJson`` 只是「如果要做，会是什么样」的说明。用户显式确认后，
它会被落成一条本项目计划任务（``executionId`` 记录任务 ID），到期执行仍走 ``control_device``
的同一套权限与高危拦截；写 HA 自动化仍然需要用户另行操作。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import new_uuid, utc_now


class AutomationDraft(Base):
    __tablename__ = "automation_drafts"
    __table_args__ = (
        Index("automation_drafts_session_idx", "originSessionKey"),
        Index("automation_drafts_status_idx", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    target_backend: Mapped[str] = mapped_column("targetBackend", String(16), nullable=False, default="HA")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="READY")
    current_rev_seq: Mapped[int] = mapped_column("currentRevSeq", Integer, nullable=False, default=1)
    raw_prompt: Mapped[str] = mapped_column("rawPrompt", Text, nullable=False, default="")
    origin_session_key: Mapped[str] = mapped_column("originSessionKey", String(128), nullable=False, default="default")
    origin_channel: Mapped[str] = mapped_column("originChannel", String(32), nullable=False, default="web")
    origin_principal_id: Mapped[str | None] = mapped_column("originPrincipalId", String(64), nullable=True)
    identity_strength: Mapped[str] = mapped_column("identityStrength", String(16), nullable=False, default="NONE")
    execution_id: Mapped[str | None] = mapped_column("executionId", String(64), nullable=True)
    expires_at: Mapped[datetime] = mapped_column("expiresAt", DateTime, nullable=False, default=utc_now)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, nullable=False, default=utc_now)


class AutomationDraftRevision(Base):
    __tablename__ = "automation_draft_revisions"
    __table_args__ = (
        UniqueConstraint("draftId", "revSeq", name="automation_draft_revision_key"),
        Index("automation_draft_revisions_draft_idx", "draftId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    draft_id: Mapped[str] = mapped_column("draftId", String(36), nullable=False)
    rev_seq: Mapped[int] = mapped_column("revSeq", Integer, nullable=False)
    spec_json: Mapped[str] = mapped_column("specJson", Text, nullable=False)
    spec_hash: Mapped[str] = mapped_column("specHash", String(64), nullable=False)
    preview_json: Mapped[str] = mapped_column("previewJson", Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, nullable=False, default=utc_now)


__all__ = ["AutomationDraft", "AutomationDraftRevision"]
