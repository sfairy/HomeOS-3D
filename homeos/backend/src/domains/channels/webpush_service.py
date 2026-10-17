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
import random
import secrets
import socket
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlparse

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy import delete, select

from .types import MessageHandler
from ...platform.core.errors import api_error, bad_request
from ...platform.core.models import WebPushSubscription

logger = logging.getLogger("homeos.channels.webpush")

#: 单条推送 payload 的记录大小（RFC 8188 推荐 4096）
RECORD_SIZE = 4096
#: 推送服务（FCM 等）对整包 body 的硬上限；超了会 413 且整条推送被丢弃。
MAX_PUSH_BODY_BYTES = 4096
#: 单记录头长度：salt(16) + rs(4) + keyid_len(1) + 未压缩公钥(65)。
_PUSH_HEADER_BYTES = 16 + 4 + 1 + 65
#: 可安全承载的明文字节数：body 上限扣掉记录头、AEAD tag(16) 与 0x02 分隔符(1)。
MAX_PUSH_PLAINTEXT_BYTES = MAX_PUSH_BODY_BYTES - _PUSH_HEADER_BYTES - 16 - 1
#: 推送有效期（秒）
DEFAULT_TTL = 2419200
#: 发送超时（秒）
SEND_TIMEOUT = 15.0

#: 永久性投递拒绝状态：订阅已失效，或与当前 VAPID 公钥不再匹配。收到即摘除订阅，
#: 否则每条后续通知都会一直重投这个死地址。413（负载过大）不属于此类，不应摘订阅。
PERMANENT_SUBSCRIPTION_STATUSES = frozenset({400, 401, 403, 404, 410})

#: 可重试的瞬时拒绝：限流（429）与网关 / 服务端错误。重试有意义；其它 4xx 语义错误
#: 重试多少次结果都一样，只会浪费一次投递窗口。
RETRYABLE_PUSH_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504})
#: 瞬时失败的最大尝试次数（含首次）。再多会把告警拖到失去时效性。
MAX_TRANSIENT_ATTEMPTS = 3
#: 指数退避的基准与单次上限（秒）
RETRY_BASE_DELAY_SECONDS = 1.0
RETRY_MAX_DELAY_SECONDS = 15.0
#: 一次投递内允许用于「等待重试」的总时长（秒）：超出即放弃内联重试并如实报失败。
INLINE_RETRY_BUDGET_SECONDS = 30.0
#: 服务端 ``Retry-After`` 允许的最长内联等待（秒）。推送服务动辄要求等几分钟，内联等
#: 下去会拖垮整批投递，所以超过这个值就放弃本次重试（但仍记失败，不谎报成功）。
MAX_HONORED_RETRY_AFTER_SECONDS = 30.0
#: 单条订阅的退避窗口上限（秒）。一次广播命中限流后，上层的整通道重试会很快再次尝试，
#: 若没有订阅级退避窗口就会把限流越踩越深；有窗口才能让服务端「喘过气」。
MAX_ENDPOINT_BACKOFF_SECONDS = 300.0

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


def parse_retry_after(value: str | None, *, now: float | None = None) -> float | None:
    """解析 ``Retry-After``（RFC 9110：delta-seconds 或 HTTP-date），返回待等待秒数。

    无法识别时返回 ``None``：宁可按本地指数退避处理，也不能把坏值当成「立即重试」——
    那正好与限流服务的意图相反。
    """
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return max(0.0, float(text))
    except ValueError:
        pass
    try:
        parsed = parsedate_to_datetime(text)
    except (TypeError, ValueError):
        return None
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    reference = time.time() if now is None else now
    return max(0.0, parsed.timestamp() - reference)


