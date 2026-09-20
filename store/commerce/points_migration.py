"""把邀请积分从 ``FLOAT``（积分）迁移到 ``INTEGER``（厘）。

背景
----
积分原先以 ``FLOAT`` 存积分值，全站靠 ``round(x, 2)`` 维持两位小数。问题在于
**两条 round 不是同一个函数**：SQLite 的 ``round()`` 是 half-away-from-zero，
Python 内建 ``round()`` 是 half-even，金额正好落在 ``.xx5`` 上时给出不同的分币值。
后果（详见 :mod:`store.commerce.money`）一是提现那条「用 round 后的值比对冻结额是否被并发
改过」的条件 UPDATE 会误判成冲突，二是余额与流水之和能差 1 厘。

迁移策略（三段式，可中断、可重入、先验证后销毁）
------------------------------------------------
1. **补列**：``*_centi`` 列由 ``ensure_schema`` 按 ORM 元数据 ``ALTER TABLE ADD COLUMN``
   补上（``NOT NULL DEFAULT 0``），本模块不重复这件事。
2. **回填**：逐行把旧 ``FLOAT`` 列按 :func:`store.money.to_centi` 写成整数厘。
   只更新「算出来和目标不一致」的行，所以重跑是幂等的、断在半路也能续。
3. **对账**：逐行核对 ``format_centi(新值) == f"{旧值:.2f}"`` —— 也就是
   **迁移前后显示给用户的数字必须一模一样**。任何一行对不上就中止，且**不删旧列**，
   数据此时是「新旧都在」的安全状态。
4. **退役旧列**：只有第 3 步全表通过才 ``DROP COLUMN``。

为什么必须删掉旧列，而不是留着不管
----------------------------------
旧列是 ``NOT NULL`` 且**没有 DDL 默认值**（Python 侧 ``default=`` 不会写进 DDL）。
ORM 一旦不再映射它，``INSERT`` 就会省略该列，此后每次插入都以
``NOT NULL constraint failed`` 失败 —— 而且**只在存量库上**失败：全新库建表时本就没有
这一列，本地与 CI 全绿。这正是 ``schema_guard`` 文档里点名的那类最难排查的漂移，
所以这里必须把旧列真正删掉，而不是「先留着」。

为什么不做成「一个大事务」
--------------------------
SQLite 虽然支持事务性 DDL，但 ``DROP COLUMN`` 内部要走「建新表 → 拷数据 → 换名」，
依赖驱动把 DDL 正确纳入事务，链路长且不易验证。这里改成每步各自提交 + 三段顺序
保证「先验证、后销毁」：任何时刻崩溃，库里要么是纯旧列、要么是新旧并存且新列已
回填，都不丢数据。另有一份文件级备份（见 :func:`backup_database`）兜住极端情况。
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


#: 迁移映射：``{表名: ((旧列, 新列, 列的种类), ...)}``。
#:
#: 列的种类只影响**日志与错误信息**：两者都是「×100 后取整到整数」，换算函数相同
#: （``percent_to_bps`` 就是 ``to_centi``），所以回填与对账可以走同一条代码路径。
#: 分开标注是为了让对账失败时能说清「是金额还是比例对不上」。
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
    """旧值**当年显示出来的**字符串。

    ``FLOAT`` 列里的值都是 ``round(..., 2)`` 的产物，这类浮点的最短 repr 恰好就是
    它的两位小数，所以 ``f"{x:.2f}"`` 与它当年的界面显示一致 —— 对账的基准就是它。
    """
    return f"{float(value or 0.0):.2f}"


def backup_database(engine: Engine, *, directory: Path | None = None) -> Path | None:
    """迁移前把 SQLite 库文件整份复制一份，返回备份路径。

    实现已挪到 :func:`store.schema_guard.backup_database`：``schema_guard`` 合并重复行
    前也要备份（同一件事只留一份实现）。这里保留同名包装只是为了不动既有调用方，
    文件名前缀仍是 ``pre-centi-``。
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

    ``drop_legacy=False`` 时只做「补列 + 回填 + 对账」，把删列留给运维择期执行。

    **唯一会破坏数据的一步是删列**，而它被 ``problems`` 严格把关：任何一行对账不通过
    就整表跳过删列，并把原因写进日志与返回值。
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

        # 新列由 ensure_schema 按 ORM 元数据补；若调用方没跑过 ensure_schema，
        # 这里明确说明缺哪一列，而不是等到 SELECT 时报 no such column。
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
                # 对账基准在**回填前**就固定下来，回填后再逐行比对
                # pairs / legacy_values / expected 三者都由同一个 legacy_columns 生成，
                # 长度天然相等；strict=True 把这件事写成断言 —— 一旦有人只在一处加列，
                # 这里会立刻炸掉，而不是**静默少对账最后几列**（而对账正是这段代码的职责）。
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
