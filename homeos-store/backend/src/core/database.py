"""SQLite 引擎与会话工厂。"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from src.config import StoreSettings

BUSY_TIMEOUT_SECONDS = 5


class Base(DeclarativeBase):
    """所有 ORM 模型的基类。"""


def _set_sqlite_pragma(dbapi_connection, _record) -> None:
    """逐连接设置：外键约束与写锁等待。
    """
    cursor = dbapi_connection.cursor()
    # 打开外键约束：SQLite 默认不校验外键，删商品/订单时子表会留下孤儿行。
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_SECONDS * 1000}")
    cursor.close()


def _enable_wal(dbapi_connection, _record) -> None:
    """把库切到 WAL，**每个 Engine 只做一次**。
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
        from src.core import models  # noqa: F401

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
