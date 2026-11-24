"""事件日志的小时汇总：写入增量、报表读取、保留期清理。

## 为什么要有汇总表

``/events/stats`` 原先对 ``event_logs`` 原始行做三次 ``GROUP BY``，分桶键还是
``substr(datetime(createdAt, '+480 minutes'), 1, 10)`` —— 索引列被函数包住，SQLite 只能
把整个查询窗口物化再排序。实测 227 万行单次分组 0.4–0.6 秒；``/reports/compare`` 还要
跑两遍，12M 行时是秒级到十秒级。而报表只需要几个计数。

这里按「家庭时区的 小时 + domain + entity」预聚合，写入批次里 ``count += 1``，
报表只读这张表（走 ``bucketKey`` 索引）。

## 一致性口径

- 只统计**真正落库**的行：写入用 ``INSERT … ON CONFLICT DO NOTHING RETURNING``，
  被唯一索引挡掉的重复行不会计入（否则汇总会比原始表大）。
- 台账与原始表同生命周期：清空事件日志要一并清空；保留期清理按 ``bucketUtc``
  （UTC 小时文本，可直接字符串比较，不依赖家庭时区）。
- **改家庭时区后必须重建**（``ops/scripts/rebuild-event-stats.py``）：``bucketKey``
  存的是当地墙钟文本，时区变了旧行的日/小时归属就不对了。
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ...platform.core.db.models import EventLog, EventLogStat

LOGGER = logging.getLogger("homeos.event_stats_rollup")


def utc_hour_key(moment: datetime) -> str:
    """``YYYY-MM-DD HH``（UTC）。用于保留期清理的字符串比较。"""
    aware = moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)
    return aware.astimezone(UTC).strftime("%Y-%m-%d %H")


def local_hour_key(moment: datetime, timezone: Any) -> str:
    """``YYYY-MM-DD HH``（家庭时区）。报表按它分日/分时。"""
    aware = moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)
    return aware.astimezone(timezone).strftime("%Y-%m-%d %H")


def upsert_counts(session: Any, counts: dict[tuple[str, str, str, str], int]) -> None:
    """把 ``(bucketKey, bucketUtc, domain, entityId) → 次数`` 累加进汇总表。

    用 ``executemany``（一次 ``execute`` + 参数列表）而不是逐条执行：一批 500 行会在
    一小时内产生最多 500 个不同的 (domain, entityId) 组合，逐条发送意味着 500 次
    SQL 编译 + 500 次往返。SQLAlchemy 对带 ``on_conflict_do_update`` 的 insert 支持
    参数列表，语句只编译一次。
    """
    if not counts:
        return
    statement = sqlite_insert(EventLogStat).on_conflict_do_update(
        index_elements=["bucketKey", "domain", "entityId"],
        set_={"count": EventLogStat.__table__.c.count + sqlite_insert(EventLogStat).excluded.count},
    )
    payload = [
        {
            "bucket_key": bucket_key,
            "bucket_utc": bucket_utc,
            "domain": domain,
            "entity_id": entity_id,
            "count": int(count),
        }
        for (bucket_key, bucket_utc, domain, entity_id), count in counts.items()
    ]
    session.execute(statement, payload)


def build_counts(
    rows: Iterable[tuple[datetime, str, str]],
    timezone: Any,
) -> dict[tuple[str, str, str, str], int]:
    """把 ``(created_at, domain, entity_id)`` 聚合成 upsert 需要的字典。"""
    counts: dict[tuple[str, str, str, str], int] = {}
    for created_at, domain, entity_id in rows:
        key = (local_hour_key(created_at, timezone), utc_hour_key(created_at), domain or "", entity_id)
        counts[key] = counts.get(key, 0) + 1
    return counts


def query_totals(
    session: Any,
    *,
    since_bucket: str,
    entity_id: str | None = None,
    domain: str | None = None,
    entity_prefixes: list[str] | None = None,
) -> tuple[list[tuple[str, int]], list[tuple[str, int]], list[tuple[str, int]]]:
    """返回 ``(按 domain, 按 entity top10, 按 bucketKey)`` 三组计数。

    ``entity_prefixes`` 是实体级白名单（当前恒为空，保留给将来的成员模型）。
    """
    conditions = [EventLogStat.bucket_key >= since_bucket]
    if entity_id:
        conditions.append(EventLogStat.entity_id == entity_id)
    if domain:
        conditions.append(EventLogStat.domain == domain)
    if entity_prefixes:
        conditions.append(EventLogStat.entity_id.startswith(tuple(entity_prefixes)))

    count_column = func.sum(EventLogStat.count)
    domain_rows = [
        (str(row[0] or ""), int(row[1] or 0))
        for row in session.execute(
            select(EventLogStat.domain, count_column).where(*conditions).group_by(EventLogStat.domain)
        ).all()
    ]
    entity_rows = [
        (str(row[0] or ""), int(row[1] or 0))
        for row in session.execute(
            select(EventLogStat.entity_id, count_column)
            .where(*conditions)
            .group_by(EventLogStat.entity_id)
            .order_by(count_column.desc())
            .limit(10)
        ).all()
    ]
    bucket_rows = [
        (str(row[0] or ""), int(row[1] or 0))
        for row in session.execute(
            select(EventLogStat.bucket_key, count_column)
            .where(*conditions)
            .group_by(EventLogStat.bucket_key)
            .order_by(EventLogStat.bucket_key.asc())
        ).all()
    ]
    return domain_rows, entity_rows, bucket_rows


def series_by_day(session: Any, *, start_key: str, end_key: str) -> list[tuple[str, int]]:
    """按家庭时区「日」汇总，返回 ``(YYYY-MM-DD, count)``（升序）。

    ``bucketKey`` 是写入时按**当时生效的时区偏移**算出来的墙钟文本，所以这里既不需要
    ``datetime()`` 包裹索引列，也不会在夏令时切换日把数据算进相邻日期（F-14）。
    """
    day_key = func.substr(EventLogStat.bucket_key, 1, 10)
    count_column = func.sum(EventLogStat.count)
    rows = session.execute(
        select(day_key, count_column)
        .where(EventLogStat.bucket_key >= start_key, EventLogStat.bucket_key <= end_key)
        .group_by(day_key)
        .order_by(day_key.asc())
    ).all()
    return [(str(row[0] or ""), int(row[1] or 0)) for row in rows]


def entity_totals(
    session: Any,
    *,
    start_key: str,
    end_key: str,
    entity_ids: list[str] | None = None,
    entity_prefixes: list[str] | None = None,
    limit: int = 10,
) -> list[tuple[str, int]]:
    """按实体汇总（次数降序，最多 ``limit`` 条）。"""
    conditions = [EventLogStat.bucket_key >= start_key, EventLogStat.bucket_key <= end_key]
    if entity_ids:
        conditions.append(EventLogStat.entity_id.in_(entity_ids))
    if entity_prefixes is not None:
        conditions.append(EventLogStat.entity_id.startswith(tuple(entity_prefixes or [""])))
    count_column = func.sum(EventLogStat.count)
    rows = session.execute(
        select(EventLogStat.entity_id, count_column)
        .where(*conditions)
        .group_by(EventLogStat.entity_id)
        .order_by(count_column.desc())
        .limit(max(1, limit))
    ).all()
    return [(str(row[0] or ""), int(row[1] or 0)) for row in rows]


def clear_all(session: Any) -> int:
    """清空汇总表（与事件日志清空同步）。"""
    result = session.execute(EventLogStat.__table__.delete())
    return int(result.rowcount or 0)


def prune_before(session: Any, cutoff_utc_hour: str) -> int:
    """删除 ``bucketUtc`` 早于给定小时的汇总行（保留期清理调用）。"""
    result = session.execute(EventLogStat.__table__.delete().where(EventLogStat.bucket_utc < cutoff_utc_hour))
    return int(result.rowcount or 0)


#: 本进程是否已尝试过「首次回填」。回填只做一次，失败也不再重试（避免每个报表请求都扫全表）。
_backfill_attempted = False


def ensure_backfilled(session_factory: Any, timezone: Any, *, batch_size: int = 20000) -> None:
    """**首次升级自愈**：汇总表为空但原始表有数据时，就地回填一次。

    为什么需要：汇总表是新增的，老库升级后它一开始是空的 —— 报表会静默显示 0，
    而「静默显示 0」比报错更难排查（用户以为没人动过设备）。这里在第一次读报表时
    自动补一次，之后走增量。

    代价：一次性扫描（227 万行量级约十几秒，同步路由本身已在线程池里）。失败只记日志、
    不再重试；手工重建入口仍是 ``ops/scripts/rebuild-event-stats.py``。
    """
    global _backfill_attempted
    if _backfill_attempted:
        return
    _backfill_attempted = True
    try:
        with session_factory() as session:
            if session.scalar(select(EventLogStat.id).limit(1)) is not None:
                return
            if session.scalar(select(EventLog.id).limit(1)) is None:
                return  # 全新安装：没有历史，不需要回填
            total = int(session.scalar(select(func.count()).select_from(EventLog)) or 0)
            LOGGER.info("事件汇总表为空，开始一次性回填（原始表 %s 行）…", total)
            started = time.monotonic()
            counts: dict[tuple[str, str, str, str], int] = {}
            scanned = 0
            for _row_id, entity_id, domain, created_at in session.execute(
                select(EventLog.id, EventLog.entity_id, EventLog.domain, EventLog.created_at).order_by(EventLog.id)
            ):
                key = (
                    local_hour_key(created_at, timezone),
                    utc_hour_key(created_at),
                    str(domain or ""),
                    str(entity_id or ""),
                )
                counts[key] = counts.get(key, 0) + 1
                scanned += 1
                if len(counts) >= batch_size:
                    upsert_counts(session, counts)
                    session.commit()
                    counts.clear()
            upsert_counts(session, counts)
            session.commit()
            LOGGER.info(
                "事件汇总回填完成：扫描 %s 行，用时 %.1fs",
                scanned,
                time.monotonic() - started,
            )
    except Exception:
        LOGGER.warning("事件汇总首次回填失败（报表将显示空数据）：请手工运行 rebuild-event-stats.py", exc_info=True)


__all__ = [
    "build_counts",
    "clear_all",
    "ensure_backfilled",
    "entity_totals",
    "local_hour_key",
    "prune_before",
    "query_totals",
    "series_by_day",
    "upsert_counts",
    "utc_hour_key",
]
