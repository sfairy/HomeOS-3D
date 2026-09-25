'''Add studio_interaction_sync for 3D binding cleanup undo records.

Revision ID: 0004
Revises: 0003

保存 3D 户型图时如果删掉了被 3D 控件绑定的模型，``interaction3d`` 会把这些悬空绑定从各项目
文档里剪掉，好让舞台页不再渲染点不动的图标。剪掉的条目不能丢：模型被重新加回场景时要能原样
放回去（否则用户「删错了再画回来」会得到一个永久损坏的配置）。

这张表单行（固定 ``id=1``），把撤销记录整体以 JSON 存在 ``document_json`` 里。为什么不拆成
逐条记录的表：这批记录只在保存户型图时整体读写、从不按单条查询或关联，一行 JSON 与它的使用
方式一致；拆表只会多出一套需要同步的结构。

降级只删表：撤销记录是「配合一次已完成的清理」存在的辅助数据，删掉它只是失去自动还原能力，
不会影响任何项目、草稿或 HA 实体 —— 已被清理的绑定不会因此恢复，也不能凭空造出来。
'''
from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'studio_interaction_sync',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('document_json', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('studio_interaction_sync')
