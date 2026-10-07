#!/usr/bin/env python3
"""数据库医生：integrity / foreign_key / revision / drift / 页统计（默认只读）。

用法::

    python ops/check_database.py                 # 检查两个应用（需已有数据目录或临时建库）
    python ops/check_database.py --app app
    python ops/check_database.py --app store --analyze   # 额外 ANALYZE（写）
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

APPS: dict[str, tuple[str, str, Path]] = {
    "app": ("HOMEOS_DATA_DIR", "主应用", ROOT / "homeos" / "backend"),
    "store": ("STORE_DATA_DIR", "授权商店", ROOT / "homeos-store"),
}


def _check_one(app: str, *, analyze: bool, wal_checkpoint: bool) -> int:
    env_key, title, project_root = APPS[app]
    sys.path.insert(0, str(project_root if app == "store" else project_root))
    # store layout: project_root is homeos-store; backend is under it
    if app == "store":
        sys.path.insert(0, str(project_root / "backend"))
    else:
        sys.path.insert(0, str(project_root))

    with tempfile.TemporaryDirectory(prefix=f"homeos-dbdoc-{app}-") as temp_dir:
        os.environ[env_key] = temp_dir
        if app == "app":
            from src.config import load_settings
            from src.core import migrations

            settings = load_settings()
            migrations.run_migrations(settings)
            database_path = settings.database_path
            expected = migrations.SCHEMA_REVISION
            drift_fn = lambda: migrations._schema_drift(settings.database_url)
        else:
            from src.config import load_settings
            from src.core import migrations

            settings = load_settings()
            migrations.run_migrations(settings)
            database_path = settings.database_path
            expected = migrations.SCHEMA_REVISION
            drift_fn = lambda: migrations._schema_drift(settings)

        errors: list[str] = []
        with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()
            if integrity is None or integrity[0] != "ok":
                errors.append(f"integrity_check: {integrity}")
            else:
                print(f"[{title}] ✓ integrity_check ok")

            fk = connection.execute("PRAGMA foreign_key_check").fetchall()
            if fk:
                errors.append(f"foreign_key_check: {fk[:5]}")
            else:
                print(f"[{title}] ✓ foreign_key_check ok")

            row = connection.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
            actual = str(row[0]) if row else "missing"
            if actual != expected:
                errors.append(f"revision {actual} != {expected}")
            else:
                print(f"[{title}] ✓ revision {actual}")

            page_count = connection.execute("PRAGMA page_count").fetchone()[0]
            freelist = connection.execute("PRAGMA freelist_count").fetchone()[0]
            page_size = connection.execute("PRAGMA page_size").fetchone()[0]
            print(
                f"[{title}] · pages={page_count} freelist={freelist} "
                f"page_size={page_size} (~{page_count * page_size // 1024} KiB)"
            )

        drift = drift_fn()
        if app == "app":
            if drift:
                errors.append(f"schema drift: {drift}")
            else:
                print(f"[{title}] ✓ schema drift clean")
        else:
            if not drift.clean:
                errors.append(f"schema drift: {drift.summary()}")
            else:
                print(f"[{title}] ✓ schema drift clean")

        if analyze or wal_checkpoint:
            with sqlite3.connect(database_path) as connection:
                if analyze:
                    connection.execute("ANALYZE")
                    print(f"[{title}] ✓ ANALYZE")
                if wal_checkpoint:
                    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                    print(f"[{title}] ✓ wal_checkpoint(TRUNCATE)")

        if errors:
            for item in errors:
                print(f"[{title}] ✗ {item}", file=sys.stderr)
            return 1
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="HomeOS / Store SQLite doctor")
    parser.add_argument("--app", choices=("app", "store", "all"), default="all")
    parser.add_argument("--analyze", action="store_true", help="Run ANALYZE (writes)")
    parser.add_argument(
        "--wal-checkpoint",
        action="store_true",
        help="Run PRAGMA wal_checkpoint(TRUNCATE) (writes)",
    )
    args = parser.parse_args()
    targets = ("app", "store") if args.app == "all" else (args.app,)
    # 子进程隔离，避免 Base.metadata 串味（同 check_schema）
    code = 0
    for app in targets:
        result = subprocess.run(
            [
                sys.executable,
                str(Path(__file__).resolve()),
                "--app",
                app,
                *(["--analyze"] if args.analyze else []),
                *(["--wal-checkpoint"] if args.wal_checkpoint else []),
                "--_worker",
            ],
            cwd=str(ROOT),
            check=False,
        )
        if result.returncode != 0:
            code = result.returncode
    return code


def _worker_main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", required=True, choices=("app", "store"))
    parser.add_argument("--analyze", action="store_true")
    parser.add_argument("--wal-checkpoint", action="store_true")
    parser.add_argument("--_worker", action="store_true")
    args = parser.parse_args()
    return _check_one(args.app, analyze=args.analyze, wal_checkpoint=args.wal_checkpoint)


if __name__ == "__main__":
    if "--_worker" in sys.argv:
        raise SystemExit(_worker_main())
    raise SystemExit(main())
