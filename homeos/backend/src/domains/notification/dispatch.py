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

from .dedupe import NotificationDeduplicator
from ..alerts.channels import resolve_lan_channels
from ..alerts.dnd import is_dnd_active_now
from ..alerts.sources import is_life_safety_notification
from ..app_config.defaults import DEFAULT_VOICE_ALERT_RULES
from ...platform.core.db.models import Notification
from ...platform.core.runtime.background import spawn_background
from ...platform.core.runtime.voice_alert_keys import voice_alert_key

logger = logging.getLogger("homeos.notification.dispatch")

#: 外部通道（邮件 / 企微 / webpush）最大投递尝试次数（含首次）
_EXTERNAL_MAX_ATTEMPTS = 3
#: 需要**外部投递**的通道（站内 / socket 不算）：只有它们才能决定 delivered_at。
_EXTERNAL_CHANNELS = ("email", "webpush", "wecom")

#: 长度上限（对齐参考实现）：标题 120、渠道正文 1500、推送正文 600。
MAX_TITLE_CHARS = 120
MAX_TEXT_CHARS = 1500
MAX_PUSH_CHARS = 600
_TRUNCATED_SUFFIX = "…(内容过长，已截断)"

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


def _is_muted_source(cfg: dict[str, Any], source: str) -> bool:
    """``notification.mutedSources`` 是否覆盖该来源（支持前缀匹配，如 ``earthquake``）。"""
    raw = cfg.get("mutedSources")
    if not isinstance(raw, list):
        return False
    text = str(source or "").strip()
    if not text:
        return False
    for item in raw:
        value = str(item or "").strip()
        if not value:
            continue
        # 精确或「同族前缀」命中：``earthquake`` 会静音 ``earthquake-eew`` /
        # ``earthquake-catalog``；但不匹配 ``earthquakeX``（必须带分隔符），
        # 避免将来新增一个名字相近的无关来源被意外静音。
        if text == value or text.startswith(f"{value}-"):
            return True
    return False


