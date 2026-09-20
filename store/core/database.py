"""SQLite 引擎与会话工厂。"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from store.config import StoreSettings

#: SQLite 写锁等待（秒）。驱动层管「拿锁重试」（``connect_args['timeout']``），PRAGMA 层
#: 再把它落到连接上，让排障时可以直接读回来；两层都设是刻意的。
BUSY_TIMEOUT_SECONDS = 5


class Base(DeclarativeBase):
    """所有 ORM 模型的基类。"""


def _set_sqlite_pragma(dbapi_connection, _record) -> None:  # pragma: no cover - 驱动回调
    """逐连接设置：外键约束与写锁等待。

    这两条都是**连接级**的，所以必须每个新连接设一遍。库级的 ``journal_mode`` 不在这里，
    见 ``_enable_wal``。
    """
    cursor = dbapi_connection.cursor()
    # 打开外键约束：SQLite 默认不校验外键，删商品/订单时子表会留下孤儿行。
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_SECONDS * 1000}")
    cursor.close()


def _enable_wal(dbapi_connection, _record) -> None:  # pragma: no cover - 驱动回调
    """把库切到 WAL，**每个 Engine 只做一次**。

    ``journal_mode`` 是库级设置、写在数据库文件头里：一次打开之后就是 WAL。挂在每个新
    连接上等于池子每扩容一次就改一次库级状态，而库正被写住时这条 PRAGMA 会失败。
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def create_store_engine(settings: StoreSettings) -> Engine:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        settings.database_url,
        future=True,
        connect_args={"check_same_thread": False, "timeout": BUSY_TIMEOUT_SECONDS},
    )
    event.listen(engine, "connect", _set_sqlite_pragma)
    event.listen(engine, "first_connect", _enable_wal)
    return engine


class Database:
    """轻量封装：持有 engine 并提供会话上下文。"""

    def __init__(self, settings: StoreSettings) -> None:
        self.settings = settings
        self.engine = create_store_engine(settings)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False, future=True)

    def create_all(self) -> None:
        # 导入模型以注册元数据。**刻意放在函数里**：models 在模块级从本模块取 Base，
        # 模块级反导会构成循环。这是全仓唯一一处有正当理由的函数内导入。
        from store.core import models  # noqa: F401

        Base.metadata.create_all(self.engine)

    @contextmanager
    def session(self) -> Iterator[Session]:
        session = self.session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def dispose(self) -> None:
        self.engine.dispose()
