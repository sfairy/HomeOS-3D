"""通知渠道（Email / WebPush / 企微）与 IM 渠道回复格式化。

对齐 Nest ``ChannelsModule``：通道提供者（EmailService / WebPushService / WecomService）
统一由 :class:`ChannelsService` 调度。
"""

from __future__ import annotations

from .config import ChannelConfigService
from .email_service import EmailService
from .mock_guide import MOCK_AGENT_CONFIG_GUIDE
from .reply import format_channel_reply, strip_markdown_for_channel
from .service import ChannelsService
from .types import ChannelMessage
from .webpush_service import WebPushService
from .wecom_crypto import compute_msg_signature, decrypt_wecom
from .wecom_service import WecomService
from .wecom_utils import markdown_to_wecom_text, split_wecom_text

__all__ = [
    "MOCK_AGENT_CONFIG_GUIDE",
    "ChannelConfigService",
    "ChannelMessage",
    "ChannelsService",
    "EmailService",
    "WebPushService",
    "WecomService",
    "compute_msg_signature",
    "decrypt_wecom",
    "format_channel_reply",
    "markdown_to_wecom_text",
    "split_wecom_text",
    "strip_markdown_for_channel",
]
