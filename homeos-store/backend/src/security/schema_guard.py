"""启动时把存量库对齐到 ORM：补缺列、补缺索引（幂等）。
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping

from sqlalchemy import inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.schema import Column

from ..core.database import Base
from ..core import models

logger = logging.getLogger("src.schema")


@dataclass(frozen=True)
class _UniqueIndexRepair:
    """补唯一索引前如何合并重复行。
    """

    key: tuple[str, ...]
    keep: str
    merge: Mapping[str, str]


#: 补唯一索引前先合并重复行的索引：``{索引名: 规则}``。
_DEDUPE_BEFORE_UNIQUE: dict[str, _UniqueIndexRepair] = {
    # 同一张授权下同一个功能码只能有一条（后台新增权益时也是这么判的，但那是
    "uq_entitlements_license_feature": _UniqueIndexRepair(
        key=("license_id", "feature_code"),
        # 优先留生效的那条，其次留最近改过的。
        keep="active DESC, created_at DESC, id DESC",
        merge={"active": "any_true", "starts_at": "earliest", "expires_at": "latest"},
    ),
    # 同一个 (product, channel, version) 只应有一条：客户端查更新时不该看到
    "uq_releases_product_channel_version": _UniqueIndexRepair(
        key=("product", "channel", "version"),
        keep="created_at DESC, id DESC",
        merge={},
    ),
    # 同一台设备在同一张授权下只应有一条绑定；重复绑定的后果是「同一台机器占两个
    "uq_device_bindings_license_instance": _UniqueIndexRepair(
        key=("license_id", "instance_id"),
        keep="active DESC, last_heartbeat_at DESC, created_at DESC, id DESC",
        merge={"active": "any_true", "released_at": "latest"},
    ),
}

#: 合并方式白名单，顺序即语义（见 ``_UniqueIndexRepair``）。
_MERGE_MODES = ("any_true", "earliest", "latest")

#: 同一个「库 + 标签」只留最近这几份快照。
_BACKUP_KEEP = 3


def backup_database(
    engine: Engine, *, directory: Path | None = None, label: str = "backup"
) -> Path | None:
    """改动数据前把 SQLite 库备份成一份可还原的快照，返回备份路径。
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
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    destination = target_dir / f"{source.name}.pre-{label}-{stamp}.bak"
    #: 同一秒内的第二次备份会撞上这个名字，而 ``VACUUM INTO`` 撞名是**直接报错** ——
    suffix = 1
    while destination.exists():
        destination = target_dir / f"{source.name}.pre-{label}-{stamp}-{suffix}.bak"
        suffix += 1

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
    _prune_backups(target_dir, source.name, label)
    return destination


_BACKUP_STAMP_RE = re.compile(r"(?P<stamp>\d{8}-\d{6})(?:-(?P<suffix>\d+))?$")


def _backup_sort_key(path: Path, prefix: str) -> tuple[str, int, str]:
    """快照排序键：时间戳 → 同秒序号 → 原名。
    """
    remainder = path.name[len(prefix):-len(".bak")] if path.name.endswith(".bak") else path.name
    matched = _BACKUP_STAMP_RE.search(remainder)
    if matched is None:
        return (remainder, 0, path.name)
    return (matched.group("stamp"), int(matched.group("suffix") or 0), path.name)


def _prune_backups(directory: Path, database_name: str, label: str, keep: int = _BACKUP_KEEP) -> list[Path]:
    """删掉同库同标签的旧快照，只留最近 ``keep`` 份；返回被删掉的路径。
    """
    prefix = f"{database_name}.pre-{label}-"
    existing = sorted(directory.glob(f"{prefix}*.bak"), key=lambda path: _backup_sort_key(path, prefix))
    removed: list[Path] = []
    for stale in existing[: max(0, len(existing) - keep)]:
        try:
            stale.unlink()
        except OSError as error:
            logger.warning("旧快照删不掉（不影响本次动作）：%s（%s）", stale, error)
            continue
        removed.append(stale)
    return removed


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
        return "'" + value.replace("'", "''") + "'"
    return None


def _default_clause(column: Column) -> str | None:
    """为存量行推出一个默认值表达式。
    """
    if column.server_default is not None:
        argument = getattr(column.server_default, "arg", None)
        if argument is not None:
            rendered = str(argument).strip()
            # server_default="" 是完全合法的 SQLAlchemy 写法（文本列用空串做默认值），
            # 但它渲染进 DDL 就是「DEFAULT 」——后面什么都没有。那是一条语法错误的
            # ALTER TABLE：补列当场失败，服务在下一次启动时直接起不来，而错误信息
            # （incomplete input）完全指不到真正的根因。空渲染一律按「没有默认值」处理，
            # 于是非空列会按可空列补齐并留下一条 warning。
            if rendered:
                return rendered

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



def ensure_schema(engine: Engine) -> list[str]:
    """把存量库对齐到元数据：补缺列、补缺索引，返回本次变更的清单。
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    applied: list[str] = []
    #: 逐列/逐索引的明细先攒起来，最后按表汇总成一行 —— 存量库首次升级时这里
    details: list[str] = []

    for table in Base.metadata.tables.values():
        if table.name not in existing_tables:
            # 全新表交给 create_all，它会连索引和约束一起建全
            continue

        existing_columns = {column["name"] for column in inspector.get_columns(table.name)}

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
                merged = _repair_duplicates(engine, table.name, index.name)
                if merged:
                    # 只记明细、不重复记 applied：索引建成功后下面还会记一次，
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
        logger.info(
            "已对齐存量库结构 %d 项：%s",
            len(details),
            "、".join(details) if len(details) <= 12 else "、".join(details[:12]) + " …",
        )
        logger.debug("结构对齐明细：%s", "、".join(details))

    return applied
