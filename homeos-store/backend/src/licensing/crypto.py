"""授权服务器侧的加密传输与租约签名。
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

from src.licensing import keys

#: 传输协议标识。**改动它等于把所有已部署客户端踢下线**：它参与 HKDF 的 info 与 AES-GCM
PROTOCOL = b"homeos-license-transport-v1"
#: 激活时客户端上报的产品标识，服务端严格比对。
PRODUCT = "homeos"


class LicenseServerError(Exception):
    """授权端点错误。``revoked`` 为真时表示这是客户端的「确认吊销」语义。
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
