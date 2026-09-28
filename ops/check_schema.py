#!/usr/bin/env python3
"""库结构门禁：确认**迁移脚本、ORM 元数据、实际结构**三者一致。

为什么需要它：迁移脚本是手写的，ORM 是另一处手写的，两者很容易各自漂移 —— 而漂移的代价
不对称。漏一列时，本地全新库看起来一切正常（基线建的），存量部署却会在某次查询上炸掉；
反过来，迁移脚本里多写一列时，本地存量库看着正常，全新安装却少一列。这类问题不该留到
用户机器上才发现。

每个应用检查四件事（各自在子进程里跑，因为两个后端都用 ``src`` 这个包名，同进程会撞车）：

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
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

#: ``名称 → (应用根目录, 后端目录, 数据目录环境变量, 中文名)``。
APPS: dict[str, tuple[Path, Path, str, str]] = {
    "app": (ROOT / "homeos-3d", ROOT / "homeos-3d" / "backend", "APP_DATA_DIR", "主应用"),
    "store": (ROOT / "homeos-store", ROOT / "homeos-store" / "backend", "STORE_DATA_DIR", "授权商店"),
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
            # 表名走参数绑定，不拼进 SQL：这张表的名单来自 sqlite_master，但仍然不该
            # 让「标识符拼接」成为一个可以被引用的先例。
            for row in connection.execute("SELECT * FROM pragma_table_info(?)", (name,)):
                columns.append((name, row[1], row[2], row[3], row[4]))
    payload = repr((master, sorted(columns))).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:16]


def _check_one(app: str) -> int:
    """在**当前进程**里检查单个应用；由 :func:`main` 以子进程方式调用。"""
    _project_root, backend, data_env, title = APPS[app]
    sys.path.insert(0, str(backend))
    # 必须在 import 应用模块之前设好，配置是在 import 时从环境装配的。
    with tempfile.TemporaryDirectory(prefix=f"homeos-schema-{app}-") as temp_dir:
        os.environ[data_env] = temp_dir
        return _run_checks(app, title)


def _alembic_config(project_root: Path, database_url: str):
    """按仓库约定拼出 Alembic 配置。

    刻意**不**复用应用里的 ``_migration_config``：门禁的作用是独立验证应用的行为，
    调用被测方的私有实现会让两边一起错还一起通过。这里只用公开的 alembic API 与
    ``StoreSettings`` / ``Settings`` 上公开的路径字段。
    """
    from alembic.config import Config

    config = Config(str(project_root / "alembic.ini"))
    config.set_main_option("script_location", str(project_root / "db" / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _head_revision(project_root: Path, database_url: str) -> str:
    from alembic.script import ScriptDirectory

    return str(
        ScriptDirectory.from_config(
            _alembic_config(project_root, database_url)
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


def _run_checks(app: str, title: str) -> int:
    project_root = APPS[app][0]
    from alembic import command
    from src.config import load_settings
    from src.core.migrations import run_migrations

    settings = load_settings()
    database_path = settings.database_path
    database_url = settings.database_url
    failures: list[str] = []

    # 1) 全新库：从空库建出完整结构
    try:
        run_migrations(settings)
    except Exception as error:
        print(f"[{title}] ✗ 全新库迁移失败：{type(error).__name__}: {error}")
        return 1

    recorded = _recorded_revision(database_path)
    head = _head_revision(project_root, database_url)
    if recorded != head:
        failures.append(f"迁移结束后 revision 是 {recorded!r}，期望 head {head!r}")
    else:
        print(f"[{title}] ✓ 全新库迁移到 {recorded}")

    # 2) 迁移脚本 vs ORM 元数据
    config = _alembic_config(project_root, database_url)
    try:
        command.check(config)
        print(f"[{title}] ✓ alembic check：迁移脚本与 ORM 元数据一致")
    except Exception as error:
        failures.append(f"alembic check 报告差异：{error}")
        print(f"[{title}] ✗ alembic check：{error}")

    # 3) 幂等：再跑一次不能改动任何东西
    before = _fingerprint(database_path)
    run_migrations(settings)
    after = _fingerprint(database_path)
    if before != after:
        failures.append("重复执行迁移改动了库结构（迁移不是幂等的）")
        print(f"[{title}] ✗ 重复执行迁移改动了结构：{before} → {after}")
    else:
        print(f"[{title}] ✓ 重复执行迁移无副作用（结构指纹 {before}）")

    # 4) 商店额外做一次只读结构自检（healthz 暴露的就是它）
    if app == "store":
        from src.core.database import Database
        from src.security.schema_guard import inspect_schema

        database = Database(settings)
        drift = inspect_schema(database.engine)
        database.dispose()
        if not drift.clean:
            failures.append(f"结构自检报告差异：{drift.summary()}")
            print(f"[{title}] ✗ 结构自检：{drift.summary()}")
        else:
            print(f"[{title}] ✓ 结构自检：与 ORM 元数据一致")

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

    # 两个应用分别在自己的子进程里检查：它们的后端包名都是 ``src``，同进程导入会互相覆盖，
    # 而 ``Base.metadata`` 一旦被另一边的模型注册过，比较结果就完全不可信了。
    results: dict[str, int] = {}
    for app in sorted(APPS):
        # flush 是必要的：子进程的输出与父进程共用同一个终端，不刷会把两段交错在一起。
        print(f"\n===== {APPS[app][3]}（{app}）=====", flush=True)
        completed = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), "--app", app],
            cwd=str(APPS[app][0]),
            # 退出码由调用方逐个汇总，不在这里抛：两个应用都要跑完才给出结论。
            check=False,
        )
        results[app] = completed.returncode

    print()
    failed = [name for name, code in results.items() if code != 0]
    if failed:
        print(f"库结构门禁未通过：{', '.join(APPS[name][3] for name in failed)}")
        return 1
    print("库结构门禁通过：两个应用的迁移脚本与 ORM 元数据一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
