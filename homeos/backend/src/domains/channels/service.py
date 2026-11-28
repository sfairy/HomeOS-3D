"""消息通道分发服务（对齐 ``channels/service.ts``）。

统一调度各通道提供者（EmailService、WebPushService、WecomService），
把用户消息转发给 AgentService，并把 Agent 回复格式化后回发。
"""

from __future__ import annotations

import logging
import re
from collections import OrderedDict
from typing import Any

from .mock_guide import MOCK_AGENT_CONFIG_GUIDE
from .reply import format_channel_reply
from .types import ChannelMessage
from ...platform.core.db.json_field import read_json_object

logger = logging.getLogger("homeos.channels.service")


def _webpush_outcome_state(outcome: Any) -> str:
    """把 ``WebPushService.send_text`` 的返回归一成 ok / failed / skipped。"""
    if isinstance(outcome, dict):
        if int(outcome.get("attempted") or 0) <= 0:
            return "skipped"
        return "ok" if int(outcome.get("delivered") or 0) > 0 else "failed"
    # 无返回值按「未抛异常即成功」处理，但不能据此认为已投递
    # （调用方只在至少一个通道为 ok 且无 failed 时才记投递成功）。
    return "ok" if outcome is None or outcome else "failed"


#: 群聊 @提及 后缀（如 ``/clear@bot`` → ``/clear``）
_MENTION_SUFFIX_RE = re.compile(r"@[\w_]+$", re.IGNORECASE)

#: 单个会话保留的最大历史轮次（user + assistant 各计 1 条）
MAX_HISTORY = 16
#: 同时在内存中维护的最大会话数；超出时淘汰最旧会话
MAX_SESSIONS = 200
#: 入站消息限流：单渠道用户每分钟最多 N 条（与 HTTP 对话的 20 次/分同量级）
INBOUND_RATE_LIMIT = 12
INBOUND_RATE_WINDOW_SECONDS = 60.0
#: 入站限流用的共享状态命名空间
INBOUND_RATE_NAMESPACE = "agent.channel.inbound"