def retry_delay_seconds(attempt: int, retry_after: str | None) -> float:
    """本次重试的等待秒数：优先尊重服务端 ``Retry-After``，否则指数退避 + 抖动。

    抖动不是可选项：一次广播会给几十个订阅同时投递，固定间隔会让它们在同一毫秒一起
    重试，正好把刚触发的限流再踩一遍。
    """
    server_delay = parse_retry_after(retry_after)
    if server_delay is not None:
        return min(server_delay, MAX_HONORED_RETRY_AFTER_SECONDS)
    base = min(RETRY_BASE_DELAY_SECONDS * (2 ** max(0, attempt - 1)), RETRY_MAX_DELAY_SECONDS)
    return base + random.uniform(0, base * 0.5)


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
    return bool(parsed.is_private or parsed.is_link_local)


def is_safe_webpush_endpoint(endpoint: str) -> bool:
    """校验 WebPush 订阅 endpoint（须 https 公网推送服务，防 SSRF）。"""
    try:
        parsed = urlparse(str(endpoint or ""))
    except ValueError:
        return False
    if parsed.scheme != "https":
        return False
    # 注意：这里只看**字面**主机名，挡不住 DNS rebinding（注册时解析到公网、投递时改解析到
    # 内网）。真正投递前还要过一次 `resolve_public_endpoint`。
    return not is_blocked_webpush_host(parsed.hostname or "")


