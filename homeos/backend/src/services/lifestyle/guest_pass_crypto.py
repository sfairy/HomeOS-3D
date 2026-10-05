"""访客通行证 AES-256-GCM 加解密（逐字段对齐 ``guest-pass-crypto.util.ts``）。

密钥派生与 Nest 完全一致，保证跨实现可解密同一份密文：
- 配置 ``GUEST_PASS_SECRET`` → ``sha256(secret)``；
- 回退 ``JWT_SECRET`` → ``scryptSync(jwt, 'homeos-guest-pass-v1', 32)``（Node 默认 N=16384/r=8/p=1）。

载荷字段 ``cipher`` / ``iv`` / ``tag`` 均为 base64，与 Nest 落库格式相同。
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ...core.errors import BusinessException, ErrorCode, api_error

#: 与 Node ``scryptSync`` 默认参数保持一致，否则无法解开 Nest 生成的密文
_SCRYPT_N = 16384
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_SALT = b"homeos-guest-pass-v1"

_cached_key: bytes | None = None


def _key_from_guest_pass_secret(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def _key_from_jwt_secret(jwt: str) -> bytes:
    return hashlib.scrypt(
        jwt.encode("utf-8"),
        salt=_SCRYPT_SALT,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=32,
    )


def resolve_primary_key() -> bytes:
    """解析主密钥：专用密钥优先，其次 JWT 派生；均缺失时抛 CONFIG_ERROR。"""
    global _cached_key  # noqa: PLW0603 - 与 Nest 单例缓存语义一致
    if _cached_key is not None:
        return _cached_key
    dedicated = str(os.environ.get("GUEST_PASS_SECRET") or "").strip()
    if dedicated:
        _cached_key = _key_from_guest_pass_secret(dedicated)
        return _cached_key
    jwt_secret = str(os.environ.get("JWT_SECRET") or "").strip()
    if not jwt_secret:
        raise BusinessException(
            ErrorCode.CONFIG_ERROR, str(api_error("GUEST_PASS_CRYPTO_SECRET_MISSING"))
        )
    # 极少数未跑 bootstrap 自动生成的场景：临时用 JWT 派生（新密文仍可解密）
    _cached_key = _key_from_jwt_secret(jwt_secret)
    return _cached_key


def ensure_guest_pass_crypto_key() -> None:
    """预热主密钥。"""
    resolve_primary_key()


def reset_crypto_key_cache_for_tests() -> None:
    """清空密钥缓存（仅测试使用，便于切换环境变量后重新派生）。"""
    global _cached_key  # noqa: PLW0603
    _cached_key = None


def encrypt_guest_pass_code(plain: str) -> dict[str, str]:
    """AES-256-GCM 加密，返回 base64 的 cipher / iv / tag。"""
    iv = secrets.token_bytes(12)
    sealed = AESGCM(resolve_primary_key()).encrypt(iv, plain.encode("utf-8"), None)
    cipher, tag = sealed[:-16], sealed[-16:]
    return {
        "cipher": base64.b64encode(cipher).decode("ascii"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "tag": base64.b64encode(tag).decode("ascii"),
    }


def decrypt_guest_pass_code(payload: dict[str, Any]) -> str:
    """解密；任何失败（密文损坏 / 密钥变更）统一抛 UNKNOWN + 解密失败文案。"""
    try:
        raw = AESGCM(resolve_primary_key()).decrypt(
            base64.b64decode(str(payload.get("iv") or "")),
            base64.b64decode(str(payload.get("cipher") or ""))
            + base64.b64decode(str(payload.get("tag") or "")),
            None,
        )
        return raw.decode("utf-8")
    except Exception as err:  # noqa: BLE001 - 对齐 Nest catch-all 语义
        raise BusinessException(
            ErrorCode.UNKNOWN, str(api_error("GUEST_PASS_CRYPTO_DECRYPT_FAILED"))
        ) from err


__all__ = [
    "decrypt_guest_pass_code",
    "encrypt_guest_pass_code",
    "ensure_guest_pass_crypto_key",
    "reset_crypto_key_cache_for_tests",
    "resolve_primary_key",
]
