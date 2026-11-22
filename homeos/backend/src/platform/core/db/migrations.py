"""主应用数据库结构真源：**ORM 元数据**，不再有历史迁移链。

## 为什么只有一条基线

表结构由 `platform/core/db/` 下的 SQLAlchemy 模型定义，全新装机时 `create_all` 直接按模型
建库（`prepare_schema` → `run_migrations` 的 fresh 分支），**一条迁移都不执行**。历史迁移
（曾经的 1–27 条）只做一件事：把更早的库补到当前结构。

那些升级路径是为「从 0.7.x 一路升级上来」的部署准备的。作为全新系统交付时它们没有消费者，
却持续带来成本：

- 754 行里 500+ 行是「某字段曾叫另一个名字」「某张表曾缺某列」的补丁；
- 每条迁移都要求作者不改语义（checksum 冻结），旧代码无法随模型一起演进；
- 排查结构问题要同时读模型和 27 段补丁，才能知道「现在长什么样」。

现在只剩 **1 号基线**（空操作）：作用是给 `schema_migrations` 写一行可读记录，让「结构由谁
负责」在库里可见。后续结构变更从 2 号开始追加，规则见文末。

## 升级到此版本的一次性动作

库里留有 2–27 号记录、或者根本没有版本记录时会因「结构来历无法证明」拒绝启动（刻意如此：
宁可拒绝，也不要按错的假设继续跑）。处理方式只有一条 —— 先确认库结构与模型一致，再重置
版本表：

```bash
node ops/lib/py.mjs ops/scripts/reset-schema-version.py --app homeos --dry-run   # 比对结构与模型
node ops/lib/py.mjs ops/scripts/reset-schema-version.py --app homeos            # 一致才允许重置
```

脚本先做逐表/逐列/逐索引比对，不一致就拒绝执行 —— 否则「重置版本」会把一个真的缺列的库
伪装成最新版本，之后再也无人发现。

## 新增迁移的规则

1. 版本号连续递增，从 2 开始；`checksum` 一旦发布不得修改（改了要加新版本号）；
2. `apply` 内**必须**用 `connection.execute()` 逐条执行 —— 不要用 `executescript()`，
   它会隐式 COMMIT，破坏事务原子性；
3. 迁移必须幂等（`IF NOT EXISTS` / 先查 `PRAGMA table_info`）：`create_all` 建出的新库与
   「迁移升上来的库」必须落到同一形状；
4. 同时改模型与迁移，并跑 `ops/scripts/reset-schema-version.py --dry-run` —— 它会告诉你
   模型与库是否已经同源。
"""

from __future__ import annotations

import sqlite3

from homeos_shared.schema_migrate import Migration, MigrationContext
from homeos_shared.sqlite_schema import table_columns, table_indexes

#: 1 号基线：空操作。表结构由 ORM 模型负责（见模块说明）。
BASELINE_VERSION = 1
BASELINE_NAME = "baseline-0.8.8"
BASELINE_CHECKSUM = "h0001-baseline"


def _noop(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    """基线不做事：结构由 ``create_all`` 按 ORM 元数据建立。"""


MIGRATIONS: tuple[Migration, ...] = (Migration(BASELINE_VERSION, BASELINE_NAME, BASELINE_CHECKSUM, _noop),)


#: 结构比对脚本用的兼容别名：真源在 ``homeos_shared.sqlite_schema``。
schema_columns = table_columns
schema_indexes = table_indexes

__all__ = [
    "BASELINE_CHECKSUM",
    "BASELINE_NAME",
    "BASELINE_VERSION",
    "MIGRATIONS",
    "schema_columns",
    "schema_indexes",
]
