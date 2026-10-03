"""授权密钥对的生成与加载。
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey


@dataclass(frozen=True)
class KeyPairPaths:
    private_path: Path
    public_path: Path


@dataclass(frozen=True)
class GeneratedKeyPair:
    private_path: Path
    public_path: Path
    sha256: str
    created: bool


def key_id_from_public(public_path: Path) -> str:
    """由公钥**文件字节**派生 keyId。
    """
    return f"hb-{public_key_sha256(public_path)[:16]}"


def _write_private(path: Path, private_key) -> None:
    payload = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(payload)
    os.chmod(path, 0o600)


def _write_public(path: Path, public_key) -> None:
    payload = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(payload)


def public_key_sha256(path: Path) -> str:
    """公钥 PEM 文件字节的 sha256（十六进制小写），与客户端校验口径一致。"""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _generate(paths: KeyPairPaths, private_key, *, force: bool) -> GeneratedKeyPair:
    paths.public_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if (
        not force
        and paths.private_path.exists()
        and paths.public_path.exists()
        and paths.private_path.stat().st_size > 0
        and paths.public_path.stat().st_size > 0
    ):
        return GeneratedKeyPair(
            paths.private_path,
            paths.public_path,
            public_key_sha256(paths.public_path),
            False,
        )
    _write_private(paths.private_path, private_key)
    _write_public(paths.public_path, private_key.public_key())
    return GeneratedKeyPair(
        paths.private_path,
        paths.public_path,
        public_key_sha256(paths.public_path),
        True,
    )


def generate_ed25519(paths: KeyPairPaths, *, force: bool = False) -> GeneratedKeyPair:
    """租约签名密钥对（Ed25519）。"""
    return _generate(paths, Ed25519PrivateKey.generate(), force=force)


def generate_x25519(paths: KeyPairPaths, *, force: bool = False) -> GeneratedKeyPair:
    """传输加密密钥对（X25519）。"""
    return _generate(paths, X25519PrivateKey.generate(), force=force)


def load_ed25519_private(path: Path) -> Ed25519PrivateKey:
    key = serialization.load_pem_private_key(path.read_bytes(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise TypeError(f"授权签名私钥必须是 Ed25519：{path}")
    return key


def load_x25519_private(path: Path) -> X25519PrivateKey:
    key = serialization.load_pem_private_key(path.read_bytes(), password=None)
    if not isinstance(key, X25519PrivateKey):
        raise TypeError(f"授权传输私钥必须是 X25519：{path}")
    return key
