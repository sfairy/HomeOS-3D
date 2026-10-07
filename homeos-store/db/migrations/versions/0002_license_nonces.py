"""授权请求重放保护：记录已受理过的请求随机数。

客户端每次 activate / heartbeat / recover 都带一个一次性随机数（``nonce``）。服务端把
受理过的随机数按哈希落库，重复出现的直接拒掉 —— 否则一份被截获的请求（信封自包含，
可原样重发）能反复换取新租约。

只存哈希：这张表的用途是「见过 / 没见过」，留明文等于外泄一份可重放的凭据清单。
``expires_at`` 供惰性清理，行的价值不超过对应会话的寿命。

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-07

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'license_nonces',
        sa.Column('id_hash', sa.String(length=64), nullable=False),
        sa.Column('scope', sa.String(length=32), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id_hash'),
    )
    op.create_index(
        op.f('ix_license_nonces_expires_at'), 'license_nonces', ['expires_at'], unique=False
    )


def downgrade() -> None:
    """回退只需丢掉这张表：没有任何业务数据依赖它，重放保护会回到「未启用」状态。"""
    op.drop_index(op.f('ix_license_nonces_expires_at'), table_name='license_nonces')
    op.drop_table('license_nonces')
