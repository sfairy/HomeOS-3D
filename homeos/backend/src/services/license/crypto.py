"""授权链路的密码学原语（对齐 ``modules/license/crypto.ts``）。

- Ed25519 租约验签；
- X25519 + HKDF-SHA256 + AES-256-GCM 加密传输；
- 本地凭证对称加密（AES-256-GCM，密钥文件独立存放且 0600）。

与授权商店侧 ``homeos-store/backend/src/licensing/crypto.py`` 逐字节对齐；所有失败抛
:class:`LicenseCryptoError`，调用方据此归类 INVALID / INSTANCE_MISMATCH 等状态。

威胁模型：防误用与随手拷贝；不承诺防专业破解。
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

#: 传输协议串：必须与商店侧 PROTOCOL 逐字节一致（参与 HKDF info 与 AES-GCM AAD）。
LICENSE_PROTOCOL = "homeos-license-transport-v1"

#: 授权产品标识：租约 product 与激活 payload 都必须等于它。
LICENSE_PRODUCT = "homeos"


class LicenseCryptoError(Exception):
    """授权相关密码学错误。"""


# --------------------------------------------------------------------------- #
# base64url / 规范化 JSON / 时间解析
# --------------------------------------------------------------------------- #
def b64url_encode(value: bytes) -> str:
    """base64url 无填充编码（与 Python ``urlsafe_b64encode().rstrip('=')`` 对齐）。"""
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def b64url_decode(value: Any) -> bytes:
    """base64url 无填充解码。"""
    if not isinstance(value, str) or not value:
        raise LicenseCryptoError("授权编码无效。")
    padded = value + "=" * (-len(value) % 4)
    try:
        return base64.urlsafe_b64decode(padded.encode("ascii"))
    except Exception as exc:  # noqa: BLE001
        raise LicenseCryptoError("授权编码无效。") from exc


def canonical_json(value: Any) -> bytes:
    """规范化 JSON：键递归升序、无空白（等价 ``json.dumps(sort_keys=True, separators=(',', ':'))``）。"""
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise LicenseCryptoError("授权载荷无法序列化。") from exc


def parse_timestamp(value: Any) -> datetime:
    """解析租约里的 ISO-8601 时间戳；缺时区按 UTC 解释。失败抛 :class:`LicenseCryptoError`。"""
    if not isinstance(value, str) or not value:
        raise LicenseCryptoError("租约时间格式无效。")
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise LicenseCryptoError("租约时间格式无效。") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _now() -> datetime:
    return datetime.now(UTC)


def public_key_sha256(path: str | os.PathLike[str]) -> str:
    """公钥文件字节的 sha256（十六进制小写）。"""
    try:
        payload = Path(path).read_bytes()
    except OSError as exc:
        raise LicenseCryptoError(f"无法读取授权公钥：{path}") from exc
    return hashlib.sha256(payload).hexdigest()


def derive_key_id(path: str | os.PathLike[str]) -> str:
    """由公钥文件字节派生 keyId：``hb-<sha256 前 16 位>``。"""
    return f"hb-{public_key_sha256(path)[:16]}"


def _load_public_key(path: str | os.PathLike[str]):
    file_path = Path(path)
    if not file_path.exists():
        raise LicenseCryptoError(f"无法读取授权公钥：{path}")
    try:
        return serialization.load_pem_public_key(file_path.read_bytes())
    except Exception as exc:  # noqa: BLE001
        raise LicenseCryptoError(f"授权公钥格式无效：{path}") from exc


def _constant_time_equals(left: str, right: str) -> bool:
    return secrets.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


# --------------------------------------------------------------------------- #
# LeaseVerifier
# --------------------------------------------------------------------------- #
class LeaseVerifier:
    """用 Ed25519 公钥校验授权商店签发的签名租约。

    ``trusted_keys``（keyId → ``{"path", "sha256"}``）是白名单：不在其中的 keyId 一律拒绝，
    绝不尝试用未知公钥验签。
    """

    def __init__(self, trusted_keys: dict[str, dict[str, Any]], product: str = LICENSE_PRODUCT) -> None:
        if not trusted_keys:
            raise LicenseCryptoError("可信授权公钥集合不能为空。")
        self._keys = trusted_keys
        self._product = product
        self._cache: dict[str, Any] = {}

    def verify(self, signed_lease: str, instance_id: str) -> dict[str, Any]:
        """校验签名租约并返回其载荷。"""
        if not isinstance(signed_lease, str) or not signed_lease:
            raise LicenseCryptoError("签名租约格式无效。")
        separator = signed_lease.find(".")
        if separator < 0:
            raise LicenseCryptoError("签名租约格式无效。")
        payload_bytes = b64url_decode(signed_lease[:separator])
        signature = b64url_decode(signed_lease[separator + 1 :])

        try:
            parsed = json.loads(payload_bytes.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise LicenseCryptoError("租约内容无效。") from exc
        if not isinstance(parsed, dict):
            raise LicenseCryptoError("租约内容无效。")
        payload: dict[str, Any] = parsed

        key_id = payload.get("keyId")
        if not isinstance(key_id, str) or not key_id:
            raise LicenseCryptoError("租约缺少 keyId（旧版租约），需要重新激活授权。")
        trusted = self._keys.get(key_id)
        if trusted is None:
            raise LicenseCryptoError(f"租约使用了不受信任的授权公钥：{key_id}")
        key = self._resolve_key(key_id, trusted)
        if not isinstance(key, Ed25519PublicKey):
            raise LicenseCryptoError("授权公钥必须是 Ed25519。")
        try:
            key.verify(signature, payload_bytes)
        except InvalidSignature as exc:
            raise LicenseCryptoError("租约签名无效。") from exc

        if payload.get("product") != self._product:
            raise LicenseCryptoError("租约产品标识不匹配。")
        if payload.get("instanceId") != instance_id:
            raise LicenseCryptoError("租约不属于当前实例。")
        required = (
            "leaseId",
            "features",
            "issuedAt",
            "expiresAt",
            "sessionId",
            "leaseSequence",
            "activationCodeId",
        )
        if not all(field in payload for field in required):
            raise LicenseCryptoError("租约缺少必要字段。")
        sequence = payload.get("leaseSequence")
        if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 1:
            raise LicenseCryptoError("租约序号无效。")
        parse_timestamp(payload.get("issuedAt"))
        parse_timestamp(payload.get("expiresAt"))
        return payload

    def _resolve_key(self, key_id: str, trusted: dict[str, Any]):
        cached = self._cache.get(key_id)
        if cached is not None:
            return cached
        expected = trusted.get("sha256")
        if expected:
            actual = public_key_sha256(trusted["path"])
            if not _constant_time_equals(actual, str(expected).lower()):
                raise LicenseCryptoError(f"授权公钥指纹与正式发布版本不匹配（keyId={key_id}）。")
        key = _load_public_key(trusted["path"])
        self._cache[key_id] = key
        return key


# --------------------------------------------------------------------------- #
# LicenseTransportCipher
# --------------------------------------------------------------------------- #
class LicenseTransportCipher:
    """加密一次授权请求，并解密与之配对的响应。

    握手为无状态一次性 ECDH：每次 ``encrypt_request`` 都新生成一把临时 X25519 私钥，
    返回的对称密钥必须原样交给 ``decrypt_response``（AAD 绑定了方向、路径与 keyId）。
    """

    def __init__(self, public_key_path: str, key_id: str, expected_sha256: str) -> None:
        if not key_id or len(key_id) > 64 or not _key_id_valid(key_id):
            raise LicenseCryptoError("授权传输加密 keyId 格式无效。")
        try:
            key_bytes = Path(public_key_path).read_bytes()
        except OSError as exc:
            raise LicenseCryptoError(f"无法读取授权公钥：{public_key_path}") from exc
        actual = hashlib.sha256(key_bytes).hexdigest()
        if not _constant_time_equals(actual, str(expected_sha256).lower()):
            raise LicenseCryptoError("授权传输公钥指纹与正式发布版本不匹配。")
        try:
            key = serialization.load_pem_public_key(key_bytes)
        except Exception as exc:  # noqa: BLE001
            raise LicenseCryptoError(f"授权公钥格式无效：{public_key_path}") from exc
        if not isinstance(key, X25519PublicKey):
            raise LicenseCryptoError("授权传输公钥必须是 X25519。")
        self._public_key = key
        self.key_id = key_id

    def _derive(self, shared: bytes, path: str) -> bytes:
        info = b"".join(
            [
                LICENSE_PROTOCOL.encode("ascii"),
                b"\x00",
                self.key_id.encode("ascii"),
                b"\x00",
                path.encode("ascii"),
            ]
        )
        return HKDF(algorithm=hashes.SHA256(), length=32, salt=b"", info=info).derive(shared)

    def encrypt_request(self, payload: dict[str, Any], path: str) -> tuple[dict[str, str], bytes]:
        """加密一次请求体，返回 ``(envelope, key)``。"""
        ephemeral = X25519PrivateKey.generate()
        shared = ephemeral.exchange(self._public_key)
        key = self._derive(shared, path)
        iv = os.urandom(12)
        aad = b"".join(
            [
                LICENSE_PROTOCOL.encode("ascii"),
                b"\x00",
                b"request",
                b"\x00",
                path.encode("ascii"),
                b"\x00",
                self.key_id.encode("ascii"),
            ]
        )
        ciphertext = AESGCM(key).encrypt(iv, canonical_json(payload), aad)
        raw_public = ephemeral.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )
        envelope = {
            "keyId": self.key_id,
            "ephemeralPublicKey": b64url_encode(raw_public),
            "iv": b64url_encode(iv),
            "ciphertext": b64url_encode(ciphertext),
        }
        return envelope, key

    def decrypt_response(self, envelope: Any, path: str, key: bytes) -> dict[str, Any]:
        """解密与某个请求配对的响应信封。"""
        if not isinstance(envelope, dict) or envelope.get("keyId") != self.key_id:
            raise LicenseCryptoError("授权传输响应 keyId 不匹配。")
        iv = b64url_decode(envelope.get("iv"))
        ciphertext = b64url_decode(envelope.get("ciphertext"))
        if len(iv) != 12:
            raise LicenseCryptoError("授权传输响应 IV 长度无效。")
        aad = b"".join(
            [
                LICENSE_PROTOCOL.encode("ascii"),
                b"\x00",
                b"response",
                b"\x00",
                path.encode("ascii"),
                b"\x00",
                self.key_id.encode("ascii"),
            ]
        )
        try:
            plaintext = AESGCM(key).decrypt(iv, ciphertext, aad)
            parsed = json.loads(plaintext.decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            raise LicenseCryptoError("授权传输响应无法解密或已被篡改。") from exc
        if not isinstance(parsed, dict):
            raise LicenseCryptoError("授权传输响应内容无效。")
        return parsed


def _key_id_valid(key_id: str) -> bool:
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-")
    return all(ch in allowed for ch in key_id)


def x25519_public_key_from_raw(raw: bytes):
    """由 32 字节裸 X25519 公钥构造公钥对象（商店响应里的 ephemeralPublicKey 用得上）。"""
    if len(raw) != 32:
        raise LicenseCryptoError("授权传输临时公钥长度无效。")
    return X25519PublicKey.from_public_bytes(raw)


# --------------------------------------------------------------------------- #
# SecretCipher
# --------------------------------------------------------------------------- #
class SecretCipher:
    """落盘凭证的对称加密（AES-256-GCM，密钥文件独立存放且 0600）。"""

    def __init__(self, key_path: str) -> None:
        self._key_path = Path(key_path)

    def _key(self) -> bytes:
        if self._key_path.exists():
            value = self._key_path.read_bytes()
            if len(value) == 0:
                raise LicenseCryptoError("授权凭证密钥为空。")
            return value
        self._key_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        key = os.urandom(32)
        descriptor = os.open(self._key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            os.write(descriptor, key)
        finally:
            os.close(descriptor)
        os.chmod(self._key_path, 0o600)
        return key

    def encrypt(self, value: str) -> str:
        iv = os.urandom(12)
        ciphertext = AESGCM(self._key()).encrypt(iv, value.encode("utf-8"), None)
        return b64url_encode(iv + ciphertext)

    def decrypt(self, value: str) -> str:
        try:
            raw = b64url_decode(value)
            if len(raw) < 12 + 16:
                raise LicenseCryptoError("无法解密授权凭证。")
            plaintext = AESGCM(self._key()).decrypt(raw[:12], raw[12:], None)
            return plaintext.decode("utf-8")
        except LicenseCryptoError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise LicenseCryptoError("无法解密授权凭证。") from exc


__all__ = [
    "LICENSE_PRODUCT",
    "LICENSE_PROTOCOL",
    "LeaseVerifier",
    "LicenseCryptoError",
    "LicenseTransportCipher",
    "SecretCipher",
    "b64url_decode",
    "b64url_encode",
    "canonical_json",
    "derive_key_id",
    "parse_timestamp",
    "public_key_sha256",
    "x25519_public_key_from_raw",
    "_now",
]
