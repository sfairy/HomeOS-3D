"""授权密钥对的生成与加载。

客户端会对公钥 PEM **文件字节**做 sha256 校验，因此这里必须输出标准
`serialization.Encoding.PEM` 结果，且对外暴露的指纹一律按文件字节计算。
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


#: 上一代密钥的文件名后缀。轮换时把当前那对改名成 ``*<后缀>.pem`` 就地保留，授权服务按请求
#: 里的 keyId 在其中选择（见 ``crypto.KeyRegistry``），于是两边都能用；只保留一代。
PREVIOUS_KEY_SUFFIX = ".previous"


def previous_path(path: Path) -> Path:
    """``license-private.pem`` → ``license-private.previous.pem``（后缀在扩展名前）。"""
    return path.with_name(f"{path.stem}{PREVIOUS_KEY_SUFFIX}{path.suffix}")


def key_id_from_public(public_path: Path) -> str:
    """由公钥**文件字节**派生 keyId。

    不让它是配置字符串：静态 keyId 不随密钥变，重新生成密钥后客户端那张「keyId → 公钥文件
    + 指纹」的表里同名条目会指向**旧指纹**，新密钥被报成「指纹不匹配」。从文件字节派生后
    换密钥 ⇒ keyId 必变，且与客户端校验指纹的口径同源。显式配置仍优先
    （``STORE_LICENSE_KEY_ID`` / ``APP_LICENSE_KEY_ID``），那种情况下轮换要两边同步改。
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
