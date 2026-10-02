# [补充说明] 数据库连接与 ORM 基类。
#
# 只做最简单的封装：一个全局 Engine、一个会话工厂，外加 SQLite 的连接级 PRAGMA。
# 业务逻辑一律写在调用方，这里不持有任何模型知识。
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    # [补充说明] 所有 ORM 模型的声明基类。
    #
    # 单独定义而不是直接用 DeclarativeBase，是为了让 `models.py` 与
    # `migrations/env.py` 导入到同一个类对象 —— 否则会出现两份元数据，
    # 迁移工具就看不到模型里定义的表。

    pass


class Database:
    # [补充说明] SQLite 引擎与会话工厂的持有者。

    def __init__(self, database_url: str) -> None:
        # [补充说明] 创建引擎与会话工厂。
        self.engine = create_engine(
            database_url,
            # check_same_thread=False 关掉的是 sqlite3 **自己**的同线程检查：请求级会话会被换手到
            # 别的线程上（同步依赖/同步路由在线程池线程、依赖清理也在线程池线程），这条检查无条件
            # 会直接拒。它**不依赖 URL 形态** —— SQLAlchemy 只对文件库默认关掉、内存库默认仍是 True。
            connect_args={'check_same_thread': False},
        )
        # 每个新连接都必须重新设置的 PRAGMA（连接级配置，不随库持久化）。
        event.listen(self.engine, 'connect', self._configure_sqlite)
        # autoflush=False：避免查询时隐式 flush 半成品对象；
        # expire_on_commit=False：提交后仍可读取对象属性，省掉一次回查。
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)

    @staticmethod
    def _configure_sqlite(connection, _record) -> None:
        # [补充说明] 为新建立的 SQLite 连接设置必需 PRAGMA（两者都是连接级，必须逐连接设置）。
        cursor = connection.cursor()
        # 打开外键约束：SQLite 默认不校验外键，删项目时子表会留下孤儿行。
        cursor.execute('PRAGMA foreign_keys=ON')
        # WAL 让读写互不阻塞。journal_mode 写进数据库文件头，重复设置是无害的幂等操作。
        cursor.execute('PRAGMA journal_mode=WAL')
        cursor.close()

    def sessions(self) -> Iterator[Session]:
        # [补充说明] 按需产出会话的生成器，供 FastAPI 依赖注入使用。
        #
        # 用 with 包裹，请求结束时无论成功失败都会关闭会话并归还连接。
        with self.session_factory() as session:
            yield session

    def dispose(self) -> None:
        # [补充说明] 释放连接池，在应用停止时调用，保证 WAL 正常收尾。
        self.engine.dispose()
