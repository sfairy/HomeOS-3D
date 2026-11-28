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

#: 「发到手机」允许的渠道：站内（留一条可查的记录）+ 实时 + 手机推送。
#: 邮件 / 企微是**群发**通道：用户说「发到我手机上」时把消息抄送全屋邮箱显然不对。
PERSONAL_CHANNELS = frozenset({"in_app", "socket", "webpush"})
DEFAULT_PERSONAL_CHANNELS = ("in_app", "webpush")

#: 正文上限：与参考实现一致（1500 字）。超长**截断**而不是拒绝 ——
#: 拒绝会逼模型把同一句话改短再发一遍（多一次推理，且常常改丢关键信息）。
#: 通知中心的渠道正文上限也是 1500（``notification.dispatch.MAX_TEXT_CHARS``），两处同源。
MAX_MESSAGE_CHARS = 1500
#: 标题上限（通知中心列表单行展示）。
MAX_TITLE_CHARS = 120
#: 截断标记：与通知域 ``dispatch._TRUNCATED_SUFFIX`` 同一句话。
TRUNCATED_SUFFIX = "…(内容过长，已截断)"

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
    #: 音箱授权服务（装配层 ``bind_voice_devices`` 注入）：只用于「发到手机」收件人解析
    _voice_devices: Any = None

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

        recipients, invalid_target = await self._resolve_notify_targets(args, actor)
        if invalid_target is not None:
            return invalid_target

        # 「发到手机」必须先确认真的有一台设备可收：否则回「已提交」而实际什么都没送达，
        # 用户会在手机上空等（参考实现在这里也是明确失败）。
        if recipients:
            device_error = self._push_device_error(notification, recipients)
            if device_error is not None:
                return device_error
            # 个人推送不走外部群发通道（邮件 / 企微）：用户说的是「发到我手机上」。
            # 模型显式给的渠道仍被尊重，只把群发类剔掉。
            channels = [item for item in (channels or DEFAULT_PERSONAL_CHANNELS) if item in PERSONAL_CHANNELS]

        opts = _notify_opts(title, channels, args.get("bypass_dnd"))
        if recipients:
            opts["targetUserIds"] = recipients
        try:
            result = await notification.notify(level, message, NOTIFY_SOURCE, None, opts)
        except Exception as exc:  # pragma: no cover - 通知服务自身防御
            logger.warning("管家发消息失败: %s", exc)
            return {"success": False, "error": f"消息发送失败：{exc}"}

        self._notify_limiter.record(owner)
        return _notify_response(result, title)

    async def _resolve_notify_targets(
        self, args: dict[str, Any], actor: Any
    ) -> tuple[list[str] | None, dict[str, Any] | None]:
        """解析「发到手机」的收件人。

        返回 ``(userIds, error)``：``error`` 非空时直接作为工具结果返回（明确告知原因，
        而不是静默降级成广播）。

        语义（与参考一致）：

        - ``target_scope=all``：全屋广播，管理员才能用；不返回 userIds（走全局设备）。
        - ``target_scope=self`` + 点名：按显示名 / 用户名精确匹配，再退到包含匹配；
          0 命中或多命中都要报错，让用户自己说清楚。
        - ``target_scope=self`` + 未点名：语音来源取该音箱的默认接收人；否则是发言人本人。
        """
        scope = str(args.get("target_scope") or "self").strip().lower()
        if scope == "all":
            if str(getattr(actor, "role", "") or "ADMIN").upper() != "ADMIN":
                return None, {"success": False, "blocked": True, "message": "权限不足：仅管理员可向全屋广播。"}
            return None, None
        voice_devices = getattr(self, "_voice_devices", None)
        if voice_devices is None:
            return None, None
        recipient = _s(args.get("target_recipient")).strip()
        if recipient:
            matched, error = voice_devices.find_member_by_name(recipient)
            if error is not None or matched is None:
                return None, {"success": False, "message": error or "未找到指定成员。"}
            return [str(matched["id"])], None
        grant_id = str(getattr(actor, "voice_grant_id", "") or "")
        if grant_id:
            resolved = voice_devices.resolve_notify_recipients(grant_id, getattr(actor, "user_id", None))
            if not resolved.get("userIds"):
                return None, {
                    "success": False,
                    "message": "当前音箱尚未配置默认推送接收人，请管理员在「设置 → 语音」为该音箱勾选，或在语音中直接说明发送给哪位成员。",
                }
            return list(resolved["userIds"]), None
        return None, None

    def _notify_allowed(self, owner: str) -> str | None:
        """频控闸门：懒建限流器（精简装配可能跳过 __init__）。"""
        limiter = self._notify_limiter
        if limiter is None:
            limiter = _NotifyRateLimiter()
            self._notify_limiter = limiter
        return limiter.check(owner)

    @staticmethod
    def _push_device_error(notification: Any, user_ids: list[str]) -> dict[str, Any] | None:
        """目标账号没有任何推送设备时给出明确失败；无法判断时放行（``-1``）。"""
        counter = getattr(notification, "push_device_count", None)
        if not callable(counter):
            return None
        try:
            raw_count = counter(user_ids)
        except Exception as exc:  # pragma: no cover - 通道自身防御
            logger.debug("读取推送设备数失败，跳过检查: %s", exc)
            return None
        # ``counter`` 取自 getattr，静态类型只看到 ``object`` 返回；按契约只认整数，
        # 其它类型一律当成「无法判断」放行，不把消息拦掉。
        if not isinstance(raw_count, int):
            return None
        count = raw_count
        if count < 0 or count > 0:
            return None
        return {
            "success": False,
            "message": "目标账号还没有绑定推送设备：请在手机浏览器打开 HomeOS 并在「通知」里允许推送后再试。",
        }


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
    # 超长截断而**不**报错：模型收到「太长」只会把同一段话压缩后再发一次，
    # 既多一轮推理又常把关键信息压没。参考实现同样截断并回 `truncated` 标记。
    if len(message) > MAX_MESSAGE_CHARS:
        message = message[: MAX_MESSAGE_CHARS - len(TRUNCATED_SUFFIX)] + TRUNCATED_SUFFIX
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
    "DEFAULT_PERSONAL_CHANNELS",
    "MAX_MESSAGE_CHARS",
    "MAX_TITLE_CHARS",
    "NOTIFY_SOURCE",
    "PERSONAL_CHANNELS",
    "TRUNCATED_SUFFIX",
    "HomeToolsNotifyMixin",
]
