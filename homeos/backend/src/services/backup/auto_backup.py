"""定时自动备份服务（对齐 ``modules/system/backup/auto-backup.service.ts``）。

每天 02:30（Asia/Shanghai）生成完整备份包并保留近 N 天产物。

- 开关与保留天数读取 ``ops.autoBackupEnabled`` / ``ops.autoBackupRetainDays``（系统参数热更新）；
- 多实例部署时通过 Redis 互斥锁避免重复备份；Redis 不可用时降级为本地执行；
- 每次执行后记录 ``lastRunAt`` / ``lastError``，供 ``GET /system/backup/auto/status`` 展示。
"""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime
from typing import Any

from ...core.zoned_time import date_from_zoned_wall_clock, zoned_date_parts

logger = logging.getLogger("homeos.backup.auto")

#: Redis 互斥锁 Key：多副本仅一个实例执行自动备份
AUTO_BACKUP_LOCK_KEY = "homeos:auto-backup:lock"
#: 锁 TTL（秒）：正常备份在秒级完成，30 分钟兜底防止异常卡死占锁
AUTO_BACKUP_LOCK_TTL_SEC = 1800
#: 自动备份触发时刻（与 Cron 保持一致，用于计算 nextRunAt）
AUTO_BACKUP_HOUR = 2
AUTO_BACKUP_MINUTE = 30
#: 文案与 Cron 固定北京时间，避免容器 UTC 把 02:30 跑成上午 10:30
AUTO_BACKUP_TZ = "Asia/Shanghai"

_RELEASE_LOCK_SCRIPT = (
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'
)


