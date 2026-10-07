"""商店账号增设登录用账号名。

与主应用注册口径对齐：新用户注册填「账号 + 邮箱」；登录可用「账号或邮箱」。
购买、发码、授权归属仍以 ``accounts.email`` 为主线；``username`` 仅用于登录与展示。
老账号 ``username`` 为 NULL，继续只靠邮箱登录。

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-07

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('accounts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('username', sa.String(length=64), nullable=True))
        batch_op.create_index(op.f('ix_accounts_username'), ['username'], unique=True)


def downgrade() -> None:
    with op.batch_alter_table('accounts', schema=None) as batch_op:
        batch_op.drop_index(op.f('ix_accounts_username'))
        batch_op.drop_column('username')
