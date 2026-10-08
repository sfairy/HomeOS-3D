"""data compatibility floor (binary vs data directory)

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-08

确保 ``data_compatibility`` 单行表与地板行存在。
开发期 ``0001`` 已通过 ORM ``create_all`` 建全表，因此本修订对已有表幂等：
仅在缺表时创建，并保证 singleton 行。
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
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "data_compatibility" not in tables:
        op.create_table(
            "data_compatibility",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("minimum_application_version", sa.String(length=64), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint("id = 1", name="ck_data_compatibility_singleton"),
        )
    op.execute(
        sa.text(
            "INSERT INTO data_compatibility (id, minimum_application_version, updated_at) "
            "VALUES (1, '0.0.0', CURRENT_TIMESTAMP) "
            "ON CONFLICT(id) DO NOTHING"
        )
    )


def downgrade() -> None:
    raise NotImplementedError(
        "data_compatibility 地板不可降级：旧程序不应回退已写入新版本要求的数据目录。"
    )
