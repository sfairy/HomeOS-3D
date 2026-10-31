"""数据库历史保留清理服务（对齐 ``common/database/retention.service.ts`` 的面板/清理能力）。

当前实现聚焦「数据保留」设置面板所需的读取接口与一次性清理：
- 各表保留策略（配置键 / 物理表名 / 中文显示名 / 生效保留天数）；
- 最近一次清理统计（RuntimeKv 持久化）；
- 各表估算行数（sqlite_stat1 / MAX(rowid)，不做全表 COUNT）；
- 按表更新保留天数；
- :meth:`DatabaseRetentionService.run_cleanup` 分批删除 5 张业务表的历史记录。

定时调度（首次延迟 + 周期）由 :meth:`DatabaseRetentionService.start_schedule` 在 app
生命周期内接入；同时保留 :meth:`DatabaseRetentionService.run_cleanup` 作为一次性同步入口。
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import literal_column, select, text

from ...platform.core.db.models import (
    EventLog,
    Notification,
    SecurityEvent,
)
from ...platform.core.db.retention import (
    RETENTION_DAYS_MAX,
    RETENTION_TABLE_KEYS,
    RETENTION_TABLE_LABELS,
    RETENTION_TABLE_NAMES,
)
from ...platform.core.db.runtime_kv import load_runtime_kv, persist_runtime_kv
from ...platform.core.http.errors import BusinessException, ErrorCode

logger = logging.getLogger("homeos.retention")

RETENTION_STATS_STORAGE_ID = "retention-last-cleanup"

#: 数据库维护互斥锁（对齐 Nest ``DB_MAINTENANCE_LOCK_KEY``）。
DB_MAINTENANCE_LOCK_KEY = "db-maintenance"
#: 维护锁 TTL（30 分钟，覆盖整轮清理）。
DB_MAINTENANCE_LOCK_TTL_MS = 30 * 60_000

#: 单表单轮最多删多少批：写入方持续产生「已过保留期」的行时，删除循环否则永不返回，
#: 会把维护锁一直占着、面板也永远拿不到结果。
_MAX_DELETE_BATCHES = 10_000
#: 单表单轮清理的时间上限（秒）：到点先在批次之间收尾，剩下的留给下一轮。
_DELETE_TIME_BUDGET = 120.0

_RETENTION_MODELS: dict[str, Any] = {
    "eventLog": (EventLog, "event_logs"),
    "notification": (Notification, "notifications"),
    "securityEvent": (SecurityEvent, "security_events"),
}

#: 清理结果里的键 → 中文短名。直接打 ``dict`` 会变成 ``{'eventLog': 1}``，
#: 读日志的人还得在脑子里翻译一遍键名。
_CLEANUP_LABELS: dict[str, str] = {
    "eventLog": "事件日志",
    "notification": "通知记录",
    "securityEvent": "安防事件",
    "notificationCooldownPruned": "通知冷却条目",
}


def _describe_counts(values: dict[str, Any], unit: str, fallback: str) -> str:
    """把计数表写成「事件日志 6 条、安防事件 2 条」，非正整数项忽略。"""
    parts = []
    for key, value in values.items():
        try:
            count = int(value)
        except (TypeError, ValueError):
            continue
        if count <= 0:
            continue
        parts.append(f"{_CLEANUP_LABELS.get(key, key)} {count} {unit}")
    return "、".join(parts) or fallback


def _describe_deleted(deleted: dict[str, Any]) -> str:
    """把清理计数表写成「事件日志 6 条、安防事件 2 条」。"""
    return _describe_counts(deleted, "条", "无明细")


def _describe_retention(days: dict[str, Any]) -> str:
    """把保留策略写成「事件日志 7 天、安防事件 30 天」，避免直接打 dict repr。"""
    return _describe_counts(days, "天", "未更改")


def parse_positive_int(raw: Any) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        n = int(float(raw))
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def resolve_positive_int(from_config: Any, env_keys: list[str], fallback: int) -> int:
    if isinstance(from_config, (int, float)) and not isinstance(from_config, bool) and from_config > 0:
        return int(from_config)
    for key in env_keys:
        found = parse_positive_int(os.environ.get(key))
        if found is not None:
            return found
    return fallback


class DatabaseRetentionService:
    def __init__(self, session_factory, app_config, jobs=None, lock=None) -> None:
        self._session_factory = session_factory
        self._app_config = app_config
        self._jobs = jobs
        self._lock = lock
        self._cooldown: Any | None = None
        self._retention_days = 7
        self._last_cleanup_stats: dict[str, Any] | None = None
        self._stop = False
        self._task: asyncio.Task[Any] | None = None

    @property
    def lock(self) -> Any:
        """分布式锁服务（app 装配阶段注入；缺省时清理直接执行）。"""
        return self._lock

    @lock.setter
    def lock(self, value: Any) -> None:
        self._lock = value

    @property
    def cooldown(self) -> Any | None:
        """通知/联动冷却服务（用于 prune 过期冷却键；缺省时跳过）。"""
        return self._cooldown

    @cooldown.setter
    def cooldown(self, value: Any) -> None:
        self._cooldown = value

    def start(self) -> None:
        self._retention_days = self.resolve_retention_days()
        try:
            with self._session_factory() as session:
                self._last_cleanup_stats = load_runtime_kv(session, RETENTION_STATS_STORAGE_ID)
        except Exception as exc:
            logger.warning("加载上次清理统计失败: %s", exc)
        logger.info("数据库历史保留: %s 天", self._retention_days)

    def on_config_updated(self, sections: list[str]) -> None:
        if "other" in sections or "retention" in sections:
            self._retention_days = self.resolve_retention_days()
            logger.info("数据库历史保留策略已更新: %s 天", self._retention_days)
        # ops 变更（清理周期 / 首次延迟）时重启调度
        if "ops" in sections and self._task is not None:
            self.restart_schedule()

    # 定时调度（首次延迟 + 周期，对齐 Nest restartCleanupSchedule）
    def cleanup_interval_ms(self) -> int:
        """周期性清理间隔毫秒数，默认 1 小时；配置 <= 0 时退回 1 小时兜底。"""
        raw = self._ops().get("retentionCleanupIntervalHours")
        hours = raw if isinstance(raw, (int, float)) and not isinstance(raw, bool) else 0
        return int((hours if hours > 0 else 1) * 3_600_000)

    def first_delay_ms(self) -> int:
        """首次延迟毫秒数，默认 15s；配置 <= 0 时退回 15s 兜底（避开冷启动峰值）。"""
        raw = self._ops().get("retentionFirstDelaySec")
        sec = raw if isinstance(raw, (int, float)) and not isinstance(raw, bool) else 0
        return int((sec if sec > 0 else 15) * 1000)

    async def start_schedule(self) -> None:
        """启动「首次延迟 + 周期」清理调度（幂等：重复调用先停旧任务）。"""
        if self._task is not None:
            return
        self._stop = False
        self._task = asyncio.create_task(self._loop())
        first_delay = self.first_delay_ms() / 1000
        interval_hours = self.cleanup_interval_ms() / 3_600_000
        logger.info(
            "数据库清理计划：%.0f 秒后首次执行，之后每 %g 小时一次",
            first_delay,
            interval_hours,
        )

    def restart_schedule(self) -> None:
        """在运行中的事件循环内重启调度（配置热更新触发）。

        若在无事件循环的线程上下文中被调用，则忽略（保持既有调度）以避免崩溃。
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._task is not None:
            self._task.cancel()
            self._task = None
        self._stop = False
        self._task = loop.create_task(self._loop())

    async def stop_schedule(self) -> None:
        """停止调度任务，避免句柄泄漏（对齐 Nest onModuleDestroy）。"""
        self._stop = True
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    async def _loop(self) -> None:
        try:
            await asyncio.sleep(self.first_delay_ms() / 1000)
        except asyncio.CancelledError:
            return
        if self._stop:
            return
        await self._tick()
        while not self._stop:
            try:
                await asyncio.sleep(self.cleanup_interval_ms() / 1000)
            except asyncio.CancelledError:
                return
            if self._stop:
                return
            await self._tick()

    async def _tick(self) -> None:
        options = {"description": "数据库历史保留清理", "intervalMs": self.cleanup_interval_ms()}
        try:
            if self._jobs is not None:
                await self._jobs.run("data-retention", options, self.run_cleanup_locked)
            else:
                await self.run_cleanup_locked()
        except Exception as exc:
            logger.warning("数据库历史保留清理失败: %s", exc)

    # 保留天数解析
    def _ops(self) -> dict[str, Any]:
        return self._app_config.get("ops") or {}

    def resolve_retention_days(self) -> int:
        retention_cfg = self._app_config.get("retention") or {}
        event_log = retention_cfg.get("eventLog")
        if isinstance(event_log, (int, float)) and not isinstance(event_log, bool) and event_log > 0:
            return min(int(event_log), RETENTION_DAYS_MAX)
        other = self._app_config.get("other") or {}
        return resolve_positive_int(
            other.get("eventlogRetentionDays"),
            ["DATA_RETENTION_DAYS", "EVENTLOG_RETENTION_DAYS"],
            7,
        )

    def resolve_retention_days_for(self, key: str) -> int:
        retention_cfg = self._app_config.get("retention") or {}
        days = resolve_positive_int(retention_cfg.get(key), [], self.resolve_retention_days())
        return min(max(days, 1), RETENTION_DAYS_MAX)

    def cutoff_for_days(self, days: int) -> datetime:
        """返回「当前时间 - days」的 **naive UTC** 时间（与库中 ``createdAt`` 存储格式一致）。"""
        return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days)

    def get_cutoff_date(self) -> datetime:
        return self.cutoff_for_days(self._retention_days)

    # 面板数据
    def get_retention_policies(self) -> list[dict[str, Any]]:
        return [
            {
                "key": key,
                "table": RETENTION_TABLE_NAMES[key],
                "label": RETENTION_TABLE_LABELS[key],
                "retentionDays": self.resolve_retention_days_for(key),
            }
            for key in RETENTION_TABLE_KEYS
        ]

    def get_last_cleanup_stats(self) -> dict[str, Any] | None:
        return self._last_cleanup_stats

    def estimate_table_rows(self) -> dict[str, int]:
        """估算各保留表的行数。

        ``SELECT COUNT(*)`` 在 SQLite 上是全表扫：几十万行就是几百毫秒，还会和写入抢锁，
        而这里只是面板展示的估算值。优先读 ``sqlite_stat1``（ANALYZE 的产物，O(1)），
        没有再退回 ``MAX(rowid)``（rowid 主键上的 O(1) 查找，删除留空洞只会高估）。
        """
        result = dict.fromkeys(RETENTION_TABLE_KEYS, 0)
        with self._session_factory() as session:
            for key, (_model, table) in _RETENTION_MODELS.items():
                result[key] = self._estimate_rows(session, table)
        return result

    @staticmethod
    def _estimate_rows(session: Any, table: str) -> int:
        """单表行数估算：``sqlite_stat1`` → ``MAX(rowid)`` → 0。"""
        try:
            # sqlite_stat1.stat 形如 "120000 3 1"（行数 + 各索引平均重复数），取第一段
            row = session.execute(
                text('SELECT stat FROM sqlite_stat1 WHERE tbl = :table LIMIT 1'),
                {"table": table},
            ).first()
            if row is not None and row[0]:
                return int(str(row[0]).split()[0])
        except Exception as exc:
            logger.debug("读取 sqlite_stat1 失败(%s): %s", table, exc)
        try:
            row = session.execute(
                text(f'SELECT MAX(rowid) FROM "{table}"')  # noqa: S608 - table 来自内部常量
            ).scalar()
            return int(row or 0)
        except Exception as exc:
            logger.debug("估算 %s 行数失败: %s", table, exc)
            return 0

    def update_retention_policies(self, days: dict[str, Any]) -> list[dict[str, Any]]:
        self._app_config.update({"retention": days})
        self._retention_days = self.resolve_retention_days()
        logger.info("数据保留策略已更新：%s", _describe_retention(days))
        return self.get_retention_policies()

    # 清理
    async def run_cleanup_locked(self) -> dict[str, Any]:
        """带分布式锁的清理入口（对齐 Nest ``runCleanup``）。

        - 未接入锁服务时直接执行（单副本语义完整）；
        - 锁被其他实例持有时跳过本轮，返回空统计（不抛错）。
        """
        if self._lock is None:
            return await self._run_full_cleanup()
        try:
            return await self._lock.run_exclusive(
                DB_MAINTENANCE_LOCK_KEY,
                self._run_full_cleanup,
                DB_MAINTENANCE_LOCK_TTL_MS,
            )
        except BusinessException as exc:
            if exc.error_code == ErrorCode.CONFLICT:
                logger.debug("跳过保留清理:其他实例持有锁")
                cutoff = self.get_cutoff_date()
                return {
                    "retentionDays": self._retention_days,
                    "cutoff": cutoff.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z"),
                    "deleted": {},
                    "total": 0,
                }
            raise

    async def _run_full_cleanup(self) -> dict[str, Any]:
        """完整一轮清理：DB 分批删除（线程）。"""
        result = await asyncio.to_thread(self.run_cleanup)
        self._persist_cleanup_stats(result)
        return result

    def _persist_cleanup_stats(self, result: dict[str, Any]) -> None:
        total = int(result.get("total") or 0)
        stats = {
            "at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "retentionDays": self._retention_days,
            "total": total,
            # 保留最近一轮清理的「行数来源」，便于面板展示各表清理明细
            "deleted": result.get("deleted", {}),
            "elapsedMs": result.get("elapsedMs", 0),
        }
        self._last_cleanup_stats = stats
        try:
            persist_runtime_kv(self._session_factory, RETENTION_STATS_STORAGE_ID, stats)
        except Exception as exc:
            logger.warning("持久化清理统计失败: %s", exc)

    def run_cleanup(self) -> dict[str, Any]:
        started = time.monotonic()
        cutoff = self.get_cutoff_date()
        raw_batch = self._ops().get("retentionDeleteBatchSize")
        batch_size = int(raw_batch) if isinstance(raw_batch, (int, float)) and raw_batch > 0 else 800
        deleted: dict[str, int] = {}
        for key in RETENTION_TABLE_KEYS:
            model, _table = _RETENTION_MODELS[key]
            try:
                count = self._delete_batched(
                    model, self.cutoff_for_days(self.resolve_retention_days_for(key)), batch_size
                )
                if count > 0:
                    deleted[key] = count
            except Exception as exc:
                logger.warning("清理 %s 失败: %s", key, exc)

        # EventLog 大批量删除后 ANALYZE / VACUUM（对齐 Nest：>=1000 行时执行）
        self._vacuum_event_log(deleted.get("eventLog", 0))

        # 通知冷却 prune（与表清理独立，失败仅告警）
        try:
            cooldown = self._cooldown
            if cooldown is not None:
                pruned = int(cooldown.prune_expired() or 0)
                if pruned > 0:
                    deleted["notificationCooldownPruned"] = pruned
        except Exception as exc:
            logger.warning("通知冷却 prune 失败: %s", exc)

        total = sum(deleted.values())
        elapsed_ms = int((time.monotonic() - started) * 1000)
        result = {
            "retentionDays": self._retention_days,
            "cutoff": cutoff.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z"),
            "deleted": deleted,
            "total": total,
            "elapsedMs": elapsed_ms,
        }
        self._persist_cleanup_stats(result)
        if total > 0:
            logger.info("数据库清理完成：共删除 %s 条超期记录（%s）", total, _describe_deleted(deleted))
        return result

    # 附加清理步骤
    def _vacuum_event_log(self, deleted_count: int) -> None:
        """EventLog 删除 >=1000 行后 VACUUM + ANALYZE；失败回退 ANALYZE（对齐 Nest）。"""
        if deleted_count < 1000:
            return
        with self._session_factory() as session:
            try:
                engine = session.get_bind()
            except Exception as exc:
                logger.warning("获取数据库引擎失败: %s", exc)
                return
        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                conn.exec_driver_sql("VACUUM")
                conn.exec_driver_sql('ANALYZE "event_logs"')
            logger.info("EventLog 已 VACUUM + ANALYZE(本次删除 %s 行)", deleted_count)
        except Exception as vacuum_err:
            try:
                with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                    conn.exec_driver_sql('ANALYZE "event_logs"')
                logger.info(
                    "EventLog 已 ANALYZE(VACUUM 不可用: %s;本次删除 %s 行)",
                    vacuum_err,
                    deleted_count,
                )
            except Exception as exc:
                logger.warning("EventLog ANALYZE 失败: %s", exc)

    def _delete_batched(self, model: Any, cutoff: datetime, batch_size: int) -> int:
        """分批删除 ``createdAt < cutoff`` 的历史行（SQLite ``rowid`` 子查询）。

        有批次与时限双上限：``while True`` 只有在「写入方不停产生过期行」或子查询打不中行
        时才会一直转，那会把维护锁和清理线程一起长期占住。到上限就先收尾，剩下的留待下一轮。
        """
        table = model.__table__
        created_col = table.c["createdAt"]
        rowid = literal_column("rowid")
        total = 0
        deadline = time.monotonic() + _DELETE_TIME_BUDGET
        for _batch in range(_MAX_DELETE_BATCHES):
            subquery = (
                select(rowid).select_from(table).where(created_col < cutoff).limit(batch_size)
            )
            statement = table.delete().where(literal_column("rowid").in_(subquery))
            with self._session_factory() as session:
                result = session.execute(statement)
                session.commit()
                count = result.rowcount or 0
            total += count
            if count < batch_size:
                return total
            if time.monotonic() > deadline:
                logger.warning(
                    "清理 %s 达到时间上限(%.0fs)，本轮删除 %s 行后停止",
                    table.name,
                    _DELETE_TIME_BUDGET,
                    total,
                )
                return total
        logger.warning(
            "清理 %s 达到批次上限(%s)，本轮删除 %s 行后停止",
            table.name,
            _MAX_DELETE_BATCHES,
            total,
        )
        return total


__all__ = ["RETENTION_STATS_STORAGE_ID", "DatabaseRetentionService", "resolve_positive_int"]
