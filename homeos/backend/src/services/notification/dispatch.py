"""通知分发 Helper（对齐 ``modules/notification/notification-dispatch.helper.ts``）。

1. 全局开关关闭 → 返回 None；
2. 「重要通知」关闭时抑制非 info 的普通告警；生命安全类永不被静音；
3. DND 时段抑制非 danger；``bypassDnd`` 或生命安全 source 放行；
4. 含 in_app 渠道时持久化到数据库；
5. 通过事件总线发布 ``notification.created``（跨实例分发）；
6. 含 in_app 渠道时调度条数软上限清理；
7. 含 email/webpush/wecom 渠道时通过 ChannelsService 发送外部通知。
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import random
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from ...core.models import Notification
from ..alerts.channels import resolve_lan_channels
from ..alerts.dnd import is_dnd_active_now
from ..alerts.sources import is_life_safety_notification

logger = logging.getLogger("homeos.notification.dispatch")

_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"


def _fmt(value: Any) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def _iso_now() -> str:
    return _fmt(datetime.now(UTC))


def _fallback_id() -> str:
    suffix = "".join(random.choice(_ID_ALPHABET) for _ in range(6))
    return f"{int(time.time() * 1000)}_{suffix}"


class NotificationDispatchHelper:
    def __init__(
        self,
        *,
        session_factory: Callable[[], Any],
        event_bus: Any,
        get_cfg: Callable[[], dict[str, Any]],
        schedule_prune: Callable[[], None],
        channels_service: Any = None,
    ) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._get_cfg = get_cfg
        self._schedule_prune = schedule_prune
        self._channels_service = channels_service

    async def notify(
        self,
        level: str,
        message: str,
        source: str = "system",
        entity_id: str | None = None,
        opts: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        opts = opts or {}
        cfg = self._get_cfg()
        if cfg.get("globalNotifyEnabled") is False:
            return None
        life_safety = is_life_safety_notification(level, source)
        if cfg.get("importantNotifyEnabled") is False and level != "info" and not life_safety:
            return None
        if (
            level != "danger"
            and not opts.get("bypassDnd")
            and not life_safety
            and is_dnd_active_now(cfg)
        ):
            return None

        channels = resolve_lan_channels(opts.get("channels"))
        persisted_channels = [channel for channel in channels if channel != "tts"]
        notification: dict[str, Any]

        if "in_app" in channels:
            try:
                notification = await asyncio.to_thread(
                    self._insert_notification,
                    level,
                    message,
                    entity_id,
                    source,
                    persisted_channels,
                    channels,
                )
            except Exception as exc:  # noqa: BLE001 - 入库失败降级为内存对象
                logger.error("通知入库失败: %s", exc)
                notification = {
                    "id": _fallback_id(),
                    "level": level,
                    "message": message,
                    "entityId": entity_id,
                    "source": source,
                    "read": False,
                    "createdAt": _iso_now(),
                    "channels": channels,
                }
        else:
            notification = {
                "id": _fallback_id(),
                "level": level,
                "message": message,
                "entityId": entity_id,
                "source": source,
                "read": False,
                "createdAt": _iso_now(),
                "channels": channels,
            }

        await self._event_bus.emit("notification.created", notification)

        if "in_app" in channels:
            self._schedule_prune()

        self._send_external_notifications(channels, message, opts.get("title"))

        return notification

    def _insert_notification(
        self,
        level: str,
        message: str,
        entity_id: str | None,
        source: str,
        persisted_channels: list[str],
        channels: list[str],
    ) -> dict[str, Any]:
        with self._session_factory() as session:
            record = Notification(
                level=level,
                message=message,
                entity_id=entity_id,
                source=source,
                read=False,
                delivery_channels=json.dumps(persisted_channels, ensure_ascii=False),
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            payload: dict[str, Any] = {
                "id": record.id,
                "level": record.level,
                "message": record.message,
            }
            if record.entity_id:
                payload["entityId"] = record.entity_id
            payload["source"] = record.source
            payload["read"] = bool(record.read)
            payload["createdAt"] = _fmt(record.created_at)
            if record.delivered_at is not None:
                payload["deliveredAt"] = _fmt(record.delivered_at)
            payload["deliveryChannels"] = persisted_channels
            payload["channels"] = channels
            return payload

    def _send_external_notifications(
        self, channels: list[str], message: str, title: str | None
    ) -> None:
        if self._channels_service is None:
            return
        sender = getattr(self._channels_service, "send_external_alert", None)
        if sender is None:
            return
        try:
            result = sender(channels, message, title)
        except Exception as exc:  # noqa: BLE001
            logger.error("发送外部通知失败: %s", exc)
            return
        if not inspect.isawaitable(result):
            return

        async def _await_result() -> None:
            try:
                await result
            except Exception as exc:  # noqa: BLE001
                logger.error("发送外部通知失败: %s", exc)

        asyncio.ensure_future(_await_result())


__all__ = ["NotificationDispatchHelper"]
