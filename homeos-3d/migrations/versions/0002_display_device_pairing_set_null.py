"""删除配对码不再连带删除设备：display_devices.pairing_code_id 外键改为 SET NULL。

背景：配对码只是设备的一次入场凭据，不是设备的所有者。旧结构把外键写成
``ondelete='CASCADE'``（ORM 关系上还带 ``cascade='all, delete-orphan'``），于是在管理页
删掉一个配对码会把已经绑定好的中控设备一起删掉，用户必须重新配对。

SQLite 不能直接修改外键，batch 模式负责整表重建（CREATE 新表 → 拷数据 → DROP → RENAME），
因此这里先删掉旧约束再建新约束。

约束名不能写死：SQLite 只有在建表语句里显式写了 ``CONSTRAINT <name>`` 时才保存名字，
否则反射回来是 ``None``。本迁移链的 0001 建出的库属于后者，而迁移链压缩前的老基线库
（本仓库现场就是这种库）建表时给这个外键写死了较短的名字
``fk_display_devices_pairing_code_id``，反射回来的是这个名字。所以先带命名约定反射实际
约束名，两种库都能拿到一个确定的名字再删。带上命名约定反射时，无名的外键会按约定得到
``fk_display_devices_pairing_code_id_display_pairing_codes``，与老库的短名一起都被覆盖。

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-02

"""
from __future__ import annotations

from alembic import op
from sqlalchemy import MetaData, Table

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None

#: 反射时给无名的外键起名用：SQLite 不保存约束名，batch 重建需要确定的名字。
FK_NAMING_CONVENTION = {'fk': 'fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s'}


def _pairing_foreign_key_name() -> str:
    """返回当前库里 ``display_devices.pairing_code_id`` 外键的实际约束名。

    带命名约定反射：已有名字的约束（老基线库的短名）原样保留，没有名字的约束（0001 新建的
    库）按约定补一个名字。两种情况下返回的都是 batch 可以直接 drop 的名字。
    """
    metadata = MetaData(naming_convention = FK_NAMING_CONVENTION)
    table = Table('display_devices', metadata, autoload_with = op.get_bind())
    for constraint in table.foreign_key_constraints:
        if [column.name for column in constraint.columns] == ['pairing_code_id']:
            return str(constraint.name)
    raise RuntimeError('display_devices 上找不到 pairing_code_id 的外键约束，无法修改级联行为。')


def _replace_pairing_foreign_key(ondelete: str) -> None:
    # 新旧约束共用同一个名字（唯一性只要求表内不重名），避免重建后改名。
    name = _pairing_foreign_key_name()
    with op.batch_alter_table('display_devices', naming_convention = FK_NAMING_CONVENTION) as batch:
        batch.drop_constraint(name, type_ = 'foreignkey')
        batch.create_foreign_key(
            name,
            'display_pairing_codes',
            ['pairing_code_id'],
            ['id'],
            ondelete = ondelete,
        )


def upgrade() -> None:
    _replace_pairing_foreign_key('SET NULL')


def downgrade() -> None:
    _replace_pairing_foreign_key('CASCADE')
