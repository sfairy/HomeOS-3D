"""数据库连接与 ORM 基类。 只做最简单的封装：一个全局 Engine、一个会话工厂，外加 SQLite 的连接级 PRAGMA。"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):

    pass


class Database:

    def __init__(self, database_url: str) -> None:
        self.engine = create_engine(
            database_url,
            connect_args={'check_same_thread': False},
        )
        event.listen(self.engine, 'connect', self._configure_sqlite)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)

    @staticmethod
    def _configure_sqlite(connection, _record) -> None:
        cursor = connection.cursor()
        cursor.execute('PRAGMA foreign_keys=ON')
        cursor.execute('PRAGMA journal_mode=WAL')
        cursor.close()

    def sessions(self) -> Iterator[Session]:
        with self.session_factory() as session:
            yield session

    def dispose(self) -> None:
        self.engine.dispose()
