"""遥测库：把高频写入、可丢弃的历史表放进独立 SQLite 文件。

为什么拆
--------
``agent_context_timeline`` 是按**每一次** HA 状态翻转写一行的表，历史上 5 天就写到
153 万行：表数据 404 MB + 三个索引 263 MB，占 ``homeos.db`` 的 98%。这张表与业务表
（用户 / 授权 / 项目草稿 / 配置）在写入模式上完全不同：

- 只追加、按时间窗查询，从不参与业务事务；
- 可以整段丢弃（60 天保留期、全量备份本来就不打包它）；
- 写入时持有 SQLite 的**库级**写锁 —— 和它同库，就意味着「关一次灯」要与「保存一次
  项目草稿」抢同一把锁。

拆成独立文件后两件事同时成立：业务库回到几十 MB（``VACUUM`` 后页数骤降，备份/体检
从几十秒回到秒级），时序写入也不再阻塞业务写入。

迁移是自动的、一次性、幂等的
----------------------------
启动时如果主库里还留着 ``agent_context_timeline``，直接把行 ``INSERT INTO`` 遥测库、
``DROP TABLE``，再 ``VACUUM`` 主库把页还给文件系统。任何一步失败都让启动失败（与
``schema.prepare_schema`` 同一策略）：宁可起不来，也不要带着半迁移状态跑。

哪些表在哪个库
--------------
:data:`TELEMETRY_TABLES` 是唯一清单。``event_logs`` / ``environment_records`` /
``device_usage_stats`` 仍在主库：它们分别只有 ~6 MB / 空表 / 数百行，而报表查询会
跨表聚合能耗表（在主库），现在搬走只会引入双会话却不省磁盘。等它们的体积或锁竞争
真的成为瓶颈时，按下面的步骤加进清单即可（机制已经通用）。
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import DateTime, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .database import Database
from ....config import Settings

LOGGER = logging.getLogger("homeos.platform.core.telemetry")

#: 遥测库文件名（与 ``homeos.db`` 同目录）。
TELEMETRY_DB_NAME = "homeos-telemetry.db"

#: 已迁出主库的表（迁移与文档都以这份清单为准）。
TELEMETRY_TABLES: tuple[str, ...] = ("agent_context_timeline",)

#: 迁移时需要独占的等待时间：启动早期没有并发写入，5s 已是保守上限。
_MIGRATION_BUSY_TIMEOUT_MS = 5000


class TelemetryBase(DeclarativeBase):
    """遥测库的 ORM 基类。与业务 ``Base`` **分开**：``create_all`` 才不会把时序表建回主库。"""


class AgentContextTimeline(TelemetryBase):
    """设备状态翻转时序：用于「这段时间为什么变了」的归因与时长统计。"""

    __tablename__ = "agent_context_timeline"
    __table_args__ = (
        Index("agent_context_timeline_entity_idx", "entityId", "changedAt"),
        Index("agent_context_timeline_area_idx", "areaId", "changedAt"),
        Index("agent_context_timeline_changedAt_idx", "changedAt"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(64), nullable=False)
    area_id: Mapped[str] = mapped_column("areaId", String(128), nullable=False, default="")
    area_name: Mapped[str] = mapped_column("areaName", String(128), nullable=False, default="")
    old_state: Mapped[str | None] = mapped_column("oldState", Text, nullable=True)
    new_state: Mapped[str | None] = mapped_column("newState", Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column("changedAt", DateTime, nullable=False)
    #: 下一次翻转时结算；为空表示该状态仍在持续
    ended_at: Mapped[datetime | None] = mapped_column("endedAt", DateTime, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column("durationSeconds", Integer, nullable=True)
    #: MANUAL_APP / HA_AUTOMATION / EXTERNAL_DEVICE
    trigger_source: Mapped[str] = mapped_column("triggerSource", String(32), nullable=False, default="")
    actor: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    context: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    peer_snapshot: Mapped[str] = mapped_column("peerSnapshot", Text, nullable=False, default="{}")


def telemetry_database_path(settings: Settings) -> Path:
    """遥测库文件路径（``Settings`` 里统一决定，避免两处各拼一次文件名）。"""
    return settings.telemetry_database_path


def create_telemetry_database(settings: Settings) -> Database:
    """打开遥测库（与主库共用同一套连接 PRAGMA / 语句计数）。"""
    return Database(f"sqlite:///{telemetry_database_path(settings)}")


def _table_names(connection: sqlite3.Connection, schema: str) -> set[str]:
    # schema 只由本模块传入（"main" / "telemetry"），不是外部输入。
    rows = connection.execute(
        f"SELECT name FROM {schema}.sqlite_master WHERE type='table'"  # noqa: S608 - schema 是内部常量
    ).fetchall()
    return {str(row[0]) for row in rows}


def migrate_legacy_tables(main_path: Path, telemetry_path: Path) -> int:
    """把主库里遗留的遥测表整表搬到遥测库，并在主库回收空间。返回迁移行数。

    直接用 ``sqlite3`` 而不是 ORM：这是**一次性结构迁移**，走 ORM 意味着把 150 万行
    读进 Python 再写回去。``ATTACH`` + ``INSERT … SELECT`` 全程在 SQLite 内部完成，
    内存占用与行数无关。
    """
    if not main_path.is_file():
        return 0
    connection = sqlite3.connect(main_path, isolation_level=None)
    moved = 0
    try:
        connection.execute(f"PRAGMA busy_timeout={_MIGRATION_BUSY_TIMEOUT_MS}")
        legacy = _table_names(connection, "main") & set(TELEMETRY_TABLES)
        if not legacy:
            return 0
        telemetry_path.parent.mkdir(parents=True, exist_ok=True)
        connection.execute("ATTACH DATABASE ? AS telemetry", (str(telemetry_path),))
        for table in sorted(legacy):
            # 遥测库的表结构由 prepare_telemetry 的 ensure_schema 先建好；
            # 列顺序与模型一致，所以 SELECT * 是安全的（同一次构建的两个分支）。
            count = int(
                connection.execute(f'SELECT COUNT(*) FROM main."{table}"').fetchone()[0]  # noqa: S608 - 表名来自常量白名单
            )
            if count:
                connection.execute(
                    f'INSERT INTO telemetry."{table}" SELECT * FROM main."{table}"'  # noqa: S608 - 表名来自常量白名单
                )
            connection.execute(f'DROP TABLE main."{table}"')
            moved += count
            LOGGER.info("遥测表已迁出主库：%s（%d 行）", table, count)
        connection.execute("DETACH DATABASE telemetry")
    finally:
        connection.close()

    # VACUUM 必须在没有其它连接、也不在事务里时执行：它会把 648 MB 的文件按存活页重写，
    # 这一步才是「主库从 679 MB 回到几十 MB」真正省下磁盘的地方。
    connection = sqlite3.connect(main_path, isolation_level=None)
    try:
        connection.execute(f"PRAGMA busy_timeout={_MIGRATION_BUSY_TIMEOUT_MS}")
        connection.execute("VACUUM")
    finally:
        connection.close()
    return moved


def prepare_telemetry(settings: Settings) -> None:
    """建遥测库结构并完成一次性迁移。启动期在**线程池**里调用（会 VACUUM）。"""
    from homeos_shared.schema_core import ensure_schema

    telemetry_path = telemetry_database_path(settings)
    telemetry_path.parent.mkdir(parents=True, exist_ok=True)
    database = create_telemetry_database(settings)
    try:
        ensure_schema(TelemetryBase.metadata, database.engine)
    finally:
        database.dispose()
    moved = migrate_legacy_tables(settings.database_path, telemetry_path)
    if moved:
        LOGGER.info("遥测迁移完成：共搬出 %d 行，主库已整理", moved)
    else:
        LOGGER.debug("遥测库无需迁移：%s", telemetry_path)


def telemetry_file_bytes(path: Path) -> int:
    """遥测库磁盘占用（含 WAL / SHM），供系统面板展示。"""
    total = 0
    for suffix in ("", "-wal", "-shm"):
        candidate = Path(f"{path}{suffix}")
        if candidate.is_file():
            total += candidate.stat().st_size
    return total


def describe_tables() -> dict[str, Any]:
    """调试用：当前遥测库里有几张表（诊断接口 / 日志里引用）。"""
    return {"tables": list(TELEMETRY_TABLES), "db_name": TELEMETRY_DB_NAME}
