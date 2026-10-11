"""消息通道类型与契约（对齐 ``channel-provider.interface.ts``）。

定义通道消息（ChannelMessage）、通道提供者（ChannelProvider）统一契约，
以及 Email / WebPush / 企业微信 通道的配置结构。
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

#: 通道类型枚举。当前支持 ``email`` / ``webpush`` / ``wecom``。
ChannelKind = Literal["email", "webpush", "wecom"]

#: 会话类型枚举。
ChatType = Literal["direct", "group", "email", "webpush", "wecom"]


@dataclass
class ChannelMessage:
    """通道消息统一结构。

    各通道提供者需将平台原始消息归一化为该结构后交给 ChannelsService 处理。
    """

    #: 消息来源通道类型
    channel: str
    #: 发送者显示名
    from_user: str = ""
    #: 会话 ID（Email 收件人或 WebPush endpoint），用于回发消息
    chat_id: str | int = ""
    #: 消息文本内容
    content: str = ""
    #: 会话类型：direct 私聊 / group 群聊 / email 邮件 / webpush 推送 / wecom 企微
    chat_type: str = "direct"
    #: 会话级唯一键，用于隔离对话记忆（形如 ``email:<email>``）
    session_key: str = ""
    #: 通道内的账号标识（如 Email 发件人地址），用于多账号区分
    account_id: str | None = None


#: 消息处理回调：可同步或异步。
MessageHandler = Callable[[ChannelMessage], Any | Awaitable[Any]]


class ChannelProvider(Protocol):
    """通道提供者契约。

    每个具体通道（EmailService、WebPushService 等）需实现该接口，
    由 ChannelsService 统一调度：注册消息回调、回发文本。
    """

    #: 通道名称，与 ChannelKind 对应
    name: str

    def on_message(self, handler: MessageHandler) -> None:
        """注册消息处理回调。通道收到用户消息时调用 handler。"""
        ...

    async def send_text(self, to: str | int, text: str, title: str | None = None) -> None:
        """向指定会话回发文本消息。"""
        ...


@dataclass
class EmailChannelConfig:
    """Email 通道配置结构（对应 UI 配置中 ``channelConfig.email``）。"""

    enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 0
    smtp_user: str = ""
    smtp_password: str = ""
    from_address: str = ""
    #: 收件人地址列表（逗号分隔）
    to_addresses: str = ""
    tls_enabled: bool | None = None


@dataclass
class WebPushChannelConfig:
    """WebPush 通道配置结构（对应 UI 配置中 ``channelConfig.webpush``）。"""

    enabled: bool = False
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    subject: str = ""


@dataclass
class WecomChannelConfig:
    """企业微信应用通道配置（存于 ``layout.channelConfig.wecom``）。"""

    enabled: bool = False
    corp_id: str = ""
    corp_secret: str = ""
    agent_id: str | int = 0
    callback_token: str = ""
    callback_aes_key: str = ""
    #: 可选 API 代理前缀（内网访问 qyapi）
    api_proxy: str | None = None
    #: 逗号分隔 UserId 白名单，空则不限制（fail-closed：空则拒绝所有入站）
    allowed_users: str | None = None
    #: 绑定的 HomeOS 用户 ID；未配置时渠道消息仅允许查询类工具
    bound_home_os_user_id: str | None = None


@dataclass
class ChannelConfig:
    """全部通道的配置聚合。"""

    email: EmailChannelConfig | None = None
    webpush: WebPushChannelConfig | None = None
    wecom: WecomChannelConfig | None = None
    #: 原始 layout.channelConfig 对象（保留未知字段，便于未来扩展）
    raw: dict[str, Any] = field(default_factory=dict)


__all__ = [
    "ChannelConfig",
    "ChannelKind",
    "ChannelMessage",
    "ChannelProvider",
    "ChatType",
    "EmailChannelConfig",
    "MessageHandler",
    "WebPushChannelConfig",
    "WecomChannelConfig",
]
