"""授权服务器侧的加密传输与租约签名。
"""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .keys import load_ed25519_private, load_x25519_private

PROTOCOL = b"homeos-license-transport-v1"
PRODUCT = "homeos"

#: 按状态码兜底的错误码。客户端只认结构化 ``code``（``as_body`` 的 ``detail`` 是给人看的
#: 中文文案，改文案不该改变客户端行为），所以每个错误都必须带一个码 —— 缺码时客户端只能
#: 退回按状态码猜，那正是「被解绑」与「被吊销」曾经混成一句话的根因。
DEFAULT_CODES: dict[int, str] = {
    400: "REQUEST_INVALID",
    401: "SESSION_INVALID",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_FAILED",
    429: "RATE_LIMITED",
    500: "SERVER_ERROR",
}

#: 兜底码（状态码不在 ``DEFAULT_CODES`` 里时用）。
FALLBACK_CODE = "REQUEST_FAILED"

#: 「这份授权没了」——客户端见到它就停止自动恢复并清本地授权。客户端的确认吊销集合是
#: ``{REVOKED, LICENSE_REVOKED}``，这里只用前者；不带 revoked 语义的错误绝不能落进这个码。
REVOCATION_CODE = "REVOKED"


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
        code: str | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.revoked = revoked
        self.retry_after = retry_after
        self.code = code

    def structured_code(self) -> str:
        """这个错误最终发给客户端的码：显式指定 > 吊销兜底 > 状态码默认 > 通用兜底。

        ``revoked`` 为真却不给码时兜到 ``REVOKED`` —— 保留历史行为（只声明 revoked 的
        吊销错误仍然按吊销处理），但显式码优先，因为「实例不匹配」「被解绑」这些场景
        都该有自己的码：客户端据此判断是「重新激活」还是「找管理员」。
        """
        if self.code:
            return self.code
        if self.revoked:
            return REVOCATION_CODE
        return DEFAULT_CODES.get(self.status_code, FALLBACK_CODE)

    def as_body(self) -> dict[str, object]:
        """明文错误体：detail 给人看；code 给客户端做结构化判定。

        ``code`` 让客户端不必猜中文文案：``REVOKED`` 是「这份授权没了」，
        ``BINDING_RELEASED`` 是「这台机器不再绑在这份授权上，重新激活即可」，
        ``INSTANCE_MISMATCH`` 是「这个会话属于另一台机器」。它们 revoked 都为真
        （客户端都该立刻停止自动恢复），但下一步动作不同 —— 混成一句「请联系管理员」
        会让只是被解绑的用户白等一个不会来的管理员。

        ``code`` 对**所有**错误都给（不只吊销类）：客户端只按码分派，缺码时它只能退回
        按状态码猜，而 401/403 既可能是会话过期也可能是真吊销，猜错就会误清本地授权。
        """
        body: dict[str, object] = {"detail": self.detail, "code": self.structured_code()}
        if self.revoked:
            body["revoked"] = True
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
        self._private = load_x25519_private(private_key_path)
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
        except Exception as error:
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
        self._private = load_ed25519_private(private_key_path)
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
    """当前一代密钥（传输 + 签名成对），按请求里的**传输** keyId 校验。
    """

    def __init__(self, generation: KeyGeneration) -> None:
        if not generation.transport_key_id:
            raise ValueError("传输密钥的 keyId 不能为空。")
        self._generation = generation

    @property
    def active(self) -> KeyGeneration:
        """新签发用的一代。"""
        return self._generation

    def find(self, transport_key_id: Any) -> KeyGeneration | None:
        if not isinstance(transport_key_id, str):
            return None
        return self._generation if transport_key_id == self._generation.transport_key_id else None
