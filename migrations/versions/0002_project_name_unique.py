'''Add a unique index on projects.name.

Revision ID: 0002
Revises: 0001

项目名只在应用层做过「先查后写」的唯一性校验，并发创建可以产生两行同名项目（B10）,
而名称同时是展示地址 ``/display/{名称}`` 的路径段 —— 同名项目会让展示页定位不到。
老库里可能已经有这种重名行（正是这个缺陷的产物），直接建唯一索引会失败，
因此先做一次确定性的改名：

按 ``(created_at, id)`` 排序，每组同名里最早的那一行保持原名，其余的追加
「（2）」「（3）」…，直到不与任何现存名称冲突。排序键固定，同一个库重复跑也得到
同样的结果；改掉的只是重复的那几行，唯一的原名仍然指向最早创建的项目。

改名是只能向前的一步：00 号迁移的回退只删索引，不把名字还原 ——
「哪几行原本重名」这个信息在改名后已经不存在了，硬要回退只能猜。
'''
from alembic import op
import sqlalchemy as sa
revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    # 先取整表（按固定顺序），再在内存里算新名字：SQLite 的 UPDATE 与 SELECT 混在
    # 同一个游标上遍历时，边读边写会改变结果集，这样写没有那个坑。
    rows = connection.execute(
        sa.text('SELECT id, name FROM projects ORDER BY created_at, id')
    ).fetchall()
    # used 里放「库中已存在的全部名称」，候选名要同时避开它和本次已经改出来的名字。
    used = {name for (_project_id, name) in rows}
    seen: set[str] = set()
    for (project_id, name) in rows:
        if name not in seen:
            seen.add(name)
            continue
        suffix = 2
        while f'{name}（{suffix}）' in used:
            suffix += 1
        renamed = f'{name}（{suffix}）'
        connection.execute(
            sa.text('UPDATE projects SET name = :name WHERE id = :id'),
            {'name': renamed, 'id': project_id},
        )
        used.add(renamed)
        seen.add(renamed)
    op.create_index('ix_projects_name', 'projects', ['name'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_projects_name', table_name='projects')
