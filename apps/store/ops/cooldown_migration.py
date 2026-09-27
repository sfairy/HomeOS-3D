"""解绑冷却：把「没配过」从一个具体秒数改成一个真正的第三种状态。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from apps.store.security.schema_guard import backup_database, drop_column_ddl

logger = logging.getLogger("apps.store.ops.cooldown_migration")

#: 单例配置表。本迁移只碰这一张表、只碰一行。
_TABLE = "store_settings"

#: 退役列：NOT NULL 且无 DDL 默认值，等于 28800 一律视为「没配过」。
_LEGACY_COLUMN = "device_release_cooldown_seconds"

#: 新列：NULL = 跟随环境变量，0 = 显式不限间隔，其余为显式秒数。
_TARGET_COLUMN = "device_release_cooldown_override"

#: 旧列的模型默认值。**必须与迁移前的 ``models.StoreSetting`` 上那个 ``default``
_LEGACY_DEFAULT = 28800


@dataclass
class CooldownMigration:
    """一次迁移的结果。
    """

    #: 这次启动是否真的动了库（回填了行或删了列）。
    changed: bool = False
    #: 旧列存在时：回填的行数。
    backfilled: int = 0
    #: 旧列存在时：对账通过的检查项数。
    verified: bool = 0
    #: 实际删掉的旧列。
    dropped: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems

    def summary(self) -> str:
        parts = [f"回填 {self.backfilled} 行", f"对账 {self.verified} 行"]
        if self.dropped:
            parts.append(f"退役 {self.dropped[0]}")
        if self.problems:
            parts.append(f"{len(self.problems)} 处问题")
        return "、".join(parts)


def _columns(engine: Engine) -> set[str]:
    return {column["name"] for column in inspect(engine).get_columns(_TABLE)}


def migrate_device_release_cooldown(engine: Engine) -> CooldownMigration:
    """把解绑冷却搬进可空的新列，然后退役旧列。
    """
    report = CooldownMigration()
    columns = _columns(engine)
    if _LEGACY_COLUMN not in columns:
        # 全新库，或上一次启动已经迁完。这是稳态路径，不打日志。
        return report
    if _TARGET_COLUMN not in columns:
        # ensure_schema 没把新列补出来。此时**绝不能**删旧列：删了就同时失去新列
        report.problems.append(f"{_TABLE}.{_TARGET_COLUMN} 不存在：ensure_schema 未补出新列")
        logger.error(
            "解绑冷却迁移中止：%s 还没有列 %s（应由 ensure_schema 补上）。"
            "旧列 %s 原样保留，未做任何改动。",
            _TABLE,
            _TARGET_COLUMN,
            _LEGACY_COLUMN,
        )
        return report

    # 删列前先整份备份数据库文件（与 _drop_retired_columns / points 迁移同一做法）。
    backup_database(engine, label="cooldown-override")

    # ---- 回填：只写「旧值不是默认值」的行；等于默认值的旧值 -> NULL（跟随环境变量）----
    with engine.begin() as connection:
        result = connection.execute(
            text(
                f'UPDATE "{_TABLE}" SET "{_TARGET_COLUMN}" = "{_LEGACY_COLUMN}" '
                f'WHERE "{_TARGET_COLUMN}" IS NULL '
                f'AND "{_LEGACY_COLUMN}" IS NOT NULL '
                f'AND "{_LEGACY_COLUMN}" != :default'
            ),
            {"default": _LEGACY_DEFAULT},
        )
        report.backfilled = int(result.rowcount or 0)
    report.changed = report.changed or report.backfilled > 0

    # ---- 对账：不该存在「旧值是显式设置、新列却还是 NULL」的行 ----
    with engine.begin() as connection:
        left_behind = connection.execute(
            text(
                f'SELECT COUNT(*) FROM "{_TABLE}" '
                f'WHERE "{_TARGET_COLUMN}" IS NULL '
                f'AND "{_LEGACY_COLUMN}" IS NOT NULL '
                f'AND "{_LEGACY_COLUMN}" != :default'
            ),
            {"default": _LEGACY_DEFAULT},
        ).scalar_one()
        # 这张表是单例，对账就是「整表一行」。仍然数出来而不是假定 1：表被清空过的
        report.verified = int(
            connection.execute(text(f'SELECT COUNT(*) FROM "{_TABLE}"')).scalar_one()
        )
    if left_behind:
        report.problems.append(f"{left_behind} 行的旧值没有搬进新列")
        logger.error(
            "解绑冷却迁移对账不通过：还有 %s 行旧值不是 %s 却没搬进 %s；"
            "旧列保留、不做删列，请人工核对。",
            left_behind,
            _LEGACY_DEFAULT,
            _TARGET_COLUMN,
        )
        return report

    if report.backfilled:
        logger.warning(
            "解绑冷却迁移：%d 行的显式值已搬进 %s；等于 %s 的行按「未配置」处理，"
            "改为跟随 STORE_DEVICE_RELEASE_COOLDOWN_SECONDS。",
            report.backfilled,
            _TARGET_COLUMN,
            _LEGACY_DEFAULT,
        )

    # ---- 退役旧列（仅在对账通过之后；删列同时是回填的完成标记，见模块 docstring）----
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(drop_column_ddl(_TABLE, _LEGACY_COLUMN))
    except Exception as error:  # noqa: BLE001 - 删列失败不该让启动挂掉，但必须可见
        report.problems.append(f"删列 {_TABLE}.{_LEGACY_COLUMN} 失败：{error}")
        logger.warning(
            "退役旧列 %s.%s 失败（%s）：该列仍留在库中。它已是 NOT NULL 且无默认值，"
            "会让 %s 的**新建行**以 NOT NULL constraint failed 失败，请人工删除。",
            _TABLE,
            _LEGACY_COLUMN,
            error,
            _TABLE,
        )
        return report

    report.dropped.append(_LEGACY_COLUMN)
    report.changed = True
    return report
