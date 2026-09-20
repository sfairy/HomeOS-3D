"""把邀请积分从 ``FLOAT``（积分）迁移到 ``INTEGER``（厘）。

原先以 ``FLOAT`` 存积分，靠 ``round(x, 2)`` 维持两位小数，而 SQLite 的 round 是
half-away、Python 是 half-even，``.xx5`` 上会分叉（见 :mod:`store.commerce.money`）。

迁移分四段、可中断可重入、先验证后销毁：新列由 ``ensure_schema`` 补上 → 逐行回填
（只写不一致的行，重跑幂等）→ 逐行对账 ``format_centi(新值) == f"{旧值:.2f}"``
（迁移前后显示给用户的数字必须一模一样）→ 全表通过才 ``DROP COLUMN``。

必须真正删掉旧列：它是 ``NOT NULL`` 且无 DDL 默认值，ORM 不再映射后每次 INSERT 都会
``NOT NULL constraint failed``，且**只在存量库上**失败。每步各自提交而非一个大事务，
因为 SQLite 的 ``DROP COLUMN`` 内部要建新表拷数据，链路长且不易验证。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from store.commerce import money
from store.security.schema_guard import backup_database as _backup_database
from store.security.schema_guard import drop_column_ddl

logger = logging.getLogger("store.commerce.points_migration")


#: 迁移映射：``{表名: ((旧列, 新列, 列的种类), ...)}``。列的种类只影响日志与错误信息
#: （金额与比例都是 ×100 取整到整数，换算函数相同），分开标注便于对账失败时定位。
_POINTS = "points"
_RATIO = "ratio"

_MIGRATION_SPEC: dict[str, tuple[tuple[str, str, str], ...]] = {
    "referral_wallets": (
        ("balance", "balance_centi", _POINTS),
        ("frozen", "frozen_centi", _POINTS),
        ("earned", "earned_centi", _POINTS),
        ("withdrawn", "withdrawn_centi", _POINTS),
    ),
    "referral_ledger": (
        ("delta", "delta_centi", _POINTS),
        ("frozen_delta", "frozen_delta_centi", _POINTS),
        ("balance_after", "balance_after_centi", _POINTS),
        ("frozen_after", "frozen_after_centi", _POINTS),
    ),
    "referral_withdrawals": (
        ("points", "points_centi", _POINTS),
        ("fee_percent", "fee_bps", _RATIO),
        ("fee_points", "fee_points_centi", _POINTS),
        ("net_points", "net_points_centi", _POINTS),
    ),
    "orders": (
        ("referral_reward_points", "referral_reward_points_centi", _POINTS),
    ),
}


@dataclass
class TableReport:
    """单张表的迁移结果。"""

    table: str
    state: str = "pending"  # fresh | migrated | already | missing-table | failed
    backfilled: int = 0
    verified: int = 0
    dropped: list[str] = field(default_factory=list)
    created: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)


@dataclass
class MigrationReport:
    tables: list[TableReport] = field(default_factory=list)
    backup_path: Path | None = None

    @property
    def ok(self) -> bool:
        return all(not table.problems for table in self.tables)

    @property
    def changed(self) -> bool:
        return any(table.backfilled or table.dropped for table in self.tables)

    def summary(self) -> str:
        parts = []
        for table in self.tables:
            if table.state == "fresh":
                continue
            parts.append(
                f"{table.table}:{table.state}"
                f"(回填 {table.backfilled}、对账 {table.verified}"
                f"{'、退役 ' + '、'.join(table.dropped) if table.dropped else ''})"
            )
        return "；".join(parts) or "无需迁移"


def _convert(value: object) -> int:
    """旧 ``FLOAT`` 值 → 整数厘。比例列与金额列同式（见 ``_MIGRATION_SPEC`` 注释）。"""
    return money.to_centi(value)


def _legacy_shown(value: object) -> str:
    """旧值**当年显示出来的**字符串（对账基准）。

    ``FLOAT`` 列的值都是 ``round(..., 2)`` 的产物，其最短 repr 恰好就是两位小数，
    所以 ``f"{x:.2f}"`` 与当年的界面显示一致。
    """
    return f"{float(value or 0.0):.2f}"


def backup_database(engine: Engine, *, directory: Path | None = None) -> Path | None:
    """迁移前把 SQLite 库文件整份复制一份，返回备份路径。

    实现复用 :func:`store.security.schema_guard.backup_database`（那里合并重复行前也要
    备份）；保留同名包装只为不动既有调用方，文件名前缀仍是 ``pre-centi-``。
    """
    return _backup_database(engine, directory=directory, label="centi")


def _scan(engine: Engine) -> list[tuple[str, list[tuple[str, str, str]], set[str], bool]]:
    """返回每张表的 ``(表名, 待迁移列, 现有列, 表是否存在)``。"""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    scanned = []
    for table, spec in _MIGRATION_SPEC.items():
        exists = table in existing_tables
        columns = (
            {column["name"] for column in inspector.get_columns(table)} if exists else set()
        )
        scanned.append((table, list(spec), columns, exists))
    return scanned


def migrate_points(
    engine: Engine,
    *,
    drop_legacy: bool = True,
    backup: bool = True,
) -> MigrationReport:
    """执行回填 + 对账（+ 可选退役旧列）。

    ``drop_legacy=False`` 时只做「补列 + 回填 + 对账」，把删列留给运维择期执行。**唯一
    会破坏数据的一步是删列**，它被 ``problems`` 严格把关：任何一行对账不通过就整表跳过。
    """
    report = MigrationReport()
    scanned = _scan(engine)

    pending = [
        (table, spec, columns)
        for table, spec, columns, exists in scanned
        if exists and any(legacy in columns for legacy, _, _ in spec)
    ]
    if not pending:
        for table, _spec, _columns, exists in scanned:
            report.tables.append(
                TableReport(table=table, state="missing-table" if not exists else "fresh")
            )
        return report

    if backup:
        report.backup_path = backup_database(engine)

    for table, spec, columns in pending:
        row = TableReport(table=table)
        report.tables.append(row)

        # 新列由 ensure_schema 补；若调用方没跑过，这里明确说明缺哪一列。
        missing = [centi for _, centi, _ in spec if centi not in columns]
        if missing:
            row.state = "failed"
            row.problems.append(
                f"缺少新列 {'、'.join(missing)}：请先运行 ensure_schema（服务启动会自动执行）"
            )
            logger.error("表 %s 缺少新列 %s，回填中止。", table, "、".join(missing))
            continue

        pairs = [(legacy, centi) for legacy, centi, _ in spec if legacy in columns]
        if not pairs:
            row.state = "already"
            continue

        legacy_columns = [legacy for legacy, _ in pairs]
        centi_columns = [centi for _, centi in pairs]
        where_sql = ", ".join(legacy_columns)
        target_sql = ", ".join(centi_columns)

        # ---- 回填（幂等：只写「算出来不一致」的行）----
        updates: list[tuple[int, ...]] = []
        problems: list[str] = []
        with engine.begin() as connection:
            rows = connection.exec_driver_sql(
                f'SELECT "id", {where_sql}, {target_sql} FROM "{table}"'
            ).fetchall()
            for raw in rows:
                row_id = raw[0]
                legacy_values = raw[1 : 1 + len(legacy_columns)]
                current_values = raw[1 + len(legacy_columns) :]
                expected = tuple(_convert(value) for value in legacy_values)
                if tuple(int(value or 0) for value in current_values) != expected:
                    updates.append((*expected, row_id))
                # 对账基准在**回填前**就固定下来；pairs / legacy_values / expected 三者
                # 长度天然相等，strict=True 让「只在一处加列」立刻炸掉而非静默少对账。
                for (legacy, _centi), legacy_value, expected_value in zip(
                    pairs, legacy_values, expected, strict=True
                ):
                    shown = _legacy_shown(legacy_value)
                    got = money.format_centi(expected_value)
                    if shown != got:
                        problems.append(
                            f"id={row_id} 列 {legacy}: 迁移前显示 {shown}，迁移后为 {got}"
                        )

        if updates:
            assignments = ", ".join(f'"{centi}" = ?' for centi in centi_columns)
            with engine.begin() as connection:
                connection.exec_driver_sql(
                    f'UPDATE "{table}" SET {assignments} WHERE "id" = ?',
                    updates,
                )
            row.backfilled = len(updates)

        # ---- 对账（回填后从库里读回来，确认落盘结果就是期望值）----
        with engine.begin() as connection:
            rows = connection.exec_driver_sql(
                f'SELECT "id", {where_sql}, {target_sql} FROM "{table}"'
            ).fetchall()
        for raw in rows:
            row_id = raw[0]
            legacy_values = raw[1 : 1 + len(legacy_columns)]
            actual_values = raw[1 + len(legacy_columns) :]
            mismatched = False
            for (legacy, centi), legacy_value, actual in zip(
                pairs, legacy_values, actual_values, strict=True
            ):
                shown = _legacy_shown(legacy_value)
                got = money.format_centi(int(actual or 0))
                if shown != got:
                    mismatched = True
                    problems.append(
                        f"id={row_id} 列 {legacy}→{centi}: 期望 {shown}，库中为 {got}"
                    )
            if not mismatched:
                row.verified += 1

        if problems:
            row.state = "failed"
            row.problems = problems[:10]
            logger.error(
                "表 %s 回填后对账不通过（%d 处，展示前 10 处）：%s；"
                "旧列保留、不做删列，请人工核对。",
                table,
                len(problems),
                "；".join(problems[:10]),
            )
            continue

        row.state = "migrated"
        logger.info(
            "积分迁移 %s：回填 %d 行、对账 %d 行全部一致。", table, row.backfilled, row.verified
        )

        # ---- 退役旧列（仅在对账全通过之后）----
        if drop_legacy:
            row.dropped = _drop_legacy_columns(engine, table, legacy_columns, row)
        else:
            logger.warning(
                "表 %s 的旧列 %s 仍在（未开启 drop_legacy）。"
                "注意：ORM 已不再映射它们，而它们是 NOT NULL 且无 DDL 默认值，"
                "**新的插入会以 NOT NULL constraint failed 失败** —— 请尽快执行删列。",
                table,
                "、".join(legacy_columns),
            )

    return report


def _drop_legacy_columns(
    engine: Engine, table: str, legacy_columns: list[str], row: TableReport
) -> list[str]:
    dropped: list[str] = []
    for column in legacy_columns:
        try:
            with engine.begin() as connection:
                connection.exec_driver_sql(drop_column_ddl(table, column))
        except Exception as error:  # noqa: BLE001 - 删列失败不该让启动挂掉，但必须可见
            row.problems.append(f"删列 {table}.{column} 失败：{error}")
            logger.warning(
                "退役旧列 %s.%s 失败（%s）：该列仍留在库中。"
                "它已是 NOT NULL 且无默认值，会使新的插入失败，请人工删除。",
                table,
                column,
                error,
            )
            continue
        dropped.append(column)
        logger.info("已退役旧列 %s.%s", table, column)
    return dropped
