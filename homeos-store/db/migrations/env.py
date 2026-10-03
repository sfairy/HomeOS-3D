"""Alembic 环境：把商店 ORM 元数据接到迁移脚本上。

与主应用的 ``homeos-3d/migrations/env.py`` 保持同一套**运行**约定：只支持在线模式，
迁移只在应用内执行（见 ``backend/src/core/migrations.py``），不提供 ``--sql``。
但 import 布局两者并不一样：主应用把项目根放上 path、包名是 ``backend.src``，商店则是
把 ``backend`` 放上 path、包名就是 ``src``。下面这段 sys.path 注入是商店这一侧的约定，
不是从主应用照抄的模板。
"""
from __future__ import annotations

import sys
import warnings
from logging.config import fileConfig
from pathlib import Path

# ``homeos-store/db/migrations`` → 把 ``backend`` 放进 path，才能 ``import src``。
_BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.exc import SAWarning

#: 副作用导入：这两个模块**必须**被导入到，否则 ORM 映射表不会注册进
#: ``Base.metadata``，``alembic check`` 会以为那些表是「库里多出来的」，进而
#: 自动生成把它们删掉的迁移。ruff（F401）与 pyright（reportUnusedImport）都看不出
#: 「导入即副作用」，所以两边各挂一个抑制 —— 它们是这类导入的标准写法，不是遗漏。
from src.core import models, models_engagement  # noqa: F401  # pyright: ignore[reportUnusedImport]
from src.core.database import BUSY_TIMEOUT_SECONDS, Base

config = context.config

if config.config_file_name is not None:
    # ``disable_existing_loggers=False`` 是**承重**的，不是风格选择：应用启动时就地跑迁移，
    # 默认的 fileConfig 会把已经装配好的 ``src`` logger 全部禁用，迁移日志与后续启动日志
    # 会一起消失。
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata

#: ``orders`` 与 ``licenses`` 互相持有外键（一笔订单产生一张授权，一张授权又指回它是被哪笔
#: 订单改过的），于是 alembic 建表前的拓扑排序无解，它会把这两张表涉及的外键排除在**结构比较**
#: 之外、并且每次运行都告警。这个环是刻意的建模选择（见 models.py 里 ``post_update`` 的说明），
#: 在 SQLite 上也没有出路：``use_alter=True`` 会把外键改写成
#: ``ALTER TABLE ... ADD CONSTRAINT``，而 SQLite 不支持这条语句。
#: 排序对 SQLite 本身无害 —— 建表时的前向引用不会被校验。所以这里只对这条**已知且已确认**的
#: 告警降噪，其余警告照常抛出（不要把它放宽成忽略整个 SAWarning 类别）。
warnings.filterwarnings("ignore", message=".*unresolvable cycles.*", category=SAWarning)


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        #: 迁移期间可能有人在读写同一个库文件（例如另一个还在跑的旧进程）。没有等待上限时
        #: 一次锁冲突就直接报 "database is locked"，把一次可自愈的启动变成起不来。
        connect_args={"timeout": BUSY_TIMEOUT_SECONDS},
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
        #: SQLite 的 ``transactional_ddl`` 是 False，``begin_transaction()`` 在这里返回
        #: ``nullcontext()``；显式提交一次，确保版本表落盘。
        connection.commit()


# 只支持在线模式。alembic 的离线模式（``--sql``：不连库、只打印 SQL）在这里没有调用方：
# 迁移由应用启动流程驱动，目标库路径也只有 StoreSettings 知道。多一条「打印 SQL 给人看」
# 的通道，就多一种「看起来迁移了、其实没落库」的可能。
if context.is_offline_mode():
    raise RuntimeError(
        "本仓库不支持 alembic 离线模式（--sql）：迁移只在应用内以在线方式执行"
        "（见 backend/src/core/migrations.py）。"
    )
run_migrations_online()
