"""日志库的 ORM 基类与表清单（单独成文件，避免 ``models`` ↔ ``log_database`` 的导入环）。

为什么单独一个模块
------------------
``models.py`` 需要 ``LogBase`` 来声明日志表；``log_database.py`` 需要表清单来搬运/清理。
如果 ``LogBase`` 定义在 ``log_database`` 里，两者就互为依赖 —— 文件级 import 环会让
``platform → 上层`` 的依赖方向约定失败，而这类环在运行期
也意味着「谁都没法先完成初始化」。

把「基类 + 表名常量」抽到这个叶子模块后：``models`` 与 ``log_database`` 都只向下依赖它，
依赖方向重新变成单向。
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase

#: 日志库文件名（与 ``homeos.db`` 同目录）。
LOG_DB_NAME = "homeos-logs.db"

#: 属于日志库的表。新增时**必须**同时改这里与 ``schema.prepare_schema`` 的搬运清单
#: （同一个常量被两边读，不存在第二份）。
#:
#: 只收「高频写入 + 大体积 + 可丢」三条件都满足的表：
#:
#: - ``event_logs`` / ``event_log_stats_hourly``：HA 刷屏时一秒几百行，占库绝大部分；
#: - ``agent_context_timeline``：实测单机每天 20 万行以上。
#:
#: ``security_events``（每天个位数、写入点分散在整个审计面）与
#: ``energy_usage_*``（一次记账要和小时代码在同事务里写日/月聚合）**留在业务库**，
#: 理由写在各自的模型与 ``database`` 模块注释里。
LOG_TABLE_NAMES: tuple[str, ...] = (
    "event_logs",
    "event_log_stats_hourly",
    "agent_context_timeline",
)


class LogBase(DeclarativeBase):
    """日志库的 ORM 基类（与业务库 ``Base`` 分开，两个 ``metadata`` 各自建表）。"""
