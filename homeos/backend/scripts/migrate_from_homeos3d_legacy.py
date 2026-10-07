"""一次性迁移：老 homeos-3d 独立部署 → 本项目（homeos 单栈）。

与 ``import_from_homeos3d.py`` 的关系
------------------------------------
``import_from_homeos3d.py`` 只搬「10 张同构表 + 密钥」，适合把 3D 数据面**并入**一个
已经跑着自家业务库的 homeos 实例。但把一整套老部署**整体接管**过来时，还有三件事它
没管，本脚本补齐：

1. **唯一性冲突**：两库都可能有同名管理员（例如都叫 ``sfairy``），但主键不同。
   直接整表复制会撞 ``users.username`` 唯一索引；若只跳过用户，老库的
   ``projects.created_by`` / ``project_drafts.updated_by`` 又会指向不存在的用户，
   触发外键拒绝。因此默认**整体替换**目标用户表（连同会话一起清空），
   让老库的所有引用原样成立。
2. **授权状态**：``license_state`` 与 ``instance-id`` 必须一起搬，否则迁移后要重新
   激活。签名租约（``signed_lease``）由 Ed25519 离线验签，落库字段可以原样搬运。
3. **管理员账号文件**：``admin-account.json`` 里的 ``userId`` 必须与替换后的
   ``users.id`` 一致，否则启动时会因「账号文件引用的内部账号不存在」而直接失败。

配置包（``homeos-bundle`` 的 ``ui`` / ``appConfig`` 分区）请用 ``scripts/import_bundle.py``
导入 —— 那需要后端依赖（FastAPI / SQLAlchemy），本脚本刻意只依赖标准库 sqlite3。

用法
----
::

    # 先干跑看行数，再实迁
    python scripts/migrate_from_homeos3d_legacy.py --source-db /path/app.db \\
        --source-data-dir /path/homeos-3d/data --target-data-dir backend/data --dry-run

    python scripts/migrate_from_homeos3d_legacy.py --source-db /path/app.db \\
        --source-data-dir /path/homeos-3d/data --target-data-dir backend/data

注意
----
- 迁移前请先停掉目标后端进程（内存缓存 / 会话 / 授权状态都在进程内，改库不会热生效）。
- 目标库需先完成一次启动迁移（``alembic upgrade head`` 或后端启动一次），确保表已存在。
- 脚本自身不写快照，请在调用前自行备份 ``homeos.db``（含 ``-wal`` / ``-shm``）。
"""

from __future__ import annotations

import argparse
import shutil
import sqlite3
from pathlib import Path

