"""Email 通道适配服务（对齐 ``channels/email/service.ts``）。

通过标准 SMTP 发送邮件通知，支持 TLS / STARTTLS。
使用标准库 ``smtplib`` + ``email.message`` 在线程池中执行，避免阻塞事件循环
（对齐 nodemailer 的语义：``secure=TLS直连``、否则 STARTTLS）。
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from html import escape
from typing import Any

from .types import MessageHandler

logger = logging.getLogger("homeos.channels.email")

#: 默认发信主题
DEFAULT_SUBJECT = "HomeOS 通知"


def escape_html(text: str) -> str:
    """转义 HTML 特殊字符，防邮件正文注入（正文可能含 HA 实体 friendly_name）。"""
    return escape(str(text), quote=True).replace("&#x27;", "&#39;")


class EmailService:
    """Email 通道服务：SMTP 发信 + 配置热重载。"""

    #: 通道名称，对应 ChannelKind
    name = "email"

    def __init__(self, channel_config: Any, event_bus: Any = None) -> None:
        self._channel_config = channel_config
        self._event_bus = event_bus
        self._enabled = False
        self._from_address = ""
        self._to_addresses: list[str] = []
        #: 运行时 SMTP 配置（reload 后填充）
        self._smtp: dict[str, Any] = {}
        self._message_handler: MessageHandler | None = None

    # ------------------------------------------------------------------ #
    # 事件绑定
    # ------------------------------------------------------------------ #
    def bind_events(self) -> None:
        """订阅配置更新事件，热重载 SMTP 配置（对齐 ``onModuleInit``）。"""
        if self._event_bus is None:
            return

        async def on_system_config_updated(_payload: Any = None) -> None:
            logger.info("检测到配置更新,正在热重载 Email 通道...")
            self._channel_config.invalidate_cache()
            await self.reload()

        self._event_bus.on("SYSTEM_CONFIG_UPDATED", on_system_config_updated)

    # ------------------------------------------------------------------ #
    # 配置加载
    # ------------------------------------------------------------------ #
    async def reload(self) -> None:
        """重新加载 Email 通道配置并初始化 SMTP 传输器。"""
        cfg = await self._channel_config.get_email_config()
        self._enabled = bool(cfg and cfg.enabled)

        if not self._enabled or not cfg or not cfg.smtp_host or not cfg.smtp_user or not cfg.smtp_password:
            logger.warning("Email 通道配置不完整或已禁用")
            self._reset()
            return

        self._from_address = cfg.from_address or cfg.smtp_user
        self._to_addresses = [addr.strip() for addr in (cfg.to_addresses or "").split(",") if addr.strip()]
        if not self._to_addresses:
            logger.warning("Email 收件人列表为空")

        self._smtp = {
            "host": cfg.smtp_host,
            "port": cfg.smtp_port or 587,
            # 对齐 nodemailer ``secure: tlsEnabled ?? true``（true = 直连 TLS）
            "tls": True if cfg.tls_enabled is None else cfg.tls_enabled,
            "user": cfg.smtp_user,
            "password": cfg.smtp_password,
        }
        try:
            await asyncio.to_thread(self._verify_sync)
            logger.info("Email 通道已热重载")
        except Exception as exc:  # noqa: BLE001 - 初始化失败即停用传输器（保留发件人/收件人展示）
            logger.error("Email 通道初始化失败: %s", exc)
            self._smtp = {}

    def _reset(self) -> None:
        self._smtp = {}
        self._from_address = ""
        self._to_addresses = []

    def _connect(self) -> smtplib.SMTP:
        """建立 SMTP 连接并按 TLS 策略升级（对齐 nodemailer secure/STARTTLS 语义）。"""
        host = str(self._smtp["host"])
        port = int(self._smtp["port"])
        context = ssl.create_default_context()
        if self._smtp["tls"]:
            client: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=15, context=context)
        else:
            client = smtplib.SMTP(host, port, timeout=15)
        client.ehlo()
        if not self._smtp["tls"] and client.has_extn("starttls"):
            client.starttls(context=context)
            client.ehlo()
        client.login(str(self._smtp["user"]), str(self._smtp["password"]))
        return client

    def _verify_sync(self) -> None:
        """测试 SMTP 连接（对齐 nodemailer ``transporter.verify()``）。"""
        client = self._connect()
        try:
            client.noop()
        finally:
            client.quit()

    # ------------------------------------------------------------------ #
    # 状态
    # ------------------------------------------------------------------ #
    async def get_status(self) -> dict[str, Any]:
        """查询通道运行状态（供 ``/channels/status`` 使用）。"""
        if not self._enabled:
            return {
                "enabled": False,
                "configured": False,
                "fromAddress": "",
                "toAddressCount": 0,
            }
        base = {
            "enabled": True,
            "fromAddress": self._from_address,
            "toAddressCount": len(self._to_addresses),
        }
        if not self._smtp:
            return {**base, "configured": False}
        try:
            await asyncio.to_thread(self._verify_sync)
            return {**base, "configured": True}
        except Exception as exc:  # noqa: BLE001
            return {**base, "configured": False, "error": str(exc)}

    # ------------------------------------------------------------------ #
    # ChannelProvider
    # ------------------------------------------------------------------ #
    def on_message(self, handler: MessageHandler) -> None:
        """注册消息处理回调。Email 为单向通知通道，此方法仅保存回调。"""
        self._message_handler = handler

    async def send_text(self, to: str | int, text: str, subject: str | None = None) -> None:
        """发送邮件通知；``to`` 为空时使用配置中的收件人列表。"""
        if not self._enabled or not self._smtp:
            logger.warning("Email 通道未启用或未配置")
            return

        recipients = [str(to).strip()] if isinstance(to, str) and str(to).strip() else list(self._to_addresses)
        if not recipients:
            logger.warning("无收件人地址")
            return

        message = EmailMessage()
        message["From"] = self._from_address
        message["To"] = ", ".join(recipients)
        # 标题可由调用方定制（告警规则自定义标题）；缺省回退系统默认主题
        message["Subject"] = str(subject or "").strip() or DEFAULT_SUBJECT
        message.set_content(text)
        # 转义 HTML：text 可来自 HA 实体 friendly_name，防止注入 <script> 等标签
        message.add_alternative(f"<pre>{escape_html(text)}</pre>", subtype="html")

        try:
            await asyncio.to_thread(self._send_sync, message, recipients)
            logger.info("已向 %s 个收件人发送邮件通知", len(recipients))
        except Exception as exc:  # noqa: BLE001 - 发送失败只记录，不影响主流程
            logger.error("发送邮件失败: %s", exc)

    def _send_sync(self, message: EmailMessage, recipients: list[str]) -> None:
        client = self._connect()
        try:
            client.send_message(message, from_addr=self._from_address, to_addrs=recipients)
        finally:
            client.quit()


__all__ = ["DEFAULT_SUBJECT", "EmailService", "escape_html"]
