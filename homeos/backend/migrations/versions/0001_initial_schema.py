"""compressed baseline schema (ORM-equivalent)

Revision ID: 0001
Revises:
Create Date: 2026-10-07

开发期迁移链已压缩为单一基线：升级路径创建当前 ORM 元数据建全表。
存量库若 revision 不在脚本图中但结构已匹配 ORM，由 ``run_migrations`` stamp 到 0001。
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 与发行版 ``_create_schema`` 同源：按 ORM 建库，避免逐步迁移与模型再次漂移。
    from src.core import models  # noqa: F401
    from src.core.database import Base

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    from src.core import models  # noqa: F401
    from src.core.database import Base

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
