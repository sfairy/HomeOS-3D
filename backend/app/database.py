"""数据库连接与 ORM 基类。

只做最简单的封装：一个全局 Engine、一个会话工厂，外加 SQLite 的连接级 PRAGMA。
业务逻辑一律写在调用方，这里不持有任何模型知识。

**谁在哪个线程上碰请求级会话（B36/B47）**：请求级会话由 FastAPI 的同步依赖产出
（``dependencies.get_database_session``），因此它会被三种线程先后碰到 ——

1. 线程池线程：同步依赖（认证/授权那几层）与同步路由（``def`` 路由）都在这里跑；
2. 事件循环线程：``async def`` 路由体在事件循环里执行；
3. 线程池线程：依赖的清理（关闭会话、归还连接）也由线程池跑。

三者是**顺序换手**而不是并发使用：会话由依赖持有，请求处理完才清理，同一时刻只有
一个线程在用它（连接池本身也保证一条连接同时只借给一个持有者）。真正需要外部保证的
只有 sqlite3 自己的跨线程能力 —— 见 :data:`REQUIRED_SQLITE_THREADSAFETY`：与其静默
依赖「这台机器上恰好是 serialized 构建」，不如在启动时检查一次。
"""
from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

#: 写锁等待上限（秒）：另一个连接正写着时，本连接最多等这么久，超时才报
#: ``database is locked``。没有它（原状）时那是**立刻**失败 —— 两个人同时保存，
#: 其中一个凭空报错，而重试往往就能成功（B36）。
BUSY_TIMEOUT_SECONDS = 30

#: 连接池规模。SQLite 是单写多读，池子只需要覆盖「同时在读写的人数」：满了之后
#: 新请求排队等 :data:`POOL_TIMEOUT_SECONDS`，而不是无上限地开连接 —— 并发写最终
#: 都在 SQLite 里排队，多开连接只是把等待挪个地方，还多占文件句柄。
POOL_SIZE = 10
MAX_OVERFLOW = 20
#: 等池子里有空闲连接的上限（秒）。取小于写锁等待：先在这里排队，比拿着连接干等好。
POOL_TIMEOUT_SECONDS = 15

#: sqlite3 模块必须达到的线程安全等级（PEP 249：3 = 模块/连接/游标都可共享，
#: 2 = 模块与连接可共享，1 = 只有模块可共享）。请求级会话会被换手到别的线程上
#: （见模块 docstring），这**只在** 2 以上（编译为 serialized / FULLMUTEX）时安全；
#: 更低等级的构建里跨线程用同一个连接是未定义行为。
REQUIRED_SQLITE_THREADSAFETY = 2


class DatabaseConfigurationError(RuntimeError):
    """运行环境不满足本服务对 SQLite 并发的前提。"""


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
        """创建引擎与会话工厂。

        参数:
            database_url: SQLAlchemy 连接串；SQLite 时走这里的 PRAGMA 配置。

        异常:
            DatabaseConfigurationError: 运行环境的 sqlite3 线程安全等级低于
                :data:`REQUIRED_SQLITE_THREADSAFETY`，跨线程换手不安全。
        """
        self._check_sqlite_threadsafety()
        self.engine = create_engine(
            database_url,
            # check_same_thread=False 关掉的是 sqlite3 **自己**的同线程检查：会话会被
            # 换手到别的线程（见模块 docstring），这条检查无条件下会直接拒。写出来是因为
            # 它表达了这个前提，并且**不依赖 URL 形态**（SQLAlchemy 只对文件库默认关掉它，
            # 内存库默认仍是 True）—— 真正的前提由 _check_sqlite_threadsafety 在构造时
            # 核过（B47），那一层与驱动默认值无关。
            connect_args={'check_same_thread': False, 'timeout': BUSY_TIMEOUT_SECONDS},
            pool_size=POOL_SIZE,
            max_overflow=MAX_OVERFLOW,
            pool_timeout=POOL_TIMEOUT_SECONDS,
        )
        # 每个新连接都必须重新设置的 PRAGMA（连接级配置，不随库持久化）。
        event.listen(self.engine, 'connect', self._configure_sqlite)
        # WAL 是库级设置，只在池子建第一条连接时做一次（B36），见 _enable_wal。
        event.listen(self.engine, 'first_connect', self._enable_wal)
        # autoflush=False：避免查询时隐式 flush 半成品对象；
        # expire_on_commit=False：提交后仍可读取对象属性，省掉一次回查。
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)

    @staticmethod
    def _check_sqlite_threadsafety() -> None:
        """确认 sqlite3 构建允许跨线程顺序使用连接（B47）。

        这是「请求级会话在事件循环线程与线程池线程之间换手」的**前提**，原先是默认
        成立的（CPython 默认 serialized），但从没被检查过也没被写下来：换一个
        ``SQLITE_THREADSAFE=0/2`` 编译的 sqlite3（或将来换成别的驱动）就会变成
        未定义行为，而症状是随机的崩溃或读到脏数据，不是一条清楚的报错。

        异常:
            DatabaseConfigurationError: 线程安全等级低于要求。
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
        # 写锁等待：与 connect_args 的 timeout 同一个值，两层都设是有意的 ——
        # 驱动层管「拿锁重试」，这里显式落一遍库级配置，且它可被排障时直接读到。
        cursor.execute(f'PRAGMA busy_timeout={BUSY_TIMEOUT_SECONDS * 1000}')
        cursor.close()

    @staticmethod
    def _enable_wal(connection, _record) -> None:
        """把库切到 WAL，**每个 Engine 只做一次**（B36）。

        ``journal_mode`` 是库级设置、写在数据库文件头里：一次打开之后就是 WAL，
        后续连接（包括别的进程、别的工具）看到的都是 WAL，不必逐连接再设一遍。
        原先挂在每个新连接上，等于连接池每扩容一次就去改一次库级状态 —— 而库正被
        别的连接写住时这条 PRAGMA 会失败，于是「池子要造新连接」这件与被改数据无关
        的事变成一次请求失败。放 ``first_connect``：只在池子建第一条连接时执行。
        """
        cursor = connection.cursor()
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