class AutoBackupService:
    """Nest ``AutoBackupService`` 等价实现（APScheduler 承载 Cron 语义）。"""

    def __init__(self, app_config: Any, server_backup: Any, redis: Any) -> None:
        self._app_config = app_config
        self._server_backup = server_backup
        self._redis = redis
        self.last_run_at: str | None = None
        self.last_error: str | None = None
        self._lock_token: str | None = None
        self._scheduler: Any = None

    # ------------------------------------------------------------------ #
    # 调度生命周期
    # ------------------------------------------------------------------ #
    def start(self) -> None:
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            from apscheduler.triggers.cron import CronTrigger
        except Exception as err:
            logger.warning("自动备份调度未启动（APScheduler 不可用）: %s", err)
            return
        scheduler = AsyncIOScheduler(timezone=AUTO_BACKUP_TZ)
        scheduler.add_job(
            self.run_auto_backup,
            CronTrigger(
                hour=AUTO_BACKUP_HOUR,
                minute=AUTO_BACKUP_MINUTE,
                timezone=AUTO_BACKUP_TZ,
            ),
            id="system-auto-backup",
            replace_existing=True,
        )
        scheduler.start()
        self._scheduler = scheduler
        logger.info("自动备份调度已启动: 每天 02:30 %s", AUTO_BACKUP_TZ)

    def stop(self) -> None:
        if self._scheduler is not None:
            try:
                self._scheduler.shutdown(wait=False)
            except Exception as err:
                logger.warning("关闭自动备份调度失败: %s", err)
            self._scheduler = None

    # ------------------------------------------------------------------ #
    # 状态
    # ------------------------------------------------------------------ #
    def get_status(self) -> dict[str, Any]:
        ops = self._app_config.get("ops") or {}
        return {
            "enabled": bool(ops.get("autoBackupEnabled")),
            "retainDays": int(ops.get("autoBackupRetainDays") or 0),
            "lastRunAt": self.last_run_at,
            "lastError": self.last_error,
            "nextRunAt": self.compute_next_run_at(),
        }

    # ------------------------------------------------------------------ #
    # 执行
    # ------------------------------------------------------------------ #
    async def run_auto_backup(self) -> None:
        ops = self._app_config.get("ops") or {}
        if not ops.get("autoBackupEnabled"):
            logger.debug("自动备份未启用,跳过")
            return
        if not await self._acquire_lock():
            logger.info("自动备份跳过:另一实例正在执行或锁尚未释放")
            return
        try:
            name = self._server_backup.create_backup()["name"]
            self.prune_old_backups(int(ops.get("autoBackupRetainDays") or 0))
            self.last_run_at = datetime.now(UTC).isoformat(timespec="milliseconds").replace(
                "+00:00", "Z"
            )
            self.last_error = None
            logger.info("自动备份完成:%s", name)
        except Exception as err:
            self.last_error = str(err)
            logger.error("自动备份失败: %s", self.last_error)
        finally:
            await self._release_lock()

    def prune_old_backups(self, retain_days: int) -> None:
        """清理超出保留天数的历史备份包（按文件 mtime 判定）。"""
        if not isinstance(retain_days, (int, float)) or retain_days < 1:
            return
        cutoff_ms = time.time() * 1000 - retain_days * 24 * 60 * 60 * 1000
        for file in self._server_backup.list_files():
            try:
                mtime_ms = datetime.fromisoformat(
                    str(file["mtime"])
                ).timestamp() * 1000
            except (TypeError, ValueError):
                continue
            if mtime_ms < cutoff_ms:
                try:
                    self._server_backup.delete_file(file["name"])
                    logger.info("自动清理过期备份 %s", file["name"])
                except Exception as err:
                    logger.warning("清理过期备份 %s 失败: %s", file["name"], err)

    # ------------------------------------------------------------------ #
    # Redis 互斥锁
    # ------------------------------------------------------------------ #
    async def _acquire_lock(self) -> bool:
        """Redis SET NX EX 互斥锁；Redis 不可用时放行（standalone 部署无并发风险）。"""
        if not self._redis.is_ready():
            return True
        client = self._redis.get_client()
        if client is None:
            return True
        token = f"{os.getpid()}:{int(time.time() * 1000)}"
        try:
            ok = await client.set(
                AUTO_BACKUP_LOCK_KEY, token, ex=AUTO_BACKUP_LOCK_TTL_SEC, nx=True
            )
        except Exception as err:
            logger.warning("获取自动备份锁失败: %s", err)
            return True
        if ok:
            self._lock_token = token
            return True
        return False

    async def _release_lock(self) -> None:
        if not self._lock_token or not self._redis.is_ready():
            self._lock_token = None
            return
        client = self._redis.get_client()
        if client is None:
            self._lock_token = None
            return
        try:
            await client.eval(_RELEASE_LOCK_SCRIPT, 1, AUTO_BACKUP_LOCK_KEY, self._lock_token)
        except Exception as err:
            logger.warning("释放自动备份锁失败: %s", err)
        finally:
            self._lock_token = None

    # ------------------------------------------------------------------ #
    # 下次执行时刻
    # ------------------------------------------------------------------ #
    def compute_next_run_at(self) -> str:
        """计算下一个执行时刻（当日/次日 02:30 Asia/Shanghai 的 ISO 时间）。"""
        now = datetime.now(UTC)
        parts = zoned_date_parts(now, AUTO_BACKUP_TZ)
        nxt = date_from_zoned_wall_clock(
            AUTO_BACKUP_TZ,
            parts["year"],
            parts["month"],
            parts["day"],
            AUTO_BACKUP_HOUR,
            AUTO_BACKUP_MINUTE,
        )
        if nxt.timestamp() * 1000 <= now.timestamp() * 1000:
            noon = date_from_zoned_wall_clock(
                AUTO_BACKUP_TZ, parts["year"], parts["month"], parts["day"], 12, 0
            )
            next_day = zoned_date_parts(
                datetime.fromtimestamp(noon.timestamp() + 24 * 60 * 60, UTC), AUTO_BACKUP_TZ
            )
            nxt = date_from_zoned_wall_clock(
                AUTO_BACKUP_TZ,
                next_day["year"],
                next_day["month"],
                next_day["day"],
                AUTO_BACKUP_HOUR,
                AUTO_BACKUP_MINUTE,
            )
        return nxt.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


__all__ = [
    "AUTO_BACKUP_LOCK_KEY",
    "AUTO_BACKUP_TZ",
    "AutoBackupService",
]
