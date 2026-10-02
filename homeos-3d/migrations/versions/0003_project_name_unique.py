"""仪表盘名称唯一：projects.name 加唯一索引，并先消重历史重名数据。

背景：应用层一直靠 ``ensure_unique_project_name`` 先查后写，两个并发请求可以同时通过
校验，从而落库两个同名仪表盘 —— 列表页和 ``/display/{name}`` 命名页面都会因此指向任意一个。
唯一索引把这条约束下沉到数据库，应用层的检查只作为「尽早返回中文提示」的快速路径。

升级前先消重：按 created_at、id 顺序保留最早的一个，其余追加 ``-2``、``-3`` … 后缀
（截断到 128 字符以内），否则唯一索引建不出来。

幂等：迁移链压缩前的老基线库已经带了一条同名的唯一索引 ``ix_projects_name``（本仓库现场就是
这种库），此时直接建索引会撞 ``index ... already exists``。所以先探测现有索引：已经唯一就跳过，
存在但不唯一就先删再建，不存在才新建。0001 新建的库没有这条索引，走新建分支。

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-02

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None

NAME_MAX_LENGTH = 128
NAME_INDEX_NAME = 'ix_projects_name'


def _renamed_copy(name: str, suffix: int) -> str:
    marker = f'-{suffix}'
    return f'{name[:NAME_MAX_LENGTH - len(marker)]}{marker}'


def _deduplicate_names() -> None:
    # 先读全量：重名候选要和库里**所有**名字比较，而不只是已经处理过的那些。
    connection = op.get_bind()
    rows = connection.execute(sa.text('SELECT id, name FROM projects ORDER BY created_at, id')).fetchall()
    taken = {name for _, name in rows}
    seen: set[str] = set()
    used_suffix: dict[str, int] = {}
    for project_id, name in rows:
        if name not in seen:
            seen.add(name)
            continue
        suffix = used_suffix.get(name, 2)
        candidate = _renamed_copy(name, suffix)
        while candidate in taken:
            suffix += 1
            candidate = _renamed_copy(name, suffix)
        used_suffix[name] = suffix + 1
        taken.add(candidate)
        connection.execute(
            sa.text('UPDATE projects SET name = :name WHERE id = :id'),
            {'name': candidate, 'id': project_id},
        )


def _name_index_is_unique() -> bool | None:
    """projects.name 上同名索引是否存在、是否唯一；不存在返回 ``None``。"""
    for index in sa.inspect(op.get_bind()).get_indexes('projects'):
        if index.get('name') == NAME_INDEX_NAME:
            return bool(index.get('unique'))
    return None


def upgrade() -> None:
    _deduplicate_names()
    unique = _name_index_is_unique()
    if unique is True:
        # 老基线库已经带了这条唯一索引，无需重建（重建也会因同名而失败）。
        return
    if unique is False:
        op.drop_index(op.f(NAME_INDEX_NAME), table_name = 'projects')
    op.create_index(op.f(NAME_INDEX_NAME), 'projects', ['name'], unique = True)


def downgrade() -> None:
    if _name_index_is_unique() is not None:
        op.drop_index(op.f(NAME_INDEX_NAME), table_name = 'projects')
