'''Add a unique index on projects.name.
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
