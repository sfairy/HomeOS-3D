from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 外网地址可空：只用内网的部署不必填它，此时内网不通就直接报错（与升级前行为一致）。
    op.add_column('ha_connections', sa.Column('external_base_url', sa.String(length=512), nullable=True))
    # 外网默认校验证书（server_default 让已有行也拿到 True），内网那一路沿用旧列。
    op.add_column(
        'ha_connections',
        sa.Column('external_verify_tls', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column('ha_connections', sa.Column('active_endpoint', sa.String(length=16), nullable=True))
    # 内网地址默认不校验证书：升级前该列默认 True，但内网部署基本是 http（该校验对 http 无效）
    op.execute('UPDATE ha_connections SET verify_tls = 0')


def downgrade() -> None:
    # SQLite 不支持 DROP COLUMN 的完整 ALTER 语法，交给 batch 模式重建表。
    with op.batch_alter_table('ha_connections') as batch_op:
        batch_op.drop_column('active_endpoint')
        batch_op.drop_column('external_verify_tls')
        batch_op.drop_column('external_base_url')
