#!/usr/bin/env python3
"""把「库结构与 ORM 模型」逐项比对；一致才允许把 ``schema_migrations`` 重置为基线。

## 为什么需要它

两个后端的迁移链都已塌缩成 1 条基线（见 ``platform/core/db/migrations.py`` 与
``core/persistence/migrations.py`` 的说明），旧库会因为「记录的版本 2–27 在当前代码中
不存在」或者「根本没有版本记录」而拒绝启动。正确的一次性动作是：**先证明库结构与
当前模型一致**，再把版本表重置为基线。

反过来做（先重置、后启动）会把一个真的缺列 / 多索引 / 类型不符的库伪装成「最新版本」：
启动成功、运行期才在某个查询上炸，而且从此没有任何东西会提醒你结构已经偏了。

## 比对口径

1. **表**：模型有而库没有 → 失败；库有而模型没有 → 警告（可能是已废弃表）；
2. **列**：模型声明而库里缺 → 失败；库里有而模型没声明 → 警告（旧残留列）；
3. **索引**：模型声明的索引名必须存在 → 缺失失败；``sqlite_autoindex_*`` 不参与；
4. **可空性**：模型 ``nullable=False`` 而库里列可空 → 警告（SQLite 无法 ALTER 收紧，
   需要重建表，属独立议题）。

严格模式（``--strict``）把警告也当失败，用于发版前自查。

## 用法

```bash
node ops/lib/py.mjs ops/scripts/reset-schema-version.py --app homeos --dry-run
node ops/lib/py.mjs ops/scripts/reset-schema-version.py --app store --dry-run
node ops/lib/py.mjs ops/scripts/reset-schema-version.py --app all              # 两个库都重置
node ops/lib/py.mjs ops/scripts/reset-schema-version.py --app all --strict     # 警告也算不通过
```
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

MIGRATIONS_TABLE = "schema_migrations"

#: 不属于业务的框架表：SQLite 自己的记录 + 迁移版本表。比对时忽略，避免噪音。
FRAMEWORK_TABLES = frozenset({MIGRATIONS_TABLE, "sqlite_sequence"})


@dataclass(frozen=True)
class AppTarget:
    """一个后端：库文件、ORM 元数据入口、基线常量入口。"""

    name: str
    default_db: Path
    #: 导入时额外塞进 ``sys.path`` 的目录（商店目录名带连字符，只能用 ``src`` 包名导入）。
    sys_path: Path | None
    metadata_module: str
    baseline_module: str
    app_key: str


TARGETS: dict[str, AppTarget] = {
    "homeos": AppTarget(
        name="homeos",
        default_db=ROOT / "homeos" / "data" / "homeos.db",
        sys_path=None,
        metadata_module="homeos.backend.src.db_models",
        baseline_module="homeos.backend.src.platform.core.db.migrations",
        app_key="homeos",
    ),
    "store": AppTarget(
        name="store",
        default_db=ROOT / "homeos-store" / "data" / "store.db",
        sys_path=ROOT / "homeos-store" / "backend",
        metadata_module="src.core.persistence.schema",
        baseline_module="src.core.persistence.migrations",
        app_key="store",
    ),
}


def _import(module_name: str, sys_path: Path | None):
    """按目标导入模块；商店要用 ``homeos-store/backend`` 当包根。"""
    if sys_path is not None and str(sys_path) not in sys.path:
        sys.path.insert(0, str(sys_path))
    return __import__(module_name, fromlist=["*"])


def _models(target: AppTarget) -> dict[str, object]:
    """{表名: Table}，来自 ORM 元数据（导入模型模块即注册）。"""
    module = _import(target.metadata_module, target.sys_path)
    metadata = module.main_metadata()
    return {table.name: table for table in metadata.tables.values()}


def _baseline(target: AppTarget) -> tuple[int, str, str]:
    module = _import(target.baseline_module, target.sys_path)
    return int(module.BASELINE_VERSION), str(module.BASELINE_NAME), str(module.BASELINE_CHECKSUM)


def _db_schema(connection: sqlite3.Connection) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    from homeos_shared.sqlite_schema import table_columns, table_indexes

    return table_columns(connection), table_indexes(connection)


def compare(target: AppTarget, db: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    models = _models(target)
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as connection:
        columns, indexes = _db_schema(connection)

    # 1) 表
    for name in sorted(set(models) - {n for n in columns if n not in FRAMEWORK_TABLES}):
        if name not in columns:
            errors.append(f"缺表：{name}（模型里有，库里没有）")
    for name in sorted(set(columns) - set(models) - FRAMEWORK_TABLES):
        warnings.append(f"多余表：{name}（库里没有对应模型）")

    for name in sorted(set(models) & set(columns)):
        table = models[name]
        model_columns = {column.name for column in table.columns}
        # 2) 列
        for column in sorted(model_columns - columns[name]):
            errors.append(f"{name}: 缺列 {column}")
        for column in sorted(columns[name] - model_columns):
            warnings.append(f"{name}: 多余列 {column}")
        # 3) 索引
        model_indexes = {index.name for index in table.indexes if index.name}
        for index in sorted(model_indexes - indexes.get(name, set())):
            errors.append(f"{name}: 缺索引 {index}")
    return errors, warnings


def _pragma(connection: sqlite3.Connection, table: str) -> list[tuple]:
    return connection.execute(f'PRAGMA table_info("{table}")').fetchall()


def nullable_warnings(target: AppTarget, db: Path) -> list[str]:
    """模型 ``nullable=False`` 而库里可空的列（需要重建表才能收紧，只报告不阻断）。"""
    warnings: list[str] = []
    models = _models(target)
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as connection:
        for name in sorted(models):
            table = models[name]
            rows = {str(row[1]): row for row in _pragma(connection, name)}
            for column in table.columns:
                row = rows.get(column.name)
                if row is None or column.primary_key:
                    continue
                db_nullable = int(row[3]) == 0  # PRAGMA table_info: notnull=0 表示可空
                if column.nullable is False and db_nullable:
                    warnings.append(f"{name}.{column.name}: 模型 NOT NULL，库里可空")
    return warnings


def reset_version_table(target: AppTarget, db: Path) -> list[int]:
    """把 ``schema_migrations`` 重置为基线一行；返回变更前的版本列表（供审计）。"""
    version, name, checksum = _baseline(target)
    app = target.app_key
    with sqlite3.connect(db, isolation_level=None) as connection:
        connection.execute("PRAGMA busy_timeout=5000")
        connection.execute(
            f"CREATE TABLE IF NOT EXISTS {MIGRATIONS_TABLE} ("
            "app TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, "
            "checksum TEXT NOT NULL, applied_at TEXT NOT NULL, duration_ms INTEGER NOT NULL, "
            "PRIMARY KEY (app, version))"
        )
        existing = [
            int(row[0])
            for row in connection.execute(
                f"SELECT version FROM {MIGRATIONS_TABLE} WHERE app = ? ORDER BY version",  # noqa: S608
                (app,),
            )
        ]
        connection.execute("BEGIN IMMEDIATE")
        try:
            connection.execute(f"DELETE FROM {MIGRATIONS_TABLE} WHERE app = ?", (app,))  # noqa: S608
            connection.execute(
                f"INSERT INTO {MIGRATIONS_TABLE} "  # noqa: S608
                "(app, version, name, checksum, applied_at, duration_ms) VALUES (?, ?, ?, ?, ?, 0)",
                (app, version, name, checksum, _iso_now()),
            )
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
    return existing


def orphan_tables(target: AppTarget, db: Path) -> list[str]:
    """库里有、模型里没有的业务表（框架表除外）。"""
    models = set(_models(target))
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as connection:
        tables = {
            str(row[0])
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
    return sorted(tables - models - FRAMEWORK_TABLES)


def drop_orphan_tables(target: AppTarget, db: Path) -> list[str]:
    """删除孤儿表，但**只删空表**：有数据的孤儿表必须人工确认（可能是漏迁的模型）。"""
    dropped: list[str] = []
    with sqlite3.connect(db, isolation_level=None) as connection:
        connection.execute("PRAGMA busy_timeout=5000")
        for name in orphan_tables(target, db):
            count = int(connection.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0])  # noqa: S608
            if count:
                print(f"  SKIP  {name}：有 {count} 行数据，需人工确认后再删", file=sys.stderr)
                continue
            connection.execute(f'DROP TABLE IF EXISTS "{name}"')
            dropped.append(name)
    return dropped


def orphan_columns(target: AppTarget, db: Path) -> list[tuple[str, str]]:
    """``(表, 列)``：库里存在、模型没声明的列。"""
    models = _models(target)
    result: list[tuple[str, str]] = []
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as connection:
        for table, columns in _db_schema(connection)[0].items():
            if table not in models or table in FRAMEWORK_TABLES:
                continue
            declared = {column.name for column in models[table].columns}
            for column in sorted(columns - declared):
                result.append((table, column))
    return result


def drop_empty_orphan_columns(target: AppTarget, db: Path) -> tuple[list[str], list[str]]:
    """删除孤儿列，但**只删全为 NULL 的列**。

    有值的孤儿列说明它承载过数据，可能是漏了模型声明；SQLite 的 ``DROP COLUMN``
    不可逆，宁可留着报 WARN 也不自动抹掉。返回 ``(已删除, 因有值而跳过)``。
    """
    dropped: list[str] = []
    skipped: list[str] = []
    with sqlite3.connect(db, isolation_level=None) as connection:
        connection.execute("PRAGMA busy_timeout=5000")
        for table, column in orphan_columns(target, db):
            label = f"{table}.{column}"
            rows = connection.execute(
                f'SELECT COUNT(*) FROM "{table}" WHERE "{column}" IS NOT NULL'  # noqa: S608
            ).fetchone()[0]
            if int(rows):
                skipped.append(label)
                print(f"  SKIP  {label}：有 {rows} 行非空值，需人工确认后再删", file=sys.stderr)
                continue
            connection.execute(f'ALTER TABLE "{table}" DROP COLUMN "{column}"')
            dropped.append(label)
    return dropped, skipped


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


def _run_one(
    target: AppTarget,
    db: Path,
    *,
    strict: bool,
    dry_run: bool,
    drop_orphans: bool,
    drop_columns: bool,
) -> int:
    if not db.is_file():
        print(f"[{target.name}] 数据库不存在：{db}", file=sys.stderr)
        return 2

    errors, warnings = compare(target, db)
    warnings += nullable_warnings(target, db)

    print(f"[{target.name}] 库：{db}")
    print(f"[{target.name}] 结构比对：{len(errors)} 处不一致、{len(warnings)} 处提示")
    for line in errors:
        print(f"  FAIL  {line}")
    for line in warnings:
        print(f"  WARN  {line}")

    if errors or (strict and warnings):
        if errors or not drop_columns:
            print()
            print(
                f"[{target.name}] 结构未对齐，拒绝重置版本表。"
                "先补模型或补数据（见 ops/checks 的结构守卫）；孤儿列可加 --drop-orphan-columns 清理。"
            )
            return 1

    if dry_run:
        print(f"[{target.name}] dry-run：结构与模型一致，可以重置。去掉 --dry-run 执行。")
        return 0

    if drop_orphans:
        dropped = drop_orphan_tables(target, db)
        print(f"[{target.name}] 已删除空孤儿表：{dropped or '无'}")

    if drop_columns:
        removed, skipped = drop_empty_orphan_columns(target, db)
        print(f"[{target.name}] 已删除全空孤儿列：{removed or '无'}")
        if skipped:
            print(f"[{target.name}] 仍有存量的孤儿列，未删除：{skipped}")
            return 1
        if removed:
            # 列变了就得重新比对：删列之后才敢说「结构一致」。
            errors, warnings = compare(target, db)
            warnings += nullable_warnings(target, db)
            if errors or (strict and warnings):
                print(f"[{target.name}] 删列后仍有 {len(errors)} 处不一致，拒绝重置版本表。")
                return 1

    version, _, _ = _baseline(target)
    previous = reset_version_table(target, db)
    print(f"[{target.name}] 已重置 schema_migrations：{previous or ['(空)']} → 基线（version {version}）")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--app", choices=[*TARGETS, "all"], default="homeos", help="要处理的数据库（默认 homeos）")
    parser.add_argument("--db", type=Path, help="覆盖库路径；只在 --app 不是 all 时有意义")
    parser.add_argument("--dry-run", action="store_true", help="只比对，不改库")
    parser.add_argument("--strict", action="store_true", help="警告也算不通过")
    parser.add_argument(
        "--drop-orphans",
        action="store_true",
        help="顺带删除「库里没有模型」的空孤儿表（有数据的只报告不删）",
    )
    parser.add_argument(
        "--drop-orphan-columns",
        action="store_true",
        help="顺带删除「模型没声明且全为 NULL」的孤儿列（有值的只报告不删）",
    )
    args = parser.parse_args()

    if args.app == "all":
        if args.db is not None:
            parser.error("--db 不能与 --app all 一起用")
        targets = list(TARGETS.values())
    else:
        targets = [TARGETS[args.app]]

    exit_code = 0
    for index, target in enumerate(targets):
        db = args.db if args.db is not None else target.default_db
        if index:
            print()
        code = _run_one(
            target,
            db,
            strict=args.strict,
            dry_run=args.dry_run,
            drop_orphans=args.drop_orphans,
            drop_columns=args.drop_orphan_columns,
        )
        exit_code = exit_code or code
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
