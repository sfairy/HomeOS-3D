#!/usr/bin/env python3
"""授权商店「结构漂移」护栏回归：版本号到 head 但结构没到时，必须在启动前报错。

为什么需要它
------------
主应用 2026-10-07 真实踩过一次这个坑：迁移 ``0008`` 在被应用之后又被追加了一列
（``license_state.activated_by``），版本号早已打上、不会再回退，而 ``run_migrations``
有一条直接信任版本号的快路径，于是那一列永远补不上，直到业务查询报
``no such column``、**整个应用启动失败**，对外表现为全部接口 503。

商店这边同一条快路径（``recorded == head``）当时只返回 ``performed``，同一个隐患还在。
本冒烟把护栏钉住：三种情形都要有确定行为 ——

1. **一致**：结构与 ORM 相符且已在 head → 不抛错、不动库（返回空列表）；
2. **漂移**：版本号在 head 但缺列 → 必须抛错，且错误里点名缺的那一列；
3. **多余列**：库里多一列（退役字段的常见残留）→ 不算漂移，不能误报堵住启动。

修复路径不在这里验：它用的还是 Alembic 正常的 downgrade/upgrade，与主应用同一套。

用法
----
从仓库根执行（解释器用仓库根的 ``.venv-store``）：

    .venv-store/bin/python homeos-store/scripts/_schema_drift_guard_smoke.py

纯离线，只在 tempfile 里的 SQLite 上操作，不起服务器、不碰 data/ 下的真实库。
"""

from __future__ import annotations

import sqlite3
import sys
import tempfile
from contextlib import closing
from pathlib import Path

STORE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(STORE_ROOT / "backend"))

failures: list[str] = []
checked = 0


def check(name: str, fn) -> None:
    """跑一项检查并打印一行 OK / FAIL；任何异常都算失败，不让脚本半路炸掉。"""
    global checked
    checked += 1
    try:
        fn()
    except AssertionError as error:
        failures.append(f"{name} —— {error}")
        print(f"  FAIL {name} —— {error}")
    except Exception as error:
        # 未预期异常同样算失败，但要看清类型：它通常意味着环境问题而非判定口径。
        failures.append(f"{name} —— {type(error).__name__}: {error}")
        print(f"  FAIL {name} —— {type(error).__name__}: {error}")
    else:
        print(f"  OK   {name}")


def expect(condition: object, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def columns(database_path: Path, table: str) -> set[str]:
    with closing(sqlite3.connect(database_path)) as connection:
        return {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}


def main() -> int:
    from src.config import load_settings
    from src.core import migrations

    with tempfile.TemporaryDirectory(prefix="store-drift-") as tmp:
        data_dir = Path(tmp) / "data"
        settings = load_settings(data_dir=data_dir)
        database_path = settings.database_path
        script_dir = migrations._migrations_dir(settings)
        expect(script_dir is not None, "开发布局下应当能找到 backend/migrations 脚本目录")
        head = migrations.SCHEMA_REVISION

        # 先把库建到 head，作为三种情形共同的前提。
        migrations.run_migrations(settings)
        expect(database_path.is_file(), "迁移后应当有 store.db")
        expect(
            "edition" in columns(database_path, "products"),
            "前提不成立：products.edition 应当由基线 0001 建出来",
        )

        def case_clean():
            performed = migrations.run_migrations(settings)
            expect(performed == [], f"一致时不应改动任何东西，实际 {performed!r}")
            expect(migrations._schema_drift(settings).clean, "一致时漂移明细应为空")

        def case_extra_column_ok():
            # 退役字段留下的多余列很常见，它不影响 ORM 读取，不能因此堵住启动。
            with closing(sqlite3.connect(database_path)) as connection:
                connection.execute("ALTER TABLE products ADD COLUMN retired_flag VARCHAR(8)")
                connection.commit()
            expect(migrations._schema_drift(settings).clean, "多余列不应算漂移")
            expect(migrations.run_migrations(settings) == [], "多余列不应堵住启动")

        def case_drift_raises():
            with closing(sqlite3.connect(database_path)) as connection:
                connection.execute("ALTER TABLE products DROP COLUMN edition")
                connection.commit()
            expect(
                "edition" not in columns(database_path, "products"),
                "未能模拟出缺列（前提不成立）",
            )
            try:
                migrations.run_migrations(settings)
            except RuntimeError as error:
                message = str(error)
                expect("edition" in message, f"错误里应点名缺的列，实际：{message}")
                expect("缺列" in message, f"错误里应说明是缺列，实际：{message}")
                expect(head in message, f"错误里应带上 head 版本号，实际：{message}")
                return
            raise AssertionError("版本号在 head 但缺列时，run_migrations 竟然正常返回了")

        def case_repair_then_clean():
            # 缺列状态下的正经修复是「缺了才加」的迁移（见下面注释），这里用等价的一步 DDL
            # 代替那个迁移文件：只验「补上之后护栏就放行」，不验迁移文件本身。
            #
            # 不写成 alembic downgrade+upgrade：0003 的 downgrade 会 drop_column('edition')，
            # 而 batch 重建找不到这个列时直接抛 KeyError('edition') —— 漂移态下这条配方走不通，
            # 所以报错信息里给的是「补一个缺了才加的迁移」，而非回退。
            with closing(sqlite3.connect(database_path)) as connection:
                connection.execute("ALTER TABLE products ADD COLUMN edition VARCHAR(64)")
                connection.commit()
            expect(migrations._schema_drift(settings).clean, "补上缺列后应当不再漂移")
            expect(migrations.run_migrations(settings) == [], "修复后应恢复为不动库")

        check("结构与 ORM 一致且已在 head：不抛错、不动库", case_clean)
        check("库里多一列：不算漂移，不误报", case_extra_column_ok)
        check("版本号在 head 但缺列：抛错并点名缺的列", case_drift_raises)
        check("缺列补齐后：护栏放行且不动库", case_repair_then_clean)

    print()
    if failures:
        print(f"结构漂移护栏回归失败：{len(failures)}/{checked} 项")
        for entry in failures:
            print(f"  - {entry}")
        return 1
    print(f"结构漂移护栏回归全部通过（{checked} 项）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
