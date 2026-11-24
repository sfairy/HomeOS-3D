"""启动期建库、迁移与结构自检。

启动顺序（两个后端一致）：
1. 迁移注册表把库带到当前版本（首次/旧库自动接管为基线）；
2. ORM 元数据补建新增的表与索引；
3. 核对库结构相对 ORM 没有缺口，再做完整性与外键校验。

迁移失败必须让启动失败；绝不空库重建或跳过版本。
"""

from __future__ import annotations

import logging

from sqlalchemy.engine import Engine
from sqlalchemy.schema import MetaData

from homeos_shared.schema_core import (
    IntegrityReport,
    SchemaError,
    ensure_schema,
    missing_schema_objects,
    validate_database,
)
from homeos_shared.schema_migrate import run_migrations

from .migrations import MIGRATIONS
from ....config import Settings

# 名字必须落在 ``homeos`` 树下：控制台 handler 与运行日志缓冲只挂在这棵树与 uvicorn 上，
# 用 ``__name__``（``src.platform.core.db.schema``）会一路传播到没有 handler 的 root，
# 最终被 ``logging.lastResort`` 丢掉 —— INFO 级的迁移进度就这样整段消失。
LOGGER = logging.getLogger("homeos.platform.core.schema")


def _metadata() -> MetaData:
    from . import (
        automation_models,  # noqa: F401  # 注册自动化草案模型  # pyright: ignore[reportUnusedImport]
        device_profile_models,  # noqa: F401  # 注册设备画像模型  # pyright: ignore[reportUnusedImport]
        learning_models,  # noqa: F401  # 注册学习体系模型  # pyright: ignore[reportUnusedImport]
        media_models,  # noqa: F401  # 注册媒体入库模型  # pyright: ignore[reportUnusedImport]
        models,  # noqa: F401  # 注册模型到 Base.metadata  # pyright: ignore[reportUnusedImport]
    )
    from .database import Base

    return Base.metadata


def _log_metadata() -> MetaData:
    """日志库的 metadata（同样靠 import models 注册，两个 metadata 一起就绪）。"""
    _metadata()
    from .log_base import LogBase

    return LogBase.metadata


def create_all_schemas(engine: Engine) -> None:
    """在**同一个** engine 上建两套表（源码态 / 自检 / 单文件部署用）。

    生产走 :func:`prepare_schema` 的两个库；这里只服务「一个临时 SQLite 跑自检」的场景，
    让那些没有拆库的测试仍然拿得到日志表。定义在这里而不是 ``log_database``：本模块
    本来就负责建表，且它已经是唯一允许同时 import 两个 metadata 的地方。
    """
    metadata = _metadata()
    log_metadata = _log_metadata()
    metadata.create_all(engine)
    log_metadata.create_all(engine)


def _integrity_note(report: IntegrityReport) -> str:
    """体检强度的一句话来历：日志里得能看出「这次到底有没有逐页全查」。"""
    if report.pragma == "skipped":
        return "上次为干净关闭,已跳过逐页扫描"
    if report.clean_shutdown is None:
        return "显式指定强度"
    if report.clean_shutdown:
        return "上次为干净关闭"
    return "上次未干净关闭,故快速校验"


def prepare_schema(settings: Settings) -> None:
    """把两个库都迁移到当前版本、补齐 ORM 新增结构，并校验完整性。

    两个库：业务库 ``homeos.db``（跑迁移链）与日志库 ``homeos-logs.db``（只按
    ``LogBase.metadata`` 建表）。日志库里没有需要补列的历史，所以不需要迁移链 ——
    它的「历史」是数据，由 ``move_legacy_rows`` 一次性从主库搬过来。
    """
    from .database import Database
    from .log_database import LogDatabase, log_database_path, move_legacy_rows

    metadata = _metadata()
    log_metadata = _log_metadata()
    database = Database(settings.database_url)
    log_database = LogDatabase(settings.log_database_url)
    log_path = log_database_path(settings.data_dir)

    def _create_schemas() -> None:
        ensure_schema(metadata, database.engine)
        ensure_schema(log_metadata, log_database.engine)

    try:
        report = run_migrations(
            database_path=settings.database_path,
            app="homeos",
            migrations=MIGRATIONS,
            create_schema=_create_schemas,
            data_dir=settings.data_dir,
            mode=settings.schema_mode,
            logger=LOGGER,
        )
        if report.applied:
            LOGGER.info(
                "迁移完成：v%s → v%s（本次执行 %s 条：%s）",
                report.from_version,
                report.to_version,
                len(report.applied),
                ", ".join(f"v{item}" for item in report.applied),
            )
        else:
            # 每次启动都是这个分支：库里已经是当前版本，没有待执行的迁移。
            LOGGER.info("已是最新：v%s（无需迁移）", report.to_version)
        if settings.schema_mode == "check":
            # check 是只读探测：不仅不能执行迁移，也不能用 create_all 顺手补表。
            missing = missing_schema_objects(database.engine, metadata)
            missing += missing_schema_objects(log_database.engine, log_metadata)
            if missing:
                raise SchemaError("check 模式发现库结构缺口（未做任何修改）：\n  - " + "\n  - ".join(missing))
        else:
            # 旧库可能缺少 ORM 后来新增的表/索引；迁移负责改列与数据，create_all 只补新增对象。
            _create_schemas()
            missing = missing_schema_objects(database.engine, metadata)
            missing += missing_schema_objects(log_database.engine, log_metadata)
            if missing:
                raise SchemaError("库结构与 ORM 元数据不一致：\n  - " + "\n  - ".join(missing))
            # 老库把日志行留在 ``homeos.db`` 里：搬到日志库后清空原表（表结构保留）。
            # 必须在两个库都建好表之后做，且分块提交 —— 大表（实测最坏 12M 行）中断后
            # 下次启动会从断点继续。
            moved = move_legacy_rows(settings.database_path, log_path, logger=LOGGER)
            if moved:
                LOGGER.info(
                    "日志库首次接管完成：%s",
                    "、".join(f"{table} {rows} 行" for table, rows in moved.items()),
                )
    finally:
        database.dispose()
        log_database.dispose()
    report = validate_database(settings.database_path, metadata.tables)
    # 体检强度与耗时写出来：默认档位按「上次是否干净关闭」自动选，日志里必须能看出这次
    # 是逐页全查还是轻量校验，否则「启动快了点」到底是运气还是改了档位说不清。
    LOGGER.info("数据库完整性体检通过:%s(%s),%.1f ms", report.pragma, _integrity_note(report), report.elapsed_ms)
    log_report = validate_database(settings.log_database_path, log_metadata.tables)
    LOGGER.info(
        "日志库完整性体检通过:%s(%s),%.1f ms",
        log_report.pragma,
        _integrity_note(log_report),
        log_report.elapsed_ms,
    )