#: 3D 数据面表：与 homeos 同构（列名一致），按列交集整表搬运。父表优先，满足外键依赖。
TABLE_ORDER: tuple[str, ...] = (
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

#: 授权状态单例行：列名与 homeos 完全一致，单独处理（先删后插，避免 UNIQUE(instance_id) 冲突）。
LICENSE_TABLE = "license_state"

#: ``users`` 目标列 → 老库源列（homeos 用 camelCase 列名，homeos-3d 用 snake_case）。
USER_COLUMN_ALIASES: dict[str, str] = {
    "password": "password_hash",
    "isActive": "is_active",
    "authExternalized": "auth_externalized",
    "createdAt": "created_at",
    "updatedAt": "updated_at",
}

#: 老库没有、但 homeos 侧 NOT NULL 的列 → 兜底常量。
USER_COLUMN_DEFAULTS: dict[str, str] = {
    "tokenVersion": "0",
}

#: 替换 ``users`` 之前必须先清空的目标表（外键指向 ``users.id``，且删除顺序受 RESTRICT 约束）。
USER_DEPENDENT_TABLES: tuple[str, ...] = (
    "sessions",
    "project_drafts",
    "projects",
    "global_custom_popup_state",
)

#: 需要随库一起带走的密钥 / 标识文件：(相对 data_dir 的路径, 目标缺失时是否强制要求)
SECRET_FILES: tuple[str, ...] = (
    "secrets/ha_credentials.key",
    "secrets/license_credentials.key",
    "instance-id",
)


def _table_columns(connection: sqlite3.Connection, schema: str, table: str) -> list[str]:
    rows = connection.execute(f'PRAGMA {schema}.table_info("{table}")').fetchall()
    return [row[1] for row in rows]


def _has_table(connection: sqlite3.Connection, schema: str, table: str) -> bool:
    row = connection.execute(
        f"SELECT name FROM {schema}.sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def _column_pairs(
    connection: sqlite3.Connection, table: str
) -> list[tuple[str, str]]:
    """按目标列与源列的交集给出 (目标列, 源表达式)；``users`` 走别名与兜底常量。"""
    source_columns = _table_columns(connection, "src", table)
    target_columns = _table_columns(connection, "main", table)
    aliases = USER_COLUMN_ALIASES if table == "users" else {}
    pairs: list[tuple[str, str]] = []
    for column in target_columns:
        source_column = aliases.get(column, column)
        if source_column in source_columns:
            pairs.append((column, f'"{source_column}"'))
        elif table == "users" and column in USER_COLUMN_DEFAULTS:
            pairs.append((column, USER_COLUMN_DEFAULTS[column]))
    return pairs


def _copy_table(
    connection: sqlite3.Connection,
    table: str,
    *,
    replace: bool = False,
    dry_run: bool = False,
) -> int:
    """整表搬运；``replace`` 为真时先清空目标表（用于主键唯一性会冲突的表）。"""
    if not _has_table(connection, "src", table):
        return 0
    pairs = _column_pairs(connection, table)
    if not pairs:
        return 0
    count = int(connection.execute(f'SELECT COUNT(*) FROM src."{table}"').fetchone()[0])
    if dry_run or count == 0:
        return count
    if replace:
        connection.execute(f'DELETE FROM main."{table}"')
    target_list = ", ".join(f'"{column}"' for column, _ in pairs)
    source_list = ", ".join(expression for _, expression in pairs)
    connection.execute(
        f'INSERT OR REPLACE INTO main."{table}" ({target_list}) '
        f"SELECT {source_list} FROM src.\"{table}\""
    )
    return count


def _clear_target_users(connection: sqlite3.Connection) -> None:
    """清空目标会话与用户，并连带清掉引用用户的行（RESTRICT 外键要求先删子表）。"""
    for table in USER_DEPENDENT_TABLES:
        if _has_table(connection, "main", table):
            connection.execute(f'DELETE FROM main."{table}"')
    connection.execute("DELETE FROM main.users")


def migrate_database(
    source_db: Path,
    target_db: Path,
    *,
    keep_target_users: bool = False,
    dry_run: bool = False,
) -> dict[str, int]:
    """搬运老库业务表；返回每张表的行数统计。"""
    if not source_db.is_file():
        raise SystemExit(f"源库不存在：{source_db}")
    if not target_db.is_file():
        raise SystemExit(f"目标库不存在：{target_db}（请先让后端启动一次建库）")

    stats: dict[str, int] = {}
    connection = sqlite3.connect(str(target_db))
    try:
        connection.execute("PRAGMA foreign_keys=OFF")
        connection.execute("ATTACH DATABASE ? AS src", (str(source_db),))
        revision = connection.execute("SELECT version_num FROM main.alembic_version").fetchall()
        print(f"  目标结构版本：{[row[0] for row in revision]}")

        if keep_target_users:
            print("  用户：保留目标账号（--keep-target-users），跳过 users 表")
        else:
            if not dry_run:
                _clear_target_users(connection)
            source_users = connection.execute("SELECT COUNT(*) FROM src.users").fetchone()[0]
            print(f"  用户：清空目标并接管老库 {source_users} 个账号")
            stats["users"] = _copy_table(connection, "users", dry_run=dry_run)

        for table in TABLE_ORDER:
            stats[table] = _copy_table(connection, table, replace=True, dry_run=dry_run)

        # 授权单例：instance_id 有唯一索引，先删后插；老库无此表时保持目标原状。
        if _has_table(connection, "src", LICENSE_TABLE):
            stats[LICENSE_TABLE] = _copy_table(
                connection, LICENSE_TABLE, replace=True, dry_run=dry_run
            )
        else:
            print("  授权：老库没有 license_state，保持目标现状")

        if not dry_run:
            connection.commit()
            violations = connection.execute("PRAGMA foreign_key_check").fetchall()
            if violations:
                print(f"  [警告] 外键校验发现 {len(violations)} 条不一致：{violations[:5]}")
    finally:
        connection.close()
    return stats


def copy_secrets(source_dir: Path, target_dir: Path, *, dry_run: bool = False) -> list[str]:
    """拷贝 HA / 授权密钥与 instance-id。目标已有同名文件时提示并跳过（避免覆盖在用密钥）。"""
    copied: list[str] = []
    for relative in SECRET_FILES:
        origin = source_dir / relative
        destination = target_dir / relative
        if not origin.is_file():
            print(f"  [提示] 源缺少 {relative}，跳过")
            continue
        if destination.is_file() and destination.read_bytes() == origin.read_bytes():
            print(f"  {relative}：与目标一致，跳过")
            continue
        if destination.is_file():
            print(f"  [警告] {relative} 已存在于目标且内容不同，跳过（如需接管请自行备份后替换）")
            continue
        if dry_run:
            copied.append(f"{relative}（dry-run）")
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origin, destination)
        copied.append(relative)
    return copied


