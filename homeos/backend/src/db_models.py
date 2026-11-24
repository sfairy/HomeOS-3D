"""ORM 元数据的**装配点**（组合根）。

## 为什么这个文件在 `src/` 根而不是 `platform/core/db/`

`Base.metadata` 是一张全局表：任何模块只要 import 了一个 `Base` 子类，那张表就被注册
进去了。原先「把全部模型模块都 import 一遍」这件事写在
``platform/core/db/schema.py::_metadata()`` 里 —— 但 `platform` 是架构检查（B1）里
**不允许向上依赖**的叶子层。于是出现了一个结构性问题：

- 域想要拥有自己的表定义（`domains/media/schema.py`），就必须让某个地方 import 它；
- 而唯一做这件事的地方在 `platform`，一旦它在文件里出现 `from ...domains.media import schema`，
  就成了 `platform → domains`，B1 直接失败。

把装配上移到组合根解掉这个死结：`platform` 只保留「按给定 metadata 建表 / 自检」的
通用能力，**谁的表由谁注册**由本文件负责。本文件在架构检查里登记为 `bootstrap` 层
（见 ``ops/checks/architecture/check_backend_deps.py`` 的 ``HOMEOS_ROOT_MODULES``），
和 ``app.py`` / ``run.py`` 同类。

## 为什么仍然是一次性 import 全部

`create_all` / `missing_schema_objects` 需要**完整**的 metadata：漏一个模块就等于漏一张表，
而症状是「自检脚本报 no such table」或「生产启动少建一张表」——都是难查的静默失败。
所以这里的清单必须与 `platform/core/db/models.py` 等模块的实际内容保持同步；
新增模型模块时**必须**在这里追加一行（`check:routes` 之类的门禁看不到这种遗漏，
只能靠代码评审 + 本注释）。
"""

from __future__ import annotations

from sqlalchemy.engine import Engine
from sqlalchemy.schema import MetaData

from .domains.media import schema as _media_schema  # 域层表定义（第一个样板）
from .platform.core.db import (  # noqa: F401  # 同上：import 即注册
    automation_models,
    device_profile_models,
    learning_models,
)

# 平台层的通用表（用户 / 会话 / 通知 / 系统配置 / 安全事件 / 能耗 / 项目 / HA 目录 / Agent）。
from .platform.core.db import models as _platform_models  # 注册到 Base.metadata
from .platform.core.db.database import Base
from .platform.core.db.log_base import LogBase


def main_metadata() -> MetaData:
    """业务库的 metadata（48 张表）。"""
    # 引用一次，明确「本函数依赖上面的 import 副作用」，避免被判定为无用导入而删除。
    assert _platform_models is not None
    assert _media_schema is not None
    return Base.metadata


def log_metadata() -> MetaData:
    """日志 / 观测量库的 metadata（事件日志、小时汇总、设备时序）。

    依赖 ``main_metadata()``：``EventLog`` / ``EventLogStat`` / ``AgentContextTimeline``
    与业务表定义在同一个 ``models.py`` 里（它们继承 ``LogBase``），import 一次两个 metadata
    一起就绪。
    """
    main_metadata()
    return LogBase.metadata


def create_all_schemas(engine: Engine) -> None:
    """在**同一个** engine 上建两套表（源码态 / 自检 / 单文件部署用）。

    生产走 ``prepare_schema`` 的两个库；这里只服务「一个临时 SQLite 跑自检」的场景，
    让那些没有拆库的测试仍然拿得到日志表。
    """
    main_metadata().create_all(engine)
    log_metadata().create_all(engine)


__all__ = ["create_all_schemas", "log_metadata", "main_metadata"]
