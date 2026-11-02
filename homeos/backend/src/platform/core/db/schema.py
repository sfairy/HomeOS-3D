"""启动期建库、迁移与结构自检。

启动顺序（两个后端一致）：
1. 迁移注册表把库带到当前版本（首次/旧库自动接管为基线）；
2. ORM 元数据补建新增的表与索引；
3. 核对库结构相对 ORM 没有缺口，再做完整性与外键校验。

迁移失败必须让启动失败；绝不空库重建或跳过版本。
"""

from __future__ import annotations

import logging

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
    from . import models  # noqa: F401  # 注册模型到 Base.metadata  # pyright: ignore[reportUnusedImport]
    from .database import Base

    return Base.metadata


def _integrity_note(report: IntegrityReport) -> str:
    """体检强度的一句话来历：日志里得能看出「这次到底有没有逐页全查」。"""
    if report.clean_shutdown is None:
        return "显式指定强度"
    if report.clean_shutdown:
        return "上次为干净关闭"
    return "上次未干净关闭,故逐页全查"


def prepare_schema(settings: Settings) -> None:
    """把数据库迁移到当前版本、补齐 ORM 新增结构，并校验完整性。"""
    from .database import Database

    metadata = _metadata()
    database = Database(settings.database_url)
    try:
        report = run_migrations(
            database_path=settings.database_path,
            app="homeos",
            migrations=MIGRATIONS,
            create_schema=lambda: ensure_schema(metadata, database.engine),
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
            if missing:
                raise SchemaError(
                    "check 模式发现库结构缺口（未做任何修改）：\n  - " + "\n  - ".join(missing)
                )
        else:
            # 旧库可能缺少 ORM 后来新增的表/索引；迁移负责改列与数据，create_all 只补新增对象。
            ensure_schema(metadata, database.engine)
            missing = missing_schema_objects(database.engine, metadata)
            if missing:
                raise SchemaError("库结构与 ORM 元数据不一致：\n  - " + "\n  - ".join(missing))
    finally:
        database.dispose()
    report = validate_database(settings.database_path, metadata.tables)
    # 体检强度与耗时写出来：默认档位按「上次是否干净关闭」自动选，日志里必须能看出这次
    # 是逐页全查还是轻量校验，否则「启动快了点」到底是运气还是改了档位说不清。
    LOGGER.info("数据库完整性体检通过:%s(%s),%.1f ms", report.pragma, _integrity_note(report), report.elapsed_ms)
