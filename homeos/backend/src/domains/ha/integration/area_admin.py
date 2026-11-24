"""HA 房间（area）的本地目录持久化。

## 为什么从 ``api/ha/routes.py`` 搬出来

这些函数是**本地目录的写操作**（upsert / 改名换图标 / 删除 / 房间排序 / 房间内实体排序），
路由只该负责「先写 HA，再写本地」这个顺序与时序（哪一步该 ``to_thread``）。
原实现把 SQL 直接写在路由文件里（1600 行），「房间排序为什么慢」这类问题要靠翻文件才能看出。

## 顺带修掉的 N+1

``sort_areas`` 原先按 ``area_ids`` **逐个** ``SELECT``（每行一条语句、最后一次 commit）。
这里改成**一次** ``WHERE area_id IN (...)`` 取回全部行再按索引赋值：语句数
``O(n) → 2``（查询 + commit）。顺序语义完全不变（只是 ``sort_order`` 的赋值）。

## 为什么不合并成一条 UPDATE

房间数通常十几个、最多几十个，用 ``CASE WHEN`` 拼一条 UPDATE 会让 SQL 从 2 条变成 1 条，
但可读性与可测性都明显下降（拼字符串、注入面、无法直接用 ORM）。这里的收益在
**消除逐行查询**，而不是把最后两条也压成一条。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from ....platform.core.db.models import HAArea, HAAreaEntityOrder


def persist_area_upsert(database: Any, connection_id: str, area_id: str, name: str, icon: str | None) -> None:
    """本地目录 upsert（同步；由路由 ``asyncio.to_thread`` 调用）。"""
    row = database.scalars(
        select(HAArea).where(HAArea.connection_id == connection_id, HAArea.area_id == area_id)
    ).first()
    if row is None:
        row = HAArea(connection_id=connection_id, area_id=area_id, name=name)
        database.add(row)
    row.name = name
    row.icon = icon
    row.sync_status = "active"
    database.commit()


def persist_area_sort(database: Any, connection_id: str, area_ids: list[str]) -> int:
    """按数组顺序写本地 ``sortOrder``，返回实际更新的行数。

    HA 的区域 registry 没有顺序字段，排序只能落在本地表；用一次 ``IN`` 查询代替逐行
    ``SELECT``（原实现是每个 area_id 一条语句）。
    """
    if not area_ids:
        return 0
    rows = {
        row.area_id: row
        for row in database.scalars(
            select(HAArea).where(HAArea.connection_id == connection_id, HAArea.area_id.in_(area_ids))
        ).all()
    }
    updated = 0
    for index, area_id in enumerate(area_ids):
        row = rows.get(area_id)
        if row is None:
            continue
        row.sort_order = index
        updated += 1
    database.commit()
    return updated


def persist_area_update(database: Any, connection_id: str, area_id: str, name: str | None, icon: str | None) -> None:
    """改名 / 换图标后同步本地目录（``None`` 表示本次不改该字段）。"""
    row = database.scalars(
        select(HAArea).where(HAArea.connection_id == connection_id, HAArea.area_id == area_id)
    ).first()
    if row is None:
        return
    if name is not None:
        row.name = name
    if icon is not None:
        row.icon = icon or None
    database.commit()


def persist_area_delete(database: Any, connection_id: str, area_id: str) -> None:
    row = database.scalars(
        select(HAArea).where(HAArea.connection_id == connection_id, HAArea.area_id == area_id)
    ).first()
    if row is not None:
        database.delete(row)
        database.commit()


def persist_area_entity_order(database: Any, connection_id: str, area_id: str, entity_ids: list[str]) -> None:
    """整份覆盖该房间的顺序，并顺手清掉不在本次列表里的孤儿行。"""
    existing = {
        row.entity_id: row
        for row in database.scalars(
            select(HAAreaEntityOrder).where(
                HAAreaEntityOrder.connection_id == connection_id,
                HAAreaEntityOrder.area_id == area_id,
            )
        ).all()
    }
    kept: set[str] = set()
    for index, entity_id in enumerate(entity_ids):
        kept.add(entity_id)
        row = existing.get(entity_id)
        if row is None:
            database.add(
                HAAreaEntityOrder(connection_id=connection_id, area_id=area_id, entity_id=entity_id, sort_order=index)
            )
        else:
            row.sort_order = index
    for entity_id, row in existing.items():
        if entity_id not in kept:
            database.delete(row)
    database.commit()


__all__ = [
    "persist_area_delete",
    "persist_area_entity_order",
    "persist_area_sort",
    "persist_area_update",
    "persist_area_upsert",
]
