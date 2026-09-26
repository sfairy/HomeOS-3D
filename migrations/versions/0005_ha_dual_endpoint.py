'''Add internal / external HA addresses with automatic failover.

Revision ID: 0005
Revises: 0004

一条 HA 连接现在可以同时保存内网与外网两个地址，**内网优先**：只要内网可达就走内网，
内网不通才自动切到外网，内网恢复后切回。为什么值得这样做：家里的 HA 通常只在局域网内
可达（http 私网地址），出门后必须走公网域名或反向代理；以前只存一个地址，用户要么在家
用不了、要么在外用不了，只能反复手改地址并重新试连。

`base_url` / `verify_tls` 沿用为**内网**那一路（升级前库里存的就是内网地址），新增的
`external_*` 是外网那一路。两路各有自己的证书校验开关：内网默认不校验（多为 http 或
自签名证书），外网默认校验。`active_endpoint` 只是「最近探到在用哪一路」的展示用快照，
权威值在连接器内存里。

降级只丢外网地址与沿途记录：内网地址与令牌原样保留，连接照旧可用，不会因为回滚而连不上。
'''
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
    # 或自签名证书（校验会直接失败），把已有行一并改掉才符合「内网不需 ssl 认证」的预期。
    op.execute('UPDATE ha_connections SET verify_tls = 0')


def downgrade() -> None:
    # SQLite 不支持 DROP COLUMN 的完整 ALTER 语法，交给 batch 模式重建表。
    with op.batch_alter_table('ha_connections') as batch_op:
        batch_op.drop_column('active_endpoint')
        batch_op.drop_column('external_verify_tls')
        batch_op.drop_column('external_base_url')
