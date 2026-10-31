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

from ..alerts.channels import resolve_lan_channels
from ..alerts.dnd import is_dnd_active_now
from ..alerts.sources import is_life_safety_notification
from ...platform.core.db.models import Notification
from ...platform.core.runtime.background import spawn_background

logger = logging.getLogger("homeos.notification.dispatch")

#: 外部通道（邮件 / 企微 / webpush）最大投递尝试次数（含首次）
_EXTERNAL_MAX_ATTEMPTS = 3
#: 需要**外部投递**的通道（站内 / socket 不算）：只有它们才能决定 delivered_at。
_EXTERNAL_CHANNELS = ("email", "webpush", "wecom")

#: 通道 id → 中文名（日志里给人看）
_CHANNEL_LABELS: dict[str, str] = {
    "email": "邮件",
    "webpush": "WebPush",
    "wecom": "企业微信",
}

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
        get_timezone: Callable[[], str | None] | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._get_cfg = get_cfg
        self._schedule_prune = schedule_prune
        self._channels_service = channels_service
        self._get_timezone = get_timezone or (lambda: None)

    async def notify(
        self,
        level: str,
        message: str,
        source: str = "system",
        entity_id: str | None = None,
        opts: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        opts = opts or {}
        cfg = await asyncio.to_thread(self._get_cfg)
        if cfg.get("globalNotifyEnabled") is False:
            return None
        life_safety = is_life_safety_notification(level, source)
        if cfg.get("importantNotifyEnabled") is False and level != "info" and not life_safety:
            return None
        if (
            level != "danger"
            and not opts.get("bypassDnd")
            and not life_safety
            and is_dnd_active_now(
                cfg, timezone_name=await asyncio.to_thread(self._get_timezone)
            )
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
            except Exception as exc:
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

        self._send_external_notifications(channels, message, opts.get("title"), notification.get("id"))

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

    def _mark_delivered(self, notification_id: str | None) -> None:
        """记录外部通道投递成功时间（``deliveredAt`` 为空即代表未投递成功）。"""
        if not notification_id:
            return
        try:
            with self._session_factory() as session:
                record = session.get(Notification, notification_id)
                if record is not None:
                    # 与 gateway_broadcasts._mark_notification_delivered 保持同一口径：naive UTC。
                    record.delivered_at = datetime.now(UTC).replace(tzinfo=None)
                    session.commit()
        except Exception as exc:
            logger.debug("标记通知投递时间失败: %s", exc)

    def _send_external_notifications(
        self, channels: list[str], message: str, title: str | None, notification_id: str | None = None
    ) -> None:
        if self._channels_service is None:
            return
        sender = getattr(self._channels_service, "send_external_alert", None)
        if sender is None:
            return

        async def _deliver_with_retry() -> None:
            # 只把**在通道列表里的外部通道**当作待投递目标：纯站内 / socket 通知没有任何
            # 外部通道可投，绝不能标记 delivered_at 或广播 delivered 事件。
            pending = [channel for channel in _EXTERNAL_CHANNELS if channel in channels]
            if not pending:
                return
            delivered: set[str] = set()
            failed: list[str] = []
            for attempt in range(1, _EXTERNAL_MAX_ATTEMPTS + 1):
                try:
                    result = sender(pending, message, title)
                    if inspect.isawaitable(result):
                        result = await result
                except Exception as exc:
                    logger.debug("外部通道投递异常: %s", exc)
                    result = None
                outcomes = result if isinstance(result, dict) else {}
                delivered |= {
                    channel for channel in pending if outcomes.get(channel) == "ok"
                }
                # 结果里没出现的通道（发送器抛异常或无返回）按失败处理，
                # 避免「通道凭空消失」被当成成功。
                failed = [
                    channel
                    for channel in pending
                    if outcomes.get(channel) not in {"ok", "skipped"}
                ]
                if not failed:
                    break
                # 只重试失败的通道：成功的通道再投一次会造成重复邮件 / 重复企微消息。
                pending = list(failed)
                if attempt < _EXTERNAL_MAX_ATTEMPTS:
                    await asyncio.sleep(min(2 ** (attempt - 1), 8))

            if failed:
                try:
                    await self._event_bus.emit(
                        "notification.deliveryFailed",
                        {"id": notification_id, "channels": failed},
                    )
                except Exception as exc:
                    logger.debug("广播投递失败事件失败: %s", exc)
                logger.warning(
                    "外部通知发送失败（已重试 %s 次）：%s；站内通知不受影响",
                    _EXTERNAL_MAX_ATTEMPTS,
                    "、".join(_CHANNEL_LABELS.get(channel, channel) for channel in failed),
                )
                return
            if not delivered:
                # 所有外部通道都未启用/未就绪：既没送达也不算失败。这是配置状态而非故障，
                # 每条通知都 WARN 会让人误以为系统坏了；站内通知本身已经送达。
                logger.info(
                    "通知已写入站内，但目标外部通道均未启用：%s",
                    "、".join(_CHANNEL_LABELS.get(channel, channel) for channel in pending),
                )
                return
            await asyncio.to_thread(self._mark_delivered, notification_id)
            try:
                await self._event_bus.emit(
                    "notification.delivered",
                    {"id": notification_id, "channels": sorted(delivered)},
                )
            except Exception as exc:
                logger.debug("广播投递成功事件失败: %s", exc)

        spawn_background(_deliver_with_retry())


__all__ = ["NotificationDispatchHelper"]
