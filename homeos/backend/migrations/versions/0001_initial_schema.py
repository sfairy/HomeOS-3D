"""compressed baseline schema (ORM-equivalent)

Revision ID: 0001
Revises:
Create Date: 2026-10-09
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    from src.core import models  # noqa: F401
    from src.core.database import Base

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
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
    from src.core import models  # noqa: F401
    from src.core.database import Base

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
