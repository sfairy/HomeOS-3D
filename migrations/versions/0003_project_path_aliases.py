'''Add project_path_aliases for old display addresses.

Revision ID: 0003
Revises: 0002

展示地址 ``/display/{项目名称}`` 是名称派生的，而名称可以被改（草稿里的 name 就是
项目名）。改完之后，已经配对好的墙面平板手里那份旧地址就永久 404 了，且没有任何
提示 —— 用户只能把平板拆下来重新配对（B38）。

这张表记「旧名称 → 项目」，让旧地址继续可用（303 跳到当前地址）。

不做的取舍：不把已有项目的历史名称批量补进来 —— 改名发生在过去时，旧名称根本没
有被记录下来（这正是缺陷本身），任何「猜出旧名称」的回填都只能编造。因此这个迁移
只建表，从这一刻起发生的改名才会被记住。

降级同样只删表：别名是纯粹的兼容层，删掉它只是让旧地址重新 404，不影响任何项目、
草稿或配对设备的数据。
'''
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'project_path_aliases',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length = 128), nullable = False),
        sa.Column('project_id', sa.String(length = 36), nullable = False),
        sa.Column('created_at', sa.DateTime(timezone = True), nullable = False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete = 'CASCADE'),
    )
    # 名称唯一：一个展示地址只指向一个项目（撞名时由应用层让后来者接管，见 projects.py）。
    op.create_index('ix_project_path_aliases_name', 'project_path_aliases', ['name'], unique = True)
    op.create_index('ix_project_path_aliases_project_id', 'project_path_aliases', ['project_id'], unique = False)


def downgrade() -> None:
    op.drop_index('ix_project_path_aliases_project_id', table_name = 'project_path_aliases')
    op.drop_index('ix_project_path_aliases_name', table_name = 'project_path_aliases')
    op.drop_table('project_path_aliases')
