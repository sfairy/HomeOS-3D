"""数据库连接与 ORM 基类。
"""
from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

#: 写锁等待上限（秒）：另一个连接正写着时，本连接最多等这么久，超时才报
BUSY_TIMEOUT_SECONDS = 30

#: 连接池规模。SQLite 是单写多读，池子只需要覆盖「同时在读写的人数」：满了之后
POOL_SIZE = 10
MAX_OVERFLOW = 20
#: 等池子里有空闲连接的上限（秒）。取小于写锁等待：先在这里排队，比拿着连接干等好。
POOL_TIMEOUT_SECONDS = 15

#: sqlite3 模块必须达到的线程安全等级（PEP 249：3 = 模块/连接/游标都可共享，
REQUIRED_SQLITE_THREADSAFETY = 2


class DatabaseConfigurationError(RuntimeError):
    """运行环境不满足本服务对 SQLite 并发的前提。"""


class Base(DeclarativeBase):
    """所有 ORM 模型的声明基类。
    """



class Database:
    """SQLite 引擎与会话工厂的持有者。"""

    def __init__(self, database_url: str) -> None:
        """创建引擎与会话工厂。
        """
        self._check_sqlite_threadsafety()
        self.engine = create_engine(
            database_url,
            connect_args={'check_same_thread': False, 'timeout': BUSY_TIMEOUT_SECONDS},
            pool_size=POOL_SIZE,
            max_overflow=MAX_OVERFLOW,
            pool_timeout=POOL_TIMEOUT_SECONDS,
        )
        # 每个新连接都必须重新设置的 PRAGMA（连接级配置，不随库持久化）。
        event.listen(self.engine, 'connect', self._configure_sqlite)
        # WAL 是库级设置，只在池子建第一条连接时做一次，见 _enable_wal。
        event.listen(self.engine, 'first_connect', self._enable_wal)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)

    @staticmethod
    def _check_sqlite_threadsafety() -> None:
        """确认 sqlite3 构建允许跨线程顺序使用连接。
        """
        threadsafety = sqlite3.threadsafety
        if threadsafety < REQUIRED_SQLITE_THREADSAFETY:
            raise DatabaseConfigurationError(
                f'SQLite 的线程安全等级是 {threadsafety}，低于本服务要求的'
                f' {REQUIRED_SQLITE_THREADSAFETY}：请求级会话会在事件循环线程与线程池线程之间'
                '顺序换手，低等级构建下跨线程使用同一个连接是未定义行为。'
                '请改用以 SQLITE_THREADSAFE=1（serialized）编译的 sqlite3。'
            )

    @staticmethod
    def _configure_sqlite(connection, _record) -> None:
        """为新建立的 SQLite 连接设置必需 PRAGMA（两者都是连接级，必须逐连接设置）。"""
        cursor = connection.cursor()
        # 打开外键约束：SQLite 默认不校验外键，删项目时子表会留下孤儿行。
        cursor.execute('PRAGMA foreign_keys=ON')
        cursor.execute(f'PRAGMA busy_timeout={BUSY_TIMEOUT_SECONDS * 1000}')
        cursor.close()

    @staticmethod
    def _enable_wal(connection, _record) -> None:
        """把库切到 WAL，**每个 Engine 只做一次**。
        """
        cursor = connection.cursor()
        cursor.execute('PRAGMA journal_mode=WAL')
        cursor.close()

    def sessions(self) -> Iterator[Session]:
        """按需产出会话的生成器，供 FastAPI 依赖注入使用。
        """
        with self.session_factory() as session:
            yield session

    def dispose(self) -> None:
        """释放连接池，在应用停止时调用，保证 WAL 正常收尾。"""
        self.engine.dispose()
