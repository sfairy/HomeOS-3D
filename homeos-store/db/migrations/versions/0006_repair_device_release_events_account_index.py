"""修复：补 ``device_release_events.account_id`` 索引（缺了才加）。

``0005`` 在部分环境已经打上版本号之后，又追加了
``ix_device_release_events_account_id``；版本号不会回退，导致库停在 head
却缺索引。本迁移只在索引不存在时创建。

Revision ID: 0006
Revises: 0005
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

_INDEX = "ix_device_release_events_account_id"
_TABLE = "device_release_events"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in inspector.get_table_names():
        return
    existing = {
        name
        for index in inspector.get_indexes(_TABLE)
        if (name := index.get("name"))
    }
    if _INDEX in existing:
        return
    with op.batch_alter_table(_TABLE, schema=None) as batch_op:
        batch_op.create_index(op.f(_INDEX), ["account_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in inspector.get_table_names():
        return
    existing = {
        name
        for index in inspector.get_indexes(_TABLE)
        if (name := index.get("name"))
    }
    if _INDEX not in existing:
        return
    with op.batch_alter_table(_TABLE, schema=None) as batch_op:
        batch_op.drop_index(op.f(_INDEX))
