"""一次性数据搬运：homeos-3d（SQLite）→ homeos（SQLite）。

用途
----
本项目已把 homeos-3d 的 3D 数据面并入 homeos：10 张表（``projects`` / ``project_drafts`` /
``ha_connections`` / ``ha_entities`` / ``ha_devices`` / ``ha_areas`` / ``ha_sync_state`` /
``studio_interaction_sync`` / ``global_custom_popup_state``）是**同源代码**，列结构一致，
可按列交集整表搬运。

唯一的异构表是 ``users``：

- homeos-3d：``password_hash`` / ``is_active`` / ``auth_externalized`` / ``created_at`` /
  ``updated_at``（snake_case，argon2id 或 bcrypt 哈希）；
- homeos：``password`` / ``isActive`` / ``authExternalized`` / ``createdAt`` / ``updatedAt``
  （camelCase）。homeos 的密码校验已兼容 argon2id 与 bcrypt（登录时自动升级），因此哈希
  可原样搬运。

除数据库外，还需带上密钥文件，否则既有的 HA 访问令牌无法解密：

- ``secrets_dir/ha_credentials.key``（HA 令牌 Fernet 密钥）
- ``secrets_dir/license_credentials.key``（授权凭证密钥）
- ``data_dir/instance-id``（实例标识，授权与遥测依赖）

用法
----
::

    python scripts/import_from_homeos3d.py \
        --source /path/to/homeos-3d/data/app.db \
        --target /path/to/homeos/backend/data/app.db \
        --source-dir /path/to/homeos-3d/data \
        --target-dir /path/to/homeos/backend/data \
        [--tables users,projects] [--truncate] [--dry-run] [--skip-users] [--no-secrets]

注意
----
- 目标库需先完成一次启动迁移（``alembic upgrade head`` 或后端启动一次），确保表已存在。
- 默认按主键 upsert（``INSERT OR REPLACE``，重复主键覆盖）；``--truncate`` 会先清空目标表。
- 搬运 ``users`` 会与 homeos 既有账号按主键/用户名合并；如不想带 3D 账号，用 ``--skip-users``。
"""

from __future__ import annotations

import argparse
import shutil
import sqlite3
from pathlib import Path

#: 搬运顺序（父表优先，满足外键依赖）
TABLE_ORDER: tuple[str, ...] = (
    "users",
    "ha_connections",
    "ha_areas",
    "ha_devices",
    "ha_entities",
    "ha_sync_state",
    "projects",
    "project_drafts",
    "studio_interaction_sync",
    "global_custom_popup_state",
)

#: ``users`` 目标列 → 3D 源列（其余同名列直接对应）
USER_COLUMN_ALIASES: dict[str, str] = {
    "password": "password_hash",
    "isActive": "is_active",
    "authExternalized": "auth_externalized",
    "createdAt": "created_at",
    "updatedAt": "updated_at",
}

#: 3D 源库没有、但 homeos 侧 NOT NULL 的列 → 兜底常量
USER_COLUMN_DEFAULTS: dict[str, int] = {
    "tokenVersion": 0,
}

#: 需要随库搬运的密钥/标识文件：(相对目录属性, 文件名)
SECRET_FILES: tuple[tuple[str, str], ...] = (
    ("secrets", "ha_credentials.key"),
    ("secrets", "license_credentials.key"),
    ("root", "instance-id"),
)


def _table_info(connection: sqlite3.Connection, schema: str, table: str) -> list[str]:
    rows = connection.execute(f'PRAGMA {schema}.table_info("{table}")').fetchall()
    return [row[1] for row in rows]


def _has_table(connection: sqlite3.Connection, schema: str, table: str) -> bool:
    row = connection.execute(
        f"SELECT name FROM {schema}.sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def copy_table(
    connection: sqlite3.Connection,
    table: str,
    *,
    truncate: bool = False,
    dry_run: bool = False,
) -> int | None:
    """按目标列与源列的交集整表搬运；源库缺表返回 ``None``。"""
    if not _has_table(connection, "src", table):
        return None
    source_columns = _table_info(connection, "src", table)
    target_columns = _table_info(connection, "main", table)
    aliases = USER_COLUMN_ALIASES if table == "users" else {}
    pairs: list[tuple[str, str]] = []
    for column in target_columns:
        source_column = aliases.get(column, column)
        if source_column in source_columns:
            pairs.append((column, f'"{source_column}"'))
        elif table == "users" and column in USER_COLUMN_DEFAULTS:
            pairs.append((column, str(int(USER_COLUMN_DEFAULTS[column]))))
    if not pairs:
        return 0
    count = int(connection.execute(f'SELECT COUNT(*) FROM src."{table}"').fetchone()[0])
    if dry_run or count == 0:
        return count
    if truncate:
        connection.execute(f'DELETE FROM main."{table}"')
    target_list = ", ".join(f'"{column}"' for column, _ in pairs)
    source_list = ", ".join(expression for _, expression in pairs)
    connection.execute(
        f'INSERT OR REPLACE INTO main."{table}" ({target_list}) '
        f'SELECT {source_list} FROM src."{table}"'
    )
    return count


