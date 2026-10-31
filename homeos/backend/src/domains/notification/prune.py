"""过期通知清理 Helper（对齐 ``modules/notification/notification-prune.helper.ts``）。

- 防抖：500ms 内的多个 prune 请求合并为一次；
- 合并执行：prune 进行中的新请求标记为 needs_rerun，完成后重新执行；
- 批量删除：每次最多删除 200 条，优先已读，不足再删未读兜底。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from sqlalchemy import delete, func, select

from ...platform.core.db.models import Notification

logger = logging.getLogger("homeos.notification.prune")

PRUNE_DEBOUNCE_MS = 500
PRUNE_BATCH_SIZE = 200


class NotificationPruneHelper:
    def __init__(
        self,
        session_factory: Callable[[], Any],
        get_cfg: Callable[[], dict[str, Any]],
    ) -> None:
        self._session_factory = session_factory
        self._get_cfg = get_cfg
        self._in_flight: asyncio.Task[None] | None = None
        self._needs_rerun = False
        self._debounce_handle: asyncio.TimerHandle | None = None

    # 调度
    def schedule_prune_old_notifications(self) -> None:
        """调度通知条数软上限清理（防抖 500ms）。"""
        if self._debounce_handle is not None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._debounce_handle = loop.call_later(
            PRUNE_DEBOUNCE_MS / 1000, self._run_when_idle
        )

    def _run_when_idle(self) -> None:
        self._debounce_handle = None
        if self._in_flight is not None and not self._in_flight.done():
            self._needs_rerun = True
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._in_flight = loop.create_task(self._run_coalesced())

    async def _run_coalesced(self) -> None:
        try:
            while True:
                self._needs_rerun = False
                await asyncio.to_thread(self._prune_old_notifications_sync)
                if not self._needs_rerun:
                    break
        except Exception as exc:
            logger.warning("清理过期通知失败: %s", exc)
        finally:
            self._in_flight = None
            if self._needs_rerun:
                self._needs_rerun = False
                self.schedule_prune_old_notifications()

    def dispose(self) -> None:
        """模块销毁时清理防抖定时器。"""
        if self._debounce_handle is not None:
            self._debounce_handle.cancel()
            self._debounce_handle = None

    def _prune_old_notifications_sync(self) -> None:
        maximum = int(self._get_cfg().get("maxNotifications") or 500)
        batch = PRUNE_BATCH_SIZE
        total_deleted = 0
        with self._session_factory() as session:
            # 只在轮次开始时 count 一次：旧实现每删一批就重新 COUNT 全表，
            # 而且每批单独 commit（N 次 fsync）。整轮删完最后统一提交即可。
            count = int(session.execute(select(func.count()).select_from(Notification)).scalar() or 0)
            excess = count - maximum
            if excess <= 0:
                return
            # 优先清理已读，不够再从最旧的未读补；每批一条 DELETE ... WHERE id IN (SELECT ...)。
            pending = excess
            while pending > 0:
                removed = self._delete_oldest(session, read_only=True, limit=min(pending, batch))
                if removed <= 0:
                    break
                total_deleted += removed
                pending -= removed
            remaining = max(0, excess - total_deleted)
            while remaining > 0:
                removed = self._delete_oldest(session, read_only=False, limit=min(remaining, batch))
                if removed <= 0:
                    break
                total_deleted += removed
                remaining -= removed
            if total_deleted > 0:
                session.commit()
        if total_deleted > 0:
            logger.info(
                "通知数量超过保留上限，已自动清理 %s 条（优先清理已读）", total_deleted
            )

    @staticmethod
    def _delete_oldest(session: Any, *, read_only: bool, limit: int) -> int:
        """删除最旧的 ``limit`` 条（``read_only`` 决定只删已读/只删未读）。"""
        if limit <= 0:
            return 0
        oldest_ids = (
            select(Notification.id)
            .where(Notification.read.is_(read_only))
            .order_by(Notification.created_at.asc())
            .limit(limit)
        )
        result = session.execute(delete(Notification).where(Notification.id.in_(oldest_ids)))
        return max(0, int(result.rowcount or 0))


__all__ = ["PRUNE_BATCH_SIZE", "PRUNE_DEBOUNCE_MS", "NotificationPruneHelper"]
