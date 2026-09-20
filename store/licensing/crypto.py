"""授权服务器侧的加密传输与租约签名。

必须与客户端 `backend/license/crypto.py` **逐字节对齐**：

- HKDF info = ``PROTOCOL + 0x00 + keyId + 0x00 + path``（salt=None, SHA-256, 32 字节）
- AES-GCM AAD = ``PROTOCOL + 0x00 + b"request"|b"response" + 0x00 + path + 0x00 + keyId``
- 所有二进制字段使用 **base64url 无填充**
- 租约 = ``b64url(payload_json_bytes) + "." + b64url(ed25519_signature)``
"""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from store.licensing import keys

#: 传输协议标识。**改动它等于把所有已部署客户端踢下线**：
#: 它参与 HKDF 的 info 与 AES-GCM 的 AAD，新旧不一致时连密钥都派不出来，
#: 请求会在解密阶段直接失败、没有降级路径。
#:
#: 品牌改名时这里从 ``ha-bridge-license-transport-v1`` 改成了
#: ``homeos-license-transport-v1``，属于**故意的破坏性变更**（0.5.6）：
#: 服务端只认新标识，老客户端必须先升级再连。发布时必须同步提升 VERSION
#: 并在版本说明里写清升级顺序（先升客户端，再升服务端）。
PROTOCOL = b"homeos-license-transport-v1"
#: 激活时客户端上报的产品标识，服务端严格比对。
PRODUCT = "homeos"


class LicenseServerError(Exception):
    """授权端点错误。``revoked`` 为真时表示这是客户端的「确认吊销」语义。

    ``retry_after`` 只在 429 上有值：它是**从这一刻起还要等多少秒**，由 API 层放进
    ``Retry-After`` 响应头。客户端据此退避而不是按固定间隔重打 —— 心跳本身是分钟级
    的，撞上小时级的限流窗口时若不做退避，整个窗口内的每一次尝试都只会再拿一个 429
    （``SlidingWindowLimiter`` 的取舍见 ``store/limiter.py``）。
    """

    def __init__(
        self,
        detail: str,
        *,
        status_code: int = 400,
        revoked: bool = False,
        retry_after: float | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.revoked = revoked
        self.retry_after = retry_after

    def as_body(self) -> dict[str, object]:
        """明文错误体：detail 给人看；revoked/code 给客户端做结构化吊销判定。"""
        body: dict[str, object] = {"detail": self.detail}
        if self.revoked:
            body["revoked"] = True
            body["code"] = "REVOKED"
        return body


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def b64url_decode(value: str) -> bytes:
    if not isinstance(value, str):
        raise LicenseServerError("授权请求编码无效。", status_code=400)
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except (ValueError, TypeError) as error:
        raise LicenseServerError("授权请求编码无效。", status_code=400) from error


def _canonical(payload: dict[str, Any]) -> bytes:
    return json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


class TransportCipher:
    """服务端静态 X25519 私钥 + 客户端每次请求的临时公钥协商出一次性密钥。"""

    def __init__(self, private_key_path: Path, key_id: str) -> None:
        self._private = keys.load_x25519_private(private_key_path)
        self.key_id = key_id

    def _derive(self, shared: bytes, path: str) -> bytes:
        return HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=PROTOCOL + b"\x00" + self.key_id.encode("ascii") + b"\x00" + path.encode("ascii"),
        ).derive(shared)

    def decrypt_request(self, envelope: Any, path: str) -> tuple[dict[str, Any], bytes]:
        if not isinstance(envelope, dict):
            raise LicenseServerError("授权请求格式无效。", status_code=400)
        if envelope.get("keyId") != self.key_id:
            raise LicenseServerError("授权传输 keyId 不匹配。", status_code=400)
        raw_public = b64url_decode(envelope.get("ephemeralPublicKey", ""))
        if len(raw_public) != 32:
            raise LicenseServerError("授权传输临时公钥长度无效。", status_code=400)
        try:
            peer = X25519PublicKey.from_public_bytes(raw_public)
            shared = self._private.exchange(peer)
        except ValueError as error:
            raise LicenseServerError("授权传输临时公钥无效。", status_code=400) from error
        key = self._derive(shared, path)
        iv = b64url_decode(envelope.get("iv", ""))
        if len(iv) != 12:
            raise LicenseServerError("授权传输 IV 长度无效。", status_code=400)
        ciphertext = b64url_decode(envelope.get("ciphertext", ""))
        aad = (
            PROTOCOL
            + b"\x00request\x00"
            + path.encode("ascii")
            + b"\x00"
            + self.key_id.encode("ascii")
        )
        try:
            plaintext = AESGCM(key).decrypt(iv, ciphertext, aad)
            payload = json.loads(plaintext)
        except Exception as error:  # noqa: BLE001 - 解密失败一律视为非法请求
            raise LicenseServerError("授权请求无法解密或已被篡改。", status_code=400) from error
        if not isinstance(payload, dict):
            raise LicenseServerError("授权请求内容无效。", status_code=400)
        return payload, key

    def encrypt_response(self, payload: dict[str, Any], path: str, key: bytes) -> dict[str, str]:
        iv = os.urandom(12)
        aad = (
            PROTOCOL
            + b"\x00response\x00"
            + path.encode("ascii")
            + b"\x00"
            + self.key_id.encode("ascii")
        )
        ciphertext = AESGCM(key).encrypt(iv, _canonical(payload), aad)
        return {
            "keyId": self.key_id,
            "iv": b64url_encode(iv),
            "ciphertext": b64url_encode(ciphertext),
        }


