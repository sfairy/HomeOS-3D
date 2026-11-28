"""授权密钥对的生成与加载。

## 为什么写入必须原子

直接 `os.open(O_TRUNC)` 写在目标文件上，中途被杀 / 磁盘写满会留下**半截 PEM**。
下一轮 ``_generate`` 看到 ``st_size > 0`` 就当作「已存在」跳过，于是把残缺字节的
sha256 当成信任锚（``/v2/keys`` 原样下发）—— 服务端签发租约一切正常，客户端验签
全部失败，日志里却只有成功的激活记录，是接近无法排查的一类故障。

因此：同目录临时文件 + ``fsync`` + ``os.replace``；落盘前自校验可解析；读取时再校验
私钥与公钥**确实成对**，不成对就从私钥重建公钥（而不是继续用损坏的那一份）。
"""

from __future__ import annotations

import contextlib
import hashlib
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

logger = logging.getLogger("homeos.store.licensing.keys")


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
    """由公钥**文件字节**派生 keyId（客户端按同一份字节校验指纹）。"""
    return f"hb-{public_key_sha256(public_path)[:16]}"


def _public_pem(private_key) -> bytes:
    return private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def _private_pem(private_key) -> bytes:
    return private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def _atomic_write(path: Path, payload: bytes, mode: int) -> None:
    """同目录临时文件 + fsync + ``os.replace``（见模块说明）。"""
    tmp = path.with_name(f"{path.name}.tmp-{os.getpid()}-{os.urandom(4).hex()}")
    try:
        descriptor = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            with contextlib.suppress(OSError):
                tmp.unlink()


def _pair_consistent(private_path: Path, public_path: Path) -> bool:
    """私钥与公钥文件是否来自同一对密钥（可解析且互相匹配）。"""
    try:
        private_key = serialization.load_pem_private_key(private_path.read_bytes(), password=None)
        public_key = serialization.load_pem_public_key(public_path.read_bytes())
    except (ValueError, TypeError, OSError):
        return False
    try:
        return private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
        ) == public_key.public_bytes(
            encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
        )
    except (ValueError, TypeError):
        return False


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
        if _pair_consistent(paths.private_path, paths.public_path):
            return GeneratedKeyPair(
                paths.private_path,
                paths.public_path,
                public_key_sha256(paths.public_path),
                False,
            )
        # 私钥可读但公钥残缺 / 不匹配（上次写入被打断）：从私钥重建公钥。
        # 绝不把损坏的字节继续当作信任锚 —— 那会让所有客户端验签失败。
        try:
            existing_private = serialization.load_pem_private_key(paths.private_path.read_bytes(), password=None)
        except (ValueError, TypeError, OSError):
            logger.warning("授权私钥不可读，将重新生成一对新密钥：%s", paths.private_path)
        else:
            logger.warning("授权公钥与私钥不匹配（可能是上次写入中断），已从私钥重建公钥")
            _atomic_write(paths.public_path, _public_pem(existing_private), 0o644)
            return GeneratedKeyPair(
                paths.private_path,
                paths.public_path,
                public_key_sha256(paths.public_path),
                False,
            )

    private_pem = _private_pem(private_key)
    public_pem = _public_pem(private_key)
    # 落盘前自校验：写出去的字节必须能被自己的加载路径读回来。
    serialization.load_pem_private_key(private_pem, password=None)
    serialization.load_pem_public_key(public_pem)
    logger.info("生成新的授权密钥对：%s", paths.private_path.name)
    _atomic_write(paths.private_path, private_pem, 0o600)
    _atomic_write(paths.public_path, public_pem, 0o644)
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
