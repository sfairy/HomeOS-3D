from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from collections.abc import Mapping
from typing import Any
from cryptography.exceptions import InvalidSignature
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


class LicenseCryptoError(RuntimeError):
    pass


class LicenseTransportCipher:
    '''Encrypt one licensing request and decrypt its paired response.'''
    PROTOCOL = b'homeos-license-transport-v1'

    def __init__(self, public_key_path: Path, key_id: str, expected_sha256: str) -> None:
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
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (TypeError, ValueError) as error:
        raise LicenseCryptoError('租约时间格式无效。') from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _decode(value: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
    except (ValueError, TypeError) as error:
        raise LicenseCryptoError('租约编码无效。') from error


class LeaseVerifier:

    def __init__(self, public_key_path: Path | None = None, product: str = 'homeos', expected_sha256: str | None = None, *, trusted_keys: Mapping[str, tuple[Path, str | None]] | None = None, legacy_key_id: str = 'legacy') -> None:
        self.product = product
        self.legacy_key_id = legacy_key_id
        if trusted_keys is not None:
            self.trusted_keys = dict(trusted_keys)
        elif public_key_path is not None:
            self.trusted_keys = {legacy_key_id: (public_key_path, expected_sha256)}
        else:
            raise ValueError('至少需要配置一个可信授权公钥。')
        if not self.trusted_keys:
            raise ValueError('可信授权公钥集合不能为空。')

    def verify(self, signed_lease: str, instance_id: str) -> dict[str, Any]:
        try:
            encoded_payload, encoded_signature = signed_lease.split('.', 1)
        except ValueError as error:
            raise LicenseCryptoError('签名租约格式无效。') from error
        payload_bytes = _decode(encoded_payload)
        try:
            payload = json.loads(payload_bytes)
        except (UnicodeError, json.JSONDecodeError) as error:
            raise LicenseCryptoError('租约内容无效。') from error
        key_id = payload.get('keyId', self.legacy_key_id)
        if not isinstance(key_id, str) or not key_id:
            raise LicenseCryptoError('租约 keyId 无效。')
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

    def __init__(self, key_path: Path) -> None:
        self.key_path = key_path

    def _key(self) -> bytes:
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
        try:
            return Fernet(self._key()).decrypt(value.encode('ascii')).decode('utf-8')
        except (InvalidToken, UnicodeError, ValueError) as error:
            raise LicenseCryptoError('无法解密授权凭证。') from error
