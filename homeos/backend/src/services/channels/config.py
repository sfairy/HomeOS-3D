"""通道配置服务（对齐 ``channel-config.service.ts``）。

读取并缓存 ``layout.channelConfig``（Email / WebPush / 企业微信），
监听 ``SYSTEM_CONFIG_UPDATED`` 事件自动失效缓存。
"""

from __future__ import annotations

import logging
import time
from typing import Any

from .types import (
    ChannelConfig,
    EmailChannelConfig,
    WebPushChannelConfig,
    WecomChannelConfig,
)

logger = logging.getLogger("homeos.channels.config")

#: layout 缓存有效期（30 秒），平衡配置实时性与读取开销
CACHE_MS = 30_000


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _bool(value: Any, default: bool = False) -> bool:
    return value if isinstance(value, bool) else default


def _str(value: Any, default: str = "") -> str:
    return str(value) if value is not None else default


def parse_email_config(raw: Any) -> EmailChannelConfig | None:
    """解析 ``channelConfig.email``（非对象 → None）。"""
    if not isinstance(raw, dict):
        return None
    tls = raw.get("tlsEnabled")
    return EmailChannelConfig(
        enabled=raw.get("enabled") is True,
        smtp_host=_str(raw.get("smtpHost")),
        smtp_port=_int(raw.get("smtpPort")),
        smtp_user=_str(raw.get("smtpUser")),
        smtp_password=_str(raw.get("smtpPassword")),
        from_address=_str(raw.get("fromAddress")),
        to_addresses=_str(raw.get("toAddresses")),
        tls_enabled=tls if isinstance(tls, bool) else None,
    )


def parse_webpush_config(raw: Any) -> WebPushChannelConfig | None:
    """解析 ``channelConfig.webpush``（非对象 → None）。"""
    if not isinstance(raw, dict):
        return None
    return WebPushChannelConfig(
        enabled=raw.get("enabled") is True,
        vapid_public_key=_str(raw.get("vapidPublicKey")),
        vapid_private_key=_str(raw.get("vapidPrivateKey")),
        subject=_str(raw.get("subject")),
    )


def parse_wecom_config(raw: Any) -> WecomChannelConfig | None:
    """解析 ``channelConfig.wecom``（非对象 → None）。"""
    if not isinstance(raw, dict):
        return None
    agent_id = raw.get("agentId")
    return WecomChannelConfig(
        enabled=raw.get("enabled") is True,
        corp_id=_str(raw.get("corpId")),
        corp_secret=_str(raw.get("corpSecret")),
        agent_id=agent_id if isinstance(agent_id, (str, int)) and not isinstance(agent_id, bool) else 0,
        callback_token=_str(raw.get("callbackToken")),
        callback_aes_key=_str(raw.get("callbackAesKey")),
        api_proxy=raw.get("apiProxy") if isinstance(raw.get("apiProxy"), str) else None,
        allowed_users=raw.get("allowedUsers") if isinstance(raw.get("allowedUsers"), str) else None,
        bound_home_os_user_id=(
            raw.get("boundHomeOsUserId") if isinstance(raw.get("boundHomeOsUserId"), str) else None
        ),
    )


class ChannelConfigService:
    """通道配置服务：带 TTL 的 layout 缓存 + 事件失效。"""

    def __init__(self, ui_config: Any, event_bus: Any = None) -> None:
        self._ui_config = ui_config
        self._event_bus = event_bus
        #: 已缓存的 layout 结构（来自 UiConfig 的解析结果）
        self._layout_cache: dict[str, Any] | None = None
        #: 当前缓存到期时间戳（ms）；0 表示无缓存
        self._cache_ttl = 0

    # ------------------------------------------------------------------ #
    # 事件绑定
    # ------------------------------------------------------------------ #
    def bind_events(self) -> None:
        """订阅系统配置更新事件（对齐 ``onModuleInit``）。"""
        if self._event_bus is None:
            return

        def on_system_config_updated(_payload: Any = None) -> None:
            logger.info("检测到配置更新,正在使通道配置缓存失效")
            self.invalidate_cache()

        self._event_bus.on("SYSTEM_CONFIG_UPDATED", on_system_config_updated)

    # ------------------------------------------------------------------ #
    # layout 读取
    # ------------------------------------------------------------------ #
    async def get_layout(self) -> dict[str, Any] | None:
        """获取通道 layout 配置（带缓存）；失败返回 None，不抛出。"""
        now = time.monotonic() * 1000
        if self._layout_cache is not None and now < self._cache_ttl:
            return self._layout_cache
        try:
            project_id = self._ui_config.resolve_active_project_id()
            cfg = self._ui_config.get_config(project_id)
            if not cfg or not cfg.get("layout"):
                return None
            layout, _ = self._ui_config.parse_layout_field(cfg.get("layout"))
            self._layout_cache = layout
            self._cache_ttl = now + CACHE_MS
            return layout
        except Exception as exc:
            logger.warning("读取通道配置失败: %s", exc)
            return None

    def invalidate_cache(self) -> None:
        """主动失效缓存（供配置更新事件或外部强制刷新调用）。"""
        self._layout_cache = None
        self._cache_ttl = 0

    # ------------------------------------------------------------------ #
    # 各通道配置
    # ------------------------------------------------------------------ #
    async def get_channel_config(self) -> ChannelConfig:
        """解析聚合通道配置（缺失分区为 None）。"""
        layout = await self.get_layout()
        raw = layout.get("channelConfig") if isinstance(layout, dict) else None
        raw = raw if isinstance(raw, dict) else {}
        return ChannelConfig(
            email=parse_email_config(raw.get("email")),
            webpush=parse_webpush_config(raw.get("webpush")),
            wecom=parse_wecom_config(raw.get("wecom")),
            raw=raw,
        )

    async def get_email_config(self) -> EmailChannelConfig | None:
        """获取 Email 通道配置；未配置时返回 None。"""
        layout = await self.get_layout()
        raw = layout.get("channelConfig") if isinstance(layout, dict) else None
        return parse_email_config((raw or {}).get("email") if isinstance(raw, dict) else None)

    async def get_webpush_config(self) -> WebPushChannelConfig | None:
        """获取 WebPush 通道配置；未配置时返回 None。"""
        layout = await self.get_layout()
        raw = layout.get("channelConfig") if isinstance(layout, dict) else None
        return parse_webpush_config((raw or {}).get("webpush") if isinstance(raw, dict) else None)

    async def get_wecom_config(self) -> WecomChannelConfig | None:
        """获取企业微信通道配置；未配置时返回 None。"""
        layout = await self.get_layout()
        raw = layout.get("channelConfig") if isinstance(layout, dict) else None
        return parse_wecom_config((raw or {}).get("wecom") if isinstance(raw, dict) else None)


__all__ = [
    "CACHE_MS",
    "ChannelConfigService",
    "parse_email_config",
    "parse_webpush_config",
    "parse_wecom_config",
]
