"""定时自动备份服务（对齐 ``modules/system/backup/auto-backup.service.ts``）。

每天 02:30（Asia/Shanghai）生成完整备份包并保留近 N 天产物。

- 开关与保留天数读取 ``ops.autoBackupEnabled`` / ``ops.autoBackupRetainDays``（系统参数热更新）；
- 单副本部署，调度到点直接执行；
- 每次执行后记录 ``lastRunAt`` / ``lastError``，供 ``GET /system/backup/auto/status`` 展示。
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime
from typing import Any

from ...platform.core.runtime.zoned_time import date_from_zoned_wall_clock, zoned_date_parts

logger = logging.getLogger("homeos.backup.auto")

#: 自动备份触发时刻（与 Cron 保持一致，用于计算 nextRunAt）
AUTO_BACKUP_HOUR = 2
AUTO_BACKUP_MINUTE = 30
#: 文案与 Cron 固定北京时间，避免容器 UTC 把 02:30 跑成上午 10:30
AUTO_BACKUP_TZ = "Asia/Shanghai"


class AutoBackupService:
    """Nest ``AutoBackupService`` 等价实现（APScheduler 承载 Cron 语义）。"""

    def __init__(self, app_config: Any, server_backup: Any, coordinator: Any = None) -> None:
        self._app_config = app_config
        self._server_backup = server_backup
        self._coordinator = coordinator
        self.last_run_at: str | None = None
        self.last_error: str | None = None
        self._scheduler: Any = None

    # 调度生命周期
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

    # 状态
    def get_status(self) -> dict[str, Any]:
        ops = self._app_config.get("ops") or {}
        return {
            "enabled": bool(ops.get("autoBackupEnabled")),
            "retainDays": int(ops.get("autoBackupRetainDays") or 0),
            "lastRunAt": self.last_run_at,
            "lastError": self.last_error,
            "nextRunAt": self.compute_next_run_at(),
        }

    async def run_auto_backup(self) -> None:
        ops = self._app_config.get("ops") or {}
        if not ops.get("autoBackupEnabled"):
            logger.debug("自动备份未启用,跳过")
            return
        # 维护闸门只拦 HTTP 请求，拦不住这里的进程内作业：恢复正在进行时必须主动让路，
        # 否则备份会采到「库已换、数据文件挪了一半」的中间态。
        if self._coordinator is not None and self._coordinator.maintenance:
            logger.warning("正在恢复业务数据，本次自动备份跳过")
            return
        try:
            if self._coordinator is not None:
                name = await self._coordinator.run_exclusive(
                    self._create_and_prune, int(ops.get("autoBackupRetainDays") or 0)
                )
            else:
                name = await asyncio.to_thread(
                    self._create_and_prune, int(ops.get("autoBackupRetainDays") or 0)
                )
            self.last_run_at = datetime.now(UTC).isoformat(timespec="milliseconds").replace(
                "+00:00", "Z"
            )
            self.last_error = None
            logger.info("自动备份完成:%s", name)
        except Exception as err:
            self.last_error = str(err)
            logger.error("自动备份失败: %s", self.last_error)

    def _create_and_prune(self, retain_days: int) -> str:
        """生成自动备份并清理超期产物（同步，跑在 worker 线程里）。"""
        name = self._server_backup.create_backup(origin="auto")["name"]
        self.prune_old_backups(retain_days)
        return name

    def prune_old_backups(self, retain_days: int) -> None:
        """清理超出保留天数的**自动**备份包（按文件 mtime 判定）。

        只清 ``homeos-auto-`` 前缀的产物，且永远保留最新的一份：

        - 手动包（``homeos-full-``）与自动包过去同名同目录，无法区分来源，于是「升级前手动
          备份」闲置超期就被静默删掉 —— 那往往正是最该留下的那一份；
        - 没有任何「至少留一份」的兜底时，长时间停机后首次调度会先造新包再删旧包，看似安全，
          但若新包创建失败、清理又先跑，就会把历史清空。
        """
        if not isinstance(retain_days, (int, float)) or retain_days < 1:
            return
        cutoff_ms = time.time() * 1000 - retain_days * 24 * 60 * 60 * 1000
        entries = [item for item in self._server_backup.list_files() if item.get("origin") == "auto"]
        if len(entries) <= 1:
            return
        # list_files 已按 mtime 倒序：跳过最新的那份，其余超期才删。
        for file in entries[1:]:
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

    # 下次执行时刻
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
    "AUTO_BACKUP_TZ",
    "AutoBackupService",
]
