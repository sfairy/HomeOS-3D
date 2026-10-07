"""消息通道分发服务（对齐 ``channels/service.ts``）。

统一调度各通道提供者（EmailService、WebPushService、WecomService），
把用户消息转发给 AgentService，并把 Agent 回复格式化后回发。
"""

from __future__ import annotations

import logging
import re
from collections import OrderedDict
from typing import Any

from ...core.json_field import read_json_object
from .mock_guide import MOCK_AGENT_CONFIG_GUIDE
from .reply import format_channel_reply
from .types import ChannelMessage

logger = logging.getLogger("homeos.channels.service")

#: 群聊 @提及 后缀（如 ``/clear@bot`` → ``/clear``）
_MENTION_SUFFIX_RE = re.compile(r"@[\w_]+$", re.IGNORECASE)

#: 单个会话保留的最大历史轮次（user + assistant 各计 1 条）
MAX_HISTORY = 16
#: 同时在内存中维护的最大会话数；超出时淘汰最旧会话
MAX_SESSIONS = 200


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

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    def start(self) -> None:
        """模块初始化：注册各通道消息回调（Email/WebPush 为出站，企微为入站）。"""
        self._providers[getattr(self._email, "name", "email")] = self._email
        self._providers[getattr(self._webpush, "name", "webpush")] = self._webpush
        self._providers[getattr(self._wecom, "name", "wecom")] = self._wecom
        self._wecom.on_message(lambda msg: self.handle_channel_message(msg, self._wecom))
        logger.info("消息通道分发服务已初始化(含企业微信)")

    # ------------------------------------------------------------------ #
    # 渠道身份解析
    # ------------------------------------------------------------------ #
    async def resolve_channel_actor(self, channel: str) -> Any:
        """解析渠道绑定的 HomeOS 用户作为 Agent 执行身份。

        未绑定则返回 None → 控制类工具被 ACL 拒绝（只读）。
        """
        if channel != "wecom":
            return None
        from ..agent.agent_actor import AgentActor

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
        actor = AgentActor(
            user_id=user.id,
            username=user.username,
            role=user.role,
        )
        if user.role != "admin" and restrictions:
            actor.restrictions = [str(item) for item in restrictions]
        return actor

    async def _find_user(self, user_id: str) -> Any:
        from ...core.models import User

        def _query() -> Any:
            from sqlalchemy import select

            with self._session_factory() as session:
                return session.scalar(select(User).where(User.id == user_id))

        import asyncio

        return await asyncio.to_thread(_query)

    # ------------------------------------------------------------------ #
    # 状态 / 外部告警
    # ------------------------------------------------------------------ #
    async def get_status(self) -> dict[str, Any]:
        """获取所有通道的运行状态（供 ``/channels/status`` 使用）。"""
        email, webpush, wecom = (
            await self._email.get_status(),
            await self._webpush.get_status(),
            await self._wecom.get_status(),
        )
        return {"email": email, "webpush": webpush, "wecom": wecom}

    async def send_external_alert(
        self, channels: list[str], message: str, title: str | None = None
    ) -> None:
        """告警/系统通知的外部通道投递（Email / WebPush / 企业微信）。

        主动推送正文统一前置 ``[YYYY-MM-DD HH:mm:ss]`` 时间戳（Asia/Shanghai）。
        """
        if not isinstance(channels, list) or not channels or not str(message or "").strip():
            return

        from ..push_time import with_push_timestamp

        status = await self.get_status()
        text = with_push_timestamp(message)

        if "email" in channels and status["email"].get("enabled") and status["email"].get("configured"):
            try:
                await self._email.send_text("", text, title)
            except Exception as exc:  # noqa: BLE001
                logger.error("Email 告警投递失败: %s", exc)

        if "webpush" in channels and status["webpush"].get("enabled") and status["webpush"].get("configured"):
            try:
                await self._webpush.send_text("", text, title)
            except Exception as exc:  # noqa: BLE001
                logger.error("WebPush 告警投递失败: %s", exc)

        if "wecom" in channels and status["wecom"].get("enabled"):
            try:
                await self._wecom.send_alert_broadcast(text, title)
            except Exception as exc:  # noqa: BLE001
                logger.error("企业微信告警投递失败: %s", exc)

    # ------------------------------------------------------------------ #
    # 会话历史
    # ------------------------------------------------------------------ #
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

    # ------------------------------------------------------------------ #
    # 入站消息处理
    # ------------------------------------------------------------------ #
    async def handle_channel_message(self, msg: ChannelMessage, provider: Any) -> None:
        """处理来自通道的用户消息：解析命令 → 调用 Agent → 格式化回复 → 回发。"""
        logger.info('收到来自 %s [%s] 的消息: "%s"', msg.channel, msg.from_user, msg.content)

        trimmed = msg.content.strip()
        first_token = trimmed.split()[0] if trimmed.split() else ""
        command = _MENTION_SUFFIX_RE.sub("", first_token).lower()
        if command == "/clear" or trimmed == "清除记忆":
            self.clear_session(msg.session_key)
            try:
                await self._agent.chat("清除记忆")
            except Exception:  # noqa: BLE001 - Agent 内部重置错误可忽略，本地历史已清除
                pass
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
        except Exception as exc:  # noqa: BLE001
            logger.error("执行 %s 智能对话失败: %s", msg.channel, exc)
            await provider.send_text(msg.chat_id, "出了点问题，请重试。")

    @staticmethod
    def _outcome(result: Any) -> str:
        return result.get("outcome", "") if isinstance(result, dict) else getattr(result, "outcome", "")

    @staticmethod
    def _build_options(actor: Any) -> Any:
        from ..agent.service import AgentChatOptions

        return AgentChatOptions(actor=actor)


__all__ = ["MAX_HISTORY", "MAX_SESSIONS", "ChannelsService"]
