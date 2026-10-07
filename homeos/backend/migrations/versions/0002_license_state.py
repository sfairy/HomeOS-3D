"""license state (并入 homeos-3d 授权服务)

把 homeos-3d 的 ``license_state`` 单例表并入 HomeOS 数据库。列名刻意保持上游的
snake_case（与既有业务表的 camelCase 不同）：这张表的状态字段只是「可变缓存」，
真正的门禁依据是 ``signed_lease`` 的 Ed25519 签名；同名列也让 homeos-3d 的
``app.db`` 数据可以原样导入。

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-06 11:45:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "license_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("instance_id", sa.String(length=64), nullable=False),
        sa.Column("license_id", sa.String(length=64), nullable=True),
        sa.Column("lease_id", sa.String(length=64), nullable=True),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("lease_sequence", sa.Integer(), nullable=False),
        sa.Column("activation_code_hint", sa.String(length=16), nullable=True),
        sa.Column("encrypted_activation_code", sa.Text(), nullable=True),
        sa.Column("activation_email", sa.String(length=255), nullable=True),
        sa.Column("signed_lease", sa.Text(), nullable=True),
        sa.Column("encrypted_session_token", sa.Text(), nullable=True),
        sa.Column("encrypted_recovery_token", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("lease_issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("product_edition", sa.String(length=64), nullable=True),
        sa.Column("feature_set", sa.Text(), nullable=False),
        sa.Column("max_projects", sa.Integer(), nullable=False),
        sa.Column("max_displays", sa.Integer(), nullable=False),
        sa.Column("heartbeat_interval_seconds", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("instance_id"),
    )
    with op.batch_alter_table("license_state", schema=None) as batch_op:
        batch_op.create_index("ix_license_state_status", ["status"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("license_state", schema=None) as batch_op:
        batch_op.drop_index("ix_license_state_status")
    op.drop_table("license_state")
