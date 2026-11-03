"""消息推送工具族：让管家把一句话主动推到站内 / WebPush / 企微 / 邮件。

设计口径：

- **只走已配置通道**：工具不接受收件人、手机号、Webhook URL 等参数，避免模型（或被
  提示注入的设备名 / 日历标题）把内容推到任意地址；可选渠道只是通知中心渠道的子集。
- **必须带执行身份**：无身份时拒绝，防止未绑定的 IM 通道借 LLM 群发消息。
- **进程内频控**：模型被诱导刷消息是最容易发生的滥用（每轮几十条），按用户做分钟级与
  天级双层限流。多 worker 下各自计数，上限只为防误用，不承担强一致配额。
- **用户主动提醒绕过免打扰**：由 :func:`_send_notification` 的 ``bypass_dnd`` 参数控制，
  计划任务到点提醒时必须送达；普通「帮我发条消息」仍遵守免打扰。
"""

from __future__ import annotations

import time
from typing import Any

from .home_tools_base import HomeToolsHost
from .home_tools_primitives import _s, logger

#: 管家主动推送的默认来源标识（通知中心按来源分类 / 过滤）
NOTIFY_SOURCE = "agent-notify"

#: 允许模型选择的渠道（与 ``alerts.channels.LAN_NOTIFICATION_CHANNELS`` 对齐的子集）
ALLOWED_CHANNELS = frozenset({"in_app", "socket", "webpush", "wecom", "email"})

#: 标题 / 正文长度上限（通知中心列表单行展示，超过会被前端截断，不如先收敛）
MAX_TITLE_CHARS = 120
MAX_MESSAGE_CHARS = 500

#: 频控：每分钟条数 / 每天条数
RATE_LIMIT_PER_MINUTE = 10
RATE_LIMIT_PER_DAY = 200


class _NotifyRateLimiter:
    """按用户统计发送时间戳的滑动窗口频控（进程内）。

    只保留最近 24h 的时间戳：日上限需要它们，更早的没有了意义。数量级是「每用户每天
    200 条」，即使几十个用户也只占几千个浮点数，不需要额外淘汰结构。
    """

    WINDOW_DAY = 86_400

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}

    def check(self, owner: str, now: float | None = None) -> str | None:
        """返回拒绝文案；允许发送时返回 ``None``（不记账，由 :meth:`record` 记）。"""
        moment = time.monotonic() if now is None else now
        hits = self._prune(owner, moment)
        minute_hits = [ts for ts in hits if moment - ts < 60]
        if len(minute_hits) >= RATE_LIMIT_PER_MINUTE:
            return f"消息发送过于频繁（每分钟最多 {RATE_LIMIT_PER_MINUTE} 条），请稍后再试。"
        if len(hits) >= RATE_LIMIT_PER_DAY:
            return f"今天已经发了很多条消息（每天最多 {RATE_LIMIT_PER_DAY} 条），请明天再试。"
        return None

    def record(self, owner: str, now: float | None = None) -> None:
        moment = time.monotonic() if now is None else now
        self._hits.setdefault(owner, []).append(moment)

    def _prune(self, owner: str, moment: float) -> list[float]:
        hits = [ts for ts in self._hits.get(owner, []) if moment - ts < self.WINDOW_DAY]
        self._hits[owner] = hits
        return hits


