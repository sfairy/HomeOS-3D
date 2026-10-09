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

from sqlalchemy import func, select

from ...core.models import Notification

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

    # ------------------------------------------------------------------ #
    # 调度
    # ------------------------------------------------------------------ #
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

    # ------------------------------------------------------------------ #
    # 执行
    # ------------------------------------------------------------------ #
    def _prune_old_notifications_sync(self) -> None:
        maximum = int(self._get_cfg().get("maxNotifications") or 500)
        batch = PRUNE_BATCH_SIZE
        total_deleted = 0
        with self._session_factory() as session:
            while True:
                count = int(session.execute(select(func.count()).select_from(Notification)).scalar() or 0)
                if count <= maximum:
                    break
                to_delete = min(count - maximum, batch)
                oldest = list(
                    session.execute(
                        select(Notification.id)
                        .where(Notification.read.is_(True))
                        .order_by(Notification.created_at.asc())
                        .limit(to_delete)
                    ).scalars()
                )
                if len(oldest) < to_delete:
                    need = to_delete - len(oldest)
                    oldest.extend(
                        session.execute(
                            select(Notification.id)
                            .where(Notification.read.is_(False))
                            .order_by(Notification.created_at.asc())
                            .limit(need)
                        ).scalars()
                    )
                if not oldest:
                    break
                session.execute(
                    Notification.__table__.delete().where(Notification.id.in_(oldest))
                )
                session.commit()
                total_deleted += len(oldest)
                if len(oldest) < to_delete:
                    break
        if total_deleted > 0:
            logger.info("自动清理 %s 条通知(条数软上限,优先已读)", total_deleted)


__all__ = ["PRUNE_BATCH_SIZE", "PRUNE_DEBOUNCE_MS", "NotificationPruneHelper"]
