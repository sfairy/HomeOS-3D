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

import os
from collections.abc import Callable, Iterator
from typing import TypeVar

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .observability import record_db_query

#: 写锁等待毫秒数（HA 状态批量写入与业务写入并发时的削峰阈值）。
SQLITE_BUSY_TIMEOUT_MS = 5000

#: 每条连接的页缓存上限（KiB）。负值表示「按 KiB 计」而不是页数。
#: 默认 -2000 太小，热读端点（HA 实体、项目草稿、事件日志）会反复回盘。
SQLITE_CACHE_SIZE_KIB = 16384

#: 只读映射窗口。小于库文件时按窗口滑读；映射失败会静默退回普通 I/O。
SQLITE_MMAP_SIZE_BYTES = 134217728

#: 连接池默认值（可用 HOMEOS_DB_POOL_SIZE / HOMEOS_DB_MAX_OVERFLOW /
#: HOMEOS_DB_POOL_TIMEOUT_SECONDS 覆盖）。SQLite 是单文件写，池开得过大只会放大
#: 写锁竞争；8 + 4 覆盖状态管道写入与 HTTP 读线程，并给突发留出余量。
DEFAULT_POOL_SIZE = 8
DEFAULT_MAX_OVERFLOW = 4
DEFAULT_POOL_TIMEOUT_SECONDS = 5.0

#: 数值环境变量的类型参数。刻意不用 PEP 695 的 ``def f[T](...)``：Cython 3.2 无法解析
#: 方括号形式，构建加密后端时会以 CompileError 中断（改用传统 TypeVar，同 ``pagination.py``）。
_NumberT = TypeVar("_NumberT", int, float)


def _environment_number(
    name: str, default: _NumberT, *, cast: Callable[[str], _NumberT], minimum: float = 0
) -> _NumberT:
    """读数值环境变量；缺省 / 非法 / 过小一律回落到 default。"""
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        parsed = cast(value)
    except ValueError:
        return default
    return parsed if parsed >= minimum else default


def _environment_int(name: str, default: int, *, minimum: int = 0) -> int:
    """读整型环境变量；缺省 / 非法 / 过小一律回落到 default。"""
    return _environment_number(name, default, cast=int, minimum=minimum)


def _environment_float(name: str, default: float, *, minimum: float = 0.0) -> float:
    """读浮点环境变量；缺省 / 非法 / 过小一律回落到 default。"""
    return _environment_number(name, default, cast=float, minimum=minimum)


class Base(DeclarativeBase):
    """所有 ORM 模型基类。"""


def _record_query(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
    """SQLAlchemy 语句计数（只累加整数，不参与执行路径）。"""
    record_db_query(statement)


def _configure_sqlite(dbapi_connection, _connection_record) -> None:
    """为每条新连接设置 SQLite PRAGMA（连接级生效，需逐连接执行）。"""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
        # 读侧调优：默认 page cache 只有 -2000（约 2 MB），而 /ha/entities、项目草稿这类
        # 热读会把同样的页反复从磁盘捞回内存。WAL + mmap 下提升页缓存几乎只有收益，
        # 内存代价是每连接 16 MB 上限（池 8+4，实际按需增长，不是预分配）。
        cursor.execute(f"PRAGMA cache_size=-{SQLITE_CACHE_SIZE_KIB}")
        # 只读映射：让 SQLite 直接读页而不是逐次 read()，WAL 模式下对读多写少最有效。
        # 映射失败（部分网络文件系统）时 SQLite 会自动退回普通 I/O，不会报错。
        cursor.execute(f"PRAGMA mmap_size={SQLITE_MMAP_SIZE_BYTES}")
        # 临时表（排序 / 分组）放内存，避免 /tmp 往返。
        cursor.execute("PRAGMA temp_store=MEMORY")
    finally:
        cursor.close()


class Database:
    """全局 Engine + 会话工厂封装。"""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        parsed_url = make_url(database_url)
        is_sqlite = parsed_url.get_backend_name() == "sqlite"
        connect_args: dict[str, object] = {}
        if is_sqlite:
            # FastAPI 线程池会在不同线程复用连接，关闭同线程检查。
            connect_args["check_same_thread"] = False
        # SQLite 内存库由 SingletonThreadPool 承载，不接受 pool_size / max_overflow /
        # pool_timeout；SQLite 文件与 Postgres 走可配的 QueuePool。
        pool_kwargs: dict[str, object] = {}
        if not (is_sqlite and parsed_url.database in (None, "", ":memory:")):
            pool_kwargs = {
                "pool_size": _environment_int(
                    "HOMEOS_DB_POOL_SIZE", DEFAULT_POOL_SIZE, minimum=1
                ),
                "max_overflow": _environment_int(
                    "HOMEOS_DB_MAX_OVERFLOW", DEFAULT_MAX_OVERFLOW
                ),
                "pool_timeout": _environment_float(
                    "HOMEOS_DB_POOL_TIMEOUT_SECONDS",
                    DEFAULT_POOL_TIMEOUT_SECONDS,
                    minimum=0.1,
                ),
            }
        self.engine: Engine = create_engine(
            database_url,
            connect_args=connect_args,
            pool_pre_ping=True,
            **pool_kwargs,
        )
        if database_url.startswith("sqlite"):
            event.listen(self.engine, "connect", _configure_sqlite)
        event.listen(self.engine, "before_cursor_execute", _record_query)
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