def _truncate(text: Any, limit: int) -> str:
    """按字符数截断并追加统一后缀；``None`` → 空串。"""
    value = "" if text is None else str(text)
    if len(value) <= limit:
        return value
    keep = max(0, limit - len(_TRUNCATED_SUFFIX))
    return value[:keep] + _TRUNCATED_SUFFIX


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
        dedupe: NotificationDeduplicator | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._get_cfg = get_cfg
        self._schedule_prune = schedule_prune
        self._channels_service = channels_service
        self._get_timezone = get_timezone or (lambda: None)
        # 未注入时退化为「仅进程内 10s 内容去重」：不落库，不影响功能。
        self._dedupe = dedupe if dedupe is not None else NotificationDeduplicator()

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
        # 按来源静音：只能静音「非危险、非生命安全」的通知。
        # 以前的粒度只有 4 个总开关 —— 想静音家庭模式切换就得连安防告警一起关掉。
        if not life_safety and level != "danger" and _is_muted_source(cfg, source):
            logger.debug("通知来源已静音，丢弃: source=%s level=%s", source, level)
            return None

        # 第 2、3 层抑制：24h 幂等（显式键 / 主动外呼）+ 10s 内容去重。
        # 放在免打扰之前：同一事件在静音时段被重复投递同样没有意义。
        raw_prompt = opts.get("actionPrompt")
        if self._is_duplicate(
            source=source,
            entity_id=entity_id,
            message=message,
            raw_prompt=raw_prompt,
            level=level,
            opts=opts,
            life_safety=life_safety,
        ):
            logger.debug("通知被去重抑制: source=%s entity=%s", source, entity_id)
            return None

        # 长度上限：标题 120、正文 1500（推送侧另有更紧的上限，由渠道实现自行裁剪）。
        message = _truncate(message, MAX_TEXT_CHARS)
        title = _truncate(opts.get("title"), MAX_TITLE_CHARS) or None
        opts = {**opts, "title": title}
        # 免打扰期间**不丢**：仍然入库并带 ``deferred`` 标记，只是不实时推送、不发外部渠道。
        # 旧实现直接 ``return None``，于是静音时段内的告警彻底消失 —— 用户既看不到，
        # 也没有任何「被抑制过」的痕迹。危险级与生命安全的通知照常穿透。
        deferred = bool(
            level != "danger"
            and not opts.get("bypassDnd")
            and not life_safety
            and is_dnd_active_now(cfg, timezone_name=await asyncio.to_thread(self._get_timezone))
        )

        channels = resolve_lan_channels(opts.get("channels"))
        persisted_channels = [channel for channel in channels if channel != "tts"]
        # 只接受系统提醒写入的短指令；截断到 120 字，避免通知条目变成一大段可执行文本
        action_prompt = str(raw_prompt).strip()[:120] if raw_prompt else None
        notification: dict[str, Any]

        notification = await self._build_notification(
            {
                "level": level,
                "message": message,
                "entityId": entity_id,
                "source": source,
                "channels": channels,
                "persistedChannels": persisted_channels,
                "actionPrompt": action_prompt,
                "deferred": deferred,
                "opts": opts,
            }
        )
        if notification is None:
            return None

        await self._event_bus.emit("notification.created", notification)

        # 只有真正入库成功的通知才跑条数清理；无 id 的 ephemeral / 外部-only 跳过。
        if "in_app" in channels and notification.get("id") is not None:
            self._schedule_prune()

        if deferred:
            # 免打扰：站内已经入库（用户打开通知中心能看到），但外部渠道（WebPush / 邮件 /
            # 企微）不在静音时段打扰。恢复后无需补发 —— 站内条目就是「没丢」的证据。
            #
            # **语音也属于「打扰」**：这里必须在 ``_announce`` 之前返回。旧顺序让静音时段
            # 的通知照样被念出来，正好与用户按下「免打扰」的意图相反。
            logger.debug("免打扰期间延后外部投递: source=%s level=%s", source, level)
            return notification

        self._send_external_notifications(channels, message, opts.get("title"), notification.get("id"))
        await self._announce(cfg, level, message, source, opts)

        return notification

    async def _announce(
        self,
        cfg: dict[str, Any],
        level: str,
        message: str,
        source: str,
        opts: dict[str, Any],
    ) -> None:
        """按语音告警矩阵决定是否播报。

        这里才是「语音告警开关」生效的地方：设置页那 14 个开关此前只用于渲染与预览，
        关掉「能耗异常」不会有任何行为变化。播报走事件总线（``tts.speak``），复用
        已有选路与冷却，不在通知链里再造一份。

        ``cfg`` 由调用方传入：同一条通知里已经读过一次配置，再读一次等于把每次投递
        都变成两次配置查询。
        """
        voice = cfg.get("voice") if isinstance(cfg.get("voice"), dict) else {}
        # 默认矩阵与「用户覆盖」的合并语义只有一份（在默认值表里定义），这里只取开关。
        rules = dict(DEFAULT_VOICE_ALERT_RULES)
        overrides = voice.get("ttsAlerts") if isinstance(voice, dict) else None
        if isinstance(overrides, dict):
            for key, value in overrides.items():
                if key in rules and isinstance(value, bool):
                    rules[key] = value
        if not rules.get("enabled", False):
            return
        # 调用方可显式指定语音键（安防告警的 source 恒为 ``security``，
        # 但语音矩阵把烟雾/燃气/漏水拆成了三个开关）。
        key = str(opts.get("voiceKey") or "") or voice_alert_key(source, level)
        if key is None or not rules.get(key, False):
            return
        await self._event_bus.emit("tts.speak", {"message": message, "source": source})

    async def _build_notification(self, meta: dict[str, Any]) -> dict[str, Any] | None:
        """组装通知 payload（入库 / ephemeral / 门铃 / 提示音 / 免打扰标记）。"""
        channels = meta["channels"]
        if "in_app" not in channels:
            notification = {
                "id": _fallback_id(),
                "level": meta["level"],
                "message": meta["message"],
                "entityId": meta["entityId"],
                "source": meta["source"],
                "read": False,
                "createdAt": _iso_now(),
                "channels": channels,
            }
            return self._decorate_notification(notification, meta)
        try:
            notification = await asyncio.to_thread(
                self._insert_notification,
                meta["level"],
                meta["message"],
                meta["entityId"],
                meta["source"],
                meta["persistedChannels"],
                channels,
                meta["actionPrompt"],
            )
        except Exception as exc:
            # 入库失败不得伪造可已读 ID：假 ID 会让前端点「已读」却永远对不上库行。
            logger.error("通知入库失败: %s", exc)
            external_only = [channel for channel in channels if channel in _EXTERNAL_CHANNELS]
            if not external_only:
                return None
            notification = {
                "level": meta["level"],
                "message": meta["message"],
                "entityId": meta["entityId"],
                "source": meta["source"],
                "read": False,
                "createdAt": _iso_now(),
                "channels": external_only,
            }
        return self._decorate_notification(notification, meta)

    @staticmethod
    def _decorate_notification(notification: dict[str, Any], meta: dict[str, Any]) -> dict[str, Any]:
        """补 actionPrompt / 门铃类型 / 提示音 / 免打扰标记。"""
        if meta["actionPrompt"]:
            notification["actionPrompt"] = meta["actionPrompt"]
        camera_entity_id = str(meta["opts"].get("cameraEntityId") or "").strip()
        if camera_entity_id:
            notification["type"] = "doorbell"
            notification["cameraEntityId"] = camera_entity_id
        sound = str(meta["opts"].get("sound") or "").strip()
        if sound:
            notification["sound"] = sound
        if meta["deferred"]:
            notification["deferred"] = True
        return notification

    def _is_duplicate(
        self,
        *,
        source: str,
        entity_id: str | None,
        message: str,
        raw_prompt: Any,
        level: str,
        opts: dict[str, Any],
        life_safety: bool,
    ) -> bool:
        """去重判定（独立成方法：``notify`` 的分支数已接近复杂度上限）。"""
        if opts.get("skipDedupe"):
            return False
        return self._dedupe.should_suppress(
            source=source,
            entity_id=entity_id,
            message=message,
            action_prompt=str(raw_prompt).strip() if raw_prompt else None,
            idempotency_key=opts.get("idempotencyKey"),
            level=level,
            resolved=bool(opts.get("resolved")),
            life_safety=life_safety,
        )

    def _insert_notification(
        self,
        level: str,
        message: str,
        entity_id: str | None,
        source: str,
        persisted_channels: list[str],
        channels: list[str],
        action_prompt: str | None = None,
    ) -> dict[str, Any]:
        with self._session_factory() as session:
            record = Notification(
                level=level,
                message=message,
                entity_id=entity_id,
                source=source,
                read=False,
                action_prompt=action_prompt,
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
            if record.action_prompt:
                payload["actionPrompt"] = record.action_prompt
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
                delivered |= {channel for channel in pending if outcomes.get(channel) == "ok"}
                # 结果里没出现的通道（发送器抛异常或无返回）按失败处理，
                # 避免「通道凭空消失」被当成成功。
                failed = [channel for channel in pending if outcomes.get(channel) not in {"ok", "skipped"}]
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
