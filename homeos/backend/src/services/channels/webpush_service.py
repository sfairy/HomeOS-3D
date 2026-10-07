"""WebPush 通道：VAPID (RFC 8292) + aes128gcm (RFC 8291) 原生实现 + 订阅持久化。

对齐 ``channels/webpush/service.ts`` 的行为（含 SSRF 防护、410/404 自动清理订阅）。
加密使用项目既有依赖 ``cryptography``，无需额外运行时依赖。
"""

from __future__ import annotations

import asyncio
import base64
import ipaddress
import json
import logging
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy import delete, select

from ...core.errors import api_error, bad_request
from ...core.models import WebPushSubscription

from .types import MessageHandler

logger = logging.getLogger("homeos.channels.webpush")

#: 单条推送 payload 的记录大小（RFC 8188 推荐 4096）
RECORD_SIZE = 4096
#: 推送有效期（秒）
DEFAULT_TTL = 2419200
#: 发送超时（秒）
SEND_TIMEOUT = 15.0

#: 私网/回环/链路本地/保留 host 名后缀（mDNS / Docker internal / 本地解析等）
BLOCKED_WEBPUSH_HOST_SUFFIXES = (
    ".local",
    ".internal",
    ".localhost",
    ".lan",
    ".home.arpa",
    ".test",
    ".invalid",
)


def _b64url_decode(value: str) -> bytes:
    """base64url（可缺省 padding）解码。"""
    text = str(value or "").strip()
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def _b64url_encode(raw: bytes) -> str:
    """base64url 编码（去 padding）。"""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def is_private_ipv4(ip: str) -> bool:
    """判断 IPv4 字面量是否属私网/回环/链路本地/保留段。"""
    try:
        parts = [int(part) for part in ip.split(".")]
    except ValueError:
        return True
    if len(parts) != 4 or any(part < 0 or part > 255 for part in parts):
        return True
    a, b, c = parts[0], parts[1], parts[2]
    if a in (10, 127, 0):
        return True
    if a == 169 and b == 254:
        return True
    if a == 172 and 16 <= b <= 31:
        return True
    if a == 192 and b == 168:
        return True
    if a == 100 and 64 <= b <= 127:
        return True
    if a == 192 and b in (0, 2):
        return True
    if a == 198 and b in (18, 19):
        return True
    if a == 198 and b == 51 and c == 100:
        return True
    if a == 203 and b == 0 and c == 113:
        return True
    return a >= 224


def is_blocked_webpush_host(hostname: str) -> bool:
    """判断 hostname 是否指向私网/回环/链路本地（防 SSRF）。"""
    # URL.hostname 对 IPv6 返回带方括号的 "[::1]"，需剥离后才能识别并拦截回环地址
    host = str(hostname or "").lower().strip("[]")
    if not host:
        return True
    if host in ("localhost", "ip6-localhost", "ip6-loopback"):
        return True
    if any(host.endswith(suffix) for suffix in BLOCKED_WEBPUSH_HOST_SUFFIXES):
        return True
    try:
        parsed = ipaddress.ip_address(host)
    except ValueError:
        return False
    if isinstance(parsed, ipaddress.IPv4Address):
        return is_private_ipv4(host)
    # IPv6
    if parsed.is_loopback or parsed.is_unspecified:
        return True
    mapped = getattr(parsed, "ipv4_mapped", None)
    if mapped is not None:
        return is_private_ipv4(str(mapped))
    if parsed.is_private or parsed.is_link_local:
        return True
    return False


def is_safe_webpush_endpoint(endpoint: str) -> bool:
    """校验 WebPush 订阅 endpoint（须 https 公网推送服务，防 SSRF）。"""
    try:
        parsed = urlparse(str(endpoint or ""))
    except ValueError:
        return False
    if parsed.scheme != "https":
        return False
    return not is_blocked_webpush_host(parsed.hostname or "")


def _hkdf(salt: bytes, ikm: bytes, info: bytes, length: int) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(ikm)


