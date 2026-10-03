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

    库结构由 ``core/migrations.py`` 负责：开发期跑 Alembic 迁移，发行产物里没有迁移
    脚本，改为按 ORM 元数据建库（基线 ``0001`` 与 ``Base.metadata`` 等价，见
    ``ops/check_schema.py`` 的结构指纹比对）。这里不暴露 create_all，是为了避免有人
    绕过 ``run_migrations`` 建库、让缺表被悄悄兜住 —— 本地看起来正常，换台机器就少一张表。
    """

    def __init__(self, settings: StoreSettings) -> None:
        self.settings = settings
        self.engine = create_store_engine(settings)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False, future=True)

    @contextmanager
    def session(self) -> Generator[Session]:
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
