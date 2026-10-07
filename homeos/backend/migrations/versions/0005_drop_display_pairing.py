"""drop display pairing tables

中控设备配置码配对机制已整体移除：总览本身即只读 3D 展示，运行在已登录会话
上下文中，不再需要 ``display_pairing_codes`` / ``display_devices`` 两张表与
对应的显示端 Cookie 会话。

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-06 13:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # display_devices 先删（外键指向 display_pairing_codes）。
    with op.batch_alter_table("display_devices", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_display_devices_token_hash"))
        batch_op.drop_index(batch_op.f("ix_display_devices_revoked_at"))
        batch_op.drop_index(batch_op.f("ix_display_devices_project_id"))
        batch_op.drop_index(batch_op.f("ix_display_devices_pairing_code_id"))
        batch_op.drop_index(batch_op.f("ix_display_devices_last_seen_at"))
    op.drop_table("display_devices")

    with op.batch_alter_table("display_pairing_codes", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_display_pairing_codes_project_id"))
        batch_op.drop_index(batch_op.f("ix_display_pairing_codes_is_enabled"))
        batch_op.drop_index(batch_op.f("ix_display_pairing_codes_created_by"))
        batch_op.drop_index(batch_op.f("ix_display_pairing_codes_code_hash"))
    op.drop_table("display_pairing_codes")


def downgrade() -> None:
    op.create_table(
        "display_pairing_codes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("encrypted_code", sa.Text(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("display_pairing_codes", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_display_pairing_codes_code_hash"), ["code_hash"], unique=True)
        batch_op.create_index(batch_op.f("ix_display_pairing_codes_created_by"), ["created_by"], unique=False)
        batch_op.create_index(batch_op.f("ix_display_pairing_codes_is_enabled"), ["is_enabled"], unique=False)
        batch_op.create_index(batch_op.f("ix_display_pairing_codes_project_id"), ["project_id"], unique=False)

    op.create_table(
        "display_devices",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("pairing_code_id", sa.String(length=36), nullable=True),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=False),
        sa.Column("user_agent", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["pairing_code_id"], ["display_pairing_codes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("display_devices", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_display_devices_last_seen_at"), ["last_seen_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_display_devices_pairing_code_id"), ["pairing_code_id"], unique=True)
        batch_op.create_index(batch_op.f("ix_display_devices_project_id"), ["project_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_display_devices_revoked_at"), ["revoked_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_display_devices_token_hash"), ["token_hash"], unique=True)