def encrypt_webpush_payload(
    payload: bytes,
    p256dh: str,
    auth_secret_b64: str,
) -> tuple[bytes, str]:
    """按 RFC 8291（aes128gcm）加密推送 body。

    @returns ``(密文, ephemeral_public_key_b64url)``；密文已含 RFC 8188 头部。
    """
    ua_public_raw = _b64url_decode(p256dh)
    auth_secret = _b64url_decode(auth_secret_b64)
    ua_public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public_raw)

    server_key = ec.generate_private_key(ec.SECP256R1())
    server_public_raw = server_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    shared_secret = server_key.exchange(ec.ECDH(), ua_public)

    # IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
    key_info = b"WebPush: info\x00" + ua_public_raw + server_public_raw
    ikm = _hkdf(auth_secret, shared_secret, key_info, 32)

    salt = secrets.token_bytes(16)
    content_encryption_key = _hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)

    # 单记录：正文 + 0x02 填充分隔符（最后一条记录）
    plaintext = payload + b"\x02"
    ciphertext = AESGCM(content_encryption_key).encrypt(nonce, plaintext, None)

    header = salt + RECORD_SIZE.to_bytes(4, "big") + bytes([len(server_public_raw)]) + server_public_raw
    return header + ciphertext, _b64url_encode(server_public_raw)


