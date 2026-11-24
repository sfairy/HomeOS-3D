#!/usr/bin/env python3
"""日志库（``homeos-logs.db``）自检：拆库的四个「会静默出错」的口径。

拆库本身不难，难在四件事都不会报错、只会表现成「数据不见了」或「历史停住了」：

1. **老库的行要搬过来**，且搬运可中断可重跑（断电/被杀后不能重复也不能丢）；
2. **备份不收它**：日志库里的表全在 ``EXCLUDED_DB_TABLES`` 里，跟着数据文件被装进备份包
   会重演 2026-11-22 的「备份把自己装进去」超限失败；
3. **保留清理按表选库**：日志库的表用日志库会话，``security_events``（留在业务库）用业务库
   会话 —— 一刀切会让另一半静默删 0 行；
4. **整库还原后清空**：备份里没有日志库，还原后必须清掉，否则配置回到旧版本、历史停在
   新版本。

用法：
    node ops/lib/py.mjs ops/checks/business/log_database_selftest.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import sqlite3

from sqlalchemy import create_engine

from homeos.backend.src.domains.backup.scope import is_excluded
from homeos.backend.src.domains.retention.service import DatabaseRetentionService
from homeos.backend.src.platform.core.db import models  # noqa: F401  # 注册两个 metadata  # pyright: ignore[reportUnusedImport]
from homeos.backend.src.platform.core.db.database import Base
from homeos.backend.src.platform.core.db.log_base import (
    LOG_DB_NAME,
    LOG_TABLE_NAMES,
    LogBase,
)
from homeos.backend.src.platform.core.db.log_database import (
    log_database_path,
    move_legacy_rows,
    reset_log_database,
)

CHECKS: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} 失败{('：' + detail) if detail else ''}")
    CHECKS.append(name)


def test_tables_are_split() -> None:
    """日志表必须**只**在 LogBase 里；业务表不能混进来。"""
    main_tables = set(Base.metadata.tables)
    log_tables = set(LogBase.metadata.tables)
    check("日志表在 LogBase", log_tables == set(LOG_TABLE_NAMES), f"实际 {sorted(log_tables)}")
    check("日志表已从业务库移出", not (log_tables & main_tables), f"重叠 {sorted(log_tables & main_tables)}")
    check(
        "security_events / energy_usage_* 留在业务库",
        {"security_events", "energy_usage_hourly", "energy_usage_daily", "energy_usage_monthly"} <= main_tables,
    )


def test_backup_excludes_log_db() -> None:
    """日志库（含 sidecar）不进数据文件收集；主库同样排除。"""
    for name in (LOG_DB_NAME, f"{LOG_DB_NAME}-wal", f"{LOG_DB_NAME}-shm", f"{LOG_DB_NAME}-journal"):
        check(f"备份排除 {name}", is_excluded(name))
    check("备份仍排除主库", is_excluded("homeos.db"))
    check("备份不误伤普通文件", not is_excluded("assets/logo.png"))


#: 老库里的 ``event_logs`` 结构（用 SQL 直建，模拟「升级上来的库」，
#: 不依赖 ORM 表对象 —— 这张表已经不在 ``Base.metadata`` 里了）。
_LEGACY_EVENT_LOGS_SQL = """
CREATE TABLE event_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entityId VARCHAR(255) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    oldState TEXT,
    newState TEXT,
    stateDiff VARCHAR(255),
    createdAt DATETIME NOT NULL
)
"""


def test_move_is_idempotent() -> None:
    """搬运：搬完主库为空、日志库有数据、再跑一次什么都不动。"""
    with tempfile.TemporaryDirectory() as raw:
        data = Path(raw)
        main = data / "homeos.db"
        connection = sqlite3.connect(main)
        connection.execute(_LEGACY_EVENT_LOGS_SQL)
        connection.executemany(
            "INSERT INTO event_logs (entityId, domain, oldState, newState, stateDiff, createdAt)"
            " VALUES (?, 'light', NULL, '{\"state\":\"on\"}', 'off→on', '2026-11-01 00:00:00')",
            [(f"light.selftest_{index}",) for index in range(7)],
        )
        connection.commit()
        connection.close()

        # 日志库：按 LogBase.metadata 建出与生产同形的表
        log_path = log_database_path(data)
        log_engine = create_engine(f"sqlite:///{log_path}")
        LogBase.metadata.create_all(log_engine)
        log_engine.dispose()

        first = move_legacy_rows(main, log_path, chunk_rows=3)
        check("首次搬运搬到了 7 行", first.get("event_logs") == 7, str(first))
        check(
            "主库表已清空",
            sqlite3.connect(main).execute("SELECT COUNT(*) FROM event_logs").fetchone()[0] == 0,
        )
        check(
            "日志库有 7 行",
            sqlite3.connect(log_path).execute("SELECT COUNT(*) FROM event_logs").fetchone()[0] == 7,
        )
        second = move_legacy_rows(main, log_path, chunk_rows=3)
        check("重跑不重复搬", second == {}, str(second))
        check(
            "重跑后仍是 7 行",
            sqlite3.connect(log_path).execute("SELECT COUNT(*) FROM event_logs").fetchone()[0] == 7,
        )


def test_retention_picks_database_per_table() -> None:
    """保留清理按表归属选库：日志表 → 日志库，其余 → 业务库。"""
    main_factory = object()
    log_factory = object()
    service = DatabaseRetentionService(main_factory, app_config=None, log_session_factory=log_factory)
    for table in LOG_TABLE_NAMES:
        check(f"{table} 走日志库", service._factory_for(table) is log_factory)
    for table in ("security_events", "notifications"):
        check(f"{table} 走业务库", service._factory_for(table) is main_factory)
    fallback = DatabaseRetentionService(main_factory, app_config=None)
    check("未传日志库时回退业务库", fallback._factory_for("event_logs") is main_factory)


def test_reset_removes_files() -> None:
    """整库还原后清空日志库：文件与 sidecar 都要删掉。"""
    with tempfile.TemporaryDirectory() as raw:
        data = Path(raw)
        for name in (LOG_DB_NAME, f"{LOG_DB_NAME}-wal", f"{LOG_DB_NAME}-shm"):
            (data / name).write_bytes(b"x")
        settings = SimpleNamespace(log_database_path=log_database_path(data))
        reset_log_database(settings)
        remaining = [
            name for name in (LOG_DB_NAME, f"{LOG_DB_NAME}-wal", f"{LOG_DB_NAME}-shm") if (data / name).exists()
        ]
        check("日志库文件与 sidecar 已删除", remaining == [], str(remaining))
        # 幂等：文件不存在时不抛错
        reset_log_database(settings)


def main() -> int:
    test_tables_are_split()
    test_backup_excludes_log_db()
    test_move_is_idempotent()
    test_retention_picks_database_per_table()
    test_reset_removes_files()
    print(f"日志库自检通过：{len(CHECKS)} 项")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