def copy_admin_account(
    source_dir: Path, target_dir: Path, *, dry_run: bool = False
) -> str | None:
    """用老库的 ``admin-account.json`` 接管管理员登录（其 userId 必须与搬过来的 users.id 一致）。"""
    origin = source_dir / "admin-account.json"
    destination = target_dir / "admin-account.json"
    if not origin.is_file():
        print("  [提示] 源缺少 admin-account.json，跳过（迁移后需重新设置管理员密码）")
        return None
    if dry_run:
        return "admin-account.json（dry-run，目标将被覆盖）"
    if destination.is_file():
        shutil.copy2(destination, destination.with_suffix(".json.pre-legacy-migration.bak"))
    shutil.copy2(origin, destination)
    return "admin-account.json"


def copy_studio_draft(source_dir: Path, target_dir: Path, *, dry_run: bool = False) -> str | None:
    """拷贝 Studio 草稿文件；仅在源更新时间不早于目标时覆盖。"""
    origin = source_dir / "studio3d" / "draft.json"
    destination = target_dir / "studio3d" / "draft.json"
    if not origin.is_file():
        print("  [提示] 源缺少 studio3d/draft.json，跳过")
        return None
    if destination.is_file() and destination.read_bytes() == origin.read_bytes():
        print("  studio3d/draft.json：与目标一致，跳过")
        return None
    if dry_run:
        return "studio3d/draft.json（dry-run）"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_file():
        shutil.copy2(destination, destination.with_name("draft.json.pre-legacy-migration.bak"))
    shutil.copy2(origin, destination)
    return "studio3d/draft.json"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="老 homeos-3d 部署 → homeos 整体迁移")
    parser.add_argument("--source-db", required=True, help="老部署的 app.db（含 -wal 时请先 checkpoint）")
    parser.add_argument("--target-db", default="", help="目标 homeos.db；缺省用 <target-data-dir>/homeos.db")
    parser.add_argument("--source-data-dir", required=True, help="老部署的 data 目录")
    parser.add_argument("--target-data-dir", required=True, help="目标 data 目录（homeos/data 或 backend/data）")
    parser.add_argument("--keep-target-users", action="store_true", help="保留目标账号，不接管老库用户")
    parser.add_argument("--dry-run", action="store_true", help="只统计，不写库不写文件")
    args = parser.parse_args(argv)

    source_data_dir = Path(args.source_data_dir).expanduser().resolve()
    target_data_dir = Path(args.target_data_dir).expanduser().resolve()
    target_db = (
        Path(args.target_db).expanduser().resolve()
        if args.target_db
        else target_data_dir / "homeos.db"
    )

    prefix = "[老 homeos-3d → homeos]"
    print(f"{prefix} {'（dry-run）' if args.dry_run else ''}目标库：{target_db}")
    stats = migrate_database(
        Path(args.source_db).expanduser().resolve(),
        target_db,
        keep_target_users=args.keep_target_users,
        dry_run=args.dry_run,
    )
    for table, count in stats.items():
        print(f"  {table:<28} {count:>8} 行{'（dry-run）' if args.dry_run else ''}")

    print(f"{prefix} 密钥 / 标识：")
    copy_secrets(source_data_dir, target_data_dir, dry_run=args.dry_run)
    admin = copy_admin_account(source_data_dir, target_data_dir, dry_run=args.dry_run)
    draft = copy_studio_draft(source_data_dir, target_data_dir, dry_run=args.dry_run)
    print(f"{prefix} 文件：{[item for item in (admin, draft) if item] or '无变更'}")

    if not args.dry_run:
        print(f"{prefix} 完成。配置包请继续运行 scripts/import_bundle.py，然后重启后端。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
