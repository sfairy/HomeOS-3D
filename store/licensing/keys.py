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


#: 上一代密钥的文件名后缀。轮换时把当前那对改名成 ``*<后缀>.pem`` 并保留在原地：
#: 授权服务按请求里的 keyId 在其中选择（见 ``store/licensing/crypto.py`` 的
#: ``KeyRegistry``），于是「服务端已换新密钥、客户端还没更新完」这段时间里
#: 两边都能用。只保留一代 —— 再轮换一次就覆盖它，窗口是「一次轮换」。
PREVIOUS_KEY_SUFFIX = ".previous"


def previous_path(path: Path) -> Path:
    """``license-private.pem`` → ``license-private.previous.pem``（后缀在扩展名前）。"""
    return path.with_name(f"{path.stem}{PREVIOUS_KEY_SUFFIX}{path.suffix}")


def key_id_from_public(public_path: Path) -> str:
    """由公钥**文件字节**派生 keyId。

    为什么不让它是个配置字符串：静态 keyId 不会随密钥变 —— 重新生成密钥后，
    服务端仍在用 ``hb-local-2026`` 这个名字签发租约。客户端那张
    「keyId → 公钥文件 + 指纹」的表里，同名的条目会指向**旧指纹**，于是新密钥
    被报成「指纹不匹配」（听起来像被篡改），而轮换也无法在配置上表达成
    「多了一个新身份，旧的还能用一段时间」。

    改成从公钥文件字节派生之后：换密钥 ⇒ keyId 必然改变；同一份公钥在任何地方
    派生出同一个 id（服务端与客户端各自读自己那份镜像即可，不必人工同步字符串）。
    客户端本地校验指纹的口径本来就是 sha256(公钥文件字节)，这里复用同一份素材。

    显式配置仍然优先（``STORE_LICENSE_KEY_ID`` / ``APP_LICENSE_KEY_ID``）：
    老部署与联调脚本靠它固定名字，那种情况下轮换要两边同步改。
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
