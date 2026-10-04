#!/usr/bin/env python3
"""库结构门禁：确认**迁移脚本、ORM 元数据、实际结构**三者一致。

为什么需要它：迁移脚本是手写的，ORM 是另一处手写的，两者很容易各自漂移 —— 而漂移的代价
不对称。漏一列时，本地全新库看起来一切正常（基线建的），存量部署却会在某次查询上炸掉；
反过来，迁移脚本里多写一列时，本地存量库看着正常，全新安装却少一列。这类问题不该留到
用户机器上才发现。

每个应用检查四件事（各自在子进程里跑：两个后端的顶层包名不同，但都会在
``Base.metadata`` 上注册模型，同进程检查会互相污染）：

1. **全新库**：从空库跑完整个迁移链，结构必须建得出来；
2. **脚本 vs ORM**：``alembic check`` 必须无差异（迁移脚本与元数据同源）；
3. **幂等**：再跑一次迁移必须不改变任何东西；
4. **结构自检**（商店）：``inspect_schema`` 必须报干净。

用法::

    python ops/check_schema.py            # 两个应用都查
    python ops/check_schema.py --app app  # 只查主应用
    python ops/check_schema.py --app store
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

APPS: dict[str, tuple[Path, str, str]] = {
    "app": (ROOT / "homeos-3d", "APP_DATA_DIR", "主应用"),
    "store": (ROOT / "homeos-store", "STORE_DATA_DIR", "授权商店"),
}

LAYOUT: dict[str, tuple[Path, str, str, Path]] = {
    "app": (ROOT / "homeos-3d", "backend.src", "backend.src.migrations", Path("migrations")),
    "store": (
        ROOT / "homeos-store" / "backend",
        "src",
        "src.core.migrations",
        Path("db") / "migrations",
    ),
}

KNOWN_DIVERGENCES: dict[str, frozenset[tuple[str, str]]] = {
    "app": frozenset(),
    "store": frozenset(),
}


def _fingerprint(database_path: Path) -> str:
    """库结构的指纹：把 sqlite_master 的定义与每张表的列都算进去。

    用来证明「再跑一次迁移什么都没改」—— 比对比 revision 更强，因为它能抓到
    「revision 没变、结构却被动了」这种情况。
    """
    with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
        master = connection.execute(
            "SELECT type, name, tbl_name, sql FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        ).fetchall()
        columns: list[tuple] = []
        for (kind, name, _tbl, _sql) in master:
            if kind != "table":
                continue
            for row in connection.execute("SELECT * FROM pragma_table_info(?)", (name,)):
                columns.append((name, row[1], row[2], row[3], row[4]))
    payload = repr((master, sorted(columns))).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:16]


def _check_one(app: str) -> int:
    """在**当前进程**里检查单个应用；由 :func:`main` 以子进程方式调用。"""
    _root, data_env, title = APPS[app]
    sys.path.insert(0, str(LAYOUT[app][0]))
    with tempfile.TemporaryDirectory(prefix=f"homeos-schema-{app}-") as temp_dir:
        os.environ[data_env] = temp_dir
        return _run_checks(app, title, data_env)


def _alembic_config(project_root: Path, script_dir: Path, database_url: str):
    """按仓库约定拼出 Alembic 配置。

    刻意**不**复用应用里的 ``_migration_config``：门禁的作用是独立验证应用的行为，
    调用被测方的私有实现会让两边一起错还一起通过。这里只用公开的 alembic API 与
    ``StoreSettings`` / ``Settings`` 上公开的路径字段。
    """
    from alembic.config import Config

    config = Config(str(project_root / "alembic.ini"))
    config.set_main_option("script_location", str(project_root / script_dir))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _alembic_diffs(config) -> list:
    """``alembic check`` 的等价实现，返回待生成的升级操作（空列表 = 一致）。

    为什么不直接用 ``command.check``：它只给出一句「有差异」。门禁需要**逐个** diff ——
    已确认的历史分歧要能精确放行，新增的分歧要能精确报出来（见 :data:`KNOWN_DIVERGENCES`）。
    这里重放的是 ``command.check`` 自己的流程，只用公开 API。
    """
    from alembic import autogenerate as autogen
    from alembic.runtime.environment import EnvironmentContext
    from alembic.script import ScriptDirectory

    script_directory = ScriptDirectory.from_config(config)
    revision_context = autogen.RevisionContext(
        config,
        script_directory,
        {
            "message": None,
            "autogenerate": True,
            "sql": False,
            "head": "head",
            "splice": False,
            "branch_label": None,
            "version_path": None,
            "rev_id": None,
            "depends_on": None,
        },
    )

    def retrieve_migrations(rev, context):
        revision_context.run_autogenerate(rev, context)
        return []

    with EnvironmentContext(
        config,
        script_directory,
        fn=retrieve_migrations,
        as_sql=False,
        template_args=revision_context.template_args,
        revision_context=revision_context,
    ):
        script_directory.run_env()

    migration_script = revision_context.generated_revisions[-1]
    diffs: list = []
    for upgrade_ops in migration_script.upgrade_ops_list:
        diffs.extend(upgrade_ops.as_diffs())
    return diffs


_ALLOWED_DIFF_KINDS = frozenset({"remove_column"})


def _describe_diff(diff) -> str:
    """把一条 diff 压成 ``操作 表.列`` 形态，用于打印。"""
    kind = diff[0] if diff else "?"
    table = diff[2] if len(diff) > 2 else "?"
    column = getattr(diff[3], "name", "") if len(diff) > 3 else ""
    described = f"{kind} {table}"
    return f"{described}.{column}" if column else described


def _unexpected_diffs(app: str, diffs: list) -> list:
    """挑出不在 :data:`KNOWN_DIVERGENCES` 里的 diff。"""
    allowed = KNOWN_DIVERGENCES[app]
    unexpected: list = []
    for diff in diffs:
        kind = diff[0] if diff else ""
        table = diff[2] if len(diff) > 2 else None
        column = getattr(diff[3], "name", None) if len(diff) > 3 else None
        if (
            kind in _ALLOWED_DIFF_KINDS
            and isinstance(table, str)
            and isinstance(column, str)
            and (table, column) in allowed
        ):
            continue
        unexpected.append(diff)
    return unexpected


def _divergence_note(allowed_hits: list) -> str:
    """放行项要在成功行里写出来，否则「这次放行了什么」只存在于源码里。"""
    if not allowed_hits:
        return ""
    listed = "、".join(sorted(_describe_diff(diff) for diff in allowed_hits))
    return f"（已放行 {len(allowed_hits)} 项已知历史分歧：{listed}）"


def _head_revision(app: str, project_root: Path, database_url: str) -> str:
    from alembic.script import ScriptDirectory

    return str(
        ScriptDirectory.from_config(
            _alembic_config(project_root, LAYOUT[app][3], database_url)
        ).get_current_head()
    )


def _recorded_revision(database_path: Path) -> str | None:
    """直接读 alembic_version，不经过应用的封装。"""
    with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='alembic_version'"
        ).fetchone()
        if exists is None:
            return None
        row = connection.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
    return str(row[0]) if row else None


def _structure_snapshot(database_path: Path) -> dict[str, dict]:
    """按语义口径取结构快照：表 → 列 / 外键 / 索引。

    刻意**不**比较 ``sqlite_master.sql`` 的原文：外键书写顺序、``PRIMARY KEY`` 摆在哪一行
    都是 SQLite 排版的结果，两种建库方式必然不同，比了只会误报。也别复用
    :func:`_fingerprint`：那个按原文哈希，作用恰恰是抓「同 revision 但结构被动过」。
    """
    tables: dict[str, dict] = {}
    with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
        names = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        for name in names:
            tables[name] = {
                "columns": sorted(
                    (row[1], (row[2] or "").upper(), row[3], row[4], row[5])
                    for row in connection.execute(f"PRAGMA table_info({name!r})")
                ),
                "foreign_keys": sorted(
                    (row[2], row[3], row[4], row[5], row[6])
                    for row in connection.execute(f"PRAGMA foreign_key_list({name!r})")
                ),
                "indexes": sorted(
                    (row[1], row[2], row[3])
                    for row in connection.execute(f"PRAGMA index_list({name!r})")
                ),
            }
    return tables


def _describe_structure_diff(left: dict, right: dict) -> str:
    """把两份语义快照的差异压成一小段文字，用于失败时的报错。"""
    lines: list[str] = []
    for table in sorted(set(left) | set(right)):
        if left.get(table) == right.get(table):
            continue
        if table not in left or table not in right:
            lines.append(f"只有{'迁移' if table in left else 'ORM 建库'}建出了表 {table}")
            continue
        for field, label in (("columns", "列"), ("foreign_keys", "外键"), ("indexes", "索引")):
            only_left = [item for item in left[table][field] if item not in right[table][field]]
            only_right = [item for item in right[table][field] if item not in left[table][field]]
            if only_left:
                lines.append(f"{table}.{label} 迁移独有：{only_left}")
            if only_right:
                lines.append(f"{table}.{label} ORM 建库独有：{only_right}")
    return "；".join(lines)


def _run_checks(app: str, title: str, data_env: str) -> int:
    project_root = APPS[app][0]
    prefix = LAYOUT[app][1]

    load_settings = importlib.import_module(f"{prefix}.config").load_settings
    migrations_module = importlib.import_module(LAYOUT[app][2])
    run_migrations = migrations_module.run_migrations

    settings = load_settings()
    database_path = settings.database_path
    database_url = settings.database_url
    failures: list[str] = []

    try:
        run_migrations(settings)
    except Exception as error:
        print(f"[{title}] ✗ 全新库迁移失败：{type(error).__name__}: {error}")
        return 1

    recorded = _recorded_revision(database_path)
    head = _head_revision(app, project_root, database_url)
    if recorded != head:
        failures.append(f"迁移结束后 revision 是 {recorded!r}，期望 head {head!r}")
    else:
        print(f"[{title}] ✓ 全新库迁移到 {recorded}")

    config = _alembic_config(project_root, LAYOUT[app][3], database_url)
    try:
        diffs = _alembic_diffs(config)
        unexpected = _unexpected_diffs(app, diffs)
        allowed_hits = [diff for diff in diffs if diff not in unexpected]
        if unexpected:
            failures.append(f"alembic check 检测到 {len(unexpected)} 项未建模差异：{unexpected}")
            print(f"[{title}] ✗ alembic check：仍有未建模的结构差异：{unexpected}")
        else:
            print(f"[{title}] ✓ alembic check：迁移脚本与 ORM 元数据一致{_divergence_note(allowed_hits)}")
    except Exception as error:
        failures.append(f"alembic check 报告差异：{error}")
        print(f"[{title}] ✗ alembic check：{error}")

    before = _fingerprint(database_path)
    run_migrations(settings)
    after = _fingerprint(database_path)
    if before != after:
        failures.append("重复执行迁移改动了库结构（迁移不是幂等的）")
        print(f"[{title}] ✗ 重复执行迁移改动了结构：{before} → {after}")
    else:
        print(f"[{title}] ✓ 重复执行迁移无副作用（结构指纹 {before}）")

    if app == "store":
        database = importlib.import_module(f"{prefix}.core.database").Database(settings)
        inspect_schema = importlib.import_module(f"{prefix}.security.schema_guard").inspect_schema

        drift = inspect_schema(database.engine)
        database.dispose()
        if not drift.clean:
            failures.append(f"结构自检报告差异：{drift.summary()}")
            print(f"[{title}] ✗ 结构自检：{drift.summary()}")
        else:
            print(f"[{title}] ✓ 结构自检：与 ORM 元数据一致")

    # 发行产物里没有迁移脚本，走的是「按 ORM 元数据直接建库」那条路（migrations.py 的
    # _create_schema）。两条路必须建出同一套结构 —— 否则开发期一切正常，装到用户机器上
    # 却少一张表。这里临时把脚本目录探测挡掉，让 run_migrations 走发行路径，再按语义
    # 口径逐表比对。（替换的是被测代码的分支开关，不是复用它的私有实现去核对结果。）
    original_script_dir = migrations_module._migrations_dir
    migrations_module._migrations_dir = lambda _settings: None  # pyright: ignore[reportAttributeAccessIssue]
    try:
        with tempfile.TemporaryDirectory(prefix=f"homeos-release-{app}-") as release_dir:
            os.environ[data_env] = release_dir
            release_settings = load_settings()
            run_migrations(release_settings)
            released = _structure_snapshot(release_settings.database_path)
    finally:
        migrations_module._migrations_dir = original_script_dir  # pyright: ignore[reportAttributeAccessIssue]
        os.environ[data_env] = str(database_path.parent)

    migrated = _structure_snapshot(database_path)
    if released != migrated:
        detail = _describe_structure_diff(migrated, released)
        failures.append(f"发行路径（ORM 建库）与迁移脚本结构不一致：{detail}")
        print(f"[{title}] ✗ 发行路径：与迁移脚本结构不一致：{detail}")
    else:
        print(f"[{title}] ✓ 发行路径（ORM 建库）与迁移脚本结构一致")

    if failures:
        print(f"[{title}] 共 {len(failures)} 项不一致")
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="库结构与迁移脚本的一致性门禁")
    parser.add_argument(
        "--app",
        choices=sorted(APPS),
        help="只检查某一个应用（内部用于把自己派生成子进程）",
    )
    arguments = parser.parse_args()

    if arguments.app:
        return _check_one(arguments.app)

    results: dict[str, int] = {}
    for app in sorted(APPS):
        print(f"\n===== {APPS[app][2]}（{app}）=====", flush=True)
        completed = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), "--app", app],
            cwd=str(APPS[app][0]),
            check=False,
        )
        results[app] = completed.returncode

    print()
    failed = [name for name, code in results.items() if code != 0]
    if failed:
        print(f"库结构门禁未通过：{', '.join(APPS[name][2] for name in failed)}")
        return 1
    print("库结构门禁通过：两个应用的迁移脚本与 ORM 元数据一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
