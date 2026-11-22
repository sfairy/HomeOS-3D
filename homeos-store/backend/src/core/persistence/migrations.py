"""HomeOS Store 数据库结构真源：**ORM 元数据**，不再有历史迁移链。

## 为什么只有一条基线

表结构由 `core/persistence/` 下的 SQLAlchemy 模型定义，全新装机时 `create_all` 直接按模型
建库（`prepare_schema` → `run_migrations` 的 fresh 分支），**一条迁移都不执行**。历史迁移
（曾经的 1–8 条）只做一件事：把更早的库补到当前结构 —— 邮箱归一化、单 live 绑定去重、
废弃 `releases` 表、手工表达式索引清理。那些升级路径为「从 0.7.x 一路升级上来」的商店部署
准备，作为全新系统交付时没有消费者。

现在只剩 **1 号基线**（空操作）：作用是给 `schema_migrations` 写一行可读记录，让「结构由谁
负责」在库里可见。后续结构变更从 2 号开始追加，规则与主应用 `platform/core/db/migrations.py`
完全一致：

1. 版本号连续递增，从 2 开始；`checksum` 一旦发布不得修改（改了要加新版本号）；
2. `apply` 内**必须**用 `connection.execute()` 逐条执行 —— 不要用 `executescript()`，
3. 迁移必须幂等（`IF NOT EXISTS` / 先查 `PRAGMA table_info`）；
4. 同时改模型与迁移，并跑 `ops/scripts/reset-schema-version.py --dry-run`。

## 升级到此版本的一次性动作

老库里留有 2–8 号记录时会因「记录的版本在当前代码中不存在」拒绝启动（刻意如此）。
处理方式只有一条 —— 先确认库结构与模型一致，再重置版本表：

```bash
node ops/lib/py.mjs ops/scripts/reset-schema-version.py --app store --dry-run
node ops/lib/py.mjs ops/scripts/reset-schema-version.py --app store
```
"""

from __future__ import annotations

import sqlite3
from typing import Any

from homeos_shared.schema_migrate import Migration, MigrationContext

#: 1 号基线：空操作。表结构由 ORM 模型负责（见模块说明）。
BASELINE_VERSION = 1
BASELINE_NAME = "baseline-0.8.8"
BASELINE_CHECKSUM = "s0001-baseline"


def _noop(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    """基线不做事：结构由 ``create_all`` 按 ORM 元数据建立。"""


MIGRATIONS: tuple[Migration, ...] = (Migration(BASELINE_VERSION, BASELINE_NAME, BASELINE_CHECKSUM, _noop),)


__all__: list[Any] = [
    "BASELINE_CHECKSUM",
    "BASELINE_NAME",
    "BASELINE_VERSION",
    "MIGRATIONS",
]
