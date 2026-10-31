"""HA 活跃连接的读取面（原先住在 ``api/ha.py``）。

为什么下沉到域内：``active_connection`` 只是一个「查当前生效的 HA 连接」的查询，
``api/ha.py``、``api/ha_proxy.py``、``api/ha_webrtc.py`` 与 3D 增量模块都要用。
把它留在 ``api/ha.py`` 里，模块层想读连接就得 import 路由模块 —— 于是
``modules → api`` 这条不该存在的边被逼出来（路由层是入口，不是库）。
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ....platform.core.db.database import Database
from ....platform.core.db.models import HAConnection


def active_connection(database: Session) -> HAConnection | None:
    """当前生效（``is_active``）的 HA 连接；无连接时返回 ``None``。"""
    return database.scalar(select(HAConnection).where(HAConnection.is_active.is_(True)))


def load_active_connection_snapshot(database_manager: Database) -> HAConnection | None:
    """在新会话里读连接并 ``expunge``，便于跨会话持有（线程里调用安全）。"""
    with database_manager.session_factory() as database:
        connection = active_connection(database)
        if connection is not None:
            database.expunge(connection)
        return connection


__all__ = ["active_connection", "load_active_connection_snapshot"]
