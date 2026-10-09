"""compressed baseline schema (ORM-equivalent)

Revision ID: 0001
Revises:
Create Date: 2026-10-09
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    from src.core import models, models_engagement  # noqa: F401
    from src.core.database import Base

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    from src.core import models, models_engagement  # noqa: F401
    from src.core.database import Base

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
