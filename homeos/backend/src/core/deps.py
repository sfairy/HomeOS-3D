"""FastAPI 依赖注入：Settings、数据库会话与（Phase 2 起的）鉴权依赖。

对应 Nest 的 DI 容器 + ``APP_GUARD`` 链：这里以 ``Depends`` 函数表达，
业务路由按需声明 ``Depends(require_user)`` / ``Depends(require_role(...))``。
"""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session

from ..config import Settings
from .database import Database


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_session(request: Request) -> Iterator[Session]:
    """按请求提供 SQLAlchemy 会话（由 FastAPI 线程池承载同步查询）。"""
    database: Database = request.app.state.database
    with database.session_factory() as session:
        yield session
