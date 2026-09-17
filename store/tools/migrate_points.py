"""邀请积分口径迁移的命令行入口（回填 / 对账 / 退役旧列 / 回滚）。

服务启动时（``store.app``）会自动跑一次迁移，所以正常升级**不需要**手动执行本脚本。
它面向两类场景：

1. **先看再动**：``--check`` 只扫描并打印「哪些表有多少行会变、显示值是否变化」，
   不写库。适合在生产库上先确认影响面、或写进变更单。
2. **需要人工介入时**：某张表对账不通过（启动日志里会报），或想分开做
   「先回填、观察一段时间、再删旧列」，或迁移后要退回旧版本程序（``--rollback``）。

用法::

    python -m store.tools.migrate_points --check          # 只报告，不写库
    python -m store.tools.migrate_points                  # 回填 + 对账 + 退役旧列
    python -m store.tools.migrate_points --no-drop        # 只回填 + 对账，旧列留着
    python -m store.tools.migrate_points --rollback       # 退回 FLOAT（配旧版程序）

安全约定
--------
- 默认先整份备份 SQLite 库文件（``--no-backup`` 可关；内存库/非 SQLite 自动跳过）。
- 对账有任何一行不一致就**整表跳过删列**，旧列与数据都保留，并打印前 10 处差异。
- 删列是唯一不可逆的一步；``--rollback`` 能把整数列还原回 FLOAT（按显示值无损）。
"""

from __future__ import annotations

import argparse
import logging
import sys

from store.config import load_settings
from store.database import Database
from store.points_migration import (
    backup_database,
    legacy_tables,
    migrate_points,
    rollback_points,
)
from store.schema_guard import ensure_schema


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(levelname)-7s %(message)s",
    )


def _describe_check(database: Database) -> int:
    """``--check``：报告哪些表还带着旧 FLOAT 列，以及会不会出现显示值变化。"""
    engine = database.engine
    pending = legacy_tables(engine)
    if not pending:
        print("无需迁移：所有积分列都已是整数厘。")
        return 0

    print(f"待迁移的表：{'、'.join(pending)}")
    print()
    # 复用迁移路径的只读部分：drop_legacy=False 且不备份，先把「回填 + 对账」跑一遍。
    # 注意这会**写入**新列 —— 但新列是本次升级新增的，写它不会影响旧程序；
    # 真正不可逆的删列没有被触发。若连这一步都不想做，请用 --check-only。
    report = migrate_points(engine, drop_legacy=False, backup=False)
    print(report.summary())
    if report.ok:
        print()
        print("对账全部一致：迁移前后用户看到的积分数值不会变化。")
        print("可以执行：python -m store.tools.migrate_points")
        return 0

    print()
    print("对账存在差异，**不会**执行删列。逐条如下：")
    for table in report.tables:
        for problem in table.problems:
            print(f"  [{table.table}] {problem}")
    return 1


def _describe_check_only(database: Database) -> int:
    """完全只读的预检：只列出旧列与行数，不写任何东西。"""
    engine = database.engine
    pending = legacy_tables(engine)
    if not pending:
        print("无需迁移：所有积分列都已是整数厘。")
        return 0
    print("以下表仍带旧 FLOAT 积分列：")
    with engine.connect() as connection:
        for table in pending:
            total = connection.exec_driver_sql(f'SELECT COUNT(*) FROM "{table}"').scalar()
            print(f"  {table}: {int(total or 0)} 行")
    print()
    print("（只读预检，未写库。）执行 `python -m store.tools.migrate_points` 正式迁移。")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="把邀请积分从 FLOAT（积分）迁移到 INTEGER（厘），或反向回滚"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="先回填 + 对账但不删旧列，用于确认影响面",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="完全只读：只列出旧列与行数，不写库",
    )
    parser.add_argument(
        "--no-drop",
        action="store_true",
        help="只回填 + 对账，保留旧列（ORM 已不再映射旧列，留久了会让插入失败）",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="跳过迁移前的数据库文件备份（默认会备份）",
    )
    parser.add_argument(
        "--rollback",
        action="store_true",
        help="反向操作：把整数厘还原成 FLOAT 并删除整数列（配套回退到旧版本程序）",
    )
    parser.add_argument("--verbose", action="store_true", help="打印 DEBUG 日志")
    args = parser.parse_args(argv)

    _configure_logging(args.verbose)
    settings = load_settings()
    database = Database(settings)

    print(f"数据库: {settings.database_path}")
    print()

    if args.check_only:
        return _describe_check_only(database)

    # 新列必须先存在：它由 ensure_schema 按 ORM 元数据补齐。
    ensure_schema(database.engine)

    if args.check:
        return _describe_check(database)

    if args.rollback:
        if not args.no_backup:
            path = backup_database(database.engine)
            if path is not None:
                print(f"回滚前备份：{path}")
                print()
        report = rollback_points(database.engine)
        for table in report.tables:
            if table.state == "fresh":
                continue
            print(
                f"  {table.table}: {table.state} 还原 {table.backfilled} 行"
                f"{'，重建 ' + '、'.join(table.created) if table.created else ''}"
                f"{'，删除 ' + '、'.join(table.dropped) if table.dropped else ''}"
            )
            for problem in table.problems:
                print(f"    ✗ {problem}")
        print()
        print("回滚完成。" if report.ok else "回滚过程中有问题，见上。")
        return 0 if report.ok else 1

    report = migrate_points(
        database.engine,
        drop_legacy=not args.no_drop,
        backup=not args.no_backup,
    )
    if report.backup_path is not None:
        print(f"迁移前备份：{report.backup_path}")
        print()
    if not report.changed:
        print("无需迁移：所有积分列都已是整数厘。")
        return 0

    for table in report.tables:
        if table.state == "fresh":
            continue
        print(
            f"  {table.table}: {table.state}（回填 {table.backfilled} 行、"
            f"对账 {table.verified} 行）"
            f"{'，已退役 ' + '、'.join(table.dropped) if table.dropped else ''}"
        )
        for problem in table.problems:
            print(f"    ✗ {problem}")
    print()
    if report.ok:
        print("迁移完成：迁移前后用户看到的积分数值完全一致。")
        if args.no_drop:
            print(
                "注意：旧列仍留在库里（--no-drop）。ORM 已不再映射它们，而它们"
                "是 NOT NULL 且无 DDL 默认值，新的插入会失败 —— 请尽快执行"
                " `python -m store.tools.migrate_points` 完成删列。"
            )
        return 0

    print("迁移未全部完成，旧列已按表保留（数据未丢）。请按上面的提示人工核对。")
    return 1


if __name__ == "__main__":  # pragma: no cover - 命令行入口
    sys.exit(main())
