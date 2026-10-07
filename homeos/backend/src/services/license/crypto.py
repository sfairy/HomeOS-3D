"""授权链路的密码学原语。

``LeaseVerifier``（Ed25519 验签）是离线门禁的信任根：数据库里的状态字段可以被改写，
签名伪造不了。``LicenseTransportCipher``（X25519 + HKDF-SHA256 派生的 AES-256-GCM）
保证激活码、令牌与实例 ID 不以明文过网；``SecretCipher``（Fernet）加密落库的会话令牌、
恢复令牌与激活码。

本模块所有失败都抛 ``LicenseCryptoError``；调用方据此把状态归类为 INVALID /
INSTANCE_CHANGED / INSTANCE_MISMATCH。
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


class LicenseCryptoError(RuntimeError):
    """授权相关的密码学错误，涵盖格式非法、指纹不符、验签失败与解密失败。"""


class LicenseTransportCipher:
    """加密一次授权请求，并解密与之配对的响应。

    握手是无状态的一次性 ECDH：每次 ``encrypt_request`` 都新生成一把临时 X25519 私钥，
    返回的对称密钥必须原样交给 ``decrypt_response``（AAD 绑定了方向、路径与 keyId，
    跨请求复用必然解不开）。

    ``PROTOCOL`` 同时参与 HKDF 的 info 与 AES-GCM 的 AAD，必须与商店侧
    ``homeos-store/backend/src/licensing/crypto.py`` 的 ``PROTOCOL`` 逐字节一致：
    两者不同时 keyId 校验仍会通过，但派生密钥与 AAD 不同，AES-GCM 解密必然失败。
    """
    PROTOCOL = b'homeos-license-transport-v1'

    def __init__(self, public_key_path: Path, key_id: str, expected_sha256: str) -> None:
        """载入并校验授权传输公钥（服务端 X25519 公钥）。

        ``expected_sha256`` 是公钥文件内容的 SHA-256 十六进制指纹，钉死在发布版本里。
        keyId 会被拼进 HKDF 的 info 与 AAD，且必须与授权服务完全一致，因此限制在安全
        字符集与长度内。指纹校验刻意放在解析之前，且用 ``compare_digest`` 常数时间比较。

        异常: LicenseCryptoError —— keyId 非法、公钥读不到、指纹不符，或公钥不是 X25519。
        """
        if not key_id or len(key_id) > 64 or not all(character.isalnum() or character in '-_.' for character in key_id):
            raise LicenseCryptoError('授权传输加密 keyId 格式无效。')
        try:
            key_data = public_key_path.read_bytes()
        except OSError as error:
            raise LicenseCryptoError(f'无法读取授权传输公钥：{public_key_path}') from error
        actual_sha256 = hashlib.sha256(key_data).hexdigest()
        if not hmac.compare_digest(actual_sha256, expected_sha256):
            raise LicenseCryptoError('授权传输公钥指纹与正式发布版本不匹配。')
        try:
            key = serialization.load_pem_public_key(key_data)
        except ValueError as error:
            raise LicenseCryptoError('授权传输公钥格式无效。') from error
        if not isinstance(key, X25519PublicKey):
            raise LicenseCryptoError('授权传输公钥必须是 X25519。')
        self._key = key
        self.key_id = key_id

    @staticmethod
    def _encode(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b'=').decode('ascii')

    @staticmethod
    def _decode(value: str) -> bytes:
        try:
            return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
        except (TypeError, ValueError) as error:
            raise LicenseCryptoError('授权传输响应编码无效。') from error

    def encrypt_request(self, payload: dict[str, Any], path: str) -> tuple[dict[str, str], bytes]:
        """加密一次请求体，返回（信封字段字典，响应解密所需的对称密钥）。

        ``path`` 参与密钥派生与 AAD 绑定；返回的 key 必须原样保留用于解密配对的响应。
        """
        ephemeral = X25519PrivateKey.generate()
        shared = ephemeral.exchange(self._key)
        key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=self.PROTOCOL + b'\x00' + self.key_id.encode('ascii') + b'\x00' + path.encode('ascii')).derive(shared)
        iv = os.urandom(12)
        aad = self.PROTOCOL + b'\x00request\x00' + path.encode('ascii') + b'\x00' + self.key_id.encode('ascii')
        plaintext = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
        ciphertext = AESGCM(key).encrypt(iv, plaintext, aad)
        public_key = ephemeral.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        return ({
            'keyId': self.key_id,
            'ephemeralPublicKey': self._encode(public_key),
            'iv': self._encode(iv),
            'ciphertext': self._encode(ciphertext)}, key)

    def decrypt_response(self, envelope: dict[str, Any], path: str, key: bytes) -> dict[str, Any]:
        """解密与某个请求配对的响应信封。

        ``path`` 必须与加密时一致，``key`` 为 ``encrypt_request`` 返回的对称密钥
        （一个请求一把）。先核对 keyId 再解密，IV 强制 96 位。

        异常: LicenseCryptoError —— keyId 不符、编码非法、IV 长度异常或 GCM 校验失败。
        """
        if envelope.get('keyId') != self.key_id:
            raise LicenseCryptoError('授权传输响应 keyId 不匹配。')
        iv = self._decode(envelope.get('iv', ''))
        ciphertext = self._decode(envelope.get('ciphertext', ''))
        if len(iv) != 12:
            raise LicenseCryptoError('授权传输响应 IV 长度无效。')
        aad = self.PROTOCOL + b'\x00response\x00' + path.encode('ascii') + b'\x00' + self.key_id.encode('ascii')
        try:
            plaintext = AESGCM(key).decrypt(iv, ciphertext, aad)
            payload = json.loads(plaintext)
        except Exception as error:
            raise LicenseCryptoError('授权传输响应无法解密或已被篡改。') from error
        if not isinstance(payload, dict):
            raise LicenseCryptoError('授权传输响应内容无效。')
        return payload


def parse_timestamp(value: str) -> datetime:
    """解析租约里的 ISO-8601 时间戳，统一成 UTC 时区感知对象。

    缺时区信息按 UTC 解释（服务端始终以 UTC 签发）。无法解析时抛 ``LicenseCryptoError``。
    """
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError) as error:
        raise LicenseCryptoError('租约时间格式无效。') from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _decode(value: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
    except (ValueError, TypeError) as error:
        raise LicenseCryptoError('租约编码无效。') from error


class LeaseVerifier:
    """用 Ed25519 公钥校验授权服务签发的签名租约。

    ``trusted_keys``（keyId → 公钥路径/指纹）是白名单：不在其中的 keyId 一律拒绝，
    绝不尝试用未知公钥验签。
    """

    def __init__(self, product: str = 'homeos', *, trusted_keys: Mapping[str, tuple[Path, str | None]]) -> None:
        """配置可信公钥集合，指纹为 None 时只按 keyId 选公钥。

        异常: ValueError —— 可信公钥集合为空（配置错误，启动期就该失败）。
        """
        self.product = product
        self.trusted_keys = dict(trusted_keys)
        if not self.trusted_keys:
            raise ValueError('可信授权公钥集合不能为空。')

    def verify(self, signed_lease: str, instance_id: str) -> dict[str, Any]:
        """校验签名租约并返回其载荷。

        ``signed_lease`` 形如 ``<base64url(payload)>.<base64url(signature)>``；载荷里的
        instanceId 必须与 ``instance_id`` 一致。租约必须带 keyId，公钥必须是 Ed25519，
        且先验签再比对业务字段。

        异常: LicenseCryptoError —— 格式、编码、keyId、指纹、签名、产品或实例任一不符，
        以及缺少必要字段或序号非法。
        """
        try:
            encoded_payload, encoded_signature = signed_lease.split('.', 1)
        except ValueError as error:
            raise LicenseCryptoError('签名租约格式无效。') from error
        payload_bytes = _decode(encoded_payload)
        try:
            payload = json.loads(payload_bytes)
        except (UnicodeError, json.JSONDecodeError) as error:
            raise LicenseCryptoError('租约内容无效。') from error
        key_id = payload.get('keyId')
        if not isinstance(key_id, str) or not key_id:
            raise LicenseCryptoError('租约缺少 keyId（旧版租约），需要重新激活授权。')
        trusted_key = self.trusted_keys.get(key_id)
        if trusted_key is None:
            raise LicenseCryptoError(f'租约使用了不受信任的授权公钥：{key_id}')
        public_key_path, expected_fingerprint = trusted_key
        try:
            key_data = public_key_path.read_bytes()
        except OSError as error:
            raise LicenseCryptoError(f'无法读取授权公钥：{public_key_path}') from error
        if expected_fingerprint:
            actual_sha256 = hashlib.sha256(key_data).hexdigest()
            if not hmac.compare_digest(actual_sha256, expected_fingerprint):
                raise LicenseCryptoError('授权公钥指纹与正式发布版本不匹配。')
        key = serialization.load_pem_public_key(key_data)
        if not isinstance(key, Ed25519PublicKey):
            raise LicenseCryptoError('授权公钥必须是 Ed25519。')
        try:
            key.verify(_decode(encoded_signature), payload_bytes)
        except InvalidSignature as error:
            raise LicenseCryptoError('租约签名无效。') from error
        if payload.get('product') != self.product:
            raise LicenseCryptoError('租约产品标识不匹配。')
        if payload.get('instanceId') != instance_id:
            raise LicenseCryptoError('租约不属于当前实例。')
        required = {'leaseId', 'features', 'issuedAt', 'expiresAt', 'sessionId', 'leaseSequence', 'activationCodeId'}
        if not required.issubset(payload):
            raise LicenseCryptoError('租约缺少必要字段。')
        sequence = payload['leaseSequence']
        if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1:
            raise LicenseCryptoError('租约序号无效。')
        parse_timestamp(payload['issuedAt'])
        parse_timestamp(payload['expiresAt'])
        return payload


class SecretCipher:
    """落库凭证的对称加密（Fernet：AES-128-CBC + HMAC-SHA256 认证）。

    数据库里只存密文，密钥单独存在 ``key_path``（0600 权限），与数据库分离 ——
    备份数据库不会连带泄漏密钥。
    """

    def __init__(self, key_path: Path) -> None:
        self.key_path = key_path

    def _key(self) -> bytes:
        """取本机 Fernet 密钥：目录 0700、文件 O_EXCL + 0600 原子创建。

        异常: LicenseCryptoError —— 密钥文件已存在但内容为空。
        """
        self.key_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if self.key_path.exists():
            value = self.key_path.read_bytes().strip()
            if not value:
                raise LicenseCryptoError('授权凭证密钥为空。')
            return value
        import os

        key = Fernet.generate_key()
        descriptor = os.open(self.key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            output.write(key + b'\n')
        return key

    def encrypt(self, value: str) -> str:
        return Fernet(self._key()).encrypt(value.encode('utf-8')).decode('ascii')

    def decrypt(self, value: str) -> str:
        """解密库里取出的密文。

        异常: LicenseCryptoError —— 密钥不匹配、密文被改动（HMAC 校验失败）或内容损坏。
        """
        try:
            return Fernet(self._key()).decrypt(value.encode('ascii')).decode('utf-8')
        except (InvalidToken, UnicodeError, ValueError) as error:
            raise LicenseCryptoError('无法解密授权凭证。') from error