def build_vapid_authorization(
    endpoint: str,
    vapid_public_key: str,
    vapid_private_key: str,
    subject: str,
    expires_seconds: int = 12 * 3600,
) -> str:
    """构造 ``Authorization: vapid t=<jwt>,k=<publicKey>``（RFC 8292 ES256）。"""
    parsed = urlparse(endpoint)
    audience = f"{parsed.scheme}://{parsed.netloc}"

    def _segment(raw: bytes) -> str:
        return _b64url_encode(raw)

    header = _segment(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    now = int(time.time())
    claims = _segment(
        json.dumps(
            {
                "aud": audience,
                "exp": now + expires_seconds,
                "sub": subject,
            },
            separators=(",", ":"),
        ).encode()
    )
    signing_input = f"{header}.{claims}".encode()

    private_value = int.from_bytes(_b64url_decode(vapid_private_key), "big")
    private_key = ec.derive_private_key(private_value, ec.SECP256R1())
    der_signature = private_key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r, s = _decode_der_signature(der_signature)
    jwt = f"{header}.{claims}.{_segment(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"
    return f"vapid t={jwt},k={vapid_public_key}"


def _decode_der_signature(der: bytes) -> tuple[int, int]:
    """从 DER (r, s) 解出两个 32 字节整数（JWT 需要 raw r||s）。"""
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

    return decode_dss_signature(der)


@dataclass
class PushSubscription:
    """WebPush 订阅条目。"""

    endpoint: str
    p256dh: str
    auth: str
    user_agent: str | None = None
    label: str | None = None
    id: str | None = None
    created_at: datetime | None = None

    def to_public(self) -> dict[str, Any]:
        """订阅列表对外结构（对齐 Nest ``listSubscriptions`` 字段名）。"""
        return {
            "id": self.id,
            "endpoint": self.endpoint,
            "label": self.label,
            "userAgent": self.user_agent,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class WebPushService:
    """WebPush 通道服务：VAPID 推送 + 订阅持久化 + 热重载。"""

    name = "webpush"

    def __init__(self, channel_config: Any, session_factory: Any, event_bus: Any = None) -> None:
        self._channel_config = channel_config
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._enabled = False
        self._vapid: dict[str, str] = {}
        self._subscriptions: dict[str, PushSubscription] = {}
        self._message_handler: MessageHandler | None = None
        self._http = httpx.AsyncClient(timeout=SEND_TIMEOUT)

    # ------------------------------------------------------------------ #
    # 事件绑定
    # ------------------------------------------------------------------ #
    def bind_events(self) -> None:
        """订阅配置更新事件，热重载 VAPID 配置。"""
        if self._event_bus is None:
            return

        async def on_system_config_updated(_payload: Any = None) -> None:
            self._channel_config.invalidate_cache()
            await self.reload()

        self._event_bus.on("SYSTEM_CONFIG_UPDATED", on_system_config_updated)

    async def start(self) -> None:
        """模块初始化：加载配置并从 DB 恢复订阅（对齐 ``onModuleInit``）。"""
        await self.reload()
        await self.load_subscriptions_from_db()

    # ------------------------------------------------------------------ #
    # 配置
    # ------------------------------------------------------------------ #
    async def reload(self) -> None:
        cfg = await self._channel_config.get_webpush_config()
        self._enabled = bool(cfg and cfg.enabled)
        if not self._enabled or not cfg or not cfg.vapid_public_key or not cfg.vapid_private_key:
            logger.warning("WebPush 通道配置不完整或已禁用")
            self._vapid = {}
            return
        self._vapid = {
            "publicKey": cfg.vapid_public_key,
            "privateKey": cfg.vapid_private_key,
            "subject": cfg.subject or "mailto:webmaster@homeos.local",
        }
        try:
            # 校验密钥可用性（等价 web-push 的 setVapidDetails 校验）
            _b64url_decode(cfg.vapid_public_key)
            _b64url_decode(cfg.vapid_private_key)
            logger.info("WebPush 通道已热重载")
        except Exception as exc:  # noqa: BLE001
            logger.error("WebPush 通道初始化失败: %s", exc)
            self._vapid = {}

    def _load_rows(self) -> list[WebPushSubscription]:
        with self._session_factory() as session:
            return list(session.scalars(select(WebPushSubscription).limit(500)))

    async def load_subscriptions_from_db(self) -> None:
        """从 DB 恢复订阅（跳过不安全 endpoint）。"""
        try:
            rows = await asyncio.to_thread(self._load_rows)
            self._subscriptions.clear()
            for row in rows:
                endpoint = str(row.endpoint or "")
                if not is_safe_webpush_endpoint(endpoint):
                    logger.warning("跳过不安全 WebPush 订阅 endpoint: %s", endpoint[:60])
                    continue
                self._subscriptions[endpoint] = PushSubscription(
                    endpoint=endpoint,
                    p256dh=str(row.p256dh),
                    auth=str(row.auth),
                    user_agent=row.user_agent,
                    label=row.label,
                    id=row.id,
                    created_at=row.created_at,
                )
            logger.info("已从数据库加载 %s 条 WebPush 订阅", len(rows))
        except Exception as exc:  # noqa: BLE001 - 表可能尚未迁移
            logger.warning("加载 WebPush 订阅失败(表可能尚未迁移): %s", exc)

    # ------------------------------------------------------------------ #
    # 状态 / 订阅管理
    # ------------------------------------------------------------------ #
    async def get_status(self) -> dict[str, Any]:
        if not self._enabled:
            return {"enabled": False, "configured": False, "subscriptionCount": 0}
        base = {"enabled": True, "subscriptionCount": len(self._subscriptions)}
        try:
            cfg = await self._channel_config.get_webpush_config()
            configured = bool(cfg and cfg.vapid_public_key and cfg.vapid_private_key)
            return {**base, "configured": configured, "vapidPublicKey": cfg.vapid_public_key if cfg else None}
        except Exception as exc:  # noqa: BLE001
            return {**base, "configured": False, "error": str(exc)}

    async def get_public_key(self) -> str | None:
        if not self._enabled:
            return None
        cfg = await self._channel_config.get_webpush_config()
        return (cfg.vapid_public_key if cfg else "") or None

    def list_subscriptions(self) -> list[dict[str, Any]]:
        return [sub.to_public() for sub in self._subscriptions.values()]

    async def register_subscription(
        self,
        endpoint: str,
        keys: dict[str, Any] | None,
        user_agent: str | None = None,
        label: str | None = None,
    ) -> None:
        """注册订阅：endpoint/keys 校验 → 内存缓存 → DB upsert。"""
        p256dh = str((keys or {}).get("p256dh") or "")
        auth = str((keys or {}).get("auth") or "")
        if not is_safe_webpush_endpoint(endpoint) or not p256dh or not auth:
            bad_request(api_error("CHANNEL_WEBPUSH_ENDPOINT_INVALID"))

        subscription = PushSubscription(
            endpoint=endpoint, p256dh=p256dh, auth=auth, user_agent=user_agent, label=label
        )
        self._subscriptions[endpoint] = subscription
        try:
            row = await asyncio.to_thread(self._upsert_row, subscription)
            if row is not None:
                subscription.id = row.id
                subscription.created_at = row.created_at
                self._subscriptions[endpoint] = subscription
        except Exception as exc:  # noqa: BLE001 - 持久化失败仍保留内存
            logger.warning("持久化 WebPush 订阅失败(仍保留内存): %s", exc)
        logger.info("已注册 WebPush 订阅: %s...", endpoint[:40])

    def _upsert_row(self, subscription: PushSubscription) -> WebPushSubscription | None:
        with self._session_factory() as session:
            existing = session.scalar(
                select(WebPushSubscription).where(WebPushSubscription.endpoint == subscription.endpoint)
            )
            if existing is None:
                existing = WebPushSubscription(
                    endpoint=subscription.endpoint,
                    p256dh=subscription.p256dh,
                    auth=subscription.auth,
                    user_agent=subscription.user_agent,
                    label=subscription.label,
                )
                session.add(existing)
            else:
                existing.p256dh = subscription.p256dh
                existing.auth = subscription.auth
                existing.user_agent = subscription.user_agent
                existing.label = subscription.label
                existing.updated_at = datetime.now(UTC)
            session.commit()
            session.refresh(existing)
            return existing

    async def unregister_subscription(self, endpoint: str) -> None:
        self._subscriptions.pop(endpoint, None)

        def _delete() -> None:
            with self._session_factory() as session:
                session.execute(delete(WebPushSubscription).where(WebPushSubscription.endpoint == endpoint))
                session.commit()

        try:
            await asyncio.to_thread(_delete)
        except Exception as exc:  # noqa: BLE001
            logger.warning("删除 WebPush 订阅失败: %s", exc)
        logger.info("已取消 WebPush 订阅: %s...", endpoint[:40])

    # ------------------------------------------------------------------ #
    # ChannelProvider
    # ------------------------------------------------------------------ #
    def on_message(self, handler: MessageHandler) -> None:
        self._message_handler = handler

    async def send_text(self, to: str | int, text: str, title: str | None = None) -> None:
        """发送文本推送；``to`` 为空表示广播给全部订阅者。"""
        if not self._enabled:
            logger.warning("WebPush 通道未启用")
            return

        targets: list[PushSubscription] = []
        if isinstance(to, str) and to.strip():
            sub = self._subscriptions.get(to.strip())
            if sub is None:
                logger.warning("未找到 endpoint: %s", to)
                return
            targets.append(sub)
        else:
            targets.extend(self._subscriptions.values())

        if not targets:
            logger.warning("无 WebPush 订阅者")
            return
        if not self._vapid:
            logger.warning("WebPush VAPID 未就绪,跳过推送")
            return

        payload = json.dumps(
            {
                # 标题由调用方定制（如「地震速报(官方已确认)」），缺省回退品牌名
                "title": str(title or "").strip() or "HomeOS",
                "body": text,
                "icon": "/logo/logo.svg",
            },
            ensure_ascii=False,
        ).encode()
        await asyncio.gather(
            *(self._send_one(sub, payload) for sub in targets), return_exceptions=True
        )

    async def _send_one(self, sub: PushSubscription, payload: bytes) -> None:
        try:
            body, _ = await asyncio.to_thread(
                encrypt_webpush_payload, payload, sub.p256dh, sub.auth
            )
            authorization = await asyncio.to_thread(
                build_vapid_authorization,
                sub.endpoint,
                self._vapid["publicKey"],
                self._vapid["privateKey"],
                self._vapid["subject"],
            )
            response = await self._http.post(
                sub.endpoint,
                content=body,
                headers={
                    "Content-Encoding": "aes128gcm",
                    "Content-Type": "application/octet-stream",
                    "TTL": str(DEFAULT_TTL),
                    "Authorization": authorization,
                },
            )
            if response.status_code in (404, 410):
                logger.info("WebPush 订阅已失效(%s),自动清理", response.status_code)
                await self.unregister_subscription(sub.endpoint)
            elif response.status_code >= 400:
                logger.error(
                    "发送 WebPush 失败: HTTP %s %s", response.status_code, response.text[:200]
                )
        except Exception as exc:  # noqa: BLE001 - 单订阅失败不影响其余
            message = str(exc)
            logger.error("发送 WebPush 失败: %s", message)
            if any(token in message for token in ("410", "404", "expired")):
                await self.unregister_subscription(sub.endpoint)

    async def send_test(self, endpoint: str | None = None) -> dict[str, int]:
        """测试推送：向全部或指定 endpoint 发送。"""
        before = len(self._subscriptions)
        await self.send_text(endpoint or "", "这是一条 HomeOS 测试推送")
        sent = (1 if endpoint in self._subscriptions else 0) if endpoint else before
        return {"sent": sent}

    async def close(self) -> None:
        await self._http.aclose()


__all__ = [
    "BLOCKED_WEBPUSH_HOST_SUFFIXES",
    "PushSubscription",
    "WebPushService",
    "build_vapid_authorization",
    "encrypt_webpush_payload",
    "is_blocked_webpush_host",
    "is_private_ipv4",
    "is_safe_webpush_endpoint",
]