def migrate(
    source: str | Path,
    target: str | Path,
    *,
    tables: list[str] | None = None,
    truncate: bool = False,
    dry_run: bool = False,
    skip_users: bool = False,
) -> dict[str, int | None]:
    """执行搬运，返回每张表的行数统计（源库缺表记 ``None``）。"""
    source_path = Path(source)
    if not source_path.exists():
        raise SystemExit(f"源库不存在：{source_path}")
    selected = list(tables or TABLE_ORDER)
    if skip_users and "users" in selected:
        selected.remove("users")
    unknown = [t for t in selected if t not in TABLE_ORDER]
    if unknown:
        raise SystemExit(f"未知表：{unknown}（仅支持：{list(TABLE_ORDER)}）")

    connection = sqlite3.connect(str(target))
    try:
        connection.execute("PRAGMA foreign_keys=OFF")
        connection.execute("ATTACH DATABASE ? AS src", (str(source_path),))
        missing = [t for t in selected if not _has_table(connection, "src", t)]
        stats: dict[str, int | None] = {}
        for table in selected:
            count = copy_table(connection, table, truncate=truncate, dry_run=dry_run)
            stats[table] = count
            if count is None:
                print(f"  {table:<28} —— 源库缺表，跳过")
            else:
                print(f"  {table:<28} {count:>8} 行{'（dry-run）' if dry_run else ''}")
        if not dry_run:
            if missing:
                print(f"  [提示] 源库缺少 {len(missing)} 张表：{missing}")
            connection.commit()
            violations = connection.execute("PRAGMA foreign_key_check").fetchall()
            if violations:
                print(f"  [警告] 外键校验发现 {len(violations)} 条不一致（可能需要连同父表一起搬运）")
    finally:
        connection.close()
    return stats


def copy_secrets(
    source_dir: str | Path,
    target_dir: str | Path,
    *,
    dry_run: bool = False,
) -> list[str]:
    """拷贝 HA/展示配对/授权密钥与 instance-id；文件不存在则跳过。"""
    source_root = Path(source_dir)
    target_root = Path(target_dir)
    copied: list[str] = []
    for kind, name in SECRET_FILES:
        if kind == "secrets":
            origin = source_root / "secrets" / name
            relative = Path("secrets") / name
        else:
            origin = source_root / name
            relative = Path(name)
        if not origin.exists():
            continue
        destination = target_root / relative
        if dry_run:
            copied.append(f"{relative}（dry-run）")
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origin, destination)
        copied.append(str(relative))
    return copied


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="homeos-3d(SQLite) → homeos(SQLite) 数据搬运")
    parser.add_argument("--source", required=True, help="源 SQLite 数据库（homeos-3d app.db）")
    parser.add_argument("--target", required=True, help="目标 SQLite 数据库（homeos app.db）")
    parser.add_argument("--tables", default="", help="逗号分隔的表名；缺省全部")
    parser.add_argument("--truncate", action="store_true", help="搬运前先清空目标表")
    parser.add_argument("--dry-run", action="store_true", help="仅统计行数，不写库")
    parser.add_argument("--skip-users", action="store_true", help="不搬运 3D 的 users 表")
    parser.add_argument("--source-dir", default="", help="源数据目录（用于拷贝密钥/instance-id）")
    parser.add_argument("--target-dir", default="", help="目标数据目录")
    parser.add_argument("--no-secrets", action="store_true", help="不拷贝密钥文件")
    args = parser.parse_args(argv)

    tables = [t.strip() for t in args.tables.split(",") if t.strip()] or None
    print(f"[homeos-3d→homeos] {'（dry-run）' if args.dry_run else ''}目标库：{args.target}")
    stats = migrate(
        args.source,
        args.target,
        tables=tables,
        truncate=args.truncate,
        dry_run=args.dry_run,
        skip_users=args.skip_users,
    )
    counted = sum(v for v in stats.values() if v)
    print(f"[homeos-3d→homeos] 完成：{len(stats)} 张表，合计 {counted} 行")

    if not args.no_secrets and args.source_dir and args.target_dir:
        copied = copy_secrets(args.source_dir, args.target_dir, dry_run=args.dry_run)
        print(f"[homeos-3d→homeos] 密钥/标识：{copied or '无（未找到可拷贝文件）'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
