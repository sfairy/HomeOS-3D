"""启动时把存量库对齐到 ORM：补缺列、补缺索引、按白名单删退役列（幂等）。

store 的库不走 Alembic：结构由 ``create_all`` 建立，但 ``create_all`` 只建
**缺失的表**，对已存在的表**不会加列**。于是新增字段在全新库上一切正常，
在存量部署上却会以 ``no such column`` 在运行时炸掉 —— 而且往往只在某条特定
路径（「查发信记录」「读支付宝凭据」）才会触发，排查成本很高。

这里在启动时对比 ORM 元数据与 ``PRAGMA table_info``，把缺的列用
``ALTER TABLE ... ADD COLUMN`` 补上，把缺的索引用 ``CREATE INDEX IF NOT EXISTS``
补上，把 ``_RETIRED_COLUMNS`` 里登记过的退役列用 ``ALTER TABLE ... DROP COLUMN``
删掉。

边界刻意收窄，**只做加列、建索引，以及删除显式登记过的退役列**：

- 删列走 ``_RETIRED_COLUMNS`` 白名单，**不做**「ORM 里没有的列一律删」。ORM 不是
  唯一事实来源：一次误删模型字段就会在下次启动时静默毁掉整列数据。只有被明确
  登记过的列才会被删，代价是每退役一列要多写一行。
- 改类型、改可空性仍然只打 warning，留给运维人工处理：它们在 SQLite 上要么需要
  重建整张表、要么会静默丢数据。
- 表级 ``UniqueConstraint`` 无法通过 ``ALTER TABLE`` 追加；这类差异同样只报
  warning。（新表由 ``create_all`` 建全，不受影响。）
- **唯一性约束一律声明成 ``Index(..., unique=True)`` 而不是 ``UniqueConstraint``**：
  前者能在这里用 ``CREATE UNIQUE INDEX IF NOT EXISTS`` 补到存量库上，后者补不了，
  只能年复一年地打「请人工重建该表」。代价是存量库里**已经有重复行**时建索引会失败，
  于是有了 ``_DEDUPE_BEFORE_UNIQUE``：登记过的索引在补建前先按「合并后可见权限不减少」
  的规则合并重复行（并先整份备份数据库文件），没登记的（如 ``orders``）仍旧只告警 ——
  订单重复行各自代表一笔真实交易，没有「哪一行是冗余」的定义。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping

from sqlalchemy import inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.schema import Column

from store.core.database import Base
import store.core.models  # noqa: F401  仅为注册全部模型元数据

logger = logging.getLogger("store.schema")

#: 已从 ORM 退役、需从存量库**物理删除**的列：``{表名: (列名, ...)}``。
#: 必须显式登记而非「ORM 里没有就删」：SQLite 删列要重建整张表，放宽成自动对比就会在
#: 某次误删模型字段时无声毁掉整列；且 ``Mapped[str]`` 推断出的 ``NOT NULL`` 没有默认值，
#: ORM 一旦不再映射它，INSERT 省略该列会每次以 ``NOT NULL constraint failed`` 失败 ——
#: 且只在存量库上失败，全新库反而看不出来。
_RETIRED_COLUMNS: dict[str, tuple[str, ...]] = {
    # 提现不再收集联系 QQ，改为让用户凭申请编号联系客服。
    "referral_withdrawals": ("qq",),
    # 提现引导从「加入 QQ 群」改为「联系客服」，QQ 群配置随之退役。
    "store_settings": (
        "referral_qq_group",
        "referral_qq_url",
        # 该模板从未被任何下单路径读取（订单号统一由 `security.new_order_no` 生成），且默认值
        # 与后台提示文案对不上 —— 留着是个「改了没有任何反应」的假旋钮，排障时还会引错方向。
        "payment_merchant_order_template",
    ),
    # 账号级的「最近一次解绑设备」。
    # 退役理由：它有两个写入点（`store.api.store.release_device` 与
    # `store.api.admin.admin_release_binding`），但那两处**同一事务里都写了
    # `device_release_events`**（含 `account_id`），所以这一列完全是派生值；而它唯一的
    # 消费点 `account_payload`（账号中心与后台共用）序列化出来之后**没有任何前端读它**
    # —— 既不在账号中心渲染，也不在后台账户面板里。一个「写得进去、读不出来、还能从
    # 事件表算出来」的列留着只会在下次读代码时多引一遍疑。
    # 需要这个读数时按 `max(device_release_events.created_at) where account_id = ?` 取。
    "accounts": ("last_device_release_at",),
}

#: ``ALTER TABLE ... DROP COLUMN`` 自 SQLite 3.35.0（2021-03-12）起可用。
#: 官方镜像 ``python:3.12-slim`` 带的是 3.40+，本地 Python 3.14 带 3.50+，都在范围内。
_MIN_SQLITE_DROP_COLUMN = (3, 35, 0)


@dataclass(frozen=True)
class _UniqueIndexRepair:
    """补唯一索引前如何合并重复行。

    ``key`` 是索引的列（唯一性按它判定），``keep`` 是保留哪一行的 ``ORDER BY``
    片段（排在前的当基准行，其余列从它继承），``merge`` 是 ``{列名: 合并方式}``。

    合并方式只有三种，全部满足同一条不变量 —— **合并后客户端可见的权限不减少**：

    - ``any_true``：任一为真则为真（布尔 OR）。用于 ``active``：把两条重复权益里
      生效的那条并进来，绝不因为去重而把已经放行的功能关掉。
    - ``earliest`` / ``latest``：取最早/最晚；**任一为 NULL 即为 NULL**（NULL 在这两列
      上的语义是「无起止限制」，也就是最宽松的那一端）。

    为什么只能白名单式合并：合并会**删数据**。``orders`` 上的部分唯一索引建不起来时
    同样只告警（订单重复行各自代表一笔真实交易，没有「哪一行是冗余」的定义），这条
    规则只对「同一组键上的重复行表达同一件事」的表成立。
    """

    key: tuple[str, ...]
    keep: str
    merge: Mapping[str, str]


#: 补唯一索引前先合并重复行的索引：``{索引名: 规则}``。
_DEDUPE_BEFORE_UNIQUE: dict[str, _UniqueIndexRepair] = {
    # 同一张授权下同一个功能码只能有一条（后台新增权益时也是这么判的，但那是
    # check-then-act：并发/历史数据都能留下重复行，而 ``features_for`` 是「任一
    # 条生效就放行」，重复行会让「这条功能到底什么时候到期」失去唯一答案）。
    "uq_entitlements_license_feature": _UniqueIndexRepair(
        key=("license_id", "feature_code"),
        # 优先留生效的那条，其次留最近改过的。
        keep="active DESC, created_at DESC, id DESC",
        merge={"active": "any_true", "starts_at": "earliest", "expires_at": "latest"},
    ),
    # 同一个 (product, channel, version) 只应有一条：客户端查更新时不该看到
    # 同一版本的两种说法。留最近创建的那条（运维最后一次编辑的结果）。
    "uq_releases_product_channel_version": _UniqueIndexRepair(
        key=("product", "channel", "version"),
        keep="created_at DESC, id DESC",
        merge={},
    ),
    # 同一台设备在同一张授权下只应有一条绑定；重复绑定的后果是「同一台机器占两个
    # 名额」，解绑时又只解掉一条。留最近心跳的那条，并按最宽松合并 active/released_at：
    # 被删的那条若有活跃会话，FK CASCADE 会一并清掉，客户端下次请求即重新激活。
    "uq_device_bindings_license_instance": _UniqueIndexRepair(
        key=("license_id", "instance_id"),
        keep="active DESC, last_heartbeat_at DESC, created_at DESC, id DESC",
        merge={"active": "any_true", "released_at": "latest"},
    ),
}

#: 合并方式白名单，顺序即语义（见 ``_UniqueIndexRepair``）。
_MERGE_MODES = ("any_true", "earliest", "latest")


def backup_database(
    engine: Engine, *, directory: Path | None = None, label: str = "backup"
) -> Path | None:
    """改动数据前把 SQLite 库备份成一份可还原的快照，返回备份路径。

    只对「文件型 SQLite」有效：内存库（测试里常用）没有可复制的文件，直接返回
    ``None``；其它方言（运维自己换了库）也不做文件级备份，返回 ``None`` 并在日志里
    说明 —— 调用方仍是「先验证后销毁」，备份只是额外的一层保险。
    备份**失败**同样返回 ``None``（不抛），但会以 ERROR 记录下来：调用方（退役列、
    积分迁移）都是不可逆动作，运维需要知道这次是「没有网」在走钢丝。

    ``label`` 进文件名（``<库名>.pre-<label>-<时间戳>.bak``），便于运维一眼看出这份
    快照是哪个动作之前留的。
    """
    if engine.dialect.name != "sqlite":
        logger.info("方言 %s 不做文件级备份：请自行确认已有可还原的备份。", engine.dialect.name)
        return None

    database_path = str(engine.url.database or "")
    if not database_path or database_path == ":memory:":
        return None

    source = Path(database_path)
    if not source.is_file():
        return None

    target_dir = Path(directory) if directory is not None else source.parent
    #: 目标目录可能不存在（CLI 允许把快照放到独立目录）。这里必须自己建：
    #: ``VACUUM INTO`` 不会建目录，只会以「unable to open database file」失败。
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    destination = target_dir / f"{source.name}.pre-{label}-{stamp}.bak"
    #: 同一秒内的第二次备份会撞上这个名字，而 ``VACUUM INTO`` 撞名是**直接报错** ——
    #: 于是这次调用一份快照都没有，偏偏这时正是「刚改过一次、马上又要改」的高风险时刻
    #: （同一秒重启、或两个进程同时启动）。加序号而不是覆盖：两份快照都不该丢。
    suffix = 1
    while destination.exists():
        destination = target_dir / f"{source.name}.pre-{label}-{stamp}-{suffix}.bak"
        suffix += 1

    #: **不能直接 ``shutil.copy2(store.db)``**：库跑在 WAL 模式下，未 checkpoint 的写入还在
    #: ``store.db-wal`` 里，复制出的 .bak 可能一张表都没有却看起来完全正常（「以为有备份」
    #: 比「知道自己没有备份」危险得多）。用 `VACUUM INTO` 写一致快照，且连接须 AUTOCOMMIT。
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            connection.exec_driver_sql("VACUUM INTO ?", (str(destination),))
    except Exception as error:  # noqa: BLE001 - 备份失败不能带走调用方，但要留痕
        #: 半截文件比没有文件更危险（文件名、大小都像那么回事）。宁可删掉让运维确认。
        destination.unlink(missing_ok=True)
        logger.error(
            "备份数据库失败（%s）：本次没有文件级快照，接下来的不可逆动作没有退路 —— %s",
            source,
            error,
        )
        return None
    logger.warning("改动数据前已备份数据库：%s（确认结果无误后可自行删除）", destination)
    return destination


def _merge_values(mode: str, values: list) -> object:
    """按 ``mode`` 合并一组重复行的同名列取值（语义见 ``_UniqueIndexRepair``）。"""
    if mode == "any_true":
        return 1 if any(bool(value) for value in values) else 0
    if mode == "earliest":
        return None if any(value is None for value in values) else min(values)
    if mode == "latest":
        return None if any(value is None for value in values) else max(values)
    raise ValueError(f"未知的合并方式：{mode}")


def _repair_duplicates(engine: Engine, table_name: str, index_name: str) -> int:
    """合并 ``index_name`` 对应的重复行，返回被合并掉（删除）的行数。

    只在 ``_DEDUPE_BEFORE_UNIQUE`` 登记过的索引上动作；表不存在、表没有主键、或
    规则里出现了不认识的合并方式时**什么都不做**并告警 —— 结构修复失败不该让服务
    起不来，但也不能静默地删错东西。
    """
    repair = _DEDUPE_BEFORE_UNIQUE.get(index_name)
    if repair is None:
        return 0

    table = Base.metadata.tables.get(table_name)
    if table is None or not set(repair.key) <= set(table.columns.keys()):
        logger.warning("表 %s 上没有 %s 需要的列，跳过重复行合并。", table_name, index_name)
        return 0
    primary_key = [column.name for column in table.primary_key.columns]
    if not primary_key:
        logger.warning("表 %s 没有主键，无法安全合并重复行（跳过）。", table_name)
        return 0

    unknown = sorted(set(repair.merge.values()) - set(_MERGE_MODES))
    if unknown:
        logger.warning("索引 %s 的合并规则含未知方式 %s，跳过合并。", index_name, "、".join(unknown))
        return 0

    with engine.connect() as connection:
        rows = connection.execute(select(table).order_by(*_order_by(table, repair.keep))).mappings().all()

    groups: dict[tuple, list] = {}
    for row in rows:
        groups.setdefault(tuple(row[name] for name in repair.key), []).append(row)
    duplicated = {key: group for key, group in groups.items() if len(group) > 1}
    if not duplicated:
        return 0

    removed = 0
    #: 备份必须在删除之前：这是唯一一步会**删用户数据**的结构修复。
    backup = backup_database(engine, label=f"merge-{index_name}")
    with engine.begin() as connection:
        for group in duplicated.values():
            base = group[0]
            values = {}
            for column, mode in repair.merge.items():
                merged = _merge_values(mode, [row[column] for row in group])
                if merged != base[column]:
                    values[column] = merged
            if values:
                connection.execute(
                    table.update()
                    .where(*[table.c[name] == base[name] for name in primary_key])
                    .values(**values)
                )
            for row in group[1:]:
                connection.execute(
                    table.delete().where(*[table.c[name] == row[name] for name in primary_key])
                )
                removed += 1

    logger.warning(
        "表 %s 有 %d 组重复行，已按「合并后权限不减少」合并掉 %d 行，以便建立唯一索引 %s"
        "（合并前备份：%s）。请检查是否有业务上的意外。",
        table_name,
        len(duplicated),
        removed,
        index_name,
        backup if backup is not None else "内存库/非文件库，无文件级备份",
    )
    return removed


def _order_by(table, clause: str) -> list:
    """把 ``ORDER BY`` 片段（形如 ``"active DESC, created_at DESC"``）解析成表达式列表。"""
    expressions = []
    for part in clause.split(","):
        tokens = part.split()
        column = table.columns[tokens[0]]
        expressions.append(column.desc() if "DESC" in (tokens[1:2] or []) else column.asc())
    return expressions


def _literal(value: object) -> str | None:
    """把 Python 默认值渲染成 DDL 字面量；无法安全渲染时返回 None。"""
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        # 单引号内部转义，避免默认值里的引号把 DDL 拼坏
        return "'" + value.replace("'", "''") + "'"
    return None


def _default_clause(column: Column) -> str | None:
    """为存量行推出一个默认值表达式。

    ``server_default`` 与 Python 侧 ``default`` 是两回事：只有前者天然是 DDL。
    没有 ``server_default`` 时用 Python 默认值的字面量兜底 —— 否则存量行在新列
    上全是 NULL，非空字段一读就报错。
    """
    if column.server_default is not None:
        argument = getattr(column.server_default, "arg", None)
        if argument is not None:
            return str(argument)

    default = column.default
    if default is not None and not getattr(default, "is_callable", False):
        rendered = _literal(getattr(default, "arg", None))
        if rendered is not None:
            return rendered
    return None


def _add_column_ddl(table_name: str, column: Column, dialect) -> str | None:
    """生成 ``ALTER TABLE ... ADD COLUMN``；无法安全生成时返回 None。"""
    column_type = column.type.compile(dialect=dialect)
    clause = f"ALTER TABLE {table_name} ADD COLUMN {column.name} {column_type}"
    default = _default_clause(column)

    if column.nullable:
        if default is not None:
            clause += f" DEFAULT {default}"
        return clause

    if default is None:
        # SQLite 不允许给已有表加「NOT NULL 且无默认值」的列。降级成可空列：
        # 结构上松了一格，但 ORM 侧仍按非空写入，比启动直接失败要好。
        logger.warning(
            "列 %s.%s 非空但推导不出默认值，已按可空列补齐；"
            "如需严格约束请人工重建该表。",
            table_name,
            column.name,
        )
        return clause

    clause += f" NOT NULL DEFAULT {default}"
    return clause


def _index_ddl(table_name: str, index, dialect=None) -> str:
    """生成 ``CREATE [UNIQUE] INDEX``；部分索引会带上 ``WHERE``。

    SQLAlchemy 把「部分索引」的条件放在方言方言关键字里（``sqlite_where`` /
    ``postgresql_where``），而不是 ``index.columns`` —— 早先这里只渲染列名，
    于是带条件的索引会被**建成不带条件的普通唯一索引**：那正好是 `orders` 上
    「每账号只允许一笔待付单」反过来的效果（会把同一个账号的历史订单也一起判重）。
    所以这里必须把条件一起渲染出来。
    """
    unique = "UNIQUE " if index.unique else ""
    columns = ", ".join(column.name for column in index.columns)
    clause = f"CREATE {unique}INDEX IF NOT EXISTS {index.name} ON {table_name} ({columns})"

    if dialect is None:
        return clause

    for key in ("sqlite_where", "postgresql_where"):
        where = (getattr(index, "dialect_kwargs", None) or {}).get(key)
        if where is None:
            continue
        rendered = str(
            where.compile(dialect=dialect, compile_kwargs={"literal_binds": True})
        ).strip()
        if rendered:
            clause += f" WHERE {rendered}"
            break
    return clause


def drop_column_ddl(table_name: str, column_name: str) -> str:
    """``ALTER TABLE ... DROP COLUMN`` 的 DDL（积分迁移也要用同一份，别再抄一遍）。"""
    return f'ALTER TABLE "{table_name}" DROP COLUMN "{column_name}"'


def _drop_column_ddl(table_name: str, column_name: str) -> str:
    return drop_column_ddl(table_name, column_name)


def _drop_retired_columns(engine: Engine, table_name: str, columns: list[str]) -> list[str]:
    """把登记过的退役列从存量库里真正删掉，返回本次变更清单。

    这里刻意自己拼 DDL 而不用 SQLAlchemy 的 ``DropColumn``：store 的库不走
    Alembic，``op.drop_column`` 要接一整套 migration 上下文；而 SQLite 的
    ``DROP COLUMN`` 内部就是官方那套「建新表 → 拷数据 → 换名」，索引与约束的
    账由 SQLite 自己记，比手写十二步更不容易出错。

    删不掉时不抛异常：启动流程不该因为一次结构清理而整个起不来，改为记 warning
    交给运维 —— 与「改类型/改可空性」的处理保持一致。
    """
    if engine.dialect.name != "sqlite":
        logger.warning(
            "表 %s 有已退役列 %s，但方言 %s 不支持自动删列，请人工处理。",
            table_name,
            "、".join(columns),
            engine.dialect.name,
        )
        return []

    version = tuple(getattr(engine.dialect, "sqlite_version_info", ()) or ())
    if version and version < _MIN_SQLITE_DROP_COLUMN:
        logger.warning(
            "SQLite %s 不支持 DROP COLUMN（需要 3.35+），表 %s 的退役列 %s 未删除，请人工处理。",
            ".".join(str(part) for part in version),
            table_name,
            "、".join(columns),
        )
        return []

    dropped: list[str] = []
    deleted: list[str] = []
    #: 备份必须在删列之前：删列是整列消失（SQLite 的 DROP COLUMN 会重建整张表，数据不再
    #: 存在于任何地方），而 ``_RETIRED_COLUMNS`` 只保证「删的是登记过的列」，不解决
    #: 「删错了怎么回头」；一次表级备份（同表多列共用一份）的成本只是复制一个库文件。
    backup = backup_database(engine, label=f"drop-{table_name}")
    for column in columns:
        try:
            with engine.begin() as connection:
                connection.exec_driver_sql(_drop_column_ddl(table_name, column))
        except Exception as error:  # noqa: BLE001
            # DROP COLUMN 不是万能的：列被索引、带 UNIQUE、或出现在 CHECK/部分索引
            # 里时 SQLite 会直接拒绝。这种情况只报警不抛出 —— 结构清理失败不该让
            # 整个服务起不来，但必须让运维在日志里看到并人工处理。
            logger.warning(
                "删除退役列 %s.%s 失败（%s），该列仍留在库中，请人工处理。",
                table_name,
                column,
                error,
            )
            continue
        dropped.append(f"{table_name}.{column}（已删除）")
        deleted.append(column)
    if deleted:
        logger.warning(
            "表 %s 的退役列 %s 已从库中删除（删除前备份：%s）。这是不可逆操作，"
            "确认服务一切正常后可以自行删除该备份。",
            table_name,
            "、".join(deleted),
            backup if backup is not None else "内存库/非文件库，无文件级备份",
        )
    return dropped


def ensure_schema(engine: Engine) -> list[str]:
    """把存量库对齐到元数据：删退役列、补缺列、补缺索引，返回本次变更的清单。

    刻意不用 ``metadata.sorted_tables``：``orders`` 与 ``licenses`` 互相持有外键，
    排序时会触发 SQLAlchemy 的循环依赖告警。这里只做「给已存在的表加列删列」，
    与建表顺序无关，按字典序遍历即可。
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    applied: list[str] = []
    #: 逐列/逐索引的明细先攒起来，最后按表汇总成一行 —— 存量库首次升级时这里
    #: 会有几十条，逐条 INFO 会把真正值得看的告警（建索引失败、退役列失败）淹掉。
    details: list[str] = []

    for table in Base.metadata.tables.values():
        if table.name not in existing_tables:
            # 全新表交给 create_all，它会连索引和约束一起建全
            continue

        existing_columns = {column["name"] for column in inspector.get_columns(table.name)}

        # 删列必须排在最前：删列在 SQLite 上等于重建整张表，重建后的表是按当前
        # 元数据建的，本来就带着全部列与索引，后面的「补列/补索引」自然就无事可做。
        retired = [
            name for name in _RETIRED_COLUMNS.get(table.name, ()) if name in existing_columns
        ]
        if retired:
            applied.extend(_drop_retired_columns(engine, table.name, retired))
            # 表结构变了，inspector 的缓存里还是旧快照。不清掉的话，下面会拿着
            # 「已经不存在」的列和索引去比对，重复补建甚至报错。
            inspector.clear_cache()
            existing_columns = {
                column["name"] for column in inspector.get_columns(table.name)
            }

        missing_columns = [
            column for column in table.columns if column.name not in existing_columns
        ]

        for column in missing_columns:
            ddl = _add_column_ddl(table.name, column, engine.dialect)
            if ddl is None:
                logger.warning(
                    "无法自动补齐列 %s.%s，请人工处理。", table.name, column.name
                )
                continue
            with engine.begin() as connection:
                connection.exec_driver_sql(ddl)
            applied.append(f"{table.name}.{column.name}")
            details.append(f"{table.name}.{column.name}")

        existing_indexes = {index["name"] for index in inspector.get_indexes(table.name)}
        for index in table.indexes:
            if index.name in existing_indexes:
                continue
            if index.unique and index.name in _DEDUPE_BEFORE_UNIQUE:
                # 唯一索引建不起来的最常见原因就是存量重复行。登记过的表先把重复行
                # 合并成一行（合并前后客户端可见的权限一致），否则这个索引永远建不上，
                # 「保护」只停留在文档里。
                merged = _repair_duplicates(engine, table.name, index.name)
                if merged:
                    # 只记明细、不重复记 applied：索引建成功后下面还会记一次，
                    # 两个都记会让「已补齐 N 项」凭空翻倍。
                    details.append(
                        f"{table.name}.{index.name}（索引，合并 {merged} 行重复数据）"
                    )
                    # 合并改了数据也改了表，缓存必须清掉再建索引。
                    inspector.clear_cache()
            ddl = _index_ddl(table.name, index, engine.dialect)
            try:
                with engine.begin() as connection:
                    connection.exec_driver_sql(ddl)
            except Exception as error:  # noqa: BLE001
                # 建索引失败绝不能炸掉启动：存量库已有违反唯一性的数据时 CREATE UNIQUE INDEX
                # 会直接抛错，而这只是结构清理步骤。只报警，并把「怎么修」写清楚。
                logger.warning(
                    "建索引 %s.%s 失败（%s）：该索引未生效。"
                    "若这是唯一索引，通常是存量数据里已有重复值，请先清理重复行再重启。DDL=%s",
                    table.name,
                    index.name,
                    error,
                    ddl,
                )
                continue
            applied.append(f"{table.name}.{index.name}")
            details.append(f"{table.name}.{index.name}（索引）")

        # 表级唯一约束查得出、却补不上（SQLite 不支持 ALTER 追加），只报警。
        # 注意 get_unique_constraints 返回的是 dict 列表，不是 Constraint 对象。
        unique_columns = {
            tuple(sorted(constraint.get("column_names") or ()))
            for constraint in inspector.get_unique_constraints(table.name)
        }
        for constraint in table.constraints:
            if constraint.__class__.__name__ != "UniqueConstraint":
                continue
            columns = tuple(sorted(column.name for column in constraint.columns))
            if columns and columns not in unique_columns:
                logger.warning(
                    "表 %s 缺少唯一约束 %s%s；SQLite 无法在线追加，请人工重建该表。",
                    table.name,
                    constraint.name or "",
                    columns,
                )

    if details:
        #: 一条汇总，明细降级到 DEBUG：存量库首次升级时这里几十条，逐条 INFO 会把
        #: 真正要看的两类告警（建索引失败、退役列失败）淹掉。
        logger.info(
            "已对齐存量库结构 %d 项：%s",
            len(details),
            "、".join(details) if len(details) <= 12 else "、".join(details[:12]) + " …",
        )
        logger.debug("结构对齐明细：%s", "、".join(details))

    return applied
