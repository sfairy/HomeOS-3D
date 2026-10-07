"""login sessions (并入 homeos-3d 授权服务)

新增 DB 会话表 ``sessions``（homeos-3d ``LoginSession``）。``id_hash`` 是会话令牌的
sha256，作为主键 —— 令牌原文绝不落库，且会话可服务端吊销。

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-06 11:52:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("id_hash", sa.String(length=64), nullable=False),
        sa.Column("userId", sa.String(length=36), nullable=False),
        sa.Column("expiresAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lastSeenAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ipAddress", sa.String(length=64), nullable=False),
        sa.Column("userAgent", sa.String(length=512), nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id_hash"),
    )
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.create_index("ix_sessions_userId", ["userId"], unique=False)
        batch_op.create_index("sessions_expiresAt_idx", ["expiresAt"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.drop_index("sessions_expiresAt_idx")
        batch_op.drop_index("ix_sessions_userId")
    op.drop_table("sessions")