def resolve_public_endpoint(endpoint: str) -> tuple[bool, str]:
    """解析 endpoint 主机名，确认它**只**指向公网地址（防 DNS rebinding），返回 ``(放行, 说明)``。

    为什么注册期的检查不够：`evil.example.com` 可以先解析到公网地址通过注册，投递时再改解析
    到 `127.0.0.1` 或 `169.254.169.254`（云元数据）—— 服务端就替攻击者打了内网。解析失败
    也不放行：把「解析不出来」当成「公网」正是 rebinding 想要的状态。
    """
    try:
        parsed = urlparse(str(endpoint or ""))
        host = parsed.hostname or ""
        port = parsed.port or 443
    except ValueError as error:
        return False, f"endpoint 无法解析：{error}"
    if not host or is_blocked_webpush_host(host):
        return False, "endpoint 主机名不合法"
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as error:
        return False, f"DNS 解析失败：{error}"
    addresses = {str(info[4][0]) for info in infos}
    if not addresses:
        return False, "DNS 未返回任何地址"
    blocked = sorted(address for address in addresses if is_blocked_webpush_host(address))
    if blocked:
        return False, f"解析到内网/回环地址 {blocked}"
    return True, ""


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
    #
    # 负载必须先裁剪：FCM 等推送服务对整包 body 有 4096 字节硬上限，超了直接 413、整条
    # 推送被丢。裁到上限并保留开头（告警最关键的信息在开头），同时明确记录截断。
    if len(payload) > MAX_PUSH_PLAINTEXT_BYTES:
        clipped = payload[:MAX_PUSH_PLAINTEXT_BYTES].decode("utf-8", errors="ignore")
        payload = clipped.encode("utf-8")
        logger.warning(
            "WebPush 负载过长,已截断至 %s 字节（上限 %s）",
            len(payload),
            MAX_PUSH_PLAINTEXT_BYTES,
        )
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
        #: 订阅级退避窗口：endpoint → 可再次尝试的 monotonic 时刻。
        self._endpoint_backoff_until: dict[str, float] = {}
        self._message_handler: MessageHandler | None = None
        self._http = httpx.AsyncClient(timeout=SEND_TIMEOUT)

    # 事件绑定
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

    # 配置
    async def reload(self) -> None:
        cfg = await self._channel_config.get_webpush_config()
        self._enabled = bool(cfg and cfg.enabled)
        if not self._enabled:
            # 未启用是预期状态（只用 App / 邮件），不必每次启动都报 WARN。
            logger.debug("WebPush 通道未启用，已跳过")
            self._vapid = {}
            return
        missing = [
            label
            for label, value in (
                ("VAPID 公钥", cfg.vapid_public_key),
                ("VAPID 私钥", cfg.vapid_private_key),
            )
            if not value
        ]
        if missing:
            logger.warning(
                "WebPush 通道已启用但缺少%s，浏览器推送暂不可用；在「系统设置 → 通知通道」重新生成密钥后生效",
                "、".join(missing),
            )
            self._vapid = {}
            self._enabled = False
            return
        self._vapid = {
            "publicKey": cfg.vapid_public_key,
            "privateKey": cfg.vapid_private_key,
            "subject": cfg.subject or "mailto:webmaster@homeos.local",
        }
        try:
            # 只做 base64 解码是不够的：解码出垃圾字节时服务会「看起来已配置」而实际永远
            # 发不出去（health 报 configured=true，通知照记已投递）。这里把密钥真正用起来
            # 校验一遍，等价 web-push 的 setVapidDetails：公钥必须是合法未压缩 P-256 点，
            # 且与私钥同源（轮换后写错一个字段正是最常见的故障）。
            public_raw = _b64url_decode(cfg.vapid_public_key)
            if len(public_raw) != 65 or public_raw[0] != 0x04:
                raise ValueError("VAPID 公钥不是合法的未压缩 P-256 点")
            ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), public_raw)
            private_key = ec.derive_private_key(
                int.from_bytes(_b64url_decode(cfg.vapid_private_key), "big"),
                ec.SECP256R1(),
            )
            derived = private_key.public_key().public_bytes(
                serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
            )
            if derived != public_raw:
                raise ValueError("VAPID 公私钥不匹配")
        except Exception as exc:
            logger.error("WebPush 通道初始化失败: %s", exc)
            self._vapid = {}
            self._enabled = False
            return
        logger.info("WebPush 通道已热重载")

    def _load_rows(self) -> list[WebPushSubscription]:
        with self._session_factory() as session:
            return list(session.scalars(select(WebPushSubscription).limit(500)))

    async def load_subscriptions_from_db(self) -> None:
        """从 DB 恢复订阅（跳过不安全 endpoint）。"""
        try:
            rows = await asyncio.to_thread(self._load_rows)
            self._subscriptions.clear()
            self._endpoint_backoff_until.clear()
            skipped = 0
            for row in rows:
                endpoint = str(row.endpoint or "")
                if not is_safe_webpush_endpoint(endpoint):
                    skipped += 1
                    logger.debug("跳过不安全的 WebPush 订阅 endpoint: %s", endpoint[:60])
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
            loaded = len(self._subscriptions)
            if loaded:
                note = f"，跳过 {skipped} 条不安全的 endpoint" if skipped else ""
                logger.info("已恢复 %s 条 WebPush 订阅%s", loaded, note)
            else:
                # 「0 条订阅」在通道未启用时是常态，INFO 只会陪跑一行噪音。
                logger.debug("暂无 WebPush 订阅（浏览器授权推送后会自动登记）")
        except Exception as exc:
            logger.warning("加载 WebPush 订阅失败（数据表可能尚未迁移）: %s", exc)

    # 状态 / 订阅管理
    async def get_status(self) -> dict[str, Any]:
        if not self._enabled:
            return {"enabled": False, "configured": False, "subscriptionCount": 0}
        base = {"enabled": True, "subscriptionCount": len(self._subscriptions)}
        try:
            cfg = await self._channel_config.get_webpush_config()
            # configured 必须反映**已验证可用**的 VAPID 状态（self._vapid），而不是原始配置
            # 字符串：否则密钥是垃圾/被轮换掉时，健康检查仍报 configured=true。
            return {
                **base,
                "configured": bool(self._vapid),
                "vapidPublicKey": cfg.vapid_public_key if cfg else None,
            }
        except Exception as exc:
            return {**base, "configured": bool(self._vapid), "error": str(exc)}

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
        except Exception as exc:
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
        self._endpoint_backoff_until.pop(endpoint, None)

        def _delete() -> None:
            with self._session_factory() as session:
                session.execute(delete(WebPushSubscription).where(WebPushSubscription.endpoint == endpoint))
                session.commit()

        try:
            await asyncio.to_thread(_delete)
        except Exception as exc:
            logger.warning("删除 WebPush 订阅失败: %s", exc)
        logger.info("已取消 WebPush 订阅: %s...", endpoint[:40])

    # ChannelProvider
    def on_message(self, handler: MessageHandler) -> None:
        self._message_handler = handler

    async def send_text(
        self, to: str | int, text: str, title: str | None = None
    ) -> dict[str, int]:
        """发送文本推送；``to`` 为空表示广播给全部订阅者。

        返回 ``{"attempted": n, "delivered": m}``：调用方据此判断「是否真的送达」，
        而不再把「没有抛异常」当作投递成功。
        """
        if not self._enabled:
            logger.warning("WebPush 通道未启用")
            return {"attempted": 0, "delivered": 0}

        targets: list[PushSubscription] = []
        if isinstance(to, str) and to.strip():
            sub = self._subscriptions.get(to.strip())
            if sub is None:
                logger.warning("未找到 endpoint: %s", to)
                return {"attempted": 0, "delivered": 0}
            targets.append(sub)
        else:
            targets.extend(self._subscriptions.values())

        if not targets:
            logger.warning("无 WebPush 订阅者")
            return {"attempted": 0, "delivered": 0}
        if not self._vapid:
            logger.warning("WebPush VAPID 未就绪,跳过推送")
            return {"attempted": 0, "delivered": 0}

        payload = json.dumps(
            {
                # 标题由调用方定制（如「地震速报(官方已确认)」），缺省回退品牌名
                "title": str(title or "").strip() or "HomeOS",
                "body": text,
                "icon": "/logo/logo.svg",
            },
            ensure_ascii=False,
        ).encode()
        results = await asyncio.gather(
            *(self._send_one(sub, payload) for sub in targets), return_exceptions=True
        )
        delivered = sum(1 for item in results if item is True)
        return {"attempted": len(targets), "delivered": delivered}

    def _backoff_remaining(self, endpoint: str) -> float:
        """该订阅还剩多少退避时间（秒）；``0`` 表示可以立即尝试。"""
        return max(0.0, self._endpoint_backoff_until.get(endpoint, 0.0) - time.monotonic())

    def _set_endpoint_backoff(self, endpoint: str, seconds: float) -> None:
        """为单条订阅设置退避窗口（钳到 ``MAX_ENDPOINT_BACKOFF_SECONDS``）。"""
        capped = min(max(0.0, seconds), MAX_ENDPOINT_BACKOFF_SECONDS)
        if capped <= 0:
            return
        self._endpoint_backoff_until[endpoint] = time.monotonic() + capped

    async def _send_one(self, sub: PushSubscription, payload: bytes) -> bool:
        """投递单条订阅，返回是否真正送达（2xx）。

        瞬时失败（429 限流 / 5xx 网关错误 / 连接未建立）会**逐订阅**退避重试：推送服务
        常在响应里给出 ``Retry-After``，照它等才有意义。固定 1s/2s 的重试远早于服务端
        允许的时间，三次会全部撞在同一段限流窗口里，这条通知就永远送不出去。
        """
        remaining = self._backoff_remaining(sub.endpoint)
        if remaining > 0:
            logger.warning(
                "WebPush 订阅仍在退避中(%.0fs),跳过本次投递: %s", remaining, sub.endpoint[:60]
            )
            return False
        try:
            # 投递前再解析一次：注册期的字面检查挡不住 DNS rebinding，这里是最后一道门。
            allowed, reason = await asyncio.to_thread(resolve_public_endpoint, sub.endpoint)
            if not allowed:
                logger.error("跳过 WebPush 投递（%s）：%s", reason, sub.endpoint[:80])
                return False
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
        except Exception as exc:
            logger.error("构造 WebPush 请求失败: %s", exc)
            return False

        headers = {
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "TTL": str(DEFAULT_TTL),
            "Authorization": authorization,
        }
        waited = 0.0
        for attempt in range(1, MAX_TRANSIENT_ATTEMPTS + 1):
            try:
                response = await self._http.post(sub.endpoint, content=body, headers=headers)
            except httpx.ConnectError as exc:
                # 连接根本没建立 → 推送一定没送达，重试不会产生重复。
                delay = retry_delay_seconds(attempt, None)
                if attempt >= MAX_TRANSIENT_ATTEMPTS or waited + delay > INLINE_RETRY_BUDGET_SECONDS:
                    logger.error("发送 WebPush 失败(连接失败): %s", exc)
                    self._set_endpoint_backoff(sub.endpoint, RETRY_MAX_DELAY_SECONDS)
                    return False
                logger.warning(
                    "WebPush 连接失败,%.1fs 后重试(第 %s 次): %s", delay, attempt + 1, sub.endpoint[:60]
                )
                await asyncio.sleep(delay)
                waited += delay
                continue
            except Exception as exc:
                # 读取超时等无法判断是否已送达：重试可能造成重复推送，故不重试。
                message = str(exc)
                logger.error("发送 WebPush 失败: %s", message)
                if any(token in message for token in ("410", "404", "expired")):
                    await self.unregister_subscription(sub.endpoint)
                return False

            status = response.status_code
            if status in PERMANENT_SUBSCRIPTION_STATUSES:
                # 永久性拒绝：订阅已失效或与当前 VAPID 公钥不再匹配（密钥轮换后浏览器
                # 会用旧 endpoint 一律 401/403）。必须摘掉，否则每条后续通知都会一直
                # 重投这些死地址，投递循环持续劣化且永远自愈不了。
                logger.info("WebPush 订阅永久失效(%s),自动清理: %s", status, sub.endpoint[:80])
                await self.unregister_subscription(sub.endpoint)
                return False
            if status < 400:
                # 投递成功即清掉退避窗口：服务端已恢复，没必要继续压着这条订阅。
                self._endpoint_backoff_until.pop(sub.endpoint, None)
                return True
            if status not in RETRYABLE_PUSH_STATUSES:
                logger.error("发送 WebPush 失败: HTTP %s %s", status, response.text[:200])
                return False
            server_delay = parse_retry_after(response.headers.get("Retry-After"))
            # 服务端明确要求等待的时间超出本次投递的等待预算：把预算全烧在一次注定仍被拒
            # 的重试上没有意义，不如立刻如实报失败，把时间让给其它通道与后续通知；同时
            # 按服务端要求把这条订阅压进退避窗口，避免上层重试立刻再撞一次限流。
            if server_delay is not None and server_delay > INLINE_RETRY_BUDGET_SECONDS:
                logger.error(
                    "发送 WebPush 失败(HTTP %s,服务端要求 %ss 后重试,超出本次投递预算 %ss): %s",
                    status,
                    int(server_delay),
                    int(INLINE_RETRY_BUDGET_SECONDS),
                    sub.endpoint[:80],
                )
                self._set_endpoint_backoff(sub.endpoint, server_delay)
                return False
            delay = retry_delay_seconds(attempt, response.headers.get("Retry-After"))
            if attempt >= MAX_TRANSIENT_ATTEMPTS or waited + delay > INLINE_RETRY_BUDGET_SECONDS:
                logger.error(
                    "发送 WebPush 失败(已尝试 %s 次,最后 HTTP %s): %s",
                    attempt,
                    status,
                    response.text[:200],
                )
                self._set_endpoint_backoff(
                    sub.endpoint, server_delay if server_delay is not None else RETRY_MAX_DELAY_SECONDS
                )
                return False
            logger.warning(
                "WebPush 瞬时失败(HTTP %s),%.1fs 后重试(第 %s 次): %s",
                status,
                delay,
                attempt + 1,
                sub.endpoint[:60],
            )
            await asyncio.sleep(delay)
            waited += delay
        return False

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
    "INLINE_RETRY_BUDGET_SECONDS",
    "MAX_ENDPOINT_BACKOFF_SECONDS",
    "MAX_TRANSIENT_ATTEMPTS",
    "PERMANENT_SUBSCRIPTION_STATUSES",
    "RETRYABLE_PUSH_STATUSES",
    "PushSubscription",
    "WebPushService",
    "build_vapid_authorization",
    "encrypt_webpush_payload",
    "is_blocked_webpush_host",
    "is_private_ipv4",
    "is_safe_webpush_endpoint",
    "parse_retry_after",
    "resolve_public_endpoint",
    "retry_delay_seconds",
]
