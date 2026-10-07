"""企业微信应用消息通道（对齐 ``wecom/wecom.service.ts``）。

入站回调 → 白名单鉴权 → Agent；出站应用消息回发（access_token 缓存 + 并发去重刷新）。
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any
from urllib.parse import quote, urlparse

import httpx

from ...core.errors import BusinessException, ErrorCode, api_error
from .types import ChannelMessage, MessageHandler
from .wecom_utils import markdown_to_wecom_text, split_wecom_text

logger = logging.getLogger("homeos.channels.wecom")

#: 企微 access_token 提前刷新余量（毫秒），对齐 TS 实现的 60s
TOKEN_REFRESH_MARGIN_MS = 60_000
#: 分片发送间隔（秒），规避企微频控
CHUNK_SLEEP_SECONDS = 0.3
#: 出站默认 API 域名
QYAPI_BASE = "https://qyapi.weixin.qq.com"


class WecomService:
    """企业微信应用消息通道服务。"""

    name = "wecom"

    def __init__(self, channel_config: Any, event_bus: Any = None) -> None:
        self._channel_config = channel_config
        self._event_bus = event_bus
        self._corp_id: str | None = None
        self._corp_secret: str | None = None
        self._agent_id = 0
        self._callback_token: str | None = None
        self._aes_key: str | None = None
        self._api_proxy: str | None = None
        #: 出站/白名单 UserId（保留原始大小写，供 message/send）
        self._allowed_users: list[str] = []
        #: 入站鉴权用小写集合
        self._allowed_users_lower: set[str] = set()
        self._access_token: str | None = None
        self._token_expires_at = 0.0
        self._token_lock = asyncio.Lock()
        self._message_handler: MessageHandler | None = None
        self._http = httpx.AsyncClient(timeout=15.0)

    # ------------------------------------------------------------------ #
    # 事件绑定
    # ------------------------------------------------------------------ #
    def bind_events(self) -> None:
        """订阅配置更新事件，热重载企业微信通道。"""
        if self._event_bus is None:
            return

        async def on_system_config_updated(_payload: Any = None) -> None:
            logger.info("检测到配置更新,正在热重载企业微信通道...")
            self._channel_config.invalidate_cache()
            await self.reload()

        self._event_bus.on("SYSTEM_CONFIG_UPDATED", on_system_config_updated)

    async def start(self) -> None:
        """模块初始化：执行首次配置加载。"""
        await self.reload()

    # ------------------------------------------------------------------ #
    # 配置
    # ------------------------------------------------------------------ #
    async def reload(self) -> None:
        """重新加载企微通道配置；不完整或未启用时清空运行时状态并停用通道。"""
        cfg = await self._channel_config.get_wecom_config()
        if not cfg or not cfg.enabled or not cfg.corp_id or not cfg.corp_secret:
            logger.warning("企业微信未启用或配置不完整,通道停用")
            self._corp_id = None
            self._corp_secret = None
            self._agent_id = 0
            self._callback_token = None
            self._aes_key = None
            self._api_proxy = None
            self._allowed_users = []
            self._allowed_users_lower = set()
            self._access_token = None
            self._token_expires_at = 0.0
            return
        self._corp_id = cfg.corp_id
        self._corp_secret = cfg.corp_secret
        try:
            self._agent_id = int(cfg.agent_id or 0)
        except (TypeError, ValueError):
            self._agent_id = 0
        self._callback_token = cfg.callback_token
        self._aes_key = cfg.callback_aes_key
        self._api_proxy = cfg.api_proxy
        self._allowed_users = (
            [item.strip() for item in cfg.allowed_users.split(",") if item.strip()]
            if cfg.allowed_users
            else []
        )
        self._allowed_users_lower = {item.lower() for item in self._allowed_users}
        self._access_token = None
        self._token_expires_at = 0.0
        logger.info("企业微信通道已热重载")

    def get_security_config(self) -> dict[str, str | None]:
        """返回回调鉴权所需配置（token / aesKey / corpId）。"""
        return {"token": self._callback_token, "aesKey": self._aes_key, "corpId": self._corp_id}

    async def get_status(self) -> dict[str, Any]:
        """查询通道运行状态（供 ``/channels/status`` 使用）。"""
        cfg = await self._channel_config.get_wecom_config()
        enabled = bool(cfg and cfg.enabled)
        configured = bool(cfg and cfg.corp_id and cfg.corp_secret and cfg.callback_token and cfg.callback_aes_key)
        return {
            "enabled": enabled,
            "configured": configured,
            "corpId": cfg.corp_id if cfg else None,
            "agentId": int(cfg.agent_id or 0) if cfg else 0,
        }

    # ------------------------------------------------------------------ #
    # ChannelProvider
    # ------------------------------------------------------------------ #
    def on_message(self, handler: MessageHandler) -> None:
        """注册消息处理回调，将入站消息接入 Agent 流水线。"""
        self._message_handler = handler

    async def send_text(self, to: str | int, text: str, title: str | None = None) -> None:
        """向指定用户发送文本：Markdown 转纯文本 → 长文本分片 → 逐片发送。"""
        plain_text = markdown_to_wecom_text(text)
        chunks = split_wecom_text(plain_text)
        for index, chunk in enumerate(chunks):
            try:
                await self.send_wecom_text_single(str(to), chunk)
                if index < len(chunks) - 1:
                    await asyncio.sleep(CHUNK_SLEEP_SECONDS)
            except Exception as exc:  # noqa: BLE001 - 单片失败不影响其余片
                logger.error("企微消息分片发送失败 %s/%s: %s", index + 1, len(chunks), exc)

    async def send_alert_broadcast(self, text: str, title: str | None = None) -> None:
        """告警/系统通知广播：优先 UserId 白名单，否则 @all。"""
        if not self._corp_id or not self._corp_secret or not self._agent_id:
            logger.warning("企微出站未就绪(缺少 CorpId/Secret/AgentId),跳过告警推送")
            return
        # 标题以 Markdown `#` 前置，经 markdownToWecomText 转为 `◆ 标题` 醒目行
        heading = str(title or "").strip()
        body = f"# {heading}\n\n{text}" if heading else text
        targets = self._allowed_users or ["@all"]
        for to in targets:
            try:
                await self.send_text(to, body)
            except Exception as exc:  # noqa: BLE001
                logger.error("企微告警推送失败 (%s): %s", to, exc)

    # ------------------------------------------------------------------ #
    # 入站消息
    # ------------------------------------------------------------------ #
    async def handle_incoming_message(self, from_user: str, content: str) -> None:
        """处理企微入站消息：白名单鉴权（fail-closed）→ 构造消息 → 调用回调。"""
        if not self._allowed_users_lower:
            logger.warning("企微白名单为空，拒绝入站消息: %s", from_user)
            await self.send_text(from_user, "未配置控制授权白名单，请联系管理员在企微通道配置允许的用户。")
            return
        if from_user.lower() not in self._allowed_users_lower:
            logger.warning("未授权企微用户: %s", from_user)
            await self.send_text(from_user, "您未获得控制授权，请联系管理员配置白名单。")
            return
        if self._message_handler is None:
            return
        channel_msg = ChannelMessage(
            channel="wecom",
            account_id=self._corp_id,
            from_user=from_user,
            chat_id=from_user,
            content=content,
            chat_type="direct",
            session_key=f"wecom:{from_user}",
        )
        try:
            result = self._message_handler(channel_msg)
            if asyncio.iscoroutine(result):
                await result
        except Exception as exc:  # noqa: BLE001
            logger.error("企微消息处理失败: %s", exc)
            await self.send_text(from_user, "系统内部处理消息出错")

    # ------------------------------------------------------------------ #
    # 出站 API
    # ------------------------------------------------------------------ #
    async def get_access_token(self) -> str:
        """获取企微 access_token：带过期缓存 + 并发去重刷新。"""
        now_ms = time.time() * 1000
        if self._access_token and self._token_expires_at > now_ms + TOKEN_REFRESH_MARGIN_MS:
            return self._access_token

        corp_id = self._corp_id
        corp_secret = self._corp_secret
        if not corp_id or not corp_secret:
            raise BusinessException(ErrorCode.CONFIG_ERROR, api_error("WECOM_CREDENTIALS_MISSING"))

        async with self._token_lock:
            # 双重检查：并发等待期间可能已被其他协程刷新
            now_ms = time.time() * 1000
            if self._access_token and self._token_expires_at > now_ms + TOKEN_REFRESH_MARGIN_MS:
                return self._access_token
            url = (
                f"{QYAPI_BASE}/cgi-bin/gettoken"
                f"?corpid={quote(corp_id, safe='')}&corpsecret={quote(corp_secret, safe='')}"
            )
            response = await self.fetch_api(url)
            data = response.json() if response.content else {}
            if not isinstance(data, dict) or not data.get("access_token"):
                raise BusinessException(
                    ErrorCode.EXTERNAL_ERROR,
                    api_error("WECOM_GET_TOKEN_FAILED", f"{data!r}".replace("'", '"')),
                )
            self._access_token = str(data["access_token"])
            expires_in = data.get("expires_in") or 7200
            try:
                expires_seconds = int(expires_in)
            except (TypeError, ValueError):
                expires_seconds = 7200
            self._token_expires_at = time.time() * 1000 + expires_seconds * 1000
            return self._access_token

    async def send_wecom_text_single(self, to_user: str, text: str) -> None:
        """向指定用户发送单条文本消息（不分片，由 send_text 上层负责分片）。"""
        token = await self.get_access_token()
        url = f"{QYAPI_BASE}/cgi-bin/message/send?access_token={quote(token, safe='')}"
        body = {
            "touser": to_user,
            "msgtype": "text",
            "agentid": self._agent_id,
            "text": {"content": text},
            "safe": 0,
        }
        response = await self.fetch_api(
            url, method="POST", json_body=body, headers={"Content-Type": "application/json"}
        )
        data = response.json() if response.content else {}
        if not isinstance(data, dict) or data.get("errcode") != 0:
            raise BusinessException(
                ErrorCode.EXTERNAL_ERROR,
                api_error("WECOM_SEND_FAILED", f"{data!r}".replace("'", '"')),
            )

    async def fetch_api(
        self,
        url: str,
        method: str = "GET",
        json_body: Any = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        """调用企微 API 的统一出口，支持可选 apiProxy 代理前缀。"""
        target_url = url
        if self._api_proxy:
            try:
                original = urlparse(url)
                proxy = self._api_proxy.rstrip("/")
                target_url = f"{proxy}{original.path}"
                if original.query:
                    target_url = f"{target_url}?{original.query}"
            except Exception as exc:  # noqa: BLE001
                logger.error("无效的 API URL:%s,%s", url, exc)
        return await self._http.request(
            method, target_url, json=json_body, headers=headers
        )

    async def close(self) -> None:
        await self._http.aclose()


__all__ = ["CHUNK_SLEEP_SECONDS", "QYAPI_BASE", "TOKEN_REFRESH_MARGIN_MS", "WecomService"]