class ChannelsService:
    """消息通道分发服务：注册回调 + Agent 转发 + 外部告警投递。"""

    def __init__(
        self,
        email_service: Any,
        web_push_service: Any,
        wecom_service: Any,
        agent_service: Any,
        channel_config: Any,
        session_factory: Any,
    ) -> None:
        self._email = email_service
        self._webpush = web_push_service
        self._wecom = wecom_service
        self._agent = agent_service
        self._channel_config = channel_config
        self._session_factory = session_factory
        #: 会话历史表：session_key → 历史条目数组（保持插入顺序，便于淘汰最旧）
        self._sessions: OrderedDict[str, list[dict[str, str]]] = OrderedDict()
        #: 通道提供者注册表：名称 → 提供者实例
        self._providers: dict[str, Any] = {}
        #: 入站限流用的共享状态（未注入时退化为进程内）
        self._state_store: Any = None

    def bind_state_store(self, store: Any = None) -> None:
        """注入共享状态库：多 worker 时入站限流也按同一份计数。"""
        self._state_store = store

    # 生命周期
    async def stop(self) -> None:
        """停机关闭各通道的 HTTP 客户端（WebPush / 企微），避免连接池泄漏。"""
        for provider in (self._webpush, self._wecom):
            close = getattr(provider, "close", None)
            if close is None:
                continue
            try:
                await close()
            except Exception as exc:
                logger.warning("关闭消息通道失败: %s", exc)

    def start(self) -> None:
        """模块初始化：注册各通道消息回调（Email/WebPush 为出站，企微为入站）。"""
        self._providers[getattr(self._email, "name", "email")] = self._email
        self._providers[getattr(self._webpush, "name", "webpush")] = self._webpush
        self._providers[getattr(self._wecom, "name", "wecom")] = self._wecom
        self._wecom.on_message(lambda msg: self.handle_channel_message(msg, self._wecom))
        logger.info("消息通道分发服务已就绪（Email / WebPush / 企业微信）")

    # 渠道身份解析
    async def _inbound_limited(self, msg: ChannelMessage) -> bool:
        """入站限流：同一渠道同一用户每分钟最多 :data:`INBOUND_RATE_LIMIT` 条。

        HTTP 对话链路有自己的限流，但渠道入站（企微回调）直接调用
        ``agent.chat``，绕过了那一层：不限制的话，一个白名单用户连发消息就能
        把家庭当天的 LLM 预算耗光（日预算一拦，全家当天都没法用）。
        """
        store = self._state_store
        if store is None:
            return False
        key = f"{msg.channel}:{str(msg.from_user or '').lower()}"
        try:
            return not bool(
                store.hit(
                    INBOUND_RATE_NAMESPACE,
                    key,
                    limit=INBOUND_RATE_LIMIT,
                    window_seconds=INBOUND_RATE_WINDOW_SECONDS,
                )
            )
        except Exception as exc:  # 状态库异常时不拦截：限流是防滥用，不该让通道失效
            logger.debug("通道入站限流判定失败，放行: %s", exc)
            return False

    async def resolve_channel_actor(self, channel: str) -> Any:
        """解析渠道绑定的 HomeOS 用户作为 Agent 执行身份。

        未绑定则返回 None → 控制类工具被 ACL 拒绝（只读）。
        """
        if channel != "wecom":
            return None
        from ..agent.runtime.agent_actor import AgentActor

        cfg = await self._channel_config.get_wecom_config()
        user_id = str((cfg.bound_home_os_user_id if cfg else "") or "").strip()
        if not user_id:
            return None
        user = await self._find_user(user_id)
        if user is None:
            logger.warning("企微绑定用户不存在: %s", user_id)
            return None
        prefs = read_json_object(user.preferences)
        restrictions = prefs.get("restrictions") if isinstance(prefs.get("restrictions"), list) else None
        # 实体级白名单（当前恒为空）：非空时收敛该渠道身份可控制的实体。
        return AgentActor(
            user_id=user.id,
            username=user.username,
            restrictions=[str(item) for item in restrictions] if restrictions else None,
        )

    async def _find_user(self, user_id: str) -> Any:
        from ...platform.core.db.models import User

        def _query() -> Any:
            from sqlalchemy import select

            with self._session_factory() as session:
                return session.scalar(select(User).where(User.id == user_id))

        import asyncio

        return await asyncio.to_thread(_query)

    # 状态 / 外部告警
    async def get_status(self) -> dict[str, Any]:
        """获取所有通道的运行状态（供 ``/channels/status`` 使用）。"""
        email, webpush, wecom = (
            await self._email.get_status(),
            await self._webpush.get_status(),
            await self._wecom.get_status(),
        )
        return {"email": email, "webpush": webpush, "wecom": wecom}

    def push_device_count(self, user_ids: list[str] | None = None) -> int:
        """可投递的 WebPush 设备数（按账号过滤）；通道未启用时 0。

        「发到手机」用它做前置判断：没有设备就明确失败，而不是回一句「已提交」让用户
        以为消息在路上。历史无归属订阅计入，与 ``send_text`` 的投递口径一致。
        """
        counter = getattr(self._webpush, "count_for_users", None)
        if not callable(counter):
            return 0
        try:
            raw_count = counter(user_ids)
        except Exception as exc:  # pragma: no cover - 通道自身防御
            logger.debug("读取 WebPush 设备数失败: %s", exc)
            return 0
        # ``counter`` 取自 getattr，静态类型只看到 ``object`` 返回；按契约只认整数，
        # 其它类型当作「无法判断」——这里与调用方口径一致，返回 0 表示没有可投递设备。
        return raw_count if isinstance(raw_count, int) else 0

    async def send_external_alert(
        self,
        channels: list[str],
        message: str,
        title: str | None = None,
        user_ids: list[str] | None = None,
    ) -> dict[str, str]:
        """告警/系统通知的外部通道投递（Email / WebPush / 企业微信）。

        主动推送正文统一前置 ``[YYYY-MM-DD HH:mm:ss]`` 时间戳（Asia/Shanghai）。

        返回**逐通道结果**：``"ok"``（真正送出）/ ``"failed"``（启用且尝试过但失败）/
        ``"skipped"``（未启用或未配置，根本没尝试）。调用方据此判断是否算「已投递」，
        不能吞掉异常后把「什么都没发出去」记成成功。

        ``user_ids`` 只对 WebPush 生效：非空时只推这些账号的设备（「发到手机上」）。
        邮件与企业微信没有「设备归属」概念，按通道本身广播。
        """
        if not isinstance(channels, list) or not channels or not str(message or "").strip():
            return {}

        from ..notification.push_time import with_push_timestamp

        status = await self.get_status()
        text = with_push_timestamp(message)
        results: dict[str, str] = {}
        for channel in channels:
            if channel in ("email", "webpush", "wecom"):
                results[channel] = await self._send_external_channel(channel, status, text, title, user_ids)
        return results

    async def _send_external_channel(
        self,
        channel: str,
        status: dict[str, Any],
        text: str,
        title: str | None,
        user_ids: list[str] | None = None,
    ) -> str:
        """投递单个外部通道；返回 ``ok`` / ``failed`` / ``skipped``。"""
        if channel == "email":
            return await self._send_email(status, text, title)
        if channel == "webpush":
            if not (status["webpush"].get("enabled") and status["webpush"].get("configured")):
                return "skipped"
            try:
                return _webpush_outcome_state(await self._webpush.send_text("", text, title, user_ids))
            except Exception as exc:
                logger.error("WebPush 告警投递失败: %s", exc)
                return "failed"
        if channel == "wecom":
            if not status["wecom"].get("enabled"):
                return "skipped"
            try:
                ok = await self._wecom.send_alert_broadcast(text, title)
                return "ok" if ok else "failed"
            except Exception as exc:
                logger.error("企业微信告警投递失败: %s", exc)
                return "failed"
        return "skipped"

    async def _send_email(self, status: dict[str, Any], text: str, title: str | None) -> str:
        """Email 通道（独立成方法，压掉 ``_send_external_channel`` 的分支数）。"""
        if not (status["email"].get("enabled") and status["email"].get("configured")):
            return "skipped"
        try:
            ok = await self._email.send_text("", text, title)
            return "ok" if ok else "failed"
        except Exception as exc:
            logger.error("Email 告警投递失败: %s", exc)
            return "failed"

    # 会话历史
    def clear_session(self, session_key: str) -> None:
        """清除指定会话的历史记忆。"""
        self._sessions.pop(session_key, None)

    def _get_history(self, session_key: str) -> list[dict[str, str]]:
        return list(self._sessions.get(session_key, []))

    def _push_turn(self, session_key: str, user: str, assistant: str) -> None:
        """追加一轮对话到会话历史，并执行容量控制。"""
        items = self._sessions.get(session_key, [])
        items.append({"role": "user", "content": user[:2000]})
        if assistant.strip():
            items.append({"role": "assistant", "content": assistant[:2000]})
        while len(items) > MAX_HISTORY:
            items.pop(0)
        self._sessions[session_key] = items
        self._sessions.move_to_end(session_key)
        while len(self._sessions) > MAX_SESSIONS:
            self._sessions.popitem(last=False)

    # 入站消息处理
    async def handle_channel_message(self, msg: ChannelMessage, provider: Any) -> None:
        """处理来自通道的用户消息：解析命令 → 调用 Agent → 格式化回复 → 回发。"""
        logger.info('收到来自 %s [%s] 的消息: "%s"', msg.channel, msg.from_user, msg.content)

        trimmed = msg.content.strip()
        first_token = trimmed.split()[0] if trimmed.split() else ""
        command = _MENTION_SUFFIX_RE.sub("", first_token).lower()
        if await self._inbound_limited(msg):
            logger.warning("通道入站消息被限流: %s %s", msg.channel, msg.from_user)
            await provider.send_text(msg.chat_id, "消息过于频繁，请稍后再试。")
            return
        if command == "/clear" or trimmed == "清除记忆":
            self.clear_session(msg.session_key)
            # 只清「本通道会话」+（已绑定用户时）该用户自己的记忆。
            # 旧实现无身份调用 agent.chat("清除记忆")：指令缓存按「未绑定 = 全局」清空，
            # 企微里一句 /clear 会把所有账号学会的指令映射一起删掉。
            try:
                actor = await self.resolve_channel_actor(msg.channel)
                if actor is not None:
                    options = self._build_options(actor)
                    await self._agent.chat("清除记忆", None, options)
            except Exception:  # 会话已清空即达成语义，记忆清理失败只影响回显
                logger.debug("清除通道记忆失败", exc_info=True)
            await provider.send_text(msg.chat_id, "已清除本对话记忆。")
            return

        try:
            provider_info = self._agent.get_provider_info()
            if provider_info.get("provider") == "mock" or not provider_info.get("ready"):
                await provider.send_text(msg.chat_id, MOCK_AGENT_CONFIG_GUIDE)
                return

            history = self._get_history(msg.session_key)
            actor = await self.resolve_channel_actor(msg.channel)
            if actor is None:
                logger.warning("渠道 %s 未绑定 HomeOS 用户:控制类指令将被拒绝,仅允许查询", msg.channel)

            options = self._build_options(actor)
            result = await self._agent.chat(msg.content, history, options)
            reply_text = format_channel_reply(result)
            if reply_text:
                self._push_turn(msg.session_key, msg.content, reply_text)
                await provider.send_text(msg.chat_id, reply_text)
            elif self._outcome(result) == "success":
                fallback = format_channel_reply({"outcome": "success", "reply": ""})
                self._push_turn(msg.session_key, msg.content, fallback)
                await provider.send_text(msg.chat_id, fallback)
        except Exception as exc:
            logger.error("执行 %s 智能对话失败: %s", msg.channel, exc)
            await provider.send_text(msg.chat_id, "出了点问题，请重试。")

    @staticmethod
    def _outcome(result: Any) -> str:
        return result.get("outcome", "") if isinstance(result, dict) else getattr(result, "outcome", "")

    @staticmethod
    def _build_options(actor: Any) -> Any:
        from ..agent.runtime.service import AgentChatOptions

        return AgentChatOptions(actor=actor, entry="wecom")


__all__ = [
    "INBOUND_RATE_LIMIT",
    "INBOUND_RATE_NAMESPACE",
    "MAX_HISTORY",
    "MAX_SESSIONS",
    "ChannelsService",
]