class LeaseSigner:
    """用 Ed25519 私钥签发租约，公钥交给客户端做指纹校验。"""

    def __init__(self, private_key_path: Path, key_id: str, product: str = PRODUCT) -> None:
        self._private = keys.load_ed25519_private(private_key_path)
        self.key_id = key_id
        self.product = product

    def sign(self, payload: dict[str, Any]) -> str:
        payload_bytes = _canonical(payload)
        signature = self._private.sign(payload_bytes)
        return f"{b64url_encode(payload_bytes)}.{b64url_encode(signature)}"

@dataclass(frozen=True)
class KeyGeneration:
    """一代密钥：一对传输密钥 + 一对签名密钥，两者成对轮换。

    两把密钥的 keyId 是**各自**从公钥派生的，所以这里不假设它们同字符串：
    客户端用自己那份 ``transport`` id 发请求，用租约里的 ``keyId`` 去可信表里
    找验签公钥，两条链各自独立。
    """

    transport: TransportCipher
    signer: LeaseSigner

    @property
    def transport_key_id(self) -> str:
        return self.transport.key_id

    @property
    def lease_key_id(self) -> str:
        return self.signer.key_id


class KeyRegistry:
    """当前一代 + 至多一代上一代，按请求里的**传输** keyId 选择。

    存在的理由是轮换要能「重着来」：

    * 服务端先换新密钥、客户端还是旧的 —— 旧客户端发上来的 ``keyId`` 命中上一代，
      用上一代的传输私钥解开、用上一代的签名密钥签租约，客户端照旧验得过；
    * 客户端先更新、服务端还是旧的 —— 客户端可信表里同时登记新旧两把公钥
      （见 ``backend/config.py``），旧的照样能用。

    没有这张表时这两种状态都会硬失败：报「keyId 不匹配」（传输层）或
    「不受信任的授权公钥」（验签层）—— 两种都很像被攻击，实际只是在轮换。

    选中的那一代**同时决定签名密钥**：不能固定用 active 签。旧客户端的可信表里
    只有旧公钥，用新密钥签出来的租约它一律不认。
    """

    def __init__(self, generations: Sequence[KeyGeneration]) -> None:
        if not generations:
            raise ValueError("KeyRegistry 至少需要一代密钥。")
        table: dict[str, KeyGeneration] = {}
        for generation in generations:
            key_id = generation.transport_key_id
            if not key_id:
                raise ValueError("传输密钥的 keyId 不能为空。")
            if key_id in table:
                raise ValueError(f"密钥环里出现重复的传输 keyId：{key_id}")
            table[key_id] = generation
        self._generations = tuple(generations)
        self._by_transport = table

    @property
    def active(self) -> KeyGeneration:
        """新签发用的一代（列表第一项）。"""
        return self._generations[0]

    @property
    def previous(self) -> KeyGeneration | None:
        """重叠窗口里的上一代；没有上一代时为 ``None``。"""
        return self._generations[1] if len(self._generations) > 1 else None

    def key_ids(self) -> tuple[str, ...]:
        return tuple(generation.transport_key_id for generation in self._generations)

    def find(self, transport_key_id: Any) -> KeyGeneration | None:
        if not isinstance(transport_key_id, str):
            return None
        return self._by_transport.get(transport_key_id)
