"""SQLite 引擎与会话工厂。"""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from ..config import StoreSettings

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
    """轻量封装：持有 engine 并提供会话上下文。

    注意这里**没有** ``create_all``：库结构由 Alembic 迁移负责（``core/migrations.py``）。
    保留一个「按 ORM 建表」的入口会让基线迁移漏掉的东西被悄悄兜住 —— 本地看起来一切正常，
    换一台机器启动就少一张表。
    """

    def __init__(self, settings: StoreSettings) -> None:
        self.settings = settings
        self.engine = create_store_engine(settings)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False, future=True)

    @contextmanager
    def session(self) -> Generator[Session, None, None]:
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
