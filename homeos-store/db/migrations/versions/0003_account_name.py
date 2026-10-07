"""设备绑定记录账号名 + 商品版本（edition）字段。

两处新增，都是「把主应用侧的新语义落到商店」：

- ``device_bindings.account_name``：主应用激活时上报本机账号名（「授权用户增设账户名」），
  后台「设备绑定」面板据此显示「这张授权绑在哪台机器、用的是谁的本机账号」。旧客户端
  不发该字段，列为 NULL，不影响既有绑定。
- ``products.edition``：商品版本/版本名（如「家庭版」「专业版」）。版本的本质就是一组
  功能码加展示信息，落成独立字段后后台可编辑、商店可按版本陈列。

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-07

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('device_bindings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('account_name', sa.String(length=255), nullable=True))
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.add_column(sa.Column('edition', sa.String(length=64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.drop_column('edition')
    with op.batch_alter_table('device_bindings', schema=None) as batch_op:
        batch_op.drop_column('account_name')