class HomeToolsNotifyMixin(HomeToolsHost):
    """消息推送工具族：主动发通知。"""

    #: 进程内发射频控：主类 ``__init__`` 建实例，mixin 只声明类型
    _notify_limiter: Any = None

    async def _send_notification(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        """把一条消息推到通知中心与已配置的外部通道。

        参数：``title``（可选）、``message``（必填）、``channels``（可选子集）、
        ``level``（info/warn）、``bypass_dnd``（仅计划任务到点提醒使用）。
        """
        if actor is None:
            return {
                "success": False,
                "blocked": True,
                "message": "未绑定执行身份，无法发送消息。请在通道配置中绑定 HomeOS 用户。",
            }
        notification = self._notification
        if notification is None:
            return {"error": "通知服务未启用"}

        level, message, title, channels, invalid = _notify_payload(args)
        if invalid:
            return {"success": False, "message": invalid}

        owner = str(getattr(actor, "user_id", "") or getattr(actor, "username", "") or "anon")
        denied = self._notify_allowed(owner)
        if denied:
            logger.warning("管家发消息被频控拦截: owner=%s", owner)
            return {"success": False, "blocked": True, "message": denied}

        opts = _notify_opts(title, channels, args.get("bypass_dnd"))
        try:
            result = await notification.notify(level, message, NOTIFY_SOURCE, None, opts)
        except Exception as exc:  # pragma: no cover - 通知服务自身防御
            logger.warning("管家发消息失败: %s", exc)
            return {"success": False, "error": f"消息发送失败：{exc}"}

        self._notify_limiter.record(owner)
        return _notify_response(result, title)

    def _notify_allowed(self, owner: str) -> str | None:
        """频控闸门：懒建限流器（精简装配可能跳过 __init__）。"""
        limiter = self._notify_limiter
        if limiter is None:
            limiter = _NotifyRateLimiter()
            self._notify_limiter = limiter
        return limiter.check(owner)


def _notify_channels(raw: Any) -> tuple[list[str] | None, str | None]:
    """校验模型传入的渠道子集；空数组语义是「通知中心默认通道」。"""
    if not isinstance(raw, list):
        return None, None
    picked = [str(item).strip().lower() for item in raw if str(item).strip()]
    invalid = [item for item in picked if item not in ALLOWED_CHANNELS]
    if invalid:
        return None, f"不支持的渠道：{'、'.join(invalid)}。可选：{'、'.join(sorted(ALLOWED_CHANNELS))}。"
    return picked or None, None


def _notify_payload(args: dict[str, Any]) -> tuple[str, str, str, list[str] | None, str | None]:
    """收敛正文 / 标题 / 级别 / 渠道；返回 (level, message, title, channels, error)。"""
    message = _s(args.get("message")).strip()
    if not message:
        return "", "", "", None, "消息内容不能为空"
    if len(message) > MAX_MESSAGE_CHARS:
        return "", "", "", None, f"消息内容过长（最多 {MAX_MESSAGE_CHARS} 字），请精简后重试。"
    title = _s(args.get("title")).strip()[:MAX_TITLE_CHARS]
    level = "warn" if _s(args.get("level")).strip().lower() == "warn" else "info"
    channels, invalid = _notify_channels(args.get("channels"))
    if invalid:
        return "", "", "", None, invalid
    return level, message, title, channels, None


def _notify_opts(title: str, channels: list[str] | None, bypass_dnd: Any) -> dict[str, Any]:
    """按需拼装 notify 选项；免打扰绕过只认严格的布尔 True。"""
    opts: dict[str, Any] = {}
    if title:
        opts["title"] = title
    if channels:
        opts["channels"] = channels
    if bypass_dnd is True:
        opts["bypassDnd"] = True
    return opts


def _notify_response(result: Any, title: str) -> dict[str, Any]:
    """把通知域返回值收敛成工具结果；``None`` 表示被总开关 / 免打扰拦下。"""
    if result is None:
        return {
            "success": False,
            "blocked": True,
            "message": "通知被免打扰或通知总开关拦下了，配置允许后可以再发。",
        }
    delivered = result.get("deliveryChannels") if isinstance(result, dict) else None
    return {
        "success": True,
        "message": "消息已发送。",
        "title": title or None,
        "channels": delivered if isinstance(delivered, list) else [],
    }


__all__ = [
    "ALLOWED_CHANNELS",
    "MAX_MESSAGE_CHARS",
    "MAX_TITLE_CHARS",
    "NOTIFY_SOURCE",
    "HomeToolsNotifyMixin",
]
