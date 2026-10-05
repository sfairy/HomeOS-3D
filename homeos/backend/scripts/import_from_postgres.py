"""一次性数据搬运：NestJS/Prisma（PostgreSQL）→ FastAPI（SQLite）。

用途
----
Nest 侧的 ``prisma/migrations`` 基线注释明确「已有数据卷必须清空后才能部署」，因此
换用本 Python 后端时的**默认路径是全新装**（``src/core/migrations.py`` 会按 ORM 元数据
建出干净的 0001 库）。但运维若希望把既有的 Prisma 数据原样带到新库，可用本脚本搬运。

映射规则（业务语义不变，仅存储形态适配 SQLite）
-----------------------------------------------
- 表名：Prisma 模型名（PascalCase，如 ``"EventLog"``）→ SQLAlchemy ``__tablename__``
  （snake_case 复数，如 ``event_logs``）；
- 列名：两端口径一致（camelCase，如 ``createdAt`` / ``entityId``），直接同名搬运；
- ``Json`` / ``JsonB`` → JSON 文本（``dict`` / ``list`` 序列化为紧凑 JSON）；
- ``TIMESTAMP`` → naive UTC ``datetime``；
- ``BigInt`` / ``INTEGER`` / ``DOUBLE`` / ``BOOLEAN`` / enum / ``TEXT`` → 原样。

用法
----
::

    pip install pg8000            # 或 psycopg[binary]
    python scripts/import_from_postgres.py \
        --pg-dsn "postgresql://homeos:homeos@127.0.0.1:5432/homeos" \
        --sqlite /data/homeos.db \
        [--tables User,HomeMode] [--truncate] [--dry-run]

注意：``--truncate`` 会先清空目标表；不加时按主键 upsert（重复主键覆盖）。
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

#: Prisma 模型名（PostgreSQL 表名）→ SQLite 表名
PG_TO_SQLITE_TABLE: dict[str, str] = {
    "User": "users",
    "LoginAudit": "login_audits",
    "GuestShareCode": "guest_share_codes",
    "ProjectConfig": "project_configs",
    "CommandAudit": "command_audits",
    "Notification": "notifications",
    "SecurityEvent": "security_events",
    "EarthquakeAlertHistory": "earthquake_alert_history",
    "AlertRule": "alert_rules",
    "HomeMode": "home_modes",
    "SystemConfig": "system_configs",
    "RuntimeKv": "runtime_kv",
    "ChildModeRuntime": "child_mode_runtime",
    "AwayPatternBucket": "away_pattern_buckets",
    "GuestPass": "guest_passes",
    "WebPushSubscription": "web_push_subscriptions",
    "EventLog": "event_logs",
    "DeviceUsageStat": "device_usage_stats",
    # Nest 原生 SQL 引用、未在 Prisma schema 声明的表
    "EnvironmentRecord": "environment_records",
    "EnergyCandidateEntity": "energy_candidate_entities",
    "EnergyUsageDaily": "energy_usage_daily",
    "EnergyUsageMonthly": "energy_usage_monthly",
}

#: 搬运顺序（父表优先，满足外键依赖）
TABLE_ORDER: tuple[str, ...] = (
    "User",
    "LoginAudit",
    "CommandAudit",
    "GuestShareCode",
    "ProjectConfig",
    "Notification",
    "SecurityEvent",
    "EarthquakeAlertHistory",
    "AlertRule",
    "HomeMode",
    "SystemConfig",
    "RuntimeKv",
    "ChildModeRuntime",
    "AwayPatternBucket",
    "GuestPass",
    "WebPushSubscription",
    "DeviceUsageStat",
    "EventLog",
    "EnvironmentRecord",
    "EnergyCandidateEntity",
    "EnergyUsageDaily",
    "EnergyUsageMonthly",
)

JSON_COLUMNS = {
    "preferences",
    "payload",
    "layout",
    "deliveryChannels",
    "zones",
    "channels",
    "config",
    "triggers",
    "deviceSnapshot",
    "data",
    "oldState",
    "newState",
}


def normalize_value(column: str, value: Any, datetime_columns: set[str] | None = None) -> Any:
    """把 Postgres 取回的单个值转成 SQLite 侧可存的形态。"""
    if value is None:
        return None
    if isinstance(value, datetime):
        # SQLite 侧统一存 naive UTC，避免与 ORM 的 DateTime 比较时区错位
        if value.tzinfo is not None:
            value = value.astimezone(UTC).replace(tzinfo=None)
        return value
    if isinstance(value, str) and datetime_columns and column in datetime_columns:
        parsed = _parse_timestamp(value)
        if parsed is not None:
            return parsed
    if column in JSON_COLUMNS or isinstance(value, (dict, list)):
        if isinstance(value, str):
            return value
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float, str)):
        return value
    return str(value)


def _parse_timestamp(text: str) -> datetime | None:
    """解析常见时间戳文本（``YYYY-MM-DD HH:MM:SS`` / ISO8601 带 T、Z、偏移）→ naive UTC。"""
    raw = text.strip()
    if not raw:
        return None
    candidate = raw.replace(" ", "T", 1) if "T" not in raw and " " in raw else raw
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


def _connect_pg(dsn: str):
    """按可用驱动连接 Postgres（pg8000 优先，纯 Python 零编译）。"""
    try:
        import pg8000.dbapi as pg  # type: ignore

        parsed = _parse_dsn(dsn)
        return pg.connect(**parsed), "pg8000"
    except ImportError:
        pass
    try:
        import psycopg  # type: ignore

        return psycopg.connect(dsn), "psycopg"
    except ImportError as error:  # pragma: no cover - 运行环境无驱动时给出指引
        raise SystemExit(
            "未安装 PostgreSQL 驱动。请执行 `pip install pg8000`（推荐）或 `pip install 'psycopg[binary]'` 后重试。"
        ) from error


def _parse_dsn(dsn: str) -> dict[str, Any]:
    from urllib.parse import unquote, urlparse

    url = urlparse(dsn)
    if not url.hostname:
        raise SystemExit(f"无法解析 --pg-dsn：{dsn}")
    return {
        "host": url.hostname,
        "port": url.port or 5432,
        "user": unquote(url.username or ""),
        "password": unquote(url.password or ""),
        "database": (url.path or "/").lstrip("/"),
    }


def _fetch_all(connection: Any, table: str) -> tuple[list[str], list[tuple[Any, ...]]]:
    cursor = connection.cursor()
    try:
        cursor.execute(f'SELECT * FROM "{table}"')  # noqa: S608 - 表名来自白名单常量
        columns = [desc[0] for desc in cursor.description or []]
        rows = cursor.fetchall()
    finally:
        cursor.close()
    return columns, rows


def migrate(
    pg_dsn: str | None,
    sqlite_path: str,
    *,
    tables: list[str] | None = None,
    truncate: bool = False,
    dry_run: bool = False,
    connection: Any = None,
) -> dict[str, int]:
    """执行搬运，返回每张表的行数统计。

    ``connection`` 可注入一个已就绪的源库连接（测试用；缺省按 ``pg_dsn`` 连接 Postgres）。
    """
    from sqlalchemy import DateTime, create_engine, delete, insert, inspect

    import src.core.models  # noqa: F401 - 注册 ORM 元数据
    from src.core.database import Base

    selected = tables or list(TABLE_ORDER)
    unknown = [t for t in selected if t not in PG_TO_SQLITE_TABLE]
    if unknown:
        raise SystemExit(f"未知表（仅支持 Prisma/原生 SQL 表）：{unknown}")

    sqlite_url = f"sqlite:///{sqlite_path}"
    engine = create_engine(sqlite_url)
    inspector = inspect(engine)
    existing = set(inspector.get_table_names())

    owned = connection is None
    if owned:
        connection, driver = _connect_pg(pg_dsn or "")
    else:
        driver = "injected"
    stats: dict[str, int] = {}
    try:
        for pg_table in selected:
            target = PG_TO_SQLITE_TABLE[pg_table]
            if target not in existing:
                raise SystemExit(
                    f"目标库缺少表 {target}：请先让后端完成一次启动迁移（或 alembic upgrade head）。"
                )
            columns, rows = _fetch_all(connection, pg_table)
            orm_table = Base.metadata.tables[target]
            orm_columns = set(orm_table.columns.keys())
            datetime_columns = {
                column.name
                for column in orm_table.columns
                if isinstance(column.type, DateTime)
            }
            usable = [c for c in columns if c in orm_columns]
            payload = [
                {
                    c: normalize_value(c, row[columns.index(c)], datetime_columns)
                    for c in usable
                }
                for row in rows
            ]
            stats[pg_table] = len(payload)
            print(f"  {pg_table:<26} → {target:<26} {len(payload):>7} 行（驱动 {driver}）")
            if dry_run or not payload:
                continue
            with engine.begin() as conn:
                if truncate:
                    conn.execute(delete(orm_table))
                # 分批插入，避免单条 SQL 变量数超限
                batch = 500
                for start in range(0, len(payload), batch):
                    chunk = payload[start : start + batch]
                    conn.execute(insert(orm_table).prefix_with("OR REPLACE"), chunk)
    finally:
        if owned:
            try:
                connection.close()
            except Exception:  # noqa: BLE001
                pass
        engine.dispose()
    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="PostgreSQL(Prisma) → SQLite 数据搬运")
    parser.add_argument("--pg-dsn", required=True, help="PostgreSQL 连接串")
    parser.add_argument("--sqlite", required=True, help="目标 SQLite 数据库文件路径")
    parser.add_argument("--tables", default="", help="逗号分隔的表名（Prisma 模型名）；缺省全部")
    parser.add_argument("--truncate", action="store_true", help="搬运前先清空目标表")
    parser.add_argument("--dry-run", action="store_true", help="仅统计行数，不写库")
    args = parser.parse_args(argv)

    tables = [t.strip() for t in args.tables.split(",") if t.strip()] or None
    print(f"[pg→sqlite] {'（dry-run）' if args.dry_run else ''}目标库：{args.sqlite}")
    stats = migrate(
        args.pg_dsn,
        args.sqlite,
        tables=tables,
        truncate=args.truncate,
        dry_run=args.dry_run,
    )
    print(f"[pg→sqlite] 完成：{len(stats)} 张表，合计 {sum(stats.values())} 行")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
