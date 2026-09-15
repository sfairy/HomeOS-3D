"""数据库连接与 ORM 基类。

只做最简单的封装：一个全局 Engine、一个会话工厂，外加 SQLite 的连接级 PRAGMA。
业务逻辑一律写在调用方，这里不持有任何模型知识。
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """所有 ORM 模型的声明基类。

    单独定义而不是直接用 DeclarativeBase，是为了让 `models.py` 与
    `migrations/env.py` 导入到同一个类对象 —— 否则会出现两份元数据，
    迁移工具就看不到模型里定义的表。
    """

    pass


class Database:
    """SQLite 引擎与会话工厂的持有者。"""

    def __init__(self, database_url: str) -> None:
        # check_same_thread=False：FastAPI 会把同步依赖丢到线程池里执行，
        # 关闭 SQLite 默认的同线程检查，否则会话跨线程使用会直接报错。
        self.engine = create_engine(database_url, connect_args={'check_same_thread': False})
        # 每个新连接都必须重新设置 PRAGMA —— 它是连接级配置，不会随库持久化。
        event.listen(self.engine, 'connect', self._configure_sqlite)
        # autoflush=False：避免查询时隐式 flush 半成品对象；
        # expire_on_commit=False：提交后仍可读取对象属性，省掉一次回查。
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)

    @staticmethod
    def _configure_sqlite(connection, _record) -> None:
        """为新建立的 SQLite 连接设置必需 PRAGMA。"""
        cursor = connection.cursor()
        # 打开外键约束：SQLite 默认不校验外键，删项目时子表会留下孤儿行。
        cursor.execute('PRAGMA foreign_keys=ON')
        # WAL 模式：读写并发，避免展示页读取时被写入阻塞。
        cursor.execute('PRAGMA journal_mode=WAL')
        cursor.close()

    def sessions(self) -> Iterator[Session]:
        """按需产出会话的生成器，供 FastAPI 依赖注入使用。

        用 with 包裹，请求结束时无论成功失败都会关闭会话并归还连接。
        """
        with self.session_factory() as session:
            yield session

    def dispose(self) -> None:
        """释放连接池，在应用停止时调用，保证 WAL 正常收尾。"""
        self.engine.dispose()
