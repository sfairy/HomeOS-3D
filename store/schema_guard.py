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
"""

from __future__ import annotations

import logging

from sqlalchemy import inspect
from sqlalchemy.engine import Engine
from sqlalchemy.schema import Column

from store.database import Base
import store.models  # noqa: F401  仅为注册全部模型元数据

logger = logging.getLogger("store.schema")

#: 已从 ORM 退役、需要从存量库**物理删除**的列：``{表名: (列名, ...)}``。
#:
#: 为什么要登记，而不是「ORM 里没有就删」：删列在 SQLite 上要重建整张表，
#: 一旦规则放宽成自动对比，某次误删模型字段就会在下次启动时无声地毁掉整列数据。
#:
#: 更隐蔽的是**不登记也不报错**的那一半：``Mapped[str]`` 会被推断成 ``NOT NULL``，
#: 而 SQLAlchemy 不会把 Python 侧的 ``default=`` 写进 DDL，于是存量库里那一列是
#: ``NOT NULL`` 且**没有默认值**。ORM 一旦不再映射它，INSERT 就会省略该列，
#: 此后每次插入都以 ``NOT NULL constraint failed`` 失败 —— 且**只在存量库上**失败，
#: 全新库（``create_all`` 建表时本就没有这一列）与 smoke 全绿，属于最难排查的一类漂移。
_RETIRED_COLUMNS: dict[str, tuple[str, ...]] = {
    # 提现不再收集联系 QQ，改为让用户凭申请编号联系客服。
    "referral_withdrawals": ("qq",),
    # 提现引导从「加入 QQ 群」改为「联系客服」，QQ 群配置随之退役。
    "store_settings": (
        "referral_qq_group",
        "referral_qq_url",
        # 商户订单号模板从未被任何下单路径读取（订单号统一由
        # `security.new_order_no` 生成），而它默认值 `{{time}}-{{email}}` 与后台
        # 提示文案里的 `{order_no}` 还对不上。留着就是一个「改了没有任何反应」
        # 的假旋钮 —— 运营改完以为订单号会变，实际什么都不发生，还会在排障时
        # 把注意力引到错误的方向。宁可删掉。
        "payment_merchant_order_template",
    ),
}

#: ``ALTER TABLE ... DROP COLUMN`` 自 SQLite 3.35.0（2021-03-12）起可用。
#: 官方镜像 ``python:3.12-slim`` 带的是 3.40+，本地 Python 3.14 带 3.50+，都在范围内。
_MIN_SQLITE_DROP_COLUMN = (3, 35, 0)


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
            ddl = _index_ddl(table.name, index, engine.dialect)
            try:
                with engine.begin() as connection:
                    connection.exec_driver_sql(ddl)
            except Exception as error:  # noqa: BLE001
                # 建索引失败绝不能炸掉启动。最容易失败的一类正是**唯一索引**：
                # 存量库里已经有违反唯一性的数据时，CREATE UNIQUE INDEX 会直接抛错，
                # 而这是个结构清理步骤，不该让整个服务起不来（与删列的处理一致）。
                # 只报警，并把「怎么修」写清楚 —— 沉默地跳过会让保护看起来是生效的。
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
