"""数据库连接与 ORM 基类（SQLite / WAL）。

对齐 homeos-3d 的 ``Database`` 约定，但针对 HomeOS 的并发特征（HA 状态管道高频写入 +
Socket.IO 多连接读）补齐连接级 PRAGMA：

- ``journal_mode=WAL``：读写不互相阻塞（单写多读）；
- ``busy_timeout``：写锁竞争时等待而非立即 ``database is locked``；
- ``foreign_keys=ON``：SQLite 默认关闭外键约束，必须显式打开以维持引用完整性；
- ``synchronous=NORMAL``：WAL 下的推荐值，兼顾耐久与吞吐。

同步 SQLAlchemy 由 FastAPI 的线程池承载（见 ``src.core.deps``）。
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

#: 写锁等待毫秒数（HA 状态批量写入与业务写入并发时的削峰阈值）。
SQLITE_BUSY_TIMEOUT_MS = 5000


class Base(DeclarativeBase):
    """所有 ORM 模型基类（Alembic autogenerate 的元数据来源）。"""


def _configure_sqlite(dbapi_connection, _connection_record) -> None:
    """为每条新连接设置 SQLite PRAGMA（连接级生效，需逐连接执行）。"""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
    finally:
        cursor.close()


class Database:
    """全局 Engine + 会话工厂封装。"""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        connect_args: dict[str, object] = {}
        if database_url.startswith("sqlite"):
            # FastAPI 线程池会在不同线程复用连接，关闭同线程检查。
            connect_args["check_same_thread"] = False
        self.engine: Engine = create_engine(
            database_url,
            connect_args=connect_args,
            pool_pre_ping=True,
        )
        if database_url.startswith("sqlite"):
            event.listen(self.engine, "connect", _configure_sqlite)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            expire_on_commit=False,
        )

    def sessions(self) -> Iterator[Session]:
        """依赖注入用的会话生成器（FastAPI ``Depends``）。"""
        with self.session_factory() as session:
            yield session

    def dispose(self) -> None:
        self.engine.dispose()
